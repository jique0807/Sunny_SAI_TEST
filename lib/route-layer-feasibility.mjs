// Preview-only feasibility probe; NOT a hazard overlay and NOT a safety signal.
// Do not publish API tokens, WMS images, provider URLs or unverified hazard locations.
import {kmaRoadRisk,extractZipFiles} from './kma-road.mjs';
import {safemapUrl} from './safemap.mjs';
const KMA_WARN='https://apihub.kma.go.kr/api/typ01/url/wrn_now_data.php';
async function boundedBytes(res,max){
 if(!res.body)return new Uint8Array();
 const reader=res.body.getReader();let chunks=[],size=0;
 try{
  while(size<max){
   const {done,value}=await reader.read();if(done)break;if(!value)continue;
   let take=value.subarray(0,Math.min(value.byteLength,max-size));chunks.push(take);size+=take.length;
  }
 }finally{try{await reader.cancel();}catch{}}
 const bytes=new Uint8Array(size);let i=0;for(const x of chunks){bytes.set(x,i);i+=x.length;}
 return bytes;
}
async function boundedText(res,max=100000){
 return new TextDecoder('utf-8',{fatal:false}).decode(await boundedBytes(res,max));
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
  return {state:res.status===401||res.status===403?'access_denied':
   !res.ok?'http_error':nonData?'provider_error':
   !lines.length?'empty_response':records.length?'text_received':'header_or_empty_received',
   http:res.status,type,lines:lines.length,
   candidateRows:!res.ok||nonData?0:Math.min(records.length,5000),
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
  return{state:e.reception==='disconnected'?'request_failed':'request_or_format_failed',road:'001',
   reason:/^(?:도로위험|기상청|지원하는)/.test(err)?err:'Provider ZIP/format unavailable',
   geometry:'not_verified'};
 }
}
// ZIP schema discovery: headers only; do not expose any raw records/coordinates.
export async function inspectRoadArchiveSchema(key,fetcher=fetch){
 if(!key)return{state:'key_missing'};
 const u=new URL('https://apihub.kma.go.kr/api/typ04/url/road_file_down.php');
 u.searchParams.set('roadNum','001');u.searchParams.set('authKey',key);
 try{
  const res=await fetcher(u.toString(),{
   signal:AbortSignal.timeout(15000),redirect:'error',
   headers:{Accept:'application/zip,application/octet-stream'}});
  if(!res.ok){await res.body?.cancel();return{state:'http_error',http:res.status};}
  const len=Number(res.headers.get('content-length')||0);
  if(len>6*1024*1024){await res.body?.cancel();return{state:'oversized_archive'};}
  const b=new Uint8Array(await res.arrayBuffer());
  if(b.length>6*1024*1024||b[0]!==80||b[1]!==75)return{state:'not_zip'};
  const files=extractZipFiles(b);
  const schemas=files.slice(0,8).map(file=>{
   const line=file.text.split(/\r?\n/).find(x=>x.trim()&&!x.trim().startsWith('#'))||'';
   const delimiter=line.includes('\t')?'\t':line.includes(',')?',':'|';
   const columns=line.split(delimiter).slice(0,60).map(x=>
    x.trim().replace(/[\u0000-\u001f<>]/g,'').slice(0,35)).filter(Boolean);
   const joined=columns.join(' ');
   const norm=columns.map(x=>x.toUpperCase());
   const idx=name=>norm.indexOf(name);
   const c=[idx('F_LON'),idx('F_LAT'),idx('T_LON'),idx('T_LAT')];
   const code=idx('B_ICE')>=0?'B_ICE':idx('FOG')>=0?'FOG':null;
   let georeferencedRows=0,examinedRows=0,codeStats=new Map();
   for(const raw of file.text.split(/\r?\n/).slice(1,2401)){
    if(!raw.trim()||raw.startsWith('#'))continue;
    examinedRows++;
    const fields=raw.split(delimiter);
    if(c.every(i=>i>=0)){
     const [flon,flat,tlon,tlat]=c.map(i=>Number(fields[i]));
     if([flon,tlon].every(x=>x>=123&&x<=133)&&
        [flat,tlat].every(x=>x>=32&&x<=40))georeferencedRows++;
    }
    if(code){
     const val=String(fields[idx(code)]||'').trim().slice(0,12);
     if(val&&/^[a-zA-Z0-9.+-]+$/.test(val))
      codeStats.set(val,(codeStats.get(val)||0)+1);
    }
   }
   return{columnCount:columns.length,columns:columns.slice(0,36),
    hasCoordinateColumns:/(latitude|longitude|위도|경도|(?:^|_)LAT|(?:^|_)LON|(?:^|_)LNG)/i.test(joined),
    hasRoadLinkColumns:/(link|노드|링크|roadid|node)/i.test(joined),
    examinedRows,georeferencedRows,codeField:code,
    rawCodeFrequency:[...codeStats.entries()].slice(0,12).map(([raw,count])=>({raw,count})),
    gradeMeaning:'unverified; numeric risk codes MUST NOT be mapped to warning severity'};
  });
  return{state:'schema_received',fileCount:files.length,schemas};
 }catch{return{state:'archive_schema_unavailable'};}
}
export async function probeFloodWms(key,fetcher=fetch,local=false){
 if(!key)return{state:'key_missing',geometry:'wms_raster_only'};
 const q=new URLSearchParams({bbox:'14126000,4510000,14128000,4512000',width:'256',height:'256'});
 try{
  const url=local?new URL('https://www.safemap.go.kr/openapi2/IF_0100_WMS'):safemapUrl(q,key);
  if(local)url.search=new URLSearchParams({
   serviceKey:key,srs:'EPSG:4326',
   bbox:'126.84814453125,35.137879119634185,126.859130859375,35.146862906756304',
   format:'image/png',width:'256',height:'256',transparent:'TRUE'
  });
  const res=await fetcher(url.toString(),{
   signal:AbortSignal.timeout(12000),redirect:'error',headers:{Accept:'image/png'}});
  const http=res.status;
  if(!res.ok){await res.body?.cancel();
   return{state:'http_error',http,geometry:'wms_raster_only',spatialIntersectionVerified:false};}
  const type=(res.headers.get('content-type')||'').toLowerCase();
  const bytes=await boundedBytes(res,24);
  const pngHeader=[137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82];
  const png=type.startsWith('image/png')&&bytes.length===24&&pngHeader.every((value,i)=>bytes[i]===value)&&
   new DataView(bytes.buffer).getUint32(16)===256&&new DataView(bytes.buffer).getUint32(20)===256;
  return{state:png?'png_received':'non_png_response',
   http,imageType:type.slice(0,50),
   geometry:'wms_raster_only',spatialIntersectionVerified:false,
   caveat:'100-year historical flood extent; PNG alone cannot confirm actual inundation or path intersection'};
 }catch(e){
  return{state:'request_or_format_failed',geometry:'wms_raster_only',
   reason:/^Safemap|Invalid flood/.test(e.message||'')?String(e.message).slice(0,95):
    'Service request not validated'};
 }
}
export async function checkRouteLayerFeasibility({kmaKey,safemapKey,fetcher=fetch}){
 const [warning,road,flood,floodLocal]=await Promise.all([
  probeKmaWarning(kmaKey,fetcher),
  probeKmaRoadRisk(kmaKey,fetcher),
  probeFloodWms(safemapKey,fetcher),
  probeFloodWms(safemapKey,fetcher,true)
 ]);
 const roadSchema=road.state==='provider_zip_parsed'
  ?await inspectRoadArchiveSchema(kmaKey,fetcher):{state:'not_checked'};
 return{checkedAt:new Date().toISOString(),previewOnly:true,
  warning,road,roadSchema,flood,floodLocal,
  constraints:{excludes:['humidity','wind_direction','general_temperature','cctv'],
   activeDangerRequires:['verified geometry','valid time','official severity',
    'route intersection','driver ETA'],
   neverInfer:['ice from low temperature','flood from WMS image alone',
    'alert polygon from region name alone','rainfall from radar colors']}};
}
