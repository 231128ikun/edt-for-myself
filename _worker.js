import { connect as c } from 'cloudflare:sockets';

const VER = 'mini-2.7.0';//版本号,无实际意义
const U = 'aaa6b096-1165-4bbe-935c-99f4ec902d02';//标准的uuid格式
const P = 'sjc.o00o.ooo:443';//proxyip,用于访问cf类受限网络时fallback
const S5 = '';//格式为socks5://user:pass@host:port或者http://...设计目的与p类似
const GS5 = false;//全局socks5/http,固定ip用
const sub = 'sub.glimmer.hidns.vip';//订阅服务器地址,项目为CM独家订阅器项目
const uid = 'ikun';//订阅连接的路径标识
const WS_OPEN=1,WS_CLOSED=3;
const DEBUG = false;
const EMPTY_U8 = new Uint8Array(0);
const TE=new TextEncoder(),TD=new TextDecoder();
const UB = Uint8Array.from(U.replace(/-/g, '').match(/.{2}/g).map(x => parseInt(x, 16)));
function vU(u){return/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(u);}
if(!vU(U))throw new Error('Bad UUID');

export default{
async fetch(r){
try{
  const u=new URL(r.url);
  if(uid&&u.pathname==='/'+uid){const sh=u.searchParams.get('sub')||sub;if(sh)return Response.redirect(`https://${sh}/sub?uuid=${U}&host=${u.hostname}`,302);}
  const up=r.headers.get('Upgrade');
  if(!up||up.toLowerCase()!=='websocket')return new Response('OK', {status:200});
  
  const tp=u.pathname+u.search,pm=tp.match(/p=([^&]*)/),sm=tp.match(/s5=([^&]*)/),gm=tp.match(/gs5=([^&]*)/);
  const px=pm?pm[1]:P,s5=sm?sm[1]:S5,gs5=gm?(gm[1]==='1'||gm[1]&&gm[1].toLowerCase()==='true'):GS5;
  
  return vWS(r,px,s5,gs5);
}catch(e){
  console.error('[top-level fetch error]', e?.stack||e?.message||e);
  return new Response('Worker error: '+(e?.message||'unknown'), {status:502});
}
}};

function log(...args){if(DEBUG)console.error(...args);}
function safeClose(o){
  try{if(o&&typeof o.close==='function'){if(o.readyState!==undefined&&o.readyState===WS_CLOSED)return;o.close();}}catch(e){log('[safeClose]',e);}
}
function ensureU8(x){
  if(!x)return EMPTY_U8;
  if(x instanceof Uint8Array)return x;
  if(x instanceof ArrayBuffer)return new Uint8Array(x);
  if(ArrayBuffer.isView(x))return new Uint8Array(x.buffer,x.byteOffset,x.byteLength);
  return EMPTY_U8;
}
function base64ToUint8(b){
  if(!b)return{ed:null,er:null};
  try{
    let s=b.replace(/-/g,'+').replace(/_/g,'/');
    while(s.length%4)s+='=';
    const r=atob(s);
    return{ed:Uint8Array.from(r,c=>c.charCodeAt(0)),er:null};
  }catch(e){
    log('[base64 decode error]',e);
    return{ed:null,er:e};
  }
}
function parseHostPort(s,d=443){
  if(!s)return[null,d];s=String(s).trim();
  if(s[0]==='['){
    const j=s.indexOf(']');
    if(j>0){const h=s.slice(1,j),p=s[j+1]===':'?Number(s.slice(j+2))||d:d;return[h,p];}
  }
  const i=s.lastIndexOf(':');
  return i>0&&s.indexOf(':')===i?[s.slice(0,i),Number(s.slice(i+1))||d]:[s,d];
}
function isIPv4(h){return/^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(h);}
function ipv6ToBytes(s){
  if(!s||s.includes('.'))return null;
  const p=s.split('::');if(p.length>2)return null;
  const a=p[0]?p[0].split(':').filter(Boolean):[],b=p[1]?p[1].split(':').filter(Boolean):[];
  const fill=8-(a.length+b.length);if(fill<0)return null;
  const full=a.concat(Array(fill).fill('0'),b);if(full.length!==8)return null;
  const out=new Uint8Array(16);
  for(let i=0;i<8;i++){const v=parseInt(full[i],16);if(!(v>=0&&v<=0xffff))return null;out[i*2]=v>>8;out[i*2+1]=v&255;}
  return out;
}
function s5Addr(h){
  if(isIPv4(h)){const p=h.split('.').map(Number);return new Uint8Array([1,p[0],p[1],p[2],p[3]]);}
  const v6=ipv6ToBytes(h);
  if(v6){const out=new Uint8Array(17);out[0]=4;out.set(v6,1);return out;}
  const dom=TE.encode(h);if(dom.length>255)throw new Error('domain too long');
  const out=new Uint8Array(2+dom.length);out[0]=3;out[1]=dom.length;out.set(dom,2);return out;
}
function isClosedError(e){return e&&/closed|aborted/i.test(e.message);}

