import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WALK_DEMO,WALK_DEMO_TRIGGER,WALK_DEMO_SHELTER,validateWalkingDemoRoute,makeWalkingDemoScenario,makeWalkingDemoBreakingWarning,walkingDemoSpokenWarning,walkingDemoAheadMeters} from '../public/walking-demo.mjs';
import {demoPointAtSeconds} from '../public/demo-scenario.mjs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
const route=()=>({provider:'TMAP',travelMode:'walking',mode:'walking',duration:1600,distance:2100,departure:'2026-11-10T01:00:00Z',
 vertices:[WALK_DEMO.origin,{lat:37.56,lng:126.974},WALK_DEMO.destination],
 rainPath:[{...WALK_DEMO.origin,seconds:0},{lat:37.56,lng:126.974,seconds:700},{...WALK_DEMO.destination,seconds:1600}]});
test('walking demo requires genuine TMAP geometry; never fall back to virtual or car paths',()=>{
 const r=route();assert.equal(validateWalkingDemoRoute(r),true);
 assert.throws(()=>validateWalkingDemoRoute({...r,provider:'Sunny SAI virtual'}),/TMAP/);
 assert.throws(()=>validateWalkingDemoRoute({...r,travelMode:'driving'}),/TMAP/);
 assert.throws(()=>validateWalkingDemoRoute({...r,rainPath:[{lat:35,lng:129,seconds:0},r.rainPath.at(-1)]}),/TMAP/);
});
test('fictional pedestrian hazards attach to provider geometry in travel order',()=>{
 const r=route(),scenario=makeWalkingDemoScenario(r),heat=makeWalkingDemoBreakingWarning(r);
 assert.deepEqual(scenario.hazards.map(h=>h.id),['walking-slip','walking-hotspot']);
 assert.ok(scenario.hazards[0].seconds<scenario.hazards[1].seconds&&scenario.hazards[1].seconds<heat.seconds);
 assert.ok(scenario.hazards.every(h=>h.demo&&Number.isFinite(h.lat)&&Number.isFinite(h.lng)));
 assert.ok(WALK_DEMO_TRIGGER>51&&WALK_DEMO_TRIGGER<76);
 assert.ok(walkingDemoAheadMeters(r,WALK_DEMO_TRIGGER,heat)>0);
});
test('walking voice prompts describe hazards without a demo narration prefix',()=>{
 const r=route(),h=makeWalkingDemoScenario(r).hazards;
 assert.match(walkingDemoSpokenWarning(h[0],100),/미끄럼/);
 assert.match(walkingDemoSpokenWarning(h[1],100),/보행자 사고/);
 assert.match(walkingDemoSpokenWarning(makeWalkingDemoBreakingWarning(r),100),/무더위쉼터/);
 assert.doesNotMatch(walkingDemoSpokenWarning(h[0],100),/시연/);
});
test('walking presentation and shelter use real TMAP routing from event-time position',()=>{
 const start=app.indexOf('async function walkingDemoRoute(){'),end=app.indexOf("$('demoWalk')?.addEventListener",start);
 assert.ok(start>0&&end>start);
 const first=app.slice(start,end);
 assert.match(first,/await api\('\/api\/route',\{origin:start,destination:end,departure:new Date\(\)\.toISOString\(\),travelMode:'walking'/);
 assert.match(first,/d\.provider!=='TMAP'/);
 assert.doesNotMatch(app,/makeVirtualWalkingDemoRoute\(|makeVirtualShelterRoute\(/);
 const a=app.indexOf('async function chooseWalkingShelterYes(trip){'),b=app.indexOf('function injectWalkingDemoWarning(){',a);
 assert.ok(a>0&&b>a);
 const next=app.slice(a,b);
 assert.match(next,/demoPointAtSeconds\(trip\.rainPath,trip\.duration\*progress\/100\)/);
 assert.match(next,/await api\('\/api\/route',\{origin:\{\.\.\.current,name:'현재 보행 위치'\},destination:shelter/);
 assert.match(next,/travelMode:'walking'/);
 assert.match(next,/next\.provider!=='TMAP'/);
 assert.match(next,/route=changed/);
 assert.match(next,/쉼터까지 실제 TMAP 도보 경로를 확인하지 못해 이동 시연을 정지/);
 assert.ok(demoPointAtSeconds(route().rainPath,route().duration*.69).lat>37.55);
 assert.match(WALK_DEMO_SHELTER.name,/실제 시설 미확인/);
});
test('UI demo buttons, heat popup and automatic yes selection are connected',()=>{
 for(const id of ['demoWalk','navDemoWalk','demo','navDemoSeoulBusan','sunnyWalkHeatPopup','sunnyWalkHeatYes','sunnyWalkHeatNo'])
  assert.equal(ui.split('id="'+id+'"').length-1,1,id);
 assert.match(css,/sunny-walk-demo-launch/);
 assert.match(app,/\$\('navDemoWalk'\)\?\.addEventListener\('click',walkingDemoRoute\)/);
 assert.match(app,/walkHeatAutoTimer=setTimeout/);
 assert.match(app,/\$\('sunnyWalkHeatYes'\)\.click\(\)/);
 assert.match(ui,/id="navDemoDisclaimer"[^>]*>/);
});
