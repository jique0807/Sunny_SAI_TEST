import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseKoroadPedestrianHotspots,TAAS_REST_TYPES} from '../lib/koroad-pedestrian.mjs';
import {fetchTaasRestMap,filterRestAccidents} from '../lib/taas-rest-map.mjs';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const api=readFileSync(new URL('../lib/api.mjs',import.meta.url),'utf8');
const raw={resultCode:'00',items:{item:[{bjd_cd:'1114000000',la_crd:'37.565',lo_crd:'126.975',spot_nm:'서울 과거 사고지역',occrrnc_cnt:3,caslt_cnt:4}]}};
test('TAAS REST type mapping and historical attributes are preserved',()=>{
 assert.deepEqual(Object.keys(TAAS_REST_TYPES),['pedestrian','child','elderly']);
 for(const kind of Object.keys(TAAS_REST_TYPES)){
  const data=parseKoroadPedestrianHotspots(raw,{kind,context:{siDo:'11',guGun:'140',year:'2024',region:'서울 중구'}});
  assert.equal(data.status,'received');assert.equal(data.items[0].kind,kind);
  assert.equal(data.items[0].historic,true);assert.equal(data.items[0].live,false);
 }
});
test('REST bounds filter never fabricates off-map accident markers',()=>{
 const p=parseKoroadPedestrianHotspots(raw,{context:{siDo:'11',guGun:'140',year:'2024'}}).items;
 assert.equal(filterRestAccidents(p,'pedestrian',{west:126.96,east:126.98,south:37.55,north:37.58}).length,1);
 assert.equal(filterRestAccidents(p,'pedestrian',{west:127,east:127.02,south:37.55,north:37.58}).length,0);
});
test('TAAS REST map requests correct provider kind with no token leakage',async()=>{
 const requested=[];
 const fetcher=async url=>{const u=new URL(url);requested.push(u);
  return u.hostname==='dapi.kakao.com'
   ?new Response(JSON.stringify({documents:[{region_type:'B',code:'1114000000',region_1depth_name:'서울',region_2depth_name:'중구'}]}))
   :new Response(JSON.stringify(raw));};
 const result=await fetchTaasRestMap({koroadKey:'secret-taas',kakaoKey:'secret-kakao',kind:'child',
  bounds:{west:126.96,east:126.98,south:37.55,north:37.58},fetcher});
 assert.equal(result.status,'received');assert.equal(result.items.length,1);
 assert.equal(requested[1].pathname,'/data/rest/frequentzone/child');
 assert.doesNotMatch(JSON.stringify(result),/secret-taas|secret-kakao|authKey/);
});
test('route and map layers keep REST non-live; WMS no longer powers three display toggles',()=>{
 assert.match(app,/initTaasRestOverlay/);
 assert.match(api,/path==='\/api\/taas-rest-map'/);
 assert.match(ui,/위성 영상/);assert.match(ui,/navNationalRadar/);
 assert.match(ui,/TAAS REST는 2024년 과거 사고자료/);
 assert.doesNotMatch(app,/initTaasPedestrianWmsOverlay/);
});
