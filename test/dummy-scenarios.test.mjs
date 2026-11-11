import test from 'node:test';
import assert from 'node:assert/strict';
import {saveScenario,readScenarios,BUILTIN_SCENARIOS} from '../public/dummy-scenario-store.mjs';
import {makeSyntheticRiskFixture,syntheticRiskRecommendsDetour,joinSyntheticWalkingLegs} from '../public/synthetic-risk-demo.mjs';
const route=mode=>({demo:true,travelMode:mode,mode,provider:mode==='walking'?'TMAP':'Kakao',departure:'2026-11-11T01:00:00Z',duration:1800,distance:10000,rainPath:[{lat:37.55,lng:126.97,seconds:0},{lat:37.5,lng:127.03,seconds:1800}],vertices:[{lat:37.55,lng:126.97},{lat:37.5,lng:127.03}]});
test('scenarios persist and invalid payloads are rejected',()=>{
 const state=new Map(),storage={getItem:k=>state.get(k),setItem:(k,v)=>state.set(k,v)};
 saveScenario(storage,{...BUILTIN_SCENARIOS[0],id:'custom',name:'사용자'});
 assert.equal(readScenarios(storage).find(s=>s.id==='custom').name,'사용자');
 assert.equal(readScenarios(storage).some(s=>s.id===BUILTIN_SCENARIOS[0].id),false);
 assert.throws(()=>saveScenario(storage,{type:'unsupported'}));
});
for(const mode of ['driving','walking']){
 test(mode+': flood, low-rain, heat and missing feeds produce distinct engine decisions',()=>{
  const scenario=BUILTIN_SCENARIOS[0];
  const flood=makeSyntheticRiskFixture({...route(mode),dummyScenario:scenario},'alert');
  assert.equal(flood.profile.mode,mode);assert.equal(syntheticRiskRecommendsDetour(flood.profile,flood.signals),true);
  const mild=makeSyntheticRiskFixture({...route(mode),dummyScenario:{...scenario,rain:4,warning:false}},'alert');
  assert.equal(syntheticRiskRecommendsDetour(mild.profile,mild.signals),false);
  const heat=makeSyntheticRiskFixture({...route(mode),dummyScenario:BUILTIN_SCENARIOS[1]},'alert');
  assert.equal(heat.signals[0].assessment.level,'caution');
  const missing=makeSyntheticRiskFixture({...route(mode),dummyScenario:BUILTIN_SCENARIOS[2]},'alert');
  assert.equal(missing.profile.state,'insufficient-data');assert.equal(missing.profile.coverage,0);
 });
}
test('walking detours join genuine walking legs and reject car geometry',()=>{
 const first=route('walking'),second={...route('walking'),rainPath:[{lat:37.5,lng:127.03,seconds:0},{lat:37.49,lng:127.04,seconds:1800}]};
 const joined=joinSyntheticWalkingLegs(first,second);assert.equal(joined.duration,3600);assert.equal(joined.rainPath.at(-1).seconds,3600);
 assert.throws(()=>joinSyntheticWalkingLegs(first,route('driving')));
});
test('shared tester configurations include real journey coordinates and preserve local saved values',async()=>{
 const {readFile}=await import('node:fs/promises');
 const raw=JSON.parse(await readFile(new URL('../public/scenarios/shared.json',import.meta.url),'utf8'));
 assert.equal(raw.schema,'sunny-shared-scenarios-v1');assert.equal(raw.scenarios.length,2);
 const storage={getItem:()=>null};const items=readScenarios(storage,raw.scenarios);
 for(const mode of ['driving','walking']){
  const s=items.find(x=>x.journey?.mode===mode);assert.ok(s.journey.origin&&s.journey.destination);
  assert.equal(s.events.length,2);assert.equal(s.emergencies.length,2);
  assert.ok(s.emergencies.every(e=>e.trigger<e.position));
 }
});
