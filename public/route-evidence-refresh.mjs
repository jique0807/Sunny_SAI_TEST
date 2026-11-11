// Per-route collection schedule; independent of whether a map layer is visible.
export function createRouteEvidenceRefresh({getRoute,collectRoad,collectWarnings,collectPedestrian,onUpdate=()=>{},now=Date.now}){
 const routes=new WeakMap();
 return async function refresh(route){
  if(!route||route.demo||!['driving','walking'].includes(route.travelMode)||getRoute()!==route)return;
  if(!routes.has(route))routes.set(route,{});
  const state=routes.get(route);
  const jobs=[['warning',collectWarnings,120000],
   route.travelMode==='driving'?['road',collectRoad,180000]:['pedestrian',collectPedestrian,1800000]];
  await Promise.all(jobs.map(async([kind,collect,interval])=>{
   const s=state[kind]??(state[kind]={next:0,pending:false,failures:0});
   if(s.pending||now()<s.next)return;
   s.pending=true;
   let status='failed';
   try{status=(await collect(route))?.status||'unavailable';}catch{}
   finally{s.pending=false;}
   const ok=['received','partial','empty'].includes(status);
   s.failures=ok?0:Math.min(5,s.failures+1);
   s.next=now()+(ok?interval:Math.min(600000,60000*2**(s.failures-1)));
   if(getRoute()!==route)return;
   route[kind+'EvidenceStatus']=status;
   onUpdate(route,kind,status);
  }));
 };
}
