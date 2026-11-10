// Korean Road Traffic Authority: historical PEDESTRIAN accident clusters.
// Fixed region/year during initial rollout; never infer live accidents or verified safety.
export const KOROAD_PEDESTRIAN_CONTEXT=Object.freeze({
 region:'서울특별시 중구',siDo:'11',guGun:'140',year:'2024',
 endpoint:'https://opendata.koroad.or.kr/data/rest/frequentzone/pedstrians'
});
const valid=p=>Number.isFinite(p.lat)&&p.lat>=32&&p.lat<=40&&Number.isFinite(p.lng)&&p.lng>=123&&p.lng<=133;
const regionOK=r=>r&&/^\d{2}$/.test(r.siDo)&&/^\d{3}$/.test(r.guGun)&&r.year==='2024';
const number=v=>{const n=Number(v);return Number.isInteger(n)&&n>=0&&n<=100000?n:null};
export function parseKoroadPedestrianHotspots(raw,{year=KOROAD_PEDESTRIAN_CONTEXT.year,context=KOROAD_PEDESTRIAN_CONTEXT}={}){
 if(!regionOK({...context,year}))return {status:'failed',items:[],year,reason:'지역코드 검증 실패'};
 if(raw?.resultCode==='03')return {status:'empty',items:[],year,source:'한국도로교통공단 TAAS'};
 if(String(raw?.resultCode)!=='00')return {status:'failed',items:[],year,reason:'TAAS 보행자 REST 이용승인 또는 응답형식 확인 필요 · WMS 승인과 별도'};
 const rows=Array.isArray(raw?.items?.item)?raw.items.item:raw?.items?.item?[raw.items.item]:[];
 const kept=[];
 for(const row of rows.slice(0,200)){
  const lat=Number(row?.la_crd),lng=Number(row?.lo_crd);
  if(!valid({lat,lng})||!String(row?.bjd_cd||'').startsWith(context.siDo+context.guGun))continue;
  const count=number(row?.occrrnc_cnt),victims=number(row?.caslt_cnt);
  if(count===null)continue;
  const name=String(row.spot_nm||'보행자 사고다발지역').slice(0,100);
  kept.push({lat,lng,name,accidentCount:count,casualties:victims,year,
   source:'한국도로교통공단 TAAS',regionCode:context.siDo+context.guGun,historic:true,live:false,
   caution:'과거 교통사고 집중구역 · 현재 사고 발생 또는 통제구간이 아닙니다.'});
 }
 return {status:kept.length?'received':'empty',items:kept,year,
  region:String(context.region||context.siDo+context.guGun).slice(0,80),source:'한국도로교통공단 TAAS',
  caution:'2024년 과거 사고다발지역 통계입니다. 현재 사고·공사·실시간 위험 여부와 무관합니다.'};
}
export async function fetchKoroadPedestrianHotspots(key,fetcher=fetch,ctx=KOROAD_PEDESTRIAN_CONTEXT){
 if(!regionOK(ctx))return {status:'failed',items:[],reason:'조회할 행정구역 코드가 올바르지 않습니다.'};
 if(!key)return{status:'missing',items:[],year:ctx.year,reason:'KOROAD_API_KEY 미등록'};
 // The licensed provider endpoint is fixed; region input may change only verified district codes.
 const url=new URL(KOROAD_PEDESTRIAN_CONTEXT.endpoint);
 for(const [k,v] of Object.entries({authKey:key,searchYearCd:ctx.year,siDo:ctx.siDo,guGun:ctx.guGun,type:'json',numOfRows:'200',pageNo:'1'}))
  url.searchParams.set(k,v);
 try{
  const response=await fetcher(url.toString(),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  if(!response.ok)return {status:'failed',items:[],year:ctx.year,providerStatus:response.status,
   reason:[401,403].includes(response.status)?'기관 인증·이용승인 확인 필요':'기관 응답 실패'};
  const raw=await response.json();
  return parseKoroadPedestrianHotspots(raw,{year:ctx.year,context:ctx});
 }catch{
  return{status:'failed',items:[],year:ctx.year,reason:'기관 연결 또는 응답형식 확인 필요'};
 }
}
