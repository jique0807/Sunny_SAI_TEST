// Adapt provider-backed TMAP walking geometry to Sunny SAI's existing
// driving/walking route contract. Never substitute vehicle roads or a straight line.
import {fetchPedestrianRoute} from './tmap-pedestrian-provider.mjs';
const meters=(a,b)=>{
 const lat=(a.lat+b.lat)*Math.PI/360;
 return Math.hypot((b.lat-a.lat)*111195,(b.lng-a.lng)*111195*Math.cos(lat));
};
const valid=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lng)&&p.lat>=32&&p.lat<=40&&p.lng>=123&&p.lng<=133;
const bad=message=>Object.assign(new Error(message),{status:422});
function sampleAt(path,seconds){
 let j=1;
 while(j<path.length-1&&path[j].seconds<seconds)j++;
 const a=path[j-1],b=path[j],dt=b.seconds-a.seconds;
 const f=dt>0?Math.min(1,Math.max(0,(seconds-a.seconds)/dt)):0;
 return {lat:a.lat+(b.lat-a.lat)*f,lng:a.lng+(b.lng-a.lng)*f};
}
export function normalizeTmapWalkingRoute(providerRoute,departure,{origin,destination}={}){
 const geo=providerRoute?.geometry,duration=providerRoute?.durationSeconds,distance=providerRoute?.distanceMeters;
 if(!Array.isArray(geo)||geo.length<2||geo.length>6000||!geo.every(valid)||
   !Number.isFinite(duration)||duration<=0||duration>21600||
   !Number.isFinite(distance)||distance<=0||distance>100000||
   !Number.isFinite(departure))throw bad('TMAP 보행 경로의 좌표·거리·시간을 검증할 수 없습니다.');
 if(origin&&(!valid(origin)||meters(geo[0],origin)>1200))throw bad('TMAP 보행 경로 시작점이 출발지와 일치하지 않습니다.');
 if(destination&&(!valid(destination)||meters(geo.at(-1),destination)>1200))throw bad('TMAP 보행 경로 종료점이 목적지와 일치하지 않습니다.');
 const lengths=[0];
 for(let i=1;i<geo.length;i++)lengths.push(lengths.at(-1)+meters(geo[i-1],geo[i]));
 const total=lengths.at(-1);
 if(total<1)throw bad('이동거리가 없는 보행 경로입니다.');
 const rainPath=geo.map((p,i)=>({...p,seconds:duration*lengths[i]/total,label:'TMAP 도보 경로'}));
 rainPath[0].seconds=0;rainPath.at(-1).seconds=duration;
 const count=Math.min(18,Math.max(2,Math.ceil(duration/240))),samples=[];
 for(let i=0;i<count;i++){
  const seconds=(i+.5)*duration/count,p=sampleAt(rainPath,seconds);
  samples.push({...p,seconds,label:'TMAP 도보 경로',eta:new Date(departure+seconds*1000).toISOString()});
 }
 const facilities=(providerRoute?.facilities||[]).filter(f=>valid(f)&&f.status==='location_only').slice(0,40);
 return {rainPath,vertices:geo.map(p=>({lat:p.lat,lng:p.lng})),samples,
  distance,duration,departure:new Date(departure).toISOString(),
  source:'TMAP Pedestrian',provider:'TMAP',travelMode:'walking',mode:'walking',
  facilities,instructions:(providerRoute?.instructions||[]).slice(0,80),
  fetchedAt:new Date().toISOString(),
  etaMethod:'TMAP 전체 예상시간을 경로 거리 비율로 배분한 추정 통과시각',
  caution:'실제 TMAP 보행 경로 기반 예보 평가이며, 현장 보행로 상태·침수·통제는 검증되지 않았습니다.'};
}
export async function tmapWalkingRoute(start,end,departure,key,fetcher=fetch,walkingPriority='RECOMMEND'){
 const data=await fetchPedestrianRoute(start,end,key,fetcher,walkingPriority);
 return normalizeTmapWalkingRoute(data,departure,{origin:start,destination:end});
}
