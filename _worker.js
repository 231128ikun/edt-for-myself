import { connect } from 'cloudflare:sockets';

// ==================== 配置管理 ====================
class Config {
  constructor(env, url) {
    // 核心参数
    this.userId = env?.USER_ID || '123456';
    this.uuid = env?.UUID || 'aaa6b096-1165-4bbe-935c-99f4ec902d02';
    this.nodeName = env?.NODE_NAME || 'IKUN-Vless';
    this.bestIPs = this.parseList(env?.BEST_IPS) || [
      'developers.cloudflare.com',
      'ip.sb',
      'www.visa.cn'
    ];
    this.proxyIP = url?.searchParams.get('proxyip') || env?.PROXY_IP || '';
    
    // 安全控制
    this.allowPorts = this._parseNumberList(env?.ALLOW_PORTS || '443,8443,2053,2083,2087,2096');
    this.denyPorts = this._parseNumberList(env?.DENY_PORTS || '25,110,143,465,587');
    this.allowHosts = this.parseList(env?.ALLOW_HOSTS);

    // 性能参数 - 均衡配置
    this.directTimeout = parseInt(env?.DIRECT_TIMEOUT) || 1500;
    this.proxyTimeout = parseInt(env?.PROXY_TIMEOUT) || 3000;
    this.nat64Timeout = parseInt(env?.NAT64_TIMEOUT) || 5000;
    this.writeTimeout = parseInt(env?.WRITE_TIMEOUT) || 8000;
    this.maxConnections = parseInt(env?.MAX_CONNECTIONS) || 50;

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
    return val.split(/[,\n]+/).map(s => parseInt(s.trim())).filter(n => Number.isFinite(n));
  }

  parseList(val) {
    if (!val) return null;
    if (typeof val === 'string') {
      return val.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    }
    return val;
  }
}

// ==================== 连接计数器 ====================
let activeConnections = 0;

// ==================== 辅助函数 ====================
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

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

function isIPv6(host) {
  return host && typeof host === 'string' && host.includes(':');
}

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

// ==================== VLESS 解析 ====================
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

