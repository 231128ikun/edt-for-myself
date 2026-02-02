/*
  订阅链接: https://<域名>/<uid>?sub=<订阅器域名>
  节点格式: vless://@<IP>:<端口>?encryption=none&security=tls&sni=<域名>&type=ws&host=<域名>&path=/?ed=2560#<备注>
  路径参数: /?p=1.2.3.4:443&s5=socks5://user:pass@host:port&gs5=1
  连接逻辑: 直连 -> socks5(可选) -> proxyip(fallback) | 全局模式: 所有流量经socks5
*/
import{connect as C}from'cloudflare:sockets';

const V='3.0.2';
const U='aaa6b096-1165-4bbe-935c-99f4ec902d02';
const P='sjc.o00o.ooo:443';
const S5='';
const GS5=false;
const SUB='sub.glimmer.hidns.vip';
const UID='ikun';
const TO=12000;
const CACHE_TTL=300000;
const CACHE_MAX_SIZE=100;

const WS_OPEN=1,E8=new Uint8Array(0),TE=new TextEncoder(),TD=new TextDecoder();
const UB=Uint8Array.from(U.replace(/-/g,'').match(/.{2}/g).map(x=>parseInt(x,16)));
const RE={P:/p=([^&]*)/,S5:/s5=([^&]*)/,GS5:/gs5=([^&]*)/};
const TC=new Map();

if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(U))throw new Error('Invalid UUID');

export default{async fetch(r){
  try{
    const u=new URL(r.url);
    if(UID&&u.pathname==='/'+UID){
      const s=u.searchParams.get('sub')||SUB;
      return s?Response.redirect(`https://${s}/sub?uuid=${U}&host=${u.hostname}`,302):new Response('Missing sub param',{status:400});
    }
    if(r.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('OK',{status:200});
    const tp=u.pathname+u.search,px=tp.match(RE.P)?.[1]||P,s5=tp.match(RE.S5)?.[1]||S5;
    const gm=tp.match(RE.GS5),gs5=gm?(gm[1]==='1'||gm[1]?.toLowerCase()==='true'):GS5;
    return handleWS(r,px,s5,gs5);
  }catch(e){return new Response('Error: '+(e?.message||'unknown'),{status:502});}
}};

const close=o=>{try{o?.close?.()}catch{}};
const race=(p,ms)=>Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),ms))]);
const u8=x=>x instanceof Uint8Array?x:x instanceof ArrayBuffer?new Uint8Array(x):ArrayBuffer.isView(x)?new Uint8Array(x.buffer,x.byteOffset,x.byteLength):E8;
const b64=b=>{if(!b)return null;try{let s=b.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}catch{return null;}};
const parseHP=(s,d=443)=>{if(!s)return[null,d];s=String(s).trim();if(s[0]==='['){const j=s.indexOf(']');if(j>0)return[s.slice(1,j),s[j+1]===':'?Number(s.slice(j+2))||d:d];}const i=s.lastIndexOf(':');return i>0&&s.indexOf(':')==i?[s.slice(0,i),Number(s.slice(i+1))||d]:[s,d];};
const isV4=h=>/^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(h);
const v6Bytes=s=>{if(!s||s.includes('.'))return null;const p=s.split('::');if(p.length>2)return null;const a=p[0]?p[0].split(':').filter(Boolean):[],b=p[1]?p[1].split(':').filter(Boolean):[],f=8-a.length-b.length;if(f<0)return null;const full=[...a,...Array(f).fill('0'),...b];if(full.length!==8)return null;const o=new Uint8Array(16);for(let i=0;i<8;i++){const v=parseInt(full[i],16);if(!(v>=0&&v<=0xffff))return null;o[i*2]=v>>8;o[i*2+1]=v&255;}return o;};
const s5Addr=h=>{if(isV4(h))return new Uint8Array([1,...h.split('.').map(Number)]);const v6=v6Bytes(h);if(v6){const o=new Uint8Array(17);o[0]=4;o.set(v6,1);return o;}const d=TE.encode(h);if(d.length>255)throw new Error('Domain too long');const o=new Uint8Array(2+d.length);o[0]=3;o[1]=d.length;o.set(d,2);return o;};
const rand=a=>a[Math.floor(Math.random()*a.length)];

