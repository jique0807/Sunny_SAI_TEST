// GK2A satellite L2 PNG receiver. Coordinates are never guessed from image pixels.
// An externally supplied legend/footnote raster is NOT automatically georeferenced.
const BASE='https://apihub.kma.go.kr/api/typ01/url/';
const PRODUCTS=Object.freeze({
 rr:Object.freeze([{data:'rr',area:'ko'}]),
 fog:Object.freeze([{data:'fog',area:'ko'}]),
 ci:Object.freeze([{data:'ci-ci1',area:'ela',map:'LC'},{data:'ci',area:'ela',map:'LC'}])
});
export const availableProducts=Object.freeze(Object.keys(PRODUCTS));
const cache=new Map();
const utcStamp=ms=>new Date(ms).toISOString().slice(0,16).replace(/[-:T]/g,'');
const timestampMs=stamp=>Date.parse(stamp.slice(0,4)+'-'+stamp.slice(4,6)+'-'+stamp.slice(6,8)+'T'+stamp.slice(8,10)+':'+stamp.slice(10,12)+':00Z');
export function parseSatelliteList(text,now=Date.now()){
 const times=[...String(text||'').matchAll(/(20\d{10})(?!\d)/g)].map(m=>m[1]);
 return [...new Set(times)].filter(t=>{const ms=timestampMs(t);return Number.isFinite(ms)&&ms<=now&&ms>now-48*3600000;}).sort().reverse();
}
export function pngDimensions(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<24)return null;
 if(![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')return null;
 const read=i=>((bytes[i]*16777216)+(bytes[i+1]<<16)+(bytes[i+2]<<8)+bytes[i+3])>>>0;
 const width=read(16),height=read(20);
 return width>0&&width<10000&&height>0&&height<10000?{width,height}:null;
}
export function satelliteGeorefState(area,image){
 // KO image from provider MUST be exactly the verified 900x900 raster.
 // Previously observed 900x922 downloads remain unaligned until footer/crop is verified.
 if(area==='ko'&&image?.width===900&&image?.height===900)return 'verified_ko_lcc_900';
 return 'unverified_raster_geometry';
}
async function remote(url,fetcher,accept='*/*'){
 return fetcher(url.toString(),{headers:{Accept:accept},cache:'no-store',
  signal:AbortSignal.timeout(12000)});
}
async function findLatest(key,fetcher,spec,now){
 for(let age=0;age<=1;age++){
  const day=utcStamp(now-age*86400000).slice(0,8);
  const url=new URL(BASE+'sat_file_data_list.php');
  for(const [k,v] of Object.entries({type:'img',lvl:'l2',data:spec.data,area:spec.area,tm:day,size:'n',authKey:key,...(spec.map?{map:spec.map}:{})}))
   url.searchParams.set(k,v);
  const r=await remote(url,fetcher,'text/plain,*/*');
  if(!r.ok)continue;
  const body=(await r.text()).slice(0,100000);
  const options=parseSatelliteList(body,now).filter(s=>s.startsWith(day));
  if(options.length)return options[0];
 }
 return null;
}
async function actualFrame(key,product,fetcher,now){
 for(const spec of PRODUCTS[product]){
  let time;
  try{time=await findLatest(key,fetcher,spec,now);}catch{continue;}
  if(!time)continue;
  const url=new URL(BASE+'sat_file_img_down.php');
  for(const [k,v]of Object.entries({lvl:'l2',data:spec.data,area:spec.area,tm:time,authKey:key,...(spec.map?{map:spec.map}:{})}))
   url.searchParams.set(k,v);
  try{
   const resp=await remote(url,fetcher,'image/png,application/octet-stream,*/*');
   if(!resp.ok)continue;
   const size=Number(resp.headers.get('content-length')||0);
   if(size>5_000_000)continue;
   const bytes=new Uint8Array(await resp.arrayBuffer());
   if(bytes.length>5_000_000)continue;
   const dims=pngDimensions(bytes);
   if(!dims)continue;
   return {status:'received',product,area:spec.area,element:spec.data,projection:spec.map||'LC',
    observationUTC:time,width:dims.width,height:dims.height,
    georeference:satelliteGeorefState(spec.area,dims),bytes};
  }catch{continue;}
 }
 return {status:'not_received',product,reason:'approved product/area listing or PNG unavailable'};
}
export async function getSatelliteFrame(key,product,{fetcher=fetch,now=Date.now()}={}){
 if(!PRODUCTS[product])return {status:'invalid',product:null};
 if(!key)return {status:'key_missing',product};
 const cacheKey=product+':'+String(fetcher===fetch);
 const hit=cache.get(cacheKey);
 if(hit?.until>now)return hit.value;
 const value=await actualFrame(key,product,fetcher,now);
 if(fetcher===fetch)cache.set(cacheKey,{until:now+(value.status==='received'?120000:45000),value});
 return value;
}
export function satellitePublicMeta(data){
 if(!data||data.status!=='received')return {status:data?.status||'unavailable',product:data?.product||null,
   reason:data?.reason||'No verified image'};
 const {bytes,...safe}=data;const mapped=safe.georeference==='verified_ko_lcc_900';
 return {...safe,projection:data.projection,rasterCropVerified:mapped,
  mapReady:mapped,riskInputReady:false,
  mappingBlocker:mapped?null:data.area==='ela'?'ela_projection_and_extent_unverified':
   data.width===900&&data.height===922?'raster_origin_and_22px_strip_unverified':'raster_geometry_unverified',
  requiredEvidence:mapped?['numeric product values and quality flags for risk input']:
   ['official raster extent and pixel origin','verified raster crop or geolocated numeric product']};
}
