// Preview-only feasibility probe; NOT a hazard overlay and NOT a safety signal.
// Do not publish API tokens, WMS images, provider URLs or unverified hazard locations.
import {kmaRoadRisk} from './kma-road.mjs';
import {safemapWms} from './safemap.mjs';
const KMA_WARN='https://apihub.kma.go.kr/api/typ01/url/wrn_now_data.php';
async function boundedText(res,max=100000){
 if(!res.body)return '';
 const reader=res.body.getReader();let chunks=[],size=0;
 try{
  while(size<max){
   const {done,value}=await reader.read();if(done)break;if(!value)continue;
   let take=value.subarray(0,Math.min(value.byteLength,max-size));chunks.push(take);size+=take.length;
  }
 }finally{try{await reader.cancel();}catch{}}
 const bytes=new Uint8Array(size);let i=0;for(const x of chunks){bytes.set(x,i);i+=x.length;}
 return new TextDecoder('utf-8',{fatal:false}).decode(bytes);
}
export async function probeKmaWarning(key,fetcher=fetch){
 if(!key)return{state:'key_missing',geometry:'region_codes_only'};
 const url=new URL(KMA_WARN);
 for(const [k,v]of Object.entries({fe:'f',disp:'1',help:'0',authKey:key}))
  url.searchParams.set(k,v);
 try{
  const res=await fetcher(url.toString(),{redirect:'error',
   signal:AbortSignal.timeout(12000),headers:{Accept:'text/plain,*/*'}});
  const type=(res.headers.get('content-type')||'').split(';')[0];
  const text=await boundedText(res);
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const records=lines.filter(s=>!s.startsWith('#')&&!s.startsWith('@')&&
   !/^\s*(?:REG_ID|REG_UP|TM_FC|RESULT|CODE|ERROR)/i.test(s));
  const nonData=/<html|<!doctype|authkey|invalid.?key|unauthoriz|잘못된.?인증|서비스.?오류|이용.?제한/i.test(text);
  const seenColumns=/(?:REG_ID|REG_UP|TM_FC|WRN|LVL)/i.test(text);
  return {state:!res.ok?'http_error':nonData?'provider_error':
   !lines.length?'empty_response':records.length?'text_received':'header_or_empty_received',
   http:res.status,type,lines:lines.length,
   candidateRows:nonData?0:Math.min(records.length,5000),
   hasRecognizableFieldNames:seenColumns,
   geometry:'region_codes_only',
   caveat:'Provider returned data/format, not a verified active warning or a geospatial boundary'};
 }catch{return{state:'request_failed',geometry:'region_codes_only'};}
}
export async function probeKmaRoadRisk(key,fetcher=fetch){
 if(!key)return{state:'key_missing',geometry:'unverified'};
 try{
  const data=await kmaRoadRisk('001',key,fetcher);
  return{state:'provider_zip_parsed',road:'001',result:data.status,
   recordCount:data.recordCount,
   georeferenced: data.locations.length,unmapped:data.unmapped,
   fileTypes:data.fileTypes,geometry:
    data.status==='georeferenced'?'verified_geometry':'not_verified',
   caveat:'Records, grade mappings, valid times and road-link geometry must be verified before alerting drivers'};
 }catch(e){
  const err=String(e.message||'').slice(0,125);
  return{state:'request_or_format_failed',road:'001',
   reason:/^(?:도로위험|기상청|지원하는)/.test(err)?err:'Provider ZIP/format unavailable',
   geometry:'not_verified'};
 }
}
export async function probeFloodWms(key,fetcher=fetch){
 if(!key)return{state:'key_missing',geometry:'image_only'};
 const q=new URLSearchParams({bbox:'14126000,4510000,14128000,4512000',
  width:'256',height:'256'});
 try{
  const result=await safemapWms(q,key,fetcher);
  await result.body?.cancel();
  return{state:'png_received',imageType:'image/png',
   geometry:'wms_raster_only',spatialIntersectionVerified:false,
   caveat:'Historic 100-year flood extent; WMS PNG alone does NOT prove any road is inundated'};
 }catch(e){
  return{state:'request_or_format_failed',geometry:'wms_raster_only',
   reason:/^Safemap/.test(e.message||'')?String(e.message).slice(0,95):
    'Service request not validated'};
 }
}
export async function checkRouteLayerFeasibility({kmaKey,safemapKey,fetcher=fetch}){
 const [warning,road,flood]=await Promise.all([
  probeKmaWarning(kmaKey,fetcher),
  probeKmaRoadRisk(kmaKey,fetcher),
  probeFloodWms(safemapKey,fetcher)
 ]);
 return{checkedAt:new Date().toISOString(),previewOnly:true,
  warning,road,flood,
  constraints:{excludes:['humidity','wind_direction','general_temperature','cctv'],
   activeDangerRequires:['verified geometry','valid time','official severity',
    'route intersection','driver ETA'],
   neverInfer:['ice from low temperature','flood from WMS image alone',
    'alert polygon from region name alone','rainfall from radar colors']}};
}