function cleanCache(){if(TC.size<=CACHE_MAX_SIZE)return;const entries=[...TC.entries()].sort((a,b)=>a[1].exp-b[1].exp);const toDelete=entries.slice(0,TC.size-CACHE_MAX_SIZE);toDelete.forEach(([key])=>TC.delete(key));}

async function queryTXT(d){
  try{const r=await race(fetch(`https://1.1.1.1/dns-query?name=${encodeURIComponent(d)}&type=TXT`,{headers:{accept:'application/dns-json'}}),TO);if(!r.ok)return null;const j=await r.json();return j.Answer?.filter(x=>x.type===16).map(x=>x.data)||[];}catch{return null;}
}

async function parseTXT(d){
  const cached=TC.get(d);if(cached&&Date.now()<cached.exp)return cached.v;
  const recs=await queryTXT(d);if(!recs?.length)return null;let data=recs[0];
  if(data.startsWith('"')&&data.endsWith('"'))data=data.slice(1,-1);
  const list=data.replace(/\\010/g,',').replace(/\n/g,',').split(',').map(s=>s.trim()).filter(Boolean);
  const parsed=list.map(s=>{const[h,p]=parseHP(s,443);return h?{h,p}:null;}).filter(Boolean);
  if(!parsed.length)return null;
  TC.set(d,{v:parsed,exp:Date.now()+CACHE_TTL});cleanCache();
  return parsed;
}

async function handleWS(r,px,s5,gs5){
  const[client,server]=Object.values(new WebSocketPair());server.accept();
  const eh=r.headers.get('sec-websocket-protocol')||'',rs=makeRS(server,eh);
  let remote=null,dnsW=null,dns=false,busy=false;
  const clean=()=>{dnsW=null;dns=false;close(remote);close(server);};
  rs.pipeTo(new WritableStream({
    async write(ch){
      try{
        const d=u8(ch);if(!d.length)return;
        if(dns&&dnsW){await dnsW(d);return;}
        if(remote){const w=remote.writable.getWriter();try{await w.write(d);}finally{w.releaseLock();}return;}
        if(busy)return;busy=true;
        const p=parseVless(d.buffer);if(!p)return clean();
        const{addr,port,idx,ver,isUDP}=p,vh=new Uint8Array([ver,0]),payload=d.slice(idx);
        if(isUDP){if(port!==53)return clean();dns=true;const h=await handleUDP(server,vh);dnsW=h.write.bind(h);if(payload.length)await dnsW(payload);return;}
        try{remote=await handleTCP(addr,port,payload,server,vh,px,s5,gs5);}catch{clean();}
      }catch{clean();}
    },close(){clean();},abort(){clean();}
  })).catch(()=>clean());
  return new Response(null,{status:101,webSocket:client});
}

async function dial(h,p){const s=C({hostname:h,port:p});await race(s.opened,TO);return s;}
async function writeFirst(s,data){if(data?.length){const w=s.writable.getWriter();try{await w.write(data);}finally{w.releaseLock();}}return s;}

function pickFallback(addr,port,px,s5cfg){
  if(s5cfg)return()=>s5cfg.isHttp?httpConn(addr,port,s5cfg):s5Conn(addr,port,s5cfg);
  if(px&&/^txt@/i.test(px)){return async()=>{const d=px.slice(4),list=await parseTXT(d);if(list?.length){const sel=rand(list);return dial(sel.h,sel.p);}const[ph,pp]=parseHP(d,port);return dial(ph,pp);};}
  return()=>{const[ph,pp]=parseHP(px,port);return dial(ph,pp);};
}

