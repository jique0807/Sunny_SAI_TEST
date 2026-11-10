import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseKoroadPedestrianHotspots,fetchKoroadPedestrianHotspots} from '../lib/koroad-pedestrian.mjs';
import {displayablePedestrianHotspots} from '../public/koroad-hotspot-overlay.mjs';
import {handle} from '../lib/api.mjs';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const source={resultCode:'00',items:{item:[
 {bjd_cd:'1114010100',spot_nm:'서울 중구 교차로 일대',lo_crd:'126.9762',la_crd:'37.5651',occrrnc_cnt:7,caslt_cnt:10},
 {bjd_cd:'1168010100',spot_nm:'강남구 다른 지역',lo_crd:'127.05',la_crd:'37.50',occrrnc_cnt:10,caslt_cnt:10},
 {bjd_cd:'1114010100',spot_nm:'잘못된 좌표',lo_crd:'-1',la_crd:'500',occrrnc_cnt:99999}
]}};
test('only geo-verified Seoul Jung-gu historical pedestrian clusters appear on map',()=>{
 const result=parseKoroadPedestrianHotspots(source);
 assert.equal(result.status,'received');assert.equal(result.items.length,1);
 assert.equal(result.items[0].historic,true);assert.equal(result.items[0].live,false);
 assert.equal(displayablePedestrianHotspots(result).length,1);
 assert.equal(displayablePedestrianHotspots({...result,items:[{...result.items[0],historic:false}]}).length,0);
});
test('server fixed-parameter KOROAD request keeps credentials private and identifies 2024',async()=>{
 const key='KEEP_PRIVATE_KOROAD';let called=0;
 const result=await fetchKoroadPedestrianHotspots(key,async(url)=>{
  called++;const parsed=new URL(url);
  assert.equal(parsed.origin,'https://opendata.koroad.or.kr');
  assert.equal(parsed.searchParams.get('authKey'),key);
  assert.equal(parsed.searchParams.get('searchYearCd'),'2024');
  assert.equal(parsed.searchParams.get('siDo'),'11');assert.equal(parsed.searchParams.get('guGun'),'140');
  return Response.json(source);
 });
 assert.equal(called,1);assert.equal(result.status,'received');
 assert.ok(!JSON.stringify(result).includes(key));
 assert.ok(!('geom_json' in result.items[0]));
});
test('failed or missing credentials never appear as observed low accident risk',async()=>{
 const missing=await fetchKoroadPedestrianHotspots('');
 assert.equal(missing.status,'missing');assert.deepEqual(missing.items,[]);
 const failed=await fetchKoroadPedestrianHotspots('invalid',async()=>new Response('auth denied',{status:403}));
 assert.equal(failed.status,'failed');assert.equal(failed.providerStatus,403);assert.deepEqual(failed.items,[]);
});
test('session exposes only availability, not KOROAD secret',async()=>{
 const env={APP_ORIGIN:'https://sunny.example',SESSION_SECRET:'s'.repeat(64),KOROAD_API_KEY:'hiddenKoroad'};
 const r=await handle(new Request('https://sunny.example/api/session'),env);
 assert.equal(r.status,200);const j=await r.json();
 assert.equal(j.connections.koroad,true);assert.ok(!JSON.stringify(j).includes(env.KOROAD_API_KEY));
});
test('real KOROAD toggle is conditional, UTIC remains disabled, walking demo remains separate',()=>{
 assert.match(app,/koroadHotspots.setAvailable\(connections.koroad\)/);
 assert.match(ui,/id="navLayerPedestrianHotspots" type="checkbox" disabled/);
 assert.match(ui,/id="navLayerTrafficIncidents" type="checkbox" disabled/);
 assert.match(app,/chooseWalkingDemoShelter/);
});

test('KOROAD API does not accept custom regions or arbitrary query parameters',async()=>{
 const env={APP_ORIGIN:'https://sunny.example',SESSION_SECRET:'s'.repeat(64),KOROAD_API_KEY:'no-leak'};
 const r=await handle(new Request('https://sunny.example/api/koroad-pedestrian-hotspots?siDo=11'),env,async()=>{throw Error('not called')});
 assert.equal(r.status,400);assert.ok(!(await r.text()).includes('no-leak'));
});
