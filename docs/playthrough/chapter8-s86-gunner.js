(()=>{if(window.__ap86)clearInterval(window.__ap86);
const keys=new Set();
const press=(k,on)=>{if(on&&!keys.has(k)){keys.add(k);window.dispatchEvent(new KeyboardEvent('keydown',{key:k}));}else if(!on&&keys.has(k)){keys.delete(k);window.dispatchEvent(new KeyboardEvent('keyup',{key:k}));}};
const A=n=>engine.find(n).items.map(i=>i.v);
window.__ap86log={shots:0,tgt:null};
window.__ap86=setInterval(()=>{try{
 if(engine.sceneName!=='S86_JAJO'){[' ','ArrowLeft','ArrowRight','ArrowUp'].forEach(k=>press(k,0));clearInterval(window.__ap86);return;}
 const X=A('ARRPOSX'),Y=A('ARRPOSY'),TA=A('ARRTOANGLE');
 const px=X[0]+32,py=Y[0]+28;
 let best=null,bd=1e9;
 const cands=[[1,30,26],[2,30,26],[3,30,26],[6,10,5],[7,10,5],[8,10,5]];
 for(const [i,ox,oy] of cands){const n=i<=3?'ANNCAR'+i:'ANNTORPEDO'+(i-6); const o=engine.find(n); if(!o.visible||!o.playing&&i<=3)continue;
  const tx=X[i]+ox,ty=Y[i]+oy; if(tx<0||tx>800||ty<0||ty>600)continue;
  const d=Math.hypot(tx-px,ty-py)-(i>=6?150:0); if(d<bd){bd=d;best=[i,tx,ty];}}
 if(!best){[' ','ArrowLeft','ArrowRight'].forEach(k=>press(k,0));return;}
 window.__ap86log.tgt=best[0];
 const want=Math.atan2(best[2]-py,best[1]-px)*180/Math.PI;
 let diff=((want-TA[0])%360+540)%360-180;
 if(diff>5){press(' ',0);press('ArrowLeft',0);press('ArrowRight',1);}
 else if(diff<-5){press(' ',0);press('ArrowRight',0);press('ArrowLeft',1);}
 else {press('ArrowLeft',0);press('ArrowRight',0);press(' ',1);}
}catch(e){window.__ap86log.err=String(e)}},10);return 'ap86 on';})()
