import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeGk2aImages,probeGk2aCiVariants} from '../lib/gk2a-image-probe.mjs';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('../lib/api.mjs',import.meta.url),'utf8');
const png=new Uint8Array(32);png.set([137,80,78,71,13,10,26,10]);png.set([0,0,1,144,0,0,1,44],16);
test('GK2A preview diagnostic stays server-side, fixed product list, rate-limited',()=>{
 assert.match(api,/path==='\/api\/gk2a-image-probe'&&req\.method==='GET'/);
 assert.match(api,/env\.VERCEL_ENV!=='preview'/);
 assert.match(api,/if\(!limit\('gk2a-image-probe',1\)\)/);
});
test('GK2A RR CI FOG API uses key but returns no secrets or request URLs',async()=>{
 const calls=[];
 const fetcher=async url=>{
  const u=new URL(url);calls.push(u);
  assert.equal(u.hostname,'apihub.kma.go.kr');
  assert.equal(u.searchParams.get('authKey'),'private-test-key');
  if(u.pathname.endsWith('sat_file_data_list.php'))return new Response(
   'gk2a_ami_le2_'+u.searchParams.get('data')+'_ko020lc_202611101200.png',{status:200,headers:{'content-type':'text/plain'}});
  return new Response(png,{status:200,headers:{'content-type':'image/png','content-length':'32'}});
 };
 const result=await probeGk2aImages('private-test-key',fetcher,Date.parse('2026-11-10T15:00:00Z'));
 assert.equal(result.status,'all_images_received');
 assert.equal(result.imagesReceived,3);
 assert.ok(result.results.every(x=>x.list.status==='files_listed'));
 assert.ok(result.results.every(x=>x.image.requestedUTC==='202611101200'));
 assert.deepEqual(result.results.map(x=>x.product),['RR','CI','FOG']);
 assert.ok(result.results.every(x=>x.image.width===400&&x.image.height===300));
 assert.equal(calls.length,6);
 assert.ok(calls.some(u=>u.searchParams.get('data')==='ci-ci1'));
 assert.ok(calls.filter(u=>u.pathname.endsWith('sat_file_img_down.php')).every(u=>u.searchParams.get('area')==='ko'));
 assert.doesNotMatch(JSON.stringify(result),/private-test-key|authKey|https:\/\//);
});
test('missing key never fetches',async()=>{
 const result=await probeGk2aImages('',()=>{throw Error('unexpected fetch');});
 assert.equal(result.status,'key_missing');
});

test('CI variants include official ELA extent and never use untrusted user input',async()=>{
 const calls=[];
 const fake=async url=>{
  const u=new URL(url);calls.push(u);
  if(u.pathname.endsWith('sat_file_data_list.php'))return new Response('gk2a_ami_le2_ci-ci1_ko020lc_202611101200.png',{status:200});
  return new Response(png,{status:200});
 };
 const data=await probeGk2aCiVariants('test-key',fake,Date.parse('2026-11-10T15:00:00Z'));
 assert.equal(data.results.length,4);
 assert.ok(data.results.some(x=>x.area==='ela'&&x.element==='ci-ci1'));
 assert.ok(calls.some(u=>u.searchParams.get('area')==='ela'&&u.searchParams.get('map')==='LC'));
 assert.ok(data.working.length>0);
 assert.doesNotMatch(JSON.stringify(data),/test-key|authKey/);
});
