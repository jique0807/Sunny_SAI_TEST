// 서울역 -> 서울시청 Sunny SAI pedestrian presentation.
// Geometry is always provided by the TMAP/Kakao walking provider.
// Every weather/hazard event below is invented for a demo, never an observation.
import {demoPointAtSeconds,demoDistanceMeters} from './demo-scenario.mjs';
export const WALK_DEMO=Object.freeze({
 origin:Object.freeze({name:'서울역',lat:37.55472,lng:126.97083}),
 destination:Object.freeze({name:'서울시청',lat:37.5662952,lng:126.9779451})
});
export const WALK_DEMO_TRIGGER=69;
const valid=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lng)&&p.lat>=32&&p.lat<=40&&p.lng>=123&&p.lng<=133;
const gap=(a,b)=>Math.hypot((a.lat-b.lat)*111195,(a.lng-b.lng)*111195*Math.cos((a.lat+b.lat)*Math.PI/360));
export function validateWalkingDemoRoute(route){
 const path=route?.rainPath;
 if(route?.travelMode!=='walking'||!Array.isArray(path)||path.length<2||!Array.isArray(route?.vertices)||route.vertices.length<2||
   !Number.isFinite(route.duration)||route.duration<=0||route.duration>21600||
   !Number.isFinite(route.distance)||route.distance<=0||!Number.isFinite(Date.parse(route.departure))||
   path.some(p=>!valid(p)||!Number.isFinite(p.seconds))||
   path.some((p,i)=>i&&p.seconds<path[i-1].seconds)||
   gap(path[0],WALK_DEMO.origin)>1200||gap(path.at(-1),WALK_DEMO.destination)>1200)
  throw new Error('서울역 → 서울시청의 실제 보행 경로를 확인하지 못했습니다. TMAP 권한 또는 경로 제공 범위를 점검해주세요.');
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
export function makeWalkingDemoScenario(route){
 validateWalkingDemoRoute(route);
 const hazards=[
  event(route,.26,{id:'walking-rain',kind:'rain',icon:'🌧️',title:'비 시작',measure:'시연 강수량 3mm/h',
   description:'도보 경로에 비가 내리는 상황을 가정했습니다. 실제 관측값이 아닙니다.'}),
  event(route,.51,{id:'walking-slip',kind:'slip',icon:'⚠️',title:'빗길 미끄럼 주의',measure:'젖은 보행로 주의 · 시연',
   description:'강수 후 보행 시 미끄럼을 조심하도록 안내하는 시연입니다. 실제 결빙·침수 상태는 확인되지 않았습니다.'})
 ];
 return {hazards,samples:hazards.map(h=>({...h,status:'demo',forecast:null,demoHazard:h}))};
}
export function makeWalkingDemoBreakingWarning(route){
 validateWalkingDemoRoute(route);
 return {...event(route,.76,{id:'walking-sudden-rain',kind:'rain',icon:'🚨',title:'강수 강화 알림',
  measure:'시연 강수량 15mm/h',
  description:'도보 이동 중 비가 강해지는 상황을 가정했습니다. 실제 기상특보가 아닙니다.'}),breaking:true};
}
export function walkingDemoSpokenWarning(hazard,distanceMeters){
 if(!hazard?.demo||!Number.isFinite(distanceMeters))return null;
 const d=Math.max(50,Math.round(Math.max(0,distanceMeters)/50)*50);
 if(hazard.breaking)return '시연 안내입니다. 전방 약 '+d+'미터에서 비가 강해집니다. 안전한 장소에서 기상 상황을 확인하세요.';
 if(hazard.kind==='slip')return '시연 안내입니다. 전방 약 '+d+'미터에서 빗길 미끄럼에 주의하세요.';
 if(hazard.kind==='rain')return '시연 안내입니다. 전방 약 '+d+'미터에 비가 예상됩니다.';
 return null;
}
export function walkingDemoAheadMeters(route,progress,hazard){
 if(!route||!hazard)return null;
 return demoDistanceMeters(route.rainPath,route.duration*progress/100,hazard.seconds);
}
