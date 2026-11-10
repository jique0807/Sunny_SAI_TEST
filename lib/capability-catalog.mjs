// Read-only adapter inventory; configuration != authenticated access or usable data.
// Never include secrets, upstream URLs with tokens, private location or provider responses.
export const CAPABILITY_SCHEMA='sunny-capabilities-v1';
const source=(id,name,slot,keys,apiPath,role,swapInApp=false)=>Object.freeze({
 id,name,slot,keys:Object.freeze(keys),apiPath,role,swapInApp
});
export const SOURCE_ADAPTERS=Object.freeze([
 source('kakao-driving','카카오 차량 경로','routing-driving',['KAKAO_REST_API_KEY'],'/api/route','geometry-eta'),
 source('tmap-walking','TMAP 보행 경로','routing-walking',['TMAP_API_KEY'],'/api/route','geometry-eta'),
 source('kma-forecast','기상청 경로별 격자예보','forecast',['KMA_API_KEY'],'/api/weather','risk-evidence',true),
 source('open-meteo','Open-Meteo 모델 예보','forecast',[],'/api/weather','context-only',true),
 source('kma-radar','기상청 HSR 레이더','map-raster',['KMA_API_KEY'],'/api/radar-overlay-frame','visual-evidence'),
 source('kma-rain-grid','기상청 RN1 격자','map-raster',['KMA_API_KEY'],'/api/rain-grid','visual-evidence'),
 source('gk2a','GK2A 위성 영상','map-raster',['KMA_API_KEY'],'/api/gk2a-layer-status','unverified-georeference'),
 source('kma-road','기상청 도로위험','road-evidence',['KMA_API_KEY'],'/api/road-risk','conditional-risk-evidence'),
 source('kma-warning','기상청 기상특보','regional-evidence',['KMA_API_KEY'],'/api/weather-warnings','conditional-risk-evidence'),
 source('its','ITS 도로 사고·공사·통제','traffic-evidence',['ROAD_API_KEY'],'/api/its-route-context','conditional-risk-evidence'),
 source('taas','TAAS 2024년 과거 사고이력','historical-evidence',['KOROAD_API_KEY'],'/api/pedestrian-route-context','conditional-risk-evidence'),
 source('taas-map','TAAS 2024년 지도 좌표','map-points',['KOROAD_API_KEY','KAKAO_REST_API_KEY'],'/api/taas-rest-map','historical-map-only'),
 source('safemap','생활안전지도 범람예상 구역','map-raster',['SAFEMAP_API_KEY'],'/api/safemap/wms','projection-unverified')
]);
export const PIPELINE_STAGES=Object.freeze([
 '경로 형상·이동수단 확인','예상 통과시각 계산','공급기관 자료 수집',
 '출처·시간·좌표·등급 검증','위험정책 평가','지도·음성 안내'
]);
export function capabilityCatalog(env={}){
 const sources=SOURCE_ADAPTERS.map(s=>({
  id:s.id,name:s.name,slot:s.slot,apiPath:s.apiPath,role:s.role,
  keys:[...s.keys],swapInApp:s.swapInApp,
  configuration:!s.keys.length?'no-key-required':
   s.keys.every(k=>Boolean(env[k]))?'configured':'missing-key',
  reception:'not-checked-by-catalog',
  verifiedRiskEvidence:false
 }));
 return {
  schema:CAPABILITY_SCHEMA,readOnly:true,pipeline:[...PIPELINE_STAGES],
  sources,
  riskModels:[
   {id:'rules-v2',type:'deterministic',status:'implemented',role:'evidence-based risk policy'},
   {id:'rules-v2-strict',type:'deterministic',status:'implemented',role:'abstain on incomplete evidence'},
   {id:'external-llm',type:'language-model',status:'not-connected',role:'optional non-authoritative narration'}
  ],
  guidance:'인증키 설정은 공급기관 실제 응답·좌표 검증을 뜻하지 않습니다. API 교체는 승인된 어댑터와 계약시험을 통해 수행하며 임의 URL 입력은 허용하지 않습니다.'
 };
}
