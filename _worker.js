import { connect } from 'cloudflare:sockets';

/*
  Minimal & robust VLESS Worker
  - 支持直连 -> raw proxy -> http CONNECT -> socks5 -> NAT64（按 PROXY_MODE 控制）
  - 对 raw proxy（你贴的那种用法）完全兼容
  - 加入超时、空闲断开、活跃连接限制和资源清理
  - 仅保留必要的 HTTP 路由： /{USER_ID} (JSON summary) 和 /{USER_ID}/vless (plain vless list)
*/

/* ==================== 配置（环境变量） ==================== */
// 这些默认值可通过 env 覆盖（wrangler 或 Worker KV/环境变量）
const USER_ID = Deno?.env?.get?.('USER_ID') || '123456'; // 如果不在 Deno，Cloudflare env 会在 fetch 时注入
// 由于在 Cloudflare Worker fetch(env) 中我们会读取 env，这里只是占位，实际使用下面 fetch 的 env
// （下面 fetch 会使用传入的 env 来构建配置）

/* ==================== Utility helpers (will be used below) ==================== */
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

function b64uToUint8Array(s) {
  // URL-safe base64 to Uint8Array
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b), c => c.charCodeAt(0));
}

function isIPv4(host) {
  if (typeof host !== 'string') return false;
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return false;
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return false;
  }
  return true;
}
function isIPv6(host) { return typeof host === 'string' && host.includes(':'); }
function ipv4ToNat64(ip) {
  const parts = ip.split('.').map(n => Number(n));
  const hex = parts.map(n => n.toString(16).padStart(2, '0')).join('');
  return `2001:67c:2960:6464::${hex.slice(0,4)}:${hex.slice(4)}`;
}

/* ==================== Core: Config class built from env/url ==================== */
class Config {
  constructor(env, url) {
    // user-provided core params (fallbacks match你贴的例子)
    this.userId = env?.USER_ID || '123456';
    this.uuid = env?.UUID || 'aaa6b096-1165-4bbe-935c-99f4ec902d02';
    this.nodeName = env?.NODE_NAME || 'IKUN-Vless';
    this.bestIPs = this.parseList(env?.BEST_IPS) || ['developers.cloudflare.com','ip.sb','www.visa.cn','ikun.glimmer.cf.090227.xyz'];

    // proxy config: can be overridden by ?proxyip=host:port
    this.proxyRaw = url?.searchParams?.get('proxyip') || env?.PROXY_IP || ''; // raw string "host:port"
    this.proxyMode = (env?.PROXY_MODE || 'auto').toLowerCase(); // raw | http | socks5 | auto
    this.proxyAuth = env?.PROXY_AUTH || ''; // socks5 auth if needed "user:pass"

    // timeouts & limits
    this.directTimeout = Number(env?.DIRECT_TIMEOUT) || 1500;
    this.proxyTimeout = Number(env?.PROXY_TIMEOUT) || 3000;
    this.nat64Timeout = Number(env?.NAT64_TIMEOUT) || 5000;
    this.writeTimeout = Number(env?.WRITE_TIMEOUT) || 8000;
    this.idleTimeout = Number(env?.IDLE_TIMEOUT) || 60000;
    this.maxConnections = Number(env?.MAX_CONNECTIONS) || 50;

    // allow/deny lists (kept simple)
    this.allowPorts = this._parseNumberList(env?.ALLOW_PORTS || '443,8443,2053,2083,2087,2096');
    this.denyPorts = this._parseNumberList(env?.DENY_PORTS || '25,110,143,465,587');
    this.allowHosts = this.parseList(env?.ALLOW_HOSTS);

    // cached uuid bytes
    this.uuidBytes = this._parseUUID(this.uuid);
  }

  _parseUUID(uuid) {
    const hex = uuid.replace(/-/g,'');
    const bytes = new Uint8Array(16);
    for (let i=0;i<16;i++) bytes[i] = parseInt(hex.substr(i*2,2),16);
    return bytes;
  }
  _parseNumberList(val) {
    if (!val) return null;
    return val.split(/[\n,]+/).map(s=>parseInt(s.trim())).filter(n=>Number.isFinite(n));
  }
  parseList(val) {
    if (!val) return null;
    if (typeof val === 'string') return val.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
    return val;
  }
}

