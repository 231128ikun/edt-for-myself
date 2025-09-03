import { connect } from 'cloudflare:sockets';

// ==================== 配置管理 ====================
class Config {
  constructor(env, url) {
    this.userId = env?.USER_ID || '123456';
    this.uuid = env?.UUID || 'aaa6b096-1165-4bbe-935c-99f4ec902d02';
    this.nodeName = env?.NODE_NAME || 'IKUN-Vless';
    this.bestIPs = this.parseList(env?.BEST_IPS) || [
      'developers.cloudflare.com',
      'ip.sb',
      'www.visa.cn'
    ];
    this.proxyIP = url?.searchParams.get('proxyip') || env?.PROXY_IP || '';

    this.allowPorts = this._parseNumberList(env?.ALLOW_PORTS || '443,8443,2053,2083,2087,2096');
    this.denyPorts = this._parseNumberList(env?.DENY_PORTS || '25,110,143,465,587');
    this.allowHosts = this.parseList(env?.ALLOW_HOSTS);

    this.directTimeout = parseInt(env?.DIRECT_TIMEOUT) || 1500;
    this.proxyTimeout = parseInt(env?.PROXY_TIMEOUT) || 3000;
    this.nat64Timeout = parseInt(env?.NAT64_TIMEOUT) || 5000;
    this.writeTimeout = parseInt(env?.WRITE_TIMEOUT) || 8000;
    this.maxConnections = parseInt(env?.MAX_CONNECTIONS) || 50;
    this.idleTimeout = parseInt(env?.IDLE_TIMEOUT) || 60000; // 新增: 空闲超时 60s

    this.uuidBytes = this._parseUUID(this.uuid);
  }

  _parseUUID(uuid) {
    const hex = uuid.replace(/-/g, '');
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  _parseNumberList(val) {
    if (!val) return null;
    return val.split(/[\n,]+/).map(s => parseInt(s.trim())).filter(n => Number.isFinite(n));
  }

  parseList(val) {
    if (!val) return null;
    if (typeof val === 'string') {
      return val.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    }
    return val;
  }
}

let activeConnections = 0;
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

function isIPv4(host) {
  const parts = host.split('.');
  return parts.length === 4 && parts.every(p => /^\d+$/.test(p) && +p >= 0 && +p <= 255);
}
function isIPv6(host) { return host.includes(':'); }
function ipv4ToNat64(ip) {
  const parts = ip.split('.').map(n => Number(n));
  const hex = parts.map(n => n.toString(16).padStart(2, '0')).join('');
  return `2001:67c:2960:6464::${hex.slice(0, 4)}:${hex.slice(4)}`;
}
function compareUUIDs(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= (a[i] ^ b[i]);
  return diff === 0;
}
function isPrivateIP(ip) {
  if (isIPv4(ip)) {
    const p = ip.split('.').map(n => Number(n));
    return p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31);
  }
  if (isIPv6(ip)) {
    const a = ip.toLowerCase();
    return a === '::1' || a.startsWith('fe80:') || a.startsWith('fc') || a.startsWith('fd');
  }
  return false;
}
function portAllowed(port, config) {
  if (!Number.isFinite(port) || port <= 0 || port > 65535) return false;
  if (config.denyPorts?.includes(port)) return false;
  if (!config.allowPorts || config.allowPorts.length === 0) return true;
  return config.allowPorts.includes(port);
}
function hostAllowed(host, config) {
  if (!host) return false;
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (isPrivateIP(host)) return false;
  if (config.allowHosts?.length > 0) return config.allowHosts.some(allowed => allowed === host || host.endsWith('.' + allowed));
  return true;
}

