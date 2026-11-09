import {test} from 'node:test';import assert from 'node:assert/strict';import {handle} from '../lib/api.mjs';
const env={APP_ORIGIN:'https://sunny.example',SESSION_SECRET:'z'.repeat(64)};
function request(path,method='GET',data,cookie='',csrf=''){return new Request(env.APP_ORIGIN+path,{method,headers:{...(method==='POST'?{'Content-Type':'application/json',Origin:env.APP_ORIGIN,'x-csrf-token':csrf}:{}),Cookie:cookie},body:method==='POST'?JSON.stringify(data):undefined});}
async function session(){const r=await handle(request('/api/session'),env);return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf};}
test('pedestrian route remains unavailable without TMAP key',async()=>{const s=await session();const r=await handle(request('/api/pedestrian/route','POST',{origin:{lat:37.566,lng:126.978},destination:{lat:37.568,lng:126.980},departure:new Date().toISOString()},s.cookie,s.csrf),env);assert.equal(r.status,503);assert.match((await r.text()),/TMAP/);});
test('authenticated TMAP response has route geometry and unknown forecast when KMA absent',async()=>{const s=await session(),provider={features:[{geometry:{type:'Point',coordinates:[126.978,37.566]},properties:{totalDistance:270,totalTime:230}},{geometry:{type:'LineString',coordinates:[[126.978,37.566],[126.98,37.568]]},properties:{}}]};const r=await handle(request('/api/pedestrian/route','POST',{origin:{lat:37.566,lng:126.978},destination:{lat:37.568,lng:126.980},departure:new Date().toISOString()},s.cookie,s.csrf),{...env,TMAP_API_KEY:'private'},async(url,opt)=>{assert.ok(url.startsWith('https://apis.openapi.sk.com/tmap/routes/pedestrian?'));assert.equal(opt.headers.appKey,'private');return new Response(JSON.stringify(provider),{status:200,headers:{'Content-Type':'application/json'}})});assert.equal(r.status,200);const v=await r.json();assert.equal(v.route.geometry.length,2);assert.equal(v.assessment.level,'unknown');assert.equal(v.facilityData,'not_connected');assert.equal(JSON.stringify(v).includes('private'),false);});
test('CSRF and invalid coordinate input rejected before provider call',async()=>{const s=await session(),body={origin:{lat:0,lng:0},destination:{lat:37.568,lng:126.980},departure:new Date().toISOString()};let called=false;let r=await handle(request('/api/pedestrian/route','POST',body,s.cookie,s.csrf),{...env,TMAP_API_KEY:'private'},async()=>{called=true;throw Error('should not call')});assert.equal(r.status,400);assert.equal(called,false);r=await handle(request('/api/pedestrian/route','POST',body,s.cookie,'wrong'),{...env,TMAP_API_KEY:'private'});assert.equal(r.status,403);});

test('Preview deployment URL supports same-origin session while cross-site CSRF remains forbidden',async()=>{
 const actual='https://sunny-sai-test-abc.vercel.app';
 const preview={...env,APP_ORIGIN:'https://sunny-sai-preview.vercel.app',VERCEL_ENV:'preview',VERCEL_URL:'sunny-sai-test-abc.vercel.app'};
 const sessionResponse=await handle(new Request(actual+'/api/session'),preview);
 assert.equal(sessionResponse.status,200);
 const sid=sessionResponse.headers.get('set-cookie').split(';')[0],csrf=(await sessionResponse.json()).csrf;
 const good=await handle(new Request(actual+'/api/pedestrian/route',{method:'POST',headers:{Origin:actual,'Content-Type':'application/json','x-csrf-token':csrf,Cookie:sid},body:JSON.stringify({})}),preview);
 assert.equal(good.status,503);
 const bad=await handle(new Request(actual+'/api/pedestrian/route',{method:'POST',headers:{Origin:'https://other.vercel.app','Content-Type':'application/json','x-csrf-token':csrf,Cookie:sid},body:JSON.stringify({})}),preview);
 assert.equal(bad.status,403);
 const forged=await handle(new Request('https://unauthorized.vercel.app/api/session',{headers:{Origin:'https://unauthorized.vercel.app'}}),preview);
 assert.equal(forged.status,403);
});