async function vWS(r,px,s5,gs5){
const wp=new WebSocketPair(),cl=wp[0],sv=wp[1];sv.accept();
const eh=r.headers.get('sec-websocket-protocol')||'',rs=mRS(sv,eh);
let remoteSocket=null,dnsWriter=null,dnsMode=false;
const clean=()=>{dnsWriter=null;dnsMode=false;safeClose(remoteSocket);safeClose(sv);};
rs.pipeTo(new WritableStream({
async write(ch){
try{
  const d=ensureU8(ch);if(!d.length)return;
  if(dnsMode&&dnsWriter){await dnsWriter(d);return;}
  if(remoteSocket){const w=remoteSocket.writable.getWriter();try{await w.write(d);}finally{w.releaseLock();}return;}
  const p=pVH(d.buffer);
  if(p.err){log('[vWS parse error]',p.msg);clean();return;}
  const{ar,pr,ri,vv,udp}=p;
  if(udp){if(pr!==53){log('[udp] only port 53');clean();return;}dnsMode=true;const vh=new Uint8Array([vv[0],0]),ip=d.slice(ri),h=await hUDP(sv,vh);dnsWriter=h.write.bind(h);if(ip.length)await dnsWriter(ip);return;}
  const vh=new Uint8Array([vv[0],0]),ip=d.slice(ri);
  hTCP(ar,pr,ip,sv,vh,px,s5,gs5).then(s=>remoteSocket=s).catch(e=>{if(!isClosedError(e)){log('[hTCP error]',e);clean();}});
}catch(e){log('[ws write error]',e);clean();}
},
close(){clean();},
abort(){clean();}
})).catch(e=>{if(!isClosedError(e)){log('[WS pipe error]',e);}clean();});
return new Response(null,{status:101,webSocket:cl});
}

async function dial(h,p){const s=c({hostname:h,port:p});await s.opened;return s;}
async function wFirst(s,fp){if(fp?.length){const w=s.writable.getWriter();try{await w.write(fp);}finally{w.releaseLock();}}return s;}
const pickFB=(a,p,px,s5cfg)=>s5cfg?(()=>s5cfg.isHttp?httpConn(a,p,s5cfg):s5conn(a,p,s5cfg)):(()=>{const[ph,pp]=parseHostPort(px,p);return dial(ph,pp);});

async function hTCP(a,p,fp,sv,vh,px,s5,gs5){
  const s5cfg=s5?pS5(s5):null,fb=pickFB(a,p,px,s5cfg);let sock=null;
  try{
    if(gs5&&s5cfg){sock=await wFirst(await fb(),fp);r2w(sock,sv,vh,null);return sock;}
    sock=await wFirst(await dial(a,p),fp);
    r2w(sock,sv,vh,async()=>{try{sock?.close();}catch{};const s=await wFirst(await fb(),fp);r2w(s,sv,vh,null);return s;});
    return sock;
  }catch(e){try{sock?.close();}catch{};sock=await wFirst(await fb(),fp);r2w(sock,sv,vh,null);return sock;}
}

async function r2w(rs,sv,vh,retryFn){
let header=vh,got=false;
const retry=async(e)=>{
  if(!got&&retryFn&&sv.readyState===WS_OPEN)try{await retryFn();return 1;}catch(er){if(!isClosedError(er))log('[retry error]',er);}
  return 0;
};
try{
  await rs.readable.pipeTo(new WritableStream({
    write(ch){
      got=true;
      const u=ensureU8(ch);if(!u.length)return;
      if(sv.readyState!==WS_OPEN)throw new Error('websocket not open');
      if(header){const m=new Uint8Array(header.length+u.length);m.set(header);m.set(u,header.length);sv.send(m);header=null;}
      else sv.send(u);
    },
    async close(){if(!(await retry()))safeClose(sv);},
    async abort(e){if(!(await retry(e)))safeClose(sv);}
  }));
}catch(e){
  if(!(await retry(e))){if(!isClosedError(e))log('[r2w pipe error]',e);safeClose(sv);}
}
}

async function httpConn(h,pt,cfg){
const s=c({hostname:cfg.h,port:cfg.pt});await s.opened;
const hh=h.includes(':')?`[${h}]`:h;
const auth=cfg.u&&cfg.p?`Proxy-Authorization: Basic ${btoa(`${cfg.u}:${cfg.p}`)}\r\n`:'';
const req=`CONNECT ${hh}:${pt} HTTP/1.1\r\nHost: ${hh}:${pt}\r\n${auth}Connection: Keep-Alive\r\n\r\n`;
const w=s.writable.getWriter();await w.write(TE.encode(req));w.releaseLock();
const r=s.readable.getReader();let buf=EMPTY_U8;
while(true){
  const {value,done}=await r.read();
  if(done)throw new Error('http proxy closed');
  const v=ensureU8(value);
  const nb=new Uint8Array(buf.length+v.length);nb.set(buf);nb.set(v,buf.length);buf=nb;
  const txt=TD.decode(buf);
  if(txt.includes('\r\n\r\n')){
    if(!txt.startsWith('HTTP/1.1 200')&&!txt.startsWith('HTTP/1.0 200'))throw new Error('http connect failed');
    r.releaseLock();return s;
  }
}
}

