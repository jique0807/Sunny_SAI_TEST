import {koLccPixelToLatLng,verifyKoLccProjection,imageAffineMatrix} from './gk2a-georef.mjs';
// One verified layer at a time. No satellite pixels are painted unless the source
// image dimensions and official KO LCC projection are both verified.
const names=Object.freeze({rr:['navGk2aRr','navGk2aRrStatus'],ci:['navGk2aCi','navGk2aCiStatus'],fog:['navGk2aFog','navGk2aFogStatus']});
export function canMapGk2aImage(meta){
 return meta?.status==='received'&&meta.area==='ko'&&meta.width===900&&meta.height===900&&
 meta.georeference==='verified_ko_lcc_900'&&verifyKoLccProjection();
}
export function renderKoSatelliteMesh(ctx,image,project,mesh=45){
 if(image?.naturalWidth!==900||image?.naturalHeight!==900||!verifyKoLccProjection())
  throw Error('GK2A raster geometry unverified');
 let drawn=0;
 const coord=(x,y)=>{const geo=koLccPixelToLatLng(x,y);return project(geo);};
 for(let y=0;y<900;y+=mesh)for(let x=0;x<900;x+=mesh){
  const v=Math.min(mesh,900-x),w=Math.min(mesh,900-y);
  const s0={x,y},s1={x:x+v,y},s2={x,y:y+w},s3={x:x+v,y:y+w};
  const p0=coord(x,y),p1=coord(x+v,y),p2=coord(x,y+w),p3=coord(x+v,y+w);
  if([p0,p1,p2,p3].some(p=>!Number.isFinite(p?.x)||!Number.isFinite(p?.y)))continue;
  for(const [src,dst]of [[[s0,s1,s2],[p0,p1,p2]],[[s3,s2,s1],[p3,p2,p1]]]){
   const affine=imageAffineMatrix(src,dst);
   ctx.save();ctx.beginPath();ctx.moveTo(dst[0].x,dst[0].y);
   ctx.lineTo(dst[1].x,dst[1].y);ctx.lineTo(dst[2].x,dst[2].y);ctx.closePath();ctx.clip();
   ctx.setTransform(affine.a,affine.b,affine.c,affine.d,affine.e,affine.f);
   ctx.drawImage(image,x,y,v,w,x,y,v,w);
   ctx.restore();drawn++;
  }
 }
 return drawn;
}
export function initGk2aOverlay({document,getMap,ensureMap,waitForSession}){
 let current=null,map=null,canvas=null,image=null,objectUrl=null,seq=0,available=false;
 const get=id=>document.getElementById(id),status=k=>get(names[k][1]),toggle=k=>get(names[k][0]);
 function say(k,s){if(status(k))status(k).textContent=s;}
 function drop(){
  canvas?.remove();canvas=null;image=null;map=null;
  if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
 }
 function redraw(){
  if(!canvas||!image||!map)return;
  const p=map.getProjection?.(),root=map.getNode?.();
  if(!p||!root)return;
  const w=root.clientWidth,h=root.clientHeight;
  if(!w||!h)return;
  canvas.width=w;canvas.height=h;canvas.style.width=w+'px';canvas.style.height=h+'px';
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const opacity=Number(get('navDemoOpacity')?.value??45);
  ctx.globalAlpha=1-Math.max(0,Math.min(100,opacity))/100;
  try{renderKoSatelliteMesh(ctx,image,pt=>{
   const pnt=p.containerPointFromCoords(new kakao.maps.LatLng(pt.lat,pt.lng));
   return {x:pnt.x,y:pnt.y};
  });}catch{if(current){say(current,'위성 좌표 정합 확인 실패 · 표출 중지');stop();}}
 }
 function stop(){
  seq++;drop();
  if(current){const control=toggle(current);if(control)control.checked=false;current=null;}
 }
 async function show(k){
  if(!available||!toggle(k)?.checked)return;
  if(current&&current!==k){const other=toggle(current);if(other)other.checked=false;stop();}
  current=k;const id=++seq;say(k,'위성 L2 PNG·좌표정보 확인 중…');
  try{
   await waitForSession?.();
   const head=await fetch('/api/gk2a-layer-status?product='+k,{credentials:'same-origin',cache:'no-store'});
   const meta=await head.json();
   if(id!==seq||current!==k)return;
   if(!canMapGk2aImage(meta)){
    const shape=meta?.width&&meta?.height?meta.width+'×'+meta.height:'영상 미수신';
    say(k,k==='ci'?'CI ELA 영역·투영 정합 미검증 · 표출 보류':
      'PNG '+shape+' · 공식 KO 900×900 격자와 정합 검증 전 · 표출 보류');
    stop();return;
   }
   if(!getMap())await ensureMap?.();
   const liveMap=getMap();if(!liveMap?.getProjection?.()||!liveMap.getNode?.())throw Error('Kakao map not ready');
   const resp=await fetch('/api/gk2a-layer-image?product='+k,{credentials:'same-origin',cache:'no-store'});
   if(!resp.ok||!String(resp.headers.get('content-type')||'').includes('image/png'))throw Error('No PNG');
   const blob=await resp.blob();if(blob.size>5_000_000)throw Error('PNG too large');
   const url=URL.createObjectURL(blob);
   const picture=new Image();picture.src=url;
   await picture.decode();
   if(id!==seq||current!==k){URL.revokeObjectURL(url);return;}
   if(picture.naturalWidth!==900||picture.naturalHeight!==900){URL.revokeObjectURL(url);throw Error('Unverified PNG dimensions');}
   drop();current=k;image=picture;objectUrl=url;map=liveMap;
   canvas=document.createElement('canvas');canvas.className='sunny-gk2a-map-overlay';
   Object.assign(canvas.style,{position:'absolute',left:'0',top:'0',pointerEvents:'none',zIndex:'5'});
   map.getNode().append(canvas);
   kakao.maps.event.addListener(map,'idle',redraw);redraw();
   say(k,'GK2A 실제 위성영상 중첩 · 관측 '+meta.observationUTC+' UTC');
  }catch{if(current===k){say(k,'위성영상 수신/정합 실패 · 미표시');stop();}}
 }
 for(const k of Object.keys(names))toggle(k)?.addEventListener('change',()=>{
  if(toggle(k).checked)void show(k);else if(current===k){stop();say(k,'표출 해제');}
 });
 get('navDemoOpacity')?.addEventListener('input',redraw);
 function setAvailable(v){available=Boolean(v);for(const k of Object.keys(names)){
  const t=toggle(k);if(!t)continue;t.disabled=!available;
  t.closest('.nav-layer-row')?.classList.toggle('nav-layer-unavailable',!available);
  say(k,available?'API 키 등록 · 선택하면 실제 수신/좌표 정합 검사':'KMA API 키 미등록');
 }}
 function setMap(next){if(map&&map!==next){drop();if(current){say(current,'지도 변경 · 다시 선택 필요');toggle(current).checked=false;current=null;}}}
 window.addEventListener('resize',redraw);window.addEventListener('pagehide',stop);
 return {setAvailable,setMap,redraw,clear:stop};
}
