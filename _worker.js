import { connect } from 'cloudflare:sockets';

// ==================== 配置管理 ====================
class Config {
  constructor(env, url) {
    // 核心参数（不修改环境变量的默认逻辑）
    this.userId = env?.USER_ID || '123456';
    this.uuid = env?.UUID || 'aaa6b096-1165-4bbe-935c-99f4ec902d02';
    this.nodeName = env?.NODE_NAME || 'IKUN-Vless';
    this.bestIPs = this.parseList(env?.BEST_IPS) || [
      'developers.cloudflare.com',
      'ip.sb',
      'www.visa.cn'
    ];
    // proxyIP 可通过 URL 查询参数覆盖： ?proxyip=host:port
    this.proxyIP = url?.searchParams.get('proxyip') || env?.PROXY_IP || '';

    // 安全控制：允许 / 拒绝端口与主机
    this.allowPorts = this._parseNumberList(env?.ALLOW_PORTS || '443,8443,2053,2083,2087,2096');
    this.denyPorts = this._parseNumberList(env?.DENY_PORTS || '25,110,143,465,587');
    this.allowHosts = this.parseList(env?.ALLOW_HOSTS);

    // 超时与资源限制（可通过 env 覆盖）
    this.directTimeout = parseInt(env?.DIRECT_TIMEOUT) || 1500; // 直连超时 ms
    this.proxyTimeout = parseInt(env?.PROXY_TIMEOUT) || 3000;   // 代理握手超时 ms
    this.nat64Timeout = parseInt(env?.NAT64_TIMEOUT) || 5000;   // nat64 超时 ms
    this.writeTimeout = parseInt(env?.WRITE_TIMEOUT) || 8000;   // 写入超时 ms
    this.maxConnections = parseInt(env?.MAX_CONNECTIONS) || 50; // 并发限制
    this.idleTimeout = parseInt(env?.IDLE_TIMEOUT) || 60000;    // 空闲超时 ms

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

// 全局活跃连接计数（保护 Worker）
let activeConnections = 0;

// 辅助：文本编码器/解码器
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

// ==================== 常用工具函数 ====================
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
function isIPv6(host) { return host && typeof host === 'string' && host.includes(':'); }

function ipv4ToNat64(ip) {
  const parts = ip.split('.').map(n => Number(n));
  const hex = parts.map(n => n.toString(16).padStart(2, '0')).join('');
  return `2001:67c:2960:6464::${hex.slice(0, 4)}:${hex.slice(4)}`;
}

function compareUUIDs(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ^ b[i]);
  return diff === 0;
}

function isPrivateIP(ip) {
  if (isIPv4(ip)) {
    const p = ip.split('.').map(n => Number(n));
    return p[0] === 10 || p[0] === 127 ||
           (p[0] === 169 && p[1] === 254) ||
           (p[0] === 192 && p[1] === 168) ||
           (p[0] === 172 && p[1] >= 16 && p[1] <= 31);
  }
  if (isIPv6(ip)) {
    const a = ip.toLowerCase();
    return a === '::1' || a.startsWith('fe80:') || a.startsWith('fc') || a.startsWith('fd');
  }
  return false;
}

function portAllowed(port, config) {
  if (!Number.isFinite(port) || port <= 0 || port > 65535) return false;
  if (config.denyPorts && config.denyPorts.includes(port)) return false;
  if (!config.allowPorts || config.allowPorts.length === 0) return true;
  return config.allowPorts.includes(port);
}

function hostAllowed(host, config) {
  if (!host) return false;
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (isPrivateIP(host)) return false;
  if (config.allowHosts && config.allowHosts.length > 0) {
    return config.allowHosts.some(allowed =>
      allowed === host || host.endsWith('.' + allowed)
    );
  }
  return true;
}

// ==================== VLESS 解析（来自客户端的初始二进制协议） ====================
function parseVlessHeader(buffer) {
  if (!buffer || buffer.length < 18) throw new Error('Invalid VLESS header');
  const uuid = buffer.subarray(1, 17);
  const optLen = buffer[17];
  let idx = 18 + optLen;
  if (buffer.length < idx + 3) throw new Error('Incomplete VLESS header');

  const cmd = buffer[idx]; idx++;
  const port = (buffer[idx] << 8) | buffer[idx + 1]; idx += 2;
  const addrType = buffer[idx++];

  let addr;
  if (addrType === 1) {
    if (buffer.length < idx + 4) throw new Error('Incomplete IPv4 address');
    addr = `${buffer[idx]}.${buffer[idx + 1]}.${buffer[idx + 2]}.${buffer[idx + 3]}`;
    idx += 4;
  } else if (addrType === 2) {
    const domainLen = buffer[idx++];
    if (buffer.length < idx + domainLen) throw new Error('Incomplete domain address');
    addr = textDecoder.decode(buffer.subarray(idx, idx + domainLen));
    idx += domainLen;
  } else if (addrType === 3) {
    if (buffer.length < idx + 16) throw new Error('Incomplete IPv6 address');
    const parts = new Array(8);
    for (let i = 0; i < 8; i++) {
      const off = idx + i * 2;
      parts[i] = ((buffer[off] << 8) | buffer[off + 1]).toString(16);
    }
    addr = parts.join(':');
    idx += 16;
  } else {
    throw new Error(`Invalid address type: ${addrType}`);
  }

  return { uuid, port, address: addr, addressType: addrType, initialData: buffer.subarray(idx) };
}

// ==================== 连接工具：带超时的 connect ====================
async function connectWithTimeout(target, timeout) {
  let socket = null;
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Connect timeout (${timeout}ms)`)), timeout)
  );

  try {
    socket = await Promise.race([ connect(target), timeoutPromise ]);
    if (socket.opened) await socket.opened;
    return socket;
  } catch (err) {
    if (socket && typeof socket.close === 'function') {
      try { socket.close(); } catch (e) {}
    }
    throw err;
  }
}

// ==================== 代理：HTTP CONNECT 握手实现（必要，修复 proxy 无效问题） ====================
/*
  connectViaHttpProxy(proxyHost, proxyPort, targetHost, targetPort, timeout)
  - 与 proxyHost:proxyPort 建立 TCP，然后发送 HTTP CONNECT targetHost:targetPort
  - 等待代理返回 HTTP/1.1 200 表示隧道已建立
  - 返回已经是隧道态的 socket（可直接用于 TLS 握手或原始透传）
*/
async function connectViaHttpProxy(proxyHost, proxyPort, targetHost, targetPort, timeout) {
  let proxySocket;
  try {
    proxySocket = await connectWithTimeout({ hostname: proxyHost, port: proxyPort }, timeout);

    // writer/reader 用于做 CONNECT 握手
    const writer = proxySocket.writable.getWriter();
    const reader = proxySocket.readable.getReader();

    const connectReq = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nProxy-Connection: keep-alive\r\nConnection: keep-alive\r\n\r\n`;

    // 写入 CONNECT 请求（带超时）
    await Promise.race([
      writer.write(textEncoder.encode(connectReq)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Proxy CONNECT write timeout')), timeout))
    ]);

    // 读取并汇总响应头直到 \r\n\r\n（带超时）
    let headerBuf = '';
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const timeLeft = Math.max(0, deadline - Date.now());
      const readPromise = reader.read();
      const chunkResult = await Promise.race([
        readPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Proxy CONNECT read timeout')), timeLeft))
      ]).catch(err => { throw err; });

      if (chunkResult.done) throw new Error('Proxy closed connection during CONNECT');
      headerBuf += textDecoder.decode(chunkResult.value);
      if (headerBuf.indexOf('\r\n\r\n') !== -1) break;
    }

    const headerEnd = headerBuf.indexOf('\r\n\r\n');
    const headerStr = headerEnd >= 0 ? headerBuf.slice(0, headerEnd) : headerBuf;
    const lines = headerStr.split(/\r\n/);
    const statusLine = lines.shift() || '';
    const statusMatch = statusLine.match(/^HTTP\/\d+\.\d+\s+(\d+)\s*(.*)/i);
    if (!statusMatch) {
      try { reader.releaseLock(); } catch (e) {}
      try { writer.releaseLock(); } catch (e) {}
      throw new Error('Invalid proxy response');
    }
    const statusCode = Number(statusMatch[1]);
    if (statusCode !== 200) {
      try { reader.releaseLock(); } catch (e) {}
      try { writer.releaseLock(); } catch (e) {}
      throw new Error(`Proxy CONNECT failed with status ${statusCode}`);
    }

    // CONNECT 成功，释放锁（保留 socket）
    try { reader.releaseLock(); } catch (e) {}
    try { writer.releaseLock(); } catch (e) {}
    return proxySocket;
  } catch (err) {
    try { proxySocket?.close(); } catch (e) {}
    throw err;
  }
}

