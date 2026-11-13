import {demoPointAtSeconds,demoSegmentMeters,demoClosestRouteDistance,selectOptimalDemoDetour} from './demo-scenario.mjs';
import {joinSyntheticWalkingLegs,evaluateSyntheticAlternative} from './synthetic-risk-demo.mjs';
const within=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lng)&&p.lat>=32&&p.lat<=40&&p.lng>=123&&p.lng<=133;
export function syntheticDetourStages(trip,alert){
 const r=alert.affectedRadiusMeters||450,latScale=111195,lngScale=111195*Math.cos(alert.lat*Math.PI/180);
 const a=demoPointAtSeconds(trip.rainPath,Math.max(0,alert.seconds-60)),b=demoPointAtSeconds(trip.rainPath,Math.min(trip.duration,alert.seconds+60));
 let dx=(b.lng-a.lng)*lngScale,dy=(b.lat-a.lat)*latScale;
 if(Math.hypot(dx,dy)<1){const last=trip.rainPath.at(-1),first=trip.rainPath[0];dx=(last.lng-first.lng)*lngScale;dy=(last.lat-first.lat)*latScale;}
 const len=Math.hypot(dx,dy)||1,t={x:dx/len,y:dy/len},n={x:-dy/len,y:dx/len};
 const point=(along,side)=>({name:'위험구간 우회 경유지',lat:alert.lat+(t.y*along+n.y*side)/latScale,lng:alert.lng+(t.x*along+n.x*side)/lngScale});
 const stages=[{name:'주변 도로',candidates:[{id:'recommended',label:'추천 도로',waypoints:[]},
  ...[-1,1].map(sign=>({id:'near-'+sign,label:sign<0?'우측 우회':'좌측 우회',waypoints:[point(0,sign*Math.max(60,r*1.8))]}))]},
  ...[3.5,6].map((scale,index)=>({name:index?'넓은 범위의 연결 도로':'진입·이탈 경유 도로',candidates:[-1,1].map(sign=>({id:'wide-'+scale+'-'+sign,label:sign<0?'우측 연결 도로':'좌측 연결 도로',
   waypoints:[point(-r*1.5,sign*Math.max(100,r*scale)),point(r*1.5,sign*Math.max(100,r*scale))]}))}))];
 return stages.map(stage=>({...stage,candidates:stage.candidates.filter(c=>c.waypoints.every(within))}));
}
export async function searchSyntheticDetour({trip,current,destination,query,onProgress=()=>{},isCurrent=()=>true}){
 const alert=trip.syntheticFloodSignal,r=alert?.affectedRadiusMeters||450,mode=trip.travelMode;
 if(!alert||!within(current)||!within(destination)||!['driving','walking'].includes(mode))throw Error('우회 기준 경로와 위치를 확인해주세요.');
 if(demoSegmentMeters(current,alert)<r||demoSegmentMeters(destination,alert)<r)throw Error('현재 위치 또는 목적지가 위험영역 안에 있습니다. 위험영역 밖의 대피 목적지를 먼저 선택해야 합니다.');
 const attempts=[];let chosen=null;
 const run=async candidate=>{
  const departure=new Date().toISOString(),start={...current,name:'현재 이동 위치'};
  let route;
  if(mode==='walking'&&candidate.waypoints.length){
   let from=start,joined=null;
   for(const to of [...candidate.waypoints,destination]){
    if(!isCurrent())throw Error('이동이 종료되었습니다.');
    const leg=await query({origin:from,destination:to,departure:new Date(Date.parse(departure)+(joined?.duration||0)*1000).toISOString(),travelMode:'walking',walkingPriority:'BROAD_FIRST'});
    joined=joined?joinSyntheticWalkingLegs(joined,leg):leg;from=to;
   }
   route=joined;
  }else route=await query({origin:start,destination,departure,travelMode:mode,waypoints:candidate.waypoints,walkingPriority:'BROAD_FIRST'});
  if(route?.travelMode!==mode||route.mode!==mode||(mode==='walking'&&route.provider!=='TMAP')||!route.rainPath?.length||!route.vertices?.length)throw Error('이동수단과 실제 경로 형상이 일치하지 않습니다.');
  const clearance=demoClosestRouteDistance(route.rainPath,alert);
  const engineCheck=evaluateSyntheticAlternative(route,trip.syntheticRiskHazards||[]);
  const eligible=clearance>=r&&engineCheck.avoidsAlert&&engineCheck.profile.state==='evaluated'&&engineCheck.profile.coverage>=80&&engineCheck.profile.signalCount===0;
  attempts.push({id:candidate.id,status:eligible?'eligible':'intersects-hazard',clearance:Math.round(clearance),minutes:Math.round(route.duration/60)});
  return eligible?{candidate,route,engineCheck}:null;
 };
 for(const stage of syntheticDetourStages(trip,alert)){
  if(!isCurrent())return {chosen:null,attempts,canceled:true};
  onProgress(stage.name,attempts.length);
  const eligible=[];
  // Bounded pairs avoid exhausting the normal route API/session allowance.
  for(let i=0;i<stage.candidates.length;i+=2){
   const batch=stage.candidates.slice(i,i+2);
   const results=await Promise.allSettled(batch.map(run));
   results.forEach((result,index)=>{if(result.status==='fulfilled'){if(result.value)eligible.push(result.value);}else attempts.push({id:batch[index].id,status:'request-failed',reason:String(result.reason?.message||'경로 조회 실패').slice(0,180)});});
  }
  chosen=selectOptimalDemoDetour(eligible,alert,{minClearanceMeters:r});
  if(chosen)break;
 }
 return {chosen,attempts,canceled:!isCurrent()};
}
