/*
  一、订阅链接：https://<部署的域名>/<变量uid的值(见下方)>(也可以通过?sub=sub.cmliussss.net快速切换订阅器）
  二、手搓节点格式：
        vless://@<优选域名或ip>:<端口>?encryption=none&security=tls&sni=<部署的域名>&allowInsecure=1&&type=ws&host=<部署的域名>&path=<路径，例：/?ed=2560或者单独的/>#<备注>
  三、路径设置格式
    /?p= 或者/p=；变量支持：s5(支持socks5和http)，gs5，p，连接符：&  即/p=1.2.3.4:443&s5=socks://user:pass@host:port或s5=http://user:pass@host:port
  四、连接逻辑
   1. 直连--> s5(如果有） --> p
   2. 全局：所有流量转发s5（也就是固定节点）
*/
import { connect as c } from 'cloudflare:sockets';

const VER = 'mini-2.6.8-beta-fixed';//版本号，无实际意义
const U = 'aaa6b096-1165-4bbe-935c-99f4ec902d02';//标准的uuid格式
const P = 'sjc.o00o.ooo:443';//proxyip，用于访问cf类受限网络时fallback
const S5 = '';//格式为socks5://user:pass@host:port或者http://...设计目的与p类似
const GS5 = false;//全局socks5/http，固定ip用
const sub = 'sub.o0w0o.qzz.io';//订阅服务器地址，项目为CM独家订阅器项目
const uid = 'ikun';//订阅连接的路径标识
const WS_OPEN=1,WS_CLOSED=3;
const DEBUG = false; 
const EMPTY_U8 = new Uint8Array(0);
const UB = Uint8Array.from(U.replace(/-/g, '').match(/.{2}/g).map(x => parseInt(x, 16)));
function vU(u){return/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(u);}
if(!vU(U))throw new Error('Bad UUID');

export default{
async fetch(r){
try{
  const u=new URL(r.url);
  if(uid&&u.pathname==='/'+uid){const sh=u.searchParams.get('sub')||sub;if(sh)return Response.redirect(`https://${sh}/sub?uuid=${U}&host=${u.hostname}`,302);}
  const up=r.headers.get('Upgrade');
  if(!up||up.toLowerCase()!=='websocket')return Response.redirect('https://example.com',301);
  const tp=u.pathname+u.search,pm=tp.match(/p=([^&]*)/),sm=tp.match(/s5=([^&]*)/),gm=tp.match(/gs5=([^&]*)/);
  const px=pm?pm[1]:P,s5=sm?sm[1]:S5,gs5=gm?(gm[1]==='1'||gm[1]&&gm[1].toLowerCase()==='true'):GS5;
  return vWS(r,px,s5,gs5);
}catch(e){
  console.error('[top-level fetch error]', e?.stack || e?.message || e);
  return new Response('Worker error: ' + (e?.message || 'unknown'), { status: 502 });
}
}};

function log(...args){if(DEBUG)console.error(...args);}
function safeClose(o){try{if(o&&typeof o.close==='function'){if(o.readyState!==undefined&&o.readyState===WS_CLOSED)return;o.close();}}catch(e){log('[safeClose]',e);}}
function ensureU8(x){if(!x)return EMPTY_U8;if(x instanceof Uint8Array)return x;if(x instanceof ArrayBuffer)return new Uint8Array(x);if(ArrayBuffer.isView(x))return new Uint8Array(x.buffer,x.byteOffset,x.byteLength);return EMPTY_U8;}
function base64ToUint8(b){if(!b)return{ed:null,er:null};try{let s=b.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const r=atob(s);return{ed:Uint8Array.from(r,c=>c.charCodeAt(0)),er:null};}catch(e){log('[base64 decode error]',e);return{ed:null,er:e};}}
function parseHostPort(s,d=443){if(!s)return[null,d];if(s.includes(']:')){const p=s.split(']:');return[p[0]+']',Number(p[1])||d];}const p=s.split(':');if(p.length===2)return[p[0],Number(p[1])||d];return[s,d];}
function isClosedError(e){return e&&/closed|aborted/i.test(e.message);}

