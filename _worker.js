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
      'www.visa.cn',
      'ikun.glimmer.cf.090227.xyz'
    ];
    
    this.proxyIP = url?.searchParams.get('proxyip') || env?.PROXY_IP || 'sjc.o00o.ooo:443';
    this.enableNAT64 = env?.ENABLE_NAT64 === 'true';
    
    // 预处理UUID为字节数组 - 缓存解析结果
    this.uuidBytes = this._parseUUID(this.uuid);
    
    // 性能调优参数
    this.connectionTimeout = parseInt(env?.CONNECTION_TIMEOUT) || 800; // 连接超时(ms)
    this.writeTimeout = parseInt(env?.WRITE_TIMEOUT) || 200; // 写入超时(ms) 
    this.queueLimit = parseInt(env?.QUEUE_LIMIT) || 20; // 队列最大长度
    this.bufferSize = parseInt(env?.BUFFER_SIZE) || 16384; // 缓冲区大小
    this.enableBatching = env?.ENABLE_BATCHING !== 'true'; // 是否启用批处理
    this.maxConcurrentWrites = parseInt(env?.MAX_CONCURRENT_WRITES) || 3; // 最大并发写入
  }
  
  _parseUUID(uuid) {
    const hex = uuid.replace(/-/g, '');
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }
  
  parseList(val) {
    return typeof val === 'string' ? val.split('\n').filter(Boolean) : val;
  }
}

// ==================== 连接管理====================
async function fastConnect(hostname, port, config) {
  const attempts = [];
  
  // 直连尝试
  attempts.push(() => connect({ hostname, port }));
  
  // NAT64（仅IPv4）- 优化正则表达式
  if (config.enableNAT64 && isIPv4(hostname)) {
    const nat64Host = ipv4ToNat64(hostname);
    attempts.push(() => connect({ 
      hostname: `[2001:67c:2960:6464::${nat64Host}]`, 
      port 
    }));
  }
  
  // 反代
  if (config.proxyIP) {
    const [proxyHost, proxyPort = port] = config.proxyIP.split(':');
    attempts.push(() => connect({ hostname: proxyHost, port: +proxyPort }));
  }
  
  // 串行连接尝试，快速失败
  for (const attempt of attempts) {
    try {
      const socket = await Promise.race([
        attempt(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), config.connectionTimeout))
      ]);
      await socket.opened;
      return socket;
    } catch {
      continue;
    }
  }
  
  throw new Error('Connection failed');
}

