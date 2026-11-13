import warningAreas from '../public/data/kma-warning-areas.json' with {type:'json'};
const boundaryByCode=new Map(warningAreas.features.map(f=>[f.properties.code,f.geometry]));
export function attachWarningAreas(warnings){return warnings.map(w=>({...w,
 geometry:boundaryByCode.get(w.code)||null,
 geometryStatus:boundaryByCode.has(w.code)?'official_crs84_polygon':'boundary_unavailable',
 boundarySource:warningAreas.sourceUrl,boundaryVersion:warningAreas.sourceName}));}
const base='https://apihub.kma.go.kr/api/typ01/url/';
const types={W:['강풍','💨'],R:['호우','🌧️'],C:['한파','🥶'],D:['건조','🏜️'],
 O:['폭풍해일','🌊'],N:['지진해일','🌊'],V:['풍랑','🌊'],T:['태풍','🌀'],
 S:['대설','❄️'],Y:['황사','🌫️'],H:['폭염','🌡️'],F:['안개','🌫️']};
const rows=text=>text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
const fields=line=>line.includes(',')?line.split(',').map(v=>v.trim()):line.split(/\s+/);
const stamp=value=>{
 if(!/^\d{12}$/.test(value))return NaN;
 return Date.parse(value.replace(/^(....)(..)(..)(..)(..)$/,'$1-$2-$3T$4:$5:00+09:00'));
};
export function parseWarnings(text,now){
 const lines=rows(text);
 const header=lines.find(line=>/\bREG_ID\b/.test(line)&&/\bTM_EF\b/.test(line)&&/\bCMD\b/.test(line));
 if(!header)throw Error('기상특보 응답 형식 확인 필요');
 const keys=fields(header.replace(/^#\s*/,''));
 const latest=new Map();
 for(const line of lines){
  if(line===header||/^[#@]/.test(line))continue;
  const values=fields(line);
  const get=key=>values[keys.indexOf(key)];
  const code=get('REG_ID'),type=get('WRN'),level=Number(get('LVL')),cmd=Number(get('CMD'));
  const issued=stamp(get('TM_FC')),effective=stamp(get('TM_EF'));
  if(!/^[A-Z]\d{7}$/.test(code)||!Object.hasOwn(types,type)||
   !Number.isFinite(issued)||!Number.isFinite(effective)||issued>now||effective>now)continue;
  const id=code+type,old=latest.get(id);
  if(old&&(old.effective>effective||old.effective===effective&&old.issued>issued))continue;
  latest.set(id,{code,type,level,cmd,issued,effective,label:get('REG_KO')||code});
 }
 return [...latest.values()].filter(x=>[2,3].includes(x.level)&&[1,2,5,6].includes(x.cmd))
  .map(x=>({code:x.code,label:x.label,type:x.type,icon:types[x.type][1],
   title:types[x.type][0]+(x.level===3?'경보':'주의보'),validTime:new Date(x.effective).toISOString()}));
}
export function warningStations(text){
 const lines=rows(text);
 const header=lines.find(line=>/\bWRN_ID\b/.test(line)&&/\bLAT\b/.test(line)&&/\bLON\b/.test(line));
 if(!header)throw Error('특보구역 관측지점 응답 형식 확인 필요');
 const keys=fields(header.replace(/^#\s*/,''));
 return lines.filter(line=>line!==header&&!/^[#@]/.test(line)).flatMap(line=>{
  const v=fields(line),code=v[keys.indexOf('WRN_ID')],lat=Number(v[keys.indexOf('LAT')]),lng=Number(v[keys.indexOf('LON')]);
  return /^L\d{7}$/.test(code)&&lat>=32&&lat<=40&&lng>=123&&lng<=133?[{code,lat,lng}]:[];
 });
}
const cache=new WeakMap();
export async function getActiveWarnings(key,fetcher=fetch){
 const now=Date.now(),hit=cache.get(fetcher);
 if(hit?.key===key&&hit.until>now)return hit.promise;
 const read=async (file,params)=>{
  const url=new URL(file,base);
  url.search=new URLSearchParams({...params,help:'1',authKey:key});
  let response;
  try{response=await fetcher(url.toString(),{redirect:'error',signal:AbortSignal.timeout(10000)});}
  catch{throw Object.assign(Error('기상청 특보 서비스 연결 실패'),{reception:'disconnected'});}
  if(!response.ok)throw Error('기상청 API 응답 HTTP '+response.status+' · 활용승인 확인');
  const body=await response.text();
  if(body.length>1000000)throw Error('기상청 응답 크기 초과');
  return body;
 };
 const promise=(async()=>{
  const warnings=parseWarnings(await read('wrn_now_data.php',{fe:'e',tm:'',disp:'0'}),now);
  let stations=[],stationError=false;
  if(warnings.some(w=>w.code.startsWith('L'))){
   try{stations=warningStations(await read('wrn_reg_aws.php',{disp:'0'}));}
   catch{stationError=true;}
  }
  return {warnings:attachWarningAreas(warnings.map(w=>({...w,points:stations.filter(p=>p.code===w.code).slice(0,50)}))),
   stationError,fetchedAt:new Date(now).toISOString()};
 })();
 cache.set(fetcher,{key,until:now+60000,promise});
 try{return await promise;}catch(error){
  if(cache.get(fetcher)?.promise===promise)cache.delete(fetcher);
  throw error;
 }
}