async function handleTCP(addr,port,data,ws,vh,px,s5,gs5){
  const s5cfg=s5?parseS5(s5):null,fb=pickFallback(addr,port,px,s5cfg);let sock=null;
  try{
    if(gs5&&s5cfg){sock=await writeFirst(await fb(),data);relay(sock,ws,vh,null);return sock;}
    sock=await writeFirst(await dial(addr,port),data);
    relay(sock,ws,vh,async()=>{try{sock?.close();}catch{};const s=await writeFirst(await fb(),data);relay(s,ws,vh,null);return s;});
    return sock;
  }catch{try{sock?.close();}catch{};sock=await writeFirst(await fb(),data);relay(sock,ws,vh,null);return sock;}
}

async function relay(rs,ws,vh,retryFn){
  let hdr=vh,got=false;
  const retry=async()=>{if(!got&&retryFn&&ws.readyState===WS_OPEN){try{await retryFn();return 1;}catch{}}return 0;};
  try{
    await rs.readable.pipeTo(new WritableStream({
      write(ch){got=true;const d=u8(ch);if(!d.length)return;if(ws.readyState!==WS_OPEN)throw new Error('ws closed');if(hdr){const m=new Uint8Array(hdr.length+d.length);m.set(hdr);m.set(d,hdr.length);ws.send(m);hdr=null;}else ws.send(d);},
      async close(){if(!await retry())close(ws);},async abort(){if(!await retry())close(ws);}
    }));
  }catch{if(!await retry())close(ws);}
}

async function httpConn(h,pt,cfg){
  const s=C({hostname:cfg.h,port:cfg.pt});await race(s.opened,TO);
  const hh=h.includes(':')?`[${h}]`:h,auth=cfg.u&&cfg.p?`Proxy-Authorization: Basic ${btoa(cfg.u+':'+cfg.p)}\r\n`:'';
  const req=`CONNECT ${hh}:${pt} HTTP/1.1\r\nHost: ${hh}:${pt}\r\n${auth}Connection: Keep-Alive\r\n\r\n`;
  const w=s.writable.getWriter();await w.write(TE.encode(req));w.releaseLock();
  const r=s.readable.getReader();let buf=E8;const start=Date.now();
  while(Date.now()-start<TO){const{value,done}=await r.read();if(done)throw new Error('Proxy closed');const v=u8(value),nb=new Uint8Array(buf.length+v.length);nb.set(buf);nb.set(v,buf.length);buf=nb;const txt=TD.decode(buf);if(txt.includes('\r\n\r\n')){if(!txt.startsWith('HTTP/1.1 200')&&!txt.startsWith('HTTP/1.0 200'))throw new Error('Connect failed');r.releaseLock();return s;}}
  throw new Error('Timeout');
}

async function s5Conn(h,pt,cfg){
  const s=C({hostname:cfg.h,port:cfg.pt});let sw=null,sr=null;
  try{
    await race(s.opened,TO);sw=s.writable.getWriter();sr=s.readable.getReader();
    await sw.write(new Uint8Array([5,2,0,2]));let r=await race(sr.read(),TO);
    if(!r?.value||r.done)throw new Error('No auth response');
    if(r.value[1]===0xFF)throw new Error('No acceptable auth method');
    if(r.value[1]===2){if(!cfg.u||!cfg.p)throw new Error('Auth required');const uE=TE.encode(cfg.u),pE=TE.encode(cfg.p);await sw.write(new Uint8Array([1,uE.length,...uE,pE.length,...pE]));r=await race(sr.read(),TO);if(!r?.value||r.done||r.value[1]!==0)throw new Error('Auth failed');}
    const addr=s5Addr(h),req=new Uint8Array(3+addr.length+2);req[0]=5;req[1]=1;req[2]=0;req.set(addr,3);req[3+addr.length]=pt>>8;req[4+addr.length]=pt&255;await sw.write(req);
    r=await race(sr.read(),TO);if(!r?.value||r.done||r.value[1]!==0)throw new Error('Connect failed');
    sr.releaseLock();sw.releaseLock();return s;
  }catch(e){try{sr?.releaseLock();}catch{};try{sw?.releaseLock();}catch{};close(s);throw e;}
}

