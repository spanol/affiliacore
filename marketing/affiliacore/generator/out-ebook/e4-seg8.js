const c=window.__pc;
const blob=await new Promise(r=>c.toBlob(r,'image/png'));
const file=new File([blob],'e4-oferta.png',{type:'image/png'});
const dt=new DataTransfer();dt.items.add(file);
const input=window.__capturedInput||[...document.querySelectorAll('input[type=file]')].find(i=>(i.accept||'').includes('image'));
input.files=dt.files;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
JSON.stringify({blob:blob.size,accept:input&&input.accept});