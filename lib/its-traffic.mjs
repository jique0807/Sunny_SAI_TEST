// Official National Transport Information Center (ITS) event / traffic adapters.
// Only server code may use ROAD_API_KEY. No arbitrary upstream URL, no credential exposure.
const ENDPOINT='https://openapi.its.go.kr:9443/';
const korea=p=>p&&Number.isFinite(p.lat)&&p.lat>=32&&p.lat<=40&&Number.isFinite(p.lng)&&p.lng>=123&&p.lng<=133;
const txt=(x,n=120)=>String(x??'').replace(/\p{Cc}/gu,' ').trim().slice(0,n);
const stamp=x=>{
 if(x===null||x===undefined||x==='')return null;
 const t=String(x).replace(/[^0-9]/g,'');
 if(t.length===14||t.length===12||t.length===8){
  const s=t.padEnd(14,'0'),iso=`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}+09:00`;
  const d=Date.parse(iso);return Number.isFinite(d)?new Date(d).toISOString():null;
 }
 const d=Date.parse(String(x));return Number.isFinite(d)?new Date(d).toISOString():null;
};
export function validateItsPoints(points){
 return Array.isArray(points)&&points.length>=2&&points.length<=24&&points.every(korea);
}
export function itsBounds(points){
 if(!validateItsPoints(points))return null;
 const lngs=points.map(p=>p.lng),lats=points.map(p=>p.lat);
 return {minX:Math.max(123,Math.min(...lngs)-.04),maxX:Math.min(133,Math.max(...lngs)+.04),
  minY:Math.max(32,Math.min(...lats)-.04),maxY:Math.min(40,Math.max(...lats)+.04)};
}
export function itsUrl(type,key,bounds){
 if(!['eventInfo','trafficInfo'].includes(type)||!key||!bounds)throw Error('ITS configuration missing');
 const url=new URL(type,ENDPOINT);
 Object.entries({apiKey:key,type:'all',...(type==='eventInfo'?{eventType:'all'}:{drcType:'all'}),...bounds,getType:'json'})
  .forEach(([k,v])=>url.searchParams.set(k,String(v)));
 return url;
}
function upstreamCodeError(raw){
 const code=raw?.response?.header?.resultCode??raw?.response?.resultCode??raw?.header?.resultCode??raw?.resultCode;
 if(code===null||code===undefined||code==='')return false;
 return !['00','0','200','0000','SUCCESS','NORMAL_CODE'].includes(String(code));
}
function records(raw){
 if(Array.isArray(raw))return raw;
 if(!raw||typeof raw!=='object')return null;
 const response=raw.response??raw;
 const candidates=[response.data,response.items?.item,response.items,response.eventInfo,response.trafficInfo,raw.data,raw.items?.item,raw.eventInfo,raw.trafficInfo];
 for(const candidate of candidates){
  if(Array.isArray(candidate))return candidate;
  if(candidate&&typeof candidate==='object'&&Array.isArray(candidate.item))return candidate.item;
 }
 const total=Number(response.totalCount??response.totalcount??raw.totalCount);
 if(total===0)return [];
 return null;
}
const reply=(status,items=[],detail={})=>({status,source:'국가교통정보센터 ITS',items,...detail});
export function normalizeItsEvents(raw,{now=Date.now()}={}){
 if(upstreamCodeError(raw))return reply('failed',[],{reason:'ITS 돌발상황 기관 인증·응답코드 확인 필요'});
 const rows=records(raw);
 if(!rows)return reply('failed',[],{reason:'ITS 돌발상황 응답 형식 확인 필요'});
 const found=[];
 for(const row of rows.slice(0,2000)){
  const lat=Number(row.coordY??row.coordy??row.latitude??row.lat),lng=Number(row.coordX??row.coordx??row.longitude??row.lng);
  if(!korea({lat,lng}))continue;
  const end=stamp(row.endDate??row.enddate??row.endTime);
  const start=stamp(row.startDate??row.startdate??row.createdDate??row.occrrncDate);
  if(end&&Date.parse(end)<now-60000)continue;
  if(start&&Date.parse(start)>now+600000)continue;
  const kind=txt(row.eventType??row.eventtype??row.type??'',40);
  const detail=txt(row.eventDetailType??row.eventdetailtype??row.message??'',120);
  const roadName=txt(row.roadName??row.roadname??'',70);
  const message=txt(row.message??row.eventMessage??row.description??detail,160);
  if(!kind&&!message)continue;
  // The feed contains location points. Even when fresh, a point is not a verified closed road segment.
  const type=/사고|충돌/.test(kind+' '+detail)?'accident':/공사|작업/.test(kind+' '+detail)?'construction':
   /통제|차단|폐쇄/.test(kind+' '+detail)?'restriction':/기상|폭설|폭우|침수|재난/.test(kind+' '+detail)?'weather':'incident';
  const occurredAt=start,expiresAt=end;
  const reportedFresh=Boolean(occurredAt&&now-Date.parse(occurredAt)>=-600000&&now-Date.parse(occurredAt)<=24*3600000);
  found.push({lat,lng,type,roadName,kind,detail,message,occurredAt,expiresAt,
   provider:'국가교통정보센터 ITS',live:true,reportedFresh,linkId:txt(row.linkId??row.linkid??'',35),
   segmentVerified:false,sourceCheckedAt:new Date(now).toISOString()});
  if(found.length>=250)break;
 }
 return reply(found.length?'received':rows.length?'empty':'empty',found,{
  fetchedAt:new Date(now).toISOString(),rawCount:rows.length,caution:'ITS 제공 위치는 도로구간·진행방향 일치가 검증되지 않은 경우 참고정보입니다.'});
}
export function normalizeItsTraffic(raw,{now=Date.now()}={}){
 if(upstreamCodeError(raw))return {status:'failed',count:0,reason:'ITS 소통정보 기관 인증·응답코드 확인 필요'};
 const rows=records(raw);
 if(!rows)return {status:'failed',count:0,reason:'ITS 소통정보 응답 형식 확인 필요'};
 const valid=rows.filter(x=>x&&txt(x.linkId??x.linkid)&&Number.isFinite(Number(x.speed))&&Number(x.speed)>=0);
 return {status:rows.length&&!valid.length?'failed':'received',count:valid.length,fetchedAt:new Date(now).toISOString(),
  source:'국가교통정보센터 ITS',routeMatched:false,
  caution:'도로 링크 공간정보와 일치 검증 전이므로 속도만으로 경로의 정체를 확정하지 않습니다.'};
}
export async function fetchItsRouteContext(key,points,fetcher=fetch,{now=Date.now(),includeTraffic=true}={}){
 if(!key)return {status:'missing',items:[],traffic:{status:'missing',count:0},reason:'ROAD_API_KEY 미설정'};
 const bounds=itsBounds(points);
 if(!bounds)return {status:'failed',items:[],traffic:{status:'failed',count:0},reason:'국내 경로 위치 2~24개 검증 실패'};
 const take=async type=>{
  try{
   const response=await fetcher(itsUrl(type,key,bounds).toString(),{
    headers:{Accept:'application/json'},signal:AbortSignal.timeout(12500)});
   if(!response.ok)return {status:'failed',reason:response.status===401||response.status===403?'ITS 이용 승인 확인 필요':'ITS 기관 HTTP 응답 실패',providerStatus:response.status};
   const raw=await response.json();
   return type==='eventInfo'?normalizeItsEvents(raw,{now}):normalizeItsTraffic(raw,{now});
  }catch{return {status:'failed',reason:'ITS 기관 연결 또는 응답 형식 확인 필요'};}
 };
 const [events,traffic]=await Promise.all([take('eventInfo'),includeTraffic?take('trafficInfo'):Promise.resolve({status:'not-checked',count:0})]);
 return {status:events.status,items:events.items||[],traffic,source:'국가교통정보센터 ITS',
  fetchedAt:new Date(now).toISOString(),reason:events.reason||null,caution:events.caution||null};
}
