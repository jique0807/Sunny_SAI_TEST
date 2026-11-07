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
 if(!Number.isFinite(determinant)||Math.abs(determinant)<1e-8)return;
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
 const FRAME_COUNT=7,AUTO_REFRESH_MS=600000,ANIMATION_HOLD_MS=2600;
 let map=null,canvas=null,ctx=null,img=null,meta=null,visible=true,drawQueued=false;
 let objectUrl=null,requestNo=0,controller=null,playTimer=null,playGeneration=0,playing=false;
 const mapNode=$('radarLabMap'),frameRange=$('radarFrameRange');
 const clearImage=()=>{
  if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;
  img=null;meta=null;if(ctx&&canvas)ctx.clearRect(0,0,canvas.width,canvas.height);
 };
 const selectedFrame=()=>Number(frameRange.value||0);
 function syncFrameUI(){
  const offset=selectedFrame()*10;
  const mode=$('radarMode').value;
  $('radarFrameStep').textContent='10분 간격 · '+(mode==='case'?'09:00 기준 ':'최근 기준 ')+
   (offset===0?'기준 시각':'-'+offset+'분');
  $('radarEarlier').disabled=selectedFrame()>=FRAME_COUNT-1;
  $('radarLater').disabled=selectedFrame()<=0;
 }
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
  if(!projection?.containerPointFromCoords){
   status('카카오맵 좌표 변환 실패. 중첩을 표시하지 않습니다.');return;
  }
  const opacity=Number($('radarOpacity').value)/100;
  ctx.globalAlpha=opacity;
  try{
   const count=renderRadarImage(ctx,img,meta.coverage,p=>
    projection.containerPointFromCoords(new kakao.maps.LatLng(p.lat,p.lng)),dpr,12);
   if(!count)status('레이더 투영 정합 실패: 이미지를 표시하지 않았습니다.');
  }catch{
   ctx.clearRect(0,0,canvas.width,canvas.height);
   status('투영 변환 오류: 레이더 표시 중단');
  }
 }
 function queueDraw(){
  if(drawQueued)return;drawQueued=true;
  setTimeout(()=>{drawQueued=false;redraw();},180);
 }
 function stopPlayback(){
  playGeneration++;
  if(playTimer!==null){clearTimeout(playTimer);playTimer=null;}
  playing=false;
  $('radarPlay').disabled=false;
  $('radarPause').disabled=true;
 }
 async function load(){
  controller?.abort();controller=new AbortController();const run=++requestNo;
  clearImage();syncFrameUI();
  const mode=$('radarMode').value,frame=selectedFrame();
  status('기상청 HSR 실제 '+(frame===0?'기준':'-'+frame*10+'분')+
   ' 레이더 영상(10분 단위) 조회 중…');
  let nextUrl=null;
  try{
   // One response holds BOTH the actual PNG and its corresponding observation
   // timestamp and LCC image bounds: no metadata/image race conditions.
   const response=await fetch('/api/radar-overlay-frame?mode='+mode+'&frame='+frame,{
    credentials:'same-origin',cache:'no-store',signal:controller.signal});
   if(!response.ok){
    let reason='HTTP '+response.status;
    try{const x=await response.json();reason=String(x.error||reason).slice(0,130);}catch{}
    throw Error(reason);
   }
   const tm=response.headers.get('x-radar-obs-kst')||'';
   const proj=response.headers.get('x-radar-projection');
   const bounds=(response.headers.get('x-radar-coverage')||'').split(',').map(Number);
   const interval=response.headers.get('x-radar-interval-minutes');
   if(!/^\d{12}$/.test(tm)||proj!=='LCC'||interval!=='10'||
      bounds.length!==4||bounds.some(x=>!Number.isFinite(x))||
      bounds[2]<=bounds[0]||bounds[1]<=bounds[3])
    throw Error('레이더 영상의 관측시각/투영좌표 검증 실패');
   const blob=await response.blob();
   if(blob.type!=='image/png'||blob.size<33||blob.size>4*1024*1024)
    throw Error('원본 레이더 PNG 데이터 검증 실패');
   nextUrl=URL.createObjectURL(blob);const nextImage=new Image();
   await new Promise((resolve,reject)=>{
    nextImage.onload=resolve;nextImage.onerror=()=>reject(Error('PNG 디코딩 오류'));
    nextImage.src=nextUrl;
   });
   if(run!==requestNo){URL.revokeObjectURL(nextUrl);return false;}
   img=nextImage;objectUrl=nextUrl;nextUrl=null;
   meta={timeKst:tm,coverage:{left:bounds[0],top:bounds[1],
    right:bounds[2],bottom:bounds[3]}};
   redraw();
   const label=tm.slice(0,4)+'.'+tm.slice(4,6)+'.'+tm.slice(6,8)+' '+
    tm.slice(8,10)+':'+tm.slice(10,12)+' KST';
   status('실제 기상청 HSR 관측 · '+label+
    (mode==='case'?' · 과거 사례(현재 강수 아님)':' · 최근 관측 (제공 지연 가능)')+
    ' · 10분 간격 프레임 · 지도 중첩 시험');
   return true;
  }catch(e){
   if(nextUrl)URL.revokeObjectURL(nextUrl);
   if(e?.name==='AbortError'||run!==requestNo)return false;
   clearImage();status('해당 시각 실제 레이더 미표시 · '+(e?.message||'원본 수신 실패')+
    ' · 빈 시각에 가상의 강수영역을 표시하지 않습니다.');
   return false;
  }
 }
 function startPlayback(){
  stopPlayback();
  playing=true;const token=++playGeneration;
  $('radarPlay').disabled=true;$('radarPause').disabled=false;
  frameRange.value=String(FRAME_COUNT-1);syncFrameUI();
  async function advance(){
   if(!playing||token!==playGeneration)return;
   if(document.hidden){stopPlayback();return;}
   await load();
   if(!playing||token!==playGeneration)return;
   playTimer=setTimeout(()=>{
    if(!playing||token!==playGeneration)return;
    const current=selectedFrame();
    frameRange.value=String(current===0?FRAME_COUNT-1:current-1);
    syncFrameUI();void advance();
   },ANIMATION_HOLD_MS);
  }
  void advance();
 }
 async function initialize(){
  try{
   const r=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});
   if(!r.ok)throw Error('Sunny SAI 세션 생성 실패');
   const data=await r.json();const key=data.mapConfig?.kakao;
   if(!key)throw Error('카카오 지도 SDK 키가 없습니다.');
   const script=document.createElement('script');
   script.src='https://dapi.kakao.com/v2/maps/sdk.js?appkey='+encodeURIComponent(key)+'&autoload=false';
   script.onerror=()=>status('카카오 지도 SDK 연결 실패: 프리뷰 도메인 허용 확인 필요');
   script.onload=()=>{
    if(!window.kakao?.maps){status('카카오맵 SDK를 확인할 수 없습니다.');return;}
    kakao.maps.load(()=>{
     map=new kakao.maps.Map(mapNode,{center:new kakao.maps.LatLng(36.4,127.5),level:12});
     canvas=document.createElement('canvas');
     canvas.style.cssText='z-index:8;pointer-events:none;position:absolute;inset:0';
     mapNode.appendChild(canvas);ctx=canvas.getContext('2d');
     kakao.maps.event.addListener(map,'idle',queueDraw);
     kakao.maps.event.addListener(map,'center_changed',queueDraw);
     kakao.maps.event.addListener(map,'zoom_changed',queueDraw);
     window.addEventListener('resize',()=>{map.relayout();queueDraw();});
     void load();
    });
   };
   document.head.appendChild(script);
  }catch(e){status('지도 준비 실패 · '+String(e.message||e).slice(0,100));}
 }
 $('radarLoad')?.addEventListener('click',()=>{stopPlayback();void load();});
 $('radarMode')?.addEventListener('change',()=>{
  stopPlayback();frameRange.value='0';syncFrameUI();void load();
 });
 $('radarEarlier')?.addEventListener('click',()=>{
  stopPlayback();frameRange.value=String(Math.min(6,selectedFrame()+1));
  syncFrameUI();void load();
 });
 $('radarLater')?.addEventListener('click',()=>{
  stopPlayback();frameRange.value=String(Math.max(0,selectedFrame()-1));
  syncFrameUI();void load();
 });
 frameRange?.addEventListener('input',()=>{stopPlayback();syncFrameUI();void load();});
 $('radarPlay')?.addEventListener('click',startPlayback);
 $('radarPause')?.addEventListener('click',stopPlayback);
 $('radarToggle')?.addEventListener('click',()=>{
  visible=!visible;const b=$('radarToggle');
  b.setAttribute('aria-pressed',String(visible));b.textContent='중첩 '+(visible?'ON':'OFF');
  redraw();
 });
 $('radarOpacity')?.addEventListener('input',()=>{
  $('radarOpacityValue').textContent=$('radarOpacity').value+'%';queueDraw();
 });
 // Revisit provider only every 10 real minutes; frame timestamps are data time,
 // not animation speed. Do not auto-replace an explicitly selected older frame.
 const refresh=setInterval(()=>{
  if(!document.hidden&&!playing&&$('radarAutoUpdate')?.checked&&
   $('radarMode').value==='latest'&&selectedFrame()===0)
   void load();
 },AUTO_REFRESH_MS);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlayback();});
 window.addEventListener('pagehide',()=>{
  stopPlayback();clearInterval(refresh);controller?.abort();clearImage();
 });
 syncFrameUI();void initialize();
}
if(typeof document!=='undefined')startRadarLab();