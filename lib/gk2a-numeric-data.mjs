import {parseSatelliteList} from './gk2a-satellite.mjs';
import {decodeSatelliteNc} from './gk2a-nc.mjs';
import {ciPixelToLatLng,ciLatLngToPixel} from '../public/gk2a-ci-navigation.mjs';
import {koLccPixelToLatLng,koLccLatLngToPixel} from '../public/gk2a-georef.mjs';
import {decodePackedRr} from '../public/gk2a-rr-values.mjs';
import {decodeCiCategory} from '../public/gk2a-ci-navigation.mjs';
const SPECS={rr:{area:'ela',map:'LC'},ci:{area:'ela',map:'LC'},fog:{area:'ko'}};
const BASE='https://apihub.kma.go.kr/api/typ01/url/';
export const SATELLITE_MAX_AGE={rr:20*60000,ci:20*60000,fog:60*60000};
const cache=new Map(),pending=new Map();
export function observationMillis(t){return /^\d{12}$/.test(t||'')?Date.parse(t.replace(/^(....)(..)(..)(..)(..)$/,'$1-$2-$3T$4:$5:00Z')):NaN;}
async function bounded(response,max){
 if(!response.ok)throw Error('provider_http_'+response.status);
 const chunks=[];let n=0;const reader=response.body.getReader();
 while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>max){await reader.cancel();throw Error('size_limit');}chunks.push(value);}
 return Buffer.concat(chunks);
}
export async function loadSatelliteNumeric(key,product,{fetcher=fetch,now=Date.now()}={}){
 if(!key||!SPECS[product])return {status:'excluded',product,reason:key?'invalid_product':'key_missing'};
 const id=product; // Cache is used only for the server's configured key/default fetch.
 if(fetcher===fetch&&cache.get(id)?.until>now)return cache.get(id).value;
 if(fetcher===fetch&&pending.has(id))return pending.get(id);
 const run=(async()=>{try{
  let time;
  for(const age of [0,86400000]){
   const day=new Date(now-age).toISOString().slice(0,10).replaceAll('-','');
   const url=new URL('sat_file_data_list.php',BASE);url.search=new URLSearchParams({type:'nc',lvl:'l2',data:product,...SPECS[product],tm:day,authKey:key});
   const text=(await bounded(await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(12000)}),1000000)).toString();
   time=parseSatelliteList(text,now)[0];if(time)break;
  }
  if(!time)throw Error('no_files');
  const age=now-observationMillis(time);if(age<0||age>SATELLITE_MAX_AGE[product])throw Error('stale_observation');
  const url=new URL('sat_file_nc_down.php',BASE);url.search=new URLSearchParams({lvl:'l2',data:product,...SPECS[product],tm:time,authKey:key});
  const bytes=await bounded(await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(18000)}),5000000);
  if(!bytes.subarray(0,8).equals(Buffer.from([137,72,68,70,13,10,26,10])))throw Error('not_netcdf');
  const frame=await decodeSatelliteNc(bytes,product,time);
  return {status:'received',...frame};
 }catch{return {status:'excluded',product,reason:'reception_or_validation_failed'};}})();
 if(fetcher===fetch)pending.set(id,run);
 const result=await run;
 if(fetcher===fetch){pending.delete(id);cache.set(id,{until:now+(result.status==='received'?120000:30000),value:result});}
 return result;
}
export function satelliteValue(frame,column,row){
 if(!frame?.metadataVerified||column<0||row<0||column>=frame.width||row>=frame.height)return null;
 const i=row*frame.width+column,raw=frame.values[i],q=frame.quality[i];
 if(frame.product==='rr'){
  const d=decodePackedRr(raw,q);return d.status==='estimate'?d.rainMmPerHour:null;
 }
 if(frame.product==='ci')return decodeCiCategory(raw,q).status==='usable'?raw:null;
 return q===0&&Number.isInteger(raw)&&raw>=1&&raw<=7?raw:null;
}
export function nativeGeo(frame,column,row){return frame.navigation==='ela-nmsc-geos'?ciPixelToLatLng(column,row):koLccPixelToLatLng(column+.5,row+.5);}
export function satelliteMapCells(frame,bounds,{now=Date.now(),limit=8000}={}){
 const age=now-observationMillis(frame.observationUTC);
 if(frame.status!=='received'||!frame.metadataVerified||!Number.isFinite(age)||age<0||age>SATELLITE_MAX_AGE[frame.product])return {status:'excluded',product:frame.product,reason:'unavailable_or_stale',cells:[]};
 const pixels=[];
 for(let row=0;row<frame.height;row++)for(let column=0;column<frame.width;column++){
  const value=satelliteValue(frame,column,row);
  if(value===null||(frame.product==='rr'?value<.1:frame.product==='ci'?value<1:![4,5].includes(value)))continue;
  const geo=nativeGeo(frame,column,row);
  if(!geo||geo.lat<bounds.south||geo.lat>bounds.north||geo.lng<bounds.west||geo.lng>bounds.east)continue;
  pixels.push({column,row,value});
 }
 // Preserve the whole viewport. A wide view summarizes each native block by its
 // maximum; route evaluation below always reads the original, unaggregated pixel.
 let stride=1,blocks;
 do{
  blocks=new Map();
  for(const p of pixels){const column=Math.floor(p.column/stride)*stride,row=Math.floor(p.row/stride)*stride,key=row+':'+column;
   if(!blocks.has(key)||blocks.get(key).value<p.value)blocks.set(key,{column,row,value:p.value});}
  if(blocks.size<=limit)break;stride++;
 }while(stride<Math.max(frame.width,frame.height));
 const cells=[];
 for(const {column,row,value}of blocks.values()){
  const right=Math.min(frame.width,column+stride)-.5,bottom=Math.min(frame.height,row+stride)-.5;
  const corners=[[column-.5,row-.5],[right,row-.5],[right,bottom],[column-.5,bottom]].map(([x,y])=>nativeGeo(frame,x,y));
  if(corners.some(p=>!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)))continue;
  cells.push({column,row,value,corners});
 }
 return {status:'received',product:frame.product,observationUTC:frame.observationUTC,navigation:frame.navigation,
  metadataVerified:true,cells,total:pixels.length,displayStride:stride,truncated:false,source:frame.source};
}
export function satelliteRouteValues(frame,points,{now=Date.now()}={}){
 const age=now-observationMillis(frame.observationUTC);
 if(frame.status!=='received'||!frame.metadataVerified||!Number.isFinite(age)||age<0||age>SATELLITE_MAX_AGE[frame.product])return [];
 return points.flatMap(p=>{
  let pixel;
  if(frame.navigation==='ela-nmsc-geos')pixel=ciLatLngToPixel(p.lat,p.lng);
  else pixel=koLccLatLngToPixel(p.lat,p.lng);
  if(!pixel)return [];
  const column=Math.round(pixel.column),row=Math.round(pixel.row),value=satelliteValue(frame,column,row);
  if(value===null)return [];
  return [{...p,product:frame.product,value,qualityVerified:true,navigationVerified:true,
   observationUTC:frame.observationUTC,column,row}];
 });
}