/* ==================== VLESS header parse (与你贴的 parse 等价) ==================== */
function parseVlessHeader(bufLike) {
  const d = (bufLike instanceof Uint8Array) ? bufLike : new Uint8Array(bufLike);
  if (!d || d.length < 18) throw new Error('Invalid VLESS header');
  // optLen at d[17], header start at 18 + optLen
  const optLen = d[17];
  const start = 18 + optLen;
  if (d.length < start + 3) throw new Error('Incomplete VLESS header');
  const port = (d[start] << 8) | d[start+1];
  const addrType = d[start+2];
  let p = start + 3;
  let host;
  if (addrType === 1) {
    // ipv4
    host = `${d[p++]}.${d[p++]}.${d[p++]}.${d[p++]}`;
  } else if (addrType === 2) {
    const l = d[p++];
    host = textDecoder.decode(d.subarray(p,p+l));
    p += l;
  } else if (addrType === 3) {
    const parts = [];
    for (let i=0;i<8;i++){
      const off = p + i*2;
      parts.push(((d[off]<<8)|d[off+1]).toString(16));
    }
    host = parts.join(':');
    p += 16;
  } else {
    throw new Error('Invalid address type');
  }
  const initialData = d.slice(p);
  return { host, port, initialData };
}

/* ==================== Active connections guard ==================== */
let activeConnections = 0;

/* ==================== connectWithTimeout (wrap cloudflare:sockets.connect) ==================== */
async function connectWithTimeout({ hostname, port }, timeout) {
  let sock = null;
  const t = new Promise((_, rej) => setTimeout(() => rej(new Error(`connect timeout ${timeout}ms`)), timeout));
  try {
    const p = connect({ hostname, port });
    sock = await Promise.race([p, t]);
    if (sock.opened) await sock.opened;
    return sock;
  } catch (err) {
    try { sock?.close(); } catch(e) {}
    throw err;
  }
}

/* ==================== Proxy strategies ==================== */
/* raw proxy: just connect to proxy host:port and treat socket as tunnel (like your snippet) */
async function connectViaRawProxy(proxyHost, proxyPort, timeout) {
  return await connectWithTimeout({ hostname: proxyHost, port: proxyPort }, timeout);
}