function parseVlessHeader(buffer) {
  if (!buffer || buffer.length < 18) throw new Error('Invalid VLESS header');
  const uuid = buffer.subarray(1, 17);
  const optLen = buffer[17];
  let idx = 18 + optLen;
  if (buffer.length < idx + 3) throw new Error('Incomplete VLESS header');

  const cmd = buffer[idx++];
  const port = (buffer[idx] << 8) | buffer[idx + 1]; idx += 2;
  const addrType = buffer[idx++];

  let addr;
  if (addrType === 1) {
    addr = `${buffer[idx]}.${buffer[idx + 1]}.${buffer[idx + 2]}.${buffer[idx + 3]}`;
    idx += 4;
  } else if (addrType === 2) {
    const domainLen = buffer[idx++];
    addr = textDecoder.decode(buffer.subarray(idx, idx + domainLen));
    idx += domainLen;
  } else if (addrType === 3) {
    const parts = new Array(8);
    for (let i = 0; i < 8; i++) parts[i] = ((buffer[idx + i * 2] << 8) | buffer[idx + i * 2 + 1]).toString(16);
    addr = parts.join(':');
    idx += 16;
  } else throw new Error(`Invalid address type: ${addrType}`);

  return { uuid, port, address: addr, addressType: addrType, initialData: buffer.subarray(idx) };
}

