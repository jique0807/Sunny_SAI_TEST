import {ahead,distance} from './rain-monitor.mjs';
// An active journey evaluates its sampled forward window, never silently the
// departure forecast. Expected samples come from the actual outbound request.
export function buildLiveRiskContext(route,{weather=null,aheadWeather=null,progress=0,active=false,
 now=Date.now(),maxAgeMs=180000}={}){
 if(!route||route.demo||!active)return {route,weatherSamples:weather?.samples||[],
  scope:'route-samples',progressSeconds:0,now};
 const position=Math.max(0,Math.min(route.duration,Number.isFinite(progress)?progress:0));
 const age=now-Date.parse(aheadWeather?.fetchedAt);
 const fresh=aheadWeather?.routeRef===route&&Number.isFinite(age)&&age>=0&&
  age<=Math.min(600000,Math.max(180000,maxAgeMs));
 const expected=(fresh&&Array.isArray(aheadWeather.requestSamples)?aheadWeather.requestSamples:
  ahead(route.rainPath||[],position,now)).filter(s=>{
   if(!Number.isFinite(s?.seconds)||s.seconds<position||s.seconds>route.duration||
    !Number.isFinite(s.lat)||!Number.isFinite(s.lng)||!Number.isFinite(Date.parse(s.eta)))return false;
   const actual=ahead(route.rainPath||[],s.seconds,now)[0];
   return actual&&distance(actual,s)<=1;
  });
 const samples=fresh&&Array.isArray(aheadWeather.samples)?aheadWeather.samples.filter(s=>
  s?.status==='forecast'&&s.forecast?.provider==='kma'&&Number.isFinite(Date.parse(s.forecast.time))&&
  Math.abs(Date.parse(s.forecast.time)-Date.parse(s.eta))<=90*60000&&
  expected.some(p=>p.seconds===s.seconds&&p.eta===s.eta&&
   Number.isFinite(s.lat)&&Number.isFinite(s.lng)&&distance(p,s)<=1)):[];
 // Keep explicit gaps so voice episode handling cannot mistake a partially
 // missing response for a complete dry forecast.
 const resolved=fresh?expected.map(p=>samples.find(s=>s.seconds===p.seconds&&s.eta===p.eta)||
  {...p,status:'unavailable',forecast:null}):[];
 return {route:{...route,samples:expected},weatherSamples:resolved,scope:'ahead-samples',
  progressSeconds:position,now,snapshotState:fresh?'current':'unavailable'};
}
export function remainingRiskHazards(context,hazards=[]){
 if(context.scope!=='ahead-samples')return hazards;
 return hazards.filter(h=>Number.isFinite(h?.seconds)&&h.seconds>=context.progressSeconds)
  .map(h=>({...h,eta:new Date(context.now+(h.seconds-context.progressSeconds)*1000).toISOString()}));
}
