// Synthetic driving risk scenario. Road geometry comes from the routing API;
// every forecast and warning record created here is fictional test input.
import {demoPointAtSeconds, demoSegmentMeters, demoClosestRouteDistance} from './demo-scenario.mjs';
import {evaluateSyntheticDrivingRisk} from './safe-route-engine.mjs';

export const SYNTHETIC_RISK_SOURCE='Sunny SAI 더미 시연자료';
export const SYNTHETIC_RISK_TRIGGER=38;
const valid=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lng)&&Number.isFinite(p?.seconds);

function samplePoints(route){
 const path=route?.rainPath;
 if(!Array.isArray(path)||path.length<2||!Number.isFinite(route.duration)||route.duration<=0)
  throw Error('실제 주행경로 좌표와 소요시간이 필요합니다.');
 const depart=Date.parse(route.departure);
 if(!Number.isFinite(depart))throw Error('경로 출발시각을 확인할 수 없습니다.');
 return [.12,.3,.5,.68,.86].map((fraction,index)=>{
  const seconds=Math.round(route.duration*fraction),point=demoPointAtSeconds(path,seconds);
  if(!valid({...point,seconds}))throw Error('더미 예보 지점을 경로에 맞추지 못했습니다.');
  const eta=new Date(depart+seconds*1000).toISOString();
  return {id:'fixture-'+index,lat:point.lat,lng:point.lng,seconds,eta,
   label:'더미 경로 지점 '+(index+1)};
 });
}
function weatherRecord(point,rainMm=0){
 return {...point,status:'forecast',synthetic:true,
  forecast:{provider:'sunny-synthetic',time:point.eta,rain:rainMm,
   rainMin:rainMm,precipitationType:rainMm>0?1:0}};
}
function syntheticSignal(route,point,{kind,rainMm=0}={}){
 const flood=kind==='warning';
 return {id:(flood?'flood-warning':'heavy-rain')+'-'+point.id,kind,
  icon:flood?'🌊':'🌧️',title:flood?'침수경보':rainMm>=30?'폭우 예보':'비 예보',
  measure:flood?'저지대 도로 침수 위험 가정':'1시간 더미 강수량 '+rainMm+'mm',
  description:flood?'실제 침수 관측이나 기관 경보가 아닌 시험용 이벤트입니다.':'실제 강수 예보가 아닌 시험용 이벤트입니다.',
  lat:point.lat,lng:point.lng,seconds:point.seconds,eta:point.eta,validTime:point.eta,
  provider:SYNTHETIC_RISK_SOURCE,synthetic:true,affectedRadiusMeters:Math.max(10,Math.min(450,route.distance*.08)),
  ...(flood?{impact:'flood'}:{rainMm,rainLabel:rainMm+'mm'})};
}
export function makeSyntheticRiskFixture(route,phase='initial'){
 const config=route.dummyScenario||{type:'flood',initialRain:8,rain:65,warning:true,temperature:35};
 const points=samplePoints(route),base=points.map(point=>weatherRecord(point));
 const firstRain=syntheticSignal(route,points[1],{kind:'rain',rainMm:config.initialRain});
 if(phase!=='clear'&&config.initialRain>0)base[1]={...weatherRecord(points[1],config.initialRain),demoHazard:firstRain};
 let signals=phase==='clear'||!(config.initialRain>0)?[]:[firstRain];
 if(phase==='alert'){
  // The initial event lies behind the simulated traveller when this feed arrives.
  signals=[];
  const point=points[3];
  if(config.type==='missing'){
   for(let i=0;i<base.length;i++)base[i]={...base[i],status:'unavailable',forecast:null};
   signals=[];
  }else if(config.type==='heat'){
   const heat={...syntheticSignal(route,point,{kind:'heat'}),kind:'heat',icon:'☀️',title:'고온 예보 주의',
    temperature:config.temperature,measure:'더미 기온 '+config.temperature+'°C',description:'시험용 고온 예보입니다.'};
   signals=[...signals,heat];base[3]={...base[3],demoHazard:heat};
  }else{
   const heavyRain=syntheticSignal(route,point,{kind:'rain',rainMm:config.rain});
   base[3]={...weatherRecord(point,config.rain),demoHazard:heavyRain};
   signals=[...signals,...(config.rain>0?[heavyRain]:[]),...(config.warning?[syntheticSignal(route,point,{kind:'warning'})]:[])];
  }
 }
 const expected=points.map(({id,lat,lng,seconds,eta,label})=>({id,lat,lng,seconds,eta,label}));
 const fixtureRoute={...route,demo:true,syntheticRiskDemo:true,samples:expected};
 const weatherSamples=base;
 const profile=evaluateSyntheticDrivingRisk(fixtureRoute,{weatherSamples,extraHazards:signals});
 return {route:fixtureRoute,weatherSamples,samples:weatherSamples,signals:profile.signals,inputSignals:signals,profile,phase,
  source:SYNTHETIC_RISK_SOURCE,synthetic:true};
}
export function syntheticDetourWaypoints(route,atSeconds){
 const point=demoPointAtSeconds(route.rainPath,atSeconds);
 const before=demoPointAtSeconds(route.rainPath,Math.max(0,atSeconds-45));
 const after=demoPointAtSeconds(route.rainPath,Math.min(route.duration,atSeconds+45));
 if(!point||!before||!after)throw Error('우회 기준 위치를 계산할 수 없습니다.');
 const latScale=demoSegmentMeters(point,{lat:point.lat+0.001,lng:point.lng})/0.001;
 const lngScale=demoSegmentMeters(point,{lat:point.lat,lng:point.lng+0.001})/0.001;
 const dy=(after.lat-before.lat)*latScale,dx=(after.lng-before.lng)*lngScale;
 const length=Math.hypot(dx,dy)||1,offset=Math.min(850,Math.max(60,route.distance*.15));
 const normal=[{x:-dy/length,y:dx/length},{x:dy/length,y:-dx/length}];
 return normal.map((n,index)=>({id:index?'east-side':'west-side',label:index?'반대편 우회':'측면 우회',
  waypoints:[{name:'가상 침수지점 우회 경유지',
   lat:point.lat+n.y*offset/latScale,lng:point.lng+n.x*offset/lngScale}]}));
}
export function evaluateSyntheticAlternative(route,signals){
 const fixture=makeSyntheticRiskFixture(route,'clear');
 const onPath=signals.filter(signal=>demoClosestRouteDistance(route.rainPath,signal)<(signal.affectedRadiusMeters||450));
 const profile=evaluateSyntheticDrivingRisk(fixture.route,{weatherSamples:fixture.weatherSamples,
  extraHazards:onPath});
 return {fixture,profile,avoidsAlert:onPath.length===0};
}
export function syntheticRiskRecommendsDetour(profile){
 return profile?.action?.type==='reroute';
}

export function joinSyntheticWalkingLegs(first,second){
 if([first,second].some(r=>r.travelMode!=='walking'||r.mode!=='walking'||r.provider!=='TMAP'||!r.rainPath?.length||!r.vertices?.length))throw Error('TMAP 실제 도보 경로 두 구간이 필요합니다.');
 const gap=demoSegmentMeters(first.rainPath.at(-1),second.rainPath[0]);
 if(gap>20)throw Error('도보 경유지 연결이 맞지 않습니다.');
 const shift=p=>({...p,...(Number.isFinite(p.seconds)?{seconds:p.seconds+first.duration}:{})});
 return {...first,duration:first.duration+second.duration,distance:first.distance+second.distance,
  rainPath:[...first.rainPath,...second.rainPath.slice(1).map(shift)],
  vertices:[...first.vertices,...second.vertices.slice(1).map(shift)],samples:[],
  facilities:[...(first.facilities||[]),...(second.facilities||[])]};
}
