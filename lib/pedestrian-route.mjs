// TMAP's licensed pedestrian directions; server-side only, no credentials in responses.
// Coordinates returned by the provider are used only after strict validation.
const valid=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lng)&&p.lat>=32&&p.lat<=40&&p.lng>=123&&p.lng<=133;
function coord(c){return {lng:Number(c?.[0]),lat:Number(c?.[1])};}
export function parsePedestrianRoute(data){
 const features=data?.features;
 if(!Array.isArray(features)||!features.length||features.length>20000)throw Error('보행자 경로 응답의 형식이 올바르지 않습니다.');
 const full=[],meta=[];
 let distance=null,duration=null;
 for(const f of features){
  const p=f?.properties||{},g=f?.geometry;
  if(p.totalDistance!==undefined&&distance===null)distance=Number(p.totalDistance);
  if(p.totalTime!==undefined&&duration===null)duration=Number(p.totalTime);
  if(g?.type==='LineString'){
   if(!Array.isArray(g.coordinates))throw Error('경로 좌표 오류');
   for(const c of g.coordinates){const point=coord(c);if(!valid(point))throw Error('경로 좌표 범위 오류');if(!full.length||full.at(-1).lat!==point.lat||full.at(-1).lng!==point.lng)full.push(point);}
  }
  if(g?.type==='Point'&&p.description)meta.push({description:String(p.description).slice(0,90),point:coord(g.coordinates)});
 }
 if(!Number.isFinite(distance)||distance<=0||distance>100000||!Number.isFinite(duration)||duration<=0||duration>21600||full.length<2||full.length>10000)throw Error('보행 경로 거리 또는 시간이 올바르지 않습니다.');
 const count=Math.min(12,Math.max(2,Math.ceil(duration/600)+1)),points=[];
 for(let i=0;i<count;i++){const j=Math.round(i*(full.length-1)/(count-1));points.push({...full[j],label:'도보 경유 지점'});}
 return {distanceMeters:distance,durationSeconds:duration,points,geometry:full.filter((_,i)=>i%Math.max(1,Math.ceil(full.length/1500))===0||i===full.length-1),instructions:meta.filter(x=>valid(x.point)).slice(0,80),provider:'TMAP 보행자 경로안내'};
}
export async function fetchPedestrianRoute(start,end,key,fetcher=fetch){
 if(!key)throw Error('TMAP 보행자 API 인증키가 등록되지 않았습니다.');
 if(!valid(start)||!valid(end))throw Error('대한민국 좌표 범위를 확인하세요.');
 const url='https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';
 let response;
 try{response=await fetcher(url,{method:'POST',headers:{appKey:key,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({startX:start.lng,startY:start.lat,endX:end.lng,endY:end.lat,startName:encodeURIComponent('출발'),endName:encodeURIComponent('도착'),reqCoordType:'WGS84GEO',resCoordType:'WGS84GEO',searchOption:'0',sort:'index'}),signal:AbortSignal.timeout(12000)});}
 catch{throw Error('보행 경로 서비스 연결 실패');}
 if(!response.ok){await response.body?.cancel();throw Error('보행 경로 서비스 응답 실패 (HTTP '+response.status+')');}
 let data;try{data=await response.json();}catch{throw Error('보행 경로 응답 JSON 오류');}
 return parsePedestrianRoute(data);
}
