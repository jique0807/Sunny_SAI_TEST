// True-georeferenced Kakao overlays for TAAS 2024 historical pedestrian WMS PNG.
// Display-only: an image has no machine-verified per-pixel coordinates or live crash counts.
const SOURCES=Object.freeze({
 pedestrian:['navLayerPedestrianWms','navPedestrianWmsStatus','보행자 사고다발지역'],
 child:['navLayerChildWms','navChildWmsStatus','어린이 보행사고 다발지역'],
 elderly:['navLayerElderlyWms','navElderlyWmsStatus','노인 보행사고 다발지역']
});
const bounded=b=>b&&Object.values(b).every(Number.isFinite)&&b.east>b.west&&b.north>b.south&&
 b.east-b.west<=.20&&b.north-b.south<=.20&&b.east-b.west>=.0002&&b.north-b.south>=.0002;
export function visibleTaasBounds(map){
 if(!map||typeof map.getBounds!=='function')return null;
 try{
  const bounds=map.getBounds(),sw=bounds.getSouthWest(),ne=bounds.getNorthEast();
  const box={west:sw.getLng(),south:sw.getLat(),east:ne.getLng(),north:ne.getLat()};
  return bounded(box)&&box.west>=123&&box.east<=133&&box.south>=32&&box.north<=40?box:null;
 }catch{return null;}
}
export function initTaasPedestrianWmsOverlay({document,request,getMap,ensureMap}){
 let enabled=false,timer=null;
 const items=new Map(),version=Object.fromEntries(Object.keys(SOURCES).map(k=>[k,0]));
 const input=k=>document.getElementById(SOURCES[k][0]),status=k=>document.getElementById(SOURCES[k][1]);
 const say=(k,message)=>{const node=status(k);if(node)node.textContent=message;};
 const currentOpacity=()=>{
  const v=Number(document.getElementById('navDemoOpacity')?.value??45);
  return 1-Math.max(0,Math.min(100,Number.isFinite(v)?v:45))/100;
 };
 function remove(k){
  const entry=items.get(k);if(!entry)return;
  try{entry.overlay.setMap(null);}catch{}
  URL.revokeObjectURL(entry.objectUrl);items.delete(k);
 }
 function clear(){
  clearTimeout(timer);timer=null;
  for(const k of Object.keys(SOURCES)){version[k]++;remove(k);}
 }
 function position(k){
  const v=items.get(k);if(!v||!globalThis.kakao?.maps)return;
  try{
   const p=v.map.getProjection(),b=v.bounds;
   const nw=p.pointFromCoords(new kakao.maps.LatLng(b.north,b.west));
   const se=p.pointFromCoords(new kakao.maps.LatLng(b.south,b.east));
   const width=Math.round(Math.abs(se.x-nw.x)),height=Math.round(Math.abs(se.y-nw.y));
   if(width<1||height<1||width>20000||height>20000){remove(k);return;}
   v.image.style.width=width+'px';v.image.style.height=height+'px';
   v.image.style.opacity=String(currentOpacity());
  }catch{remove(k);}
 }
 function repaint(){
  const map=getMap();
  if(!enabled||!map||!globalThis.kakao?.maps){clear();return;}
  for(const k of Object.keys(SOURCES)){
   if(!input(k)?.checked){version[k]++;remove(k);}
   else if(items.get(k)?.map===map)position(k);
  }
  schedule();
 }
 async function load(k,map,bounds){
  if(!enabled||!input(k)?.checked)return;
  const key=[bounds.west,bounds.south,bounds.east,bounds.north].map(x=>x.toFixed(4)).join(':');
  if(items.get(k)?.map===map&&items.get(k)?.key===key){position(k);return;}
  const run=++version[k];
  say(k,'TAAS 2024년 사고다발지역 이미지 조회 중…');
  try{
   const response=await request(k,bounds);
   if(version[k]!==run||!enabled||!input(k)?.checked||getMap()!==map)return;
   if(!response?.blob||response.blob.type!=='image/png')throw Error('기관 이미지 유형 확인 실패');
   const url=URL.createObjectURL(response.blob);
   const image=document.createElement('img');
   image.src=url;image.alt='TAAS 2024년 '+SOURCES[k][2]+' 지도이미지';
   image.draggable=false;
   Object.assign(image.style,{pointerEvents:'none',display:'block',border:'0',maxWidth:'none',maxHeight:'none'});
   let overlay;
   try{
    overlay=new kakao.maps.CustomOverlay({map,position:new kakao.maps.LatLng(bounds.north,bounds.west),
     content:image,xAnchor:0,yAnchor:0,zIndex:9,clickable:false});
   }catch(error){URL.revokeObjectURL(url);throw error;}
   remove(k);items.set(k,{map,bounds,key,overlay,image,objectUrl:url});
   position(k);
   say(k,'2024년 과거 '+SOURCES[k][2]+' 지도 · 중심 행정구역 '+(response.regionCode||'미확인')+
    '만 표시 · 실시간 사고 아님');
  }catch(error){
   if(version[k]!==run)return;
   remove(k);
   say(k,'TAAS 지도 수신 실패 · '+String(error.message||'WMS 연결 확인 필요').slice(0,100));
  }
 }
 async function refresh(){
  if(!enabled)return;
  const map=getMap();
  if(!map){clear();return;}
  const bounds=visibleTaasBounds(map);
  if(!bounds){
   for(const k of Object.keys(SOURCES))if(input(k)?.checked){version[k]++;remove(k);say(k,'지도를 확대해 주세요 · 한 행정구역 단위로 조회합니다.');}
   return;
  }
  await Promise.all(Object.keys(SOURCES).filter(k=>input(k)?.checked).map(k=>load(k,map,bounds)));
 }
 function schedule(){
  clearTimeout(timer);
  timer=setTimeout(()=>{timer=null;void refresh();},500);
 }
 function updateOpacity(){for(const k of Object.keys(SOURCES))position(k);}
 function setAvailable(yes){
  enabled=Boolean(yes);
  for(const k of Object.keys(SOURCES)){
   const toggle=input(k);if(!toggle)continue;
   toggle.disabled=!enabled;
   toggle.closest('.nav-layer-row')?.classList.toggle('nav-layer-unavailable',!enabled);
   if(!enabled){toggle.checked=false;version[k]++;remove(k);}
   say(k,enabled?'2024년 TAAS 과거 사고지역 · 선택하면 현재 지도 범위 조회':
    'KOROAD 또는 카카오 서버 인증 미설정');
  }
 }
 for(const k of Object.keys(SOURCES)){
  input(k)?.addEventListener('change',async()=>{
   if(!input(k).checked){version[k]++;remove(k);say(k,'표출 해제');return;}
   if(!getMap())await ensureMap?.();
   schedule();
  });
 }
 setAvailable(false);
 return {setAvailable,repaint,schedule,clear,updateOpacity};
}
