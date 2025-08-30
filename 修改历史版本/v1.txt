import { connect } from 'cloudflare:sockets';

// 配置管理类
class Config {
  constructor(env) {
    this.userId = this.getEnvValue('USER_ID', '123456', env);
    this.uuid = this.getEnvValue('UUID', 'aaa6b096-1165-4bbe-935c-99f4ec902d02', env);
    this.proxyIPs = this.getEnvValue('PROXY_IPS', ['developers.cloudflare.com'], env);
    this.txtRecords = this.getEnvValue('TXT_RECORDS', [], env);
    this.fallbackProxy = this.getEnvValue('FALLBACK_PROXY', 'sjc.o00o.ooo:443', env);
    this.enableFallback = this.getEnvValue('ENABLE_FALLBACK', true, env);
    this.enableNAT64 = this.getEnvValue('ENABLE_NAT64', false, env);
    this.nodeName = this.getEnvValue('NODE_NAME', 'CF-vless', env);
    this.uuidBytes = this.parseUUID(this.uuid);
  }

  getEnvValue(name, defaultValue, env) {
    const value = env?.[name] ?? import.meta?.env?.[name];
    if (!value) return defaultValue;
    
    if (typeof value !== 'string') return value;
    
    const trimmed = value.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed.includes('\n')) {
      return trimmed.split('\n').map(x => x.trim()).filter(Boolean);
    }
    
    const num = Number(trimmed);
    return isNaN(num) ? trimmed : num;
  }

  parseUUID(uuid) {
    const hex = uuid.replace(/-/g, '');
    return new Uint8Array(hex.match(/.{2}/g).map(byte => parseInt(byte, 16)));
  }
}

// WebSocket隧道管理
class WebSocketTunnel {
  constructor(ws, tcpSocket, initialData) {
    this.ws = ws;
    this.tcpSocket = tcpSocket;
    this.writer = tcpSocket.writable.getWriter();
    this.buffer = [];
    this.timer = null;
    
    this.init(initialData);
  }

  init(initialData) {
    // 发送连接成功响应
    this.ws.send(new Uint8Array([0, 0]));
    
    // 如果有初始数据，发送到TCP
    if (initialData) {
      this.writer.write(initialData);
    }
    
    this.setupHandlers();
  }

  setupHandlers() {
    // WebSocket -> TCP
    this.ws.addEventListener('message', ({ data }) => {
      const chunk = this.normalizeData(data);
      this.buffer.push(chunk);
      
      // 批量发送优化
      if (!this.timer) {
        this.timer = setTimeout(() => {
          this.flushBuffer();
        }, 5);
      }
    });

    // TCP -> WebSocket
    this.tcpSocket.readable
      .pipeTo(new WritableStream({
        write: chunk => this.ws.send(chunk),
        close: () => this.close(),
        abort: () => this.close()
      }))
      .catch(() => this.close());

    // 清理资源
    this.ws.addEventListener('close', () => this.cleanup());
    this.ws.addEventListener('error', () => this.cleanup());
  }

  normalizeData(data) {
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    if (typeof data === 'string') {
      return new TextEncoder().encode(data);
    }
    return data;
  }

  flushBuffer() {
    if (this.buffer.length === 0) return;
    
    const merged = this.buffer.length === 1 
      ? this.buffer[0]
      : this.mergeBuffers(this.buffer);
    
    this.writer.write(merged).catch(() => this.close());
    this.buffer = [];
    this.timer = null;
  }

  mergeBuffers(buffers) {
    const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const buffer of buffers) {
      result.set(buffer, offset);
      offset += buffer.length;
    }
    
    return result;
  }

  close() {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }

  cleanup() {
    clearTimeout(this.timer);
    try {
      this.writer.releaseLock();
      this.tcpSocket.close();
    } catch {}
  }
}

// VLESS协议解析器
class VLESSParser {
  static async parse(buffer, config) {
    const data = new Uint8Array(buffer);
    
    // 解析地址类型
    const addressType = data[17];
    const addressTypeOffset = 18 + addressType + 1;
    const port = (data[addressTypeOffset] << 8) | data[addressTypeOffset + 1];
    
    let hostname = '';
    let offset = addressTypeOffset + 3;
    
    switch (data[offset - 1]) {
      case 1: // IPv4
        hostname = Array.from(data.subarray(offset, offset + 4)).join('.');
        offset += 4;
        break;
        
      case 2: // Domain
        const domainLength = data[offset++];
        hostname = new TextDecoder().decode(data.subarray(offset, offset + domainLength));
        offset += domainLength;
        break;
        
      case 3: // IPv6
        const ipv6Parts = [];
        for (let i = 0; i < 8; i++) {
          const part = (data[offset + i * 2] << 8) | data[offset + i * 2 + 1];
          ipv6Parts.push(part.toString(16));
        }
        hostname = ipv6Parts.join(':');
        offset += 16;
        break;
        
      default:
        throw new Error('Invalid address type');
    }
    
    const initialData = buffer.slice(offset);
    const connection = await this.createConnection(hostname, port, config, initialData);
    
    return connection;
  }

