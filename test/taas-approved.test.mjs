import {test} from 'node:test';
import assert from 'node:assert/strict';
import {taasHighwayUrl,taasPedestrianWmsUrl,parseHighwayRisk,probeTaasHighway,probeTaasPedestrianWms} from '../lib/koroad-approved.mjs';
import {handle} from '../lib/api.mjs';
const highwaySample={resultCode:'00',items:{item:[
 {index:1,line_string:'(127.1016593314 37.3911161189,127.1020371615 37.3893387647)',anals_value:'5.80',anals_grd:'03'},
 {index:2,line_string:'(127.10 37.39,127.12 37.38)',anals_value:'1.10',anals_grd:'01'},
 {index:3,line_string:'(170 37,171 37)',anals_value:'4.00',anals_grd:'03'}
]}};
const image=new Uint8Array([137,80,78,71,13,10,26,10,0,1,2,3]);
test('TAAS highway uses only approved fixed roadway and official required parameters',()=>{
 const u=taasHighwayUrl('TAAS_SECRET');
 assert.equal(u.hostname,'opendata.koroad.or.kr');assert.equal(u.searchParams.get('frwyNm'),'경부고속도로');
 assert.equal(u.searchParams.get('frwySctnNm'),'판교IC-신갈JC');assert.equal(u.searchParams.get('vhctyCd'),'01');
 assert.equal(u.searchParams.get('authKey'),'TAAS_SECRET');
 const r=parseHighwayRisk(highwaySample);
 assert.equal(r.status,'received');assert.equal(r.count,2);assert.equal(r.grades['03'],1);
 assert.equal(r.routeMatched,false);assert.ok(!JSON.stringify(r).includes('TAAS_SECRET'));
 assert.equal(parseHighwayRisk({resultCode:'03'}).status,'empty');
 assert.equal(parseHighwayRisk({response:{error:'not approved'}}).status,'failed');
});
test('TAAS pedestrian WMS requests 2024 image only and never guesses live crashes',async()=>{
 const u=taasPedestrianWmsUrl('TAAS_SECRET');
 assert.equal(u.searchParams.get('layers'),'frepedstrians');
 assert.equal(u.searchParams.get('service'),'WMS');assert.equal(u.searchParams.get('searchYearCd'),'2024');
 const result=await probeTaasPedestrianWms('TAAS_SECRET',async(url)=>{
  assert.equal(new URL(url).searchParams.get('authKey'),'TAAS_SECRET');
  return new Response(image,{headers:{'content-type':'image/png'}});
 });
 assert.equal(result.status,'received');assert.equal(result.renderedToMap,false);
 assert.ok(!JSON.stringify(result).includes('TAAS_SECRET'));
 const wrong=await probeTaasPedestrianWms('TAAS_SECRET',async()=>Response.json({error:'unauthorized'}));
 assert.equal(wrong.status,'failed');
});
test('TAAS highway API preflight reports unapproved responses without false safety assertion',async()=>{
 const r=await probeTaasHighway('TAAS_SECRET',async()=>Response.json({error:'not authorized'}));
 assert.equal(r.status,'failed');assert.ok(!JSON.stringify(r).includes('TAAS_SECRET'));
});
test('TAAS fixed diagnostics are preview-only, never expose either credential',async()=>{
 const env={APP_ORIGIN:'https://sunny.example',SESSION_SECRET:'s'.repeat(64),
  VERCEL_ENV:'preview',KOROAD_API_KEY:'HIDDEN_TAAS',ROAD_API_KEY:'HIDDEN_ITS'};
 const bad=await handle(new Request('https://sunny.example/api/taas-approved-diagnostic?bbox=any'),env,async()=>{throw Error('must not run')});
 assert.equal(bad.status,400);
 let calls=0;
 const response=await handle(new Request('https://sunny.example/api/taas-approved-diagnostic'),env,async(url)=>{
  calls++;
  if(url.includes('/highway'))return Response.json(highwaySample);
  assert.ok(url.includes('/wms/'));return new Response(image,{headers:{'content-type':'image/png'}});
 });
 assert.equal(response.status,200);const data=await response.json();
 assert.equal(calls,2);assert.equal(data.wms.status,'received');assert.equal(data.highway.status,'received');
 assert.equal(data.riskAction,'diagnostic-only');
 assert.ok(!JSON.stringify(data).includes(env.KOROAD_API_KEY));
 const prod=await handle(new Request('https://sunny.example/api/taas-approved-diagnostic'),{...env,VERCEL_ENV:'production'},async()=>{throw Error('must not run')});
 assert.equal(prod.status,404);
});
