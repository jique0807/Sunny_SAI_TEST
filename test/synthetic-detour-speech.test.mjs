import test from 'node:test';
import assert from 'node:assert/strict';
import {searchSyntheticDetour} from '../public/synthetic-detour-search.mjs';
import {makeSyntheticRiskFixture} from '../public/synthetic-risk-demo.mjs';
import {BUILTIN_SCENARIOS} from '../public/dummy-scenario-store.mjs';
import {syntheticSpokenWarning,createSyntheticVoiceQueue} from '../public/synthetic-speech.mjs';
function realShape(mode,points){
 return {travelMode:mode,mode,provider:mode==='walking'?'TMAP':'Kakao',departure:'2026-11-11T02:00:00Z',duration:1800,distance:10000,
 rainPath:points.map((p,i)=>({...p,seconds:i*1800/(points.length-1)})),vertices:points};
}
function setup(mode){
 const first=realShape(mode,[{lat:37.55,lng:126.97},{lat:37.5,lng:127.03}]);
 const f=makeSyntheticRiskFixture({...first,demo:true},'alert');const trip={...f.route,syntheticRiskHazards:f.signals,syntheticFloodSignal:f.signals.find(h=>h.kind==='warning')};
 return {trip,current:{lat:37.531,lng:126.9928},destination:first.rainPath.at(-1)};
}
test('driving search expands after the first three candidates hit the danger zone',async()=>{
 const input=setup('driving');let count=0;
 const r=await searchSyntheticDetour({...input,query:async p=>{count++;return realShape('driving',count<=3?[p.origin,p.destination]:[p.origin,...p.waypoints,p.destination]);}});
 assert.ok(count>3);assert.ok(r.chosen);assert.ok(r.chosen.clearance>=input.trip.syntheticFloodSignal.affectedRadiusMeters);
 assert.ok(r.chosen.engineCheck.avoidsAlert);assert.ok(r.attempts.some(a=>a.status==='intersects-hazard'));
});
test('walking detour requests and returned geometry stay walking',async()=>{
 const input=setup('walking'),modes=[];
 const r=await searchSyntheticDetour({...input,query:async p=>{modes.push(p.travelMode);return realShape('walking',[p.origin,p.destination]);}});
 assert.ok(r.chosen);assert.equal(r.chosen.route.provider,'TMAP');assert.ok(modes.every(m=>m==='walking'));
});
test('provider failures are recorded; route search does not fabricate a successful path',async()=>{
 const input=setup('driving');
 const r=await searchSyntheticDetour({...input,query:async()=>{throw Error('provider unavailable');}});
 assert.equal(r.chosen,null);assert.equal(r.attempts.length,7);assert.ok(r.attempts.every(x=>x.status==='request-failed'));
});
test('speech uses the entered precipitation value instead of fixed demonstration values',()=>{
 const text=syntheticSpokenWarning({synthetic:true,kind:'rain',rainMm:8},124);
 assert.match(text,/120미터/);assert.match(text,/8밀리미터/);assert.doesNotMatch(text,/100밀리미터|65밀리미터/);
 assert.match(syntheticSpokenWarning({synthetic:true,kind:'snow'},50),/적설량.*확인되지/);
 assert.equal(syntheticSpokenWarning({synthetic:false,kind:'rain',rainMm:8},124),null);
});
test('voice queue waits for ongoing speech and drops obsolete route announcements',()=>{
 let busy=true,current={},task;const spoken=[];
 const queue=createSyntheticVoiceQueue({speak:t=>spoken.push(t),isBusy:()=>busy,getRoute:()=>current,schedule:fn=>(task=fn,1),cancel:()=>{task=null;}});
 queue.push('비 8mm');assert.equal(spoken.length,0);busy=false;task();assert.deepEqual(spoken,['비 8mm']);
 busy=true;queue.push('old-route');current={};busy=false;task();assert.equal(spoken.length,1);
});
for(const mode of ['driving','walking'])test(mode+': all built-in scenarios produce expected decisions',()=>{
 const expected={flood:'advisory',heat:'heat-advisory',missing:'abstain',partial:'abstain',stale:'abstain',offroute:'abstain',snow:'advisory',wind:'advisory'};
 for(const scenario of BUILTIN_SCENARIOS){const input=setup(mode).trip;
  const f=makeSyntheticRiskFixture({...input,dummyScenario:scenario},'alert');
  const action=scenario.id==='rain-flood'?'reroute':scenario.id==='dry'?'continue':expected[scenario.type];
  assert.equal(f.profile.action.type,action,scenario.name);
 }
});