  static async createConnection(hostname, port, config, initialData) {
    // 尝试直接连接
    try {
      const socket = await connect({ hostname, port });
      await socket.opened;
      return { tcpSocket: socket, initialData };
    } catch (error) {
      console.log(`Direct connection failed: ${error.message}`);
    }

    // 尝试NAT64转换（仅对IPv4地址）
    if (config.enableNAT64 && /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      try {
        const ipv6 = this.convertToIPv6(hostname);
        const socket = await connect({ hostname: ipv6, port });
        await socket.opened;
        return { tcpSocket: socket, initialData };
      } catch (error) {
        console.log(`NAT64 connection failed: ${error.message}`);
      }
    }

    // 使用备用代理
    if (config.enableFallback && config.fallbackProxy) {
      const [proxyHost, proxyPort] = config.fallbackProxy.split(':');
      try {
        const socket = await connect({ 
          hostname: proxyHost, 
          port: Number(proxyPort || port) 
        });
        await socket.opened;
        return { tcpSocket: socket, initialData };
      } catch (error) {
        console.log(`Fallback proxy failed: ${error.message}`);
      }
    }

    throw new Error('All connection attempts failed');
  }

  static convertToIPv6(ipv4) {
    const parts = ipv4.split('.').map(x => Number(x));
    const hex = parts.map(x => x.toString(16).padStart(2, '0')).join('');
    const ipv6Parts = hex.match(/.{4}/g);
    return `2001:67c:2960:6464::${ipv6Parts.join(':')}`;
  }
}

// HTML UI界面
const generateHTML = (config, host) => `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VLESS Proxy Manager</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .container {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            padding: 40px;
            max-width: 800px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
            animation: slideIn 0.5s ease;
        }

        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(-30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 2.5em;
            text-align: center;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
            font-size: 1.1em;
        }

        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .info-card {
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            padding: 20px;
            border-radius: 15px;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .info-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
        }

        .info-label {
            font-size: 0.9em;
            color: #666;
            margin-bottom: 5px;
            font-weight: 600;
        }

        .info-value {
            font-size: 1.1em;
            color: #333;
            word-break: break-all;
            font-family: 'Courier New', monospace;
        }

        .section {
            margin-bottom: 30px;
        }

        .section-title {
            font-size: 1.5em;
            color: #333;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e0e0e0;
        }

        .url-box {
            background: #f8f9fa;
            border: 2px dashed #dee2e6;
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 15px;
            position: relative;
            transition: all 0.3s ease;
        }

        .url-box:hover {
            border-color: #667eea;
            background: #f0f3ff;
        }

        .url-text {
            word-break: break-all;
            color: #495057;
            font-family: 'Courier New', monospace;
            font-size: 0.95em;
            padding-right: 80px;
        }

        .copy-btn {
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9em;
            transition: all 0.3s ease;
        }

        .copy-btn:hover {
            transform: translateY(-50%) scale(1.05);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }

        .copy-btn:active {
            transform: translateY(-50%) scale(0.95);
        }

        .copy-btn.copied {
            background: linear-gradient(135deg, #4caf50, #45a049);
        }

        .config-box {
            background: #282c34;
            color: #abb2bf;
            padding: 20px;
            border-radius: 10px;
            overflow-x: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            line-height: 1.6;
            position: relative;
            max-height: 400px;
            overflow-y: auto;
        }

        .config-box::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }

        .config-box::-webkit-scrollbar-track {
            background: #1e2127;
            border-radius: 4px;
        }

        .config-box::-webkit-scrollbar-thumb {
            background: #4b5263;
            border-radius: 4px;
        }

        .config-box::-webkit-scrollbar-thumb:hover {
            background: #5c6370;
        }

        .status-badge {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: 600;
            margin-left: 10px;
        }

        .status-active {
            background: linear-gradient(135deg, #4caf50, #45a049);
            color: white;
        }

        .status-inactive {
            background: linear-gradient(135deg, #f44336, #e53935);
            color: white;
        }

        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            color: #666;
            font-size: 0.9em;
        }

        .footer a {
            color: #667eea;
            text-decoration: none;
            font-weight: 600;
        }

        .footer a:hover {
            text-decoration: underline;
        }

        @media (max-width: 600px) {
            .container {
                padding: 25px;
            }

            h1 {
                font-size: 2em;
            }

            .info-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 VLESS Proxy Manager</h1>
        <p class="subtitle">高性能代理服务管理面板</p>

        <div class="info-grid">
            <div class="info-card">
                <div class="info-label">节点名称</div>
                <div class="info-value">${config.nodeName}</div>
            </div>
            <div class="info-card">
                <div class="info-label">用户ID</div>
                <div class="info-value">${config.userId}</div>
            </div>
            <div class="info-card">
                <div class="info-label">NAT64状态</div>
                <div class="info-value">
                    ${config.enableNAT64 ? '已启用' : '已禁用'}
                    <span class="status-badge ${config.enableNAT64 ? 'status-active' : 'status-inactive'}">
                        ${config.enableNAT64 ? 'ON' : 'OFF'}
                    </span>
                </div>
            </div>
            <div class="info-card">
                <div class="info-label">备用代理</div>
                <div class="info-value">
                    ${config.enableFallback ? '已启用' : '已禁用'}
                    <span class="status-badge ${config.enableFallback ? 'status-active' : 'status-inactive'}">
                        ${config.enableFallback ? 'ON' : 'OFF'}
                    </span>
                </div>
            </div>
        </div>

        <div class="section">
            <h2 class="section-title">📋 订阅地址</h2>
            <div class="url-box">
                <div class="url-text" id="sub-url">https://${host}/${config.userId}/vless</div>
                <button class="copy-btn" onclick="copyToClipboard('sub-url', this)">复制</button>
            </div>
        </div>

        <div class="section">
            <h2 class="section-title">⚙️ 配置信息</h2>
            <div class="config-box">
                <pre id="config-content"></pre>
                <button class="copy-btn" style="top: 15px;" onclick="copyToClipboard('config-content', this)">复制全部</button>
            </div>
        </div>

        <div class="footer">
            <p>Powered by <a href="https://workers.cloudflare.com" target="_blank">Cloudflare Workers</a></p>
            <p>© 2024 VLESS Proxy Manager | Version 2.0</p>
        </div>
    </div>

    <script>
        // 加载配置
        async function loadConfig() {
            try {
                const response = await fetch('/${config.userId}/vless');
                const config = await response.text();
                document.getElementById('config-content').textContent = config;
            } catch (error) {
                document.getElementById('config-content').textContent = '加载配置失败: ' + error.message;
            }
        }

        // 复制到剪贴板
        function copyToClipboard(elementId, button) {
            const element = document.getElementById(elementId);
            const text = element.textContent || element.innerText;
            
            navigator.clipboard.writeText(text).then(() => {
                const originalText = button.textContent;
                button.textContent = '✓ 已复制';
                button.classList.add('copied');
                
                setTimeout(() => {
                    button.textContent = originalText;
                    button.classList.remove('copied');
                }, 2000);
            }).catch(err => {
                alert('复制失败: ' + err.message);
            });
        }

        // 页面加载时获取配置
        window.addEventListener('load', loadConfig);
    </script>
</body>
</html>
`;

