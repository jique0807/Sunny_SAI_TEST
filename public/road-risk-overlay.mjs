// Display only officially-supplied, geo-located KMA road-risk records.
// No guessed node-link geometry or precipitation-derived icing risk.
export const RISK_COLOR=Object.freeze({1:'#eab432',2:'#ee851b',3:'#d52d36'});
export function displayableRisks(locations,showIce,showVisibility){
 if(!Array.isArray(locations))return [];
 return locations.filter(x=>x&&[1,2,3].includes(x.risk)&&
  ((showIce&&x.kind==='ice')||(showVisibility&&x.kind==='visibility'))&&
  Array.isArray(x.geometry?.points)&&x.geometry.points.length>0&&
  x.geometry.points.every(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat>=32&&p.lat<=40&&p.lng>=123&&p.lng<=133));
}
export function initRoadRiskOverlay({query,getContext,ensureMap}){
 const ice=document.getElementById('navLayerroad');
 const visibility=document.getElementById('navLayerfog');
 const road=document.getElementById('navRoadRoute');
 const button=document.getElementById('navRoadRiskRefresh');
 const status=document.getElementById('navRoadRiskStatus');
 let available=false,data=null,items=[],pending=0;
 const enabled=()=>Boolean(ice?.checked||visibility?.checked);
 const message=s=>{if(status)status.textContent='기상청 도로위험: '+s;};
 function clear(){
  for(const x of items){try{x.kakao?x.item.setMap(null):x.map.removeLayer(x.item);}catch{}}
  items=[];
 }
 function repaint(){
  clear();
  if(!enabled()||!data)return;
  const context=getContext();
  if(!context){message('카카오 지도 또는 일반지도를 선택해주세요');return;}
  const records=displayableRisks(data.locations,ice.checked,visibility.checked);
  if(!records.length){
   const reason=data.status==='unmapped'?'ZIP에 위험도는 있으나 좌표·도로 형상이 확인되지 않았습니다. 잘못된 지도 표시는 하지 않습니다':
    data.status==='unsupported_format'?'원본 ZIP 자료구조가 확인되지 않아 위치 표출을 중단했습니다':
    '선택한 유형에서 위치가 검증된 위험구간 없음 (안전하다는 뜻이 아님)';
   message(data.roadName+' · '+reason);return;
  }
  for(const item of records){
   const points=item.geometry.points,seriousness=item.risk===3?'위험':item.risk===2?'주의':'관심';
   const title=(item.kind==='ice'?'도로살얼음 발생 가능성':'가시거리 위험')+' '+seriousness+
    ' · '+data.roadName+(item.linkId?' · 링크 '+item.linkId:'');
   const color=RISK_COLOR[item.risk],line=item.geometry.type==='line'&&points.length>1;
   if(context.type==='kakao'&&window.kakao?.maps){
    if(line){
     const overlay=new kakao.maps.Polyline({map:context.map,
      path:points.map(p=>new kakao.maps.LatLng(p.lat,p.lng)),
      strokeWeight:7,strokeColor:color,strokeOpacity:.88,zIndex:6});
     kakao.maps.event.addListener(overlay,'click',()=>message(title+' · 예측정보, 실제 결빙 확정 아님'));
     items.push({kakao:true,item:overlay});
    }else{
     const marker=new kakao.maps.Marker({map:context.map,position:new kakao.maps.LatLng(points[0].lat,points[0].lng),title});
     kakao.maps.event.addListener(marker,'click',()=>message(title+' · 위치 지점, 구간 전체를 의미하지 않음'));
     items.push({kakao:true,item:marker});
    }
   }else if(context.type==='leaflet'&&window.L){
    const geometry=line?L.polyline(points.map(p=>[p.lat,p.lng]),{color,weight:7,opacity:.88}):
      L.circleMarker([points[0].lat,points[0].lng],{radius:8,color,fillColor:color,weight:2,fillOpacity:.9});
    geometry.addTo(context.map).bindPopup(title+' · 기상청 예측, 실제 결빙/도로통제 확인 자료 아님');
    items.push({map:context.map,item:geometry});
   }
  }
  message(data.roadName+' · '+records.length+'개 위치 검증 위험 '+(records.some(x=>x.kind==='ice')?'살얼음 ':'')+
   (records.some(x=>x.kind==='visibility')?'가시거리':'')+' 표출 · 기상청 예측, 실제 결빙 확정 아님');
 }
 async function load(){
  clear();data=null;const request=++pending;
  if(!enabled())return;
  if(!available){message('KMA_API_KEY 미설정');return;}
  message('기상청 도로위험 노선별 ZIP 수신·위치 확인 중');
  if(button)button.disabled=true;
  try{
   const d=await query(road?.value||'001');
   if(request!==pending)return;
   data=d;
   await ensureMap();
   if(request===pending)repaint();
  }catch(e){
   if(request===pending)message('위험정보 조회 불가 · '+String(e?.message||'API 활용신청·자료 제공기간 확인').slice(0,155));
  }finally{if(request===pending&&button)button.disabled=!available;}
 }
 function setAvailable(value){
  available=Boolean(value);
  for(const checkbox of [ice,visibility])if(checkbox){
   checkbox.disabled=!available;
   if(!available)checkbox.checked=false;
  }
  if(road)road.disabled=!available;
  if(button)button.disabled=!available;
  if(!available){clear();data=null;message('KMA_API_KEY 설정 필요');}
  else message('KMA 키 등록 · 도로위험 API 별도 활용승인 여부는 실제 조회 시 확인');
 }
 for(const checkbox of [ice,visibility])checkbox?.addEventListener('change',()=>{
  if(!enabled()){pending++;clear();message('표출 해제');return;}
  if(data){repaint();return;}
  load();
 });
 road?.addEventListener('change',()=>{pending++;clear();data=null;if(enabled())load();});
 button?.addEventListener('click',load);
 return {setAvailable,load,repaint,clear,hasData:()=>Boolean(data)};
}
