/*
 本项目仅作为学习使用，请勿用于非法用途。
*/
const V='3.1.8-graintcp';
const U='aaa6b096-1165-4bbe-935c-99f4ec902d02';
const P='txt@kr.william.dwb.cc.cd';
const S5='';
const GS5=false;
const D=false;
const SUB='sub.glimmer.hidns.vip';
const UID='ikun';
const K={to:6000,ui:5000,ed:8*1024,up:20*1024,dq:4,rd:64*1024,dp:32*1024,dl:512,tc:64,ct:60*60*1000};

if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(U))throw new Error('Invalid UUID');

const z=new Uint8Array(0),te=new TextEncoder(),td=new TextDecoder(),ub=new Uint8Array(16);
for(let i=0,p=0,c,h;i<16;i++){c=U.charCodeAt(p++);if(c===45)c=U.charCodeAt(p++);h=(c>64?c+9:c)&15;c=U.charCodeAt(p++);if(c===45)c=U.charCodeAt(p++);ub[i]=h<<4|((c>64?c+9:c)&15)}
const tc=new Map(),tp=new Map();
const mU=d=>{for(let i=0;i<16;i++)if(d[i+1]!==ub[i])return false;return true};

export default{async fetch(r){
  try{
    const u=new URL(r.url);
    if(UID&&u.pathname==='/'+UID){
      const s=u.searchParams.get('sub')||SUB;
      return s?Response.redirect(`https://${s}/sub?uuid=${U}&host=${u.hostname}`,302):new Response('Missing sub param',{status:400});
    }
    if(r.headers.get('Upgrade')?.toLowerCase()!=='websocket')return u.pathname==='/'?new Response(`mini v${V}`,{status:200}):new Response(null,{status:404});
    const px=qP(u,'p')||P,s5=qP(u,'s5')||S5,gs5=qP(u,'gs5');
    return ws(r,px,s5,gs5===null||gs5===''?GS5:/^(1|true|on|yes)$/i.test(gs5.trim()));
  }catch(e){return new Response(D?'Error: '+(e?.message||'unknown'):'Error',{status:502})}
}};

const race=(p,ms=K.to)=>{let t;return Promise.race([p,new Promise((_,r)=>{t=setTimeout(()=>{Promise.resolve(p).catch(()=>{});r(new Error('timeout'))},ms)})]).finally(()=>clearTimeout(t))};
const u8=x=>x instanceof Uint8Array?x:x instanceof ArrayBuffer?new Uint8Array(x):ArrayBuffer.isView(x)?new Uint8Array(x.buffer,x.byteOffset,x.byteLength):z;
const b64=s=>{if(!s)return null;try{let x=s.replace(/-/g,'+').replace(/_/g,'/');x=x.padEnd(Math.ceil(x.length/4)*4,'=');return Uint8Array.from(atob(x),c=>c.charCodeAt(0))}catch{return null}};
const cat=(...a)=>{const l=a.map(u8),o=new Uint8Array(l.reduce((n,x)=>n+x.length,0));let p=0;for(const x of l){o.set(x,p);p+=x.length}return o};
const dbg=(s,x='')=>{if(D)console.log(`${s}${x?' '+x:''}`)};
const dbe=(s,e)=>{if(D)console.error(s,e?.stack||e?.message||e||'')};
const eM=e=>e?.errors?.[0]?.message||e?.message||e||'failed';
const quiet=e=>/cancel|closed|aborted|network connection lost/i.test(e?.message||e||'');
const rel=x=>{try{x?.releaseLock?.()}catch{}};
const closeAll=async(...a)=>{
  const p=[],add=x=>{
    if(!x)return;if(x.sock||x.w||x.r)return add(x.r),add(x.w),add(x.sock);
    const f=x.cancel?()=>x.cancel('closed'):x.abort?()=>x.abort('closed'):()=>x.close?.();
    p.push(Promise.resolve().then(f).catch(()=>{}).finally(()=>rel(x)));
  };
  a.forEach(add);await Promise.allSettled(p);
};
const qP=(u,k)=>{
  const segs=[...u.pathname.slice(1).split(/[&/]/),...(u.search?u.search.slice(1).split('&'):[])];
  for(const p of segs){
    if(!p)continue;
    let i=p.indexOf('='),n=1,j=p.search(/%3[Dd]/);
    if(j>-1&&(i<0||j<i)){i=j;n=3}
    const a=i<0?p:p.slice(0,i),v=i<0?'':p.slice(i+n);
    try{if(decodeURIComponent(a)===k)return decodeURIComponent(v)}catch{if(a===k)return v}
  }
  return null;
};

