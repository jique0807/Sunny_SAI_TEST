import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEMO_SEOUL_BUSAN,DEMO_SCENES,demoPointAtSeconds,makeDemoScenario} from '../public/demo-scenario.mjs';
import {buildRouteHazards,hazardDetails} from '../public/route-hazards.mjs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');

const route={duration:18000,departure:'2026-11-09T01:00:00.000Z',
 rainPath:[{lat:37.56,lng:126.98,seconds:0,label:'출발'},
 {lat:36.5,lng:127.4,seconds:4500,label:'고속도로'},
 {lat:35.7,lng:128.3,seconds:11000,label:'중간 구간'},
 {lat:35.18,lng:129.08,seconds:18000,label:'도착'}]};
test('real Seoul and Busan city hall endpoints are predefined and not user GPS',()=>{
 assert.equal(DEMO_SEOUL_BUSAN.origin.name,'서울시청');
 assert.equal(DEMO_SEOUL_BUSAN.destination.name,'부산시청');
 assert.ok(DEMO_SEOUL_BUSAN.origin.lat>37&&DEMO_SEOUL_BUSAN.destination.lat<36);
});
test('five clearly fictional hazard markers follow route time and stay independent of real KMA forecasts',()=>{
 const x=makeDemoScenario(route);
 assert.deepEqual(x.hazards.map(h=>h.kind),['rain','fog','ice','flood','rain']);
 assert.equal(x.hazards.length,DEMO_SCENES.length);
 assert.ok(x.hazards.every(h=>h.demo&&/가상/.test(h.provider)&&Number.isFinite(h.lat)&&Number.isFinite(h.lng)));
 assert.ok(x.hazards.every((h,i)=>i===0||h.seconds>x.hazards[i-1].seconds));
 assert.ok(x.samples.every(s=>s.status==='demo'&&s.forecast===null));
 assert.deepEqual(buildRouteHazards(x.samples),[]);
 assert.ok(hazardDetails(x.hazards[3]).join(' ').includes('실제 관측·특보 아님'));
});
test('event locations interpolate through Kakao route timestamps',()=>{
 const p=demoPointAtSeconds(route.rainPath,9000);
 assert.ok(p.lat>35.7&&p.lat<36.5);
 assert.ok(p.lng>127.4&&p.lng<128.3);
 assert.equal(demoPointAtSeconds([],100),null);
 assert.throws(()=>makeDemoScenario({...route,rainPath:[]}),/시연 경로/);
});
test('demo route and five markers are wired into navigation rail, map, and simulated playback',()=>{
 assert.match(ui,/id="navDemoSeoulBusan"/);
 assert.match(ui,/id="navDemoDisclaimer"/);
 assert.match(ui,/id="sunnyDemoNext"/);
 assert.match(ui,/id="sunnyDemoPause"/);
 assert.match(app,/makeDemoScenario\(route\)/);
 assert.match(app,/route\.demoHazards/);
 assert.match(app,/startDemoGuidance\(\)/);
 assert.match(app,/function drawDemoOverlays\(\)/);
 assert.match(app,/function advance\(value/);
});
