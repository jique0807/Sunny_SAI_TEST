import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 WALK_DEMO,WALK_DEMO_TRIGGER,WALK_DEMO_SHELTER,
 makeVirtualWalkingDemoRoute,makeVirtualShelterRoute,validateWalkingDemoRoute,
 makeWalkingDemoScenario,makeWalkingDemoBreakingWarning,walkingDemoSpokenWarning
} from '../public/walking-demo.mjs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');

test('Seoul walking presentation needs no provider or GPS and has valid synthetic geometry',()=>{
 const r=makeVirtualWalkingDemoRoute(Date.parse('2026-11-10T01:00:00Z'));
 assert.equal(r.travelMode,'walking');
 assert.equal(r.demo,true);assert.match(r.provider,/virtual/i);
 assert.ok(r.distance>1000&&r.duration>60);
 assert.equal(validateWalkingDemoRoute(r),true);
 assert.deepEqual([r.rainPath[0].lat,r.rainPath[0].lng],[WALK_DEMO.origin.lat,WALK_DEMO.origin.lng]);
 assert.deepEqual([r.rainPath.at(-1).lat,r.rainPath.at(-1).lng],[WALK_DEMO.destination.lat,WALK_DEMO.destination.lng]);
 assert.ok(r.rainPath.every((p,i)=>p.seconds>=0&&(!i||p.seconds>=r.rainPath[i-1].seconds)));
 assert.throws(()=>validateWalkingDemoRoute({...r,travelMode:'driving'}),/가상 보행/);
 assert.throws(()=>validateWalkingDemoRoute({...r,rainPath:[{lat:35,lng:129,seconds:0},r.rainPath.at(-1)]}),/가상 보행/);
});

test('Synthetic scene has slip, hotspot, and surprise heat risks in order',()=>{
 const r=makeVirtualWalkingDemoRoute(),initial=makeWalkingDemoScenario(r),later=makeWalkingDemoBreakingWarning(r);
 assert.deepEqual(initial.hazards.map(h=>h.id),['walking-slip','walking-hotspot']);
 assert.ok(initial.hazards[0].seconds<initial.hazards[1].seconds);
 assert.ok(initial.hazards[1].seconds<later.seconds);
 assert.ok([...initial.hazards,later].every(h=>h.demo===true&&h.lat>37&&h.lng>126));
 assert.equal(later.breaking,true);
 assert.ok(WALK_DEMO_TRIGGER>51&&WALK_DEMO_TRIGGER<76);
});

test('Voice lines are natural and exclude a narration prefix',()=>{
 const hazards=makeWalkingDemoScenario(makeVirtualWalkingDemoRoute()).hazards;
 assert.match(walkingDemoSpokenWarning(hazards[0],100),/미끄럼/);
 assert.match(walkingDemoSpokenWarning(hazards[1],100),/보행자 사고/);
 assert.match(walkingDemoSpokenWarning(makeWalkingDemoBreakingWarning(makeVirtualWalkingDemoRoute()),100),/무더위쉼터/);
 assert.doesNotMatch(walkingDemoSpokenWarning(hazards[0],100),/시연/);
 assert.equal(walkingDemoSpokenWarning({...hazards[0],demo:false},100),null);
 assert.match(app,/안내를 시작합니다\. 이동 경로의 강수와 안개에 주의하세요/);
 assert.match(app,/도보 안내를 시작합니다\. 전방의 빗길과 사고다발지역을 주의하세요/);
 assert.match(app,/else reply\(route\.demoWalking\?/);
});

test('Demo path and shelter reroute are synthetic while normal walking search stays available',()=>{
 const a=app.indexOf('async function walkingDemoRoute(){'),b=app.indexOf("$('demoWalk')?.addEventListener",a);
 assert.ok(a>=0&&b>a);
 const demoSection=app.slice(a,b);
 assert.match(demoSection,/makeVirtualWalkingDemoRoute\(\)/);
 assert.doesNotMatch(demoSection,/await api\('\/api\/route'/);
 assert.match(app,/makeVirtualShelterRoute\(current\)/);
 assert.doesNotMatch(app,/chooseWalkingDemoShelter\(places\.places,current\)/);
 assert.match(app,/const mode=selectedTravelMode\(\)/);
 assert.match(app,/await api\('\/api\/route',\{origin:originPlace,destination:destPlace,departure,travelMode:mode\}\)/);
});

test('Cooling shelter stage reroutes and can complete without live TMAP or shelter POI API',()=>{
 const scene=makeVirtualWalkingDemoRoute();
 const current=scene.rainPath[Math.floor(scene.rainPath.length*.7)];
 const route=makeVirtualShelterRoute(current,Date.parse('2026-11-10T01:30:00Z'));
 assert.equal(route.travelMode,'walking');
 assert.equal(route.rainPath[0].lat,current.lat);
 assert.equal(route.rainPath.at(-1).lat,WALK_DEMO_SHELTER.lat);
 assert.equal(route.rainPath.at(-1).lng,WALK_DEMO_SHELTER.lng);
 assert.ok(route.distance>10&&route.duration>=180);
 assert.match(app,/walkHeatAutoTimer=setTimeout/);
 assert.match(app,/\$\('sunnyWalkHeatYes'\)\.click\(\)/);
 assert.match(app,/route\.demoShelterRerouted\?'무더위쉼터에 도착/);
 assert.match(ui,/가상 이동 경로/);
});

test('Both mobile and desktop demo controls remain; fixed real-route shortcut is removed',()=>{
 for(const id of ['demoWalk','navDemoWalk','demo','navDemoSeoulBusan','sunnyWalkHeatPopup','sunnyWalkHeatYes','sunnyWalkHeatNo'])
  assert.equal(ui.split('id="'+id+'"').length-1,1,id);
 assert.doesNotMatch(ui,/id="realWalk"|id="navRealWalk"/);
 assert.match(css,/sunny-walk-demo-launch/);
 assert.match(app,/\$\('navDemoWalk'\)\?\.addEventListener\('click',walkingDemoRoute\)/);
 assert.match(app,/injectWalkingDemoWarning\(\)/);
 assert.match(ui,/id="navDemoDisclaimer"[^>]*>/);
});
