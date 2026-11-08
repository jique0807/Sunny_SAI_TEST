// EXPLICITLY FICTIONAL hazards for a demonstration only.
// Real road geometry may come from Kakao; none of the values below is a
// weather observation, warning, flood hazard assessment or road closure.
export const DEMO_SEOUL_BUSAN = Object.freeze({
 origin: Object.freeze({name:'서울시청',lat:37.5662952,lng:126.9779451}),
 destination: Object.freeze({name:'부산시청',lat:35.1795543,lng:129.0756416})
});

export const DEMO_SCENES = Object.freeze([
 {id:'rain',fraction:0.16,kind:'rain',icon:'🌧️',title:'강한 비 시연',
  measure:'가상 1시간 강수량 18mm',description:'갑작스러운 강수 예보를 가정합니다. 감속과 차간거리 확보를 안내하는 기능입니다.'},
 {id:'fog',fraction:0.36,kind:'fog',icon:'🌫️',title:'짙은 안개 시연',
  measure:'가상 가시거리 150m',description:'가시거리가 낮아진 상황을 가정합니다. 전조등 점등과 감속 안내를 시연합니다.'},
 {id:'ice',fraction:0.55,kind:'ice',icon:'🧊',title:'도로 살얼음 시연',
  measure:'가상 결빙 위험 단계: 주의',description:'노면 결빙 위험이 감지됐다고 가정합니다. 급제동을 피하도록 안내합니다.'},
 {id:'flood',fraction:0.75,kind:'flood',icon:'🌊',title:'도로 침수 위험 시연',
  measure:'가상 침수 수심 20cm',description:'도로가 침수된 가상 상황입니다. 진입을 피하고 안전한 우회 경로를 확인하도록 안내합니다.'},
 {id:'rain2',fraction:0.91,kind:'rain',icon:'⛈️',title:'집중호우 시연',
  measure:'가상 1시간 강수량 32mm',description:'목적지에 가까워지며 강수가 강화되는 가상 상황입니다. 안전한 장소에 정차하도록 안내합니다.'}
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
   demo:true,provider:'시연용 가상 데이터 · 실제 위험 정보 아님'};
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
export const DEMO_BREAKING_POSITION=0.68;
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
  id:'breaking-warning',kind:'warning',icon:'🚨',title:'긴급 호우주의보 신규 발효',
  description:'주행 중 갑자기 호우주의보가 발효된 가상 상황입니다. 해당 구간 전방에서 속도를 줄이고 안전한 위치를 확인하세요.',
  measure:'가상 호우주의보 발효 · 실제 기상청 특보 아님',
  lat:point.lat,lng:point.lng,seconds,label:point.label,
  eta:new Date(Date.parse(route.departure)+seconds*1000).toISOString(),
  issuedAt,
  demo:true,breaking:true,provider:'시연용 가상 신규 기상특보 · 실제 특보 발효 아님'
 };
}