async function connectWithTimeout(target, timeout) {
  let socket = null;
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Connect timeout (${timeout}ms)`)), timeout));
  try {
    socket = await Promise.race([connect(target), timeoutPromise]);
    if (socket.opened) await socket.opened;
    return socket;
  } catch (err) {
    try { socket?.close(); } catch {}
    throw err;
  }
}

async function fastConnect(hostname, port, config) {
  const errors = [];
  try { return await connectWithTimeout({ hostname, port }, config.directTimeout); } catch (e) { errors.push(`Direct: ${e.message}`); }
  if (config.proxyIP) {
    try {
      const [proxyHost, proxyPortRaw] = config.proxyIP.split(':');
      const proxyPort = proxyPortRaw ? Number(proxyPortRaw) : port;
      return await connectWithTimeout({ hostname: proxyHost, port: proxyPort }, config.proxyTimeout);
    } catch (e) { errors.push(`Proxy: ${e.message}`); }
  }
  if (isIPv4(hostname)) {
    try { return await connectWithTimeout({ hostname: ipv4ToNat64(hostname), port }, config.nat64Timeout); } catch (e) { errors.push(`NAT64: ${e.message}`); }
  }
  throw new Error(`All connection attempts failed: ${errors.join('; ')}`);
}

async function writeWithTimeout(writer, chunk, timeout) {
  return Promise.race([writer.write(chunk), new Promise((_, reject) => setTimeout(() => reject(new Error('Write timeout')), timeout))]);
}

async function streamTransfer(ws, socket, initialData, config) {
  const writer = socket.writable.getWriter();
  let transferActive = true;
  let lastActivity = Date.now();

  const cleanup = () => {
    transferActive = false;
    try { writer.close(); } catch {}
    try { socket?.close(); } catch {}
    try { ws?.close(); } catch {}
    activeConnections = Math.max(0, activeConnections - 1);
  };

  const activityChecker = setInterval(() => {
    if (!transferActive) return clearInterval(activityChecker);
    if (Date.now() - lastActivity > config.idleTimeout) { console.log('Idle timeout, closing connection'); cleanup(); clearInterval(activityChecker); }
  }, 5000);

  try {
    if (ws.readyState === WebSocket.OPEN) ws.send(new Uint8Array([0, 0]));
    if (initialData?.length > 0) await writeWithTimeout(writer, initialData, config.writeTimeout);
    await Promise.allSettled([
      handleWSToSocket(ws, writer, config, () => transferActive, () => { lastActivity = Date.now(); }),
      handleSocketToWS(socket, ws, () => transferActive, () => { lastActivity = Date.now(); })
    ]);
  } catch (err) {
    console.error('Stream transfer error:', err);
  } finally { cleanup(); }
}

async function handleWSToSocket(ws, writer, config, isActive, touch) {
  return new Promise((resolve, reject) => {
    let closed = false;
    const messageHandler = async (evt) => {
      if (!isActive() || closed) return;
      try {
        let chunk;
        const data = evt.data;
        if (typeof data === 'string') chunk = textEncoder.encode(data);
        else if (data instanceof ArrayBuffer) chunk = new Uint8Array(data);
        else if (data instanceof Blob) chunk = new Uint8Array(await data.arrayBuffer());
        else chunk = new Uint8Array(data);
        await writeWithTimeout(writer, chunk, config.writeTimeout);
        touch();
      } catch (err) { cleanup(); reject(err); }
    };
    const closeHandler = () => { cleanup(); resolve(); };
    const errorHandler = (err) => { cleanup(); reject(err); };
    const cleanup = () => {
      if (closed) return; closed = true;
      try { ws.removeEventListener('message', messageHandler); ws.removeEventListener('close', closeHandler); ws.removeEventListener('error', errorHandler); } catch {}
    };
    ws.addEventListener('message', messageHandler);
    ws.addEventListener('close', closeHandler);
    ws.addEventListener('error', errorHandler);
  });
}

async function handleSocketToWS(socket, ws, isActive, touch) {
  const reader = socket.readable.getReader();
  try {
    while (isActive()) {
      const { done, value } = await reader.read();
      if (done) break;
      if (ws.readyState !== WebSocket.OPEN) break;
      ws.send(value);
      touch();
    }
  } catch (err) { console.error('Socket read error:', err); }
  finally { try { reader.releaseLock(); } catch {} }
}

async function handleWebSocket(request, config) {
  if (activeConnections >= config.maxConnections) return new Response('Service temporarily unavailable', { status: 503 });
  if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('Bad Request', { status: 400 });

  const protocolHeader = request.headers.get('sec-websocket-protocol') || '';
  if (!protocolHeader) return new Response('Missing protocol', { status: 400 });

  let protocolData;
  try {
    const base64 = protocolHeader.split(',')[0].trim().replace(/-/g, '+').replace(/_/g, '/');
    protocolData = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  } catch { return new Response('Invalid protocol encoding', { status: 400 }); }

  let vless;
  try { vless = parseVlessHeader(protocolData); } catch (err) { return new Response(`Protocol error: ${err.message}`, { status: 400 }); }

  const { uuid, port, address, initialData } = vless;
  if (!compareUUIDs(uuid, config.uuidBytes)) return new Response('Unauthorized', { status: 403 });
  if (!portAllowed(port, config)) return new Response('Port not allowed', { status: 403 });
  if (!hostAllowed(address, config)) return new Response('Host not allowed', { status: 403 });

  activeConnections++;
  let socket;
  try { socket = await fastConnect(address.replace(/^\[(.*)\]$/, '$1'), port, config); } 
  catch (err) { activeConnections = Math.max(0, activeConnections - 1); return new Response('Connection failed', { status: 502 }); }

  const [client, server] = new WebSocketPair();
  server.accept();
  streamTransfer(server, socket, initialData, config);
  return new Response(null, { status: 101, webSocket: client });
}

function escapeHtml(str) { return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

function generateHTML(config, host) {
  const subLink = `https://${host}/${config.userId}/vless`;
  const nodeLink = `vless://${config.uuid}@${config.bestIPs[0] || host}:443?encryption=none&security=tls&type=ws&host=${host}&sni=${host}&path=%2F%3Fed%3D2560#${encodeURIComponent(config.nodeName)}`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VLESS Config</title></head><body><h1>${escapeHtml(config.nodeName)}</h1><pre>${subLink}</pre><pre>${nodeLink}</pre><p>Active: ${activeConnections}/${config.maxConnections}</p></body></html>`;
}

function generateVlessConfig(host, config) {
  return [...(config.bestIPs || []), host].map(ip => {
    const [addr, port = 443] = ip.split(':');
    return `vless://${config.uuid}@${addr}:${port}?encryption=none&security=tls&type=ws&host=${host}&sni=${host}&path=%2F%3Fed%3D2560#${encodeURIComponent(config.nodeName)}`;
  }).join('\n');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const config = new Config(env, url);
    const host = request.headers.get('Host') || url.host;
    try {
      if ((request.headers.get('Upgrade') || '').toLowerCase() === 'websocket') return await handleWebSocket(request, config);
      if (url.pathname === `/${config.userId}`) return new Response(generateHTML(config, host), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      if (url.pathname === `/${config.userId}/vless`) return new Response(generateVlessConfig(host, config), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      return new Response('Not Found', { status: 404 });
    } catch (err) {
      console.error('Worker error:', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};
