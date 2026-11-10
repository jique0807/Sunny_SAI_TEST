import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {capabilityCatalog,SOURCE_ADAPTERS,PIPELINE_STAGES} from '../lib/capability-catalog.mjs';
import {createRiskModelRegistry,DEFAULT_RISK_MODEL,EXPLANATION_CONTRACT} from '../public/risk-model-adapters.mjs';
import {buildRiskLineage} from '../public/risk-lineage.mjs';
import {handle} from '../lib/api.mjs';

const departure='2026-11-11T00:00:00Z';
const route={travelMode:'driving',distance:1000,duration:600,departure,
 rainPath:[{lat:37.56,lng:126.97,seconds:0},{lat:37.57,lng:126.98,seconds:600}],
 samples:[{lat:37.565,lng:126.975,seconds:300,eta:'2026-11-11T00:05:00Z'}],
 itsEvidenceStatus:'failed',roadEvidenceStatus:'not-checked',warningEvidenceStatus:'received'};
const sample={...route.samples[0],status:'forecast',forecast:{
 provider:'kma',time:'2026-11-11T00:05:00Z',precipitationType:1,rain:30,rainLabel:'30mm'}};

test('provider manifest distinguishes key configured from verified real data without leaking keys',()=>{
 const secret='DO_NOT_EXPOSE_12345',env={KMA_API_KEY:secret,KAKAO_REST_API_KEY:secret};
 const out=capabilityCatalog(env);
 assert.equal(out.readOnly,true);
 assert.equal(out.schema,'sunny-capabilities-v1');
 assert.ok(SOURCE_ADAPTERS.length>=10&&PIPELINE_STAGES.length>=6);
 assert.equal(out.sources.find(x=>x.id==='kma-forecast').configuration,'configured');
 assert.equal(out.sources.find(x=>x.id==='its').configuration,'missing-key');
 assert.equal(out.sources.find(x=>x.id==='open-meteo').configuration,'configured');
 assert.equal(out.sources.find(x=>x.id==='kma-forecast').reception,'not-checked-by-catalog');
 assert.equal(out.sources.find(x=>x.id==='gk2a').verifiedRiskEvidence,false);
 assert.ok(!JSON.stringify(out).includes(secret));
 assert.equal(out.riskModels.find(x=>x.id==='external-llm').status,'not-connected');
});
test('two real policies share the vetted engine; strict mode abstains instead of inventing signals',()=>{
 const registry=createRiskModelRegistry();
 assert.equal(DEFAULT_RISK_MODEL,'rules-v2');
 assert.equal(EXPLANATION_CONTRACT.mayAlterEvidence,false);
 const base=registry.evaluate(route,{modelId:'rules-v2',weatherSamples:[sample],now:Date.parse(departure)});
 assert.equal(base.state,'evaluated');
 assert.equal(base.signalCount,1);
 assert.equal(base.decisionWithheld,false);
 const strict=registry.evaluate(route,{modelId:'rules-v2-strict',weatherSamples:[sample],now:Date.parse(departure)});
 assert.equal(strict.state,'evaluated');
 assert.equal(strict.signalCount,base.signalCount);
 assert.equal(strict.riskLevel,base.riskLevel);
 const altered={...sample,forecast:{...sample.forecast,time:'2026-11-12T00:00:00Z'}};
 const incomplete=registry.evaluate(route,{modelId:'rules-v2-strict',weatherSamples:[altered],now:Date.parse(departure)});
 assert.equal(incomplete.decisionWithheld,true);
 assert.equal(incomplete.riskLevel,'unknown');
 assert.notEqual(incomplete.state,'evaluated');
});
test('an injected policy may abstain but cannot replace verified evidence with invented hazards',()=>{
 const registry=createRiskModelRegistry();
 registry.register({id:'optional-policy',name:'Custom adapter',refine:()=>({abstain:true})});
 const profile=registry.evaluate(route,{modelId:'optional-policy',weatherSamples:[sample]});
 assert.equal(profile.decisionWithheld,true);
 assert.equal(profile.riskLevel,'unknown');
 assert.equal(profile.signalCount,1);
 assert.throws(()=>registry.register({id:'optional-policy',name:'Duplicate',refine:()=>({abstain:false})}));
 registry.register({id:'throwing-policy',name:'Throwing',refine:()=>{throw Error('secret data');}});
 const error=registry.evaluate(route,{modelId:'throwing-policy',weatherSamples:[sample]});
 assert.equal(error.policyAdapterFailed,true);
 assert.ok(!JSON.stringify(error).includes('secret data'));
});
test('lineage reports route evidence stages without leaking location or credentials',()=>{
 const profile=createRiskModelRegistry().evaluate(route,{weatherSamples:[sample]});
 const out=buildRiskLineage({route,weather:{samples:[sample]},profile,now:Date.parse(departure)});
 assert.equal(out.schema,'sunny-risk-lineage-v1');
 assert.equal(out.decisionModel,'rules-v2');
 assert.equal(out.sources.find(x=>x.id==='its').status,'failed');
 assert.equal(out.sources.find(x=>x.id==='weather').status,'received');
 assert.equal(out.acceptedRiskSignals,1);
 assert.ok(!JSON.stringify(out).includes('37.56'));
 assert.ok(!JSON.stringify(out).includes('126.97'));
 const demo=buildRiskLineage({route:{...route,demo:true},weather:{samples:[sample]},profile});
 assert.equal(demo.sources.find(x=>x.id==='weather').status,'simulation');
});
test('manifest endpoint and client wiring are protected from arbitrary provider URLs',async()=>{
 const origin='https://sunny.example';
 const env={APP_ORIGIN:origin,SESSION_SECRET:'s'.repeat(64),KMA_API_KEY:'SECRET_VALUE'};
 const unauthorized=await handle(new Request(origin+'/api/capability-catalog'),env);
 assert.equal(unauthorized.status,401);
 const session=await handle(new Request(origin+'/api/session'),env);
 const cookie=session.headers.get('set-cookie').split(';')[0];
 const result=await handle(new Request(origin+'/api/capability-catalog',{headers:{cookie}}),env);
 assert.equal(result.status,200);
 const body=await result.json();
 assert.equal(body.sources.find(x=>x.id==='kma-forecast').configuration,'configured');
 assert.ok(!JSON.stringify(body).includes(env.KMA_API_KEY));
 const invalid=await handle(new Request(origin+'/api/capability-catalog?url=https://evil.example',{headers:{cookie}}),env);
 assert.equal(invalid.status,400);
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/createRiskModelRegistry/);
 assert.match(app,/initArchitecturePanel/);
 assert.match(app,/architecturePanel\.update/);
 const panel=readFileSync(new URL('../public/architecture-panel.mjs',import.meta.url),'utf8');
 assert.match(panel,/buildRiskLineage/);
});