async function vWS(r,px,s5,gs5){
const wp=new WebSocketPair(),cl=wp[0],sv=wp[1];sv.accept();
const eh=r.headers.get('sec-websocket-protocol')||'',rs=mRS(sv,eh);
let remoteSocket=null,dnsWriter=null,dnsMode=false;
const clean=()=>{safeClose(sv);safeClose(remoteSocket);};
rs.pipeTo(new WritableStream({
async write(ch){
try{
  const d=ensureU8(ch);if(!d.length)return;
  if(dnsMode&&dnsWriter){dnsWriter(d);return;}
  if(remoteSocket){const w=remoteSocket.writable.getWriter();try{await w.write(d);}finally{w.releaseLock();}return;}
  const p=pVH(d.buffer);
  if(p.err){
    log('[vWS parse error]',p.msg);
    clean();
    return; 
  }
  
  const{ar,pr,ri,vv,udp}=p;
  if(udp){if(pr!==53){log('[udp] only port 53');clean();return;}dnsMode=true;const vh=new Uint8Array([vv[0],0]),ip=d.slice(ri),h=await hUDP(sv,vh);dnsWriter=h.write;if(ip.length)dnsWriter(ip);return;}
  const vh=new Uint8Array([vv[0],0]),ip=d.slice(ri);
  hTCP(ar,pr,ip,sv,vh,px,s5,gs5).then(s=>remoteSocket=s).catch(e=>{if(!isClosedError(e)){log('[hTCP error]',e);clean();}});
}catch(e){
  log('[ws write error]',e);
  clean();
}
},
close(){clean();},
abort(){clean();}
})).catch(e=>{if(!isClosedError(e)){log('[WS pipe error]',e);}clean();});
return new Response(null,{status:101,webSocket:cl});
}

async function hTCP(a,p,fp,sv,vh,px,s5,gs5){
const s5cfg=s5?pS5(s5):null;
async function cD(h,pt){try{const s=c({hostname:h,port:pt});await s.opened;return s;}catch(e){log('[connect error]',h,pt,e);throw e;}}
async function cS5(h,pt){if(s5cfg.isHttp)return await httpConn(h,pt,s5cfg);return await s5conn(h,pt,s5cfg);}
let sock=null;
try{
if(gs5&&s5cfg){
sock=await cS5(a,p);
if(fp?.length){const w=sock.writable.getWriter();await w.write(fp);w.releaseLock();}
r2w(sock,sv,vh,null);
return sock;
}
try{
sock=await cD(a,p);
if(fp?.length){const w=sock.writable.getWriter();await w.write(fp);w.releaseLock();}
async function retry(){
try{sock?.close();}catch{}
if(s5cfg){
try{
const retryS=await cS5(a,p);
if(fp?.length){const w=retryS.writable.getWriter();await w.write(fp);w.releaseLock();}
retryS.closed.catch(e=>{if(!isClosedError(e))log('[retry s5 closed]',e);}).finally(()=>safeClose(sv));
r2w(retryS,sv,vh,null);
return;
}catch(e){
if(!isClosedError(e))log('[retry s5 error]',e);
try{sock?.close();}catch{}
sock=null;
}
}
const[ph,pp]=parseHostPort(px,p);
const retryP=await cD(ph,pp);
if(fp?.length){const w=retryP.writable.getWriter();await w.write(fp);w.releaseLock();}
retryP.closed.catch(e=>{if(!isClosedError(e))log('[retry p closed]',e);}).finally(()=>safeClose(sv));
r2w(retryP,sv,vh,null);
}
r2w(sock,sv,vh,retry);
return sock;
}catch{
try{sock?.close();}catch{}
sock=null;
}
if(s5cfg){
try{
sock=await cS5(a,p);
if(fp?.length){const w=sock.writable.getWriter();await w.write(fp);w.releaseLock();}
r2w(sock,sv,vh,null);
return sock;
}catch(e){
log('[s5 connect error]',e);
try{sock?.close();}catch{}
sock=null;
}
}
const[ph,pp]=parseHostPort(px,p);
sock=await cD(ph,pp);
if(fp?.length){const w=sock.writable.getWriter();await w.write(fp);w.releaseLock();}
r2w(sock,sv,vh,null);
return sock;
}catch(e){
log('[hTCP final error]',e);
try{sock?.close();}catch{}
try{sv?.close();}catch{}
throw e;
}
}

