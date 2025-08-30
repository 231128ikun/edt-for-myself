import { connect } from 'cloudflare:sockets';

class Config {
  constructor(env, url) {
    this.userId = env?.USER_ID || '123456';
    this.uuid = env?.UUID || 'aaa6b096-1165-4bbe-935c-99f4ec902d02';
    this.bestIPs = this.parseList(env?.BEST_IPS) || ['developers.cloudflare.com','ip.sb','www.visa.cn','ikun.glimmer.cf.090227.xyz'];
    this.proxyIP = url?.searchParams.get('proxyip') || env?.PROXY_IP || 'sjc.o00o.ooo:443';
    this.enableNAT64 = env?.ENABLE_NAT64 === 'true';
    this.nodeName = env?.NODE_NAME || 'IKUN-Vless';
    this.uuidBytes = new Uint8Array(this.uuid.replace(/-/g, '').match(/.{2}/g).map(x => parseInt(x, 16)));
  }
  
  parseList(val) {
    return typeof val === 'string' ? val.split('\n').filter(Boolean) : val;
  }
}

const fastConnect = async (hostname, port, config) => {
  const attempts = [
    () => connect({ hostname, port }),
    config.enableNAT64 && /^\d+\.\d+\.\d+\.\d+$/.test(hostname) 
      ? () => connect({ hostname: '2001:67c:2960:6464::' + hostname.split('.').map(x => (+x).toString(16).padStart(2, '0')).join('').match(/.{4}/g).join(':'), port })
      : null,
    config.proxyIP 
      ? () => connect({ hostname: config.proxyIP.split(':')[0], port: +config.proxyIP.split(':')[1] || port })
      : null
  ].filter(Boolean);

  for (const attempt of attempts) {
    try {
      const socket = await attempt();
      await socket.opened;
      return socket;
    } catch {}
  }
  throw new Error('Connection failed');
};

const fastParse = buffer => {
  const d = new Uint8Array(buffer);
  const offset = 18 + d[17] + 1;
  const port = (d[offset] << 8) | d[offset + 1];
  let hostname, pos = offset + 3;
  
  switch (d[offset + 2]) {
    case 1: hostname = `${d[pos]}.${d[pos+1]}.${d[pos+2]}.${d[pos+3]}`; pos += 4; break;
    case 2: const len = d[pos++]; hostname = new TextDecoder().decode(d.subarray(pos, pos + len)); pos += len; break;
    case 3: hostname = Array.from({length: 8}, (_, i) => ((d[pos + 2*i] << 8) | d[pos + 2*i + 1]).toString(16)).join(':'); pos += 16; break;
  }
  
  return { hostname, port, data: buffer.slice(pos) };
};

const tunnel = (ws, socket, data) => {
  const writer = socket.writable.getWriter();
  
  ws.send(new Uint8Array([0, 0]));
  data && writer.write(data).catch(() => {});
  
  ws.addEventListener('message', ({ data }) => 
    writer.write(new Uint8Array(data)).catch(() => ws.close())
  );
  
  socket.readable.pipeTo(new WritableStream({ 
    write: chunk => ws.readyState === WebSocket.OPEN && ws.send(chunk),
    abort: () => ws.close()
  })).catch(() => {});
  
  ws.addEventListener('close', () => writer.close().catch(() => {}));
};

const html = (config, host) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VLESS</title><style>
body{font-family:system-ui;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;justify-content:center;align-items:center;margin:0;padding:20px}
.c{background:rgba(255,255,255,.95);border-radius:15px;padding:25px;max-width:450px;width:100%;box-shadow:0 20px 40px rgba(0,0,0,.2)}
h1{text-align:center;color:#333;margin-bottom:15px}
.info{display:grid;gap:10px;margin-bottom:20px}
.item{background:#f8f9fa;padding:10px;border-radius:6px}
.label{font-size:.85em;color:#666;margin-bottom:3px}
.value{font-family:monospace;color:#333;word-break:break-all;font-size:.9em}
.box{background:#f8f9fa;border:1px solid #ddd;border-radius:6px;padding:10px;position:relative;margin-bottom:10px}
.text{font-family:monospace;word-break:break-all;padding-right:60px;font-size:.85em}
.btn{position:absolute;right:6px;top:50%;transform:translateY(-50%);background:#667eea;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:.75em}
.btn:hover{background:#5a6fd8}.btn.ok{background:#28a745}
</style></head><body>
<div class="c">
<h1>🚀 VLESS</h1>
<div class="info">
<div class="item"><div class="label">节点</div><div class="value">${config.nodeName}</div></div>
<div class="item"><div class="label">用户ID</div><div class="value">${config.userId}</div></div>
<div class="item"><div class="label">代理IP</div><div class="value">${config.proxyIP}</div></div>
</div>
<h3>订阅</h3>
<div class="box"><div class="text" id="s">https://${host}/${config.userId}/vless</div><button class="btn" onclick="cp('s',this)">复制</button></div>
<h3>节点</h3>
<div class="box"><div class="text" id="n">vless://${config.uuid}@${config.bestIPs[0] || host}:443?encryption=none&security=tls&sni=${host}&fp=randomized&allowInsecure=1&type=ws&host=${host}&path=%2F%3Fed%3D2560#${config.nodeName}</div><button class="btn" onclick="cp('n',this)">复制</button></div>
</div>
<script>
function cp(id,btn){
navigator.clipboard.writeText(document.getElementById(id).textContent).then(()=>{
const o=btn.textContent;btn.textContent='✓';btn.classList.add('ok');
setTimeout(()=>{btn.textContent=o;btn.classList.remove('ok')},800);
});
}
</script></body></html>`;

const genConfig = (host, config) => 
  [...config.bestIPs, `${host}:443`].map(ip => {
    const [addr, port = 443] = ip.split(':');
    return `vless://${config.uuid}@${addr}:${port}?encryption=none&security=tls&sni=${host}&fp=randomized&allowInsecure=1&type=ws&host=${host}&path=%2F%3Fed%3D2560#${config.nodeName}`;
  }).join('\n');

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const config = new Config(env, url);
      const host = request.headers.get('Host');

      if (request.headers.get('Upgrade') === 'websocket') {
        const protocol = request.headers.get('sec-websocket-protocol');
        if (!protocol) return new Response('Bad Request', { status: 400 });
        
        try {
          const protocolData = Uint8Array.from(atob(protocol.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
          const receivedUUID = protocolData.slice(1, 17);
          
          if (!receivedUUID.every((b, i) => b === config.uuidBytes[i])) {
            return new Response('Forbidden', { status: 403 });
          }

          const { hostname, port, data } = fastParse(protocolData.buffer);
          const socket = await fastConnect(hostname, port, config);
          
          const [client, server] = new WebSocketPair();
          server.accept();
          tunnel(server, socket, data);
          
          return new Response(null, { status: 101, webSocket: client });
        } catch {
          return new Response('Internal Server Error', { status: 500 });
        }
      }

      if (url.pathname === `/${config.userId}`) {
        return new Response(html(config, host), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      if (url.pathname === `/${config.userId}/vless`) {
        return new Response(genConfig(host, config), {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }

      return new Response('OK');
    } catch {
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};
