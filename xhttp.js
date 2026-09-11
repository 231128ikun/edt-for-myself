/*
 本项目仅作为学习使用，请勿用于非法用途。
*/
const V='3.1.8-xhttp';
const U='aaa6b096-1165-4bbe-935c-99f4ec902d02';
const P='txt@kr.william.dwb.cc.cd';
const S5='';
const GS5=false;
const D=false;
const K={to:6000,ui:5000,tc:64,ct:60*60*1000};

if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(U))throw new Error('Invalid UUID');

const N0=new Uint8Array(0),TE=new TextEncoder(),TD=new TextDecoder(),UB=Uint8Array.from(U.replace(/-/g,'').match(/../g).map(x=>parseInt(x,16)));
const DOH='https://cloudflare-dns.com/dns-query',CT='application/grpc',XO='application/octet-stream',DM='application/dns-message',DJ='application/dns-json';
const TC=new Map(),TP=new Map();
const isU=d=>UB.every((x,i)=>d[i+1]===x);
const OK=1;
export default{async fetch(r){
  try{
    const u=new URL(r.url);
    if(!isX(r))return u.pathname==='/'?new Response(`mini v${V}`,{status:200}):new Response(null,{status:404});
    const px=qP(u,'p')||P,s5=qP(u,'s5')||S5,gs5=qP(u,'gs5');
    return xH(r,px,s5,gs5===null||gs5===''?GS5:/^(1|true|on|yes)$/i.test(gs5.trim()));
  }catch(e){return new Response(D?'Error: '+(e?.message||'unknown'):'Error',{status:502})}
}};
const isX=r=>r.method==='POST'&&!!r.body&&(r.headers.get('content-type')||'').toLowerCase().startsWith(CT);

const rc=(p,ms=K.to)=>{let t;return Promise.race([p,new Promise((_,r)=>{t=setTimeout(()=>{Promise.resolve(p).catch(()=>{});r(new Error('timeout'))},ms)})]).finally(()=>clearTimeout(t))};
const u8=x=>x instanceof Uint8Array?x:x instanceof ArrayBuffer?new Uint8Array(x):ArrayBuffer.isView(x)?new Uint8Array(x.buffer,x.byteOffset,x.byteLength):N0;
const cat=(...a)=>{const l=a.map(u8),o=new Uint8Array(l.reduce((n,x)=>n+x.length,0));let p=0;for(const x of l){o.set(x,p);p+=x.length}return o};
const log=(s,x='')=>D&&console.log(`${s}${x?' '+x:''}`);
const eM=e=>e?.errors?.[0]?.message||e?.message||e||'failed';
const endE=e=>/cancel|closed|aborted|network connection lost/i.test(e?.message||e||'');
const unl=x=>{try{x?.releaseLock?.()}catch{}};
const cln=async(...a)=>{const p=[],go=x=>{if(!x)return;if(x.sock||x.w||x.r)return go(x.r),go(x.w),go(x.sock);p.push(Promise.resolve().then(()=>x.cancel?x.cancel('closed'):x.abort?x.abort('closed'):x.close?.()).catch(()=>{}).finally(()=>unl(x)))};a.forEach(go);await Promise.allSettled(p)};
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
const is4=h=>/^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(h);
const ip6=s=>{
  if(!s||s.includes('.'))return null;const p=s.split('::');if(p.length>2)return null;
  const a=p[0]?p[0].split(':'):[],b=p.length===2&&p[1]?p[1].split(':'):[],n=p.length===2?8-a.length-b.length:0;
  if(p.length===1&&a.length!==8)return null;if(p.length===2&&n<1)return null;
  const f=[...a,...Array(n).fill('0'),...b];if(f.length!==8)return null;
  const o=new Uint8Array(16);for(let i=0;i<8;i++){if(!/^[0-9a-f]{1,4}$/i.test(f[i]))return null;const x=parseInt(f[i],16);o[i*2]=x>>8;o[i*2+1]=x&255}
  return o;
};
const v6s=(b,o)=>{const d=new DataView(b,o,16),a=[];for(let i=0;i<8;i++)a.push(d.getUint16(i*2).toString(16));return a.join(':')};
const sA=h=>{if(is4(h))return new Uint8Array([1,...h.split('.').map(Number)]);const x=ip6(h);if(x){const o=new Uint8Array(17);o[0]=4;o.set(x,1);return o}const d=TE.encode(h);if(d.length>255)throw new Error('Domain too long');const o=new Uint8Array(2+d.length);o[0]=3;o[1]=d.length;o.set(d,2);return o};
const txtH=s=>/^txt@/i.test(s||'')?String(s).slice(4).trim():'';
const eT=s=>s.replace(/^"|"$/g,'').replace(/"\s*"/g,'').replace(/\\010|\\,|\r?\n/g,',');
const vE=s=>{const[h,p]=pH(s,443);return h&&(is4(h)||/^[a-z0-9.-]+$/i.test(h)||h.includes(':'))&&p>0&&p<65536?{h,p}:null};
function s5P(s){
  const iH=/^http:\/\//i.test(s);s=s.replace(/^(socks5?|http):\/\//i,'');
  const at=s.lastIndexOf('@'),hp=at!==-1?s.slice(at+1):s,[h,pt]=pH(hp);
  const up=at!==-1?s.slice(0,at):'',i=up.indexOf(':');
  return{u:i<0?'':up.slice(0,i),p:i<0?'':up.slice(i+1),h,pt,isHttp:iH};
}
function pV(d,w){
  d=u8(d);const n=d.byteLength,m=w?0:null;if(n<17)return m;
  const v=d[0];if(!isU(d))return null;if(n<18)return m;
  const i=18+d[17];if(i+4>n)return m;const c=d[i];if(c!==1&&c!==2)return null;
  const p=(d[i+1]<<8)|d[i+2];let j=i+3,h='';const a=d[j++];
  if(a===1){if(j+4>n)return m;h=d.slice(j,j+4).join('.');j+=4}
  else if(a===2){if(j>=n)return m;const l=d[j++];if(!l)return null;if(j+l>n)return m;h=TD.decode(d.slice(j,j+l));j+=l}
  else if(a===3){if(j+16>n)return m;h=v6s(d.buffer,d.byteOffset+j);j+=16}
  else return null;
  return{addr:h,port:p,idx:j,ver:v,isUDP:c===2};
}
async function rV(b){
  const r=b.getReader();let d=N0;
  try{
    for(;;){
      const{value,done}=await r.read();if(done)throw new Error('Incomplete VLESS request');
      const x=u8(value);if(!x.length)continue;d=d.length?cat(d,x):x.slice();
      const p=pV(d,1);if(p===0){if(d.length>8192)throw new Error('VLESS header too large');continue}if(!p)throw new Error('Invalid VLESS request');
      unl(r);return{p,f:d.subarray(p.idx)};
    }
  }catch(e){await cln(r);throw e}
}

