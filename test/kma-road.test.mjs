import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractZipFiles,geolocatedRisks,kmaRoadRisk,ROAD_NAMES} from '../lib/kma-road.mjs';
import {displayableRisks} from '../public/road-risk-overlay.mjs';
import {handle} from '../lib/api.mjs';
function makeZip(filename,source){
 const name=Buffer.from(filename),data=Buffer.from(source);
 const local=Buffer.alloc(30);
 local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
 local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
 const central=Buffer.alloc(46);
 central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
 central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);
 const offset=local.length+name.length+data.length;
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);
 end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([local,name,data,central,name,end]);
}
const csv='LAT,LON,ICE_RISK,VISIBILITY_RISK,LINK_ID\n37.501,127.001,주의,안전,42001\n37.502,127.002,안전,위험,42002';
test('KMA road risk official route codes and archive parser handle known text content',()=>{
 assert.equal(ROAD_NAMES['001'],'경부');
 const zip=makeZip('risk.csv',csv),files=extractZipFiles(zip),x=geolocatedRisks(files,'001');
 assert.equal(files.length,1);assert.equal(x.locations.length,2);
 assert.equal(x.locations[0].kind,'ice');assert.equal(x.locations[0].risk,2);
 assert.deepEqual(x.locations[0].geometry.points,[{lat:37.501,lng:127.001}]);
 assert.equal(x.locations[1].kind,'visibility');assert.equal(x.locations[1].risk,3);
 assert.equal(displayableRisks(x.locations,true,false).length,1);
 assert.equal(displayableRisks(x.locations,false,true).length,1);
 assert.equal(displayableRisks(x.locations,false,false).length,0);
});
test('No node-link geographic coordinates must never create fictitious Kakao hazard markers',()=>{
 const f=extractZipFiles(makeZip('risk.csv','LINK_ID,ICE_RISK\n42001,위험'));
 const d=geolocatedRisks(f,'001');
 assert.equal(d.locations.length,0);assert.equal(d.unmapped,1);
 assert.equal(displayableRisks(d.locations,true,true).length,0);
});
test('Numeric ice grade is intentionally not classified without KMA format-code definition',()=>{
 const files=extractZipFiles(makeZip('risk.csv','LAT,LON,ICE_RISK\\n37.501,127.001,3'));
 assert.equal(geolocatedRisks(files,'001').locations.length,0);
});
test('KMA road risk fetch remains on official host, provides metadata and never leaks key',async()=>{
 let calls=0;const key='secret+/&';
 const zip=makeZip('data.csv',csv);
 const response=await kmaRoadRisk('001',key,async url=>{
  calls++;const u=new URL(url);
  assert.equal(u.hostname,'apihub.kma.go.kr');
  assert.equal(u.pathname,'/api/typ04/url/road_file_down.php');
  assert.equal(u.searchParams.get('roadNum'),'001');
  assert.equal(u.searchParams.get('authKey'),key);
  return new Response(zip,{headers:{'Content-Type':'application/zip'}});
 });
 assert.equal(calls,1);assert.equal(response.status,'georeferenced');
 assert.equal(response.locations.length,2);
 assert.ok(!JSON.stringify(response).includes(key));
 await assert.rejects(kmaRoadRisk('999',key,async()=>{throw Error('must not fetch')}),/노선번호/);
 await assert.rejects(kmaRoadRisk('001',key,async()=>new Response('<html>denied</html>',{status:200})),/활용승인/);
});
test('KMA risk endpoint validates authenticated session and roadNum, then returns official parsed map points',async()=>{
 const origin='https://sunny.example',env={APP_ORIGIN:origin,SESSION_SECRET:'s'.repeat(64),KMA_API_KEY:'server-key'};
 const noSession=await handle(new Request(origin+'/api/road-risk',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}),env);
 assert.equal(noSession.status,401);
 const auth=await handle(new Request(origin+'/api/session'),env),v=await auth.json();
 assert.equal(v.connections.roadRisk,true);
 const cookie=auth.headers.getSetCookie()[0].split(';')[0];
 const headers={'Content-Type':'application/json',Origin:origin,Cookie:cookie,'X-CSRF-Token':v.csrf};
 const invalid=await handle(new Request(origin+'/api/road-risk',{method:'POST',headers,body:JSON.stringify({roadNum:'../../secret'})}),env,async()=>{throw Error('must not fetch')});
 assert.equal(invalid.status,400);
 const okay=await handle(new Request(origin+'/api/road-risk',{method:'POST',headers,body:JSON.stringify({roadNum:'001'})}),env,
  async()=>new Response(makeZip('road.csv',csv)));
 assert.equal(okay.status,200);
 const d=await okay.json();assert.equal(d.locations.length,2);
 assert.ok(!JSON.stringify(d).includes(env.KMA_API_KEY));
});
test('ZIP bomb and non-zip response are rejected without reporting external bodies',()=>{
 assert.throws(()=>extractZipFiles(Buffer.from('Private server error')),/ZIP/);
 const huge=Buffer.alloc(6*1024*1024+3);
 assert.throws(()=>extractZipFiles(huge),/ZIP/);
});
