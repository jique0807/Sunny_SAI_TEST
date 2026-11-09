import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PEDESTRIAN_DIAGNOSTIC_CASE,probePedestrianRoute} from '../lib/pedestrian-diagnostic.mjs';
import {handle} from '../lib/api.mjs';
const base='https://sunny.example',secret='s'.repeat(64);
const from=PEDESTRIAN_DIAGNOSTIC_CASE.origin,to=PEDESTRIAN_DIAGNOSTIC_CASE.destination;
const mock={features:[
 {type:'Feature',properties:{totalDistance:1500,totalTime:960},geometry:{type:'Point',coordinates:[from.lng,from.lat]}},
 {type:'Feature',properties:{facilityType:15},geometry:{type:'LineString',coordinates:[[from.lng,from.lat],[126.9741,37.559],[to.lng,to.lat]]}}
]};
test('TMAP no key is reported as unregistered, not a successful route',async()=>{
 const data=await probePedestrianRoute({key:null,kakaoFallback:true,fetcher:()=>{throw Error('do not call')}});
 assert.equal(data.status,'key_missing');assert.equal(data.fallbackProvider,'kakao');
});
test('provider response is validated and secrets or geometry are not exposed',async()=>{
 const key='TOP_SECRET_TMAP_KEY';let calls=0;
 const data=await probePedestrianRoute({key,fetcher:async(url,options)=>{
  calls++;
  assert.match(url,/tmap\/routes\/pedestrian/);
  assert.equal(options.headers.appKey,key);
  const body=JSON.parse(options.body);
  assert.equal(body.startX,from.lng);assert.equal(body.endX,to.lng);
  return Response.json(mock);
 }});
 assert.equal(calls,1);assert.equal(data.provider,'tmap');assert.equal(data.status,'received');
 assert.equal(data.geometryValid,true);assert.ok(data.sampleCount>0);
 assert.ok(!JSON.stringify(data).includes(key));
 assert.ok(!('rainPath' in data)&&!('vertices' in data)&&!('facilities' in data));
});
test('invalid TMAP auth stays a key-free diagnostic failure',async()=>{
 const data=await probePedestrianRoute({key:'NEVER_EXPOSE',fetcher:async()=>new Response('forbidden',{status:403})});
 assert.equal(data.status,'failed');assert.equal(data.providerStatus,403);
 assert.ok(!JSON.stringify(data).includes('NEVER_EXPOSE'));
});
test('settings diagnostic is only enabled on Vercel deployments',async()=>{
 const res=await handle(new Request(base+'/api/pedestrian-route-diagnostic'),{APP_ORIGIN:base,SESSION_SECRET:secret,VERCEL_ENV:'development',TMAP_API_KEY:'nonsecret-test'});
 assert.equal(res.status,404);
});
test('session separates TMAP availability from Kakao walking fallback without secrets',async()=>{
 const res=await handle(new Request(base+'/api/session'),{APP_ORIGIN:base,SESSION_SECRET:secret,KAKAO_REST_API_KEY:'hidden_kakao'});
 assert.equal(res.status,200);
 const data=await res.json();
 assert.equal(data.connections.walking,true);
 assert.equal(data.connections.tmap,false);
 assert.equal(data.connections.walkingProvider,'kakao');
 assert.ok(!JSON.stringify(data).includes('hidden_kakao'));
});
