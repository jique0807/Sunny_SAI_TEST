// Approved Korean Road Traffic Authority WMS map layers, server-only credential use.
// PNG imagery depicts *historical* accident clusters, never live road or walking closures.
const ORIGIN='https://opendata.koroad.or.kr/data/wms/frequentzone/';
export const PEDESTRIAN_WMS_KINDS=Object.freeze({
 pedestrian:Object.freeze({path:'pedstrians',layer:'frepedstrians',label:'보행자 사고다발지역'}),
 child:Object.freeze({path:'child',layer:'frechild',label:'보행어린이 사고다발지역'}),
 elderly:Object.freeze({path:'oldman',layer:'freoldman',label:'보행노인 사고다발지역'})
});
const n=x=>typeof x==='number'&&Number.isFinite(x);
export function validTaasMapBounds(b){
 if(!b||!['west','south','east','north'].every(k=>n(b[k])))return false;
 return b.west>=123&&b.east<=133&&b.south>=32&&b.north<=40&&
  b.east>b.west&&b.north>b.south&&
  b.east-b.west>=0.0002&&b.north-b.south>=0.0002&&
  b.east-b.west<=0.20&&b.north-b.south<=0.20;
}
export function centerFromBounds(b){
 if(!validTaasMapBounds(b))return null;
 return {lat:(b.north+b.south)/2,lng:(b.west+b.east)/2};
}
export function districtFromKakao(raw){
 const row=Array.isArray(raw?.documents)?raw.documents.find(d=>d.region_type==='B'&&/^\d{10}$/.test(String(d.code??''))):null;
 if(!row)return null;
 const code=String(row.code);
 return {siDo:code.slice(0,2),guGun:code.slice(2,5),
  label:[row.region_1depth_name,row.region_2depth_name].filter(Boolean).join(' ').slice(0,60),code:code.slice(0,5)};
}
export function buildTaasMapUrl(key,kind,bounds,district){
 const info=PEDESTRIAN_WMS_KINDS[kind];
 if(!key||!info||!validTaasMapBounds(bounds)||!/^\d{2}$/.test(district?.siDo||'')||!/^\d{3}$/.test(district?.guGun||''))throw Error('Invalid TAAS WMS request');
 const url=new URL(info.path,ORIGIN);
 const bbox=[bounds.west,bounds.south,bounds.east,bounds.north].map(x=>x.toFixed(6)).join(',');
 const args={authKey:key,layers:info.layer,format:'image/png',transparent:'TRUE',service:'WMS',
  version:'1.1.1',request:'GetMap',srs:'EPSG:4326',bbox,width:512,height:512,
  searchYearCd:'2024',siDo:district.siDo,guGun:district.guGun};
 for(const [k,v]of Object.entries(args))url.searchParams.set(k,String(v));
 return url;
}
export const validPng=bytes=>bytes.length>=24&&bytes.length<=2500000&&
 [137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x)&&
 bytes[12]===73&&bytes[13]===72&&bytes[14]===68&&bytes[15]===82;
const problem=(code,reason)=>({status:'failed',providerStatus:code,reason});
export async function fetchTaasMapImage({key,kakaoKey,kind,bounds,fetcher=fetch}={}){
 if(!key||!kakaoKey)return {status:'missing',reason:'TAAS 또는 카카오 서버 인증키 미설정'};
 if(!PEDESTRIAN_WMS_KINDS[kind]||!validTaasMapBounds(bounds))return problem(400,'지원하지 않는 지도종류 또는 범위');
 const center=centerFromBounds(bounds);
 try{
  const reverse=new URL('https://dapi.kakao.com/v2/local/geo/coord2regioncode.json');
  reverse.searchParams.set('x',String(center.lng));reverse.searchParams.set('y',String(center.lat));
  const region=await fetcher(reverse.toString(),{headers:{Authorization:'KakaoAK '+kakaoKey,Accept:'application/json'},
   signal:AbortSignal.timeout(8500)});
  if(!region.ok)return problem(region.status,'지도 중심 법정구역 조회 실패');
  const district=districtFromKakao(await region.json());
  if(!district)return problem(422,'법정구역을 확인하지 못해 지도표출 보류');
  const image=await fetcher(buildTaasMapUrl(key,kind,bounds,district).toString(),{
   headers:{Accept:'image/png'},signal:AbortSignal.timeout(12500)});
  if(!image.ok)return problem(image.status,image.status===403?'TAAS WMS 서비스 승인 확인 필요':'TAAS WMS 이미지 요청 실패');
  if(!String(image.headers.get('content-type')||'').toLowerCase().includes('image/png'))
   return problem(502,'기관이 PNG가 아닌 응답 반환 · 승인/요청변수 확인 필요');
  const bytes=new Uint8Array(await image.arrayBuffer());
  if(!validPng(bytes))return problem(502,'기관 PNG 이미지 형식 검증 실패');
  return {status:'received',bytes,districtCode:district.code,year:'2024',kind,
   source:'한국도로교통공단 TAAS',coverage:'지도 중심 법정구역만 표시 · 인접 시군구 누락 가능'};
 }catch{return problem(502,'TAAS WMS 또는 행정구역 조회 연결 실패');}
}
