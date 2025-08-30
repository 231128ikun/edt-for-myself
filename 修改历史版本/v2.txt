import { connect } from 'cloudflare:sockets';
const CFG = {
  userId: '123456',
  uuid: 'aaa6b096-1165-4bbe-935c-99f4ec902d02', 
  bestIPs: ['developers.cloudflare.com:443', 'www.visa.com:443'], // 优选IP列表
  proxyIP: 'sjc.o00o.ooo:443', // 代理IP（当节点不可访问时的备用）
  nodeName: 'CF-vless'
};
// UUID直接转换为字节数组，避免重复解析
const uuidBytes = new Uint8Array(CFG.uuid.replace(/-/g, '').match(/.{2}/g).map(b => parseInt(b, 16)));
// 主处理函数 - 热路径优先
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = request.headers.get('Host');
    
    // 1. WebSocket处理 - 最高频请求放最前
    if (request.headers.get('Upgrade') === 'websocket') {
      const proto = request.headers.get('sec-websocket-protocol');
      if (!proto) return new Response(null, { status: 400 });
      
      // 直接解析Base64，不用复杂的类
      const data = Uint8Array.from(atob(proto.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      
      // 快速UUID验证
      if (!data.subarray(1, 17).every((b, i) => b === uuidBytes[i])) {
        return new Response(null, { status: 403 });
      }
      
      // 解析目标地址
      const view = new DataView(data.buffer);
      const addrType = data[17];
      const offset = 18 + addrType + 1;
      const port = view.getUint16(offset);
      
      let hostname, dataStart = offset + 3;
      const type = data[offset + 2];
      
      if (type === 1) { // IPv4
        hostname = Array.from(data.subarray(dataStart, dataStart + 4)).join('.');
        dataStart += 4;
      } else if (type === 2) { // Domain
        const len = data[dataStart];
        hostname = new TextDecoder().decode(data.subarray(dataStart + 1, dataStart + 1 + len));
        dataStart += 1 + len;
      } else if (type === 3) { // IPv6
        const parts = [];
        for (let i = 0; i < 8; i++) {
          parts.push(view.getUint16(dataStart + i * 2).toString(16));
        }
        hostname = parts.join(':');
        dataStart += 16;
      }
      
      // 建立TCP连接 
      let tcpSocket;
      try {
        // 直接尝试连接，让系统处理错误
        tcpSocket = connect({ hostname, port });
        await tcpSocket.opened;
      } catch {
        // 失败则使用代理IP
        try {
          const [proxyHost, proxyPort = '443'] = CFG.proxyIP.split(':');
          tcpSocket = connect({ hostname: proxyHost, port: Number(proxyPort) });
          await tcpSocket.opened;
        } catch {
          return new Response(null, { status: 502 });
        }
      }
      
      // 创建WebSocket隧道
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      server.send(new Uint8Array([0, 0])); // 发送连接成功响应
      
      // 如果有初始数据，立即发送
      if (dataStart < data.length) {
        const writer = tcpSocket.writable.getWriter();
        await writer.write(data.subarray(dataStart));
        writer.releaseLock();
      }
      
      // 建立双向数据流 - 极简实现
      tcpSocket.readable.pipeTo(
        new WritableStream({
          write: chunk => server.send(chunk),
          close: () => server.close(),
          abort: () => server.close()
        })
      ).catch(() => {});
      
      // WebSocket -> TCP
      let writer = tcpSocket.writable.getWriter();
      server.addEventListener('message', async ({ data }) => {
        try {
          await writer.write(
            data instanceof ArrayBuffer ? new Uint8Array(data) : data
          );
        } catch {
          writer.releaseLock();
          writer = tcpSocket.writable.getWriter();
        }
      });
      
      server.addEventListener('close', () => {
        try { writer.releaseLock(); tcpSocket.close(); } catch {}
      });
      
      return new Response(null, { status: 101, webSocket: client });
    }
    
    // 2. 订阅处理 - 低频请求放后面
    if (url.pathname === `/${CFG.userId}`) {
      // 返回简单的管理页面
      return new Response(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VLESS Proxy</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
    }
    .container {
      background: white;
      border-radius: 15px;
      padding: 30px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h1 {
      color: #333;
      text-align: center;
    }
    .info {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 8px;
      margin: 15px 0;
      word-break: break-all;
      font-family: monospace;
    }
    .btn {
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      margin: 5px;
    }
    .btn:hover {
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 VLESS Proxy Manager</h1>
    <div class="info">
      <strong>节点名称:</strong> ${CFG.nodeName}<br>
      <strong>用户ID:</strong> ${CFG.userId}
    </div>
    <div class="info">
      <strong>订阅地址:</strong><br>
      <span id="subUrl">https://${host}/${CFG.userId}/vless</span>
      <button class="btn" onclick="navigator.clipboard.writeText(document.getElementById('subUrl').textContent)">复制</button>
    </div>
    <div class="info">
      <strong>优选IP节点:</strong> ${CFG.bestIPs.length} 个<br>
      <strong>代理IP:</strong> ${CFG.proxyIP}
    </div>
  </div>
</body>
</html>
      `, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    
    if (url.pathname === `/${CFG.userId}/vless`) {
      // 生成VLESS配置 - 包含所有优选IP
      const configs = [];
      
      // 添加主节点
      configs.push(`vless://${CFG.uuid}@${host}:443?encryption=none&security=tls&type=ws&host=${host}&sni=${host}&path=%2F%3Fed%3D2560#${CFG.nodeName}-Main`);
      
      // 添加所有优选IP节点
      for (const bestIP of CFG.bestIPs) {
        const [addr, port = '443'] = bestIP.split(':');
        const nodeName = addr.replace(/\./g, '-');
        configs.push(`vless://${CFG.uuid}@${addr}:${port}?encryption=none&security=tls&type=ws&host=${host}&sni=${host}&path=%2F%3Fed%3D2560#${CFG.nodeName}-${nodeName}`);
      }
      
      return new Response(configs.join('\n'), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    
    // 默认响应
    return new Response('VLESS Proxy Service', { status: 200 });
  }
};
