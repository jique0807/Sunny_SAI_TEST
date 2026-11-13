import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../lib/api.mjs';
import {normalizeTmapWalkingRoute} from '../lib/tmap-walk.mjs';
import {evaluateRouteRisk,SAFE_ROUTE_ENGINE_VERSION} from '../public/safe-route-engine.mjs';

const origin={lat:37.5,lng:127.0,name:'시청'},destination={lat:37.504,lng:127.004,name:'공원'};
const base='https://sunny.walk.example';
const env={APP_ORIGIN:base,SESSION_SECRET:'s'.repeat(64),TMAP_API_KEY:'private-tmap-key',KAKAO_REST_API_KEY:'private-kakao-key'};
const sample={features:[
 {type:'Feature',properties:{totalDistance:740,totalTime:600,description:'출발'},geometry:{type:'Point',coordinates:[127,37.5]}},
 {type:'Feature',properties:{facilityType:15},geometry:{type:'LineString',coordinates:[[127,37.5],[127.001,37.501],[127.002,37.502]]}},
 {type:'Feature',properties:{facilityType:14},geometry:{type:'LineString',coordinates:[[127.002,37.502],[127.004,37.504]]}},
 {type:'Feature',properties:{description:'도착'},geometry:{type:'Point',coordinates:[127.004,37.504]}}
]};
async function session(){const r=await handle(new Request(base+'/api/session'),env);return {cookie:r.headers.getSetCookie()[0].split(';')[0],csrf:(await r.json()).csrf};}
function request(body,session,csrf=session.csrf){return new Request(base+'/api/route',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,Cookie:session.cookie,'X-CSRF-Token':csrf},body:JSON.stringify(body)});}
const journey=()=>({origin,destination,departure:new Date(Date.now()+90000).toISOString(),travelMode:'walking'});
test('TMAP pedestrian data enters existing Sunny SAI route model and Risk Engine 2.0',async()=>{
 const auth=await session();let calls=0;
 const r=await handle(request(journey(),auth),env,async(url,opt)=>{
  calls++;assert.match(url,/^https:\/\/apis\.openapi\.sk\.com\/tmap\/routes\/pedestrian\?/);
  assert.equal(opt.headers.appKey,env.TMAP_API_KEY);
  assert.ok(!url.includes(env.TMAP_API_KEY));
  return Response.json(sample);
 });
 assert.equal(r.status,200);assert.equal(calls,1);
 const data=await r.json();
 assert.equal(data.travelMode,'walking');assert.equal(data.mode,'walking');assert.equal(data.provider,'TMAP');
 assert.equal(data.rainPath[0].seconds,0);assert.equal(data.rainPath.at(-1).seconds,data.duration);
 assert.equal(data.samples.length,3);assert.ok(data.samples.every(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Number.isFinite(Date.parse(p.eta))));
 assert.deepEqual(new Set(data.facilities.map(f=>f.kind)),new Set(['횡단보도','지하보도']));
 assert.ok(data.facilities.every(f=>f.status==='location_only'));
 assert.ok(!JSON.stringify(data).includes(env.TMAP_API_KEY));
 const missing=evaluateRouteRisk(data,{mode:'walking',weatherSamples:[]});
 assert.equal(SAFE_ROUTE_ENGINE_VERSION,'risk-v2.0');
 assert.equal(missing.state,'insufficient-data');
 const samples=data.samples.map(s=>({...s,status:'forecast',forecast:{provider:'kma',time:s.eta,rain:3,precipitationType:1,temperature:10}}));
 const assessed=evaluateRouteRisk(data,{mode:'walking',weatherSamples:samples,now:Date.now()});
 assert.equal(assessed.state,'evaluated');assert.equal(assessed.coverage,100);
});
test('TMAP unavailable does not substitute a car route or paid Kakao walking request',async()=>{
 const auth=await session();let calls=0;
 const r=await handle(request(journey(),auth),env,async(url)=>{
  calls++;assert.ok(url.includes('tmap/routes/pedestrian'));
  return new Response('forbidden',{status:403});
 });
 assert.equal(calls,1);assert.equal(r.status,502);
 const body=await r.text();assert.ok(!body.includes('forbidden')&&!body.includes(env.TMAP_API_KEY));
});
test('TMAP normalization checks start/end geometry before presenting a walking route',()=>{
 assert.throws(()=>normalizeTmapWalkingRoute({geometry:[{lat:33,lng:126},{lat:33.1,lng:126.1}],distanceMeters:740,durationSeconds:600},Date.now(),{origin,destination}),/시작점/);
});
test('CSRF remains enforced for TMAP-first walking mode',async()=>{
 const auth=await session();const r=await handle(request(journey(),auth,'bad'),env,async()=>{throw Error('must not call');});
 assert.equal(r.status,403);
});
test('walking with unsupported TMAP waypoints returns a clear error rather than a fictitious path',async()=>{
 const auth=await session();const r=await handle(request({...journey(),waypoints:[origin]},auth),env,async()=>{throw Error('must not call');});
 assert.equal(r.status,422);assert.match((await r.text()),/경유지/);
});
