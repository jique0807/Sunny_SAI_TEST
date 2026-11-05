import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safemapUrl,safemapWms} from '../lib/safemap.mjs';
import {handle} from '../lib/api.mjs';
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const params=new URLSearchParams({bbox:'14126000,4510000,14128000,4512000',width:'256',height:'256'});
test('Safemap WMS URL fixes host and river extent layer while encoding the server-only key',()=>{
 const key='sensitive+/&',u=safemapUrl(params,key);
 assert.equal(u.hostname,'www.safemap.go.kr');assert.equal(u.pathname,'/openapi2/IF_0089_WMS');
 assert.equal(u.searchParams.get('serviceKey'),key);
 assert.equal(u.searchParams.get('layers'),'A2SM_FLOODFOVRRISK1');
 assert.equal(u.searchParams.get('srs'),'EPSG:3857');
 assert.equal(u.searchParams.get('transparent'),'TRUE');
});
test('Safemap validates Korea bounds and bounded image dimensions',()=>{
 for(const bbox of ['','0,0,1,1','14126000,4510000,14125000,4512000','NaN,0,0,0','14126000,4510000,14128000,99999999'])assert.throws(()=>safemapUrl(new URLSearchParams({bbox,width:'256',height:'256'}),'k'));
 assert.throws(()=>safemapUrl(new URLSearchParams({bbox:params.get('bbox'),width:'4096',height:'256'}),'k'));
});
test('Safemap proxy accepts only valid PNG and never reveals the upstream key',async()=>{
 let requested;const key='key-secret';
 const ok=await safemapWms(params,key,async url=>{requested=new URL(url);return new Response(png,{headers:{'content-type':'image/png'}});});
 assert.equal(ok.status,200);assert.equal(ok.headers.get('content-type'),'image/png');
 assert.equal(requested.searchParams.get('serviceKey'),key);
 assert.ok(!(await ok.text()).includes(key));
 await assert.rejects(()=>safemapWms(params,key,async()=>new Response('<ServiceException>private</ServiceException>',{headers:{'content-type':'application/xml'}})),/image missing/);
});
test('data-health checks upstream servers without leaking secret values to the client',async()=>{
 const origin='https://example.test';
 const env={APP_ORIGIN:origin,SESSION_SECRET:'s'.repeat(64),SAFEMAP_API_KEY:'secret-safemap'};
 const start=await handle(new Request(origin+'/api/session'),env);
 const d=await start.json();const cookie=start.headers.getSetCookie()[0].split(';')[0];
 assert.equal(d.connections.safemap,true);
 const r=await handle(new Request(origin+'/api/data-health',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':d.csrf},body:'{}'}),env,async url=>{
  assert.ok(url.startsWith('https://www.safemap.go.kr/openapi2/'));
  return new Response(png,{headers:{'content-type':'image/png'}});
 });
 const result=await r.json();assert.equal(r.status,200);
 assert.equal(result.sources.safemap.state,'received');
 assert.equal(result.sources.kma.state,'missing');
 assert.ok(!JSON.stringify(result).includes('secret-safemap'));
});
test('WMS GET without session is denied and invalid image bounds reject unsafe requests',async()=>{
 const origin='https://example.test',env={APP_ORIGIN:origin,SESSION_SECRET:'s'.repeat(64),SAFEMAP_API_KEY:'test-secret'};
 const unauth=await handle(new Request(origin+'/api/safemap/wms?'+params),env,async()=>{throw Error('should not fetch');});
 assert.equal(unauth.status,401);
 const start=await handle(new Request(origin+'/api/session'),env),cookie=start.headers.getSetCookie()[0].split(';')[0];
 const invalid=await handle(new Request(origin+'/api/safemap/wms?bbox=0,0,1,1&width=256&height=256',{headers:{Cookie:cookie}}),env,async()=>{throw Error('should not fetch');});
 assert.equal(invalid.status,400);
});