// ==================== 快速连接策略：直连 -> proxy CONNECT -> NAT64 兜底 ====================
async function fastConnect(hostname, port, config) {
  const errors = [];

  // 1) 直连优先
  try {
    const socket = await connectWithTimeout({ hostname, port }, config.directTimeout);
    return socket;
  } catch (err) {
    errors.push(`Direct: ${err.message}`);
  }

  // 2) 代理（HTTP CONNECT）
  if (config.proxyIP) {
    try {
      const [proxyHost, proxyPortRaw] = config.proxyIP.split(':');
      const proxyPort = proxyPortRaw ? Number(proxyPortRaw) : 3128; // 默认 3128（常用 HTTP 代理端口）
      const socket = await connectViaHttpProxy(proxyHost, proxyPort, hostname, port, config.proxyTimeout);
      return socket;
    } catch (err) {
      errors.push(`Proxy: ${err.message}`);
    }
  }

  // 3) NAT64 兜底（仅 IPv4 有效）
  if (isIPv4(hostname)) {
    try {
      const nat64Host = ipv4ToNat64(hostname);
      const socket = await connectWithTimeout({ hostname: nat64Host, port }, config.nat64Timeout);
      return socket;
    } catch (err) {
      errors.push(`NAT64: ${err.message}`);
    }
  }

  throw new Error(`All connection attempts failed: ${errors.join('; ')}`);
}

