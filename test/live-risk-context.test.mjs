import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ahead,RainGate} from '../public/rain-monitor.mjs';
import {buildLiveRiskContext as context,remainingRiskHazards} from '../public/live-risk-context.mjs';
import {evaluateDrivingRisk,evaluateWalkingRisk,formatRouteRiskSummary} from '../public/safe-route-engine.mjs';
const now=Date.parse('2026-11-11T00:00:00Z');
const makeRoute=mode=>({travelMode:mode,distance:10000,duration:1800,
 departure:new Date(now-600000).toISOString(),rainPath:[{lat:37.56,lng:126.97,seconds:0},
 {lat:37.56,lng:127,seconds:1800}]});
const received=(samples,rain=0)=>samples.map(s=>({...s,status:'forecast',forecast:{
 provider:'kma',product:'초단기예보',time:s.eta,rain,precipitationType:rain?1:0}}));
function fixture(mode='driving'){
 const route=makeRoute(mode),requestSamples=ahead(route.rainPath,600,now);
 route.samples=ahead(route.rainPath,0,now-600000);
 const weather={samples:received(route.samples,30)};
 const aheadWeather={routeRef:route,requestSamples,samples:received(requestSamples),fetchedAt:new Date(now).toISOString()};
 return {route,weather,aheadWeather,active:true,progress:600,now};
}
test('updated forward forecast replaces departure rain for both driving and walking evaluation',()=>{
 for(const mode of ['driving','walking']){
  const f=fixture(mode),c=context(f.route,f),evaluate=mode==='walking'?evaluateWalkingRisk:evaluateDrivingRisk;
  const old=evaluate(f.route,{weatherSamples:f.weather.samples,now});
  const fresh={...evaluate(c.route,{weatherSamples:c.weatherSamples,now}),assessmentScope:c.scope};
  assert.ok(old.signalIndex>0);assert.equal(fresh.signalIndex,0);
  assert.equal(fresh.coverage,100);assert.equal(fresh.state,'evaluated');
  assert.match(formatRouteRiskSummary(fresh),/앞 구간 예보 조회/);
 }
});
test('passed query points and past road hazards are excluded and future ETAs follow live progress',()=>{
 const f=fixture(),c=context(f.route,{...f,progress:650});
 assert.ok(c.weatherSamples.every(s=>s.seconds>=650));
 const hazards=remainingRiskHazards(c,[{seconds:600},{seconds:900}]);
 assert.equal(hazards.length,1);assert.equal(hazards[0].eta,new Date(now+250000).toISOString());
});
test('stale and other-route snapshots never fall back to the old departure forecast',()=>{
 for(const change of [{fetchedAt:new Date(now-180001).toISOString()},{routeRef:makeRoute('driving')}]){
  const f=fixture(),c=context(f.route,{...f,aheadWeather:{...f.aheadWeather,...change}});
  assert.equal(c.weatherSamples.length,0);
  const profile=evaluateDrivingRisk(c.route,{weatherSamples:c.weatherSamples,now});
  assert.equal(profile.state,'insufficient-data');assert.equal(profile.riskLevel,'unknown');
 }
});
test('response coordinates and ETA must correspond to the outbound route query',()=>{
 const f=fixture();f.aheadWeather.samples[0].lat=35;
 f.aheadWeather.samples[1].eta=new Date(now+100000).toISOString();
 f.aheadWeather.samples[2].forecast.time='2025-01-01T00:00:00Z';
 const c=context(f.route,f);
 assert.equal(c.weatherSamples.filter(s=>s.status==='forecast').length,f.aheadWeather.samples.length-3);
 assert.ok(evaluateDrivingRisk(c.route,{weatherSamples:c.weatherSamples,now}).coverage<100);
});
test('a malformed outbound coordinate cannot claim verified coverage of a real route',()=>{
 const f=fixture();f.aheadWeather.requestSamples=f.aheadWeather.requestSamples.map(s=>({...s,lat:35}));
 const c=context(f.route,f);assert.equal(c.route.samples.length,0);
 assert.equal(evaluateDrivingRisk(c.route,{weatherSamples:c.weatherSamples,now}).state,'insufficient-data');
});
test('preview evaluation retains its original route sample scope',()=>{
 const f=fixture(),c=context(f.route,{...f,active:false});
 assert.equal(c.route,f.route);assert.equal(c.weatherSamples,f.weather.samples);
 assert.equal(c.scope,'route-samples');
});

test('missing live samples cannot reset a wet voice episode as if every point were dry',()=>{
 const f=fixture();f.aheadWeather.samples[0].status='unavailable';
 const c=context(f.route,f),gate=new RainGate();gate.level=2;
 assert.ok(c.weatherSamples.some(s=>s.status==='unavailable'));
 assert.equal(gate.take(c.weatherSamples,now),null);
 assert.equal(gate.level,2);
});
