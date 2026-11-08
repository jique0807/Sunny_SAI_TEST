// Preview-only Safemap 400 diagnostics. All requests use the existing server key.
// No raw provider response, credential, token, or guessed flood polygons are returned.
const ROOT='https://www.safemap.go.kr/openapi2/IF_0089_WMS';
const EXAMPLE_BBOX='126.84814453125,35.137879119634185,126.859130859375,35.146862906756304';
const OS_BBOX='127.30,36.60,127.36,36.68';
function make(key,variant){
 const url=new URL(ROOT);
 const common={serviceKey:key,srs:variant==='legacy_3857_full'?'EPSG:3857':'EPSG:4326',
  bbox:variant==='osong_4326_minimal'?OS_BBOX:variant==='legacy_3857_full'?
  '14126000,4510000,14128000,4512000':EXAMPLE_BBOX,
  format:'image/png',width:'256',height:'256',transparent:'TRUE'};
 for(const [k,v]of Object.entries(common))url.searchParams.set(k,v);
 if(['doc_4326_wms','legacy_3857_full'].includes(variant)){
  for(const [k,v]of Object.entries({
   service:'WMS',request:'GetMap',version:'1.1.1',
   layers:'A2SM_FLOODFOVRRISK1',styles:''}))url.searchParams.set(k,v);
 }
 return url;
}
async function peek(res,max=2048){
 const stream=res.body;if(!stream)return new Uint8Array();
 const reader=stream.getReader(),chunks=[];let size=0;
 try{
  while(size<max){
   const {done,value}=await reader.read();if(done)break;
   if(!value)continue;
   const b=value.subarray(0,Math.min(max-size,value.byteLength));
   chunks.push(b);size+=b.byteLength;
  }
 }finally{try{await reader.cancel();}catch{}}
 const bytes=new Uint8Array(size);let o=0;for(const c of chunks){bytes.set(c,o);o+=c.length;}
 return bytes;
}
function summarize(res,bytes){
 const type=(res.headers.get('content-type')||'').split(';')[0].slice(0,65);
 const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
 let reason='unknown';
 if(!png){
  const content=new TextDecoder().decode(bytes);
  const classes=[
   ['permission',/denied|forbidden|permission|unauthorized|접근.?거부|권한|승인|허용되지|not allowed/i],
   ['invalid_key',/invalid.?key|servicekey|인증키|키.?오류/i],
   ['invalid_parameters',/invalid.?request|invalid.?parameter|bbox|param|좌표|요청.?오류|잘못된.?요청/i],
   ['layer_missing',/layer|레이어|존재하지/i],
   ['server_error',/exception|internal.?error|오류.?발생|service unavailable/i]];
  reason=classes.find(([,test])=>test.test(content))?.[0]||'unclassified';
 }
 return{http:res.status,type,kind:png?'valid_png_header':'non_png',
  errorClass:png?null:reason};
}

const GEOSERVER='https://www.safemap.go.kr/geoserver_pos/safemap/wms';
function geoserverRequest(key,variant){
 const u=new URL(GEOSERVER);
 u.searchParams.set('SERVICE','WMS');
 u.searchParams.set('VERSION','1.1.1');
 u.searchParams.set('REQUEST',variant==='geoserver_capabilities'||variant==='geoserver_capabilities_key'?'GetCapabilities':'GetMap');
 if(variant==='geoserver_capabilities_key')u.searchParams.set('serviceKey',key);
 if(variant!=='geoserver_capabilities'&&variant!=='geoserver_capabilities_key'){
  const layer=variant==='geoserver_map_namespaced'?'safemap:A2SM_FLOODFOVRRISK1':'A2SM_FLOODFOVRRISK1';
  for(const [k,v]of Object.entries({
   LAYERS:layer,STYLES:'',SRS:'EPSG:4326',BBOX:EXAMPLE_BBOX,
   FORMAT:'image/png',WIDTH:'256',HEIGHT:'256',TRANSPARENT:'TRUE'
  }))u.searchParams.set(k,v);
  if(variant==='geoserver_map_key')u.searchParams.set('serviceKey',key);
 }
 return u;
}

export async function checkFloodWmsVariants(key,fetcher=fetch){
 if(!key)return{configured:false,results:[]};
 const variants=['doc_4326_minimal','doc_4326_wms','legacy_3857_full','osong_4326_minimal',
  'geoserver_capabilities','geoserver_capabilities_key','geoserver_map','geoserver_map_namespaced','geoserver_map_key'];
 const results=await Promise.all(variants.map(async variant=>{
  const url=variant.startsWith('geoserver_')?geoserverRequest(key,variant):make(key,variant);
  try{
   const res=await fetcher(url.toString(),{
    redirect:'error',signal:AbortSignal.timeout(10500),
    headers:{Accept:'image/png,application/xml,text/xml,*/*'}});
   const head=await peek(res);
   return{variant,...summarize(res,head)};
  }catch{return{variant,http:null,kind:'request_failed',errorClass:'network_or_timeout'};}
 }));
 return{configured:true,product:'Safemap national river flood 100-year WMS',
  provider:'Safemap',checkedAt:new Date().toISOString(),
  allTestsUsePrivateServerKey:true,results,
  caveat:'HTTP 200 and PNG still do not establish geospatial accuracy, road flood, or approval for redistribution'};
}