// ==================== 连接管理 ====================
async function connectWithTimeout(target, timeout) {
  let socket = null;
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Connect timeout (${timeout}ms)`)), timeout)
  );

  try {
    socket = await Promise.race([
      connect(target),
      timeoutPromise
    ]);
    if (socket.opened) await socket.opened;
    return socket;
  } catch (err) {
    // 确保失败的连接被清理
    if (socket && typeof socket.close === 'function') {
      try { socket.close(); } catch (e) {}
    }
    throw err;
  }
}

async function fastConnect(hostname, port, config) {
  const errors = [];
  
  // 直连尝试
  try {
    console.log(`Direct connection to ${hostname}:${port}`);
    const socket = await connectWithTimeout({ hostname, port }, config.directTimeout);
    console.log('Direct connection successful');
    return socket;
  } catch (err) {
    errors.push(`Direct: ${err.message}`);
  }

  // 代理连接
  if (config.proxyIP) {
    try {
      const [proxyHost, proxyPortRaw] = config.proxyIP.split(':');
      const proxyPort = proxyPortRaw ? Number(proxyPortRaw) : port;
      console.log(`Proxy connection via ${proxyHost}:${proxyPort}`);
      
      const socket = await connectWithTimeout({ hostname: proxyHost, port: proxyPort }, config.proxyTimeout);
      console.log('Proxy connection successful');
      return socket;
    } catch (err) {
      errors.push(`Proxy: ${err.message}`);
    }
  }

  // NAT64兜底 - 仅IPv4
  if (isIPv4(hostname)) {
    try {
      const nat64Host = ipv4ToNat64(hostname);
      console.log(`NAT64 connection to ${nat64Host}:${port}`);
      
      const socket = await connectWithTimeout({ hostname: nat64Host, port }, config.nat64Timeout);
      console.log('NAT64 connection successful');
      return socket;
    } catch (err) {
      errors.push(`NAT64: ${err.message}`);
    }
  }

  throw new Error(`All connection attempts failed: ${errors.join('; ')}`);
}

// ==================== 数据传输 ====================
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
  
  // 设置传输超时保护
  const transferTimeout = setTimeout(() => {
    transferActive = false;
    cleanup();
  }, 300000); // 5分钟超时

  const cleanup = () => {
    transferActive = false;
    clearTimeout(transferTimeout);
    try { writer.close(); } catch (e) {}
    try { if (socket?.close) socket.close(); } catch (e) {}
    try { if (ws?.close) ws.close(); } catch (e) {}
    activeConnections = Math.max(0, activeConnections - 1);
  };

  try {
    // 发送连接确认
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(new Uint8Array([0, 0]));
    }

    // 发送初始数据
    if (initialData && initialData.length > 0) {
      await writeWithTimeout(writer, initialData, config.writeTimeout);
    }

    // 双向数据传输
    const transfers = [
      handleWSToSocket(ws, writer, config, () => transferActive),
      handleSocketToWS(socket, ws, () => transferActive)
    ];

    await Promise.allSettled(transfers);
  } catch (err) {
    console.error('Stream transfer error:', err);
  } finally {
    cleanup();
  }
}

async function handleWSToSocket(ws, writer, config, isActive) {
  return new Promise((resolve, reject) => {
    let closed = false;

    const messageHandler = async (evt) => {
      if (!isActive() || closed) return;
      try {
        let chunk;
        const data = evt.data;
        
        if (typeof data === 'string') {
          chunk = textEncoder.encode(data);
        } else if (data instanceof ArrayBuffer) {
          chunk = new Uint8Array(data);
        } else if (data instanceof Blob) {
          const ab = await data.arrayBuffer();
          chunk = new Uint8Array(ab);
        } else {
          chunk = new Uint8Array(data);
        }

        await writeWithTimeout(writer, chunk, config.writeTimeout);
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

async function handleSocketToWS(socket, ws, isActive) {
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
    }
  } catch (err) {
    console.error('Socket read error:', err);
  } finally {
    try { reader.releaseLock(); } catch (e) {}
  }
}

// ==================== WebSocket 处理 ====================
async function handleWebSocket(request, config) {
  // 连接数限制
  if (activeConnections >= config.maxConnections) {
    console.log(`Connection limit exceeded: ${activeConnections}/${config.maxConnections}`);
    return new Response('Service temporarily unavailable', { status: 503 });
  }

  const upgradeHeader = request.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('Bad Request', { status: 400 });
  }

  const protocolHeader = request.headers.get('sec-websocket-protocol') || '';
  if (!protocolHeader) return new Response('Missing protocol', { status: 400 });

  const protocols = protocolHeader.split(',').map(s => s.trim()).filter(Boolean);
  if (protocols.length === 0) return new Response('Invalid protocol', { status: 400 });

  let protocolData;
  try {
    const base64 = protocols[0].replace(/-/g, '+').replace(/_/g, '/');
    protocolData = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  } catch {
    return new Response('Invalid protocol encoding', { status: 400 });
  }

  let vless;
  try { 
    vless = parseVlessHeader(protocolData); 
  } catch (err) { 
    return new Response(`Protocol error: ${err.message}`, { status: 400 }); 
  }

  const { uuid, port, address, initialData } = vless;

  // 验证检查
  if (!compareUUIDs(uuid, config.uuidBytes)) {
    return new Response('Unauthorized', { status: 403 });
  }
  if (!portAllowed(port, config)) {
    return new Response('Port not allowed', { status: 403 });
  }
  if (!hostAllowed(address, config)) {
    return new Response('Host not allowed', { status: 403 });
  }

  // 增加活跃连接计数
  activeConnections++;

  // 建立目标连接
  let socket;
  try {
    const targetHost = (address.startsWith('[') && address.endsWith(']')) ? 
      address.slice(1, -1) : address;
    socket = await fastConnect(targetHost, port, config);
  } catch (err) {
    activeConnections = Math.max(0, activeConnections - 1);
    console.error(`Connection to ${address}:${port} failed:`, err);
    return new Response('Connection failed', { status: 502 });
  }

  // 创建WebSocket对
  const [client, server] = new WebSocketPair();
  server.accept();

  // 启动数据传输
  streamTransfer(server, socket, initialData, config).catch(err => {
    console.error('Stream transfer error:', err);
  });

  return new Response(null, { status: 101, webSocket: client });
}

// ==================== 页面生成 ====================
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function generateHTML(config, host) {
  const subLink = `https://${host}/${config.userId}/vless`;
  const nodeLink = `vless://${config.uuid}@${config.bestIPs[0] || host}:443?encryption=none&security=tls&type=ws&host=${host}&sni=${host}&path=%2F%3Fed%3D2560#${encodeURIComponent(config.nodeName)}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>VLESS Config</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, sans-serif;
      background: linear-gradient(135deg, #667eea, #764ba2);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .container {
      background: rgba(255, 255, 255, 0.95);
      border-radius: 16px;
      padding: 32px;
      max-width: 600px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    }
    h1 { text-align: center; color: #333; margin-bottom: 24px; }
    .info-item { 
      background: #f8f9fa; 
      padding: 16px; 
      border-radius: 12px; 
      margin-bottom: 16px;
    }
    .label { font-size: 13px; color: #666; margin-bottom: 6px; }
    .value { font-family: monospace; color: #333; word-break: break-all; }
    .copy-box {
      background: #f8f9fa;
      border: 2px solid #e9ecef;
      border-radius: 12px;
      padding: 16px;
      position: relative;
      margin: 12px 0;
    }
    .copy-text {
      font-family: monospace;
      font-size: 13px;
      word-break: break-all;
      padding-right: 80px;
    }
    .copy-btn {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: #667eea;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
    }
    .stats {
      text-align: center;
      margin-top: 20px;
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 VLESS Config</h1>
    
    <div class="info-item">
      <div class="label">节点名称</div>
      <div class="value">${escapeHtml(config.nodeName)}</div>
    </div>
    
    <div class="info-item">
      <div class="label">订阅链接</div>
      <div class="copy-box">
        <div class="copy-text" id="sub-link">${subLink}</div>
        <button class="copy-btn" onclick="copyText('sub-link', this)">复制</button>
      </div>
    </div>

    <div class="info-item">
      <div class="label">节点链接</div>
      <div class="copy-box">
        <div class="copy-text" id="node-link">${nodeLink}</div>
        <button class="copy-btn" onclick="copyText('node-link', this)">复制</button>
      </div>
    </div>

    <div class="stats">
      活跃连接: ${activeConnections}/${config.maxConnections}
    </div>
  </div>

  <script>
    async function copyText(elementId, button) {
      try {
        const text = document.getElementById(elementId).textContent;
        await navigator.clipboard.writeText(text);
        button.textContent = '✓ 已复制';
        setTimeout(() => button.textContent = '复制', 2000);
      } catch (err) {
        button.textContent = '复制失败';
        setTimeout(() => button.textContent = '复制', 2000);
      }
    }
  </script>
</body>
</html>`;
}

function generateVlessConfig(host, config) {
  return [...(config.bestIPs || []), host]
    .map(ip => {
      const [addr, port = 443] = ip.split(':');
      return `vless://${config.uuid}@${addr}:${port}?encryption=none&security=tls&type=ws&host=${host}&sni=${host}&path=%2F%3Fed%3D2560#${encodeURIComponent(config.nodeName)}`;
    })
    .join('\n');
}

// ==================== 主入口 ====================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const config = new Config(env, url);
    const host = request.headers.get('Host') || url.host;

    try {
      // WebSocket升级请求
      if ((request.headers.get('Upgrade') || '').toLowerCase() === 'websocket') {
        return await handleWebSocket(request, config);
      }

      // HTTP路由
      if (url.pathname === `/${config.userId}`) {
        return new Response(generateHTML(config, host), {
          headers: { 
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=3600'
          }
        });
      }

      if (url.pathname === `/${config.userId}/vless`) {
        return new Response(generateVlessConfig(host, config), {
          headers: { 
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=1800'
          }
        });
      }

      return new Response('Not Found', { status: 404 });

    } catch (err) {
      console.error('Worker error:', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};

