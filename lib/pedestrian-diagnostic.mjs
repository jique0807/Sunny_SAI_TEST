import {tmapWalkingRoute} from './tmap-walk.mjs';
export const PEDESTRIAN_DIAGNOSTIC_CASE=Object.freeze({
 origin:Object.freeze({lat:37.55472,lng:126.97083}),
 destination:Object.freeze({lat:37.5662952,lng:126.9779451})
});
export async function probePedestrianRoute({key,kakaoFallback=false,fetcher=fetch,now=Date.now()}={}){
 const common={provider:'tmap',case:'서울역 → 서울시청',checkedAt:new Date(now).toISOString(),testOnly:true};
 if(!key)return {...common,status:'key_missing',fallbackProvider:kakaoFallback?'kakao':'none',
  reason:'TMAP_API_KEY 미등록'+(kakaoFallback?' · 카카오 도보 서비스 실제 응답은 별도 검증 필요':'')};
 try{
  const route=await tmapWalkingRoute(PEDESTRIAN_DIAGNOSTIC_CASE.origin,PEDESTRIAN_DIAGNOSTIC_CASE.destination,now+120000,key,fetcher);
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