/* HTTP CONNECT: send CONNECT and wait for 200 (keeps socket open on success) */
async function connectViaHttpProxy(proxyHost, proxyPort, targetHost, targetPort, timeout) {
  let s;
  try {
    s = await connectWithTimeout({ hostname: proxyHost, port: proxyPort }, timeout);
    const writer = s.writable.getWriter();
    const reader = s.readable.getReader();
    const req = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nProxy-Connection: keep-alive\r\nConnection: keep-alive\r\n\r\n`;
    await Promise.race([ writer.write(textEncoder.encode(req)), new Promise((_,rej)=>setTimeout(()=>rej(new Error('proxy write timeout')), timeout)) ]);
    // read until \r\n\r\n
    let buf = '';
    const deadline = Date.now()+timeout;
    while (Date.now() < deadline) {
      const tleft = Math.max(0, deadline - Date.now());
      const r = await Promise.race([ reader.read(), new Promise((_,rej)=>setTimeout(()=>rej(new Error('proxy read timeout')), tleft)) ]);
      if (r.done) throw new Error('proxy closed');
      buf += textDecoder.decode(r.value);
      if (buf.indexOf('\r\n\r\n') !== -1) break;
    }
    const header = buf.split('\r\n')[0] || '';
    const m = header.match(/^HTTP\/\d+\.\d+\s+(\d+)/i);
    if (!m) throw new Error('invalid proxy response');
    const code = Number(m[1]);
    if (code !== 200) throw new Error(`proxy CONNECT failed ${code}`);
    try { reader.releaseLock(); } catch(e) {}
    try { writer.releaseLock(); } catch(e) {}
    return s;
  } catch (err) {
    try { s?.close(); } catch(e) {}
    throw err;
  }
}

/* SOCKS5: basic CONNECT with optional username/password (supports domain) */
async function connectViaSocks5(proxyHost, proxyPort, targetHost, targetPort, timeout, proxyAuth) {
  let s;
  try {
    s = await connectWithTimeout({ hostname: proxyHost, port: proxyPort }, timeout);
    const writer = s.writable.getWriter();
    const reader = s.readable.getReader();
    const deadline = Date.now() + timeout;

    // 1. greeting
    const methods = proxyAuth ? [0x00, 0x02] : [0x00];
    const greet = new Uint8Array(2 + methods.length);
    greet[0] = 0x05; greet[1] = methods.length;
    for (let i=0;i<methods.length;i++) greet[2+i]=methods[i];
    await Promise.race([ writer.write(greet), new Promise((_,rej)=>setTimeout(()=>rej(new Error('socks5 greet write timeout')), timeout)) ]);

    // read 2 bytes
    async function readExactly(n) {
      let acc = new Uint8Array(0);
      while (acc.length < n) {
        const tleft = Math.max(0, deadline - Date.now());
        if (tleft<=0) throw new Error('socks5 read timeout');
        const r = await Promise.race([ reader.read(), new Promise((_,rej)=>setTimeout(()=>rej(new Error('socks5 read timeout')), tleft)) ]);
        if (r.done) throw new Error('socks5 closed');
        const chunk = r.value;
        const nb = new Uint8Array(acc.length + chunk.length);
        nb.set(acc,0); nb.set(chunk, acc.length); acc = nb;
      }
      return acc;
    }

    const choice = await readExactly(2);
    if (choice[0] !== 0x05) throw new Error('invalid socks5 version');
    const method = choice[1];
    if (method === 0xFF) throw new Error('no acceptable socks5 methods');

    if (method === 0x02) {
      if (!proxyAuth) throw new Error('proxy requires auth but no PROXY_AUTH');
      const [u,pw] = proxyAuth.split(':');
      const ub = textEncoder.encode(u||''); const pb = textEncoder.encode(pw||'');
      const authReq = new Uint8Array(3 + ub.length + pb.length);
      authReq[0]=0x01; authReq[1]=ub.length; authReq.set(ub,2); authReq[2+ub.length]=pb.length; authReq.set(pb,3+ub.length);
      await Promise.race([ writer.write(authReq), new Promise((_,rej)=>setTimeout(()=>rej(new Error('socks5 auth write timeout')), timeout)) ]);
      const authRes = await readExactly(2);
      if (authRes[0] !== 0x01 || authRes[1] !== 0x00) throw new Error('socks5 auth failed');
    }

    // build connect request
    const hostIs4 = isIPv4(targetHost);
    let req;
    if (hostIs4) {
      const parts = targetHost.split('.').map(n=>Number(n));
      req = new Uint8Array(4 + 4 + 2);
      req[0]=0x05; req[1]=0x01; req[2]=0x00; req[3]=0x01;
      for (let i=0;i<4;i++) req[4+i]=parts[i];
      req[8] = (targetPort>>8)&0xff; req[9] = targetPort&0xff;
    } else {
      const hb = textEncoder.encode(targetHost);
      req = new Uint8Array(4 + 1 + hb.length + 2);
      req[0]=0x05; req[1]=0x01; req[2]=0x00; req[3]=0x03;
      req[4]=hb.length; req.set(hb,5);
      const off = 5 + hb.length;
      req[off] = (targetPort>>8)&0xff; req[off+1] = targetPort & 0xff;
    }

    await Promise.race([ writer.write(req), new Promise((_,rej)=>setTimeout(()=>rej(new Error('socks5 connect write timeout')), timeout)) ]);

    // read reply first 4 bytes
    const header = await readExactly(4);
    if (header[0] !== 0x05) throw new Error('invalid socks5 reply version');
    const rep = header[1];
    if (rep !== 0x00) throw new Error(`socks5 proxy connect failed (${rep})`);
    const atyp = header[3];
    let toRead = 0;
    if (atyp === 0x01) toRead = 4 + 2;
    else if (atyp === 0x04) toRead = 16 + 2;
    else if (atyp === 0x03) {
      const lenb = await readExactly(1);
      toRead = lenb[0] + 2;
    } else throw new Error('unknown socks5 atyp');
    await readExactly(toRead); // consume rest
    try { reader.releaseLock(); } catch(e) {}
    try { writer.releaseLock(); } catch(e) {}
    return s;
  } catch (err) {
    try { s?.close(); } catch(e) {}
    throw err;
  }
}

/* ==================== fastConnect 按策略尝试 ==================== */
async function fastConnect(targetHost, targetPort, config) {
  const errs = [];
  // 1) 直连
  try {
    return await connectWithTimeout({ hostname: targetHost, port: targetPort }, config.directTimeout);
  } catch (e) { errs.push(`Direct:${e.message}`); }

  // 2) proxy fallback per config.proxyMode
  if (config.proxyRaw) {
    const [ph, pportRaw] = config.proxyRaw.split(':');
    const pport = pportRaw ? Number(pportRaw) : targetPort; // your original used target port default; keep that behavior
    const tryRaw = async () => {
      return await connectViaRawProxy(ph, pport, config.proxyTimeout);
    };
    const tryHttp = async () => {
      const proxyPort = pportRaw ? Number(pportRaw) : 3128;
      return await connectViaHttpProxy(ph, proxyPort, targetHost, targetPort, config.proxyTimeout);
    };
    const trySocks = async () => {
      const proxyPort = pportRaw ? Number(pportRaw) : 1080;
      return await connectViaSocks5(ph, proxyPort, targetHost, targetPort, config.proxyTimeout, config.proxyAuth);
    };

    const mode = config.proxyMode || 'auto';
    if (mode === 'raw') {
      try { return await tryRaw(); } catch (e) { errs.push(`ProxyRaw:${e.message}`); }
    } else if (mode === 'http') {
      try { return await tryHttp(); } catch (e) { errs.push(`ProxyHttp:${e.message}`); }
    } else if (mode === 'socks5') {
      try { return await trySocks(); } catch (e) { errs.push(`ProxySocks:${e.message}`); }
    } else { // auto: try raw -> http -> socks5
      try {
        return await tryRaw();
      } catch (e1) {
        errs.push(`ProxyRaw:${e1.message}`);
        try {
          return await tryHttp();
        } catch (e2) {
          errs.push(`ProxyHttp:${e2.message}`);
          try {
            return await trySocks();
          } catch (e3) {
            errs.push(`ProxySocks:${e3.message}`);
          }
        }
      }
    }
  }

  // 3) NAT64 fallback for IPv4 targets
  if (isIPv4(targetHost)) {
    try {
      const nat64 = ipv4ToNat64(targetHost);
      return await connectWithTimeout({ hostname: nat64, port: targetPort }, config.nat64Timeout);
    } catch (e) { errs.push(`NAT64:${e.message}`); }
  }

  throw new Error(`All attempts failed: ${errs.join('; ')}`);
}

/* ==================== WS <-> socket 转发（含超时/空闲/释放） ==================== */
async function writeWithTimeout(writer, chunk, timeout) {
  const p = writer.write(chunk);
  const t = new Promise((_, rej) => setTimeout(()=>rej(new Error('write timeout')), timeout));
  return Promise.race([p, t]);
}

async function streamTransfer(ws, socket, initialData, config) {
  const writer = socket.writable.getWriter();
  let active = true;
  const globalTimer = setTimeout(()=>{ active=false; cleanup(); }, 5*60*1000); // 5min global
  let lastActivity = Date.now();
  const idleChecker = setInterval(()=> {
    if (!active) return clearInterval(idleChecker);
    if (Date.now() - lastActivity > config.idleTimeout) { active=false; cleanup(); clearInterval(idleChecker); }
  }, 3000);

  const cleanup = () => {
    active = false;
    clearTimeout(globalTimer);
    try { writer.close(); } catch(e) {}
    try { socket?.close(); } catch(e) {}
    try { ws?.close(); } catch(e) {}
    activeConnections = Math.max(0, activeConnections - 1);
  };

  try {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(new Uint8Array([0,0])); } catch(e) {}
    }
    if (initialData && initialData.length) {
      await writeWithTimeout(writer, initialData, config.writeTimeout);
      lastActivity = Date.now();
    }

    const wsToSock = (async () => {
      return new Promise((resolve, reject) => {
        let closed=false;
        const onMessage = async (evt) => {
          if (!active || closed) return;
          try {
            let chunk;
            if (typeof evt.data === 'string') chunk = textEncoder.encode(evt.data);
            else if (evt.data instanceof ArrayBuffer) chunk = new Uint8Array(evt.data);
            else if (evt.data instanceof Blob) {
              const ab = await evt.data.arrayBuffer(); chunk = new Uint8Array(ab);
            } else chunk = new Uint8Array(evt.data);
            await writeWithTimeout(writer, chunk, config.writeTimeout);
            lastActivity = Date.now();
          } catch (err) {
            cleanup(); reject(err);
          }
        };
        const onClose = ()=>{ if (!closed){ closed=true; cleanup(); resolve(); } };
        const onErr = (e)=>{ if (!closed){ closed=true; cleanup(); reject(e); } };
        ws.addEventListener('message', onMessage);
        ws.addEventListener('close', onClose);
        ws.addEventListener('error', onErr);
      });
    })();

    const sockToWs = (async () => {
      const reader = socket.readable.getReader();
      try {
        while (active) {
          const { done, value } = await reader.read();
          if (done) break;
          if (ws.readyState !== WebSocket.OPEN) break;
          try { ws.send(value); } catch (e) { break; }
          lastActivity = Date.now();
        }
      } catch (err) {
        // ignore, cleanup below
      } finally {
        try { reader.releaseLock(); } catch(e) {}
      }
    })();

    await Promise.allSettled([wsToSock, sockToWs]);
  } catch (err) {
    // log
    console.error('streamTransfer err', err);
  } finally {
    cleanup();
  }
}

/* ==================== HTTP route functions (vless list and optional json) ==================== */
function generateVlessList(host, config) {
  const arr = [...(config.bestIPs||[]), `${host}:443`];
  return arr.map(ip=>{
    const [a,pt=443] = ip.split(':');
    return `vless://${config.uuid}@${a}:${pt}?encryption=none&security=tls&type=ws&host=${host}&sni=${host}&path=%2F%3Fed%3D2560#${encodeURIComponent(config.nodeName)}`;
  }).join('\n');
}