function mkOW(wr){
  let st=OK;
  const closed=wr.closed.then(()=>{st=3},()=>{st=3});
  return{
    get readyState(){return st},
    closed,
    async send(d){if(st!==OK)throw new Error('output closed');try{await wr.write(u8(d))}catch(e){st=3;throw e}},
    async close(){if(st!==OK)return;st=3;try{await wr.close()}catch{}}
  };
}

async function fTO(u,i,as){const a=new AbortController(),t=setTimeout(()=>a.abort(),K.to);as?.add(a);try{return await fetch(u,{...i,signal:a.signal})}finally{clearTimeout(t);as?.delete(a)}}
async function qTXT(d){
  try{
    const r=await fTO(`${DOH}?name=${encodeURIComponent(d)}&type=TXT`,{headers:{accept:DJ}});
    if(!r.ok)return null;const j=await r.json();return j.Answer?.filter(x=>x.type===16).map(x=>x.data)||null;
  }catch{return null}
}
async function pTXT(d){
  const n=Date.now(),c=TC.get(d);
  if(c){if(n<c.exp){TC.delete(d);TC.set(d,c);return c.v}TC.delete(d)}
  if(TP.has(d))return TP.get(d);
  const p=(async()=>{const r=await qTXT(d);if(!r?.length)return null;const v=r.flatMap(x=>eT(x).split(',')).map(x=>x.trim()).filter(Boolean).map(vE).filter(Boolean);if(!v.length)return null;TC.set(d,{v,exp:Date.now()+K.ct});while(TC.size>K.tc)TC.delete(TC.keys().next().value);return v})();
  TP.set(d,p);try{return await p}finally{TP.delete(d)}
}

