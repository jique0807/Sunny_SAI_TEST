import {tmapWalkingRoute} from './tmap-walk.mjs';
export const PEDESTRIAN_DIAGNOSTIC_CASE=Object.freeze({
 origin:Object.freeze({lat:37.55472,lng:126.97083}),
 destination:Object.freeze({lat:37.5662952,lng:126.9779451})
});
export async function probePedestrianRoute({key,kakaoFallback=false,fetcher=fetch,now=Date.now(),testCase=PEDESTRIAN_DIAGNOSTIC_CASE}={}){
 const common={provider:'tmap',case:testCase.label||'서울역 → 서울시청',checkedAt:new Date(now).toISOString(),testOnly:true};
 if(!key)return {...common,status:'key_missing',fallbackProvider:kakaoFallback?'kakao':'none',
  reason:'TMAP_API_KEY 미등록'+(kakaoFallback?' · 카카오 도보 서비스 실제 응답은 별도 검증 필요':'')};
 try{
  const route=await tmapWalkingRoute(testCase.origin,testCase.destination,now+120000,key,fetcher);
  const valid=route?.provider==='TMAP'&&route?.travelMode==='walking'&&
   Number.isFinite(route.distance)&&route.distance>0&&Number.isFinite(route.duration)&&route.duration>0&&
   Array.isArray(route.vertices)&&route.vertices.length>=2&&
   Array.isArray(route.samples)&&route.samples.length>0&&
   Array.isArray(route.rainPath)&&route.rainPath.length>=2&&
   route.rainPath.every((p,i)=>Number.isFinite(p.seconds)&&p.seconds>=0&&(!i||p.seconds>=route.rainPath[i-1].seconds));
  return {...common,status:valid?'received':'invalid_geometry',geometryValid:valid,
   distanceMeters:valid?Math.round(route.distance):null,durationSeconds:valid?Math.round(route.duration):null,
   sampleCount:valid?route.samples.length:0,
   caution:'실제 보행 경로 API 응답 검사입니다. 기상·노면 안전을 검증한 결과는 아닙니다.'};
 }catch(e){
  const m=String(e?.message||'').match(/HTTP (\d{3})/),providerStatus=m?Number(m[1]):null;
  const reason=[401,403].includes(providerStatus)?'TMAP 인증키·서비스 이용권한 확인 필요':
   providerStatus===429?'TMAP 공급기관 호출량 제한':
   providerStatus?'TMAP 공급기관 HTTP '+providerStatus+' 응답 실패':
   'TMAP 보행 경로 응답 또는 좌표 검증 실패';
  return {...common,status:'failed',providerStatus,reason};
 }
}

export const PEDESTRIAN_NATIONAL_TEST_CASES=Object.freeze([
 Object.freeze({...PEDESTRIAN_DIAGNOSTIC_CASE,label:'서울역 → 서울시청'}),
 Object.freeze({label:'부산역 → 부산진역',
  origin:Object.freeze({lat:35.1152,lng:129.0414}),destination:Object.freeze({lat:35.1278,lng:129.0476})}),
 Object.freeze({label:'대전시청 → 정부대전청사',
  origin:Object.freeze({lat:36.3504,lng:127.3845}),destination:Object.freeze({lat:36.3614,lng:127.3868})})
]);
export async function probeNationalPedestrianRoutes({key,fetcher=fetch,now=Date.now()}={}){
 if(!key)return {provider:'tmap',status:'key_missing',checkedAt:new Date(now).toISOString(),
  regionsChecked:0,regionsReceived:0,cases:[],reason:'TMAP_API_KEY 미등록'};
 const cases=[];
 // Fixed city pairs: bounded requests and cache at the API handler; not full national coverage.
 for(const testCase of PEDESTRIAN_NATIONAL_TEST_CASES){
  const result=await probePedestrianRoute({key,fetcher,now,testCase});
  cases.push({case:result.case,status:result.status,geometryValid:result.geometryValid===true,
   distanceMeters:result.distanceMeters||null,durationSeconds:result.durationSeconds||null,
   providerStatus:result.providerStatus||null,reason:result.reason||null});
  if(result.status==='failed'&&[401,403,429].includes(result.providerStatus))break;
 }
 const success=cases.filter(x=>x.status==='received').length;
 const status=success===PEDESTRIAN_NATIONAL_TEST_CASES.length?'received':
  success?'partial':'failed';
 return {provider:'tmap',status,checkedAt:new Date(now).toISOString(),
  regionsChecked:cases.length,regionsReceived:success,cases,
  limitation:'서울·부산·대전의 고정 도보경로 API 검증이며 전국 모든 보행로 이용 가능 증명은 아닙니다.'};
}
