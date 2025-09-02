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
    
    // 预处理UUID为字节数组
    this.uuidBytes = new Uint8Array(
      this.uuid.replace(/-/g, '').match(/.{2}/g).map(x => parseInt(x, 16))
    );
  }
  
  parseList(val) {
    return typeof val === 'string' ? val.split('\n').filter(Boolean) : val;
  }
}

// ==================== 连接管理 ====================
async function fastConnect(hostname, port, config) {
  const attempts = [];
  
  // 直连尝试
  attempts.push(() => connect({ hostname, port }));
  
  // NAT64（仅IPv4）
  if (config.enableNAT64 && /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    const nat64Host = hostname.split('.')
      .map(n => (+n).toString(16).padStart(2, '0'))
      .join('');
    attempts.push(() => connect({ 
      hostname: `[2001:67c:2960:6464::${nat64Host.slice(0,4)}:${nat64Host.slice(4)}]`, 
      port 
    }));
  }
  
  // 反代
  if (config.proxyIP) {
    const [proxyHost, proxyPort = port] = config.proxyIP.split(':');
    attempts.push(() => connect({ hostname: proxyHost, port: +proxyPort }));
  }
  
  // 快速失败，快速重试
  for (const attempt of attempts) {
    try {
      const socket = await Promise.race([
        attempt(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]);
      await socket.opened;
      return socket;
    } catch {
      continue;
    }
  }
  
  throw new Error('Connection failed');
}

// ==================== 协议处理 ====================
function parseVlessHeader(buffer) {
  const view = new DataView(buffer.buffer);
  const uuid = buffer.slice(1, 17);
  const optLen = buffer[17];
  const portIdx = 18 + optLen + 1;
  const port = view.getUint16(portIdx);
  const addrType = buffer[portIdx + 2];
  let addr, addrLen, addrIdx = portIdx + 3;
  
  switch (addrType) {
    case 1: // IPv4
      addr = buffer.slice(addrIdx, addrIdx + 4).join('.');
      addrLen = 4;
      break;
    case 2: // Domain
      addrLen = buffer[addrIdx++];
      addr = new TextDecoder().decode(buffer.slice(addrIdx, addrIdx + addrLen));
      break;
    case 3: // IPv6
      addrLen = 16;
      const parts = [];
      for (let i = 0; i < 8; i++) {
        parts.push(view.getUint16(addrIdx + i * 2).toString(16));
      }
      addr = parts.join(':');
      break;
    default:
      throw new Error('Invalid address type');
  }
  
  return { uuid, port, address: addr, addressType: addrType, initialData: buffer.slice(addrIdx + addrLen) };
}

// ==================== 数据传输 ====================
async function streamTransfer(ws, socket, initialData) {
  const writer = socket.writable.getWriter();
  
  // 立即响应成功
  ws.send(new Uint8Array([0, 0]));
  
  // 写入初始数据
  if (initialData?.length > 0) {
    await writer.write(initialData);
  }
  
  // 并行双向传输
  await Promise.allSettled([
    // WS -> Socket
    (async () => {
      const queue = [];
      let processing = false;
      
      ws.addEventListener('message', async ({ data }) => {
        queue.push(new Uint8Array(data));
        if (!processing) {
          processing = true;
          while (queue.length > 0) {
            const batch = queue.splice(0, 10);
            const merged = new Uint8Array(batch.reduce((acc, arr) => acc + arr.length, 0));
            let offset = 0;
            for (const arr of batch) {
              merged.set(arr, offset);
              offset += arr.length;
            }
            try {
              await writer.write(merged);
            } catch {
              break;
            }
          }
          processing = false;
        }
      });
    })(),
    
    // Socket -> WS  
    socket.readable.pipeTo(new WritableStream({
      write: chunk => ws.send(chunk),
      abort: () => ws.close()
    }))
  ]);
}

// ==================== WebSocket处理 ====================
async function handleWebSocket(request, config) {
  const protocol = request.headers.get('sec-websocket-protocol');
  if (!protocol) return new Response('Bad Request', { status: 400 });
  
  // Base64解码
  const protocolData = Uint8Array.from(
    atob(protocol.replace(/-/g, '+').replace(/_/g, '/')),
    c => c.charCodeAt(0)
  );
  
  // 解析VLESS协议
  const { uuid, port, address, addressType, initialData } = parseVlessHeader(protocolData);
  
  // UUID验证
  if (!uuid.every((b, i) => b === config.uuidBytes[i])) {
    return new Response('Unauthorized', { status: 403 });
  }
  
  // 建立目标连接
  const socket = await fastConnect(
    addressType === 3 ? `[${address}]` : address,
    port,
    config
  );
  
  // 创建WebSocket隧道
  const [client, server] = new WebSocketPair();
  server.accept();
  
  // 启动数据传输
  streamTransfer(server, socket, initialData);
  
  return new Response(null, { 
    status: 101, 
    webSocket: client 
  });
}

// ==================== 页面生成 ====================
function generateHTML(config, host) {
  const escapeHtml = (str) => str.replace(/[&<>"']/g, m => 
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  
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
        <div class="value">${escapeHtml(config.nodeName)}</div>
      </div>
      <div class="item">
        <div class="label">用户ID</div>
        <div class="value">${escapeHtml(config.userId)}</div>
      </div>
      <div class="item">
        <div class="label">代理IP</div>
        <div class="value">${escapeHtml(config.proxyIP)}</div>
      </div>
    </div>
    <h3>订阅链接</h3>
    <div class="box">
      <div class="text" id="s">https://${escapeHtml(host)}/${escapeHtml(config.userId)}/vless</div>
      <button class="btn" onclick="copyText('s', this)">复制</button>
    </div>
    <h3>节点链接</h3>
    <div class="box">
      <div class="text" id="n">vless://${escapeHtml(config.uuid)}@${escapeHtml(config.bestIPs[0] || host)}:443?encryption=none&security=tls&type=ws&host=${escapeHtml(host)}&sni=${escapeHtml(host)}&path=%2F%3Fed%3D2560#${escapeHtml(config.nodeName)}</div>
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
  return [...config.bestIPs, `${host}:443`].map(ip => {
    const [addr, port = 443] = ip.split(':');
    return `vless://${config.uuid}@${addr}:${port}?encryption=none&security=tls&type=ws&host=${host}&sni=${host}&path=%2F%3Fed%3D2560#${config.nodeName}`;
  }).join('\n');
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
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
          
        case `/${config.userId}/vless`:
          return new Response(generateVlessConfig(host, config), {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
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

