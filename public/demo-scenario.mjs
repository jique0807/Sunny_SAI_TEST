// EXPLICITLY FICTIONAL hazards for a demonstration only.
// Real road geometry may come from Kakao; none of the values below is a
// weather observation, warning, flood hazard assessment or road closure.
export const DEMO_SEOUL_BUSAN = Object.freeze({
 origin: Object.freeze({name:'서울시청',lat:37.5662952,lng:126.9779451}),
 destination: Object.freeze({name:'부산시청',lat:35.1795543,lng:129.0756416})
});

export const DEMO_SCENES = Object.freeze([
 {id:'rain',fraction:0.16,kind:'rain',icon:'🌧️',title:'강한 비',
  measure:'1시간 강수량 100mm',description:'전방에 강한 비가 예상됩니다. 속도를 줄이고 차간거리를 충분히 확보하세요.'},
 {id:'fog',fraction:0.36,kind:'fog',icon:'🌫️',title:'짙은 안개',
  measure:'가시거리 150m',description:'전방에 짙은 안개가 발생했습니다. 전조등을 켜고 속도를 줄이세요.'}

]);

// Locate the event on the actual polyline with the travel-time metadata,
// not by array index (vertex density varies by road).
export function demoPointAtSeconds(path,seconds){
 if(!Array.isArray(path)||path.length<2||!Number.isFinite(seconds))return null;
 if(seconds<=Number(path[0].seconds))return {...path[0]};
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i];
  if(seconds>Number(b.seconds))continue;
  if(!Number.isFinite(a.lat)||!Number.isFinite(a.lng)||!Number.isFinite(b.lat)||!Number.isFinite(b.lng))return null;
  const span=b.seconds-a.seconds;
  const t=span>0?Math.max(0,Math.min(1,(seconds-a.seconds)/span)):0;
  return {lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t,
   seconds,label:b.label||a.label||'차량 경로 구간'};
 }
 return {...path.at(-1),seconds};
}

export function makeDemoScenario(route){
 if(!route||!Array.isArray(route.rainPath)||route.rainPath.length<2||
   !Number.isFinite(route.duration)||route.duration<=0||!Number.isFinite(Date.parse(route.departure))) {
  throw new Error('시연 경로에 도로 위치 또는 예상시간이 없습니다.');
 }
 const hazards=DEMO_SCENES.map(scene=>{
  const seconds=Math.round(route.duration*scene.fraction);
  const point=demoPointAtSeconds(route.rainPath,seconds);
  if(!point)throw new Error('시연용 구간 위치를 찾을 수 없습니다.');
  return {id:scene.id,kind:scene.kind,icon:scene.icon,title:scene.title,
   description:scene.description,measure:scene.measure,
   lat:point.lat,lng:point.lng,seconds,
   label:point.label,eta:new Date(Date.parse(route.departure)+seconds*1000).toISOString(),
   demo:true,provider:'시연 모드 · 실제 관측 및 위험정보 아님'};
 });
 const samples=hazards.map(h=>({
  ...h,status:'demo',demoHazard:h,
  // Forecast values are intentionally omitted: never masquerade as KMA data.
  forecast:null
 }));
 return {hazards,samples};
}

// Synthetic breaking weather warning that appears ONLY after driving has begun.
// It is never sent to any weather provider and is not a real KMA warning.
export const DEMO_BREAKING_TRIGGER=0.42;
export const DEMO_BREAKING_POSITION=0.43;
export function shouldTriggerDemoBreakingWarning(previousPercent,nextPercent,alreadyIssued){
 return !alreadyIssued&&Number.isFinite(previousPercent)&&Number.isFinite(nextPercent)&&
  previousPercent<DEMO_BREAKING_TRIGGER*100&&nextPercent>=DEMO_BREAKING_TRIGGER*100;
}
export function makeDemoBreakingWarning(route,issuedAt=new Date().toISOString()){
 if(!route||!Array.isArray(route.rainPath)||!Number.isFinite(route.duration)||
   !Number.isFinite(Date.parse(route.departure)))throw new Error('가상 특보를 표시할 차량 경로가 없습니다.');
 const seconds=Math.round(route.duration*DEMO_BREAKING_POSITION);
 const point=demoPointAtSeconds(route.rainPath,seconds);
 if(!point)throw new Error('가상 특보 위치를 확인하지 못했습니다.');
 return {
  id:'breaking-warning',kind:'warning',icon:'🚨',title:'호우주의보 신규 발효',
  description:'주행 중 호우주의보가 새로 발표됐습니다. 전방 구간에서 속도를 줄이고 안전한 위치를 확인하세요.',
  measure:'호우주의보 발효 · 1시간 강수량 100mm',
  lat:point.lat,lng:point.lng,seconds,label:point.label,
  eta:new Date(Date.parse(route.departure)+seconds*1000).toISOString(),
  issuedAt,
  demo:true,breaking:true,provider:'시연 모드 · 실제 기상청 특보 아님'
 };
}


// These helpers are used ONLY by the explicitly fictional demo. Distance is
// measured along the returned Kakao route polyline, never by direct-line GPS.
const routeSegmentMeters=(a,b)=>{
 const rad=Math.PI/180,p1=a.lat*rad,p2=b.lat*rad,dLat=(b.lat-a.lat)*rad,dLon=(b.lng-a.lng)*rad;
 const c=Math.sin(dLat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dLon/2)**2;
 return 12742000*Math.atan2(Math.sqrt(c),Math.sqrt(Math.max(0,1-c)));
};
export function demoDistanceMeters(path,fromSeconds,toSeconds){
 if(!Array.isArray(path)||path.length<2||!Number.isFinite(fromSeconds)||!Number.isFinite(toSeconds))return null;
 if(toSeconds<=fromSeconds)return 0;
 let last=demoPointAtSeconds(path,fromSeconds),distance=0;
 if(!last||!Number.isFinite(last.lat)||!Number.isFinite(last.lng))return null;
 for(const point of path){
  if(point.seconds<=fromSeconds||point.seconds>=toSeconds)continue;
  if(!Number.isFinite(point.lat)||!Number.isFinite(point.lng))return null;
  distance+=routeSegmentMeters(last,point);last=point;
 }
 const end=demoPointAtSeconds(path,toSeconds);
 if(!end||!Number.isFinite(end.lat)||!Number.isFinite(end.lng))return null;
 return distance+routeSegmentMeters(last,end);
}
export function demoLeadSeconds(path,eventSeconds,leadMeters=500){
 if(!Number.isFinite(eventSeconds)||eventSeconds<=0)return 0;
 if((demoDistanceMeters(path,0,eventSeconds)||0)<=leadMeters)return 0;
 let lower=0,upper=eventSeconds;
 for(let i=0;i<17;i++){
  const middle=(lower+upper)/2;
  if((demoDistanceMeters(path,middle,eventSeconds)||0)>leadMeters)lower=middle;
  else upper=middle;
 }
 return upper;
}
export function demoSpokenWarning(hazard,distanceMeters){
 if(!hazard?.demo||!Number.isFinite(distanceMeters))return null;
 const distance=Math.max(100,Math.round(Math.max(0,distanceMeters)/100)*100);
 if(hazard.kind==='rain'||hazard.kind==='warning')
  return '전방 '+distance+'미터에 비 100mm 주의입니다.';
 if(hazard.kind==='fog')return '전방 '+distance+'미터에 안개 주의입니다.';
 return null;
}
