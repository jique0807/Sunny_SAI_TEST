// Nationwide KMA 5 km ultra-short-range forecast grid (RN1: 1-hour precipitation).
// Grid cell coordinates use the existing verified KMA LCC fromGrid/cellGeometry.
import {gridRequest} from './kma-rain-grid-probe.mjs';
const NX=149,NY=253,CELL_COUNT=NX*NY,MAX_BYTES=2*1024*1024;
const CACHE_MS=240000,cache=new Map();
const err=(status,message)=>Object.assign(Error(message),{status});
const kstTime=s=>new Date(Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8),
 +s.slice(8,10),+(s.slice(10,12)||0))-9*3600000).toISOString();
export function rainGridRequest(lead,key,now=Date.now()){
 if(!Number.isInteger(lead)||lead<0||lead>5)throw err(400,'예보 시간은 0~5시간 범위입니다.');
 const {url,baseTime,validTime}=gridRequest(key,now);
 const firstValid=Math.max(Date.parse(kstTime(validTime)),Math.ceil(Number(now)/3600000)*3600000);
 const maxLead=Math.min(5,Math.floor((Date.parse(kstTime(baseTime))+21600000-firstValid)/3600000));
 if(lead>maxLead)throw err(400,'해당 발표분의 예보 범위를 벗어났습니다.');
 const valid=new Date(firstValid+lead*3600000);
 const target=new Date(valid.getTime()+9*3600000).toISOString().slice(0,13).replace(/[-T]/g,'');
 url.searchParams.set('tmef',target);
 return {url,issuedAt:kstTime(baseTime),validTime:valid.toISOString(),lead,maxLead};
}
export function parseRainGrid(source){
 if(typeof source!=='string'||source.length>MAX_BYTES)throw err(502,'강수 격자 응답 크기 오류');
 // Exact 149 x 253 row-major KMA layout, x increasing first and y increasing next.
 // Official missing code is negative; no spatial interpolation into missing cells.
 const words=source.trim().split(/[\s,=]+/).filter(Boolean);
 if(words.length!==CELL_COUNT)throw err(502,'전국 강수예보 격자 개수가 일치하지 않습니다.');
 const cells=[];let valid=0,missing=0,zero=0;
 for(let index=0;index<CELL_COUNT;index++){
  const token=words[index];
  if(!/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(token))
   throw err(502,'전국 강수예보 값 형식 오류');
  const value=Number(token);
  if(!Number.isFinite(value)||value>10000)throw err(502,'강수예보 수치 범위 오류');
  if(value<0){missing++;continue;}
  valid++;
  if(value===0){zero++;continue;}
  cells.push([index%NX+1,Math.floor(index/NX)+1,value]);
 }
 return {nx:NX,ny:NY,valid,missing,zero,cells};
}
async function boundedText(response){
 if(!response.ok){await response.body?.cancel();throw err(502,'기상청 전국 강수격자 응답 HTTP '+response.status);}
 if(Number(response.headers.get('content-length')||0)>MAX_BYTES){
  await response.body?.cancel();throw err(502,'강수 격자 응답 크기 초과');}
 if(!response.body)throw err(502,'강수 격자 응답 없음');
 const reader=response.body.getReader(),parts=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;if(!value)continue;
  total+=value.byteLength;if(total>MAX_BYTES){await reader.cancel();throw err(502,'강수 격자 응답 크기 초과');}
  parts.push(value);
 }}finally{try{reader.releaseLock();}catch{}}
 const bytes=new Uint8Array(total);let p=0;for(const a of parts){bytes.set(a,p);p+=a.byteLength;}
 return new TextDecoder().decode(bytes);
}
export async function nationalRainGrid(lead,key,fetcher=fetch,now=Date.now()){
 if(!key)throw err(503,'기상청 인증키 설정이 필요합니다.');
 const q=rainGridRequest(lead,key,now);
 const isDefaultFetcher=fetcher===globalThis.fetch;
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)));
 const fingerprint=Array.from(hash.slice(0,6),x=>x.toString(16).padStart(2,'0')).join('');
 const id=fingerprint+':'+q.issuedAt+':'+q.validTime;
 const hit=isDefaultFetcher?cache.get(id):null;
 if(hit&&hit.until>now)return hit.promise;
 const promise=(async()=>{
  let response;
  try{response=await fetcher(q.url.toString(),{redirect:'error',
   signal:AbortSignal.timeout(15000),headers:{Accept:'text/plain,*/*'}});
  }catch{throw err(502,'기상청 전국 강수예보 서비스 연결 실패 또는 시간초과');}
  const data=parseRainGrid(await boundedText(response));
  return {provider:'kma',product:'전국 5km 초단기 강수예보 RN1',unit:'mm/1h',
   source:'기상청 API허브 nph-dfs_vsrt_grd',...data,
   lead,issuedAt:q.issuedAt,validTime:q.validTime,maxLead:q.maxLead,
   fetchedAt:new Date().toISOString(),
   caution:'기상청 5km 초단기 강수량 예보이며 레이더 관측/도로 실측이 아닙니다. 결측은 안전·무강수를 의미하지 않습니다.'};
 })();
 if(isDefaultFetcher){if(cache.size>=16)cache.delete(cache.keys().next().value);cache.set(id,{promise,until:now+CACHE_MS});}
 try{return await promise;}catch(e){if(isDefaultFetcher)cache.delete(id);throw e;}
}
