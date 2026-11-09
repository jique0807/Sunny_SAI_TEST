// Sunny SAI Risk Engine 2.0 — explainable, deterministic route-risk assessment.
// No paid AI, no model inference. Scores are relative evidence indices, NOT
// accident probabilities, traffic restrictions or certifications of safe travel.
import {assessRouteHazard} from './risk-engine.mjs';
import {buildRouteHazards} from './route-hazards.mjs';

export const SAFE_ROUTE_ENGINE_VERSION='risk-v2.0';
const geo=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lng)&&p.lat>=32&&p.lat<=40&&p.lng>=123&&p.lng<=133;
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const validRoute=r=>Array.isArray(r?.rainPath)&&r.rainPath.length>1&&
 Number.isFinite(r.duration)&&r.duration>0&&Number.isFinite(r.distance)&&r.distance>0&&
 r.rainPath.every(p=>geo(p)&&Number.isFinite(p.seconds))&&
 r.rainPath[0].seconds>=0&&r.rainPath.at(-1).seconds>0;
const validForecastSample=s=>s?.status==='forecast'&&s.forecast?.provider==='kma'&&
 geo(s)&&time(s.eta)&&time(s.forecast.time)&&Number.isFinite(s.seconds)&&
 Math.abs(Date.parse(s.eta)-Date.parse(s.forecast.time))<=90*60000;
// A region warning matched only to a station is point-proximity evidence,
// not a verified warning-polygon/road intersection.
const supportedMode=mode=>mode==='driving'||mode==='walking';
const threshold=mode=>mode==='walking'?12:15;

export function evaluateRouteRisk(route,{weatherSamples=[],extraHazards=[],mode='driving',now=Date.now()}={}){
 const base={engine:SAFE_ROUTE_ENGINE_VERSION,mode,assurance:'상대적 예보·위험 근거 분석이며 안전 보증 또는 사고확률이 아닙니다.',
  coveredSamples:0,totalSamples:0,coverage:0,signalCount:0,signalIndex:0,
  unknownSignals:0,signals:[],sources:[],riskLevel:'unknown',routeMinutes:0};
 if(!supportedMode(mode))return {...base,state:'unsupported',reason:'지원하지 않는 이동수단입니다.'};
 if(route?.demo)return {...base,state:'simulation',reason:'시연용 위험정보는 실제 위험 엔진 평가에서 제외합니다.'};
 if(!validRoute(route))return {...base,state:'insufficient-data',reason:'도로 경로 형상·거리·시간이 검증되지 않았습니다.'};
 if(mode==='walking'&&!['walking','pedestrian'].includes(route.travelMode||route.mode))
  return {...base,state:'unsupported',reason:'보행자 전용 경로 형상이 없어 자동차 경로를 보행 안전으로 평가하지 않습니다.'};
 const expected=Array.isArray(route.samples)?route.samples.filter(s=>Number.isFinite(s?.seconds)&&geo(s)):[];
 const incoming=Array.isArray(weatherSamples)?weatherSamples:[];
 // Only known route sample locations count towards forecast coverage.
 const expectedSeconds=new Set(expected.map(x=>Math.round(x.seconds)));
 const receivedSeconds=new Set(incoming.filter(validForecastSample)
  .map(x=>Math.round(x.seconds)).filter(s=>expectedSeconds.has(s)));
 const covered=receivedSeconds.size,total=expectedSeconds.size,coverage=total?covered/total:0;
 // Extra hazards may be supplied by verified route-matching adapters. Unknown
 // or malformed records are excluded and counted, never treated as safe.
 const candidates=[
  ...buildRouteHazards(incoming,{limit:20}),
  ...(Array.isArray(extraHazards)?extraHazards:[])
 ];
 const accepted=[],unknown=[];
 for(const h of candidates){
  if(!h||h.demo)continue;
  if(!geo(h)||!Number.isFinite(h.seconds)||h.seconds<0||h.seconds>route.duration){unknown.push(h);continue;}
  const a=assessRouteHazard(h,{now});
  if(!a.score||a.level==='unknown'){unknown.push(h);continue;}
  if(mode==='walking'&&h.roadRisk!==undefined){
   // KMA road-link risk grades refer to vehicle roads, not pedestrian access.
   unknown.push(h);continue;
  }
  if(accepted.some(x=>x.kind===h.kind&&Math.abs(x.seconds-h.seconds)<600&&x.provider===h.provider))continue;
  accepted.push({...h,assessment:a});
 }
 accepted.sort((a,b)=>a.seconds-b.seconds);
 const level=accepted.some(h=>h.assessment.level==='high')?'high':
  accepted.some(h=>h.assessment.level==='caution')?'caution':
  accepted.some(h=>h.assessment.level==='notice')?'notice':
  accepted.length?'info':'unknown';
 // Evidence index weights verified risk severity and proximity in the itinerary.
 // This is a *relative route-comparison signal*, not a spatially continuous
 // prediction. No supplied route forecast => NOT COMPARABLE.
 const index=accepted.reduce((sum,h)=>sum+
  (h.assessment.level==='high'?35:h.assessment.level==='caution'?18:
   h.assessment.level==='notice'?9:3),0);
 const state=!total||!covered?'insufficient-data':coverage<.8?'partial':'evaluated';
 const sources=[...new Set(accepted.map(h=>h.provider).filter(Boolean))];
 return {...base,state,
  reason:state==='evaluated'?'조회 지점 예보 기반의 제한적인 위험 신호 분석':
   state==='partial'?'경로 일부 조회 지점의 예보가 누락되었습니다.':'기상청 예보 유효시각 또는 경로 조회 지점이 확인되지 않았습니다.',
  coveredSamples:covered,totalSamples:total,coverage:Math.round(coverage*100),
  signalCount:accepted.length,signalIndex:Math.min(100,index),
  unknownSignals:unknown.length,signals:accepted,sources,riskLevel:level,
  routeMinutes:Math.ceil(route.duration/60)};
}

