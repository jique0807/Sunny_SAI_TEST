import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PEDESTRIAN_WMS_KINDS,validTaasMapBounds,centerFromBounds,districtFromKakao,buildTaasMapUrl,fetchTaasMapImage} from '../lib/taas-pedestrian-wms-map.mjs';
import {visibleTaasBounds} from '../public/taas-pedestrian-wms-overlay.mjs';
import {evaluateRouteRisk} from '../public/safe-route-engine.mjs';
import {handle} from '../lib/api.mjs';
const bbox={west:126.965,south:37.552,east:127.010,north:37.576};
const kakaoDistrict={documents:[{region_type:'H',code:'1114055000'},{region_type:'B',code:'1114010100',region_1depth_name:'서울특별시',region_2depth_name:'중구'}]};
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,2,0,0,0,2,0,8,6]);
const mock=(url)=>{
 const u=new URL(url);
 if(u.hostname==='dapi.kakao.com'){
  assert.equal(u.pathname,'/v2/local/geo/coord2regioncode.json');
  return Response.json(kakaoDistrict);
 }
 assert.equal(u.hostname,'opendata.koroad.or.kr');
 assert.equal(u.searchParams.get('authKey'),'SERVER_KEY');
 assert.equal(u.searchParams.get('searchYearCd'),'2024');
 assert.equal(u.searchParams.get('siDo'),'11');
 assert.equal(u.searchParams.get('guGun'),'140');
 assert.equal(u.searchParams.get('srs'),'EPSG:4326');
 assert.equal(u.searchParams.get('format'),'image/png');
 return new Response(png,{headers:{'content-type':'image/png'}});
};
test('TAAS 2024 pedestrian child elderly WMS coordinates and jurisdiction are validated',()=>{
 assert.equal(Object.keys(PEDESTRIAN_WMS_KINDS).length,3);
 assert.equal(validTaasMapBounds(bbox),true);
 assert.equal(validTaasMapBounds({...bbox,east:133}),false);
 assert.equal(validTaasMapBounds({...bbox,west:125}),false);
 assert.deepEqual(districtFromKakao(kakaoDistrict),{siDo:'11',guGun:'140',label:'서울특별시 중구',code:'11140'});
 assert.equal(centerFromBounds(bbox).lat,(bbox.north+bbox.south)/2);
 for(const [kind,layer]of [['pedestrian','frepedstrians'],['child','frechild'],['elderly','freoldman']]){
  const u=buildTaasMapUrl('SERVER_KEY',kind,bbox,{siDo:'11',guGun:'140'});
  assert.equal(u.searchParams.get('layers'),layer);
  assert.equal(u.searchParams.get('bbox'),'126.965000,37.552000,127.010000,37.576000');
 }
 assert.throws(()=>buildTaasMapUrl('SERVER_KEY','restriction',bbox,{siDo:'11',guGun:'140'}));
});
test('TAAS map overlay refuses out-of-area zoom and accepts valid Kakao bounds only',()=>{
 const map={getBounds:()=>({getSouthWest:()=>({getLat:()=>bbox.south,getLng:()=>bbox.west}),
  getNorthEast:()=>({getLat:()=>bbox.north,getLng:()=>bbox.east})})};
 assert.deepEqual(visibleTaasBounds(map),bbox);
 assert.equal(visibleTaasBounds({getBounds:()=>({getSouthWest:()=>({getLat:()=>34,getLng:()=>125}),getNorthEast:()=>({getLat:()=>39,getLng:()=>131})})}),null);
});
test('all three approved WMS images have real PNG signatures and never expose authentication',async()=>{
 for(const kind of ['pedestrian','child','elderly']){
  const result=await fetchTaasMapImage({key:'SERVER_KEY',kakaoKey:'KAKAO_SECRET',kind,bounds:bbox,fetcher:mock});
  assert.equal(result.status,'received');assert.equal(result.year,'2024');assert.equal(result.districtCode,'11140');
  assert.deepEqual(Array.from(result.bytes),Array.from(png));
  assert.ok(!JSON.stringify({...result,bytes:null}).includes('SERVER_KEY'));
 }
 const bad=await fetchTaasMapImage({key:'SERVER_KEY',kakaoKey:'KAKAO_SECRET',kind:'child',bounds:bbox,
  fetcher:async url=>url.includes('dapi.kakao.com')?Response.json(kakaoDistrict):Response.json({error:'unapproved'})});
 assert.equal(bad.status,'failed');
 const missing=await fetchTaasMapImage({key:'',kakaoKey:'KAKAO_SECRET',kind:'child',bounds:bbox});
 assert.equal(missing.status,'missing');
});
test('WMS image endpoint is private, CSRF-checked and rejects unbounded user requests',async()=>{
 const env={APP_ORIGIN:'https://sunny.example',SESSION_SECRET:'s'.repeat(64),KOROAD_API_KEY:'SERVER_KEY',KAKAO_REST_API_KEY:'KAKAO_SECRET'};
 const sessionResp=await handle(new Request('https://sunny.example/api/session'),env);
 const session=await sessionResp.json();
 const cookie=sessionResp.headers.get('set-cookie').split(';')[0];
 assert.equal(session.connections.taasWms,true);
 const post=(body,token=session.csrf)=>handle(new Request('https://sunny.example/api/taas-pedestrian-map',{
  method:'POST',headers:{origin:env.APP_ORIGIN,'content-type':'application/json','x-csrf-token':token,cookie},
  body:JSON.stringify(body)}),env,mock);
 assert.equal((await post({kind:'pedestrian',bounds:bbox},'wrong')).status,403);
 assert.equal((await post({kind:'events',bounds:bbox})).status,400);
 assert.equal((await post({kind:'elderly',bounds:{...bbox,east:132}})).status,400);
 const ok=await post({kind:'child',bounds:bbox});
 assert.equal(ok.status,200);assert.equal(ok.headers.get('content-type'),'image/png');
 assert.equal(ok.headers.get('X-TAAS-Year'),'2024');
 assert.equal(ok.headers.get('X-TAAS-Region-Code'),'11140');
 assert.ok(![...ok.headers.values()].join().includes('SERVER_KEY'));
 assert.deepEqual(Array.from(new Uint8Array(await ok.arrayBuffer())),Array.from(png));
});
test('separate risk engines do not conflate ITS motor incidents and TAAS pedestrian accident history',()=>{
 const now=Date.parse('2026-11-10T05:00:00Z');
 const route={duration:240,distance:750,departure:new Date(now).toISOString(),samples:[
  {lat:37.56,lng:126.98,seconds:80},{lat:37.561,lng:126.981,seconds:160}],
  rainPath:[{lat:37.56,lng:126.98,seconds:0},{lat:37.562,lng:126.982,seconds:240}]};
 const common={lat:37.561,lng:126.981,seconds:120,eta:new Date(now+120000).toISOString()};
 const incidents={...common,kind:'its-incident',validTime:new Date(now-900000).toISOString(),
  provider:'국가교통정보센터 ITS',reportedFresh:true,segmentVerified:false,distanceToPath:7};
 const pedestrian={...common,kind:'pedestrian-hotspot',provider:'한국도로교통공단 TAAS',
  historic:true,live:false,year:'2024',accidentCount:9};
 const drive=evaluateRouteRisk({...route,travelMode:'driving'},{extraHazards:[incidents,pedestrian],mode:'driving',now});
 const walk=evaluateRouteRisk({...route,travelMode:'walking'},{extraHazards:[incidents,pedestrian],mode:'walking',now});
 assert.deepEqual(drive.signals.map(x=>x.kind),['its-incident']);
 assert.deepEqual(walk.signals.map(x=>x.kind),['pedestrian-hotspot']);
 assert.equal(drive.unknownSignals,1);
 assert.equal(walk.unknownSignals,1);
});
test('pedestrian WMS controls are in the walking category and ITS control in the road category',()=>{
 const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const road=ui.indexOf('지도에 표시'),walking=ui.indexOf('교통·보행 정보');
 assert.ok(road>=0&&walking>road);
 assert.ok(ui.indexOf('navLayerTrafficIncidents')<walking);
 for(const id of ['navLayerPedestrianWms','navLayerChildWms','navLayerElderlyWms']){
  assert.ok(ui.indexOf(id)>walking);assert.match(app,new RegExp(id)); 
 }
 assert.match(app,/taasPedestrianWms\.repaint\(\)/);
 assert.match(app,/taasPedestrianWms\.setAvailable/);
});
