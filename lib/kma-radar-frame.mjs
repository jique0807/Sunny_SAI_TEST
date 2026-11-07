// Preview-only official KMA precipitation forecast distribution image.
// This source has its own basemap: never stretch it onto Kakao as a georeferenced overlay.
import {probeUrl,latestKoreanRadarTime} from './kma-radar-probe.mjs';

export const RADAR_LEADS=Object.freeze([0,10,20,30,40,50,60,70,80,90,100,110,120]);
const MAX_BYTES=3*1024*1024;
const CACHE_MS=90_000;
const cache=new Map();
const error=(status,message)=>Object.assign(Error(message),{status});

export function radarRequest(lead,key,now=Date.now()){
 if(!RADAR_LEADS.includes(lead))throw error(400,'지원하지 않는 강수예측 시간입니다.');
 if(!key)throw error(503,'기상청 인증키가 설정되지 않았습니다.');
 const url=probeUrl('distribution',key,now);
 url.searchParams.set('ef',String(lead));
 // The official distribution endpoint includes its own background map.
 url.searchParams.set('legend','0');
 return url;
}
export function requestedTimes(now=Date.now(),lead=60){
 const base=latestKoreanRadarTime(now);
 const utc=Date.UTC(Number(base.slice(0,4)),Number(base.slice(4,6))-1,
  Number(base.slice(6,8)),Number(base.slice(8,10)),Number(base.slice(10,12)))-9*3600000;
 return{baseTime:new Date(utc).toISOString(),requestedValidTime:new Date(utc+lead*60000).toISOString()};
}
function imageType(bytes){
 if(bytes.length<16)return null;
 if([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return'image/png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return'image/jpeg';
 if(bytes[0]===71&&bytes[1]===73&&bytes[2]===70&&bytes[3]===56&&
    (bytes[4]===55||bytes[4]===57)&&bytes[5]===97)return'image/gif';
 if(bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&
    bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80)return'image/webp';
 return null;
}
async function readBounded(response){
 const length=Number(response.headers.get('content-length')||0);
 if(length>MAX_BYTES)throw error(502,'기상청 강수영상 크기 제한 초과');
 if(!response.body)throw error(502,'기상청 강수영상 본문 없음');
 const reader=response.body.getReader(),parts=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   if(!value)continue;size+=value.byteLength;
   if(size>MAX_BYTES)throw error(502,'기상청 강수영상 크기 제한 초과');
   parts.push(value);
  }
 }catch(e){try{await reader.cancel();}catch{}throw e;}
 const output=new Uint8Array(size);let n=0;
 for(const part of parts){output.set(part,n);n+=part.byteLength;}
 return output;
}
export async function fetchRadarFrame(lead,key,fetcher=fetch,now=Date.now(),baseTime){
 const url=radarRequest(lead,key,now),times=requestedTimes(now,lead);
 if(baseTime){
  const base=Date.parse(baseTime);
  const kst=new Date(base+9*3600000).toISOString().slice(0,16).replace(/[-T:]/g,'');
  url.searchParams.set('tm',kst);
  times.baseTime=baseTime;times.requestedValidTime=new Date(base+lead*60000).toISOString();
 }
 const useCache=fetcher===globalThis.fetch;
 const id=times.baseTime+':'+lead;
 const hit=useCache?cache.get(id):null;
 if(hit&&hit.until>now)return hit.promise;
 const promise=(async()=>{
  let response;
  try{response=await fetcher(url.toString(),{
   redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{Accept:'image/png,image/jpeg,image/webp,image/gif,*/*'}
  });}catch{throw error(502,'기상청 영상 서버 연결 지연 또는 실패');}
  if(!response.ok){await response.body?.cancel();throw error(502,'기상청 강수영상 요청 실패 (HTTP '+response.status+')');}
  const bytes=await readBounded(response);
  const mime=imageType(bytes);
  if(!mime)throw error(502,'해당 시각의 기상청 강수영상을 확인할 수 없습니다. 예보자료 또는 영상 이용권한을 확인하세요.');
  return {bytes,mime,...times,lead,source:'기상청 초단기 강수예측 분포도'};
 })();
 if(useCache){
  if(cache.size>=24)cache.delete(cache.keys().next().value);
  cache.set(id,{promise,until:now+CACHE_MS});
 }
 try{return await promise;}catch(e){if(useCache)cache.delete(id);throw e;}
}
