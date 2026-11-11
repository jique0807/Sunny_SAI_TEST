// Route-specific source provenance/readiness, separate for driving and walking.
// Pure audit metadata: no GPS, secrets, upstream URLs, raw provider payloads, or risk upgrades.
// The return value NEVER authorizes autonomous rerouting or declares a route safe.
export const RISK_SOURCE_ELIGIBILITY_SCHEMA='sunny-risk-source-eligibility-v1';
const MODES=Object.freeze({driving:'driving',walking:'walking'});
const ACCEPTED=new Set(['received','partial','empty','failed','missing','unavailable','not-checked','checking']);
const normalize=s=>ACCEPTED.has(s)?s:'not-checked';
const source=(id,label,rawStatus,signals,kind)=>{
 const status=normalize(rawStatus);
 const matched=signals.filter(s=>kind(s));
 let evaluation='unverified';
 if(status==='failed'||status==='unavailable'||status==='missing')evaluation='not-available';
 else if(status==='not-checked'||status==='checking')evaluation='not-checked';
 else if(status==='empty')evaluation='no-records-in-probe';
 else if(matched.length)evaluation={
  its:'point-near-route-link-unverified',
  road:'route-matched-verified-grade',
  warning:'weather-warning-proximity-only',
  taas:'historical-route-context',
  weather:'forecast-risk-signal'}[id]||'matched-advisory';
 else if(status==='received'||status==='partial')evaluation=id==='weather'?'forecast-time-matched':'received-not-route-verified';
 return {id,label,reception:status,evaluation,acceptedSignals:matched.length};
};
export function summarizeRiskSourceEligibility({route=null,profile=null}={}){
 const rawMode=route?.travelMode||route?.mode;
 const mode=rawMode==='pedestrian'?'walking':Object.hasOwn(MODES,rawMode)?rawMode:'unknown';
 const demo=route?.demo===true;
 const validMode=Object.hasOwn(MODES,mode);
 const routeValid=validMode&&!demo&&Array.isArray(route?.rainPath)&&route.rainPath.length>1&&
  Number.isFinite(route?.distance)&&route.distance>0&&
  Number.isFinite(route?.duration)&&route.duration>0;
 const signals=Array.isArray(profile?.signals)?profile.signals.filter(h=>h&&h.demo!==true):[];
 const sources=[source('weather','경로별 기상청 예보',profile?.state==='evaluated'?'received':
  profile?.state==='partial'?'partial':'not-checked',signals,
  h=>h.provider==='기상청 격자예보')];
 if(mode==='driving'){
  sources.push(source('its','ITS 사고·공사·통제',route?.itsEvidenceStatus,signals,h=>h.kind==='its-incident'));
  sources.push(source('road','도로 살얼음·안개',route?.roadEvidenceStatus,signals,h=>
   h.roadRisk!==undefined&&h.riskGradeVerified===true));
  sources.push(source('warning','기상특보',route?.warningEvidenceStatus,signals,h=>h.kind==='warning'));
 }else if(mode==='walking'){
  sources.push(source('taas','과거 보행사고 이력',route?.pedestrianEvidenceStatus,signals,h=>
   h.kind==='pedestrian-hotspot'&&h.historic===true&&h.live===false));
  sources.push(source('warning','기상특보',route?.warningEvidenceStatus,signals,h=>h.kind==='warning'));
 }
 const weatherAdequate=profile?.state==='evaluated'&&Number.isFinite(profile.coverage)&&profile.coverage>=80;
 const ready=routeValid&&weatherAdequate&&profile?.mode===mode;
 const incomplete=sources.filter(s=>s.id!=='weather'&&s.evaluation!=='route-matched-verified-grade');
 return {
  schema:RISK_SOURCE_ELIGIBILITY_SCHEMA,
  routeMode:mode,simulated:demo,
  readiness:demo?'simulation':!ready?'not-evaluable':'limited-evidence',
  analyzedWithWeather:ready,
  sourceCompleteness:!ready?'not-evaluable':incomplete.length?'incomplete':'limited-to-verified-signals',
  unverifiedSourceCount:incomplete.length,
  excludedUnverifiedSignals:Number.isInteger(profile?.unknownSignals)?profile.unknownSignals:0,
  acceptedRiskSignals:Number.isInteger(profile?.signalCount)?profile.signalCount:0,
  sources,
  automaticRerouteAuthorized:false,
  safeRouteCertified:false,
  caution:'기상예보 조회 및 위험신호 수신은 경로의 안전을 증명하지 않습니다. ITS 위치는 도로 링크·진행방향이 미검증이며 TAAS는 과거 사고이력입니다.'
 };
}
