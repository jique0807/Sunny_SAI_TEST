import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeSyntheticRiskFixture,syntheticRiskRecommendsDetour} from '../public/synthetic-risk-demo.mjs';
import {evaluateDrivingRisk,evaluateSyntheticDrivingRisk} from '../public/safe-route-engine.mjs';

function route(){
 const departure='2026-11-11T01:00:00.000Z';
 const rainPath=[
  {lat:37.55472,lng:126.97083,seconds:0},
  {lat:37.54000,lng:126.98200,seconds:240},
  {lat:37.52500,lng:126.99400,seconds:480},
  {lat:37.51000,lng:127.00800,seconds:720},
  {lat:37.49794,lng:127.02762,seconds:960}
 ];
 return {demo:true,travelMode:'driving',mode:'driving',provider:'Kakao Mobility',
  departure,duration:960,distance:11000,rainPath,vertices:rainPath.map(({lat,lng})=>({lat,lng})),samples:[]};
}

test('baseline synthetic rain fixture is evaluated as simulation-only evidence',()=>{
 const fixture=makeSyntheticRiskFixture(route(),'initial');
 assert.equal(fixture.profile.state,'evaluated');
 assert.equal(fixture.profile.coverage,100);
 assert.equal(fixture.profile.signalCount,1);
 assert.equal(fixture.profile.simulation,true);
 assert.equal(fixture.profile.signals[0].assessment.level,'notice');
 assert.equal(evaluateDrivingRisk(fixture.route,{weatherSamples:fixture.weatherSamples,
  extraHazards:fixture.signals}).state,'simulation');
});

test('new heavy-rain and flood-warning fixtures cross the demo reroute rule',()=>{
 const fixture=makeSyntheticRiskFixture(route(),'alert');
 assert.equal(fixture.profile.state,'evaluated');
 assert.equal(fixture.profile.coverage,100);
 assert.equal(fixture.profile.signalCount,2);
 assert.equal(fixture.profile.signals.some(h=>h.assessment.label==='가상 폭우 · 우회 검토'),true);
 assert.equal(fixture.profile.signals.some(h=>h.assessment.label==='가상 침수경보 · 우회 검토'),true);
 assert.equal(syntheticRiskRecommendsDetour(fixture.profile,fixture.signals),true);
});

test('fixture evidence cannot enter the ordinary provider-data evaluator',()=>{
 const fixture=makeSyntheticRiskFixture(route(),'alert');
 const result=evaluateSyntheticDrivingRisk(fixture.route,{weatherSamples:fixture.weatherSamples,
  extraHazards:fixture.signals.map(h=>({...h,provider:'untrusted test source'}))});
 assert.equal(result.signalCount,0);
 assert.equal(result.evidenceMode,'synthetic-fixture');
});

test('new dummy mode follows the two existing demo choices without replacing them',async()=>{
 const ui=await readFile(new URL('../lib/ui.ts',import.meta.url),'utf8');
 const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const menu=ui.slice(ui.indexOf('id="navDemoSeoulBusan"'),ui.indexOf('class="studio-search"'));
 assert.ok(menu.indexOf('id="navDemoSeoulBusan"')<menu.indexOf('id="navDemoWalk"'));
 assert.ok(menu.indexOf('id="navDemoWalk"')<menu.indexOf('id="navDemoLiveRisk"'));
 assert.match(menu,/더미 시연모드/);
 assert.match(app,/initDummyScenarioUI/);
 assert.match(app,/injectSyntheticRiskWarning\(\)/);
});
