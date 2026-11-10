// Nationwide route-relevant 2024 KOROAD historical pedestrian accident clusters.
// A reverse-geocoded legal district is required; no guessed jurisdictions or live accident claims.
import {fetchKoroadPedestrianHotspots} from './koroad-pedestrian.mjs';
const valid=p=>Number.isFinite(p?.lat)&&p.lat>=32&&p.lat<=40&&Number.isFinite(p?.lng)&&p.lng>=123&&p.lng<=133;
const meters=(a,b)=>Math.hypot((a.lat-b.lat)*111195,(a.lng-b.lng)*111195*Math.cos((a.lat+b.lat)*Math.PI/360));
const districts=new Map();
function sampleCoordinates(points){
 if(!Array.isArray(points)||points.length<2||points.length>6||!points.every(valid))return null;
 return points;
}
export function legalDistrictFromKakao(raw,point){
 if(!valid(point)||!Array.isArray(raw?.documents))return null;
 const place=raw.documents.find(x=>x.region_type==='B'&&/^\\d{10}$/.test(String(x.code||'')));
 if(!place)return null;
 const code=place.code;
 if(!/^\\d{5}$/.test(code.slice(0,5)))return null;
 // Region codes are national legal-dong identifiers, with five-digit city/county prefix.
 return {siDo:code.slice(0,2),guGun:code.slice(2,5),year:'2024',
  region:[place.region_1depth_name,place.region_2depth_name].filter(Boolean).join(' ').slice(0,70)};
}
export async function fetchRoutePedestrianHistory({points,koroadKey,kakaoKey,fetcher=fetch,now=Date.now()}={}){
 const common={source:'한국도로교통공단 TAAS',year:'2024',historic:true,live:false,
  coverage:'경로 주변 대표좌표의 법정구역 조회 (전국 완전탐색 아님)',
  caution:'과거 보행자 사고 집중지역입니다. 현재 사고·통제·실시간 위험을 의미하지 않습니다.'};
 const samples=sampleCoordinates(points);
 if(!samples)return {...common,status:'invalid',items:[],reason:'유효한 경로 위치 2~6개가 필요합니다.'};
 if(!koroadKey||!kakaoKey)return {...common,status:'missing',items:[],reason:'KOROAD 또는 카카오 서버 인증키 미등록'};
 const found=new Map(),failures=[];
 for(const point of samples){
  const url=new URL('https://dapi.kakao.com/v2/local/geo/coord2regioncode.json');
  url.searchParams.set('x',String(point.lng));url.searchParams.set('y',String(point.lat));
  try{
   const res=await fetcher(url.toString(),{headers:{Authorization:'KakaoAK '+kakaoKey,Accept:'application/json'},signal:AbortSignal.timeout(8500)});
   if(!res.ok){failures.push('행정구역 조회 실패 (HTTP '+res.status+')');continue;}
   const code=legalDistrictFromKakao(await res.json(),point);
   if(!code){failures.push('해당 위치의 법정구역을 확인하지 못했습니다.');continue;}
   const key=code.siDo+code.guGun;
   if(!found.has(key))found.set(key,code);
  }catch{failures.push('행정구역 연결 실패');}
 }
 if(!found.size)return {...common,status:'failed',items:[],regionsChecked:0,reason:failures[0]||'법정구역 미확인'};
 const items=[],seen=new Set(),checks=[];
 for(const [code,ctx] of [...found].slice(0,5)){
  let result;
  const cached=districts.get(code);
  if(cached?.until>now)result=cached.value;
  else{
   result=await fetchKoroadPedestrianHotspots(koroadKey,fetcher,ctx);
   if(['received','empty'].includes(result.status)){
    if(districts.size>80)districts.clear();
    districts.set(code,{until:now+30*60000,value:result});
   }
  }
  checks.push({code,region:ctx.region,status:result.status});
  if(result.status==='failed'||result.status==='missing'){failures.push('사고통계 지역 '+code+' 수신 실패');continue;}
  for(const p of result.items||[]){
   // The source may return zones outside the queried corridor: keep only
   // a conservative 2.5-km neighborhood of at least one supplied route point.
   if(!valid(p)||!samples.some(x=>meters(x,p)<=2500))continue;
   const id=p.regionCode+':'+p.lat.toFixed(5)+':'+p.lng.toFixed(5);
   if(seen.has(id))continue;
   seen.add(id);items.push(p);
   if(items.length>=180)break;
  }
 }
 const anyOK=checks.some(x=>['received','empty'].includes(x.status));
 return {...common,status:!anyOK?'failed':failures.length?'partial':items.length?'received':'empty',
  items:items.slice(0,180),regionsChecked:checks.length,regions:checks,
  reason:failures.length?'일부 행정구역의 과거 통계가 확인되지 않았습니다.':null};
}
