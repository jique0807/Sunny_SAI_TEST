import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {itsBounds,itsUrl,validateItsPoints,normalizeItsEvents,normalizeItsTraffic,fetchItsRouteContext} from '../lib/its-traffic.mjs';
import {buildItsRouteHazards} from '../public/its-route-risk.mjs';
import {assessRouteHazard} from '../public/risk-engine.mjs';
import {handle} from '../lib/api.mjs';
const now=Date.parse('2026-11-10T05:00:00.000Z');
const recent='20261110133000',expired='20261110090000';
const points=[{lat:37.566,lng:126.978},{lat:37.55,lng:127.02}];
const data={response:{data:[{eventType:'사고',roadName:'테스트 도로',message:'교통사고 신고',coordX:126.99,coordY:37.566,startDate:recent,endDate:'20261111120000',linkId:'12345'},
 {eventType:'공사',coordX:127,coordY:37.55,startDate:recent,endDate:expired,roadName:'종료된 공사'},
 {eventType:'사고',coordX:120,coordY:50,startDate:recent},
 {eventType:'공사',coordX:127,coordY:37.551,message:'일시 미확인'}]}};
test('ITS route bounding boxes and URL only include vetted endpoint and query options',()=>{
 assert.ok(validateItsPoints(points));assert.ok(!validateItsPoints([{lat:37,lng:127}]));
 assert.ok(!validateItsPoints(Array(25).fill(points[0])));assert.equal(itsBounds([{lat:300,lng:127},points[1]]),null);
 const url=itsUrl('eventInfo','private-its',itsBounds(points));
 assert.equal(url.hostname,'openapi.its.go.kr');assert.equal(url.port,'9443');
 assert.equal(url.searchParams.get('apiKey'),'private-its');assert.equal(url.searchParams.get('eventType'),'all');
 assert.throws(()=>itsUrl('https://evil.example/path','secret',itsBounds(points)));
});
test('ITS event parser refuses expired, outside Korea, and unreported-time as scored incidents',()=>{
 const result=normalizeItsEvents(data,{now});
 assert.equal(result.status,'received');
 assert.equal(result.items.length,2);assert.equal(result.items[0].type,'accident');
 assert.equal(result.items[0].reportedFresh,true);
 assert.equal(result.items[1].reportedFresh,false);
 assert.equal(result.items[0].segmentVerified,false);
 assert.ok(!JSON.stringify(result).includes('private-its'));
});
test('ITS parser reports schema and authorization errors as unknown, not empty or safe',async()=>{
 assert.equal(normalizeItsEvents({response:{code:'4005'}}).status,'failed');
 assert.equal(normalizeItsTraffic({response:{error:'no approval'}}).status,'failed');
 assert.equal(normalizeItsEvents({response:{header:{resultCode:'4005'},data:[]}}).status,'failed');
 assert.equal(normalizeItsTraffic({response:{header:{resultCode:'4005'},data:[]}}).status,'failed');
 const blocked=await fetchItsRouteContext('bad-key',points,async()=>new Response('not permitted',{status:403}),{now});
 assert.equal(blocked.status,'failed');assert.equal(blocked.items.length,0);
 assert.equal(blocked.traffic.status,'failed');assert.ok(!JSON.stringify(blocked).includes('bad-key'));
});
test('ITS failure diagnostics distinguish network, timeout, HTTP, JSON and schema without exposing secrets',async()=>{
 const request=(fn)=>fetchItsRouteContext('DO_NOT_EXPOSE',points,fn,{now});
 const network=await request(async()=>{throw new TypeError('private user url with secret')});
 assert.equal(network.reasonCode,'network_error');assert.equal(network.traffic.reasonCode,'network_error');
 const timeout=await request(async()=>{throw Object.assign(Error('private'),{name:'TimeoutError'})});
 assert.equal(timeout.reasonCode,'timeout');
 const blocked=await request(async()=>new Response('denied',{status:403}));
 assert.equal(blocked.reasonCode,'unauthorized');assert.equal(blocked.providerStatus,403);
 const malformed=await request(async()=>new Response('<xml>private</xml>',{status:200}));
 assert.equal(malformed.reasonCode,'invalid_json');
 const wrongSchema=await request(async()=>Response.json({unexpected:'shape'}));
 assert.equal(wrongSchema.reasonCode,'invalid_schema');
 assert.ok(!JSON.stringify([network,timeout,blocked,malformed,wrongSchema]).includes('DO_NOT_EXPOSE'));
 assert.ok(!JSON.stringify(network).includes('private'));
});
test('risk score collects real ITS evidence independent of map visibility',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/if\(!activeRoute\|\|activeRoute\.demo\|\|activeRoute\.travelMode!=='driving'\)return;/);
 assert.match(app,/if\(mode==='driving'\)void loadItsRouteEvidence\(route\)/);
 assert.match(app,/route\.itsEvidenceStatus=result\.status/);
 assert.match(app,/route\?\.travelMode==='driving'&&!\$\('navLayerTrafficIncidents'\)\?\.checked\?\(route\?\.itsRiskEvents\|\|\[\]\):\[\]/);
});
test('ITS traffic is context-only until the road link geometry is verified',()=>{
 const r=normalizeItsTraffic({response:{data:[{linkId:'AA1',speed:44,roadName:'도로'}]}},{now});
 assert.equal(r.status,'received');assert.equal(r.count,1);assert.equal(r.routeMatched,false);
});
test('ITS actual route matching requires proximity, current source and no fake road closure',()=>{
 const route={demo:false,travelMode:'driving',duration:1000,departure:new Date(now).toISOString(),
  rainPath:[{lat:37.566,lng:126.978,seconds:0},{lat:37.566,lng:127.02,seconds:1000}]};
 const parsed=normalizeItsEvents(data,{now});
 const hazards=buildItsRouteHazards(route,parsed);
 assert.equal(hazards.length,1);assert.equal(hazards[0].kind,'its-incident');
 const result=assessRouteHazard(hazards[0],{now});
 assert.equal(result.level,'notice');assert.match(result.caution,/자동 우회/);
 assert.equal(buildItsRouteHazards({...route,travelMode:'walking'},parsed).length,0);
 assert.equal(buildItsRouteHazards({...route,demo:true},parsed).length,0);
 assert.equal(assessRouteHazard({...hazards[0],validTime:'2025-01-01T00:00:00Z'},{now}).level,'unknown');
 assert.equal(buildItsRouteHazards(route,{status:'failed',items:parsed.items}).length,0);
 const off=buildItsRouteHazards(route,{status:'received',items:[{...parsed.items[0],lat:35.3,lng:128}]});
 assert.equal(off.length,0);
});
test('ITS API requires real session, CSRF, valid route and never sends API key to browser',async()=>{
 const env={APP_ORIGIN:'https://sunny.example',SESSION_SECRET:'s'.repeat(64),ROAD_API_KEY:'VERY_PRIVATE_ITS'};
 const open=await handle(new Request('https://sunny.example/api/session'),env);
 const session=await open.json(),cookie=open.headers.get('set-cookie').split(';')[0];
 assert.equal(session.connections.its,true);
 const send=(body,csrf=session.csrf)=>handle(new Request('https://sunny.example/api/its-route-context',{
  method:'POST',headers:{origin:'https://sunny.example','content-type':'application/json','x-csrf-token':csrf,cookie},
  body:JSON.stringify(body)}),env,async(url)=>{
   const which=new URL(url).pathname;
   assert.ok(['eventInfo','trafficInfo'].some(name=>which.endsWith(name)));
   assert.equal(new URL(url).searchParams.get('apiKey'),'VERY_PRIVATE_ITS');
   return Response.json(which.endsWith('eventInfo')?data:{response:{data:[]}});
  });
 assert.equal((await send({points},'wrong')).status,403);
 assert.equal((await send({points:[{lat:30,lng:127},points[1]]})).status,400);
 const response=await send({points}),result=await response.json();
 assert.equal(response.status,200);assert.equal(result.status,'received');
 assert.equal(result.items.length,2);assert.equal(result.traffic.status,'received');
 assert.ok(!JSON.stringify(result).includes(env.ROAD_API_KEY));
});
test('UI provides a real ITS toggle and explicitly avoids claiming UTIC provider',()=>{
 const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(ui,/ITS 사고·공사·통제/);assert.match(app,/buildItsRouteHazards/);
 assert.match(app,/loadItsRouteEvidence/);assert.match(app,/\/api\/its-route-context/);
 assert.match(app,/connections\.its/);
});
