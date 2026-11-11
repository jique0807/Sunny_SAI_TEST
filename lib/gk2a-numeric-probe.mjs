// Fixed official-provider checks; never accept URLs or publish authentication material.
import {parseSatelliteList} from './gk2a-satellite.mjs';
import {RR_PACKING} from '../public/gk2a-rr-values.mjs';
const BASE='https://apihub.kma.go.kr/api/typ01/url/';
const fields=['dataLevel','dataType','areaFD','areaEA','areaELA','areaKO','apiNC','apiNc','apiImage','parameterNc','parameterImg','dataDescription'];
async function read(key,file,params,fetcher){
 const url=new URL(file,BASE);url.search=new URLSearchParams({...params,authKey:key});
 try{
  const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!r.ok){await r.body?.cancel();return {status:'http_error',http:r.status};}
  const bytes=new Uint8Array(await r.arrayBuffer());
  if(bytes.length>2000000)return {status:'oversized'};
  return {status:'received',text:new TextDecoder().decode(bytes)};
 }catch{return {status:'request_failed'};}
}
export async function probeSatelliteCatalog(key,{fetcher=fetch}={}){
 if(!key)return {status:'key_missing'};
 const result=await read(key,'sat_meta_list.php',{disp:'1'},fetcher);
 if(!result.text)return result;
 let body;try{body=JSON.parse(result.text);}catch{return {status:'invalid_catalog',http:200};}
 const rows=[];
 function walk(x){
  if(!x||typeof x!=='object')return;
  if(!Array.isArray(x)&&Object.keys(x).some(k=>k.toLowerCase()==='datatype'))rows.push(x);
  else for(const v of Object.values(x))walk(v);
 }
 walk(body);
 const products=rows.filter(row=>/^(rr|ci|fog)(?:[-_]|$)/i.test(String(row.dataType||row.datatype||''))||/^(rr|ci|fog|ci-deep)$|^road-fog/.test(String(row.parameterNc||''))).map(row=>Object.fromEntries(fields.filter(k=>Object.hasOwn(row,k)).map(k=>[k,String(row[k]).split(key).join('[redacted]').slice(0,900)])));
 return {status:products.length?'received':'no_matching_products',catalogRows:rows.length,products};
}
export async function probeSatelliteNumeric(key,product,{fetcher=fetch,now=Date.now()}={}){
 // Actual 2026-11-11 RR NC is in ELA even though the catalog advertises KO/EA.
 const specs={rr:{data:'rr',area:'ela',map:'LC'},fog:{data:'fog',area:'ko'},ci:{data:'ci',area:'ela',map:'LC'},ciDeep:{data:'ci-deep',area:'ko'}};
 if(!key)return {status:'key_missing'};const spec=specs[product];if(!spec)return {status:'invalid'};
 const day=new Date(now).toISOString().slice(0,10).replaceAll('-','');
 const list=await read(key,'sat_file_data_list.php',{...spec,type:'nc',lvl:'l2',tm:day},fetcher);
 if(!list.text)return {product,list};
 const times=parseSatelliteList(list.text,now);
 const time=times[0];if(!time)return {product,status:'no_files',listCharacters:list.text.length};
 const params={...spec,lvl:'l2',tm:time};
 const variable=product==='fog'?'FOG':product==='ci'?'CI1_prob':product==='rr'?'RR':null;
 const grid=await read(key,'sat_file_data_view.php',{...params,ix:'1,3',iy:'1,3',...(variable?{var:variable}:{})},fetcher);
 const url=new URL('sat_file_nc_down.php',BASE);url.search=new URLSearchParams({...params,authKey:key});
 let nc;
 try{
  const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(25000)});
  if(!r.ok){await r.body?.cancel();nc={status:'http_error',http:r.status};}
  else{
   const reader=r.body.getReader();let size=0,first=new Uint8Array();let tooLarge=false;
   while(true){const {done,value}=await reader.read();if(done)break;if(!first.length)first=value.slice(0,32);size+=value.length;if(size>20000000){tooLarge=true;await reader.cancel();break;}}
   const hdf=[137,72,68,70,13,10,26,10].every((v,i)=>first[i]===v),cdf=first[0]===67&&first[1]===68&&first[2]===70;
   nc={status:tooLarge?'size_limit':hdf||cdf?'received':'not_netcdf',bytes:size,format:hdf?'HDF5/NetCDF4':cdf?'NetCDF':'unknown'};
  }
 }catch{nc={status:'request_failed'};}
 return {product,request:params,listedTimes:times.length,nc,grid:grid.text?{
  ...parseSatelliteGrid(grid.text),
  ...(product==='rr'?{packing:RR_PACKING,valuesAre:'packed_nc_values'}:{}),
  ...(!/#\s*ERROR/i.test(grid.text)?{text:grid.text.split(key).join('[redacted]').slice(0,14000)}:{reason:'Official grid service returned an error; no numeric evidence accepted'})}:grid};
}
export function parseSatelliteGrid(text){
 if(/#\s*ERROR/i.test(text))return {status:'provider_error'};
 if(/출력할 변수를 선택/.test(text))return {status:'variable_list_received'};
 const match=String(text).match(/^\s*(\d+)\s*,\s*(\d+)\s*,=\s*\n([\s\S]*)$/);
 if(!match)return {status:'unrecognized_response'};
 const width=Number(match[1]),height=Number(match[2]);
 const values=match[3].trim().split(/\s+/).map(Number);
 if(!width||!height||width*height>100||values.length!==width*height||values.some(x=>!Number.isFinite(x)))return {status:'invalid_grid'};
 return {status:'numeric_grid_received',width,height,values};
}
