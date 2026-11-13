// TAAS 2024 georeferenced REST map: no WMS or fabricated accident points.
import {TAAS_REST_TYPES,fetchKoroadPedestrianHotspots} from './koroad-pedestrian.mjs';
import {validTaasMapBounds} from './taas-pedestrian-wms-map.mjs';
import {legalDistrictFromKakao} from './pedestrian-route-context.mjs';
const safe=p=>p&&Number.isFinite(p.lat)&&p.lat>=32&&p.lat<=40&&Number.isFinite(p.lng)&&p.lng>=123&&p.lng<=133;
export function filterRestAccidents(items,kind,bounds){
 if(!TAAS_REST_TYPES[kind]||!validTaasMapBounds(bounds)||!Array.isArray(items))return[];
 return items.filter(p=>safe(p)&&p.historic===true&&p.live===false&&p.year==='2024'&&p.kind===kind&&
   Number.isInteger(p.accidentCount)&&p.accidentCount>=0&&p.lng>=bounds.west&&p.lng<=bounds.east&&p.lat>=bounds.south&&p.lat<=bounds.north).slice(0,100);
}
export async function fetchTaasRestMap({koroadKey,kakaoKey,kind,bounds,fetcher=fetch}={}){
 if(!TAAS_REST_TYPES[kind]||!validTaasMapBounds(bounds))return {status:'invalid',items:[],reason:'TAAS 종류 또는 지도 범위 확인 필요'};
 if(!koroadKey||!kakaoKey)return {status:'missing',items:[],reason:'TAAS/카카오 인증키 미설정'};
 const point={lat:(bounds.north+bounds.south)/2,lng:(bounds.west+bounds.east)/2};
 const url=new URL('https://dapi.kakao.com/v2/local/geo/coord2regioncode.json');
 url.searchParams.set('x',String(point.lng));url.searchParams.set('y',String(point.lat));
 let district;
 try{
  const response=await fetcher(url.toString(),{headers:{Authorization:'KakaoAK '+kakaoKey,Accept:'application/json'},signal:AbortSignal.timeout(8500)});
  if(!response.ok)return {status:'failed',items:[],reason:'지도 법정구역 조회 실패'};
  district=legalDistrictFromKakao(await response.json(),point);
 }catch{return {status:'failed',items:[],reason:'법정구역 서버 연결 실패'};}
 if(!district)return {status:'failed',items:[],reason:'법정구역 확인 불가'};
 const report=await fetchKoroadPedestrianHotspots(koroadKey,fetcher,district,kind);
 if(!['received','empty'].includes(report.status))return {...report,items:[],kind};
 const items=filterRestAccidents(report.items,kind,bounds);
 return {status:items.length?'received':'empty',items,kind,year:'2024',region:district.region,
  coverage:'현재 지도 중심 법정구역의 2024년 사고다발지역만 표시',
  caution:'과거 사고지역이며 현재 사고 발생·통제·안전등급을 의미하지 않습니다.'};
}
