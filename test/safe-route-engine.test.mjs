import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SAFE_ROUTE_ENGINE_VERSION,evaluateRouteRisk,compareRouteRiskCandidates,formatRouteRiskSummary} from '../public/safe-route-engine.mjs';
const now=Date.parse('2026-11-09T11:00:00Z');
const departure='2026-11-09T12:00:00Z';
const timeline=[
 {lat:37.566,lng:126.978,seconds:0},
 {lat:37.31,lng:127.29,seconds:600},
 {lat:36.85,lng:127.80,seconds:1200},
 {lat:36.12,lng:128.34,seconds:1800}
];
const route=(duration=1800,mode='driving')=>({
 duration,distance:95000,travelMode:mode,departure,
 rainPath:timeline.map(x=>({...x,seconds:x.seconds*duration/1800})),
 samples:[300,900,1500].map(s=>({lat:36.7,lng:127.9,seconds:s*duration/1800,eta:new Date(Date.parse(departure)+s*duration/1800*1000).toISOString()}))
});
const forecast=(sample,amount=10)=>({...sample,status:'forecast',forecast:{
 provider:'kma',precipitationType:amount>0?1:0,rain:amount,
 rainLabel:amount+'mm',time:sample.eta}});
test('v2 does not label an unmeasured route safe',()=>{
 assert.equal(SAFE_ROUTE_ENGINE_VERSION,'risk-v2.0');
 const s=evaluateRouteRisk(route(),{now});
 assert.equal(s.state,'insufficient-data');
 assert.equal(s.coverage,0);
 assert.equal(s.riskLevel,'unknown');
 assert.match(formatRouteRiskSummary(s),/보류/);
 assert.match(s.assurance,/안전 보증/);
});
test('only time-aligned KMA samples contribute to coverage',()=>{
 const r=route(),input=r.samples.map(s=>forecast(s));
 const a=evaluateRouteRisk(r,{weatherSamples:input,now});
 assert.equal(a.coverage,100);
 assert.equal(a.coveredSamples,3);
 assert.equal(a.totalSamples,3);
 assert.equal(a.state,'evaluated');
 assert.equal(a.signalCount,3); // distinct rain episodes separated by ten minutes
 const bad={...input[1],forecast:{...input[1].forecast,time:'2026-11-10T18:00:00Z'}};
 const b=evaluateRouteRisk(r,{weatherSamples:[input[0],bad],now});
 assert.equal(b.coveredSamples,1);
 assert.equal(b.state,'partial');
 assert.match(formatRouteRiskSummary(b),/일부 자료 미확인/);
});
test('unsupported and synthetic routes cannot be assessed as actual risk',()=>{
 assert.equal(evaluateRouteRisk({...route(),demo:true},{weatherSamples:[]}).state,'simulation');
 assert.equal(evaluateRouteRisk(route(),{mode:'boat'}).state,'unsupported');
 assert.equal(evaluateRouteRisk(route(),{mode:'walking'}).state,'unsupported');
 assert.equal(evaluateRouteRisk(route(1800,'walking'),{mode:'walking',weatherSamples:[]}).state,'insufficient-data');
 assert.equal(evaluateRouteRisk({duration:0,rainPath:[]}).state,'insufficient-data');
});
test('real rain is only a weather forecast signal; flooding and icing are not inferred',()=>{
 const r=route(),samples=r.samples.map((s,i)=>forecast(s,i===1?42:0));
 const a=evaluateRouteRisk(r,{weatherSamples:samples,now});
 assert.equal(a.state,'evaluated');
 assert.equal(a.signalCount,1);
 assert.equal(a.riskLevel,'caution');
 assert.equal(a.signals[0].kind,'rain');
 assert.match(a.signals[0].assessment.caution,/침수/);
 assert.doesNotMatch(a.signals[0].assessment.label,/도로 침수|도로 결빙/);
});
test('extra provider hazards require validated source, timestamps and location',()=>{
 const r=route(),weatherSamples=r.samples.map(s=>forecast(s,0));
 const official={kind:'ice',lat:36.7,lng:127.9,seconds:1150,
  eta:r.samples[1].eta,validTime:'2026-11-09T10:57:00Z',
  provider:'기상청 도로위험기상',roadRisk:3};
 const a=evaluateRouteRisk(r,{weatherSamples,extraHazards:[official,{...official,lat:null}],now});
 assert.equal(a.state,'evaluated');
 assert.equal(a.signalCount,1);
 assert.equal(a.unknownSignals,1);
 assert.equal(a.riskLevel,'high');
 const walking=evaluateRouteRisk(route(1800,'walking'),{weatherSamples,extraHazards:[official],mode:'walking',now});
 assert.equal(walking.state,'evaluated');
 assert.equal(walking.signalCount,0);
});
test('a reported station warning is advisory, not verified road intersection',()=>{
 const r=route(),weatherSamples=r.samples.map(s=>forecast(s,0));
 const warning={kind:'warning',lat:36.7,lng:127.9,seconds:950,
  eta:r.samples[1].eta,validTime:r.samples[1].eta,
  provider:'기상청 특보현황 · 경로 500m 이내 관측지점 기준'};
 const a=evaluateRouteRisk(r,{weatherSamples,extraHazards:[warning],now});
 assert.equal(a.riskLevel,'caution');
 assert.match(a.signals[0].assessment.caution,/교차|경계/);
});
test('candidate recommendation abstains unless two routes have comparable evidence',()=>{
 const r=route(),samples=r.samples.map(s=>forecast(s,0));
 const a=compareRouteRiskCandidates([{id:'a',route:r,weatherSamples:samples}],{now});
 assert.equal(a.status,'not-comparable');
 const b=compareRouteRiskCandidates([{id:'a',route:r,weatherSamples:samples},
  {id:'b',route:route(1900),weatherSamples:[]}],{now});
 assert.equal(b.status,'not-comparable');
 assert.equal(b.recommendation,null);
});
test('candidate comparison prefers lower risk within reasonable travel cost; avoids extreme detours',()=>{
 const fast=route(1800),lowRisk=route(2040),tooFar=route(3000);
 const rain=fast.samples.map((s,i)=>forecast(s,i===0?38:0));
 const fine=lowRisk.samples.map(s=>forecast(s,0));
 const slower=tooFar.samples.map(s=>forecast(s,0));
 const ranked=compareRouteRiskCandidates([
  {id:'fast',label:'빠르지만 비',route:fast,weatherSamples:rain},
  {id:'candidate',label:'강수 예보 신호 적음',route:lowRisk,weatherSamples:fine},
  {id:'huge',label:'불필요하게 긴 우회',route:tooFar,weatherSamples:slower}
 ],{now});
 assert.equal(ranked.status,'conditional-comparison');
 assert.equal(ranked.recommendation.id,'candidate');
 assert.equal(ranked.ranking.length,2);
 assert.match(ranked.reason,/안전한 도로가 검증/);
});
