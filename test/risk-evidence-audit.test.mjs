import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDrivingRisk,evaluateWalkingRisk} from '../public/safe-route-engine.mjs';
import {summarizeRiskSourceEligibility} from '../public/risk-source-eligibility.mjs';

const departure='2026-11-11T05:00:00Z';
const now=Date.parse(departure)+60000;
const endpoints=[{lat:37.566,lng:126.978,seconds:0},{lat:37.546,lng:127.018,seconds:900}];
const at=t=>({lat:endpoints[0].lat+(endpoints[1].lat-endpoints[0].lat)*t,
 lng:endpoints[0].lng+(endpoints[1].lng-endpoints[0].lng)*t,seconds:900*t});
const route=mode=>({travelMode:mode,departure,duration:900,distance:4500,rainPath:endpoints,
 samples:[{...at(.5),eta:new Date(Date.parse(departure)+450000).toISOString()}]});
const dry=r=>[{...r.samples[0],status:'forecast',forecast:{provider:'kma',
 precipitationType:0,rain:0,time:r.samples[0].eta}}];
const record=(t,id)=>({...at(t),id:'road-weather:'+id+':fog',stationId:id,
 kind:'observed-road-fog',provider:'기상청 CCTV 도로날씨',grade:2,
 distanceToPath:0,validTime:new Date(now-120000).toISOString(),
 eta:new Date(Date.parse(departure)+900000*t).toISOString()});

for(const [mode,evaluate] of [['driving',evaluateDrivingRisk],['walking',evaluateWalkingRisk]]){
 test(mode+': duplicate input is counted once, distinct nearby-time stations both survive',()=>{
  const r=route(mode),first=record(.2,'A'),second=record(.3,'B');
  const profile=evaluate(r,{weatherSamples:dry(r),extraHazards:[first,{...first},second],now});
  assert.equal(profile.state,'evaluated');
  assert.equal(profile.coverage,100);
  assert.equal(profile.signalCount,2);
  assert.deepEqual(profile.signals.map(x=>x.stationId),['A','B']);
 });
 test(mode+': missing, stale and off-route observations do not create risk',()=>{
  const r=route(mode),fresh=record(.2,'A');
  const stale={...record(.3,'B'),validTime:new Date(now-31*60000).toISOString()};
  const offroute={...record(.4,'C'),lat:39.5,lng:129.5};
  const profile=evaluate(r,{weatherSamples:dry(r),extraHazards:[fresh,stale,offroute],now});
  assert.equal(profile.signalCount,1);
  assert.equal(profile.unknownSignals,2);
  assert.equal(evaluate(r,{weatherSamples:[],extraHazards:[],now}).state,'insufficient-data');
 });
 test(mode+': satellite and CCTV reception state stays distinct from matched evidence',()=>{
  const r={...route(mode),satelliteEvidenceStatus:'received',observationsEvidenceStatus:'failed'};
  const profile=evaluate(r,{weatherSamples:dry(r),extraHazards:[{
   ...at(.2),kind:'satellite-rain',value:30,
   provider:'기상청 GK2A 수치 산출물',metadataVerified:true,qualityVerified:true,
   navigationVerified:true,validTime:new Date(now-60000).toISOString(),
   eta:new Date(Date.parse(departure)+180000).toISOString()
  }],now});
  const audit=summarizeRiskSourceEligibility({route:r,profile});
  const satellite=audit.sources.find(s=>s.id==='satellite');
  const observations=audit.sources.find(s=>s.id==='observations');
  assert.equal(satellite.reception,'received');
  assert.equal(satellite.evaluation,'fresh-validated-satellite-pixel');
  assert.equal(satellite.acceptedSignals,1);
  assert.equal(observations.reception,'failed');
  assert.equal(observations.evaluation,'not-available');
  assert.equal(observations.acceptedSignals,0);
  assert.equal(audit.automaticRerouteAuthorized,false);
  assert.equal(audit.safeRouteCertified,false);
 });
}