async function r2w(rs,sv,vh,retryFn){
let header=vh,hasIncomingData=false;
await rs.readable.pipeTo(new WritableStream({
async write(ch){
hasIncomingData=true;
const u=ensureU8(ch);if(!u.length)return;
if(sv.readyState!==WS_OPEN)throw new Error('websocket not open');
if(header){
const merged = new Uint8Array(header.length + u.length);
merged.set(header, 0);
merged.set(u, header.length);
sv.send(merged);
header=null;
}
else sv.send(u);
},
close(){safeClose(sv);},
abort(){safeClose(sv);}
})).catch(e=>{if(!isClosedError(e)){log('[r2w pipe error]',e);}safeClose(sv);});
if(hasIncomingData===false&&retryFn){
retryFn();
}
}

async function httpConn(h,pt,cfg){
const s=c({hostname:cfg.h,port:cfg.pt});
await s.opened;
const auth=cfg.u&&cfg.p?`Proxy-Authorization: Basic ${btoa(`${cfg.u}:${cfg.p}`)}\r\n`:'';
const req=`CONNECT ${h}:${pt} HTTP/1.1\r\nHost: ${h}:${pt}\r\n${auth}Connection: Keep-Alive\r\n\r\n`;
const w=s.writable.getWriter();
await w.write(new TextEncoder().encode(req));
w.releaseLock();
const r=s.readable.getReader();
let buf=new Uint8Array(0);
while(true){
const{value,done}=await r.read();
if(done)throw new Error('http proxy closed');
const nb=new Uint8Array(buf.length+value.length);
nb.set(buf);nb.set(value,buf.length);
buf=nb;
const txt=new TextDecoder().decode(buf);
if(txt.includes('\r\n\r\n')){
if(!txt.startsWith('HTTP/1.1 200')&&!txt.startsWith('HTTP/1.0 200'))throw new Error('http connect failed');
break;
}
}
r.releaseLock();
return s;
}

async function s5conn(h,pt,s5cfg){
const s=c({hostname:s5cfg.h,port:s5cfg.pt});let sw=null,sr=null;
try{
await s.opened;sw=s.writable.getWriter();sr=s.readable.getReader();
await sw.write(new Uint8Array([5,2,0,2]));
const arR=await sr.read();if(!arR?.value||arR.done)throw new Error('s5 no auth response');
const ar=arR.value;if(ar[1]===2){if(!s5cfg.u||!s5cfg.p)throw new Error('auth required');
const uE=new TextEncoder().encode(s5cfg.u),pE=new TextEncoder().encode(s5cfg.p);
await sw.write(new Uint8Array([1,uE.length,...uE,pE.length,...pE]));
const aprR=await sr.read();if(!aprR?.value||aprR.done)throw new Error('s5 auth no response');
const apr=aprR.value;if(apr[1]!==0)throw new Error('auth failed');}
const dom=new TextEncoder().encode(h);
await sw.write(new Uint8Array([5,1,0,3,dom.length,...dom,pt>>8,pt&255]));
const resR=await sr.read();if(!resR?.value||resR.done)throw new Error('s5 connect no response');
const res=resR.value;if(res[1]!==0)throw new Error(`connect failed: code ${res[1]}`);
sw.releaseLock();sr.releaseLock();return s;
}catch(e){try{sw?.releaseLock();}catch{}try{sr?.releaseLock();}catch{}try{s?.close();}catch{}throw e;}
}