// ==================== 数据传输（WS <-> socket） ====================
async function writeWithTimeout(writer, chunk, timeout) {
  const writePromise = writer.write(chunk);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Write timeout')), timeout)
  );
  return Promise.race([writePromise, timeoutPromise]);
}

async function streamTransfer(ws, socket, initialData, config) {
  const writer = socket.writable.getWriter();
  let transferActive = true;

  // 全局传输超时（兜底）与空闲检测
  const globalTimeout = setTimeout(() => { transferActive = false; cleanup(); }, 300000); // 5 min
  let lastActivity = Date.now();
  const idleChecker = setInterval(() => {
    if (!transferActive) return clearInterval(idleChecker);
    if (Date.now() - lastActivity > config.idleTimeout) {
      transferActive = false;
      cleanup();
      clearInterval(idleChecker);
    }
  }, 5000);

  const cleanup = () => {
    transferActive = false;
    clearTimeout(globalTimeout);
    try { writer.close(); } catch (e) {}
    try { socket?.close(); } catch (e) {}
    try { ws?.close(); } catch (e) {}
    activeConnections = Math.max(0, activeConnections - 1);
  };

  try {
    // 发送初始确认（你的原逻辑）
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(new Uint8Array([0, 0])); } catch (e) {}
    }

    // 发送初始数据（如果有）
    if (initialData && initialData.length > 0) {
      await writeWithTimeout(writer, initialData, config.writeTimeout);
      lastActivity = Date.now();
    }

    // 并行传输
    await Promise.allSettled([
      handleWSToSocket(ws, writer, config, () => transferActive, () => { lastActivity = Date.now(); }),
      handleSocketToWS(socket, ws, () => transferActive, () => { lastActivity = Date.now(); })
    ]);
  } catch (err) {
    console.error('Stream transfer error:', err);
  } finally {
    cleanup();
  }
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
        else if (data instanceof Blob) {
          const ab = await data.arrayBuffer();
          chunk = new Uint8Array(ab);
        } else chunk = new Uint8Array(data);

        await writeWithTimeout(writer, chunk, config.writeTimeout);
        touch();
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    const closeHandler = () => { cleanup(); resolve(); };
    const errorHandler = (err) => { cleanup(); reject(err); };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      try {
        ws.removeEventListener('message', messageHandler);
        ws.removeEventListener('close', closeHandler);
        ws.removeEventListener('error', errorHandler);
      } catch (e) {}
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
      try {
        ws.send(value);
      } catch (err) {
        console.error('Failed to send to WebSocket:', err);
        break;
      }
      touch();
    }
  } catch (err) {
    console.error('Socket read error:', err);
  } finally {
    try { reader.releaseLock(); } catch (e) {}
  }
}

