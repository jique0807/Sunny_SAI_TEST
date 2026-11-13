// TMAP pedestrian facilities are only route locations; no hazard is inferred.
const SYMBOLS=Object.freeze({'횡단보도':'🚸','지하보도':'🚇','육교':'🌉','계단':'🪜','일반 보행자도로':'🚶'});
const safe=f=>f?.status==='location_only'&&Object.hasOwn(SYMBOLS,f.kind)&&Number.isFinite(f.lat)&&f.lat>=32&&f.lat<=40&&Number.isFinite(f.lng)&&f.lng>=123&&f.lng<=133;
export function displayableWalkingFacilities(route){
 if(route?.travelMode!=='walking'||!Array.isArray(route.facilities))return [];
 const seen=new Set(),result=[];
 for(const f of route.facilities){
  if(!safe(f))continue;
  const id=f.kind+':'+f.lat.toFixed(5)+','+f.lng.toFixed(5);
  if(seen.has(id))continue;
  seen.add(id);result.push({kind:f.kind,lat:f.lat,lng:f.lng,icon:SYMBOLS[f.kind],verifiedHazard:false});
  if(result.length>=40)break;
 }
 return result;
}
export function initWalkingFacilityOverlay({document,getRoute,getContext,ensureMap}){
 const toggle=document.getElementById('navLayerWalkFacilities');
 const status=document.getElementById('navWalkFacilitiesStatus');
 const badge=document.getElementById('navLayerWalkFacilitiesReception');
 const setLayerReception=(unused,state)=>{if(badge){badge.dataset.state=state;badge.textContent=({received:'연결',empty:'자료없음',failed:'연결실패',waiting:'대기 중'})[state]||'검사 전';}};
 const say=t=>{if(status)status.textContent=t};
 let overlays=[];
 function clear(){for(const x of overlays)try{x.kakao?x.overlay.setMap(null):x.map.removeLayer(x.overlay)}catch{}overlays=[];}
 function repaint(){
  clear();if(!toggle?.checked)return;
  const route=getRoute();
  if(route?.travelMode!=='walking'){say('도보 경로 탐색 후 위치를 표시합니다.');setLayerReception('navLayerWalkFacilities','waiting');return;}
  const items=displayableWalkingFacilities(route);
  if(!items.length){say('보행시설 위치자료 미수신 · 현장 위험 여부 미확인');setLayerReception('navLayerWalkFacilities','empty');return;}
  const context=getContext();
  if(!context){say('지원하는 지도를 먼저 선택해주세요.');setLayerReception('navLayerWalkFacilities','waiting');return;}
  for(const f of items){
   const label=f.kind+' 위치 참고 · 현장 통행 및 위험상태 미확인';
   if(context.type==='kakao'&&globalThis.kakao?.maps){
    const button=document.createElement('button');
    button.type='button';button.className='sunny-walk-facility-pin';button.textContent=f.icon;button.title=label;
    button.setAttribute('aria-label',label);button.addEventListener('click',()=>say(label));
    overlays.push({kakao:true,overlay:new kakao.maps.CustomOverlay({map:context.map,position:new kakao.maps.LatLng(f.lat,f.lng),content:button,xAnchor:.5,yAnchor:.5,zIndex:14,clickable:true})});
   }else if(context.type==='leaflet'&&globalThis.L){
    const marker=L.marker([f.lat,f.lng],{icon:L.divIcon({html:'<span class="sunny-walk-facility-emoji" aria-hidden="true">'+f.icon+'</span>',className:'sunny-walk-facility-leaflet',iconSize:[34,34],iconAnchor:[17,17]})}).addTo(context.map).bindPopup(label);
    overlays.push({map:context.map,overlay:marker});
   }
  }
  say(overlays.length+'개 보행시설 위치 표시 · 현장 안전정보 아님');
  setLayerReception('navLayerWalkFacilities',overlays.length?'received':'waiting');
 }
 toggle?.addEventListener('change',()=>{
  if(!toggle.checked){clear();say('표출 해제');setLayerReception('navLayerWalkFacilities','waiting');return;}
  if(!getContext()&&getRoute()?.travelMode==='walking')Promise.resolve().then(()=>ensureMap?.()).then(repaint).catch(repaint);
  else repaint();
 });
 say('도보 경로 탐색 후 표시 · 현장 상태 미확인');
 return {repaint,clear,displayedCount:()=>overlays.length};
}
