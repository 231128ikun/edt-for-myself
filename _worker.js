/*
 本项目仅作为学习使用，请勿用于非法用途。
*/
import{connect as C}from'cloudflare:sockets';

const V='3.0.9';
const U='aaa6b096-1165-4bbe-935c-99f4ec902d02';
const P='txt@kr.william.dwb.cc.cd';
const S5='';
const GS5=false;
const D=false;
const SUB='sub.glimmer.hidns.vip';
const UID='ikun';
const TO=6000;
const CT=3*60*60*1000;
const CM=64;

const WO=1,E8=new Uint8Array(0),TE=new TextEncoder(),TD=new TextDecoder();
const UB=Uint8Array.from(U.replace(/-/g,'').match(/.{2}/g).map(x=>parseInt(x,16)));
const TC=new Map(),TP=new Map();

if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(U))throw new Error('Invalid UUID');

export default{async fetch(r){
  try{
    const u=new URL(r.url);
    if(UID&&u.pathname==='/'+UID){const s=u.searchParams.get('sub')||SUB;return s?Response.redirect(`https://${s}/sub?uuid=${U}&host=${u.hostname}`,302):new Response('Missing sub param',{status:400});}
    if(r.headers.get('Upgrade')?.toLowerCase()!=='websocket')return u.pathname==='/'?new Response(`mini v${V}`,{status:200}):new Response(null,{status:404});
    const px=qP(u,'p')||P,s5=qP(u,'s5')||S5,gm=qP(u,'gs5');
    const gs5=gm!==null?(gm==='1'||gm?.toLowerCase()==='true'):GS5;
    return hW(r,px,s5,gs5);
  }catch(e){return new Response('Error: '+(e?.message||'unknown'),{status:502});}
}};