async function rN(r,b,n){while(b.length<n){const{value,done}=await rc(r.read());if(done)throw new Error('Proxy closed');b=b.length?cat(b,value):u8(value)}return[b.slice(0,n),b.slice(n)]}
function hU(w,vh,done,lg=log){
  let ok=false,b=N0,off=false;
  const as=new Set();
  const send=async q=>{
    if(off)return;
    try{
      const r=await fTO(DOH,{method:'POST',headers:{'content-type':DM},body:q},as);
      if(!r.ok){lg('udp doh status',String(r.status));return}
      const d=new Uint8Array(await r.arrayBuffer()),l=new Uint8Array([d.length>>8,d.length&255]);
      if(off||w.readyState!==OK)return;
      await w.send(ok?cat(l,d):cat(vh,l,d));ok=true;done?.();
    }catch(e){if(w.readyState!==OK)throw e;if(!off&&!endE(e))lg('udp doh error',e?.message||'error')}
  };
  const close=()=>{off=true;b=N0;for(const a of as)a.abort();as.clear()};
  return{async write(ch){
    if(off)return;
    let d=u8(ch),i=0;if(b.length){d=cat(b,d);b=N0}
    for(;i+2<=d.length;){const l=(d[i]<<8)|d[i+1];if(i+2+l>d.length)break;await send(d.slice(i+2,i+2+l));i+=2+l}
    if(i<d.length)b=d.slice(i);
  },close,abort:close};
}
async function dC(dc,h,p){const sock=dc({hostname:h,port:p});try{await rc(sock.opened);return{sock}}catch(e){await cln(sock);throw e}}
async function pC(dc,px,p,lg=log){
  const d=txtH(px);
  const go=(h,p)=>{lg('fallback proxy',`${h}:${p}`);return dC(dc,h,p).catch(e=>{lg('proxy failed',`${h}:${p} ${eM(e)}`);throw e})};
  if(d){const l=await pTXT(d);if(l?.length){const x=l[Math.floor(Math.random()*l.length)];return go(x.h,x.p)}const[h,q]=pH(d,p);lg('txt fallback',`${h}:${q}`);return go(h,q)}
  const[h,q]=pH(px,p);return go(h,q);
}
async function hC(dc,h,p,c){
  const x=await dC(dc,c.h,c.pt);let r=null;
  try{
    const hh=h.includes(':')?`[${h}]`:h,auth=c.u&&c.p?`Proxy-Authorization: Basic ${btoa((c.u||'')+':'+(c.p||''))}\r\n`:'';
    x.w=x.sock.writable.getWriter();await x.w.write(TE.encode(`CONNECT ${hh}:${p} HTTP/1.1\r\nHost: ${hh}:${p}\r\n${auth}Connection: Keep-Alive\r\n\r\n`));
    r=x.sock.readable.getReader();let b=N0,s=0;
    for(;;){
      const{value,done}=await rc(r.read());if(done)throw new Error('Proxy closed');
      b=b.length?cat(b,value):u8(value);
      let i=s;for(;i+3<b.length&&!(b[i]===13&&b[i+1]===10&&b[i+2]===13&&b[i+3]===10);i++);
      if(i+3>=b.length){s=i;continue}
      const t=TD.decode(b.slice(0,i+4));if(!t.startsWith('HTTP/1.1 200')&&!t.startsWith('HTTP/1.0 200'))throw new Error('Connect failed');
      const tail=b.slice(i+4);if(tail.length)x.tail=tail;unl(r);return x;
    }
  }catch(e){await cln(r,x);throw e}
}
async function sC(dc,h,p,c){
  const x=await dC(dc,c.h,c.pt);let r=null;
  try{
    x.w=x.sock.writable.getWriter();r=x.sock.readable.getReader();
    await x.w.write(new Uint8Array([5,2,0,2]));let b=N0,head;[head,b]=await rN(r,b,2);
    if(head[1]===0xff)throw new Error('No acceptable auth method');
    if(head[1]===2){if(!c.u||!c.p)throw new Error('Auth required');const u=TE.encode(c.u),pw=TE.encode(c.p);await x.w.write(new Uint8Array([1,u.length,...u,pw.length,...pw]));[head,b]=await rN(r,b,2);if(head[1]!==0)throw new Error('Auth failed')}
    const a=sA(h),req=new Uint8Array(5+a.length);req[0]=5;req[1]=1;req[2]=0;req.set(a,3);req[3+a.length]=p>>8;req[4+a.length]=p&255;await x.w.write(req);
    [head,b]=await rN(r,b,4);if(head[1]!==0)throw new Error('Connect failed');
    if(head[3]===1)[,b]=await rN(r,b,6);else if(head[3]===4)[,b]=await rN(r,b,18);else if(head[3]===3){let l;[l,b]=await rN(r,b,1);[,b]=await rN(r,b,l[0]+2)}else throw new Error('Invalid atyp');
    if(b.length)x.tail=b;unl(r);return x;
  }catch(e){await cln(r,x);throw e}
}
async function cn(dc,h,p,px,s5,gs5,lg=log){
  const g=s5?s5P(s5):null,fb=()=>g?g.isHttp?hC(dc,h,p,g):sC(dc,h,p,g):pC(dc,px,p,lg);
  const uf=async()=>{try{if(g)lg('fallback proxy',`${g.h}:${g.pt}`);return await fb()}catch(e){if(g)lg('proxy failed',`${g.h}:${g.pt} ${eM(e)}`);throw e}};
  if(gs5&&g)return uf();
  try{const c=await dC(dc,h,p);c.retry=uf;return c}catch(e){lg('direct failed',`${h}:${p} ${eM(e)}`);return uf()}
}