async function hUDP(sv,vh){
let sentHeader=false;
const transformStream=new TransformStream({
start(controller){},
transform(chunk,controller){
const data=ensureU8(chunk);
for(let index=0;index<data.byteLength;){
if(index+2>data.byteLength)break;
const lengthBuffer=data.slice(index,index+2);
const udpPacketLength=new DataView(lengthBuffer.buffer,lengthBuffer.byteOffset,2).getUint16(0);
if(index+2+udpPacketLength>data.byteLength)break;
const udpData=data.slice(index+2,index+2+udpPacketLength);
index=index+2+udpPacketLength;
controller.enqueue(udpData);
}
},
flush(controller){}
});
transformStream.readable.pipeTo(new WritableStream({
async write(chunk){
try{
const dnsQuery=ensureU8(chunk);
if(!dnsQuery||dnsQuery.length===0)return;
const resp=await fetch('https://1.1.1.1/dns-query',{
method:'POST',
headers:{'content-type':'application/dns-message'},
body:dnsQuery
});
const dnsResult=new Uint8Array(await resp.arrayBuffer());
const udpSize=dnsResult.byteLength;
const udpSizeBuffer=new Uint8Array([(udpSize>>8)&0xff,udpSize&0xff]);
if(sv.readyState===WS_OPEN){
if(sentHeader){
const merged=new Uint8Array(udpSizeBuffer.length+dnsResult.length);
merged.set(udpSizeBuffer,0);
merged.set(dnsResult,udpSizeBuffer.length);
sv.send(merged);
}else{
const merged=new Uint8Array(vh.length+udpSizeBuffer.length+dnsResult.length);
merged.set(vh,0);
merged.set(udpSizeBuffer,vh.length);
merged.set(dnsResult,vh.length+udpSizeBuffer.length);
sv.send(merged);
sentHeader=true;
}
}
}catch(e){
if(!isClosedError(e)){log('[dns query error]',e);}
}
},
close(){},
abort(){}
})).catch(e=>{
if(!isClosedError(e)){log('[dns udp error]',e);}
});
const writer=transformStream.writable.getWriter();
return{
write:async(ch)=>{
try{
await writer.write(ch);
}catch(e){
if(!isClosedError(e)){log('[dns write error]',e);}
}
}
};
}

function pVH(b){
if(!b||b.byteLength<24)return{err:1,msg:'invalid header length'};
const d=new Uint8Array(b),v=d[0];
for(let i=0;i<16;i++){
if(d[1+i]!==UB[i]){
log('[uuid mismatch] expected',UB,'got',d.slice(1,17));
return{err:1,msg:'uuid mismatch'};
}
}
const ol=d[17];
if(18+ol>=b.byteLength)return{err:1,msg:'invalid opt len'};
const cmd=d[18+ol];
if(cmd!==1&&cmd!==2)return{err:1,msg:'invalid cmd'};
const udp=cmd===2,pi=18+ol+1,pr=new DataView(b,pi,2).getUint16(0);let ai=pi+2,ar='',at=d[ai++];
if(at===1){ar=Array.from(d.slice(ai,ai+4)).join('.');ai+=4;}
else if(at===2){const al=d[ai++];ar=new TextDecoder().decode(b.slice(ai,ai+al));ai+=al;}
else if(at===3){const dv=new DataView(b,ai,16),sg=[];for(let i=0;i<8;i++)sg.push(dv.getUint16(i*2).toString(16));ar=sg.join(':');ai+=16;}
else return{err:1,msg:'invalid atyp'};
return{err:0,ar,pr,ri:ai,vv:new Uint8Array([v]),udp};
}

function pS5(s){
const isHttp=/^https?:\/\//i.test(s);
s=s.replace(/^(socks5?|https?):\/\//i,'');
const at=s.includes('@')?s.lastIndexOf('@'):-1,hp=at!==-1?s.slice(at+1):s;const[h,pt]=parseHostPort(hp);
if(at===-1)return{u:'',p:'',h,pt,isHttp};const up=s.slice(0,at),ci=up.indexOf(':');if(ci===-1)return{u:'',p:'',h,pt,isHttp};
return{u:up.slice(0,ci),p:up.slice(ci+1),h,pt,isHttp};
}

function mRS(ws,eh){
let closed=false;
return new ReadableStream({
start(c){
ws.addEventListener('message',e=>{if(!closed)c.enqueue(e.data);});
ws.addEventListener('close',()=>{if(!closed){closed=true;try{c.close();}catch{}}});
ws.addEventListener('error',e=>{try{c.error(e);}catch{}});
const{ed,er}=base64ToUint8(eh);
if(er){
log('[protocol header decode error]',er);
try{ws.close();}catch{}
return;
}else if(ed){
c.enqueue(ed);
}
},cancel(){closed=true;safeClose(ws);}
});
}