const cl=o=>{try{o?.close?.()}catch{}};
const clWS=o=>{try{if(o?.readyState===1||o?.readyState===2)o.close();}catch{}};
const clW=o=>{try{o?.close?.()}catch{}try{o?.releaseLock?.()}catch{}};
const lg=(...a)=>D&&console.log(...a),le=(...a)=>D&&console.error(...a);
const rc=(p,ms)=>{let t;return Promise.race([p,new Promise((_,r)=>{t=setTimeout(()=>r(new Error('timeout')),ms);})]).finally(()=>clearTimeout(t));};
const u8=x=>x instanceof Uint8Array?x:x instanceof ArrayBuffer?new Uint8Array(x):ArrayBuffer.isView(x)?new Uint8Array(x.buffer,x.byteOffset,x.byteLength):E8;
const b64=b=>{if(!b)return null;try{let s=b.replace(/-/g,'+').replace(/_/g,'/');s=s.padEnd(Math.ceil(s.length/4)*4,'=');return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}catch{return null;}};
const pH=(s,d=443)=>{if(!s)return[null,d];s=String(s).trim();if(s[0]==='['){const j=s.indexOf(']');if(j>0)return[s.slice(1,j),s[j+1]===':'?Number(s.slice(j+2))||d:d];}const i=s.lastIndexOf(':');return i>0&&s.indexOf(':')==i?[s.slice(0,i),Number(s.slice(i+1))||d]:[s,d];};
const eT=s=>s.replace(/^"|"$/g,'').replace(/"\s*"/g,'').replace(/\\010/g,',').replace(/\\,/g,',').replace(/\r?\n/g,',');
const vE=s=>{const[h,p]=pH(s,443);return h&&(iV(h)||/^[a-z0-9.-]+$/i.test(h)||h.includes(':'))&&p>0&&p<65536?{h,p}:null;};
const cC=k=>{if(TC.has(k)){const v=TC.get(k);TC.delete(k);TC.set(k,v);return;}if(TC.size<CM)return;const now=Date.now();for(const[x,v]of TC)if(v.exp<=now)TC.delete(x);if(TC.size<CM)return;TC.delete(TC.keys().next().value);};
const iV=h=>/^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(h);
const vB=s=>{if(!s||s.includes('.'))return null;const p=s.split('::');if(p.length>2)return null;const a=p[0]?p[0].split(':').filter(Boolean):[],b=p[1]?p[1].split(':').filter(Boolean):[],f=8-a.length-b.length;if(f<0)return null;const full=[...a,...Array(f).fill('0'),...b];if(full.length!==8)return null;const o=new Uint8Array(16);for(let i=0;i<8;i++){const v=parseInt(full[i],16);if(!(v>=0&&v<=0xffff))return null;o[i*2]=v>>8;o[i*2+1]=v&255;}return o;};
const bV6=(b,off)=>{const dv=new DataView(b,off,16),segs=[];for(let i=0;i<8;i++)segs.push(dv.getUint16(i*2).toString(16));return segs.join(':');};
const sA=h=>{if(iV(h))return new Uint8Array([1,...h.split('.').map(Number)]);const v6=vB(h);if(v6){const o=new Uint8Array(17);o[0]=4;o.set(v6,1);return o;}const d=TE.encode(h);if(d.length>255)throw new Error('Domain too long');const o=new Uint8Array(2+d.length);o[0]=3;o[1]=d.length;o.set(d,2);return o;};
const rn=a=>a[Math.floor(Math.random()*a.length)];
const cu=(...parts)=>{const list=parts.map(u8),o=new Uint8Array(list.reduce((n,p)=>n+p.length,0));let off=0;for(const p of list){o.set(p,off);off+=p.length;}return o;};
const qP=(u,k)=>{const q=u.pathname.slice(1)+(u.search?'&'+u.search.slice(1):'');for(const p of q.split('&')){const i=p.indexOf('='),a=i<0?p:p.slice(0,i);try{if(decodeURIComponent(a)===k)return i<0?'':decodeURIComponent(p.slice(i+1));}catch{if(a===k)return i<0?'':p.slice(i+1);}}return null;};
const isTXT=s=>/^txt@/i.test(s||'');
const getTXT=s=>isTXT(s)?s.slice(4):'';
const fTO=async(url,init)=>{let tid;try{const ac=new AbortController();tid=setTimeout(()=>ac.abort(),TO);return await fetch(url,{...(init||{}),signal:ac.signal});}finally{clearTimeout(tid);}};
const mkC=(sock,tail=E8)=>({sock,tail});
const hEnd=b=>{for(let i=0;i+3<b.length;i++)if(b[i]===13&&b[i+1]===10&&b[i+2]===13&&b[i+3]===10)return i;return-1;};
const rN=async(r,buf,n)=>{while(buf.length<n){const{value,done}=await rc(r.read(),TO);if(done)throw new Error('Proxy closed');buf=buf.length?cu(buf,value):u8(value);}return[buf.slice(0,n),buf.slice(n)];};

