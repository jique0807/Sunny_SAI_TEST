import {setLayerReception} from './layer-reception.mjs';
// Display only officially-supplied, geo-located KMA road-risk records.
// No guessed node-link geometry or precipitation-derived icing risk.
export const RISK_COLOR=Object.freeze({1:'#eab432',2:'#ee851b',3:'#d52d36'});
export function displayableRisks(locations,showIce,showVisibility){
 if(!Array.isArray(locations))return [];
 return locations.filter(x=>x&&x.gradeMeaningVerified===true&&[1,2,3].includes(x.risk)&&
  ((showIce&&x.kind==='ice')||(showVisibility&&x.kind==='visibility'))&&
  Array.isArray(x.geometry?.points)&&x.geometry.points.length>0&&
  x.geometry.points.every(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat>=32&&p.lat<=40&&p.lng>=123&&p.lng<=133));
}
export function matchRouteRoadRisks(records,path,departure,now=Date.now()){
 if(!Array.isArray(path)||path.length<2)return [];
 const project=point=>{
  let best=null;
  for(let i=1;i<path.length;i++){
   const a=path[i-1],b=path[i];
   const scale=111000*Math.cos(point.lat*Math.PI/180);
   const x=(b.lng-a.lng)*scale,y=(b.lat-a.lat)*111000;
   const px=(point.lng-a.lng)*scale,py=(point.lat-a.lat)*111000;
   const length=x*x+y*y;
   if(!length)continue;
   const t=Math.max(0,Math.min(1,(px*x+py*y)/length));
   const distance=Math.hypot(px-t*x,py-t*y);
   if(distance<=25&&(!best||distance<best.distance)){
    best={distance,seconds:a.seconds+t*(b.seconds-a.seconds),
     lat:a.lat+t*(b.lat-a.lat),lng:a.lng+t*(b.lng-a.lng)};
   }
  }
  return best;
 };
 return records.flatMap(record=>{
  const age=now-Date.parse(record.dataTime);
  const points=record.geometry.points;
  if(record.gradeMeaningVerified!==true||!record.linkId||!Number.isFinite(age)||age<0||age>15*60000||points.length!==2)return [];
  const from=project(points[0]),to=project(points[1]);
  if(!from||!to||!(to.seconds>from.seconds))return [];
  const eta=Date.parse(departure)+from.seconds*1000;
  const ice=record.kind==='ice';
  return [{...from,kind:record.kind,icon:ice?'🧊':'🌫️',
   title:ice?'도로 살얼음 위험':'도로 안개 위험',
   label:'도로 링크 '+record.linkId,eta:Number.isFinite(eta)?new Date(eta).toISOString():null,
   validTime:record.dataTime,roadRisk:record.risk,riskGradeVerified:true,provider:'기상청 도로위험기상'}];
 }).sort((a,b)=>a.seconds-b.seconds);
}

