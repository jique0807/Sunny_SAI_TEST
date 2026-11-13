import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {CI_NAVIGATION} from '../public/gk2a-ci-navigation.mjs';
import {koLccPixelToLatLng,koLccLatLngToPixel} from '../public/gk2a-georef.mjs';
import {decodeSatelliteNc} from '../lib/gk2a-nc.mjs';
import {satelliteMapCells,satelliteRouteValues} from '../lib/gk2a-numeric-data.mjs';
import {buildSatelliteHazards} from '../public/satellite-route-risk.mjs';
import {evaluateDrivingRisk,evaluateWalkingRisk} from '../public/safe-route-engine.mjs';
import {drawSatelliteCells} from '../public/gk2a-numeric-overlay.mjs';
import {handle} from '../lib/api.mjs';
const now=Date.now(),utc=new Date(Math.floor(now/120000)*120000).toISOString().slice(0,16).replace(/[-:T]/g,'');
const frames=new Map(),buffers=new Map();
async function fixture(product,bad=false){
 const h=await import('h5wasm/node');await h.ready;
 const dir=mkdtempSync(join(tmpdir(),'sunny-test-')),path=join(dir,'frame.nc');let f;
 try{
  f=new h.File(path,'w');f.create_attribute('title','AMI L2 '+product.toUpperCase());
  const width=product==='fog'?900:1900,height=product==='fog'?900:1200,n=width*height;
  const proj=f.create_group('gk2a_imager_projection');
  const p=product==='fog'?{grid_mapping_name:'lambert_conformal_conic',standard_parallel1:30,standard_parallel2:60,origin_latitude:38,central_meridian:126,pixel_size:2000,upper_left_easting:-899000,upper_left_northing:899000}:CI_NAVIGATION;
  for(const [k,v]of Object.entries(p))proj.create_attribute(k,bad&&k==='central_meridian'?125:v);
  const name={rr:'RR',ci:'CI1_prob',fog:'FOG'}[product],qn={rr:'Raining_CT_flag',ci:'DQF_CI1',fog:'DQF_FOG'}[product];
  const values=product==='ci'?new Uint8Array(n).fill(255):new Uint16Array(n).fill(product==='fog'?1:0),quality=new Uint8Array(n);
  const i=product==='fog'?473*width+492:482*width+1073;
  values[i]=product==='rr'?4500:product==='ci'?4:5;quality[i]=product==='ci'?1:0;
  const d=f.create_dataset({name,data:values,shape:[height,width],chunks:[100,100],compression:1});
  f.create_dataset({name:qn,data:quality,shape:[height,width],chunks:[100,100],compression:1});
  if(product==='rr')for(const [k,v]of Object.entries({units:'mm/h',scale_factor:.01,add_offset:0,_FillValue:65535,valid_max:10000}))d.create_attribute(k,v);
  f.close();f=null;return readFileSync(path);
 }finally{f?.close();rmSync(dir,{recursive:true,force:true});}
}
test.before(async()=>{for(const p of ['rr','ci','fog']){const b=await fixture(p);buffers.set(p,b);frames.set(p,{status:'received',...await decodeSatelliteNc(b,p,utc)});}});
test('NC metadata, projection and scalar/array attributes are read in the deployed Node parser',async()=>{
 for(const p of ['rr','ci','fog'])assert.equal(frames.get(p).metadataVerified,true);
 await assert.rejects(()=>fixture('fog',true).then(b=>decodeSatelliteNc(b,'fog',utc)),/unverified_projection/);
 await assert.rejects(()=>decodeSatelliteNc(buffers.get('rr'),'ci',utc),/product_mismatch/);
});
test('native map cells retain values; route samples feed both mobility engines without creating an automatic detour',()=>{
 const route={travelMode:'driving',departure:new Date(now).toISOString(),duration:600,distance:1000,rainPath:[{lat:37.5665,lng:126.978,seconds:0},{lat:37.5655,lng:126.979,seconds:600}]};route.samples=route.rainPath;
 const samples=[];
 for(const p of ['rr','ci','fog']){
  const f=frames.get(p),map=satelliteMapCells(f,{west:126.9,east:127.1,south:37.5,north:37.6},{now});
  assert.equal(map.status,'received');assert.equal(map.cells.length,1);
  samples.push(...satelliteRouteValues(f,route.samples,{now}));
 }
 const hazards=buildSatelliteHazards(route,{status:'received',samples},{now});
 assert.deepEqual([...new Set(hazards.map(h=>h.kind))].sort(),['satellite-convection','satellite-fog','satellite-rain']);
 const weatherSamples=route.samples.map(p=>({...p,status:'forecast',eta:new Date(now+p.seconds*1000).toISOString(),forecast:{provider:'kma',time:new Date(now+p.seconds*1000).toISOString(),precipitationType:0,rain:0}}));
 for(const mode of ['driving','walking']){
  const r={...route,travelMode:mode},fn=mode==='driving'?evaluateDrivingRisk:evaluateWalkingRisk;
  const profile=fn(r,{weatherSamples,extraHazards:hazards,now});
  assert.equal(profile.signalCount,3);assert.equal(profile.action.type,'advisory');assert.equal(profile.coverage,100);
 }
 const stale=satelliteMapCells(frames.get('rr'),{west:126.9,east:127.1,south:37.5,north:37.6},{now:now+21*60000});
 assert.equal(stale.status,'excluded');assert.equal(stale.cells.length,0);
 assert.equal(buildSatelliteHazards({...route,demo:true},{status:'received',samples},{now}).length,0);
});
test('FOG inverse navigation round trips the official grid; renderer paints geographic cells',()=>{
 for(const [c,r]of [[0,0],[899,899],[492,473],[449.5,449.5]]){
  const p=koLccPixelToLatLng(c+.5,r+.5),q=koLccLatLngToPixel(p.lat,p.lng);
  assert.ok(Math.abs(q.column-c)<1e-7);assert.ok(Math.abs(q.row-r)<1e-7);
 }
 const expected=[{c:0,r:0,lat:45.72896957397461,lng:113.99642181396484},
  {c:899,r:899,lat:29.3122501373291,lng:135.24673461914062},
  {c:492,r:473,lat:37.5606803894043,lng:126.98661804199219}];
 for(const e of expected){const p=koLccPixelToLatLng(e.c+.5,e.r+.5);
  assert.ok(Math.hypot((p.lat-e.lat)*111195,(p.lng-e.lng)*111195*Math.cos(e.lat*Math.PI/180))<2);}
 let fills=0;const ctx={beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){fills++;}};
 assert.equal(drawSatelliteCells(ctx,[{value:20,corners:[{lat:37,lng:127},{lat:37,lng:128},{lat:36,lng:128},{lat:36,lng:127}]}],p=>({x:p.lng,y:p.lat}),'rr'),1);
 assert.equal(fills,1);
});
test('authenticated API connects NC fetching, metadata validation, map cells and route samples; bad product excludes only that product',async()=>{
 const base='https://sat.test',env={APP_ORIGIN:base,SESSION_SECRET:'s'.repeat(64),KMA_API_KEY:'private'};
 const sessionResponse=await handle(new Request(base+'/api/session'),env),session=await sessionResponse.json(),cookie=sessionResponse.headers.get('set-cookie').split(';')[0];
 const fetcher=async url=>{
  assert.equal(url.hostname,'apihub.kma.go.kr');
  const p=url.searchParams.get('data');
  if(url.pathname.endsWith('sat_file_data_list.php'))return new Response('gk2a_ami_le2_'+p+'_area_'+utc+'.nc');
  return new Response(buffers.get(p));
 };
 const send=(path,data)=>handle(new Request(base+path,{method:'POST',headers:{Origin:base,Cookie:cookie,'X-CSRF-Token':session.csrf,'Content-Type':'application/json'},body:JSON.stringify(data)}),env,fetcher);
 const map=await (await send('/api/satellite-map',{product:'rr',bounds:{west:126.9,east:127.1,south:37.5,north:37.6}})).json();assert.equal(map.cells.length,1);assert.ok(Math.abs(map.cells[0].value-45)<.001);
 const report=await (await send('/api/satellite-route',{points:[{lat:37.5665,lng:126.978,seconds:0},{lat:37.5655,lng:126.979,seconds:600}]})).json();
 assert.equal(report.status,'received');assert.equal(report.results.length,3);assert.ok(report.samples.some(p=>p.product==='ci'&&p.value===4));assert.doesNotMatch(JSON.stringify(report),/private/);
 const broken=await fixture('fog',true);
 const response=await handle(new Request(base+'/api/satellite-route',{method:'POST',headers:{Origin:base,Cookie:cookie,'X-CSRF-Token':session.csrf,'Content-Type':'application/json'},body:JSON.stringify({points:[{lat:37.5665,lng:126.978,seconds:0},{lat:37.5655,lng:126.979,seconds:600}]})}),env,async url=>url.searchParams.get('data')==='fog'&&url.pathname.endsWith('sat_file_nc_down.php')?new Response(broken):fetcher(url));
 const partial=await response.json();assert.equal(partial.status,'partial');
 assert.equal(partial.results.find(p=>p.product==='fog').status,'excluded');
 assert.ok(partial.samples.some(p=>p.product==='rr'));assert.ok(!partial.samples.some(p=>p.product==='fog'));
 const missing=await handle(new Request(base+'/api/satellite-map',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'}),env,fetcher);assert.equal(missing.status,401);
});

test('invalid, old and distant-future satellite records are excluded without converting missing data into zero',()=>{
 const route={travelMode:'driving',departure:new Date(now).toISOString()};
 const good={lat:37.56,lng:126.98,seconds:0,value:45,product:'rr',qualityVerified:true,navigationVerified:true,observationUTC:utc,column:1073,row:482};
 for(const bad of [null,{...good,value:'45'},{...good,value:NaN},{...good,qualityVerified:false},{...good,seconds:3600},{...good,observationUTC:'200001010000'}])
  assert.equal(buildSatelliteHazards(route,{status:'received',samples:[bad]},{now}).length,0);
});
