const bin=Uint8Array.from(atob(window.__z),ch=>ch.charCodeAt(0));
const txt=await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'))).text();
const fills=JSON.parse(txt);const x=window.__px;
for(const f of fills){x.fillStyle=f.c;x.fill(new Path2D(f.d));}
delete window.__z;
JSON.stringify({drawn:fills.length});