// 生成VLESS配置
function generateVLESSConfig(host, config) {
  const configs = [];
  const allIPs = config.proxyIPs.concat([`${host}:443`]);
  
  for (const ip of allIPs) {
    const [rawAddr, nodeName = config.nodeName] = ip.split('#');
    const [addr, port = 443] = rawAddr.split(':');
    
    const vlessUrl = `vless://${config.uuid}@${addr}:${port}?` + 
      `encryption=none&security=tls&type=ws&host=${host}&sni=${host}&path=%2F%3Fed%3D2560#${nodeName}`;
    
    configs.push(vlessUrl);
  }
  
  return configs.join('\n');
}

// Base64解码
function base64Decode(str) {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized), c => c.charCodeAt(0)).buffer;
}

// 主处理函数
export default {
  async fetch(request, env) {
    try {
      const config = new Config(env);
      const url = new URL(request.url);
      const upgrade = request.headers.get('Upgrade');
      const protocol = request.headers.get('sec-websocket-protocol');
      const host = request.headers.get('Host');

      // 处理WebSocket请求
      if (upgrade === 'websocket') {
        if (!protocol) {
          return new Response('Missing WebSocket protocol', { status: 400 });
        }

        try {
          // 解析协议数据
          const protocolData = base64Decode(protocol);
          const receivedUUID = new Uint8Array(protocolData, 1, 16);
          
          // 验证UUID
          const isValidUUID = receivedUUID.every((byte, index) => byte === config.uuidBytes[index]);
          if (!isValidUUID) {
            return new Response('Invalid UUID', { status: 403 });
          }

          // 解析VLESS协议并建立连接
          const { tcpSocket, initialData } = await VLESSParser.parse(protocolData, config);
          
          // 创建WebSocket对
          const [client, server] = new WebSocketPair();
          server.accept();
          
          // 建立隧道
          new WebSocketTunnel(server, tcpSocket, initialData);
          
          return new Response(null, { 
            status: 101, 
            webSocket: client 
          });

        } catch (error) {
          console.error('WebSocket error:', error);
          return new Response(`Connection failed: ${error.message}`, { status: 502 });
        }
      }

      // 处理HTTP请求
      if (url.pathname === `/${config.userId}`) {
        return new Response(generateHTML(config, host), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      if (url.pathname === `/${config.userId}/vless`) {
        return new Response(generateVLESSConfig(host, config), {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }

      // 默认响应
      return new Response('VLESS Proxy Service', { status: 200 });

    } catch (error) {
      console.error('Request error:', error);
      return new Response(`Internal Server Error: ${error.message}`, { status: 500 });
    }
  }
};