function uH(r,p,f,lg){
  const ts=new IdentityTransformStream(),ow=mkOW(ts.writable.getWriter()),ac=new AbortController(),uw=hU(ow,new Uint8Array([p.ver,0]),idle,lg);
  let off=false,ut=0;
  function idle(){clearTimeout(ut);ut=setTimeout(stop,K.ui)}
  const end=async()=>{if(off)return;off=true;clearTimeout(ut);ac.abort();await Promise.all([cln(uw,r.body),ow.close()])};
  const stop=()=>end().catch(e=>{if(!endE(e))lg('end failed',eM(e))});
  (async()=>{
    if(f.length)await uw.write(f);
    await r.body.pipeTo(new WritableStream({async write(ch){clearTimeout(ut);ut=0;await uw.write(ch)}}),{signal:ac.signal});
    await end();
  })().catch(e=>{if(!endE(e))lg('body pipe failed',eM(e));stop()});
  ow.closed.then(stop);
  return new Response(ts.readable,{status:200,headers:{'Content-Type':XO,'Cache-Control':'no-store','X-Accel-Buffering':'no'}});
}

async function xH(r,px,s5,gs5){
  const dc=r.fetcher?.connect?.bind(r.fetcher);if(!dc)throw new Error('connect unavailable');
  let lp='';const lg=(a,b='')=>log(lp?`${lp} ${a}`:a,b);
  let h;try{h=await rV(r.body)}catch{return new Response('bad request',{status:400})}
  const{p,f}=h;if(p.isUDP){if(p.port!==53){await cln(r.body);return new Response('bad request',{status:400})}return uH(r,p,f,lg)}
  if(D)lp=`[${p.addr}:${p.port}--${Math.random()} tcp]`;lg('open',`first=${f.length}`);
  const th=txtH(px);th&&pTXT(th).catch(e=>{if(!endE(e))lg('txt warmup failed',eM(e))});
  let c;try{c=await cn(dc,p.addr,p.port,px,s5,gs5,lg)}catch(e){if(!endE(e))lg('connect error',eM(e));await cln(r.body);return new Response('bad gateway',{status:502})}
  const ts=new IdentityTransformStream(),a=new AbortController();let off=false;
  const end=e=>{if(off)return;off=true;try{a.abort(e)}catch{}void cln(c)};
  const up=(async()=>{
    const w=c.w||c.sock.writable.getWriter();try{if(f.length)await w.write(f)}finally{unl(w)}
    await r.body.pipeTo(c.sock.writable,{signal:a.signal});
  })();
  const down=(async()=>{
    const w=ts.writable.getWriter();
    try{await w.write(new Uint8Array([p.ver,0]));if(c.tail?.length){await w.write(c.tail);c.tail=N0}}
    catch(e){try{await w.abort(e)}catch{}throw e}
    finally{unl(w)}
    await c.sock.readable.pipeTo(ts.writable,{signal:a.signal});
  })();
  void up.catch(end);void down.then(()=>end(),end);void Promise.allSettled([up,down]);
  return new Response(ts.readable,{status:200,headers:{'Content-Type':XO,'Cache-Control':'no-store','X-Accel-Buffering':'no'}});
}
