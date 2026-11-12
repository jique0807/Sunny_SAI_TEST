import test from 'node:test';import assert from 'node:assert/strict';
import {validatePedestrianCandidates,assessPedestrianWeather,comparePedestrianCandidates} from '../lib/pedestrian-risk.mjs';
const p=(lat,lng)=>({lat,lng});
test('rejects unsafe geometry, excess vertices and unbounded candidate input',()=>{
 assert.throws(()=>validatePedestrianCandidates([{points:[p(0,0),p(37,127)],durationSeconds:100,distanceMeters:100}]),RangeError);
 assert.throws(()=>validatePedestrianCandidates([{points:Array(13).fill(p(37,127)),durationSeconds:100,distanceMeters:100}]),RangeError);
});
test('does not infer floods or ice from rain alone',()=>{
 const a=assessPedestrianWeather([{lat:37.5,lng:127,eta:'2026-11-10T00:00:00Z',status:'forecast',forecast:{provider:'kma',precipitationType:1,rain:1,temperature:10}}]);
 assert.equal(a.score,1);assert.equal(a.events[0].observedHazard,false);assert.match(a.reason,/실제 침수/);
});
test('unknown weather stays unknown, not safe',()=>{assert.equal(assessPedestrianWeather([]).level,'unknown');assert.equal(assessPedestrianWeather([{status:'forecast',forecast:{provider:'unknown',rain:40}}]).score,null);});
test('cold rain raises caution without claiming observed black ice',()=>{const a=assessPedestrianWeather([{lat:37,lng:127,status:'forecast',forecast:{provider:'kma',precipitationType:1,temperature:-1}}]);assert.equal(a.score,3);assert.equal(a.events[0].observedHazard,false);});
test('selection avoids unknown candidates and prefers lower risk',()=>{const v=comparePedestrianCandidates([{id:'a',durationSeconds:200,assessment:{score:2}},{id:'b',durationSeconds:300,assessment:{score:0}},{id:'c',durationSeconds:100,assessment:{score:null}}]);assert.equal(v.recommendedId,'b');});
