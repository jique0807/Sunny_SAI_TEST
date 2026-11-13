import test from 'node:test';import assert from 'node:assert/strict';
import {probeRrAccess} from '../lib/gk2a-rr-probe.mjs';
const now=Date.parse('2026-11-11T06:00:00Z');
test('RR probes distinguish explicit LCC listings from empty defaults without leaking keys',async()=>{
 const result=await probeRrAccess('secret','lists',{now,fetcher:async url=>{
  assert.equal(url.hostname,'apihub.kma.go.kr');
  return new Response(url.searchParams.get('map')==='LC'?'gk2a_ami_le2_rr_ko020lc_202611110540.nc':'#START7777\n#7777END');
 }});
 assert.equal(result.results.find(x=>x.name==='ko').status,'empty');
 assert.equal(result.results.find(x=>x.name==='koLC').latest,'202611110540');
 assert.doesNotMatch(JSON.stringify(result),/secret|authKey/);
});
test('RR uses actual image times then bounded ten-minute alternatives and validates binary signature',async()=>{
 const attempted=[];
 const result=await probeRrAccess('secret','koLC',{now,fetcher:async url=>{
  if(url.pathname.endsWith('sat_file_data_list.php'))return new Response('gk2a_ami_le2_rr_ko020lc_202611110542.png');
  if(url.pathname.endsWith('sat_file_nc_down.php')){
   attempted.push(url.searchParams.get('tm'));
   return new Response(attempted.length===2?new Uint8Array([137,72,68,70,13,10,26,10]):'file missing');
  }
  return new Response('# 출력할 변수를 선택하세요. [RR, DQF_RR]');
 }});
 assert.equal(result.status,'received');assert.deepEqual(attempted,['202611110542','202611110540']);
 assert.equal(result.results[0].nc.status,'file_missing');assert.equal(result.results[1].nc.status,'received');
 assert.doesNotMatch(JSON.stringify(result),/secret/);
});
test('RR never probes arbitrary source types or hides access denial as no rainfall',async()=>{
 assert.equal((await probeRrAccess('key','anything',{now})).status,'invalid_mode');
 const r=await probeRrAccess('key','lists',{now,fetcher:async()=>new Response('denied',{status:403})});
 assert.ok(r.results.every(x=>x.status==='http_error'&&x.http===403));
 assert.equal((await probeRrAccess(null,'lists')).status,'key_missing');
});
