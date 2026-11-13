// Fixed RR access matrix for provider diagnostics. No arbitrary URLs or exposed keys.
const BASE='https://apihub.kma.go.kr/api/typ01/url/';
const stamp=ms=>new Date(ms).toISOString().slice(0,16).replace(/[-:T]/g,'');
const specs={ko:{area:'ko'},koLC:{area:'ko',map:'LC'},ea:{area:'ea'},eaLC:{area:'ea',map:'LC'},eaGE:{area:'ea',map:'GE'},elaLC:{area:'ela',map:'LC'}};
async function request(key,file,params,{fetcher=fetch,binary=false,download=false}={}){
 const url=new URL(file,BASE);url.search=new URLSearchParams({...params,authKey:key});
 try{
  const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(18000)});
  if(!r.ok){await r.body?.cancel();return {status:'http_error',http:r.status};}
  const limit=binary?20000000:2000000,reader=r.body.getReader(),chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();return {status:'size_limit'};}chunks.push(value);}
  const b=Buffer.concat(chunks);
  if(binary){const hdf=b.subarray(0,8).equals(Buffer.from([137,72,68,70,13,10,26,10])),cdf=b.subarray(0,3).toString()==='CDF';
   const text=(!hdf&&!cdf)?b.toString('utf8'):'';
   return {status:hdf||cdf?'received':/파일|file|not found/i.test(text)?'file_missing':'not_netcdf',bytes:size,
    format:hdf?'HDF5/NetCDF4':cdf?'NetCDF':'unknown',...(download&&(hdf||cdf)&&size<=1500000?{base64:b.toString('base64')}:{})};}
  return {status:'received',text:b.toString('utf8')};
 }catch{return {status:'request_failed'};}
}
function times(text,now){return [...new Set([...String(text||'').matchAll(/(20\d{10})(?!\d)/g)].map(m=>m[1]))].filter(t=>t<=stamp(now)).sort().reverse();}
export async function probeRrAccess(key,mode,{fetcher=fetch,now=Date.now(),download=false}={}){
 if(!key)return {status:'key_missing'};
 const day=stamp(now).slice(0,8);
 if(mode==='catalog'){
  const r=await request(key,'sat_meta_list.php',{disp:'1'},{fetcher});if(!r.text)return r;
  let x;try{x=JSON.parse(r.text);}catch{return {status:'invalid_catalog'};}
  const rows=[];function walk(v){if(!v||typeof v!=='object')return;if(v.parameterNc==='rr')rows.push(v);else for(const c of Object.values(v))walk(c);}walk(x);
  const fields=['dataLevel','dataType','apiNc','parameterNc','areaFD','areaEA','areaELA','areaKO','productionCycleFD','productionCycleEA','productionCycleELA','productionCycleKO','startDate','endDate'];
  return {status:'received',products:rows.map(r=>Object.fromEntries(fields.filter(k=>k in r).map(k=>[k,String(r[k]).split(key).join('[redacted]')])))};
 }
 if(mode==='lists')return {checkedAt:new Date(now).toISOString(),results:await Promise.all(Object.entries(specs).map(async([name,spec])=>{
  const r=await request(key,'sat_file_data_list.php',{...spec,lvl:'l2',data:'rr',type:'nc',tm:day},{fetcher});
  if(!r.text)return {name,...r};const found=times(r.text,now);
  return {name,...spec,status:found.length?'files_listed':/#\s*ERROR/i.test(r.text)?'provider_error':'empty',count:found.length,latest:found[0]||null};
 }))};
 const spec=specs[mode];if(!spec)return {status:'invalid_mode'};
 const listing=await request(key,'sat_file_data_list.php',{...spec,lvl:'l2',data:'rr',type:'nc',tm:day},{fetcher});
 let candidates=times(listing.text,now),timeSource='nc-list';
 if(!candidates.length){
  const images=await request(key,'sat_file_data_list.php',{...spec,lvl:'l2',data:'rr',type:'img',tm:day},{fetcher});
  candidates=times(images.text,now);timeSource='image-list';
 }
 if(!candidates.length)return {status:'no_file_times',listStatus:listing.status};
 const raw=candidates[0],utc=Date.parse(raw.replace(/^(....)(..)(..)(..)(..)$/,'$1-$2-$3T$4:$5:00Z'));
 const tries=[...new Set([raw,stamp(Math.floor(utc/600000)*600000),stamp(Math.floor(utc/600000)*600000-600000)])];
 const results=[];
 for(const tm of tries){
  const p={...spec,lvl:'l2',data:'rr',tm};
  const nc=await request(key,'sat_file_nc_down.php',p,{fetcher,binary:true,download});
  results.push({tm,nc});if(nc.status==='received'){
   const grid=await request(key,'sat_file_data_view.php',{...p,ix:'1,3',iy:'1,3',var:'RR'},{fetcher});
   return {status:'received',...spec,timeSource,results,grid:grid.text?{status:/#\s*ERROR/i.test(grid.text)?'provider_error':'response_received',text:/#\s*ERROR/i.test(grid.text)?undefined:grid.text.split(key).join('[redacted]').slice(0,2000)}:grid};
  }
 }
 return {status:'not_received',...spec,results};
}