// ==================== WebSocket (VLESS) 处理 ====================
async function handleWebSocket(request, config) {
  // 并发限制
  if (activeConnections >= config.maxConnections) {
    return new Response('Service temporarily unavailable', { status: 503 });
  }

  // 基本 Upgrade 校验
  const upgradeHeader = request.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('Bad Request', { status: 400 });
  }

  // VLESS 使用 sec-websocket-protocol 携带 base64 header
  const protocolHeader = request.headers.get('sec-websocket-protocol') || '';
  if (!protocolHeader) return new Response('Missing protocol', { status: 400 });

  const protocols = protocolHeader.split(',').map(s => s.trim()).filter(Boolean);
  if (protocols.length === 0) return new Response('Invalid protocol', { status: 400 });

  let protocolData;
  try {
    // base64 urlsafe -> base64
    const base64 = protocols[0].replace(/-/g, '+').replace(/_/g, '/');
    protocolData = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  } catch {
    return new Response('Invalid protocol encoding', { status: 400 });
  }

  let vless;
  try { vless = parseVlessHeader(protocolData); } catch (err) {
    return new Response(`Protocol error: ${err.message}`, { status: 400 });
  }

  const { uuid, port, address, initialData } = vless;

  // 验证：UUID、端口与主机白名单
  if (!compareUUIDs(uuid, config.uuidBytes)) return new Response('Unauthorized', { status: 403 });
  if (!portAllowed(port, config)) return new Response('Port not allowed', { status: 403 });
  if (!hostAllowed(address, config)) return new Response('Host not allowed', { status: 403 });

  // 增加活跃计数
  activeConnections++;

  // 建立目标连接（fastConnect 会尝试：直连 -> proxy CONNECT -> NAT64）
  let socket;
  try {
    const targetHost = (address.startsWith('[') && address.endsWith(']')) ? address.slice(1, -1) : address;
    socket = await fastConnect(targetHost, port, config);
  } catch (err) {
    activeConnections = Math.max(0, activeConnections - 1);
    console.error(`Connection to ${address}:${port} failed:`, err);
    return new Response('Connection failed', { status: 502 });
  }

  // 建立 WebSocketPair
  const [client, server] = new WebSocketPair();
  server.accept();

  // 启动数据传输（异步）
  streamTransfer(server, socket, initialData, config).catch(err => console.error('Stream transfer error:', err));

  // 返回 101 给 Cloudflare
  return new Response(null, { status: 101, webSocket: client });
}

// ==================== 仅保留你需要的两条 HTTP 路由 ====================
// GET /{USER_ID}     -> 返回 JSON 节点信息（nodeName, bestIPs, proxyIP, nodeLinks[]）
// GET /{USER_ID}/vless -> 返回纯文本 vless 列表（每行一条）
function generateVlessList(host, config) {
  return [...(config.bestIPs || []), host]
    .map(ip => {
      const [addr, port = 443] = ip.split(':');
      return `vless://${config.uuid}@${addr}:${port}?encryption=none&security=tls&type=ws&host=${host}&sni=${host}&path=%2F%3Fed%3D2560#${encodeURIComponent(config.nodeName)}`;
    }).join('\n');
}

// 主入口
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const config = new Config(env, url);
    const host = request.headers.get('Host') || url.host;

    try {
      // WebSocket 升级（VLESS）
      if ((request.headers.get('Upgrade') || '').toLowerCase() === 'websocket') {
        return await handleWebSocket(request, config);
      }

      // HTTP 路径：只保留 /{userId} 与 /{userId}/vless
      if (url.pathname === `/${config.userId}`) {
        const payload = {
          nodeName: config.nodeName,
          userId: config.userId,
          proxyIP: config.proxyIP || null,
          bestIPs: config.bestIPs,
          vlessSamples: generateVlessList(host, config).split('\n').slice(0, 3) // 限制示例数量，防止过大
        };
        return new Response(JSON.stringify(payload, null, 2), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
        });
      }

      if (url.pathname === `/${config.userId}/vless`) {
        return new Response(generateVlessList(host, config), {
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=180' }
        });
      }

      return new Response('Not Found', { status: 404 });
    } catch (err) {
      console.error('Worker error:', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};
