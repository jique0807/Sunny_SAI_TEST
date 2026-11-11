import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDrivingRisk,evaluateWalkingRisk,compareRouteRiskCandidates} from '../public/safe-route-engine.mjs';
import {normalizeItsEvents,normalizeItsTraffic} from '../lib/its-traffic.mjs';

const departure='2026-11-11T00:00:00Z',now=Date.parse(departure);
const route=mode=>({travelMode:mode,departure,distance:8000,duration:1200,
 rainPath:[{lat:37.566,lng:126.978,seconds:0},{lat:37.575,lng:126.989,seconds:1200}],
 samples:[{lat:37.57,lng:126.983,seconds:600,eta:'2026-11-11T00:10:00Z'}]});
const forecast=(r)=>({...r.samples[0],status:'forecast',forecast:{provider:'kma',
 time:r.samples[0].eta,rain:30,precipitationType:1}});

test('actual route-risk entrypoints use two independent exposure algorithms',()=>{
 const car=route('driving'),walk=route('walking');
 const a=evaluateDrivingRisk(car,{weatherSamples:[forecast(car)],now});
 const b=evaluateWalkingRisk(walk,{weatherSamples:[forecast(walk)],now});
 assert.equal(a.modePolicy,'driving-exposure-v1');
 assert.equal(b.modePolicy,'walking-exposure-v1');
 assert.equal(a.riskSystem,'driving');
 assert.equal(b.riskSystem,'walking');
 assert.equal(a.coverage,100);
 assert.equal(b.coverage,100);
 assert.notEqual(a.signalIndex,b.signalIndex);
});
test('official ITS lowercase nested envelopes and event codes work end to end',()=>{
 const event={response:{header:{resultcode:0,resultmsg:'SUCCESS'},
  body:{totalcount:1,items:{item:{coordx:'126.978',coordy:'37.566',eventType:'acc',
   message:'Traffic report',startDate:'20261111085500'}}}}};
 const parsed=normalizeItsEvents(event,{now:Date.parse('2026-11-11T01:00:00Z')});
 assert.equal(parsed.status,'received');
 assert.equal(parsed.items.length,1);
 assert.equal(parsed.items[0].type,'accident');
 const traffic={response:{header:{resultcode:0},body:{totalcount:1,
  items:{item:{linkid:'123',speed:'22'}}}}};
 assert.equal(normalizeItsTraffic(traffic,{now}).status,'received');
 const rejected=normalizeItsEvents({response:{header:{resultcode:'4005'},body:{totalcount:0}}},{now});
 assert.equal(rejected.status,'failed');
 assert.equal(rejected.reasonCode,'provider_rejected');
});

test('walking geometry is explicitly rejected by driving risk decision',()=>{
 const walking=route('walking');
 const result=evaluateDrivingRisk(walking,{weatherSamples:[forecast(walking)],now});
 assert.equal(result.state,'unsupported');
 assert.equal(result.riskLevel,'unknown');
});

// Controlled inputs verify policy behavior; these are not live provider observations.
test('driving and walking rank rain versus heat differently through route comparison',()=>{
 const compare=mode=>{
  const r=route(mode),wet=forecast(r);
  const hot={...wet,forecast:{provider:'kma',time:r.samples[0].eta,
   rain:0,precipitationType:0,temperature:35}};
  return compareRouteRiskCandidates([
   {id:'rain',route:r,weatherSamples:[wet]},
   {id:'heat',route:r,weatherSamples:[hot]}
  ],{mode,now});
 };
 const driving=compare('driving'),walking=compare('walking');
 assert.equal(driving.status,'conditional-comparison');
 assert.equal(walking.status,'conditional-comparison');
 assert.equal(driving.recommendation.id,'heat');
 assert.equal(walking.recommendation.id,'rain');
});

test('neither policy compares candidates with missing or time-mismatched forecasts',()=>{
 for(const mode of ['driving','walking']){
  const r=route(mode),valid=forecast(r);
  for(const samples of [[],[{...valid,forecast:{...valid.forecast,time:'2026-11-10T00:00:00Z'}}]]){
   const result=compareRouteRiskCandidates([
    {id:'verified',route:r,weatherSamples:[valid]},
    {id:'unverified',route:r,weatherSamples:samples}
   ],{mode,now});
   assert.equal(result.status,'not-comparable');
   assert.equal(result.recommendation,null);
  }
 }
});
