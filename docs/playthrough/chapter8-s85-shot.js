new Promise(res=>{const A=Number(window.__ang),P=Number(window.__pow);
const kd=k=>window.dispatchEvent(new KeyboardEvent('keydown',{key:k})), ku=k=>window.dispatchEvent(new KeyboardEvent('keyup',{key:k}));
const V=n=>engine.find(n).value.v; let st=0;
const t=setInterval(()=>{ if(V('VARPLAYABLE')!==1&&st===0) return;
 if(st===0){ if(V('VARDPOWANGLE')!==0){} st=1; kd(A>0?'ArrowRight':'ArrowLeft'); }
 else if(st===1){ if(Math.abs(V('VARDPOWANGLE'))>=Math.abs(A)){ku('ArrowRight');ku('ArrowLeft');st=2;kd('ArrowUp');} }
 else if(st===2){ if(V('VARDPOWER')>=P){window.__fired=[V('VARDPOWANGLE'),V('VARDPOWER')];ku('ArrowUp');kd(' ');st=3;} }
 else if(st===3){ if(V('VARPLAYABLE')===0){ku(' ');clearInterval(t);res('fired');} }
},2);});