// 辅助函数：快速IPv4检测
function isIPv4(hostname) {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

// 辅助函数：IPv4转NAT64
function ipv4ToNat64(ip) {
  const parts = ip.split('.');
  const hex = parts.map(n => (+n).toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,4)}:${hex.slice(4)}`;
}

// ==================== 协议处理（进一步优化）====================
// 预分配缓冲区池
const bufferPool = [];
const POOL_SIZE = 10;

function getBuffer(size) {
  return bufferPool.pop() || new Uint8Array(size);
}

function returnBuffer(buffer) {
  if (bufferPool.length < POOL_SIZE) {
    bufferPool.push(buffer);
  }
}

function parseVlessHeader(buffer) {
  if (buffer.length < 18) throw new Error('Invalid VLESS header');
  
  const uuid = buffer.subarray(1, 17);
  const optLen = buffer[17];
  
  // 跳过选项
  let idx = 18 + optLen;
  if (buffer.length < idx + 3) throw new Error('Incomplete VLESS header');
  
  // 解析命令（跳过，固定为TCP）
  idx++; 
  
  // 解析端口（大端序）
  const port = (buffer[idx] << 8) | buffer[idx + 1];
  idx += 2;
  
  const addrType = buffer[idx++];
  let addr, addrLen;
  
  switch (addrType) {
    case 1: // IPv4
      if (buffer.length < idx + 4) throw new Error('Incomplete IPv4 address');
      // 使用模板字符串优化
      addr = `${buffer[idx]}.${buffer[idx + 1]}.${buffer[idx + 2]}.${buffer[idx + 3]}`;
      addrLen = 4;
      break;
    case 2: // Domain  
      addrLen = buffer[idx++];
      if (buffer.length < idx + addrLen) throw new Error('Incomplete domain address');
      addr = textDecoder.decode(buffer.subarray(idx, idx + addrLen));
      break;
    case 3: // IPv6
      if (buffer.length < idx + 16) throw new Error('Incomplete IPv6 address');
      addrLen = 16;
      // 优化IPv6解析
      const parts = new Array(8);
      for (let i = 0; i < 8; i++) {
        const offset = idx + i * 2;
        parts[i] = ((buffer[offset] << 8) | buffer[offset + 1]).toString(16);
      }
      addr = parts.join(':');
      break;
    default:
      throw new Error(`Invalid address type: ${addrType}`);
  }
  
  return { 
    uuid, 
    port, 
    address: addr, 
    addressType: addrType, 
    initialData: buffer.subarray(idx + addrLen) 
  };
}

// 全局 TextDecoder 实例复用
const textDecoder = new TextDecoder();

// ==================== 数据传输====================
async function streamTransfer(ws, socket, initialData, config) {
  const writer = socket.writable.getWriter();
  
  // 立即响应成功
  ws.send(new Uint8Array([0, 0]));
  
  // 写入初始数据
  if (initialData?.length > 0) {
    await writer.write(initialData);
  }
  
  // 根据配置选择传输策略
  const transfers = config.enableBatching ? 
    [handleWSToSocketBatched(ws, writer, config), handleSocketToWS(socket, ws)] :
    [handleWSToSocketDirect(ws, writer, config), handleSocketToWS(socket, ws)];
  
  try {
    await Promise.race(transfers);
  } finally {
    try { writer.close(); } catch {}
    try { ws.close(); } catch {}
  }
}

// 直接传输模式（最低延迟）
async function handleWSToSocketDirect(ws, writer, config) {
  return new Promise((resolve, reject) => {
    let writePromise = Promise.resolve();
    
    ws.addEventListener('message', ({ data }) => {
      const chunk = new Uint8Array(data);
      writePromise = writePromise.then(async () => {
        try {
          await Promise.race([
            writer.write(chunk),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('write timeout')), config.writeTimeout)
            )
          ]);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    ws.addEventListener('close', () => writePromise.then(resolve));
    ws.addEventListener('error', reject);
  });
}

// 批处理模式（高吞吐量）
async function handleWSToSocketBatched(ws, writer, config) {
  return new Promise((resolve, reject) => {
    const writeQueue = [];
    let isWriting = false;
    let writeCount = 0;
    
    async function processQueue() {
      if (isWriting || writeQueue.length === 0 || writeCount >= config.maxConcurrentWrites) return;
      
      isWriting = true;
      writeCount++;
      
      try {
        // 限制队列长度防止内存溢出
        while (writeQueue.length > 0 && writeQueue.length <= config.queueLimit) {
          const chunks = writeQueue.splice(0, Math.min(3, writeQueue.length));
          
          if (chunks.length === 1) {
            // 单块直接写入
            await writer.write(chunks[0]);
          } else {
            // 多块合并写入
            const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
            const merged = new Uint8Array(Math.min(totalLength, config.bufferSize));
            let offset = 0;
            
            for (const chunk of chunks) {
              const copyLength = Math.min(chunk.length, merged.length - offset);
              merged.set(chunk.subarray(0, copyLength), offset);
              offset += copyLength;
              if (offset >= merged.length) break;
            }
            
            await writer.write(merged.subarray(0, offset));
          }
        }
      } catch (error) {
        reject(error);
        return;
      } finally {
        isWriting = false;
        writeCount--;
      }
      
      // 继续处理队列
      if (writeQueue.length > 0) {
        setTimeout(processQueue, 0);
      }
    }
    
    ws.addEventListener('message', ({ data }) => {
      const chunk = new Uint8Array(data);
      
      // 队列溢出保护
      if (writeQueue.length >= config.queueLimit) {
        writeQueue.shift(); // 丢弃最旧的数据
      }
      
      writeQueue.push(chunk);
      processQueue();
    });
    
    ws.addEventListener('close', resolve);
    ws.addEventListener('error', reject);
  });
}

// Socket到WS的传输（背压控制）
async function handleSocketToWS(socket, ws) {
  const reader = socket.readable.getReader();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // 检查WebSocket状态
      if (ws.readyState !== WebSocket.OPEN) break;
      
      ws.send(value);
    }
  } finally {
    reader.releaseLock();
  }
}

// ==================== WebSocket处理====================
async function handleWebSocket(request, config) {
  const protocol = request.headers.get('sec-websocket-protocol');
  if (!protocol) return new Response('Bad Request', { status: 400 });
  
  let protocolData;
  try {
    // Base64解码 
    const base64 = protocol.replace(/-/g, '+').replace(/_/g, '/');
    protocolData = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  } catch {
    return new Response('Invalid protocol', { status: 400 });
  }
  
  // 解析VLESS协议
  let vlessData;
  try {
    vlessData = parseVlessHeader(protocolData);
  } catch (error) {
    return new Response(`Protocol error: ${error.message}`, { status: 400 });
  }
  
  const { uuid, port, address, addressType, initialData } = vlessData;
  
  // UUID验证 
  if (!compareUUIDs(uuid, config.uuidBytes)) {
    return new Response('Unauthorized', { status: 403 });
  }
  
  // 建立目标连接
  let socket;
  try {
    socket = await fastConnect(
      addressType === 3 ? `[${address}]` : address,
      port,
      config
    );
  } catch (error) {
    return new Response(`Connection failed: ${error.message}`, { status: 502 });
  }
  
  // 创建WebSocket隧道
  const [client, server] = new WebSocketPair();
  server.accept();
  
  // 启动数据传输（传入配置）
  streamTransfer(server, socket, initialData, config).catch(console.error);
  
  return new Response(null, { 
    status: 101, 
    webSocket: client 
  });
}

// 优化UUID比较
function compareUUIDs(uuid1, uuid2) {
  if (uuid1.length !== uuid2.length) return false;
  for (let i = 0; i < uuid1.length; i++) {
    if (uuid1[i] !== uuid2[i]) return false;
  }
  return true;
}

// ==================== 页面生成====================
function generateHTML(config, host) {
  // 预编译模板以减少运行时字符串操作
  const template = getHTMLTemplate();
  return template
    .replace('{{NODE_NAME}}', escapeHtml(config.nodeName))
    .replace('{{USER_ID}}', escapeHtml(config.userId))
    .replace('{{PROXY_IP}}', escapeHtml(config.proxyIP))
    .replace('{{HOST}}', escapeHtml(host))
    .replace('{{SUB_LINK}}', `https://${escapeHtml(host)}/${escapeHtml(config.userId)}/vless`)
    .replace('{{NODE_LINK}}', `vless://${escapeHtml(config.uuid)}@${escapeHtml(config.bestIPs[0] || host)}:443?encryption=none&security=tls&type=ws&host=${escapeHtml(host)}&sni=${escapeHtml(host)}&path=%2F%3Fed%3D2560#${escapeHtml(config.nodeName)}`);
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => 
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// 缓存HTML模板
function getHTMLTemplate() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>VLESS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: system-ui; 
      background: linear-gradient(135deg, #667eea, #764ba2); 
      min-height: 100vh; 
      display: flex; 
      justify-content: center; 
      align-items: center; 
      padding: 20px; 
    }
    .container { 
      background: rgba(255, 255, 255, 0.95); 
      border-radius: 20px; 
      padding: 30px; 
      max-width: 500px; 
      width: 100%; 
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3); 
    }
    h1 { text-align: center; color: #333; margin-bottom: 20px; }
    .info { display: grid; gap: 12px; margin-bottom: 20px; }
    .item { background: #f8f9fa; padding: 12px; border-radius: 8px; }
    .label { font-size: 12px; color: #666; margin-bottom: 4px; }
    .value { font-family: monospace; color: #333; word-break: break-all; font-size: 14px; }
    .box { 
      background: #f8f9fa; 
      border: 2px solid #e9ecef; 
      border-radius: 8px; 
      padding: 12px; 
      position: relative; 
      margin-bottom: 12px; 
    }
    .text { 
      font-family: monospace; 
      word-break: break-all; 
      padding-right: 70px; 
      font-size: 13px; 
      line-height: 1.5; 
    }
    .btn { 
      position: absolute; 
      right: 8px; 
      top: 50%; 
      transform: translateY(-50%); 
      background: #667eea; 
      color: white; 
      border: none; 
      padding: 6px 12px; 
      border-radius: 6px; 
      cursor: pointer; 
      font-size: 12px; 
    }
    .btn:hover { background: #5a6fd8; }
    .btn.ok { background: #28a745; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 VLESS</h1>
    <div class="info">
      <div class="item">
        <div class="label">节点名称</div>
        <div class="value">{{NODE_NAME}}</div>
      </div>
      <div class="item">
        <div class="label">用户ID</div>
        <div class="value">{{USER_ID}}</div>
      </div>
      <div class="item">
        <div class="label">代理IP</div>
        <div class="value">{{PROXY_IP}}</div>
      </div>
    </div>
    <h3>订阅链接</h3>
    <div class="box">
      <div class="text" id="s">{{SUB_LINK}}</div>
      <button class="btn" onclick="copyText('s', this)">复制</button>
    </div>
    <h3>节点链接</h3>
    <div class="box">
      <div class="text" id="n">{{NODE_LINK}}</div>
      <button class="btn" onclick="copyText('n', this)">复制</button>
    </div>
  </div>
  <script>
    function copyText(id, btn) {
      navigator.clipboard.writeText(document.getElementById(id).textContent).then(() => {
        const originalText = btn.textContent;
        btn.textContent = '✓';
        btn.classList.add('ok');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('ok');
        }, 1000);
      });
    }
  </script>
</body>
</html>`;
}

function generateVlessConfig(host, config) {
  return [...config.bestIPs, `${host}:443`]
    .map(ip => {
      const [addr, port = 443] = ip.split(':');
      return `vless://${config.uuid}@${addr}:${port}?encryption=none&security=tls&type=ws&host=${host}&sni=${host}&path=%2F%3Fed%3D2560#${config.nodeName}`;
    })
    .join('\n');
}

// ==================== 主入口 ====================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const config = new Config(env, url);
    const host = request.headers.get('Host');
    
    try {
      // WebSocket请求
      if (request.headers.get('Upgrade') === 'websocket') {
        return await handleWebSocket(request, config);
      }
      
      // 页面请求
      switch (url.pathname) {
        case `/${config.userId}`:
          return new Response(generateHTML(config, host), {
            headers: { 
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'public, max-age=3600' // 添加缓存
            }
          });
          
        case `/${config.userId}/vless`:
          return new Response(generateVlessConfig(host, config), {
            headers: { 
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': 'public, max-age=1800' // 添加缓存
            }
          });
          
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('Error:', error);
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
};
