import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyRadarImageMetadata,getRadarImage,visibleRadarMetadata,
 RADAR_TEST_CASE,radarObservationTime} from '../lib/kma-radar-overlay-image.mjs';
import {radarLccToLatLng,radarProjectedPixel,renderRadarImage} from '../public/radar-lab.mjs';
import {handle} from '../lib/api.mjs';
const sourcePath='/data/BUFD/RDR/IMG/rdr_HSP_R_6452416_202407100900_1651918592_0.500000_11_-384032.28_4878817.50_758967.69_3778150.75.png';
const source={meta:{imageCoverageStartProjX:'-385012.875000',imageCoverageStartProjY:'4821054.000000',
 imageCoverageEndProjX:'585174.375000',imageCoverageEndProjY:'3799270.500000'},
 data:{url:sourcePath}};
function image(){const bytes=new Uint8Array(33);
 bytes.set([137,80,78,71,13,10,26,10],0);
 bytes.set([0,0,0,13,73,72,68,82],8);
 const v=new DataView(bytes.buffer);v.setUint32(16,320,false);v.setUint32(20,270,false);
 bytes[24]=8;bytes[25]=6;return bytes;
}
test('only verified provider path, observation time, coverage and basemap-free intent pass',()=>{
 const info=verifyRadarImageMetadata(source,RADAR_TEST_CASE);
 assert.equal(info.projection,'LCC');assert.equal(info.providerBasemap,false);
 assert.ok(info.coverage.left<0&&info.coverage.right>0);
 assert.ok(!JSON.stringify(visibleRadarMetadata(info)).includes(sourcePath));
 assert.equal(radarObservationTime('case'),RADAR_TEST_CASE);
 assert.equal(radarObservationTime('case',Date.now(),1),'202407100850');
 assert.equal(radarObservationTime('case',Date.now(),6),'202407100800');
 assert.equal(radarObservationTime('nearest',Date.parse('2026-11-07T03:13:00Z'),0),'202611071210');
 assert.equal(radarObservationTime('latest',Date.parse('2026-11-07T03:13:00Z'),0),'202611071140');
 assert.equal(radarObservationTime('latest',Date.parse('2026-11-07T03:13:00Z'),1),'202611071130');
 assert.throws(()=>radarObservationTime('case',Date.now(),7),/10-minute frame/);
 assert.throws(()=>radarObservationTime('latest',Date.now(),-1),/10-minute frame/);
 assert.throws(()=>verifyRadarImageMetadata(source,'202407100910'),/different observation time/);
 assert.throws(()=>verifyRadarImageMetadata({...source,data:{url:'https://example.com/x.png'}},RADAR_TEST_CASE),/Untrusted/);
 assert.throws(()=>verifyRadarImageMetadata({...source,meta:{...source.meta,imageCoverageEndProjX:'-500000'}},RADAR_TEST_CASE),/projection bounds/);
});
test('official PNG and time-consistent metadata received exclusively through KMA origin',async()=>{
 const key='not-public',urls=[];
 const fetcher=async u=>{
  const url=new URL(u);urls.push(url);
  assert.equal(url.hostname,'apihub.kma.go.kr');
  if(url.pathname.endsWith('nph-rdr_cmp1_imgp')){
   assert.equal(url.searchParams.get('authKey'),key);
   assert.equal(url.searchParams.get('river'),'off');
   assert.equal(url.searchParams.get('road'),'off');
   assert.equal(url.searchParams.get('city'),'off');
   return new Response(JSON.stringify(source),{headers:{'content-type':'text/html'}});
  }
  assert.equal(url.pathname,sourcePath);
  return new Response(image(),{headers:{'content-type':'image/png'}});
 };
 const result=await getRadarImage(key,'case',fetcher);
 assert.equal(result.width,320);assert.equal(result.height,270);
 assert.equal(result.colorType,6);assert.equal(result.bytes.length,33);
 assert.equal(result.metadata.timeKst,RADAR_TEST_CASE);
 assert.equal(urls.length,2);
});
test('preview endpoints are session protected and never disclose API keys',async()=>{
 const root='https://sunny-radar.test',key='other-secret';
 const env={APP_ORIGIN:root,SESSION_SECRET:'x'.repeat(64),KMA_API_KEY:key,VERCEL_ENV:'preview'};
 const route=root+'/api/radar-overlay-meta?mode=case';
 const without=await handle(new Request(route),env);assert.equal(without.status,401);
 const create=await handle(new Request(root+'/api/session'),env),cookie=create.headers.getSetCookie()[0].split(';')[0];
 const result=await handle(new Request(route,{headers:{Cookie:cookie}}),env,async u=>{
  if(new URL(u).pathname.endsWith('nph-rdr_cmp1_imgp'))return new Response(JSON.stringify(source));
  return new Response(image());
 });
 assert.equal(result.status,200);
 const parsed=await result.json();
 assert.equal(parsed.projection,'LCC');
 assert.ok(!JSON.stringify(parsed).includes(key));
 assert.ok(!JSON.stringify(parsed).includes(sourcePath));
 const prod=await handle(new Request(root+'/api/radar-overlay-meta?mode=case',{headers:{Cookie:cookie}}),
  {...env,VERCEL_ENV:'production'},async()=>{throw Error('invalid input must not fetch');});
 assert.equal(prod.status,404);
});
test('projected pixel geometry maps true geographic control reference and meshes without invented pixels',()=>{
 // KMA LCC spherical 30/60 parallels, lon0=126, lat0=0; inverse is marked experimental.
 const ref=radarLccToLatLng(0,4589500);
 assert.ok(Math.abs(ref.lat-38)<0.03&&Math.abs(ref.lng-126)<0.001);
 const bounds={left:-385012.875,top:4821054,right:585174.375,bottom:3799270.5};
 assert.deepEqual(radarProjectedPixel(0,0,320,270,bounds),{x:bounds.left,y:bounds.top});
 assert.deepEqual(radarProjectedPixel(320,270,320,270,bounds),{x:bounds.right,y:bounds.bottom});
 const calls=[];
 const ctx={save(){},restore(){},setTransform(){},beginPath(){},moveTo(){},
  lineTo(){},closePath(){},clip(){},transform(){},drawImage(){calls.push(1);}};
 const count=renderRadarImage(ctx,{width:320,height:270},bounds,
  p=>({x:p.lng*100,y:p.lat*100}),1,2);
 assert.equal(count,4);assert.equal(calls.length,8);
});
test('radar lab shows a separate historical test mode and marks geolocation as unverified',()=>{
 const html=readFileSync(new URL('../public/radar-lab.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/radar-lab.mjs',import.meta.url),'utf8');
 assert.match(html,/과거 사례 · 2024\.07\.10 09:00/);
 assert.match(html,/이 화면은 연구용 중첩 시험입니다/);
 assert.match(html,/투영좌표 정합을 검증하기 전까지 운전 판단에 사용할 수 없습니다/);
 assert.match(js,/api\/radar-overlay-frame/);
 assert.match(js,/x-radar-obs-kst/);
 assert.match(js,/x-radar-coverage/);
 assert.match(js,/AUTO_REFRESH_MS=600000/);
 assert.match(js,/ANIMATION_HOLD_MS=2600/);
 assert.match(js,/카카오맵/);
 for(const id of ['radarEarlier','radarLater','radarFrameRange','radarPlay','radarPause','radarAutoUpdate'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/표출 간격: 10분/);
});

test('HSR 10-minute image endpoint returns one synchronized PNG and timestamp',async()=>{
 const root='https://sunny-radar-frame.test',key='other-frame-secret';
 const env={APP_ORIGIN:root,SESSION_SECRET:'x'.repeat(64),KMA_API_KEY:key,VERCEL_ENV:'preview'};
 const create=await handle(new Request(root+'/api/session'),env);
 const cookie=create.headers.getSetCookie()[0].split(';')[0];
 const url=root+'/api/radar-overlay-frame?mode=case&frame=1';
 const requested=[];
 const fetcher=async u=>{
  const target=new URL(u);requested.push(target);
  if(target.pathname.endsWith('nph-rdr_cmp1_imgp')){
   assert.equal(target.searchParams.get('tm'),'202407100850');
   const tmSource={...source,data:{url:sourcePath.replace('202407100900','202407100850')}};
   return new Response(JSON.stringify(tmSource),{headers:{'content-type':'text/html'}});
  }
  assert.equal(target.pathname,sourcePath.replace('202407100900','202407100850'));
  return new Response(image(),{headers:{'content-type':'image/png'}});
 };
 const result=await handle(new Request(url,{headers:{Cookie:cookie}}),env,fetcher);
 assert.equal(result.status,200);
 assert.equal(result.headers.get('x-radar-obs-kst'),'202407100850');
 assert.equal(result.headers.get('x-radar-interval-minutes'),'10');
 assert.equal(result.headers.get('x-radar-frame'),'1');
 assert.equal(result.headers.get('content-type'),'image/png');
 const bounds=result.headers.get('x-radar-coverage').split(',').map(Number);
 assert.equal(bounds.length,4);assert.ok(bounds[2]>bounds[0]);
 assert.equal(requested.length,2);
 const bad=await handle(new Request(root+'/api/radar-overlay-frame?mode=case&frame=7',
  {headers:{Cookie:cookie}}),env,fetcher);
 assert.equal(bad.status,400);
 const prod=await handle(new Request(url,{headers:{Cookie:cookie}}),
  {...env,VERCEL_ENV:'production'},fetcher);
 assert.equal(prod.status,200);
});
