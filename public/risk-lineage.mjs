import {summarizeRiskSourceEligibility} from './risk-source-eligibility.mjs';
// Privacy-preserving, machine-readable data lineage for ONE actual route.
// Contains metadata and counts only. Never export geometry, GPS, provider payloads or keys.
export const RISK_LINEAGE_SCHEMA='sunny-risk-lineage-v1';
const states=new Set(['received','partial','empty','failed','missing','checking','unavailable','not-checked','simulation']);
const state=s=>states.has(s)?s:'not-checked';
const stageStatus=s=>s==='evaluated'?'received':
 s==='insufficient-data'||s==='unsupported'?'unavailable':state(s);
export function buildRiskLineage({route=null,weather=null,profile=null,now=Date.now()}={}){
 const demo=route?.demo===true,walking=route?.travelMode==='walking';
 const samples=Array.isArray(weather?.samples)?weather.samples:[];
 const realKma=samples.filter(s=>s?.status==='forecast'&&s.forecast?.provider==='kma').length;
 const modelWeather=samples.filter(s=>s?.status==='forecast'&&s.forecast?.provider!=='kma').length;
 const routeStatus=demo?'simulation':
  Array.isArray(route?.rainPath)&&route.rainPath.length>1?'received':'not-checked';
 const weatherStatus=demo?'simulation':realKma?'received':modelWeather?'partial':samples.length?'unavailable':'not-checked';
 const direct=(id,label,status,detail)=>{
  return {id,label,status:demo?'simulation':state(status),detail};
 };
 const sources=[
  direct('route','실제 이동 경로',routeStatus,'차량·도보 경로 형상 및 통과시각'),
  direct('weather','기상 예보',weatherStatus,
   '기상청 '+realKma+'개 · 기타 모델 '+modelWeather+'개 · 경로 표본 '+samples.length+'개'),
  direct('warning','기상특보',route?.warningEvidenceStatus,
   '관측지점 인접성은 특보구역 경계 검증이 아님')
 ];
 if(!walking){
  sources.push(direct('its','ITS 사고·공사·통제',route?.itsEvidenceStatus,
   '도로 링크·방향·통제 여부 확인 전에는 자동 우회 불가'));
  sources.push(direct('road','도로위험기상',route?.roadEvidenceStatus,
   '좌표·위험등급·15분 이내 자료시각 검증 필요'));
 }else{
  sources.push(direct('taas','TAAS 과거 보행사고',route?.pedestrianEvidenceStatus,
   '2024년 과거 이력 · 실시간 사고 아님'));
 }
 const decision=demo?'simulation':profile?.state||'not-checked';
 const evidenceReadiness=summarizeRiskSourceEligibility({route,profile});
 return {
  schema:RISK_LINEAGE_SCHEMA,generatedAt:new Date(now).toISOString(),
  routeMode:route?.travelMode||'unknown',decisionModel:profile?.decisionModel||'not-checked',
  decision,decisionWithheld:profile?.decisionWithheld===true,
  forecastCoverage:profile?.coverage??0,
  assessmentScope:profile?.assessmentScope==='ahead-samples'?'ahead-samples':'route-samples',
  acceptedRiskSignals:profile?.signalCount??0,
  excludedUnverifiedSignals:profile?.unknownSignals??0,
  riskLevel:profile?.riskLevel||'unknown',
  evidenceReadiness,
  sources,
  stages:[
   {id:'route',status:routeStatus},
   {id:'acquire',status:demo?'simulation':sources.some(x=>x.status==='received')?'partial':'not-checked'},
   {id:'validate',status:demo?'simulation':profile?.state==='evaluated'?'received':profile?.state==='partial'?'partial':'not-checked'},
   {id:'decide',status:stageStatus(decision)},
   {id:'present',status:'not-checked'}
  ],
  caution:'자료 미수신·결측·위치 정합 미검증은 안전함이 아닙니다. 실제 위험확률이 아닌 제한된 근거의 판단입니다.'
 };
}
