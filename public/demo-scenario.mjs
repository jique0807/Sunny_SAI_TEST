// Every scenario event is fictional. Road coordinates ARE obtained from the
// actual Kakao Mobility Directions API; they are not official safety advice.
export const DEMO_SEOUL_BUSAN=Object.freeze({
 origin:Object.freeze({name:'서울시청',lat:37.5662952,lng:126.9779451}),
 destination:Object.freeze({name:'부산시청',lat:35.1795543,lng:129.0756416})
});
export const DEMO_PLACES=Object.freeze({
 icheon:Object.freeze({name:'이천시청 부근',lat:37.272267590188,lng:127.435089282741}),
 gumi:Object.freeze({name:'구미시청 부근',lat:36.1195708487424,lng:128.34424636107}),
 miryang:Object.freeze({name:'밀양시청 부근',lat:35.503817302675294,lng:128.74660534479577}),
 sandong:Object.freeze({name:'구미 산동읍 부근',lat:36.1696571391396,lng:128.4341450532684}),
 jangcheon:Object.freeze({name:'구미 장천면 부근',lat:36.1259075819979,lng:128.49507975254}),
 haepyeong:Object.freeze({name:'구미 해평면 부근',lat:36.1998395641148,lng:128.391295145168}),
 buksam:Object.freeze({name:'칠곡 북삼읍 부근',lat:36.06291941719512,lng:128.34297332038372})
});
export const DEMO_INITIAL_WAYPOINTS=Object.freeze([
 DEMO_PLACES.icheon,DEMO_PLACES.gumi,DEMO_PLACES.miryang
]);
// These are genuine Kakao road-route queries, rather than drawn detour lines.
export const DEMO_DETOUR_CANDIDATES=Object.freeze([
 Object.freeze({id:'direct',label:'카카오 추천',waypoints:Object.freeze([])}),
 Object.freeze({id:'sandong',label:'산동읍 경유',waypoints:Object.freeze([DEMO_PLACES.sandong])}),
 Object.freeze({id:'jangcheon',label:'장천면 경유',waypoints:Object.freeze([DEMO_PLACES.jangcheon])}),
 Object.freeze({id:'haepyeong',label:'해평면 경유',waypoints:Object.freeze([DEMO_PLACES.haepyeong])}),
 Object.freeze({id:'buksam',label:'북삼읍 경유',waypoints:Object.freeze([DEMO_PLACES.buksam])})
]);
export const DEMO_MIN_CLEARANCE_METERS=3000;
export function selectOptimalDemoDetour(options,hazard,{minClearanceMeters=DEMO_MIN_CLEARANCE_METERS,maxFogDistanceMeters=12000}={}){
 if(!Array.isArray(options)||!hazard)return null;
 const feasible=[];
 for(const option of options){
  if(!option?.route||!Array.isArray(option.route.rainPath)||option.route.rainPath.length<2||
     !Array.isArray(option.route.vertices)||option.route.vertices.length<2||
     !Number.isFinite(option.route.duration)||option.route.duration<=0||
     !Number.isFinite(option.route.distance)||option.route.distance<=0)continue;
  const clearance=demoClosestRouteDistance(option.route.rainPath,hazard);
  if(clearance<minClearanceMeters)continue;
  feasible.push({...option,clearance});
 }
 feasible.sort((a,b)=>a.route.duration-b.route.duration||a.route.distance-b.route.distance);
 return feasible[0]||null;
}
export const DEMO_SCENES=Object.freeze([
 {id:'rain',place:'icheon',kind:'rain',icon:'🌧️',title:'강한 비',measure:'1시간 강수량 100mm',
  description:'이천 부근에 강한 비가 예상됩니다. 실제 관측이 아닌 시연 수치입니다.'},
 {id:'fog',place:'miryang',kind:'fog',icon:'🌫️',title:'짙은 안개',measure:'가시거리 150m',
  description:'밀양 부근 짙은 안개 시연입니다. 실제 시정 관측이 아닙니다.'}
]);
export function demoPointAtSeconds(path,seconds){
 if(!Array.isArray(path)||path.length<2||!Number.isFinite(seconds))return null;
 if(seconds<=Number(path[0].seconds))return {...path[0],seconds:0};
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i];
  if(seconds>Number(b.seconds))continue;
  if(!Number.isFinite(a.lat)||!Number.isFinite(a.lng)||!Number.isFinite(b.lat)||!Number.isFinite(b.lng))return null;
  const span=b.seconds-a.seconds,t=span>0?Math.max(0,Math.min(1,(seconds-a.seconds)/span)):0;
  return {lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t,
   seconds,label:b.label||a.label||'차량 경로 구간'};
 }
 return {...path.at(-1),seconds};
}
const EARTH=6371000,rad=Math.PI/180;
export function demoSegmentMeters(a,b){
 const p1=a.lat*rad,p2=b.lat*rad,dl=(b.lat-a.lat)*rad,dx=(b.lng-a.lng)*rad;
 const h=Math.sin(dl/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dx/2)**2;
 return 2*EARTH*Math.asin(Math.min(1,Math.sqrt(h)));
}
export function demoDistanceMeters(path,fromSeconds,toSeconds){
 if(!Array.isArray(path)||path.length<2||!Number.isFinite(fromSeconds)||!Number.isFinite(toSeconds))return null;
 if(toSeconds<=fromSeconds)return 0;
 let last=demoPointAtSeconds(path,fromSeconds),distance=0;
 if(!last||!Number.isFinite(last.lat)||!Number.isFinite(last.lng))return null;
 for(const p of path){
  if(p.seconds<=fromSeconds||p.seconds>=toSeconds)continue;
  if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng))return null;
  distance+=demoSegmentMeters(last,p);last=p;
 }
 const end=demoPointAtSeconds(path,toSeconds);
 if(!end||!Number.isFinite(end.lat)||!Number.isFinite(end.lng))return null;
 return distance+demoSegmentMeters(last,end);
}
export function demoLeadSeconds(path,eventSeconds,leadMeters=500){
 if(!Number.isFinite(eventSeconds)||eventSeconds<=0)return 0;
 if((demoDistanceMeters(path,0,eventSeconds)||0)<=leadMeters)return 0;
 let low=0,high=eventSeconds;
 for(let i=0;i<17;i++){
  const mid=(low+high)/2;
  if((demoDistanceMeters(path,mid,eventSeconds)||0)>leadMeters)low=mid;else high=mid;
 }
 return high;
}
// Nearest point on real road polyline, not a fabricated dot at city center.
export function demoNearPlace(path,place){
 if(!Array.isArray(path)||path.length<2||!place)return null;
 let best=null,bestDistance=Infinity;
 for(const p of path){
  if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||!Number.isFinite(p.seconds))continue;
  const d=demoSegmentMeters(p,place);
  if(d<bestDistance){bestDistance=d;best=p;}
 }
 return best?{...best,distanceFromPlace:bestDistance}:null;
}
export function demoClosestRouteDistance(path,place){
 // Segment-level planar nearest distance, for verifying the detour avoids
 // the FICTIONAL warning marker; not an authoritative road safety judgment.
 if(!Array.isArray(path)||path.length<2||!place)return Infinity;
 const c=Math.cos(place.lat*rad),sx=111195*c,sy=111195;
 let shortest=Infinity;
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i];
  if(![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite))continue;
  const x1=(a.lng-place.lng)*sx,y1=(a.lat-place.lat)*sy;
  const x2=(b.lng-place.lng)*sx,y2=(b.lat-place.lat)*sy;
  const dx=x2-x1,dy=y2-y1,t=(dx*dx+dy*dy)>0?Math.max(0,Math.min(1,(-x1*dx-y1*dy)/(dx*dx+dy*dy))):0;
  shortest=Math.min(shortest,Math.hypot(x1+t*dx,y1+t*dy));
 }
 return shortest;
}
function eventForScene(route,scene){
 const target=DEMO_PLACES[scene.place];
 const p=demoNearPlace(route.rainPath,target);
 if(!p||p.distanceFromPlace>12000)throw Error(scene.title+' 경로가 '+target.name+'에서 12km 이내를 지나지 않습니다.');
 const seconds=Math.round(p.seconds);
 return {id:scene.id,kind:scene.kind,icon:scene.icon,title:scene.title,
  description:scene.description,measure:scene.measure,
  lat:p.lat,lng:p.lng,seconds,label:target.name,
  eta:new Date(Date.parse(route.departure)+seconds*1000).toISOString(),
  demo:true,provider:'시연 모드 · 실제 관측 및 위험정보 아님'};
}
export function demoEventAtPlace(route,place){
 if(!route?.rainPath?.length||!DEMO_PLACES[place])throw Error('시연 장소 또는 도로 좌표를 찾지 못했습니다.');
 const scene=DEMO_SCENES.find(s=>s.place===place);
 if(!scene)throw Error('시연 이벤트 장소가 잘못됐습니다.');
 return eventForScene(route,scene);
}
export function makeDemoScenario(route){
 if(!route||!Array.isArray(route.rainPath)||route.rainPath.length<2||
  !Number.isFinite(route.duration)||route.duration<=0||!Number.isFinite(Date.parse(route.departure)))
  throw Error('시연 경로에 도로 위치 또는 예상시간이 없습니다.');
 const hazards=DEMO_SCENES.map(scene=>eventForScene(route,scene)).sort((a,b)=>a.seconds-b.seconds);
 if(hazards[1].seconds-hazards[0].seconds<route.duration*.35)
  throw Error('이천과 밀양 이벤트의 경로상 간격이 충분하지 않습니다.');
 return{hazards,samples:hazards.map(h=>({...h,status:'demo',demoHazard:h,forecast:null}))};
}
export const DEMO_BREAKING_TRIGGER=.58; // fallback only; actual trigger follows Gumi distance
export const DEMO_BREAKING_POSITION=.65;
export function demoBreakingTiming(route){
 if(!route?.rainPath?.length||!Number.isFinite(route.duration))throw Error('시연용 구미 경로가 없습니다.');
 const p=demoNearPlace(route.rainPath,DEMO_PLACES.gumi);
 if(!p||p.distanceFromPlace>30000)throw Error('구미 부근을 지나는 실제 도로 경로를 찾지 못했습니다. 위험구간 좌표를 확인해야 합니다.');
 const seconds=Math.round(p.seconds),triggerSeconds=demoLeadSeconds(route.rainPath,seconds,30000);
 return{seconds,triggerSeconds,triggerPercent:100*triggerSeconds/route.duration,
  point:p,cityDistanceMeters:p.distanceFromPlace};
}
export function shouldTriggerDemoBreakingWarning(previousPercent,nextPercent,alreadyIssued,triggerPercent=DEMO_BREAKING_TRIGGER*100){
 return !alreadyIssued&&Number.isFinite(previousPercent)&&Number.isFinite(nextPercent)&&
  previousPercent<triggerPercent&&nextPercent>=triggerPercent;
}
export function makeDemoBreakingWarning(route,issuedAt=new Date().toISOString()){
 if(!route||!Array.isArray(route.rainPath)||!Number.isFinite(route.duration)||
  !Number.isFinite(Date.parse(route.departure)))throw Error('가상 특보를 표시할 차량 경로가 없습니다.');
 const {seconds,point}=demoBreakingTiming(route);
 return{id:'breaking-warning',kind:'warning',icon:'🚨',title:'구미 부근 긴급 호우특보',
  description:'시연 중 구미 부근에 호우특보가 발표됐다고 가정합니다. 실제 특보가 아닙니다.',
  measure:'호우특보 · 1시간 강수량 100mm',
  lat:point.lat,lng:point.lng,seconds,label:DEMO_PLACES.gumi.name,
  eta:new Date(Date.parse(route.departure)+seconds*1000).toISOString(),issuedAt,
  demo:true,breaking:true,provider:'시연 모드 · 실제 기상청 특보 아님'};
}
export function demoSpokenWarning(hazard,distanceMeters){
 if(!hazard?.demo||!Number.isFinite(distanceMeters))return null;
 const d=Math.max(100,Math.round(Math.max(0,distanceMeters)/100)*100);
 if(hazard.kind==='rain'||hazard.kind==='warning')return '전방 '+d+'미터에 비 100mm 주의입니다.';
 if(hazard.kind==='fog')return '전방 '+d+'미터에 안개 주의입니다.';
 return null;
}
