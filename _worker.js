/*
 本项目仅作为学习使用，请勿用于非法用途。
*/
const V='3.1.0';
const U='aaa6b096-1165-4bbe-935c-99f4ec902d02';
const P='txt@kr.william.dwb.cc.cd';
const S5='';
const GS5=false;
const D=false;
const SUB='sub.glimmer.hidns.vip';
const UID='ikun';
const K={to:6000,ed:8*1024,up:16*1024,uq:256*1024,rd:64*1024,dn:32*1024,dt:512,tc:64};

if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(U))throw new Error('Invalid UUID');

const z=new Uint8Array(0),te=new TextEncoder(),td=new TextDecoder(),ub=new Uint8Array(16);
for(let i=0,p=0,c,h;i<16;i++){c=U.charCodeAt(p++);if(c===45)c=U.charCodeAt(p++);h=(c>64?c+9:c)&15;c=U.charCodeAt(p++);if(c===45)c=U.charCodeAt(p++);ub[i]=h<<4|((c>64?c+9:c)&15)}
const tc=new Map(),tp=new Map();
const lg=D?console.log.bind(console):()=>{},le=D?console.error.bind(console):()=>{};
const mU=d=>{for(let i=0;i<16;i++)if(d[i+1]!==ub[i])return false;return true};

export default{async fetch(r){
  try{
    const u=new URL(r.url);
    if(UID&&u.pathname==='/'+UID){
      const s=u.searchParams.get('sub')||SUB;
      return s?Response.redirect(`https://${s}/sub?uuid=${U}&host=${u.hostname}`,302):new Response('Missing sub param',{status:400});
    }
    if(r.headers.get('Upgrade')?.toLowerCase()!=='websocket')return u.pathname==='/'?new Response(`mini v${V}`,{status:200}):new Response(null,{status:404});
    const px=qP(u,'p')||P,s5=qP(u,'s5')||S5,gm=qP(u,'gs5');
    return ws(r,px,s5,gm!==null?(gm==='1'||gm.toLowerCase()==='true'):GS5);
  }catch(e){return new Response('Error: '+(e?.message||'unknown'),{status:502})}
}};

const race=(p,ms=K.to)=>{let t;return Promise.race([p,new Promise((_,r)=>{t=setTimeout(()=>r(new Error('timeout')),ms)})]).finally(()=>clearTimeout(t))};
const u8=x=>x instanceof Uint8Array?x:x instanceof ArrayBuffer?new Uint8Array(x):ArrayBuffer.isView(x)?new Uint8Array(x.buffer,x.byteOffset,x.byteLength):z;
const b64=s=>{if(!s)return null;try{let x=s.replace(/-/g,'+').replace(/_/g,'/');x=x.padEnd(Math.ceil(x.length/4)*4,'=');return Uint8Array.from(atob(x),c=>c.charCodeAt(0))}catch{return null}};
const cat=(...a)=>{const l=a.map(u8),o=new Uint8Array(l.reduce((n,x)=>n+x.length,0));let p=0;for(const x of l){o.set(x,p);p+=x.length}return o};
const quiet=e=>/cancel|closed|aborted/i.test(e?.message||'');
const rel=x=>{try{x?.releaseLock?.()}catch{}};
const closeOne=x=>{try{const p=x?.close?.();if(p?.finally)return p.catch?.(()=>{}).finally(()=>rel(x))}catch{}rel(x)};
const closeAll=(...a)=>{for(const x of a){if(!x)continue;if(x.sock||x.w)closeAll(x.w,x.sock);else closeOne(x)}};
const dial=r=>{
  if(!r.fetcher?.connect)throw new Error('connect unavailable');
  return r.fetcher.connect.bind(r.fetcher);
};

const qP=(u,k)=>{
  const q=u.pathname.slice(1)+(u.search?'&'+u.search.slice(1):'');
  for(const p of q.split('&')){
    const i=p.indexOf('='),a=i<0?p:p.slice(0,i),v=i<0?'':p.slice(i+1);
    try{if(decodeURIComponent(a)===k)return decodeURIComponent(v)}catch{if(a===k)return v}
  }
  return null;
};