export function initRoadRiskOverlay({query,getContext,ensureMap,onChange}){
 const ice=document.getElementById('navLayerroad');
 const visibility=document.getElementById('navLayerfog');
 const button=document.getElementById('navRoadRiskRefresh');
 const status=document.getElementById('navRoadRiskStatus');
 let available=false,data=null,items=[],pending=0,loading=false;
 let routeMatch,riskPending=null,lastRiskAttempt=0;
 const enabled=()=>Boolean(ice?.checked||visibility?.checked);
 const message=s=>{if(status)status.textContent='기상청 도로위험: '+s;};
 function clear(){
  for(const x of items){try{x.kakao?x.item.setMap(null):x.map.removeLayer(x.item);}catch{}}
  items=[];
 }
 function repaint(){
  onChange?.();
  clear();
  if(!enabled()||!data)return;
  const context=getContext();
  if(!context){message('카카오 지도 또는 일반지도를 선택해주세요');return;}
  const records=displayableRisks(data.locations,ice.checked,visibility.checked);
  const coverage=data.roadName+' · '+data.receivedRoads+'/'+data.totalRoads+'개 노선 응답';
  if(!records.length){
   const reason=data.status==='unmapped'?'ZIP에 위험도는 있으나 좌표·도로 형상이 확인되지 않았습니다. 잘못된 지도 표시는 하지 않습니다':
    data.status==='unsupported_format'?'원본 ZIP 자료구조가 확인되지 않아 위치 표출을 중단했습니다':
    data.locations.some(item=>item.gradeMeaningVerified!==true)?'기상청 숫자 위험코드의 공식 등급 의미가 미확인되어 경고 표출을 보류했습니다':
    '선택한 유형에서 검증된 위험구간 없음 (안전하다는 뜻이 아님)';
   message(coverage+' · '+reason);return;
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
  message(coverage+' · '+records.length+'개 위치 검증 위험 '+(records.some(x=>x.kind==='ice')?'살얼음 ':'')+
   (records.some(x=>x.kind==='visibility')?'가시거리':'')+' 표출 · 기상청 예측, 실제 결빙 확정 아님');
 }
 // Fetch once for the route risk engine even if the map's ice/fog switches are OFF.
 // Failed or unverified provider data must never become an empty/safe risk signal.
 async function collectForRisk(){
  if(!available)return {status:'missing'};
  if(data)return {status:'received',verifiedLocations:displayableRisks(data.locations,true,true).length};
  if(riskPending){await riskPending;return {status:data?'received':'unavailable'};}
  if(Date.now()-lastRiskAttempt<180000)return {status:'unavailable'};
  lastRiskAttempt=Date.now();
  riskPending=query('all').then(d=>{data=d;return d;}).catch(()=>null)
   .finally(()=>{riskPending=null;});
  const result=await riskPending;
  if(result)onChange?.();
  return {status:result?'received':'unavailable',
   verifiedLocations:result?displayableRisks(result.locations,true,true).length:0};
 }
 async function load(){
  clear();onChange?.();const request=++pending;loading=true;
  if(!enabled()){loading=false;return;}
  if(!available){loading=false;message('KMA_API_KEY 미설정');return;}
  for(const id of ['navLayerroad','navLayerfog'])setLayerReception(id,'loading');
  message('기상청 도로위험 노선별 ZIP 수신·위치 확인 중');
  if(button)button.disabled=true;
  try{
   const d=data||(riskPending?await riskPending:await query('all'));
   if(!d)throw Error('도로위험 자료를 수신하지 못했습니다.');
   if(request!==pending)return;
   data=d;
   for(const id of ['navLayerroad','navLayerfog'])setLayerReception(id,d.receivedRoads===0||d.status==='unsupported_format'?'failed':d.locations.some(item=>item.kind===(id==='navLayerroad'?'ice':'visibility'))?'received':d.status==='georeferenced'?'empty':'received');
   await ensureMap();
   if(request===pending)repaint();
  }catch(e){
   if(request===pending){
    for(const id of ['navLayerroad','navLayerfog'])setLayerReception(id,e.reception||'failed');
    message('위험정보 조회 불가 · '+String(e?.message||'API 활용신청·자료 제공기간 확인').slice(0,155));
   }
  }finally{if(request===pending){loading=false;if(button)button.disabled=!available;}}
 }
 function setAvailable(value){
  available=Boolean(value);
  for(const checkbox of [ice,visibility])if(checkbox){
   checkbox.disabled=!available;
   if(!available)checkbox.checked=false;
  }
  if(button)button.disabled=!available;
  if(!available){clear();data=null;onChange?.();message('KMA_API_KEY 설정 필요');}
  else message('KMA 키 등록 · 도로위험 API 별도 활용승인 여부는 실제 조회 시 확인');
 }
 for(const checkbox of [ice,visibility])checkbox?.addEventListener('change',()=>{
  if(!enabled()){pending++;loading=false;clear();onChange?.();message('표출 해제');return;}
  if(data){repaint();return;}
  if(!loading)load();
 });
 button?.addEventListener('click',load);
 return {setAvailable,load,collectForRisk,repaint,clear,hasData:()=>Boolean(data),
  routeHazards(route,{forRisk=false}={}){
   if(!route||route.demo||!data||(!forRisk&&!enabled()))return [];
   const now=Date.now(),mask=forRisk?3:Number(ice?.checked)+2*Number(visibility?.checked);
   if(routeMatch?.route!==route||routeMatch.data!==data||routeMatch.mask!==mask){
    const records=displayableRisks(data.locations,Boolean(mask&1),Boolean(mask&2));
    routeMatch={route,data,mask,hazards:matchRouteRoadRisks(records,route.rainPath,route.departure,now)};
   }
   return routeMatch.hazards.filter(h=>now-Date.parse(h.validTime)<=15*60000);
  }};
}