/* ==================== Main fetch handler ==================== */
export default {
  async fetch(request, env) {
    // build config using env & URL
    const url = new URL(request.url);
    const config = new Config(env, url);
    const hostHdr = request.headers.get('Host') || url.host;

    try {
      // WebSocket upgrade (VLESS)
      const upgrade = (request.headers.get('Upgrade')||'').toLowerCase();
      if (upgrade === 'websocket') {
        // sec-websocket-protocol carries base64 VLESS header (urlsafe)
        const prot = request.headers.get('sec-websocket-protocol') || '';
        if (!prot) return new Response('Missing protocol', { status: 400 });
        // decode first protocol token
        const protoToken = prot.split(',')[0].trim();
        let raw;
        try { raw = b64uToUint8Array(protoToken); } catch (e) { return new Response('Invalid protocol encoding', { status: 400 }); }

        // validate uuid
        const uuidFromClient = raw.slice(1,17);
        if (!uuidFromClient.every((b,i)=>b === config.uuidBytes[i])) {
          return new Response('', { status: 403 });
        }

        // parse vless header
        let v;
        try { v = parseVlessHeader(raw); } catch (e) { return new Response('Protocol parse error', { status: 400 }); }
        const targetHost = (v.host.startsWith('[') && v.host.endsWith(']')) ? v.host.slice(1,-1) : v.host;
        const targetPort = v.port;

        // basic host/port checks (whitelists)
        if (!portAllowed(targetPort, config) || !hostAllowed(targetHost, config)) {
          return new Response('Forbidden', { status: 403 });
        }

        // connection count guard
        if (activeConnections >= config.maxConnections) {
          return new Response('Too many connections', { status: 503 });
        }
        activeConnections++;

        // attempt connect using fastConnect (with raw proxy fallback supported)
        let sock;
        try {
          sock = await fastConnect(targetHost, targetPort, config);
        } catch (e) {
          activeConnections = Math.max(0, activeConnections - 1);
          console.error('fastConnect failed', e);
          return new Response('Connection failed', { status: 502 });
        }

        // create WebSocketPair and start piping
        const [client, server] = new WebSocketPair();
        server.accept();

        // start transfer, return client
        streamTransfer(server, sock, v.initialData, config).catch(err => console.error('transfer err', err));
        return new Response(null, { status: 101, webSocket: client });
      }

      // HTTP routes: only keep minimal endpoints
      if (url.pathname === `/${config.userId}`) {
        // return JSON summary (for debug/automation)
        const payload = {
          nodeName: config.nodeName,
          userId: config.userId,
          proxy: config.proxyRaw || null,
          proxyMode: config.proxyMode || 'auto',
          bestIPs: config.bestIPs
        };
        return new Response(JSON.stringify(payload, null, 2), { headers: { 'Content-Type':'application/json; charset=utf-8' } });
      }

      if (url.pathname === `/${config.userId}/vless`) {
        return new Response(generateVlessList(hostHdr, config), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }

      return new Response('', { status: 404 });
    } catch (err) {
      console.error('worker top error', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};

/* ==================== Helper allow/host checks (kept near bottom to avoid forward hoisting) ==================== */
function portAllowed(port, config) {
  if (!Number.isFinite(port) || port <= 0 || port > 65535) return false;
  if (config.denyPorts && config.denyPorts.includes(port)) return false;
  if (!config.allowPorts || config.allowPorts.length === 0) return true;
  return config.allowPorts.includes(port);
}
function hostAllowed(host, config) {
  if (!host) return false;
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1,-1);
  if (isPrivateIP(host)) return false;
  if (config.allowHosts && config.allowHosts.length > 0) {
    return config.allowHosts.some(a => a === host || host.endsWith('.' + a));
  }
  return true;
}
function isPrivateIP(ip) {
  if (isIPv4(ip)) {
    const p = ip.split('.').map(n=>Number(n));
    return p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31);
  }
  if (isIPv6(ip)) {
    const a = ip.toLowerCase();
    return a === '::1' || a.startsWith('fe80:') || a.startsWith('fc') || a.startsWith('fd');
  }
  return false;
}
