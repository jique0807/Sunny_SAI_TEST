import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEMO_SEOUL_BUSAN,DEMO_SCENES,DEMO_BREAKING_TRIGGER,DEMO_BREAKING_POSITION,demoPointAtSeconds,makeDemoScenario,makeDemoBreakingWarning,shouldTriggerDemoBreakingWarning} from '../public/demo-scenario.mjs';
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

test('no newly issued warning is present before the surprise mid-drive trigger',()=>{
 const x=makeDemoScenario(route);
 assert.equal(x.hazards.some(h=>h.breaking),false);
 assert.equal(x.hazards.length,5);
 assert.equal(DEMO_BREAKING_TRIGGER,0.42);
 assert.equal(DEMO_BREAKING_POSITION,0.68);
 assert.equal(shouldTriggerDemoBreakingWarning(40,41,false),false);
 assert.equal(shouldTriggerDemoBreakingWarning(41,42,false),true);
 assert.equal(shouldTriggerDemoBreakingWarning(35,75,false),true);
 assert.equal(shouldTriggerDemoBreakingWarning(41,42,true),false);
 assert.equal(shouldTriggerDemoBreakingWarning(43,44,false),false);
});

test('fictional warning adds one NEW geolocated point 26 percent ahead, never a KMA claim',()=>{
 const scenario=makeDemoScenario(route);
 const warning=makeDemoBreakingWarning(route,'2026-11-09T02:15:00.000Z');
 assert.equal(warning.id,'breaking-warning');
 assert.equal(warning.kind,'warning');
 assert.ok(warning.breaking&&warning.demo);
 assert.equal(warning.seconds,Math.round(route.duration*.68));
 assert.equal(warning.issuedAt,'2026-11-09T02:15:00.000Z');
 assert.match(warning.measure,/가상.*실제 기상청 특보 아님/);
 assert.match(warning.provider,/가상/);
 assert.ok(Number.isFinite(warning.lat)&&Number.isFinite(warning.lng));
 assert.ok(!scenario.hazards.some(h=>h.id===warning.id));
 assert.ok(warning.seconds>Math.round(route.duration*.42));
 assert.ok(hazardDetails(warning).join(' ').includes('실제 관측·특보 아님'));
 assert.throws(()=>makeDemoBreakingWarning({...route,rainPath:[]}),/가상 특보/);
});

test('manual or automatic new warning appears in route and driver UI but never in real path',()=>{
 const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
 const drive=readFileSync(new URL('../public/drive-guidance.mjs',import.meta.url),'utf8');
 assert.match(ui,/id="sunnyDemoBreaking"/);
 assert.match(app,/function injectDemoBreakingWarning\(\)/);
 assert.match(app,/shouldTriggerDemoBreakingWarning\(previous,progress,!!route\.demoBreakingWarning\)/);
 assert.match(app,/route\.demoHazards=\[\.\.\.route\.demoHazards,hazard\]/);
 assert.match(app,/drawDemoOverlays\(\);moveCar\(\)/);
 assert.match(app,/sunnyDemoBreaking'\)\?\.addEventListener\('click'/);
 assert.match(app,/function resetDemoBreakingWarning\(\)/);
 assert.match(drive,/const breaking=upcoming\.find\(h=>h\.breaking\)/);
 assert.match(drive,/sunny-drive-alert-urgent/);
 assert.match(app,/\[가상 긴급상황\]/);
});