const pH=(s,d=443)=>{
  if(!s)return[null,d];s=String(s).trim();
  if(s[0]==='['){const i=s.indexOf(']');if(i>0)return[s.slice(1,i),s[i+1]===':'?Number(s.slice(i+2)):d]}
  const i=s.lastIndexOf(':');return i>0&&s.indexOf(':')===i?[s.slice(0,i),Number(s.slice(i+1))]:[s,d];
};

const iV=h=>/^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(h);
const v6=s=>{
  if(!s||s.includes('.'))return null;const p=s.split('::');if(p.length>2)return null;
  const a=p[0]?p[0].split(':'):[],b=p.length===2&&p[1]?p[1].split(':'):[],n=p.length===2?8-a.length-b.length:0;
  if(p.length===1&&a.length!==8)return null;if(p.length===2&&n<1)return null;
  const f=[...a,...Array(n).fill('0'),...b];if(f.length!==8)return null;
  const o=new Uint8Array(16);for(let i=0;i<8;i++){if(!/^[0-9a-f]{1,4}$/i.test(f[i]))return null;const x=parseInt(f[i],16);o[i*2]=x>>8;o[i*2+1]=x&255}
  return o;
};
const bV6=(b,o)=>{const d=new DataView(b,o,16),a=[];for(let i=0;i<8;i++)a.push(d.getUint16(i*2).toString(16));return a.join(':')};
const sA=h=>{if(iV(h))return new Uint8Array([1,...h.split('.').map(Number)]);const x=v6(h);if(x){const o=new Uint8Array(17);o[0]=4;o.set(x,1);return o}const d=te.encode(h);if(d.length>255)throw new Error('Domain too long');const o=new Uint8Array(2+d.length);o[0]=3;o[1]=d.length;o.set(d,2);return o};

function mkK(c,cp=0){
  let q=[],h=0,b=0,buf=null;
  const e=()=>h>=q.length,trim=()=>{if(h>32&&h*2>=q.length){q=q.slice(h);h=0}},clear=()=>{q=[];h=0;b=0};
  const take=()=>{if(e())return null;const d=q[h];q[h++]=undefined;b-=d.byteLength;trim();return d};
  const pu=d=>{const n=d?.byteLength||0;return!n||(q.push(d),b+=n,1)};
  const pack=d=>{d=d||take();if(!d||e())return[d,0];let n=d.byteLength,j=h;while(j<q.length){const x=q[j],nn=n+x.byteLength;if(nn>c)break;n=nn;j++}if(j===h)return[d,0];const o=buf||=new Uint8Array(c);o.set(d);for(let p=d.byteLength;h<j;){const x=q[h];q[h++]=undefined;b-=x.byteLength;o.set(x,p);p+=x.byteLength}trim();const u=o.subarray(0,n);return[cp?u.slice():u,1]};
  return{e,get b(){return b},get size(){return q.length-h},clear,take,pu,pack};
}
function mkQ(c){
  const k=mkK(c);
  return{get empty(){return k.e()},get size(){return k.size},get bytes(){return k.b},clear:k.clear,push:k.pu,pack:d=>k.pack(d)};
}

function gD(w){
  const c=K.dp,t=K.dl,v=Math.max(4096,t*12),k=mkK(c,1);let s=0,x=0,y=0,f=0;
  const fl=()=>{if(s)clearTimeout(s);s=0;f=0;for(;;){const[u]=k.pack();if(!u)break;w.send(u)}};
  const wt=()=>{if(k.e()||s)return;if(k.b>=c||c-k.b<t)return fl();s=setTimeout(()=>{s=0;if(k.e())return;if(k.b>=c||c-k.b<t)return fl();if(f<K.dq&&(x!==y||k.b<v)){f++;y=x;return wt()}fl()},1)};
  return{
    send(u){let o=0,n=u?.byteLength||0;if(!n)return;while(o<n){const m=Math.min(c-k.b,n-o);if(!m){fl();continue}k.pu(o||m!==n?u.subarray(o,o+m):u);x++;o+=m;if(k.b>=c||c-k.b<t)fl();else wt()}},
    end:fl
  };
}

