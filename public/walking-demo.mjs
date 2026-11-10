// 서울역 -> 서울시청 Sunny SAI pedestrian presentation.
// Displayed geometry must be from real TMAP pedestrian directions; only hazard events are synthetic.
// Every weather/hazard event below is invented for a demo, never an observation.
import {demoPointAtSeconds,demoDistanceMeters} from './demo-scenario.mjs';
export const WALK_DEMO=Object.freeze({
 origin:Object.freeze({name:'서울역',lat:37.55472,lng:126.97083}),
 destination:Object.freeze({name:'서울시청',lat:37.5662952,lng:126.9779451})
});
export const WALK_DEMO_TRIGGER=69;
export const WALK_DEMO_SHELTER=Object.freeze({name:'무더위쉼터 목적지(시연용 좌표 · 실제 시설 미확인)',lat:37.56415,lng:126.9742});
const valid=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lng)&&p.lat>=32&&p.lat<=40&&p.lng>=123&&p.lng<=133;
const gap=(a,b)=>Math.hypot((a.lat-b.lat)*111195,(a.lng-b.lng)*111195*Math.cos((a.lat+b.lat)*Math.PI/360));
export function validateWalkingDemoRoute(route){
 const path=route?.rainPath;
 if(route?.travelMode!=='walking'||route?.mode!=='walking'||route?.provider!=='TMAP'||!Array.isArray(path)||path.length<2||!Array.isArray(route?.vertices)||route.vertices.length<2||
   !Number.isFinite(route.duration)||route.duration<=0||route.duration>21600||
   !Number.isFinite(route.distance)||route.distance<=0||!Number.isFinite(Date.parse(route.departure))||
   path.some(p=>!valid(p)||!Number.isFinite(p.seconds))||
   path.some((p,i)=>i&&p.seconds<path[i-1].seconds)||
   gap(path[0],WALK_DEMO.origin)>1200||gap(path.at(-1),WALK_DEMO.destination)>1200)
  throw new Error('서울역 → 서울시청 TMAP 보행자 경로가 올바르지 않습니다.');
 return true;
}
function event(route,fraction,{id,kind,icon,title,measure,description}){
 const seconds=Math.round(route.duration*fraction);
 const point=demoPointAtSeconds(route.rainPath,seconds);
 if(!valid(point))throw new Error('도보 시연 경로의 위치를 확인하지 못했습니다.');
 return {id,kind,icon,title,measure,description,lat:point.lat,lng:point.lng,
  seconds,label:'서울역 → 서울시청 도보 경로',
  eta:new Date(Date.parse(route.departure)+seconds*1000).toISOString(),
  demo:true,provider:'Sunny SAI 도보 시연 · 실제 관측/특보 아님'};
}
export function chooseWalkingDemoShelter(places,current){
 if(!valid(current)||!Array.isArray(places))return null;
 const meters=p=>Math.hypot((p.lat-current.lat)*111195,(p.lng-current.lng)*111195*Math.cos((p.lat+current.lat)*Math.PI/360));
 const matched=places.filter(p=>valid(p)&&/소공동/.test(p.name||'')&&/주민센터/.test(p.name||'')&&
  meters(p)<2800&&/서소문로12길|소공동|중구/.test(p.address||p.roadAddress||''));
 matched.sort((a,b)=>meters(a)-meters(b));
 return matched[0]||null;
}
export function makeWalkingDemoScenario(route){
 validateWalkingDemoRoute(route);
 const hazards=[
  event(route,.26,{id:'walking-slip',kind:'slip',icon:'🌧️',title:'빗길 미끄럼 주의',measure:'가상 젖은 보행로',
   description:'보행 중 빗길 미끄럼에 주의하도록 설정한 가상 이벤트입니다. 실제 노면·강수 관측자료가 아닙니다.'}),
  event(route,.51,{id:'walking-hotspot',kind:'hotspot',icon:'🚸',title:'보행자 사고다발지역 주의',measure:'가상 사고 집중구역',
   description:'가상 사고다발지역 이벤트입니다. KOROAD 과거 사고 통계에서 확인한 위치가 아닙니다.'})
 ];
 return {hazards,samples:hazards.map(h=>({...h,status:'demo',forecast:null,demoHazard:h}))};
}
export function makeWalkingDemoBreakingWarning(route){
 validateWalkingDemoRoute(route);
 return {...event(route,.76,{id:'walking-heat',kind:'heat',icon:'☀️',title:'무더위 위험',measure:'가상 체감온도 35°C',
  description:'갑자기 무더위가 심해지는 가상 상황입니다. 실제 기상관측·특보 또는 쉼터 운영상태 정보가 아닙니다.'}),breaking:true};
}
export function walkingDemoSpokenWarning(hazard,distanceMeters){
 if(!hazard?.demo||!Number.isFinite(distanceMeters))return null;
 const d=Math.max(50,Math.round(Math.max(0,distanceMeters)/50)*50);
 if(hazard.breaking)return '무더위 위험이 예상됩니다. 가까운 무더위쉼터로 이동하시겠습니까?';
 if(hazard.kind==='slip')return '전방 약 '+d+'미터에서 빗길 미끄럼에 주의하세요.';
 if(hazard.kind==='hotspot')return '전방 약 '+d+'미터는 보행자 사고 주의 구역입니다. 주변 차량을 살펴주세요.';
 return null;
}
export function walkingDemoAheadMeters(route,progress,hazard){
 if(!route||!hazard)return null;
 return demoDistanceMeters(route.rainPath,route.duration*progress/100,hazard.seconds);
}