const pH=(s,d=443)=>{
  if(!s)return[null,d];s=String(s).trim();
  if(s[0]==='['){const i=s.indexOf(']');if(i>0)return[s.slice(1,i),s[i+1]===':'?Number(s.slice(i+2))||d:d]}
  const i=s.lastIndexOf(':');return i>0&&s.indexOf(':')===i?[s.slice(0,i),Number(s.slice(i+1))||d]:[s,d];
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

function mkQ(c,m=c,l=Math.max(1,m>>8)){
  let q=[],h=0,qb=0,b=null;
  const trim=()=>{if(h>32&&h*2>=q.length){q=q.slice(h);h=0}};
  const take=()=>{if(h>=q.length)return null;const d=q[h];q[h++]=undefined;qb-=d.byteLength;trim();return d};
  return{
    get empty(){return h>=q.length},clear(){q=[];h=0;qb=0},
    push(d){const n=d?.byteLength||0;if(!n)return 1;if(qb+n>m||q.length-h>=l)return 0;q.push(d);qb+=n;return 1},
    pack(d){d=d||take();if(!d||h>=q.length||d.byteLength>=c)return[d,0];let n=d.byteLength,e=h;while(e<q.length){const x=q[e],nn=n+x.byteLength;if(nn>c)break;n=nn;e++}if(e===h)return[d,0];const o=b||=new Uint8Array(c);o.set(d);for(let p=d.byteLength;h<e;){const x=q[h];q[h++]=undefined;qb-=x.byteLength;o.set(x,p);p+=x.byteLength}trim();return[o.subarray(0,n),1]}
  };
}

function mkD(w){
  const low=Math.max(4096,K.dt<<3);let b=new Uint8Array(K.dn),p=0,t=0,m=0,g=0,k=0,r=0;
  const flush=()=>{if(t)clearTimeout(t);t=0;m=0;if(!p)return;if(w.readyState===WebSocket.OPEN)w.send(b.slice(0,p));b=new Uint8Array(K.dn);p=0;r=0};
  const wait=()=>{if(t||m)return;m=1;k=g;queueMicrotask(()=>{m=0;if(!p||t)return;if(K.dn-p<K.dt)return flush();t=setTimeout(()=>{t=0;if(!p)return;if(K.dn-p<K.dt)return flush();if(r<2&&(g!==k||p<low)){r++;k=g;return wait()}flush()},1)})};
  return{send(u){let o=0,n=u?.byteLength||0;if(!n)return;while(o<n){if(!p&&n-o>=K.dn){const m=Math.min(K.dn,n-o);if(w.readyState!==WebSocket.OPEN)throw new Error('ws closed');w.send(o||m!==n?u.subarray(o,o+m):u);o+=m;continue}const m=Math.min(K.dn-p,n-o);b.set(u.subarray(o,o+m),p);p+=m;o+=m;g++;if(p===K.dn||K.dn-p<K.dt)flush();else wait()}},flush};
}

const tH=s=>/^txt@/i.test(s||'')?String(s).slice(4):'';
const eT=s=>s.replace(/^"|"$/g,'').replace(/"\s*"/g,'').replace(/\\010/g,',').replace(/\\,/g,',').replace(/\r?\n/g,',');
const vE=s=>{const[h,p]=pH(s,443);return h&&(iV(h)||/^[a-z0-9.-]+$/i.test(h)||h.includes(':'))&&p>0&&p<65536?{h,p}:null};
async function fTO(u,i){const a=new AbortController(),t=setTimeout(()=>a.abort(),K.to);try{return await fetch(u,{...i,signal:a.signal})}finally{clearTimeout(t)}}
async function qT(d){
  try{
    const r=await fTO(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(d)}&type=TXT`,{headers:{accept:'application/dns-json'}});
    if(!r.ok)return null;const j=await r.json(),a=j.Answer?.filter(x=>x.type===16)||[];if(!a.length)return null;
    return{ttl:Math.min(...a.map(x=>Number(x.TTL)||0))*1000,txt:a.map(x=>x.data)};
  }catch{return null}
}
async function pT(d){
  const n=Date.now();for(const[k,v]of tc)if(v.exp<=n)tc.delete(k);
  const c=tc.get(d);if(c&&n<c.exp){tc.delete(d);tc.set(d,c);return c.v}
  if(tp.has(d))return tp.get(d);
  const p=(async()=>{const r=await qT(d);if(!r?.txt?.length){lg(`[pT] TXT query failed: ${d}`);return null}const v=r.txt.flatMap(x=>eT(x).split(',')).map(x=>x.trim()).filter(Boolean).map(vE).filter(Boolean);if(!v.length)return null;if(r.ttl>0){tc.set(d,{v,exp:Date.now()+r.ttl});while(tc.size>K.tc)tc.delete(tc.keys().next().value)}return v})();
  tp.set(d,p);try{return await p}finally{tp.delete(d)}
}

function ws(r,px,s5,gs5){
  const[client,w]=Object.values(new WebSocketPair());w.binaryType='arraybuffer';w.accept({allowHalfOpen:true});
  const pd=tH(px);if(pd)pT(pd).catch(e=>lg(`[pT] warmup failed: ${e?.message}`));
  const dc=dial(r);let c=null,dw=null,dns=false,closed=false,busy=false,hold=false,addr='',pl='';
  const q=mkQ(K.up,K.uq,K.uq>>8),log=(i,e)=>lg(`[${addr}:${pl}] ${i}`,e||'');
  const setC=(x,p=false)=>{if(closed){closeAll(x);return 0}c=x;hold=p;if(!hold&&!q.empty)pump();return 1};
  const end=()=>{if(closed)return;closed=true;q.clear();closeAll(dw,c,w);dw=null;c=null;dns=false};
  const add=x=>{const d=u8(x);if(!d.length)return 1;if(q.push(d))return 1;end();return 0};
  const open=async d=>{
    const p=pV(d);if(!p)throw new Error('Invalid VLESS request');
    addr=p.addr;pl=`${p.port}--${Math.random()} ${p.isUDP?'udp ':'tcp '}`;
    const vh=new Uint8Array([p.ver,0]),[first]=q.pack(d.subarray(p.idx));
    if(p.isUDP)return openU(p,first,vh);
    if(w.readyState!==WebSocket.OPEN)throw new Error('ws closed');
    w.send(vh);
    const nc=await cn(dc,p.addr,p.port,first,px,s5,gs5,w,log);if(!setC(nc))return;rl(nc,w,log,end,setC).catch(e=>le('rl error',e?.message));
  };
  const openU=async(p,first,vh)=>{if(p.port!==53)throw new Error('Invalid UDP port');const ndw=await hU(w,vh,log,end);if(closed){closeAll(ndw);return}dw=ndw;dns=true;if(first?.byteLength)await dw.write(first)};
  const pump=async()=>{if(busy||closed)return;busy=true;try{for(;;){if(closed||hold)break;const[d]=q.pack();if(!d)break;if(dns&&dw){await dw.write(d);continue}if(c?.w){await c.w.write(d);continue}await open(d)}}catch(e){log('write error',e?.message);end()}finally{busy=false;if(!q.empty&&!closed&&!hold)queueMicrotask(pump)}};
  const eh=r.headers.get('sec-websocket-protocol')||'',ed=eh.length<=K.ed*4/3+4?b64(eh):null;if(ed&&ed.byteLength<=K.ed&&add(ed))pump();
  w.addEventListener('message',e=>{if(!closed&&add(e.data))pump()});w.addEventListener('close',end);w.addEventListener('error',end);
  return new Response(null,{status:101,webSocket:client,headers:{'Sec-WebSocket-Extensions':''}});
}

async function cn(dc,addr,port,data,px,s5,gs5,w,log){
  data=data||z;
  const cfg=s5?pS(s5,dc):null,fb=()=>cfg?cfg.isHttp?hC(addr,port,cfg):sC(addr,port,cfg):pC(dc,px,port);
  const use=async c=>{try{if(w.readyState!==WebSocket.OPEN)throw new Error('closed');c.w||=c.sock.writable.getWriter();if(data.length)await c.w.write(data);return c}catch(e){closeAll(c);throw e}};
  if(gs5&&cfg)return use(await fb());
  let c=null;try{c=await dC(dc,addr,port);c=await use(c);c.retry=async()=>use(await fb());return c}catch(e){closeAll(c);if(w.readyState!==WebSocket.OPEN)throw e;log(`direct failed, fallback to proxy: ${e?.message}`);return use(await fb())}
}

async function dC(dc,h,p){const sock=dc({hostname:h,port:p});try{await race(sock.opened);return{sock,tail:z,w:null}}catch(e){closeAll(sock);throw e}}
async function pC(dc,px,port){
  const d=tH(px);
  if(d){const l=await pT(d);if(l?.length){const x=l[Math.floor(Math.random()*l.length)];return dC(dc,x.h,x.p)}const[h,p]=pH(d,port);return dC(dc,h,p)}
  const[h,p]=pH(px,port);return dC(dc,h,p);
}
async function rl(c,w,log,end,setC){
  const tx=mkD(w);let has=false,buf=new ArrayBuffer(K.rd),r=null;
  for(;;){
    let err=null;has=false;r=null;
    try{
      if(c.tail.length){has=true;tx.send(c.tail);c.tail=z}
      r=c.sock.readable.getReader({mode:'byob'});
      for(;;){
        const{done,value}=await r.read(new Uint8Array(buf,0,K.rd));if(done)break;
        const d=u8(value);if(!d.length)continue;has=true;
        if(d.byteLength>=K.rd>>1){tx.flush();if(w.readyState!==WebSocket.OPEN)throw new Error('ws closed');w.send(d);buf=new ArrayBuffer(K.rd)}else{tx.send(d.slice());buf=d.buffer}
      }
      tx.flush();log(`remote readable close with hasIncomingData is ${has}`);
    }catch(e){err=e;try{tx.flush()}catch{}}finally{closeAll(r)}
    if(!has&&c.retry&&w.readyState===WebSocket.OPEN){
      const old=c;if(!setC(null,true)){closeAll(old);return}closeAll(old);log('retry fallback');
      try{c=await old.retry();if(!setC(c))return;continue}catch(e){log(`fallback failed: ${e?.message}`)}
    }
    if(err&&!quiet(err))le('remoteSocketToWS has exception',err?.stack||err);
    end();return;
  }
}

async function hC(h,pt,c){
  const x=await dC(c.dc,c.h,c.pt);let r=null;
  try{
    const hh=h.includes(':')?`[${h}]`:h,auth=c.u&&c.p?`Proxy-Authorization: Basic ${btoa(c.u+':'+c.p)}\r\n`:'';
    x.w=x.sock.writable.getWriter();await x.w.write(te.encode(`CONNECT ${hh}:${pt} HTTP/1.1\r\nHost: ${hh}:${pt}\r\n${auth}Connection: Keep-Alive\r\n\r\n`));
    r=x.sock.readable.getReader();let b=z;
    for(;;){const{value,done}=await race(r.read());if(done)throw new Error('Proxy closed');b=b.length?cat(b,value):u8(value);const i=hEnd(b);if(i===-1)continue;const t=td.decode(b.slice(0,i+4));if(!t.startsWith('HTTP/1.1 200')&&!t.startsWith('HTTP/1.0 200'))throw new Error('Connect failed');x.tail=b.slice(i+4);closeAll(r);return x}
  }catch(e){closeAll(r,x);throw e}
}

async function sC(h,pt,c){
  const x=await dC(c.dc,c.h,c.pt);let r=null;
  try{
    x.w=x.sock.writable.getWriter();r=x.sock.readable.getReader();
    await x.w.write(new Uint8Array([5,2,0,2]));let b=z,head;[head,b]=await rN(r,b,2);
    if(head[1]===0xff)throw new Error('No acceptable auth method');
    if(head[1]===2){if(!c.u||!c.p)throw new Error('Auth required');const u=te.encode(c.u),p=te.encode(c.p);await x.w.write(new Uint8Array([1,u.length,...u,p.length,...p]));[head,b]=await rN(r,b,2);if(head[1]!==0)throw new Error('Auth failed')}
    const a=sA(h),req=new Uint8Array(5+a.length);req[0]=5;req[1]=1;req[2]=0;req.set(a,3);req[3+a.length]=pt>>8;req[4+a.length]=pt&255;await x.w.write(req);
    [head,b]=await rN(r,b,4);if(head[1]!==0)throw new Error('Connect failed');
    if(head[3]===1)[,b]=await rN(r,b,6);else if(head[3]===4)[,b]=await rN(r,b,18);else if(head[3]===3){let l;[l,b]=await rN(r,b,1);[,b]=await rN(r,b,l[0]+2)}else throw new Error('Invalid atyp');
    x.tail=b;closeAll(r);return x;
  }catch(e){closeAll(r,x);throw e}
}

async function rN(r,b,n){while(b.length<n){const{value,done}=await race(r.read());if(done)throw new Error('Proxy closed');b=b.length?cat(b,value):u8(value)}return[b.slice(0,n),b.slice(n)]}
const hEnd=b=>{for(let i=0;i+3<b.length;i++)if(b[i]===13&&b[i+1]===10&&b[i+2]===13&&b[i+3]===10)return i;return-1};

async function hU(w,vh,log,end){
  let sent=false,cache=z;
  const ts=new TransformStream({transform(ch,c){let d=u8(ch),i=0;if(cache.length){d=cat(cache,d);cache=z}for(;i+2<=d.length;){const l=(d[i]<<8)|d[i+1];if(i+2+l>d.length)break;c.enqueue(d.slice(i+2,i+2+l));i+=2+l}if(i<d.length)cache=d.slice(i)}});
  const out=new WritableStream({async write(q){try{const r=await fTO('https://cloudflare-dns.com/dns-query',{method:'POST',headers:{'content-type':'application/dns-message'},body:q});if(!r.ok){log(`doh error status ${r.status}`);return}const d=new Uint8Array(await r.arrayBuffer()),l=new Uint8Array([d.length>>8,d.length&255]);log(`doh success and dns message length is ${d.length}`);if(w.readyState!==WebSocket.OPEN)return;w.send(sent?cat(l,d):cat(vh,l,d));sent=true}catch(e){log('dns udp has error'+e)}}});
  ts.readable.pipeTo(out).catch(e=>{log('dns pipeTo error',e?.message||e);end()});
  return ts.writable.getWriter();
}

function pV(d){
  d=u8(d);const n=d.byteLength;if(n<24)return null;
  const ver=d[0];if(ver!==0)return null;
  if(!mU(d))return null;
  const ci=18+d[17];if(ci+4>n)return null;const cmd=d[ci];if(cmd!==1&&cmd!==2)return null;
  const port=(d[ci+1]<<8)|d[ci+2];let ai=ci+3,addr='';const at=d[ai++];
  if(at===1){if(ai+4>n)return null;addr=d.slice(ai,ai+4).join('.');ai+=4}
  else if(at===2){if(ai>=n)return null;const l=d[ai++];if(!l||ai+l>n)return null;addr=td.decode(d.slice(ai,ai+l));ai+=l}
  else if(at===3){if(ai+16>n)return null;addr=bV6(d.buffer,d.byteOffset+ai);ai+=16}
  else return null;
  return{addr,port,idx:ai,ver,isUDP:cmd===2};
}

function pS(s,dc){
  const isHttp=/^https?:\/\//i.test(s);s=s.replace(/^(socks5?|https?):\/\//i,'');
  const at=s.lastIndexOf('@'),hp=at!==-1?s.slice(at+1):s,[h,pt]=pH(hp);
  if(at===-1)return{u:'',p:'',h,pt,isHttp,dc};
  const up=s.slice(0,at),i=up.indexOf(':');
  return i===-1?{u:'',p:'',h,pt,isHttp,dc}:{u:up.slice(0,i),p:up.slice(i+1),h,pt,isHttp,dc};
}
