import {test} from 'node:test';
import assert from 'node:assert/strict';
import {walkingQuery,normalizeWalkingRoute} from '../lib/kakao-walk.mjs';
import {handle} from '../lib/api.mjs';
import {kakaoRouteLink} from '../public/map-geometry.mjs';
import {evaluateRouteRisk} from '../public/safe-route-engine.mjs';
const origin={name:'시청',lat:37.500,lng:127.000},destination={name:'공원',lat:37.504,lng:127.004};
const depart=Date.now()+60000;
const example={
 status:'OK',route:{properties:{totalDistance:640,totalTime:540,landingUrl:'https://map.kakao.com/'},
 legs:[{properties:{distance:640,time:540},steps:[
  {properties:{distance:300,time:260,guidance:'보행로 진입'},path:{points:[[127.000,37.500],[127.002,37.502]]}},
  {properties:{distance:340,time:280,guidance:'횡단보도 이용'},path:{points:[[127.002,37.502],[127.004,37.504]]}}
 ]}]}
};
function req(path,body,session){return new Request('https://sunny.walk.example'+path,{method:'POST',headers:{
 'Content-Type':'application/json',Origin:'https://sunny.walk.example',
 Cookie:session.cookie,'X-CSRF-Token':session.csrf},body:JSON.stringify(body)});}
async function session(env){const r=await handle(new Request('https://sunny.walk.example/api/session'),env);
 return{cookie:r.headers.getSetCookie()[0].split(';')[0],csrf:(await r.json()).csrf};}
test('Kakao public walking route uses the official WGS84 coordinates, not car routing',()=>{
 const q=walkingQuery(origin,destination,[],'SHORTEST');
 assert.equal(q.hostname,'dapi.kakao.com');
 assert.equal(q.pathname,'/v2/routing/walk');
 assert.equal(q.searchParams.get('start_x'),'127');
 assert.equal(q.searchParams.get('start_y'),'37.5');
 assert.equal(q.searchParams.get('route_mode'),'SHORTEST');
 const w=walkingQuery(origin,destination,[origin,destination],'ACCESSIBLE');
 assert.equal(w.searchParams.get('via_x'),'127,127.004');
 assert.equal(w.searchParams.get('via_y'),'37.5,37.504');
 assert.throws(()=>walkingQuery(origin,destination,[],'RECOMMEND'),/옵션/);
 assert.throws(()=>walkingQuery(origin,destination,Array(6).fill(origin)),/옵션/);
});
test('pedestrian returned steps are normalized into ETA-aligned true walking path',()=>{
 const r=normalizeWalkingRoute(example,depart,{origin,destination});
 assert.equal(r.travelMode,'walking');
 assert.equal(r.mode,'walking');
 assert.equal(r.source,'Kakao Maps Walking');
 assert.equal(r.distance,640);
 assert.equal(r.duration,540);
 assert.equal(r.rainPath[0].seconds,0);
 assert.equal(r.rainPath.at(-1).seconds,540);
 assert.equal(r.vertices.length,4);
 assert.ok(r.samples.length>=2);
 assert.ok(r.samples.every(x=>x.lat>=37.5&&x.lat<=37.504));
 assert.ok(r.samples.every(x=>Date.parse(x.eta)>depart));
 assert.ok(r.samples.some(x=>x.label==='횡단보도 이용'));
 const risk=evaluateRouteRisk(r,{mode:'walking'});
 assert.equal(risk.state,'insufficient-data'); // no fetched KMA forecast is not safe
 assert.notEqual(risk.state,'unsupported');
});
test('pedestrian route must originate and terminate near the requested positions',()=>{
 const remote={...destination,lat:35.0,lng:128.0};
 assert.throws(()=>normalizeWalkingRoute(example,depart,{origin,destination:remote}),/종료점/);
 assert.throws(()=>normalizeWalkingRoute(example,depart,{origin:remote,destination}),/시작점/);
});
test('fail closed: do not draw car roads or fake pedestrian geometry on missing results',()=>{
 for(const bad of [{status:'NO_RESULTS'},{status:'OK',route:{legs:[],properties:{}}},{...example,route:{...example.route,legs:[{steps:[{path:{points:[[0,0],[1,1]]}}]}]}}])
  assert.throws(()=>normalizeWalkingRoute(bad,depart));
});
test('official Kakao Maps mobile URL uses foot routing instead of car',()=>{
 const foot=kakaoRouteLink(origin,destination,'walking'),car=kakaoRouteLink(origin,destination,'driving');
 assert.equal(new URL(foot).searchParams.get('by'),'foot');
 assert.equal(new URL(foot).searchParams.get('sp'),'37.5,127');
 assert.match(car,/\/by\/car\//);
});
test('authenticated backend walking route fetches Kakao Maps endpoint only and never reveals REST key',async()=>{
 const env={APP_ORIGIN:'https://sunny.walk.example',SESSION_SECRET:'s'.repeat(64),KAKAO_REST_API_KEY:'do-not-expose-rest-key'};
 const auth=await session(env);
 let called=0;
 const result=await handle(req('/api/route',{origin,destination,departure:new Date(depart).toISOString(),travelMode:'walking',walkingPriority:'SHORTEST'},auth),env,
  async(url,opts)=>{called++;const u=new URL(url);
   assert.equal(u.hostname,'dapi.kakao.com');
   assert.equal(u.pathname,'/v2/routing/walk');
   assert.equal(u.searchParams.get('route_mode'),'SHORTEST');
   assert.equal(opts.headers.Authorization,'KakaoAK do-not-expose-rest-key');
   return Response.json(example);});
 assert.equal(result.status,200);
 assert.equal(called,1);
 const raw=await result.text();
 assert.ok(!raw.includes(env.KAKAO_REST_API_KEY));
 const item=JSON.parse(raw);
 assert.equal(item.travelMode,'walking');
 const rejected=await handle(req('/api/route',{origin,destination,departure:new Date(depart).toISOString(),travelMode:'flying'},auth),env,async()=>{throw Error('must not fetch')});
 assert.equal(rejected.status,400);
 const unauthorized=await handle(req('/api/route',{origin,destination,departure:new Date(depart).toISOString(),travelMode:'walking'},auth),env,async()=>new Response('secret upstream', {status:403}));
 assert.equal(unauthorized.status,502);
 assert.ok(!(await unauthorized.text()).includes('secret upstream'));
});
test('walking API requires KMA-independent Kakao REST key and does not silently use vehicle endpoint',async()=>{
 const env={APP_ORIGIN:'https://sunny.walk.example',SESSION_SECRET:'s'.repeat(64)};
 const auth=await session(env);
 const result=await handle(req('/api/route',{origin,destination,departure:new Date(depart).toISOString(),travelMode:'walking'},auth),env);
 assert.equal(result.status,503);
});
