import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeScenario,saveScenario,readScenarios,scenarioEvents} from '../public/dummy-scenario-store.mjs';
import {makeSyntheticRiskFixture} from '../public/synthetic-risk-demo.mjs';
const event={kind:'flood',position:70,trigger:20,value:65};
const scenario=()=>sanitizeScenario({type:'flood',name:'구성',events:[],emergencies:[event,event]});
const route={travelMode:'driving',mode:'driving',provider:'Kakao',departure:'2026-11-11T02:00:00Z',duration:1800,distance:10000,rainPath:[{lat:37.55,lng:126.97,seconds:0},{lat:37.5,lng:127.03,seconds:1800}]};
test('event validation deduplicates and requires early reception',()=>{
 assert.equal(scenario().emergencies.length,1);
 assert.throws(()=>sanitizeScenario({type:'flood',events:[],emergencies:[{...event,trigger:80}]}));
});
test('identical configurations update rather than create duplicate saves',()=>{
 const storage={value:'[]',getItem(){return this.value;},setItem(k,v){this.value=v;}};
 const one=saveScenario(storage,{...scenario(),id:'custom-a'});
 const two=saveScenario(storage,{...scenario(),id:'custom-b'});
 assert.equal(one.id,two.id);assert.equal(readScenarios(storage).filter(s=>s.events).length,1);
});
test('empty normal feed preserves pending emergencies and engine evaluates the later flood',()=>{
 const initial=makeSyntheticRiskFixture({...route,dummyScenario:scenario()},'initial');
 assert.equal(initial.route.dummyScenario.emergencies.length,1);assert.equal(initial.signals.length,0);
 const alert=makeSyntheticRiskFixture({...initial.route,syntheticEventCount:1},'alert');
 assert.ok(alert.signals.some(s=>s.kind==='warning'));assert.equal(alert.profile.state,'evaluated');
});
test('separate normal and successive emergency events feed the actual engine',()=>{
 const config=sanitizeScenario({type:'flood',events:[{kind:'fog',position:40,value:200}],emergencies:[{kind:'wind',position:65,trigger:10,value:18},{kind:'heat',position:85,trigger:30,value:35}]});
 const normal=makeSyntheticRiskFixture({...route,dummyScenario:config},'initial');assert.ok(normal.signals.some(s=>s.kind==='fog'));
 const first=makeSyntheticRiskFixture({...route,dummyScenario:config,syntheticEventCount:1},'alert');assert.ok(first.signals.some(s=>s.kind==='wind'));assert.ok(!first.signals.some(s=>s.kind==='heat'));
 const second=makeSyntheticRiskFixture({...route,dummyScenario:config,syntheticEventCount:2},'alert');assert.ok(second.signals.some(s=>s.kind==='heat'));
});
test('legacy scenarios migrate without duplicate type controls',()=>{
 const old=scenarioEvents({type:'flood',initialRain:8,rain:65,warning:true,trigger:20});assert.equal(old.events[0].kind,'rain');assert.equal(old.emergencies[0].kind,'flood');
});
