// Kakao Maps REST pedestrian routing adapter.
// Documentation: https://developers.kakao.com/docs/ko/kakaomap/rest-api
// Do not fall back to car navigation or draw straight lines when walking fails.
const within=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat>=32&&p.lat<=40&&p.lng>=123&&p.lng<=133;
const meters=(a,b)=>Math.hypot((b.lat-a.lat)*111195,(b.lng-a.lng)*111195*Math.cos((a.lat+b.lat)*Math.PI/360));
const fail=message=>Object.assign(Error(message),{status:422});
export const WALK_ROUTE_MODES=Object.freeze(['BROAD_FIRST','SHORTEST','ACCESSIBLE']);
export function walkingQuery(origin,destination,waypoints=[],mode='BROAD_FIRST'){
 if(!within(origin)||!within(destination)||!Array.isArray(waypoints)||waypoints.length>5||
    waypoints.some(x=>!within(x))||!WALK_ROUTE_MODES.includes(mode))throw fail('도보 길찾기 좌표 또는 옵션이 올바르지 않습니다.');
 const url=new URL('https://dapi.kakao.com/v2/routing/walk');
 const q=url.searchParams;
 q.set('start_x',String(origin.lng));q.set('start_y',String(origin.lat));
 q.set('end_x',String(destination.lng));q.set('end_y',String(destination.lat));
 q.set('input_coord','WGS84');q.set('output_coord','WGS84');q.set('route_mode',mode);
 if(waypoints.length){q.set('via_x',waypoints.map(p=>p.lng).join(','));q.set('via_y',waypoints.map(p=>p.lat).join(','));}
 return url;
}
export function normalizeWalkingRoute(data,departure){
 if(data?.status!=='OK'||!Array.isArray(data.route?.legs)||!data.route.legs.length)
  throw fail('카카오에서 도보 경로를 찾지 못했습니다. 위치 또는 서비스 사용 권한을 확인해주세요.');
 const props=data.route.properties||{},duration=Number(props.totalTime),distance=Number(props.totalDistance);
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(distance)||distance<=0||distance>1000000)
  throw fail('도보 경로의 거리·예상시간을 검증할 수 없습니다.');
 if(!Number.isFinite(departure))throw fail('출발시각 정보가 올바르지 않습니다.');
 const roads=[];let totalPoints=0;
 for(const leg of data.route.legs){
  if(!Array.isArray(leg.steps))continue;
  for(const step of leg.steps){
   const points=step.path?.points||[],flat=[];
   if(!Array.isArray(points)||points.length>12000)throw fail('도보 경로 좌표 수가 허용 범위를 초과했습니다.');
   for(const pair of points){
    if(!Array.isArray(pair)||pair.length<2)throw fail('도보 경로 좌표 형식 오류');
    const p={lng:Number(pair[0]),lat:Number(pair[1])};
    if(!within(p))throw fail('도보 경로 좌표의 범위가 올바르지 않습니다.');
    flat.push(p.lng,p.lat);
   }
   if(flat.length<4)continue;
   totalPoints+=flat.length/2;
   if(totalPoints>14000)throw fail('도보 경로 좌표 수가 너무 많습니다.');
   const rawDuration=Number(step.properties?.time),rawDistance=Number(step.properties?.distance);
   roads.push({
    name:String(step.properties?.guidance||'보행로').slice(0,55),
    duration:Number.isFinite(rawDuration)&&rawDuration>=0?rawDuration:0,
    distance:Number.isFinite(rawDistance)&&rawDistance>=0?rawDistance:0,
    vertexes:flat
   });
  }
 }
 if(!roads.length)throw fail('도보 경로 형상이 제공되지 않았습니다.');
 // Reject data that is obviously inconsistent rather than drawing fictional paths.
 const first={lng:roads[0].vertexes[0],lat:roads[0].vertexes[1]};
 const lastRoad=roads.at(-1),last={lng:lastRoad.vertexes.at(-2),lat:lastRoad.vertexes.at(-1)};
 if(meters(first,last)>Math.max(5000,distance*3))throw fail('도보 경로 형상과 전체 거리가 일치하지 않습니다.');
 const providerDuration=roads.reduce((sum,r)=>sum+r.duration,0);
 if(providerDuration>0)for(const r of roads)r.duration=r.duration*duration/providerDuration;
 else{
  // The walking API may report only total time; use geometric distance to
  // distribute provider total duration, not a fabricated route geometry.
  const lengths=roads.map(r=>{
   let sum=0;for(let i=2;i<r.vertexes.length;i+=2)
    sum+=meters({lng:r.vertexes[i-2],lat:r.vertexes[i-1]},{lng:r.vertexes[i],lat:r.vertexes[i+1]});
   return sum;
  });
  const total=lengths.reduce((a,b)=>a+b,0);
  if(total<=0)throw fail('도보 경로의 이동 좌표를 확인할 수 없습니다.');
  for(let i=0;i<roads.length;i++)roads[i].duration=duration*lengths[i]/total;
 }
 let elapsed=0;const vertices=[],rainPath=[];
 for(const road of roads){
  const pts=[];for(let i=0;i<road.vertexes.length;i+=2)pts.push({lng:road.vertexes[i],lat:road.vertexes[i+1]});
  const distances=[0];for(let i=1;i<pts.length;i++)distances[i]=distances[i-1]+meters(pts[i-1],pts[i]);
  for(let i=0;i<pts.length;i++){
   const p=pts[i],secs=elapsed+(distances.at(-1)?road.duration*distances[i]/distances.at(-1):0);
   vertices.push(p);rainPath.push({...p,seconds:secs,label:road.name});
  }
  elapsed+=road.duration;
 }
 if(rainPath.length<2)throw fail('도보 경로 형상이 부족합니다.');
 rainPath[0].seconds=0;rainPath.at(-1).seconds=duration;
 const count=Math.min(18,Math.max(2,Math.ceil(duration/240))),samples=[];
 for(let i=0;i<count;i++){
  const target=(i+.5)*duration/count;
  let index=1;while(index<rainPath.length-1&&rainPath[index].seconds<target)index++;
  const a=rainPath[index-1],b=rainPath[index],span=b.seconds-a.seconds;
  const t=span>0?Math.max(0,Math.min(1,(target-a.seconds)/span)):0;
  const sec=target;
  samples.push({seconds:sec,lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t,
   label:b.label||'도보 경로',eta:new Date(departure+sec*1000).toISOString()});
 }
 const shrink=(list,cap)=>list.filter((_,i)=>i%Math.max(1,Math.ceil(list.length/cap))===0||i===list.length-1);
 return {rainPath:shrink(rainPath,6000),vertices:shrink(vertices,3500),
  samples,distance,duration,departure:new Date(departure).toISOString(),
  source:'Kakao Maps Walking',travelMode:'walking',mode:'walking',
  fetchedAt:new Date().toISOString(),etaMethod:'카카오 보행로별 예상시간 · 실제 보행속도와 다를 수 있음',
  caution:'공식 도보 길찾기 좌표이며 보도 상태·횡단보도 안전·실제 통행 가능 여부를 확인한 정보가 아닙니다.'};
}
