import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeKmaWarning,probeKmaRoadRisk,probeFloodWms,checkRouteLayerFeasibility}
 from '../lib/route-layer-feasibility.mjs';
import {handle} from '../lib/api.mjs';
const key='test-key+never-print',safemapKey='safemap-key-secret';
const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,1,0,0,0,1,0]);
function mockedProvider(url){
 const u=new URL(url);
 if(u.pathname.endsWith('/wrn_now_data.php')){
  assert.equal(u.searchParams.get('authKey'),key);
  return new Response('# REG_ID,WRN,LVL,TM_FC\nL1100100,R,2,202611071200\n',
   {headers:{'content-type':'text/plain'}});
 }
 if(u.pathname.endsWith('/road_file_down.php')){
  assert.equal(u.searchParams.get('authKey'),key);
  return new Response('<html>unknown format</html>',{headers:{'content-type':'text/html'}});
 }
 if(u.pathname.endsWith('/IF_0089_WMS')){
  assert.equal(u.searchParams.get('serviceKey'),safemapKey);
  return new Response(png,{headers:{'content-type':'image/png'}});
 }
 if(u.pathname.endsWith('/IF_0100_WMS')){
  assert.equal(u.searchParams.get('serviceKey'),safemapKey);
  assert.equal(u.searchParams.get('srs'),'EPSG:4326');
  return new Response('provider rejected request',{status:400});
 }
 throw Error('Unexpected provider');
}
test('warning API has a real official endpoint but no inferred polygon',async()=>{
 const r=await probeKmaWarning(key,mockedProvider);
 assert.equal(r.state,'text_received');assert.equal(r.http,200);
 assert.equal(r.geometry,'region_codes_only');
 assert.ok(r.candidateRows>0);
 assert.ok(!JSON.stringify(r).includes(key));
});
test('road-risk ZIP not verified means unavailable; never invent map coordinates',async()=>{
 const r=await probeKmaRoadRisk(key,mockedProvider);
 assert.equal(r.state,'request_or_format_failed');
 assert.equal(r.geometry,'not_verified');
 assert.ok(!JSON.stringify(r).includes(key));
});
test('WMS transparent PNG is not proof of live road flooding',async()=>{
 const r=await probeFloodWms(safemapKey,mockedProvider);
 assert.equal(r.state,'png_received');
 assert.equal(r.spatialIntersectionVerified,false);
 assert.ok(!JSON.stringify(r).includes(safemapKey));
});
test('combined preliminary provider feasibility reveals genuine gaps and omitted menus',async()=>{
 const r=await checkRouteLayerFeasibility({kmaKey:key,safemapKey,fetcher:mockedProvider});
 assert.equal(r.warning.state,'text_received');
 assert.equal(r.road.state,'request_or_format_failed');
 assert.equal(r.flood.state,'png_received');
 assert.equal(r.floodLocal.http,400);
 for(const item of ['humidity','wind_direction','general_temperature','cctv'])
  assert.ok(r.constraints.excludes.includes(item));
 assert.ok(!JSON.stringify(r).includes(key));
 assert.ok(!JSON.stringify(r).includes(safemapKey));
});
test('GET feasibility endpoint available only in Vercel preview, no query inputs or credentials',async()=>{
 const base='https://sai.test',env={VERCEL_ENV:'preview',
  APP_ORIGIN:base,SESSION_SECRET:'x'.repeat(48),
  KMA_API_KEY:key,SAFEMAP_API_KEY:safemapKey};
 const route=base+'/api/route-layer-feasibility';
 const r=await handle(new Request(route),env,mockedProvider);
 assert.equal(r.status,200);
 const d=await r.json();assert.equal(d.warning.state,'text_received');
 assert.ok(!JSON.stringify(d).includes(key));
 const other=await handle(new Request(route+'?url=https://example.com'),env,mockedProvider);
 assert.equal(other.status,400);
 const prod=await handle(new Request(route),{...env,VERCEL_ENV:'production'},mockedProvider);
 assert.equal(prod.status,404);
});