export function compareRouteRiskCandidates(candidates,{mode='driving',minCoverage=80,maxDetourRatio=1.25,now=Date.now()}={}){
 const list=Array.isArray(candidates)?candidates:[];
 const evaluated=list.map((candidate,i)=>({
  id:String(candidate?.id??i),label:String(candidate?.label||'경로 '+(i+1)),
  route:candidate?.route,
  profile:evaluateRouteRisk(candidate?.route,{weatherSamples:candidate?.weatherSamples,
   extraHazards:candidate?.extraHazards,mode,now})
 }));
 const report={engine:SAFE_ROUTE_ENGINE_VERSION,mode,compared:evaluated.length,
  recommendation:null,ranking:[],status:'not-comparable',
  reason:'동일 기준으로 확인된 예보와 비교 가능한 경로가 부족합니다.'};
 if(evaluated.length<2)return report;
 const available=evaluated.filter(x=>x.profile.state==='evaluated'&&x.profile.coverage>=minCoverage);
 if(available.length<2)return report;
 const quickest=Math.min(...available.map(x=>x.profile.routeMinutes));
 const within=available.filter(x=>x.profile.routeMinutes<=quickest*maxDetourRatio);
 // Minimize verified signal exposure first within reasonable extra travel,
 // then choose the quicker route. Scores are not safety probabilities.
 within.sort((a,b)=>a.profile.signalIndex-b.profile.signalIndex||
   a.profile.routeMinutes-b.profile.routeMinutes);
 const ranked=within.map(x=>({id:x.id,label:x.label,minutes:x.profile.routeMinutes,
  signalIndex:x.profile.signalIndex,coverage:x.profile.coverage,signalCount:x.profile.signalCount}));
 if(!ranked.length)return report;
 return {...report,status:'conditional-comparison',recommendation:ranked[0],ranking:ranked,
  reason:'비교 가능한 예보 지점 기준 상대적 위험 신호를 먼저 비교했습니다. 안전한 도로가 검증됐다는 의미는 아닙니다.'};
}

export function formatRouteRiskSummary(profile){
 if(!profile||profile.state==='simulation')return '시연용 위험정보 · 실제 위험판정 아님';
 if(profile.state==='unsupported')return '위험분석 보류 · 이동수단별 경로 미지원';
 if(profile.state==='insufficient-data')return '위험분석 보류 · 실제 기상청 경로 예보 미확인 (안전하다는 뜻 아님)';
 const portion='예보 조회 '+profile.coveredSamples+'/'+profile.totalSamples+'지점';
 if(profile.state==='partial')return 'Risk Engine 2.0 · '+portion+' · 일부 자료 미확인 (안전 판정 불가)';
 const risk=profile.signalCount?profile.signalCount+'건의 위험 신호':'조회 지점에 확인된 위험 신호 없음';
 return 'Risk Engine 2.0 · '+portion+' · '+risk+' · 미조회 구간 판단 불가';
}
