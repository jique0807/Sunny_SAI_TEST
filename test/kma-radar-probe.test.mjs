import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeUrl,latestKoreanRadarTime,runRadarProbe,checkRadarAccess} from '../lib/kma-radar-probe.mjs';
import {handle} from '../lib/api.mjs';
const now=Date.parse('2026-11-06T04:25:00Z');
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0,0]);
test('KMA radar probe has fixed legitimate product, KST time and server-only key',()=>{
 assert.equal(latestKoreanRadarTime(now),'202611061240');
 const key='hidden+&=';
 for(const product of ['distribution','nomap']){
  const url=probeUrl(product,key,now);
  assert.equal(url.hostname,'apihub.kma.go.kr');
  assert.equal(url.searchParams.get('authKey'),key);
  assert.equal(url.searchParams.get('tm'),'202611061240');
  assert.ok(url.pathname.endsWith(product==='nomap'?'nph-qpf_ana_imgp':'nph-qpf_ana_img'));
 }
});
test('KMA radar probe verifies real image bytes, not merely successful HTTP',async()=>{
 const ok=await runRadarProbe('distribution','hiddenkey',async()=>new Response(png,{headers:{'Content-Type':'image/png'}}),now);
 assert.equal(ok.receivedImage,true);assert.equal(ok.state,'image_received');
 const html=await runRadarProbe('nomap','hiddenkey',async()=>new Response('<html>승인되지 않은 인증키입니다</html>',{status:200,headers:{'Content-Type':'text/html'}}),now);
 assert.equal(html.receivedImage,false);assert.equal(html.state,'access_unverified');
 const missing=await runRadarProbe('distribution','hiddenkey',async()=>new Response('no data',{status:200}),now);
 assert.equal(missing.state,'data_unavailable');
});
test('Public preview-only response never contains secret key or raw provider response',async()=>{
 const key='secret-probe-key';
 const out=await checkRadarAccess(key,async(url)=>{
  assert.equal(new URL(url).searchParams.get('authKey'),key);
  return new Response(png,{headers:{'Content-Type':'image/png'}});
 },now);
 assert.equal(out.results.length,2);
 assert.ok(out.results.every(r=>r.receivedImage));
 assert.ok(!JSON.stringify(out).includes(key));
});
test('Preview-only probe uses server key, production returns 404, never requires user session',async()=>{
 const origin='https://example.test',key='secret-probe-key';
 const env={APP_ORIGIN:origin,SESSION_SECRET:'x'.repeat(64),KMA_API_KEY:key,VERCEL_ENV:'preview'};
 const check=await handle(new Request(origin+'/api/radar-probe'),env,async url=>{
  assert.equal(new URL(url).hostname,'apihub.kma.go.kr');
  return new Response(png,{headers:{'Content-Type':'image/png'}});
 });
 assert.equal(check.status,200);
 const data=await check.json();
 assert.ok(data.results.every(x=>x.receivedImage));
 assert.ok(!JSON.stringify(data).includes(key));
 const prod=await handle(new Request(origin+'/api/radar-probe'),{...env,VERCEL_ENV:'production'},async()=>{throw Error('should not fetch');});
 assert.equal(prod.status,404);
});
