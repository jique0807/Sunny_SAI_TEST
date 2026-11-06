// Safely fetch an official KMA background-free HSR image and its LCC coverage.
import {transparentRadarRequest} from './kma-radar-transparent-probe.mjs';
export const RADAR_TEST_CASE='202407100900'; // Historic weather event, NOT live data.
const ERR=(code,message)=>Object.assign(Error(message),{status:code});
const metadataCache=new Map(),imageCache=new Map();
export function radarObservationTime(mode='latest',now=Date.now()){
 if(mode==='case')return RADAR_TEST_CASE;
 if(mode!=='latest')throw ERR(400,'Unsupported radar time mode');
 const local=new Date(now+9*3600000-30*60000);
 return local.toISOString().slice(0,16).replace(/[-:T]/g,'').slice(0,11)+'0';
}
function findKey(root,key){
 const stack=[root],seen=new Set();
 while(stack.length){
  const obj=stack.pop();if(!obj||typeof obj!=='object'||seen.has(obj))continue;seen.add(obj);
  if(Object.hasOwn(obj,key))return obj[key];
  for(const x of Object.values(obj))if(x&&typeof x==='object')stack.push(x);
 }
 return undefined;
}
export function verifyRadarImageMetadata(source,requested){
 if(!source||typeof source!=='object')throw ERR(502,'No KMA radar metadata');
 const path=findKey(source,'url');
 if(typeof path!=='string'||!/^\/data\/BUFD\/RDR\/IMG\/[A-Za-z0-9_.-]+\.png$/.test(path))
  throw ERR(502,'Untrusted radar image location');
 if(!path.includes('_'+requested+'_'))throw ERR(502,'KMA returned a different observation time');
 const names=['imageCoverageStartProjX','imageCoverageStartProjY',
  'imageCoverageEndProjX','imageCoverageEndProjY'];
 const v=names.map(k=>Number(findKey(source,k)));
 if(v.some(x=>!Number.isFinite(x)))throw ERR(502,'Radar LCC image coverage unavailable');
 const [left,top,right,bottom]=v;
 if(right<=left||top<=bottom||right-left<1000||top-bottom<1000||
    Math.max(...v.map(Math.abs))>10000000)
  throw ERR(502,'KMA projection bounds outside expected domain');
 return {product:'KMA HSR',timeKst:requested,projection:'LCC',
  coverage:{left,top,right,bottom},providerBasemap:false,
  precision:'Projection parameters and live Kakao alignment still need validation',
  _sourcePath:path};
}
export async function getRadarImageMetadata(key,mode='case',fetcher=fetch,now=Date.now()){
 if(!key)throw ERR(503,'KMA API key missing');
 const tm=radarObservationTime(mode,now),fingerprint=mode+':'+tm;
 const hit=metadataCache.get(fingerprint);if(hit?.until>now)return hit.metadata;
 const url=transparentRadarRequest(key,tm);
 let response;
 try{response=await fetcher(url.toString(),{redirect:'error',signal:AbortSignal.timeout(15000)});}
 catch{throw ERR(502,'KMA radar metadata request failed');}
 if(!response.ok)throw ERR(502,'KMA radar metadata unavailable');
 let doc;
 try{
  const body=await response.text();
  if(body.length>16000)throw Error('Oversize metadata');
  doc=JSON.parse(body);
 }catch{throw ERR(502,'KMA metadata was not JSON');}
 const metadata=verifyRadarImageMetadata(doc,tm);
 if(metadataCache.size>16)metadataCache.delete(metadataCache.keys().next().value);
 metadataCache.set(fingerprint,{metadata,until:now+(mode==='case'?24*3600000:120000)});
 return metadata;
}
export function visibleRadarMetadata(metadata){
 const {_sourcePath,...publicInfo}=metadata;return publicInfo;
}
function pngSize(bytes){
 if(bytes.length<33||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71||
    bytes[12]!==73||bytes[13]!==72||bytes[14]!==68||bytes[15]!==82)
  throw ERR(502,'No valid KMA radar PNG');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const width=v.getUint32(16,false),height=v.getUint32(20,false);
 if(!width||!height||width>5000||height>5000)throw ERR(502,'Radar PNG dimensions invalid');
 const colorType=bytes[25];
 if(![3,4,6].includes(colorType))throw ERR(502,'KMA radar image transparency not confirmed');
 return {width,height,colorType};
}
export async function getRadarImage(key,mode='case',fetcher=fetch,now=Date.now()){
 const metadata=await getRadarImageMetadata(key,mode,fetcher,now);
 const id=metadata._sourcePath,hit=imageCache.get(id);
 if(hit?.until>now)return {...hit.image,metadata};
 const url='https://apihub.kma.go.kr'+id;
 let response;
 try{response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(18000),
   headers:{Accept:'image/png'}});}
 catch{throw ERR(502,'Radar PNG request failed');}
 if(!response.ok||!response.body)throw ERR(502,'Radar PNG unavailable');
 const declared=Number(response.headers.get('content-length')||0);
 const MAX=4*1024*1024;
 if(declared>MAX)throw ERR(502,'Radar PNG too large');
 const reader=response.body.getReader(),parts=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;if(!value)continue;
   size+=value.byteLength;if(size>MAX){await reader.cancel();throw ERR(502,'Radar PNG too large');}
   parts.push(value);
  }
 }finally{try{reader.releaseLock();}catch{}}
 const bytes=new Uint8Array(size);let at=0;for(const value of parts){bytes.set(value,at);at+=value.length;}
 const dimensions=pngSize(bytes),image={bytes,...dimensions};
 imageCache.set(id,{image,until:now+(mode==='case'?24*3600000:120000)});
 if(imageCache.size>12)imageCache.delete(imageCache.keys().next().value);
 return {...image,metadata};
}