const tH=s=>/^txt@/i.test(s||'')?String(s).slice(4).trim():'';
const eT=s=>s.replace(/^"|"$/g,'').replace(/"\s*"/g,'').replace(/\\010|\\,|\r?\n/g,',');
const vE=s=>{const[h,p]=pH(s,443);return h&&(iV(h)||/^[a-z0-9.-]+$/i.test(h)||h.includes(':'))&&p>0&&p<65536?{h,p}:null};
async function fTO(u,i,acs){const a=new AbortController(),t=setTimeout(()=>a.abort(),K.to);acs?.add(a);try{return await fetch(u,{...i,signal:a.signal})}finally{clearTimeout(t);acs?.delete(a)}}
async function qT(d){
  try{
    const r=await fTO(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(d)}&type=TXT`,{headers:{accept:'application/dns-json'}});
    if(!r.ok)return null;const j=await r.json();return j.Answer?.filter(x=>x.type===16).map(x=>x.data)||null;
  }catch{return null}
}
async function pT(d){
  const n=Date.now();for(const[k,v]of tc)if(v.exp<=n)tc.delete(k);
  const c=tc.get(d);if(c&&n<c.exp){tc.delete(d);tc.set(d,c);return c.v}
  if(tp.has(d))return tp.get(d);
  const p=(async()=>{const r=await qT(d);if(!r?.length)return null;const v=r.flatMap(x=>eT(x).split(',')).map(x=>x.trim()).filter(Boolean).map(vE).filter(Boolean);if(!v.length)return null;tc.set(d,{v,exp:Date.now()+K.ct});while(tc.size>K.tc)tc.delete(tc.keys().next().value);return v})();
  tp.set(d,p);try{return await p}finally{tp.delete(d)}
}

function ws(r,px,s5,gs5){
  const eh=r.headers.get('sec-websocket-protocol')||'',dc=r.fetcher?.connect?.bind(r.fetcher);if(!dc)throw new Error('connect unavailable');
  let lp='';
  const lg=(a,b='')=>dbg(lp?`${lp} ${a}`:a,b),er=(a,e)=>dbe(lp?`${lp} ${a}`:a,e);
  const[client,w]=Object.values(new WebSocketPair());w.binaryType='arraybuffer';w.accept({allowHalfOpen:true});
  const pd=tH(px);if(pd)pT(pd).catch(e=>{if(!quiet(e))er('txt warmup failed',e)});
  let c=null,dw=null,closed=false,busy=false,hold=false,ut=0;
  const q=mkQ(K.up);
  const setC=(x,p=false)=>{if(closed){void closeAll(x);return 0}c=x;hold=p;if(!hold&&!q.empty)pump();return 1};
  const end=async why=>{
    if(closed)return;if(why!=='client'&&why!=='remote')lg('end',why||'done');if(ut)clearTimeout(ut);ut=0;closed=true;q.clear();hold=false;
    const tdw=dw,tc=c;dw=null;c=null;
    await closeAll(tdw,tc);try{if(w.readyState===WebSocket.OPEN)w.close(1000)}catch(e){if(!quiet(e))er('ws close failed',e)}
  };
  const stop=why=>{end(why).catch(e=>{if(!quiet(e))er('end failed',e)})};
  const add=x=>{const d=u8(x);if(!d.length)return 1;q.push(d);return 1};
  const udpIdle=()=>{if(ut)clearTimeout(ut);ut=setTimeout(()=>stop('udp idle'),K.ui)};
  const open=async d=>{
    const p=pV(d);if(!p)throw new Error('Invalid VLESS request');
    const vh=new Uint8Array([p.ver,0]),[first]=q.pack(d.subarray(p.idx));
    lp=`[${p.addr}:${p.port}--${Math.random()} ${p.isUDP?'udp':'tcp'}]`;
    lg('open',`first=${first?.byteLength||0}`);
    if(p.isUDP){if(p.port!==53)throw new Error('Invalid UDP port');dw=hU(w,vh,udpIdle,lg);if(first?.byteLength)await dw.write(first);return}
    if(w.readyState!==WebSocket.OPEN)throw new Error('ws closed');
    w.send(vh);
    const nc=await cn(dc,p.addr,p.port,first,px,s5,gs5,w,lg);if(!setC(nc))return;rl(nc,w,end,setC,er,lg).catch(e=>{if(!quiet(e))er('rl failed',e);stop('remote error')});
  };
  const pump=async()=>{if(busy||closed)return;busy=true;try{for(;;){if(closed||hold)break;const[d]=q.pack();if(!d)break;if(dw){if(ut)clearTimeout(ut);ut=0;await dw.write(d);continue}if(c?.w){await c.w.write(d);continue}await open(d)}}catch(e){if(!quiet(e))lg('pump error',e?.message||'error');await end('pump')}finally{busy=false;if(!q.empty&&!closed&&!hold)pump()}};
  const ed=eh.length<=K.ed*4/3+4?b64(eh):null;if(ed&&ed.byteLength<=K.ed&&add(ed))pump();
  w.addEventListener('message',e=>{if(!closed&&add(e.data))pump()});w.addEventListener('close',()=>stop('client'));w.addEventListener('error',()=>stop('client error'));
  return new Response(null,{status:101,webSocket:client,headers:{'Sec-WebSocket-Extensions':''}});
}

async function cn(dc,addr,port,data,px,s5,gs5,w,lg){
  data=data||z;
  const cfg=s5?pS(s5):null,fb=()=>cfg?cfg.isHttp?hC(dc,addr,port,cfg):sC(dc,addr,port,cfg):pC(dc,px,port,lg);
  const use=async c=>{try{if(w.readyState!==WebSocket.OPEN)throw new Error('closed');c.w||=c.sock.writable.getWriter();if(data.length)await c.w.write(data);return c}catch(e){await closeAll(c);throw e}};
  const useFb=async()=>{try{if(cfg)lg('fallback proxy',`${cfg.h}:${cfg.pt}`);return await use(await fb())}catch(e){if(cfg)lg('proxy failed',`${cfg.h}:${cfg.pt} ${eM(e)}`);throw e}};
  if(gs5&&cfg)return useFb();
  try{const c=await use(await dC(dc,addr,port));c.retry=useFb;return c}catch(e){if(w.readyState!==WebSocket.OPEN)throw e;lg('direct failed',`${addr}:${port} ${eM(e)}`);return useFb()}
}

async function dC(dc,h,p){
  const sock=dc({hostname:h,port:p});
  try{
    await race(sock.opened);
    return{sock}
  }catch(e){
    await closeAll(sock);
    throw e
  }
}
async function pC(dc,px,port,lg){
  const d=tH(px);
  const dP=(h,p)=>{lg('fallback proxy',`${h}:${p}`);return dC(dc,h,p).catch(e=>{lg('proxy failed',`${h}:${p} ${eM(e)}`);throw e})};
  if(d){const l=await pT(d);if(l?.length){const x=l[Math.floor(Math.random()*l.length)];return dP(x.h,x.p)}const[h,p]=pH(d,port);lg('txt fallback',`${h}:${p}`);return dP(h,p)}
  const[h,p]=pH(px,port);return dP(h,p);
}
async function rl(c,w,end,setC,er,lg){
  const tx=gD(w);let has=false,b=new ArrayBuffer(K.rd),r=null;
  for(;;){
    let err=null;
    has=false;r=null;
    try{
      if(c.tail?.length){has=true;tx.send(c.tail);c.tail=z}
      r=c.sock.readable.getReader({mode:'byob'});c.r=r;
      for(;;){
        const{done,value}=await r.read(new Uint8Array(b,0,K.rd));if(done)break;
        const d=u8(value);if(!d.length)continue;has=true;
        if(d.byteLength>=K.rd>>1){tx.end();w.send(d);b=new ArrayBuffer(K.rd)}
        else{tx.send(d.slice());b=d.buffer}
      }
      tx.end();
    }catch(e){err=e;try{tx.end()}catch{}}finally{if(c.r===r)c.r=null;await closeAll(r)}
    if(!has&&c.retry&&w.readyState===WebSocket.OPEN){
      lg('retry fallback','no remote data');
      const old=c;if(!setC(null,true)){await closeAll(old);return}await closeAll(old);
      try{c=await old.retry();if(!setC(c))return;continue}catch(e){err=e}
    }
    if(err&&!quiet(err))er('remoteSocketToWS has exception',err);
    await end('remote');return;
  }
}

async function hC(dc,h,pt,c){
  const x=await dC(dc,c.h,c.pt);let r=null;
  try{
    const hh=h.includes(':')?`[${h}]`:h,auth=c.u&&c.p?`Proxy-Authorization: Basic ${btoa(c.u+':'+c.p)}\r\n`:'';
    x.w=x.sock.writable.getWriter();await x.w.write(te.encode(`CONNECT ${hh}:${pt} HTTP/1.1\r\nHost: ${hh}:${pt}\r\n${auth}Connection: Keep-Alive\r\n\r\n`));
    r=x.sock.readable.getReader();let b=z;
    for(;;){const{value,done}=await race(r.read());if(done)throw new Error('Proxy closed');b=b.length?cat(b,value):u8(value);let i=0;for(;i+3<b.length&&!(b[i]===13&&b[i+1]===10&&b[i+2]===13&&b[i+3]===10);i++);if(i+3>=b.length)continue;const t=td.decode(b.slice(0,i+4));if(!t.startsWith('HTTP/1.1 200')&&!t.startsWith('HTTP/1.0 200'))throw new Error('Connect failed');const tail=b.slice(i+4);if(tail.length)x.tail=tail;rel(r);return x}
  }catch(e){await closeAll(r,x);throw e}
}

async function sC(dc,h,pt,c){
  const x=await dC(dc,c.h,c.pt);let r=null;
  try{
    x.w=x.sock.writable.getWriter();r=x.sock.readable.getReader();
    await x.w.write(new Uint8Array([5,2,0,2]));let b=z,head;[head,b]=await rN(r,b,2);
    if(head[1]===0xff)throw new Error('No acceptable auth method');
    if(head[1]===2){if(!c.u||!c.p)throw new Error('Auth required');const u=te.encode(c.u),p=te.encode(c.p);await x.w.write(new Uint8Array([1,u.length,...u,p.length,...p]));[head,b]=await rN(r,b,2);if(head[1]!==0)throw new Error('Auth failed')}
    const a=sA(h),req=new Uint8Array(5+a.length);req[0]=5;req[1]=1;req[2]=0;req.set(a,3);req[3+a.length]=pt>>8;req[4+a.length]=pt&255;await x.w.write(req);
    [head,b]=await rN(r,b,4);if(head[1]!==0)throw new Error('Connect failed');
    if(head[3]===1)[,b]=await rN(r,b,6);else if(head[3]===4)[,b]=await rN(r,b,18);else if(head[3]===3){let l;[l,b]=await rN(r,b,1);[,b]=await rN(r,b,l[0]+2)}else throw new Error('Invalid atyp');
    if(b.length)x.tail=b;rel(r);return x;
  }catch(e){await closeAll(r,x);throw e}
}

async function rN(r,b,n){while(b.length<n){const{value,done}=await race(r.read());if(done)throw new Error('Proxy closed');b=b.length?cat(b,value):u8(value)}return[b.slice(0,n),b.slice(n)]}
function hU(w,vh,done,lg){
  let sent=false,cache=z,closed=false;
  const acs=new Set();
  const send=async q=>{
    if(closed)return;
    try{const r=await fTO('https://cloudflare-dns.com/dns-query',{method:'POST',headers:{'content-type':'application/dns-message'},body:q},acs);if(!r.ok){lg('udp doh status',String(r.status));return}const d=new Uint8Array(await r.arrayBuffer()),l=new Uint8Array([d.length>>8,d.length&255]);if(closed||w.readyState!==WebSocket.OPEN)return;w.send(sent?cat(l,d):cat(vh,l,d));sent=true;done?.()}catch(e){if(!closed&&!quiet(e))lg('udp doh error',e?.message||'error')}
  };
  const close=()=>{closed=true;cache=z;for(const a of acs)a.abort();acs.clear()};
  return{write:async ch=>{
    if(closed)return;
    let d=u8(ch),i=0;if(cache.length){d=cat(cache,d);cache=z}
    for(;i+2<=d.length;){const l=(d[i]<<8)|d[i+1];if(i+2+l>d.length)break;await send(d.slice(i+2,i+2+l));i+=2+l}
    if(i<d.length)cache=d.slice(i);
    if(cache.length>4096)cache=z;
  },close,abort:close};
}

function pV(d){
  d=u8(d);const n=d.byteLength;if(n<24)return null;
  const ver=d[0];
  if(!mU(d))return null;
  const ci=18+d[17];if(ci+4>n)return null;const cmd=d[ci];if(cmd!==1&&cmd!==2)return null;
  const port=(d[ci+1]<<8)|d[ci+2];let ai=ci+3,addr='';const at=d[ai++];
  if(at===1){if(ai+4>n)return null;addr=d.slice(ai,ai+4).join('.');ai+=4}
  else if(at===2){if(ai>=n)return null;const l=d[ai++];if(!l||ai+l>n)return null;addr=td.decode(d.slice(ai,ai+l));ai+=l}
  else if(at===3){if(ai+16>n)return null;addr=bV6(d.buffer,d.byteOffset+ai);ai+=16}
  else return null;
  return{addr,port,idx:ai,ver,isUDP:cmd===2};
}

function pS(s){
  const isHttp=/^http:\/\//i.test(s);s=s.replace(/^(socks5?|http):\/\//i,'');
  const at=s.lastIndexOf('@'),hp=at!==-1?s.slice(at+1):s,[h,pt]=pH(hp);
  const up=at!==-1?s.slice(0,at):'',i=up.indexOf(':');
  return{u:i<0?'':up.slice(0,i),p:i<0?'':up.slice(i+1),h,pt,isHttp};
}
