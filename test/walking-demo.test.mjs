import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WALK_DEMO,WALK_DEMO_TRIGGER,validateWalkingDemoRoute,makeWalkingDemoScenario,makeWalkingDemoBreakingWarning,walkingDemoSpokenWarning} from '../public/walking-demo.mjs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
function route(){
 const duration=1200;return {
  travelMode:'walking',source:'TMAP Pedestrian',provider:'TMAP',duration,distance:1700,
  departure:'2026-11-10T01:00:00.000Z',
  rainPath:[{...WALK_DEMO.origin,seconds:0},{lat:37.5597,lng:126.974,seconds:560},{...WALK_DEMO.destination,seconds:duration}],
  vertices:[WALK_DEMO.origin,{lat:37.5597,lng:126.974},WALK_DEMO.destination]
 };
}
test('walk demo only accepts provider-backed walking geometry with correct Seoul endpoints',()=>{
 const r=route();assert.equal(validateWalkingDemoRoute(r),true);
 assert.throws(()=>validateWalkingDemoRoute({...r,travelMode:'driving'}),/보행 경로/);
 assert.throws(()=>validateWalkingDemoRoute({...r,rainPath:[{lat:35,lng:129,seconds:0},r.rainPath[2]]}),/보행 경로/);
 assert.throws(()=>validateWalkingDemoRoute({...r,rainPath:[r.rainPath[0],{...r.rainPath[1],seconds:1800},r.rainPath[2]]}),/보행 경로/);
});
test('Seoul Station to City Hall contains rain, slippery sidewalk, and new mid-walk rain event',()=>{
 const r=route(),initial=makeWalkingDemoScenario(r),later=makeWalkingDemoBreakingWarning(r);
 assert.deepEqual(initial.hazards.map(h=>h.id),['walking-rain','walking-slip']);
 assert.ok(initial.hazards[0].seconds<initial.hazards[1].seconds);
 assert.ok(initial.hazards[1].seconds<later.seconds);
 assert.equal(initial.samples.length,2);
 assert.ok([...initial.hazards,later].every(h=>h.demo===true&&h.provider.includes('시연')&&h.lat>37&&h.lng>126));
 assert.equal(later.breaking,true);assert.ok(WALK_DEMO_TRIGGER>51&&WALK_DEMO_TRIGGER<76);
});
test('walking demo alerts identify hypothetical weather and avoid claiming observed ice/flood or verified detour',()=>{
 const r=route(),hazard=makeWalkingDemoBreakingWarning(r);
 assert.match(hazard.description,/실제 기상특보가 아닙니다/);
 assert.match(walkingDemoSpokenWarning(hazard,92),/시연 안내/);
 assert.equal(walkingDemoSpokenWarning({...hazard,demo:false},92),null);
 assert.match(walkingDemoSpokenWarning(makeWalkingDemoScenario(r).hazards[1],100),/미끄럼/);
});
test('walking demo has separate desktop and mobile entries without replacing vehicle demo',()=>{
 for(const id of ['demoWalk','navDemoWalk','demo','navDemoSeoulBusan'])
  assert.equal(ui.split('id="'+id+'"').length-1,1,id);
 assert.match(app,/async function walkingDemoRoute\(\)/);
 assert.match(app,/travelMode:'walking'/);
 assert.match(app,/\$\('navDemoWalk'\)\?\.addEventListener\('click',walkingDemoRoute\)/);
 assert.match(app,/route\.demoWalking\?\(!route\.demoWarningIssued/);
 assert.match(app,/injectWalkingDemoWarning\(\)/);
 assert.match(app,/route\.demoWalking\?'서울시청에 도착/);
 assert.match(css,/sunny-walk-demo-launch/);
});
test('walking demo never invokes the Gumi detour and retains user-visible simulation disclosure',()=>{
 assert.match(app,/if\(route\.demoWalking\)\{[\s\S]*?return;[\s\S]*?const elapsed=route\.duration\*progress\/100/);
 assert.match(app,/walkingDemoSpokenWarning/);
 assert.match(ui,/id="navDemoDisclaimer"[^>]*>/);
 assert.match(app,/실제 관측/);
});
