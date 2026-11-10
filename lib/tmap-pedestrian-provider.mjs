// TMAP's licensed pedestrian directions; server-side only, no credentials in responses.
// Coordinates returned by the provider are used only after strict validation.
const valid=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lng)&&p.lat>=32&&p.lat<=40&&p.lng>=123&&p.lng<=133;
function coord(c){return {lng:Number(c?.[0]),lat:Number(c?.[1])};}
export function parsePedestrianRoute(data){
 const features=data?.features;
 if(!Array.isArray(features)||!features.length||features.length>20000)throw Error('보행자 경로 응답의 형식이 올바르지 않습니다.');
 const full=[],meta=[],facilities=[];
 let distance=null,duration=null;
 for(const f of features){
  const p=f?.properties||{},g=f?.geometry;
  if(p.totalDistance!==undefined&&distance===null)distance=Number(p.totalDistance);
  if(p.totalTime!==undefined&&duration===null)duration=Number(p.totalTime);
  if(g?.type==='LineString'){
   if(!Array.isArray(g.coordinates))throw Error('경로 좌표 오류');
   for(const c of g.coordinates){const point=coord(c);if(!valid(point))throw Error('경로 좌표 범위 오류');if(!full.length||full.at(-1).lat!==point.lat||full.at(-1).lng!==point.lng)full.push(point);}
   const facilityType=Number(p.facilityType);
   const facilityLabel=({11:'일반 보행자도로',12:'육교',14:'지하보도',15:'횡단보도',17:'계단'})[facilityType];
   if(facilityLabel&&g.coordinates.length){const position=coord(g.coordinates[Math.floor(g.coordinates.length/2)]);if(valid(position))facilities.push({...position,kind:facilityLabel,code:facilityType,source:'TMAP 보행 경로 시설 유형',status:'location_only'});}
  }
  if(g?.type==='Point'){
   const position=coord(g.coordinates),turn=Number(p.turnType);
   const label=turn===126?'지하보도':turn>=211&&turn<=217?'횡단보도':turn===125?'육교':turn===127?'계단':null;
   if(label&&valid(position))facilities.push({...position,kind:label,code:turn,source:'TMAP 보행 경로 안내점',status:'location_only'});
   if(p.description&&valid(position))meta.push({description:String(p.description).slice(0,90),point:position});
  }
 }
 if(!Number.isFinite(distance)||distance<=0||distance>100000||!Number.isFinite(duration)||duration<=0||duration>21600||full.length<2||full.length>10000)throw Error('보행 경로 거리 또는 시간이 올바르지 않습니다.');
 // Sample uniformly by geographic distance, not raw vertex index.
 const lengths=[0];
 for(let i=1;i<full.length;i++){
  const a=full[i-1],b=full[i],rad=Math.PI/180;
  const dy=(b.lat-a.lat)*111320,dx=(b.lng-a.lng)*111320*Math.cos((a.lat+b.lat)*rad/2);
  lengths.push(lengths.at(-1)+Math.hypot(dx,dy));
 }
 const total=lengths.at(-1);
 if(total<1)throw Error('이동거리가 없는 경로입니다.');
 const count=Math.min(12,Math.max(2,Math.ceil(duration/600)+1)),points=[];
 let j=1;
 for(let i=0;i<count;i++){
  const target=total*i/(count-1);
  while(j<lengths.length-1&&lengths[j]<target)j++;
  const d=lengths[j]-lengths[j-1],fraction=d>0?Math.min(1,Math.max(0,(target-lengths[j-1])/d)):0;
  points.push({lat:full[j-1].lat+(full[j].lat-full[j-1].lat)*fraction,lng:full[j-1].lng+(full[j].lng-full[j-1].lng)*fraction,label:'도보 경유 지점'});
 }
 return {distanceMeters:distance,durationSeconds:duration,points,geometry:full.filter((_,i)=>i%Math.max(1,Math.ceil(full.length/1500))===0||i===full.length-1),instructions:meta.filter(x=>valid(x.point)).slice(0,80),facilities:facilities.filter((v,i,a)=>a.findIndex(w=>w.kind===v.kind&&Math.abs(w.lat-v.lat)<0.00005&&Math.abs(w.lng-v.lng)<0.00005)===i).slice(0,40),provider:'TMAP 보행자 경로안내'};
}
export async function fetchPedestrianRoute(start,end,key,fetcher=fetch,walkingPriority='RECOMMEND'){
 const priority=({RECOMMEND:'0',BROAD_FIRST:'4',SHORTEST:'10',ACCESSIBLE:'30'})[walkingPriority];
 if(!priority)throw Error('지원하지 않는 TMAP 도보 경로 옵션입니다.');
 if(!key)throw Error('TMAP 보행자 API 인증키가 등록되지 않았습니다.');
 if(!valid(start)||!valid(end))throw Error('대한민국 좌표 범위를 확인하세요.');
 const url='https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';
 let response;
 try{response=await fetcher(url,{method:'POST',headers:{appKey:key,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({startX:start.lng,startY:start.lat,endX:end.lng,endY:end.lat,startName:encodeURIComponent('출발'),endName:encodeURIComponent('도착'),reqCoordType:'WGS84GEO',resCoordType:'WGS84GEO',searchOption:priority,sort:'index'}),signal:AbortSignal.timeout(12000)});}
 catch{throw Error('보행 경로 서비스 연결 실패');}
 if(!response.ok){await response.body?.cancel();throw Object.assign(new Error('TMAP 보행자 API 응답 실패 (HTTP '+response.status+')'),{providerStatus:response.status});}
 let data;try{data=await response.json();}catch{throw Error('보행 경로 응답 JSON 오류');}
 return parsePedestrianRoute(data);
}