async function qT(d){
  try{const r=await fTO(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(d)}&type=TXT`,{headers:{accept:'application/dns-json'}});if(!r.ok)return null;const j=await r.json();return j.Answer?.filter(x=>x.type===16).map(x=>x.data)||[];}catch{return null;}
}

async function pT(d){
  const cached=TC.get(d);if(cached&&Date.now()<cached.exp){cC(d);return cached.v;}
  if(TP.has(d))return TP.get(d);
  const task=(async()=>{
    const recs=await qT(d);if(!recs?.length){lg(`[pT] TXT query failed: ${d}`);return null;}
    const list=recs.flatMap(x=>eT(x).split(',')).map(s=>s.trim()).filter(Boolean);
    const parsed=list.map(vE).filter(Boolean);
    if(!parsed.length)return null;
    cC(d);TC.set(d,{v:parsed,exp:Date.now()+CT});
    return parsed;
  })();
  TP.set(d,task);
  try{return await task;}finally{TP.delete(d);}
}

async function hW(r,px,s5,gs5){
  const[client,server]=Object.values(new WebSocketPair());
  server.accept();
  server.binaryType='arraybuffer';
  if(isTXT(px))pT(getTXT(px)).catch(e=>lg(`[pT] warmup failed: ${e?.message}`));
  const eh=r.headers.get('sec-websocket-protocol')||'',rs=mR(server,eh);
  let addr='',portLog='';
  const log=(info,ev)=>lg(`[${addr}:${portLog}] ${info}`,ev||'');
  let remote=null,dnsW=null,dns=false;
  const setRemote=v=>{remote=v;};
  const clean=()=>{const w=dnsW,s=remote?.sock;dnsW=null;dns=false;remote=null;clW(w);cl(s);clWS(server);};
  rs.pipeTo(new WritableStream({
    async write(ch){
      try{
        const d=u8(ch);if(!d.length)return;
        if(dns&&dnsW){await dnsW(d);return;}
        if(remote){await wF(remote.sock,d);return;}
        const p=pV(d);if(!p)return clean();
        const{addr:a,port,idx,ver,isUDP}=p;
        addr=a;portLog=`${port}--${Math.random()} ${isUDP?'udp ':'tcp '}`;
        const vh=new Uint8Array([ver,0]),payload=d.slice(idx);
        if(isUDP){
          if(port!==53){log('UDP proxy only enable for DNS which is port 53');return clean();}
          dns=true;
          const h=await hU(server,vh,log);dnsW=h.write.bind(h);
          if(payload.length)await dnsW(payload);
          return;
        }
        log(`connected to ${addr}:${port}`);
        try{await hT(addr,port,payload,server,vh,px,s5,gs5,log,setRemote);}catch(e){log('hT error',e?.message);clean();}
      }catch(e){log('write error',e?.message);clean();}
    },
    close(){log('readableWebSocketStream is close');clean();},
    abort(r){log('readableWebSocketStream is abort',JSON.stringify(r));clean();}
  })).catch(e=>log('pipeTo error',e?.message));
  return new Response(null,{status:101,webSocket:client});
}

async function dl(h,p){const s=C({hostname:h,port:p});try{await rc(s.opened,TO);return s;}catch(e){cl(s);throw e;}}
const wW=(w,d)=>rc(w.write(d),TO);
async function wF(s,data){if(data?.length){const w=s.writable.getWriter();try{await wW(w,data);}catch(e){cl(s);throw e;}finally{rL(w);}}return s;}
const rL=o=>{try{o?.releaseLock?.()}catch{}};

function pF(addr,port,px,s5cfg){
  if(s5cfg)return()=>s5cfg.isHttp?hC(addr,port,s5cfg):sC(addr,port,s5cfg);
  if(isTXT(px)){return async()=>{const d=getTXT(px),list=await pT(d);if(list?.length){const sel=rn(list);return mkC(await dl(sel.h,sel.p));}const[ph,pp]=pH(d,port);return mkC(await dl(ph,pp));};}
  return async()=>{const[ph,pp]=pH(px,port);return mkC(await dl(ph,pp));};
}

async function hT(addr,port,data,ws,vh,px,s5,gs5,log,setRemote){
  const s5cfg=s5?pS(s5):null,fb=pF(addr,port,px,s5cfg);
  const cR=(sock,retryFn,tail=E8)=>{const conn=mkC(sock,tail);setRemote(conn);rl(conn,ws,vh,retryFn,log);return conn;};
  const cF=async()=>{const c=await fb();try{await wF(c.sock,data);return cR(c.sock,null,c.tail);}catch(e){cl(c.sock);throw e;}};
  let sock=null;
  try{
    if(gs5&&s5cfg)return cF();
    sock=await wF(await dl(addr,port),data);
    return cR(sock,async()=>{
      log('retry');
      cl(sock);
      return cF();
    });
  }catch(e){
    log(`direct failed, fallback to proxy: ${e?.message}`);
    cl(sock);
    try{return await cF();}
    catch(e2){log(`fallback also failed: ${e2?.message}`);throw e2;}
  }
}

async function rl(conn,ws,vh,retryFn,log){
  let hdr=vh,hasData=false;
  if(conn.tail.length){hasData=true;if(ws.readyState!==WO)throw new Error('ws closed');ws.send(cu(hdr,conn.tail));hdr=null;conn.tail=E8;}
  const retry=async()=>{if(!hasData&&retryFn&&ws.readyState===WO){try{await retryFn();return 1;}catch{}}return 0;};
  const onEnd=async(label,r)=>{if(label==='abort')le('remoteConnection!.readable abort',r);if(!await retry())clWS(ws);};
  try{
    await conn.sock.readable.pipeTo(new WritableStream({
      write(ch){
        hasData=true;
        const d=u8(ch);if(!d.length)return;
        if(ws.readyState!==WO)throw new Error('ws closed');
        if(hdr){ws.send(cu(hdr,d));hdr=null;}
        else ws.send(d);
      },
      close(){log(`remoteConnection!.readable is close with hasIncomingData is ${hasData}`);return onEnd('close');},
      abort(r){return onEnd('abort',r);}
    }));
  }catch(e){
    le('remoteSocketToWS has exception',e?.stack||e);
    if(!await retry())clWS(ws);
  }
}

async function hC(h,pt,cfg){
  const s=await dl(cfg.h,cfg.pt);let r=null;
  try{
    const hh=h.includes(':')?`[${h}]`:h,auth=cfg.u&&cfg.p?`Proxy-Authorization: Basic ${btoa(cfg.u+':'+cfg.p)}\r\n`:'';
    const req=`CONNECT ${hh}:${pt} HTTP/1.1\r\nHost: ${hh}:${pt}\r\n${auth}Connection: Keep-Alive\r\n\r\n`;
    await wF(s,TE.encode(req));
    r=s.readable.getReader();let buf=E8;const start=Date.now();
    while(Date.now()-start<TO){const{value,done}=await rc(r.read(),TO);if(done)throw new Error('Proxy closed');buf=buf.length?cu(buf,value):u8(value);const i=hEnd(buf);if(i!==-1){const txt=TD.decode(buf.slice(0,i+4));if(!txt.startsWith('HTTP/1.1 200')&&!txt.startsWith('HTTP/1.0 200'))throw new Error('Connect failed');const tail=buf.slice(i+4);rL(r);return mkC(s,tail);}}
    rL(r);throw new Error('Timeout');
  }catch(e){rL(r);cl(s);throw e;}
}

async function sC(h,pt,cfg){
  const s=await dl(cfg.h,cfg.pt);let sw=null,sr=null;
  try{
    sw=s.writable.getWriter();sr=s.readable.getReader();
    await wW(sw,new Uint8Array([5,2,0,2]));let buf=E8,head;
    [head,buf]=await rN(sr,buf,2);
    if(head[1]===0xFF)throw new Error('No acceptable auth method');
    if(head[1]===2){if(!cfg.u||!cfg.p)throw new Error('Auth required');const uE=TE.encode(cfg.u),pE=TE.encode(cfg.p);await wW(sw,new Uint8Array([1,uE.length,...uE,pE.length,...pE]));[head,buf]=await rN(sr,buf,2);if(head[1]!==0)throw new Error('Auth failed');}
    const addr=sA(h),req=new Uint8Array(3+addr.length+2);req[0]=5;req[1]=1;req[2]=0;req.set(addr,3);req[3+addr.length]=pt>>8;req[4+addr.length]=pt&255;await wW(sw,req);
    [head,buf]=await rN(sr,buf,4);if(head[1]!==0)throw new Error('Connect failed');
    if(head[3]===1)[,buf]=await rN(sr,buf,4+2);
    else if(head[3]===4)[,buf]=await rN(sr,buf,16+2);
    else if(head[3]===3){let len;[len,buf]=await rN(sr,buf,1);[,buf]=await rN(sr,buf,len[0]+2);}
    else throw new Error('Invalid atyp');
    rL(sr);rL(sw);return mkC(s,buf);
  }catch(e){rL(sr);rL(sw);cl(s);throw e;}
}

async function hU(ws,vh,log){
  let sent=false,cache=E8;
  const ts=new TransformStream({transform(chunk,ctl){
    let d=u8(chunk);
    if(cache.length){const m=new Uint8Array(cache.length+d.length);m.set(cache);m.set(d,cache.length);d=m;cache=E8;}
    for(let i=0;i+2<=d.length;){const l=(d[i]<<8)|d[i+1];if(i+2+l>d.length){cache=d.slice(i);break;}ctl.enqueue(d.slice(i+2,i+2+l));i+=2+l;}
    if(cache.length>4096)cache=E8;
  }});
  ts.readable.pipeTo(new WritableStream({async write(udp){
    try{
      const resp=await fTO('https://cloudflare-dns.com/dns-query',{method:'POST',headers:{'content-type':'application/dns-message'},body:udp});
      const res=new Uint8Array(await rc(resp.arrayBuffer(),TO)),len=new Uint8Array([res.length>>8,res.length&255]);
      log(`doh success and dns message length is ${res.length}`);
      if(ws.readyState===WO){
        if(!sent){ws.send(cu(vh,len,res));sent=true;}
        else ws.send(cu(len,res));
      }
    }catch(e){log('dns udp has error'+e);}
  }})).catch(()=>{});
  return ts.writable.getWriter();
}

function pV(d){
  d=u8(d);const bl=d.byteLength;if(bl<24)return null;const ver=d[0];
  for(let i=0;i<16;i++)if(d[1+i]!==UB[i])return null;
  const optLen=d[17];if(18+optLen>=bl)return null;
  const cmd=d[18+optLen];if(cmd!==1&&cmd!==2)return null;const isUDP=cmd===2;
  const portIdx=19+optLen;if(portIdx+2>bl)return null;
  const port=(d[portIdx]<<8)|d[portIdx+1];let addrIdx=portIdx+2;if(addrIdx>=bl)return null;
  let addr='';const atyp=d[addrIdx++];
  if(atyp===1){if(addrIdx+4>bl)return null;addr=d.slice(addrIdx,addrIdx+4).join('.');addrIdx+=4;}
  else if(atyp===2){if(addrIdx>=bl)return null;const len=d[addrIdx++];if(len>253||addrIdx+len>bl)return null;addr=TD.decode(d.slice(addrIdx,addrIdx+len));addrIdx+=len;}
  else if(atyp===3){if(addrIdx+16>bl)return null;addr=bV6(d.buffer,d.byteOffset+addrIdx);addrIdx+=16;}
  else return null;
  return{addr,port,idx:addrIdx,ver,isUDP};
}

function pS(s){
  const isHttp=/^https?:\/\//i.test(s);s=s.replace(/^(socks5?|https?):\/\//i,'');
  const at=s.lastIndexOf('@'),hp=at!==-1?s.slice(at+1):s,[h,pt]=pH(hp);
  if(at===-1)return{u:'',p:'',h,pt,isHttp};
  const up=s.slice(0,at),ci=up.indexOf(':');
  return ci===-1?{u:'',p:'',h,pt,isHttp}:{u:up.slice(0,ci),p:up.slice(ci+1),h,pt,isHttp};
}

function mR(ws,eh){
  let closed=false;
  return new ReadableStream({
    start(c){
      ws.addEventListener('message',e=>{if(!closed)c.enqueue(e.data);});
      ws.addEventListener('close',()=>{clWS(ws);if(!closed){closed=true;try{c.close();}catch{}}});
      ws.addEventListener('error',e=>{if(!closed){closed=true;try{c.error(e);}catch{}}});
      const d=b64(eh);if(d&&!closed)c.enqueue(d);
    },
    cancel(){closed=true;clWS(ws);}
  });
}
