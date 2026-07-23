const bin=Uint8Array.from(atob(window.__z),ch=>ch.charCodeAt(0));
const ds=new DecompressionStream('deflate');
const w=ds.writable.getWriter();w.write(bin);w.close();
const rd=ds.readable.getReader();const parts=[];let tot=0;
for(;;){const{done,value}=await rd.read();if(done)break;parts.push(value);tot+=value.length;}
const buf=new Uint8Array(tot);let off=0;for(const p of parts){buf.set(p,off);off+=p.length;}
const fills=JSON.parse(new TextDecoder().decode(buf));const x=window.__px;
for(const f of fills){x.fillStyle=f.c;x.fill(new Path2D(f.d));}
delete window.__z;
JSON.stringify({drawn:fills.length});