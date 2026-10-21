(()=>{
if(window.__px)clearInterval(window.__px);
const SPEED=Number(new URLSearchParams(location.search).get('speed')||1);
let M=Number(window.__pmargin||3);
const R=engine.find('ANNREKSIO');
const C=(o,m)=>o.call(m,[],{self:null,params:[]}).v;
// Reksio extents relative to its position, union over all frames
let ex=[1e9,1e9,-1e9,-1e9];
for(const e of R.ann.events){for(const fr of e.frames){const h=R.ann.images[fr.image]; if(!h||!h.width)continue;
 ex[0]=Math.min(ex[0],h.x+fr.dx);ex[1]=Math.min(ex[1],h.y+fr.dy);ex[2]=Math.max(ex[2],h.x+fr.dx+h.width);ex[3]=Math.max(ex[3],h.y+fr.dy+h.height);}}
const al=engine.find('IMGALPHA'); const ab=al.bounds();
const alphaAt=(x,y)=>{const lx=x-ab.x,ly=y-ab.y; if(lx<0||ly<0||lx>=ab.w||ly>=ab.h)return 0; return ab.sprite.rgba[(ly*ab.w+lx)*4+3];};
const chickens=[];for(let i=1;i<=13;i++){const a=engine.find('ANNKURA_'+i); if(a&&a.event)chickens.push(a);}
function boxAt(a,k){ // chicken box at Reksio step k (50ms game each)
 const N=a.event.frames.length; const adv=Math.floor((a.acc+50*k)/62.5);
 let f=a.frame+adv; if(f>=N){f=(f-N)%N;} // after finish, restart at 0
 const fr=a.event.frames[f]; const h=a.ann.images[fr.image];
 return [a.x+h.x+fr.dx, a.y+h.y+fr.dy, h.width, h.height];}
function plan(){
 const x0=C(R,'GETPOSITIONX'), y0=C(R,'GETPOSITIONY');
 const GX=Math.ceil((x0+40)/4)+2, gxo=x0-4*Math.floor((x0+40)/4); // grid: x=gxo+4i
 const gyo=y0-4*Math.floor(y0/4), GY=Math.floor(600/4)+1;
 const K=Number(window.__pK||420);
 const W=GX*GY;
 const ok=new Uint8Array(W); // walkable statically
 for(let j=0;j<GY;j++)for(let i=0;i<GX;i++){const x=gxo+4*i,y=gyo+4*j; ok[j*GX+i]=(y>60&&y<560&&x>-40&&x<800&&alphaAt(x,y)!==38)?1:0;}
 const par=[]; let cur=new Uint8Array(W); const si=Math.round((x0-gxo)/4), sj=Math.round((y0-gyo)/4);
 cur[sj*GX+si]=1; par.push(null);
 const blocked=(k)=>{const b=new Uint8Array(W);
  for(const a of chickens){const [bx,by,bw,bh]=boxAt(a,k);
   // reksio pos p collides if p+ex overlaps box inflated by M
   const xmin=bx-M-ex[2], xmax=bx+bw+M-ex[0], ymin=by-M-ex[3], ymax=by+bh+M-ex[1];
   const i0=Math.max(0,Math.ceil((xmin-gxo)/4)), i1=Math.min(GX-1,Math.floor((xmax-gxo)/4));
   const j0=Math.max(0,Math.ceil((ymin-gyo)/4)), j1=Math.min(GY-1,Math.floor((ymax-gyo)/4));
   for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)b[j*GX+i]=1;}
  return b;};
 const D=[[0,0],[-1,0],[0,-1],[0,1],[1,0]];
 for(let k=1;k<=K;k++){
  const bl=blocked(k), bl2=blocked(k-1); const nx=new Uint8Array(W); const p=new Int8Array(W).fill(-1);
  for(let c=0;c<W;c++){ if(!cur[c])continue; const i=c%GX,j=(c/GX)|0;
   for(let d=0;d<5;d++){const ni=i+D[d][0],nj=j+D[d][1]; if(ni<0||nj<0||ni>=GX||nj>=GY)continue; const n=nj*GX+ni;
    if(nx[n]||!ok[n]||bl[n]||bl2[n])continue; nx[n]=1;p[n]=d;
    if(gxo+4*ni<28){ // goal
      par.push(p); const path=[]; let cc=n; for(let kk=k;kk>=1;kk--){const dd=par[kk][cc]; path.push(dd); const ci=cc%GX,cj=(cc/GX)|0; cc=(cj-D[dd][1])*GX+(ci-D[dd][0]);}
      path.reverse(); return {path,x0,y0};}
   }}
  par.push(p); cur=nx;}
 return null;}
window.__plan=plan;
const keyOf=[null,'ArrowLeft','ArrowUp','ArrowDown','ArrowRight'];
const keys=new Set();
const press=(k,on)=>{if(on&&!keys.has(k)){keys.add(k);window.dispatchEvent(new KeyboardEvent('keydown',{key:k}));}else if(!on&&keys.has(k)){keys.delete(k);window.dispatchEvent(new KeyboardEvent('keyup',{key:k}));}};
window.__plog={plans:0,fails:0,len:0};
let P=null,T0=0,lastPlan=0;
const D=[[0,0],[-4,0],[0,-4],[0,4],[4,0]];
window.__px=setInterval(()=>{try{
 if(engine.sceneName!=='S71_DROGA'){keyOf.forEach(k=>k&&press(k,0));clearInterval(window.__px);return;}
 const now=performance.now();
 if(engine.find('VARDETECTCOLLISION').value.v===0&&!window.__snap){const rb=R.bounds();window.__snap={r:[rb.x,rb.y,rb.w,rb.h,R.call('GETEVENTNAME',[],{self:null,params:[]}).v],c:chickens.map(a=>{const b=a.bounds();return [a.name,b.x,b.y,b.w,b.h,a.paused]}).filter(q=>q[5])};}
 const x=C(R,'GETPOSITIONX'),y=C(R,'GETPOSITIONY');
 if(!P||now-lastPlan>Number(window.__preplan||400)){
  const t=performance.now(); M=Number(window.__pmargin||3); let r=plan(); if(!r){M=1; r=plan(); window.__plog.fallback=(window.__plog.fallback||0)+1;} window.__plog.ms=performance.now()-t; lastPlan=performance.now();
  if(r){P={path:r.path,pos:[]};let px=r.x0,py=r.y0;P.pos.push([px,py]);for(const d of r.path){px+=D[d][0];py+=D[d][1];P.pos.push([px,py]);}T0=t;window.__plog.plans++;window.__plog.len=r.path.length;}
  else {window.__plog.fails++; P=null; keyOf.forEach(k=>k&&press(k,0)); return;}
 }
 const k=Math.max(0,Math.floor((now-T0)*SPEED/50));
 const tgt=P.pos[Math.min(k+1,P.pos.length-1)];
 let want=null; const dx=tgt[0]-x, dy=tgt[1]-y;
 if(Math.abs(dx)>=Math.abs(dy)&&dx!==0) want=dx<0?'ArrowLeft':'ArrowRight'; else if(dy!==0) want=dy<0?'ArrowUp':'ArrowDown';
 for(const kk of keyOf) if(kk) press(kk,kk===want);
 (window.__ring||(window.__ring=[])).push([Math.round(now),x,y,k,tgt[0],tgt[1],want&&want[5]]); if(window.__ring.length>200)window.__ring.shift();
}catch(e){window.__plog.err=String(e&&e.stack||e)}},5);
return 'planner on ex='+ex.join(',');})()