async function s5conn(h,pt,cfg){
const s=c({hostname:cfg.h,port:cfg.pt});let sw=null,sr=null;
try{
  await s.opened;sw=s.writable.getWriter();sr=s.readable.getReader();
  await sw.write(new Uint8Array([5,2,0,2]));
  let r=await sr.read();if(!r?.value||r.done)throw new Error('s5 no auth response');
  if(r.value[1]===2){
    if(!cfg.u||!cfg.p)throw new Error('auth required');
    const uE=TE.encode(cfg.u),pE=TE.encode(cfg.p);
    await sw.write(new Uint8Array([1,uE.length,...uE,pE.length,...pE]));
    r=await sr.read();if(!r?.value||r.done)throw new Error('s5 auth no response');
    if(r.value[1]!==0)throw new Error('auth failed');
  }
  const addr=s5Addr(h);
  const req=new Uint8Array(3+addr.length+2);
  req[0]=5;req[1]=1;req[2]=0;req.set(addr,3);req[3+addr.length]=pt>>8;req[4+addr.length]=pt&255;
  await sw.write(req);
  r=await sr.read();if(!r?.value||r.done)throw new Error('s5 conn no response');
  if(r.value[1]!==0)throw new Error('s5 connect failed');
  sr.releaseLock();sw.releaseLock();
  return s;
}catch(e){
  try{sr?.releaseLock();}catch{};try{sw?.releaseLock();}catch{};try{s?.close();}catch{};
  throw e;
}
}

async function hUDP(sv,vh){
let sent=false,cache=EMPTY_U8;
const ts=new TransformStream({
  transform(chunk,ctl){
    let d=ensureU8(chunk);
    if(cache.length){const m=new Uint8Array(cache.length+d.length);m.set(cache);m.set(d,cache.length);d=m;cache=EMPTY_U8;}
    for(let i=0;i+2<=d.length;){
      const l=(d[i]<<8)|d[i+1];
      if(i+2+l>d.length){cache=d.slice(i);break;}
      ctl.enqueue(d.slice(i+2,i+2+l));
      i+=2+l;
    }
    if(cache.length>4096)cache=EMPTY_U8;
  }
});
ts.readable.pipeTo(new WritableStream({
  async write(udp){
    try{
      const resp=await fetch('https://1.1.1.1/dns-query',{method:'POST',headers:{'content-type':'application/dns-message'},body:udp});
      const res=new Uint8Array(await resp.arrayBuffer());
      const len=new Uint8Array([res.length>>8,res.length&255]);
      if(!sent){
        const m=new Uint8Array(vh.length+2+res.length);
        m.set(vh);m.set(len,vh.length);m.set(res,vh.length+2);sv.send(m);sent=true;
      }else{
        const m=new Uint8Array(2+res.length);
        m.set(len);m.set(res,2);sv.send(m);
      }
    }catch(e){if(!isClosedError(e))log('[dns query error]',e);}
  }
})).catch(e=>{if(!isClosedError(e))log('[dns udp error]',e);});
return ts.writable.getWriter();
}

function pVH(b){
if(!b||b.byteLength<24)return{err:1,msg:'invalid header length'};
const d=new Uint8Array(b),v=d[0];
for(let i=0;i<16;i++){if(d[1+i]!==UB[i]){log('[uuid mismatch] expected',UB,'got',d.slice(1,17));return{err:1,msg:'uuid mismatch'};}}
const ol=d[17];
if(18+ol>=b.byteLength)return{err:1,msg:'invalid opt len'};
const cmd=d[18+ol];
if(cmd!==1&&cmd!==2)return{err:1,msg:'invalid cmd'};
const udp=cmd===2,pi=18+ol+1,pr=new DataView(b,pi,2).getUint16(0);let ai=pi+2,ar='',at=d[ai++];
if(at===1){ar=Array.from(d.slice(ai,ai+4)).join('.');ai+=4;}
else if(at===2){const al=d[ai++];ar=TD.decode(b.slice(ai,ai+al));ai+=al;}
else if(at===3){const dv=new DataView(b,ai,16),sg=[];for(let i=0;i<8;i++)sg.push(dv.getUint16(i*2).toString(16));ar=sg.join(':');ai+=16;}
else return{err:1,msg:'invalid atyp'};
return{err:0,ar,pr,ri:ai,vv:new Uint8Array([v]),udp};
}

function pS5(s){
const isHttp=/^https?:\/\//i.test(s);
s=s.replace(/^(socks5?|https?):\/\//i,'');
const at=s.includes('@')?s.lastIndexOf('@'):-1,hp=at!==-1?s.slice(at+1):s;const[h,pt]=parseHostPort(hp);
if(at===-1)return{u:'',p:'',h,pt,isHttp};
const up=s.slice(0,at),ci=up.indexOf(':');
if(ci===-1)return{u:'',p:'',h,pt,isHttp};
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
c.error(er);
}else if(ed){
c.enqueue(ed);
}
},
cancel(){closed=true;safeClose(ws);}
});
}
