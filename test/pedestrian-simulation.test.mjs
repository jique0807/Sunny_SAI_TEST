import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessPedestrianWeather,comparePedestrianCandidates} from '../lib/pedestrian-risk.mjs';
import {parsePedestrianRoute} from '../lib/pedestrian-route.mjs';
const p=(lat,lng,forecast)=>({lat,lng,eta:'2026-11-10T04:00:00Z',status:forecast?'forecast':'unavailable',forecast:forecast?{provider:'kma',...forecast}:null});
const route=(coordinates,facilities=[])=>({type:'FeatureCollection',features:[
 {type:'Feature',properties:{pointType:'SP',totalTime:1500,totalDistance:1600,description:'출발'},geometry:{type:'Point',coordinates:coordinates[0]}},
 ...facilities,
 {type:'Feature',properties:{facilityType:0},geometry:{type:'LineString',coordinates}}
]});
const f=(code,coords)=>({type:'Feature',properties:{facilityType:code},geometry:{type:'LineString',coordinates:coords}});
const a=readFileSync(new URL('../app/walk/page.tsx',import.meta.url),'utf8');
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
test('Scenario 1: dense vertex clustering still samples by distance',()=>{
 const coordinates=[[127,37]];
 for(let i=1;i<60;i++)coordinates.push([127+i/600000,37]);
 coordinates.push([127.008,37],[127.016,37]);
 const x=parsePedestrianRoute(route(coordinates));
 assert.ok(x.points.length>=3);
 const middle=x.points[Math.floor(x.points.length/2)].lng;
 assert.ok(middle>127.004&&middle<127.013,'middle should be near route midpoint not clustered starting vertices');
});
test('Scenario 2: TMAP supplies facility locations, not flood alerts',()=>{
 const x=parsePedestrianRoute(route([[127,37],[127.01,37]],[
 f(15,[[127.001,37],[127.002,37]]),
 f(14,[[127.004,37],[127.005,37]]),
 f(11,[[127.006,37],[127.007,37]])
 ]));
 assert.ok(x.facilities.some(v=>v.kind==='횡단보도'));
 assert.ok(x.facilities.some(v=>v.kind==='지하보도'));
 assert.ok(x.facilities.some(v=>v.kind==='일반 보행자도로'));
 assert.ok(x.facilities.every(v=>v.status==='location_only'));
});
test('Scenario 3: TMAP guide point crosswalk and underpass classifiers',()=>{
 const x=parsePedestrianRoute({features:[
 {geometry:{type:'Point',coordinates:[127,37]},properties:{totalDistance:1000,totalTime:1000,turnType:211}},
 {geometry:{type:'LineString',coordinates:[[127,37],[127.01,37]]},properties:{}},
 {geometry:{type:'Point',coordinates:[127.005,37]},properties:{turnType:126}}
 ]});
 assert.deepEqual(new Set(x.facilities.map(v=>v.kind)),new Set(['횡단보도','지하보도']));
});
test('Scenario 4: complete dry forecast is low weather-specific caution',()=>{
 const weather=Array.from({length:6},(_,i)=>p(37,127+i/1000,{rain:0,precipitationType:0,temperature:16}));
 const x=assessPedestrianWeather(weather);
 assert.equal(x.level,'low');assert.equal(x.coverage,1);assert.equal(x.events.length,0);
});
test('Scenario 5: cold rain flags inferred icing possibility, not measured ice',()=>{
 const weather=Array.from({length:6},(_,i)=>p(37,127+i/1000,{rain:3,precipitationType:1,temperature:-2}));
 const x=assessPedestrianWeather(weather);
 assert.equal(x.level,'high');assert.ok(x.events.every(v=>v.observedHazard===false));assert.match(x.events[0].reason,/가능성/);
});
test('Scenario 6: partial forecast cannot make a safety claim',()=>{
 const weather=Array.from({length:12},(_,i)=>i<3?p(37,127+i/1000,{precipitationType:0,temperature:20}):p(37,127+i/1000,null));
 const x=assessPedestrianWeather(weather);
 assert.equal(x.level,'incomplete');assert.equal(x.score,null);assert.equal(x.coverage,0.25);
});
test('Scenario 7: partial data still preserves positive risk warnings',()=>{
 const weather=Array.from({length:12},(_,i)=>i===0?p(37,127,{precipitationType:3,temperature:-1}):p(37,127+i/1000,null));
 const x=assessPedestrianWeather(weather);
 assert.equal(x.score,null);assert.equal(x.events.length,1);assert.equal(x.events[0].level,3);
});
test('Scenario 8: a route with missing forecast never wins comparison',()=>{
 const r=comparePedestrianCandidates([{id:'short',durationSeconds:100,assessment:{score:null}},{id:'long',durationSeconds:180,assessment:{score:1}}]);
 assert.equal(r.recommendedId,'long');
});
test('Scenario 9: no observed safe alternative means no recommendation',()=>{
 const r=comparePedestrianCandidates([{id:'a',durationSeconds:100,assessment:{score:null}}]);
 assert.equal(r.recommendedId,null);
});
test('Scenario 10: GPS refusal has a manual origin/destination option',()=>{
 assert.match(a,/value="origin">출발지 검색/);
 assert.match(a,/setOrigin\(p\)/);
 assert.match(a,/setDestination\(p\)/);
});
test('Scenario 11: visible mobile navigation contains walking link',()=>{
 assert.match(ui,/nav-sheet-head[\s\S]*?href="\/walk"/);
});
test('Scenario 12: UI never labels inferred facility as measured flood or closure',()=>{
 assert.match(a,/시설물 위치 및 침수·결빙 현장 관측은 미연결/);
 assert.match(a,/TMAP 제공 경로 시설 정보/);
});

test('Scenario 13: temperature-only forecast cannot imply no precipitation',()=>{
 const weather=Array.from({length:6},(_,i)=>p(37,127+i/1000,{temperature:16,windSpeed:3}));
 const x=assessPedestrianWeather(weather);
 assert.equal(x.level,'unknown');assert.equal(x.score,null);assert.equal(x.coverage,0);
});
test('Scenario 14: incomplete route comparison does not falsely recommend faster unknown path',()=>{
 const known=assessPedestrianWeather(Array.from({length:6},(_,i)=>p(37,127+i/1000,{rain:2,precipitationType:1,temperature:10})));
 const missing=assessPedestrianWeather(Array.from({length:6},(_,i)=>i===0?p(37,127,{rain:0,precipitationType:0,temperature:10}):p(37,127,null)));
 assert.equal(comparePedestrianCandidates([{id:'fast',durationSeconds:300,assessment:missing},{id:'checked',durationSeconds:440,assessment:known}]).recommendedId,'checked');
});