async function handleUDP(ws,vh){
  let sent=false,cache=E8;
  const ts=new TransformStream({transform(chunk,ctl){let d=u8(chunk);if(cache.length){const m=new Uint8Array(cache.length+d.length);m.set(cache);m.set(d,cache.length);d=m;cache=E8;}for(let i=0;i+2<=d.length;){const l=(d[i]<<8)|d[i+1];if(i+2+l>d.length){cache=d.slice(i);break;}ctl.enqueue(d.slice(i+2,i+2+l));i+=2+l;}if(cache.length>4096)cache=E8;}});
  ts.readable.pipeTo(new WritableStream({async write(udp){try{const ac=new AbortController(),tid=setTimeout(()=>ac.abort(),TO);const resp=await fetch('https://1.1.1.1/dns-query',{method:'POST',headers:{'content-type':'application/dns-message'},body:udp,signal:ac.signal});clearTimeout(tid);const res=new Uint8Array(await resp.arrayBuffer()),len=new Uint8Array([res.length>>8,res.length&255]);if(!sent){const m=new Uint8Array(vh.length+2+res.length);m.set(vh);m.set(len,vh.length);m.set(res,vh.length+2);ws.send(m);sent=true;}else{const m=new Uint8Array(2+res.length);m.set(len);m.set(res,2);ws.send(m);}}catch{}}})).catch(()=>{});
  return ts.writable.getWriter();
}

function parseVless(b){
  if(!b||b.byteLength<24)return null;const d=new Uint8Array(b),ver=d[0];
  for(let i=0;i<16;i++)if(d[1+i]!==UB[i])return null;
  const optLen=d[17];if(18+optLen>=b.byteLength)return null;
  const cmd=d[18+optLen];if(cmd!==1&&cmd!==2)return null;const isUDP=cmd===2;
  const portIdx=19+optLen;if(portIdx+2>b.byteLength)return null;
  const port=new DataView(b,portIdx,2).getUint16(0);let addrIdx=portIdx+2;if(addrIdx>=b.byteLength)return null;
  let addr='';const atyp=d[addrIdx++];
  if(atyp===1){if(addrIdx+4>b.byteLength)return null;addr=d.slice(addrIdx,addrIdx+4).join('.');addrIdx+=4;}
  else if(atyp===2){if(addrIdx>=b.byteLength)return null;const len=d[addrIdx++];if(len>253||addrIdx+len>b.byteLength)return null;addr=TD.decode(b.slice(addrIdx,addrIdx+len));addrIdx+=len;}
  else if(atyp===3){if(addrIdx+16>b.byteLength)return null;const dv=new DataView(b,addrIdx,16),segs=[];for(let i=0;i<8;i++)segs.push(dv.getUint16(i*2).toString(16));addr=segs.join(':');addrIdx+=16;}
  else return null;
  return{addr,port,idx:addrIdx,ver,isUDP};
}

function parseS5(s){
  const isHttp=/^https?:\/\//i.test(s);s=s.replace(/^(socks5?|https?):\/\//i,'');
  const at=s.lastIndexOf('@'),hp=at!==-1?s.slice(at+1):s,[h,pt]=parseHP(hp);
  if(at===-1)return{u:'',p:'',h,pt,isHttp};
  const up=s.slice(0,at),ci=up.indexOf(':');
  return ci===-1?{u:'',p:'',h,pt,isHttp}:{u:up.slice(0,ci),p:up.slice(ci+1),h,pt,isHttp};
}

function makeRS(ws,eh){
  let closed=false;
  return new ReadableStream({
    start(c){ws.addEventListener('message',e=>{if(!closed)c.enqueue(e.data);});ws.addEventListener('close',()=>{if(!closed){closed=true;try{c.close();}catch{}}});ws.addEventListener('error',e=>{try{c.error(e);}catch{}});const d=b64(eh);if(d)c.enqueue(d);},
    cancel(){closed=true;close(ws);}
  });
}