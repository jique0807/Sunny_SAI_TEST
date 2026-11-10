import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GK2A_PRODUCTS,observedAtUTC,gk2aListUrl,gk2aImageUrl,
 parseGk2aImageList,fetchGk2aCatalog,fetchGk2aVerifiedImage} from '../lib/gk2a-satellite.mjs';
import {handle} from '../lib/api.mjs';
const now=Date.parse('2026-11-10T12:00:00Z');
const slot='202611101100',key='PRIVATE_KMA_TEST_TOKEN';
const products=['RR','CI','FOG'];
const fixture={response:{body:{items:{item:[{date:slot},{date:'202611101050'}]}}}};
function mockResponse(url){
 const u=new URL(url);
 assert.equal(u.hostname,'apihub.kma.go.kr');
 assert.equal(u.searchParams.get('authKey'),key);
 assert.ok(products.some(x=>u.pathname.includes('/LE2/'+x+'/KO/')));
 assert.ok(!u.pathname.includes('ICING'));
 if(u.pathname.endsWith('/imageList'))return Response.json(fixture);
 if(u.pathname.endsWith('/image')){
  assert.equal(u.searchParams.get('date'),slot);
  const img=new Uint8Array(33);
  img.set([137,80,78,71,13,10,26,10],0);
  img.set([0,0,0,13,73,72,68,82],8);
  new DataView(img.buffer).setUint32(16,320);
  new DataView(img.buffer).setUint32(20,240);
  return new Response(img,{headers:{'content-type':'image/png'}});
 }
 throw Error('Unsupported provider endpoint');
}
test('GK2A product whitelist, UTC observation slots and server-only provider URL',()=>{
 assert.deepEqual(Object.keys(GK2A_PRODUCTS),products);
 assert.equal(observedAtUTC(slot),Date.parse('2026-11-10T11:00:00Z'));
 assert.equal(observedAtUTC('202602300000'),null);
 assert.equal(observedAtUTC('2026111011'),null);
 const url=gk2aListUrl('RR',key,now);
 assert.equal(url.hostname,'apihub.kma.go.kr');
 assert.equal(url.pathname,'/api/typ05/api/GK2A/LE2/RR/KO/imageList');
 assert.equal(url.searchParams.get('format'),'json');
 assert.equal(url.searchParams.get('eDate'),'202611101140');
 assert.ok(url.searchParams.get('sDate')<url.searchParams.get('eDate'));
 assert.equal(gk2aImageUrl('FOG',slot,key).pathname,'/api/typ05/api/GK2A/LE2/FOG/KO/image');
 assert.throws(()=>gk2aListUrl('ICING',key,now));
 assert.throws(()=>gk2aImageUrl('ICING',slot,key));
});
test('only verifiable, recent satellite UTC timestamps are accepted; geo mapping stays unverified',()=>{
 const r=parseGk2aImageList(fixture,{now});
 assert.deepEqual(r.observationTimes,[slot,'202611101050']);
 assert.equal(r.state,'received');
 assert.equal(r.georeferenced,false);
 assert.equal(r.overlayReady,false);
 for(const bad of [{images:[{observed:'fabricated'}]},{server:'succeeded'},'image received']){
  assert.equal(parseGk2aImageList(bad,{now}).state,'format_unverified');
 }
 assert.equal(parseGk2aImageList({items:[{date:'202001011200'}]},{now}).state,'format_unverified');
});
test('GK2A catalog and PNG only use provider-confirmed images; no fake map placement',async()=>{
 let n=0;
 const fetcher=async(url)=>{n++;return mockResponse(url);};
 const catalog=await fetchGk2aCatalog('RR',key,fetcher,now);
 assert.equal(catalog.state,'received');
 assert.equal(catalog.observationTimes[0],slot);
 assert.equal(catalog.overlayReady,false);
 const image=await fetchGk2aVerifiedImage('RR',slot,key,fetcher,now);
 assert.equal(image.status,200);
 assert.equal(image.width,320);
 assert.equal(image.height,240);
 assert.equal(image.georeferenced,false);
 assert.equal(n,3);
 const invalid=await fetchGk2aVerifiedImage('RR','202611101120',key,fetcher,now);
 assert.equal(invalid.status,422);
 assert.equal(n,4);
 assert.equal((await fetchGk2aVerifiedImage('RR','202601010000',key,fetcher,now)).status,400);
 assert.equal(n,4);
 const blocked=await fetchGk2aCatalog('ICING',key,fetcher,now);
 assert.equal(blocked.state,'unsupported');
 assert.equal(n,4);
});
test('unapproved/failed products do not appear as connected or trustworthy risk',async()=>{
 const denied=await fetchGk2aCatalog('FOG',key,async()=>new Response('not allowed',{status:403}),now);
 assert.equal(denied.state,'approval_pending');
 assert.equal(denied.observationTimes.length,0);
 const failed=await fetchGk2aCatalog('CI',key,async()=>Response.json({unexpected:'payload'}),now);
 assert.equal(failed.state,'format_unverified');
 assert.equal(failed.overlayReady,false);
});
test('authenticated diagnostic and image proxy validate GK2A while hiding provider credentials',async()=>{
 const origin='https://sunny.example',env={APP_ORIGIN:origin,SESSION_SECRET:'s'.repeat(64),KMA_API_KEY:key};
 const session=await handle(new Request(origin+'/api/session'),env);
 const cookie=session.headers.getSetCookie()[0].split(';')[0];
 let count=0;
 const fetcher=async url=>{count++;return mockResponse(url);};
 const headers={Cookie:cookie};
 const diag=await handle(new Request(origin+'/api/gk2a-diagnostic',{headers}),env,fetcher);
 assert.equal(diag.status,200);
 const body=await diag.text();
 assert.ok(!body.includes(key));
 const values=JSON.parse(body);
 assert.deepEqual(Object.keys(values.products),products);
 assert.equal(values.products.RR.state,'received');
 assert.equal(values.georeferenced,false);
 assert.equal(count,3);
 const one=await handle(new Request(origin+'/api/gk2a-catalog?kind=FOG',{headers}),env,fetcher);
 assert.equal(one.status,200);
 const img=await handle(new Request(origin+'/api/gk2a-image?kind=RR&utc='+slot,{headers}),env,fetcher);
 assert.equal(img.status,200);
 assert.equal(img.headers.get('X-GK2A-Georeferenced'),'false');
 assert.equal(img.headers.get('X-GK2A-Observation-UTC'),slot);
 assert.equal((await img.arrayBuffer()).byteLength,33);
 const rejected=await handle(new Request(origin+'/api/gk2a-image?kind=ICING&utc='+slot,{headers}),env,fetcher);
 assert.equal(rejected.status,400);
 const unauth=await handle(new Request(origin+'/api/gk2a-image?kind=RR&utc='+slot),env,fetcher);
 assert.equal(unauth.status,401);
});
