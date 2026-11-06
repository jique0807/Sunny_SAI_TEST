// Experimental KMA HSR imagery over Kakao map. All imagery is received from
// the official KMA no-basemap endpoint; never synthesize precipitation pixels.
const $=id=>document.getElementById(id);
const status=s=>{if($('status'))$('status').textContent=s;};
const baseRad=Math.PI/180;
const slat1=30*baseRad,slat2=60*baseRad,lon0=126*baseRad;
const n=Math.log(Math.cos(slat1)/Math.cos(slat2))/
 Math.log(Math.tan(Math.PI/4+slat2/2)/Math.tan(Math.PI/4+slat1/2));
const F=(Math.cos(slat1)*Math.tan(Math.PI/4+slat1/2)**n)/n;
const radius=6371008.77, rho0=radius*F;
export function radarLccToLatLng(x,y){
 if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Invalid KMA LCC coordinate');
 const yy=rho0-y,rho=Math.hypot(x,yy);
 if(!rho)throw Error('Out of domain');
 const lat=(2*Math.atan((radius*F/rho)**(1/n))-Math.PI/2)/baseRad;
 const lng=(lon0+Math.atan2(x,yy)/n)/baseRad;
 return {lat,lng};
}
export function radarProjectedPixel(u,v,w,h,bounds){
 if(!Number.isFinite(u)||!Number.isFinite(v)||!(w>0&&h>0)||!bounds)
  throw Error('Invalid radar image geometry');
 return{ x:bounds.left+(u/w)*(bounds.right-bounds.left),
  y:bounds.top-(v/h)*(bounds.top-bounds.bottom)};
}
export function affineTriangle(ctx,img,src,dest,dpr=1){
 const [[u1,v1],[u2,v2],[u3,v3]]=src;
 const [[x1,y1],[x2,y2],[x3,y3]]=dest;
 const determinant=(u1-u3)*(v2-v3)-(u2-u3)*(v1-v3);
 if(!Number.isFinite(determin)||Math.abs(determin)<1e-8)return;
 const a=((x1-x3)*(v2-v3)-(x2-x3)*(v1-v3))/determinant;
 const c=((u1-u3)*(x2-x3)-(u2-u3)*(x1-x3))/determinant;
 const b=((y1-y3)*(v2-v3)-(y2-y3)*(v1-v3))/determinant;
 const d=((u1-u3)*(y2-y3)-(u2-u3)*(y1-y3))/determinant;
 const e=x3-a*u3-c*v3,f=y3-b*u3-d*v3;
 if([a,b,c,d,e,f].some(x=>!Number.isFinite(x)))return;
 ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineTo(x3,y3);
 ctx.closePath();ctx.clip();
 ctx.transform(a,b,c,d,e,f);ctx.drawImage(img,0,0);ctx.restore();
}
export function renderRadarImage(ctx,img,bounds,project,dpr=1,mesh=12){
 if(!img||!bounds||typeof project!=='function')return 0;
 const width=img.naturalWidth||img.width,height=img.naturalHeight||img.height;
 if(!width||!height)return 0;
 let drawn=0;
 const stepX=width/mesh,stepY=height/mesh;
 for(let row=0;row<mesh;row++)for(let col=0;col<mesh;col++){
  const u0=col*stepX,u1=(col+1)*stepX,v0=row*stepY,v1=(row+1)*stepY;
  const source=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]];
  const dest=source.map(([u,v])=>{
   const p=radarProjectedPixel(u,v,width,height,bounds);
   return project(radarLccToLatLng(p.x,p.y));
  });
  if(dest.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))continue;
  const d=dest.map(p=>[p.x,p.y]);
  affineTriangle(ctx,img,[source[0],source[1],source[2]],[d[0],d[1],d[2]],dpr);
  affineTriangle(ctx,img,[source[0],source[2],source[3]],[d[0],d[2],d[3]],dpr);
  drawn++;
 }
 return drawn;
}
export function startRadarLab(){
 let map=null,canvas=null,ctx=null,img=null,meta=null,visible=true,drawQueued=false;
 let objectUrl=null,requestNo=0,controller=null;
 const mapNode=$('radarLabMap');
 const clearImage=()=>{
  if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;
  img=null;meta=null;if(ctx&&canvas)ctx.clearRect(0,0,canvas.width,canvas.height);
 };
 function redraw(){
  if(!map||!ctx||!canvas)return;
  const width=mapNode.clientWidth,height=mapNode.clientHeight;
  if(!width||!height)return;
  const dpr=Math.min(2,Math.max(1,devicePixelRatio||1));
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  canvas.style.width=width+'px';canvas.style.height=height+'px';
  ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!visible||!img||!meta)return;
  const projection=map.getProjection?.();
  if(!projection?.containerPointFromCoords){status('카카오맵 좌표 변환 실패. 중첩을 표시하지 않습니다.');return;}
  const opacity=Number($('radarOpacity').value)/100;
  ctx.globalAlpha=opacity;
  try{
   const count=renderRadarImage(ctx,img,meta.coverage,p=>
    projection.containerPointFromCoords(new kakao.maps.LatLng(p.lat,p.lng)),dpr,12);
   if(!count)status('레이더 투영 정합 실패: 이미지를 표시하지 않았습니다.');
  }catch{ctx.clearRect(0,0,canvas.width,canvas.height);status('투영 변환 오류: 레이더 표시 중단');}
 }
 function queueDraw(){
  if(drawQueued)return;drawQueued=true;
  setTimeout(()=>{drawQueued=false;redraw();},180);
 }
 async function load(){
  controller?.abort();controller=new AbortController();const run=++requestNo;
  clearImage();status('기상청 레이더 메타데이터 및 투명 PNG 검증 중…');
  const mode=$('radarMode').value;
  try{
   const [metaRes,imageRes]=await Promise.all([
    fetch('/api/radar-overlay-meta?mode='+mode,{credentials:'same-origin',cache:'no-store',signal:controller.signal}),
    fetch('/api/radar-overlay-image?mode='+mode,{credentials:'same-origin',cache:'no-store',signal:controller.signal})
   ]);
   if(!metaRes.ok||!imageRes.ok){
    let reason='HTTP '+Math.max(metaRes.status,imageRes.status);
    try{const x=await (!metaRes.ok?metaRes:imageRes).json();reason=String(x.error||reason).slice(0,120);}catch{}
    throw Error(reason);
   }
   const info=await metaRes.json(),blob=await imageRes.blob();
   if(info.product!=='KMA HSR'||info.projection!=='LCC'||!info.coverage||
      typeof info.timeKst!=='string'||!blob.size||blob.size>4*1024*1024)
    throw Error('레이더 영상 또는 좌표 메타데이터 검증 실패');
   if(imageRes.headers.get('x-radar-obs-kst')!==info.timeKst)
    throw Error('레이더 영상과 발표시각이 일치하지 않습니다.');
   const nextUrl=URL.createObjectURL(blob),nextImage=new Image();
   await new Promise((resolve,reject)=>{nextImage.onload=resolve;
    nextImage.onerror=()=>reject(Error('PNG 디코딩 오류'));nextImage.src=nextUrl;});
   if(run!==requestNo){URL.revokeObjectURL(nextUrl);return;}
   img=nextImage;meta=info;objectUrl=nextUrl;redraw();
   const t=info.timeKst;const label=t.slice(0,4)+'.'+t.slice(4,6)+'.'+t.slice(6,8)+' '+
    t.slice(8,10)+':'+t.slice(10,12)+' KST';
   status('실제 기상청 HSR 배경 없는 PNG 수신 · '+label+
    (mode==='case'?' · 과거 사례(현재 강수 아님)':' · 최근 관측')+
    ' · LCC 지도 정합 시험 중');
  }catch(e){
   if(e?.name==='AbortError'||run!==requestNo)return;
   clearImage();status('레이더 미표시 · '+(e?.message||'원본 수신 실패')+
    ' · 임의 강수영역은 표시하지 않습니다.');
  }
 }
 async function initialize(){
  try{
   const r=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});
   if(!r.ok)throw Error('Sunny SAI 세션 생성 실패');
   const data=await r.json();
   const key=data.mapConfig?.kakao;
   if(!key)throw Error('카카오 지도 SDK 키가 없습니다.');
   const script=document.createElement('script');
   script.src='https://dapi.kakao.com/v2/maps/sdk.js?appkey='+encodeURIComponent(key)+'&autoload=false';
   script.onerror=()=>status('카카오 지도 SDK 연결 실패: 프리뷰 도메인 허용 확인 필요');
   script.onload=()=>{
    if(!window.kakao?.maps){status('카카오맵 SDK를 확인할 수 없습니다.');return;}
    kakao.maps.load(()=>{
     map=new kakao.maps.Map(mapNode,{center:new kakao.maps.LatLng(36.4,127.5),level:12});
     canvas=document.createElement('canvas');canvas.style.cssText='z-index:8;pointer-events:none;position:absolute;inset:0';
     mapNode.appendChild(canvas);ctx=canvas.getContext('2d');
     kakao.maps.event.addListener(map,'idle',queueDraw);
     kakao.maps.event.addListener(map,'center_changed',queueDraw);
     kakao.maps.event.addListener(map,'zoom_changed',queueDraw);
     window.addEventListener('resize',()=>{map.relayout();queueDraw();});
     load();
    });
   };
   document.head.appendChild(script);
  }catch(e){status('지도 준비 실패 · '+String(e.message||e).slice(0,100));}
 }
 $('radarLoad')?.addEventListener('click',load);
 $('radarMode')?.addEventListener('change',load);
 $('radarToggle')?.addEventListener('click',()=>{
  visible=!visible;const b=$('radarToggle');
  b.setAttribute('aria-pressed',String(visible));b.textContent='중첩 '+(visible?'ON':'OFF');
  redraw();
 });
 $('radarOpacity')?.addEventListener('input',()=>{
  $('radarOpacityValue').textContent=$('radarOpacity').value+'%';queueDraw();
 });
 window.addEventListener('pagehide',()=>{controller?.abort();clearImage();});
 initialize();
}
if(typeof document!=='undefined')startRadarLab();
