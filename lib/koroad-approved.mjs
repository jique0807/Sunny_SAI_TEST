// TAAS approved WMS image / REST highway index preflight. Never equate historical clusters with live crashes.
const WMS='https://opendata.koroad.or.kr/data/wms/frequentzone/pedstrians';
const HIGHWAY='https://opendata.koroad.or.kr/data/rest/road/dgdgr/highway';
export const TAAS_FIXED_HIGHWAY=Object.freeze({road:'경부고속도로',section:'판교IC-신갈JC',vehicle:'01'});
function noKey(status,reason){return {status,reason,source:'한국도로교통공단 TAAS'};}
export function taasHighwayUrl(key){
 if(!key)throw Error('TAAS key missing');
 const url=new URL(HIGHWAY);
 Object.entries({authKey:key,frwyNm:TAAS_FIXED_HIGHWAY.road,frwySctnNm:TAAS_FIXED_HIGHWAY.section,
  vhctyCd:TAAS_FIXED_HIGHWAY.vehicle,type:'json',numOfRows:100,pageNo:1})
  .forEach(([k,v])=>url.searchParams.set(k,String(v)));
 return url;
}
export function taasPedestrianWmsUrl(key){
 if(!key)throw Error('TAAS key missing');
 const url=new URL(WMS);
 Object.entries({authKey:key,layers:'frepedstrians',format:'image/png',transparent:'TRUE',
  service:'WMS',version:'1.1.1',request:'GetMap',srs:'EPSG:4326',
  bbox:'126.940,37.535,127.025,37.580',width:512,height:469,
  searchYearCd:'2024',siDo:'11',guGun:'140'})
  .forEach(([k,v])=>url.searchParams.set(k,String(v)));
 return url;
}
const inKorea=(lng,lat)=>lng>=123&&lng<=133&&lat>=32&&lat<=40;
export function parseHighwayRisk(raw){
 const resultCode=String(raw?.resultCode??'');
 if(resultCode==='03')return {status:'empty',count:0,source:'한국도로교통공단 TAAS'};
 if(resultCode!=='00')return noKey('failed','고속도로 위험지수 REST 인증 또는 기관 응답 확인 필요');
 const src=raw?.items?.item;
 const rows=Array.isArray(src)?src:src?[src]:[];
 const grades={};
 let kept=0;
 for(const row of rows.slice(0,100)){
  const grade=String(row?.anals_grd??'').padStart(2,'0');
  const index=Number(row?.anals_value);
  if(!/^(01|02|03|04)$/.test(grade)||!Number.isFinite(index)||index<0||index>10000)continue;
  const pair=[...String(row.line_string??'').matchAll(/(1[2-3]\\d(?:\\.\\d+)?)\\s+([3-4]\\d(?:\\.\\d+)?)/g)];
  if(pair.length<2||!pair.every(m=>inKorea(Number(m[1]),Number(m[2]))))continue;
  kept++;grades[grade]=(grades[grade]||0)+1;
 }
 return {status:kept?'received':rows.length?'failed':'empty',count:kept,grades,
  road:TAAS_FIXED_HIGHWAY.road,section:TAAS_FIXED_HIGHWAY.section,vehicleCode:'01',
  source:'한국도로교통공단 TAAS',routeMatched:false,
  caution:'고정 구간 검증자료입니다. 경로 일치·등급 해석 검증 전에는 자동 위험점수나 우회근거로 사용하지 않습니다.'};
}
export async function probeTaasHighway(key,fetcher=fetch){
 if(!key)return noKey('missing','KOROAD_API_KEY 미설정');
 try{
  const response=await fetcher(taasHighwayUrl(key).toString(),{headers:{Accept:'application/json'},
   signal:AbortSignal.timeout(12000)});
  if(!response.ok)return noKey('failed',response.status===401||response.status===403?
   'TAAS REST API 승인 확인 필요':'TAAS 고속도로 REST 응답 실패');
  return parseHighwayRisk(await response.json());
 }catch{return noKey('failed','TAAS 고속도로 REST 기관 연결 또는 응답 형식 확인 필요');}
}
export async function probeTaasPedestrianWms(key,fetcher=fetch){
 if(!key)return noKey('missing','KOROAD_API_KEY 미설정');
 try{
  const response=await fetcher(taasPedestrianWmsUrl(key).toString(),{headers:{Accept:'image/png'},
   signal:AbortSignal.timeout(12000)});
  if(!response.ok)return noKey('failed',response.status===401||response.status===403?
   'TAAS 보행자 WMS 승인 확인 필요':'TAAS 보행자 WMS 응답 실패');
  if(!String(response.headers.get('content-type')||'').toLowerCase().includes('image/png'))
   return noKey('failed','TAAS WMS PNG 아닌 응답 · 인증 및 요청변수 확인 필요');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length<8||bytes.length>2500000||![137,80,78,71,13,10,26,10].every((c,i)=>bytes[i]===c))
   return noKey('failed','TAAS WMS 이미지 형식 불일치');
  return {status:'received',imageFormat:'png',source:'한국도로교통공단 TAAS',
   region:'서울특별시 중구',year:'2024',bytes:bytes.length,renderedToMap:false,
   caution:'PNG 수신 확인만 수행 · 지도 위 위치별 사고건수나 실시간 위험은 판정하지 않습니다.'};
 }catch{return noKey('failed','TAAS 보행자 WMS 기관 연결 또는 응답 확인 필요');}
}
