import test from 'node:test';
import assert from 'node:assert/strict';
import {probeSatelliteCatalog} from '../lib/gk2a-numeric-probe.mjs';
test('numeric satellite catalog reads official availability and request parameters without secrets',async()=>{
 const key='private';
 const report=await probeSatelliteCatalog(key,{fetcher:async url=>{
  assert.equal(url.hostname,'apihub.kma.go.kr');assert.equal(url.searchParams.get('disp'),'1');
  return Response.json({data:[{dataType:'rr',dataLevel:'l2',apiNC:'Y',parameterNc:'rr',areaKO:'Y',unexpected:'ignored'},
   {dataType:'ci',dataDescription:'大流',apiNC:'N'},{dataType:'other',dataDescription:'other'}]});}});
 assert.equal(report.status,'received');assert.equal(report.products.length,2);
 assert.equal(report.products[0].apiNC,'Y');assert.doesNotMatch(JSON.stringify(report),/private|unexpected/);
});
test('provider failures and HTML denial are never reported as numeric data reception',async()=>{
 assert.equal((await probeSatelliteCatalog('key',{fetcher:async()=>new Response('denied',{status:403})})).status,'http_error');
 assert.equal((await probeSatelliteCatalog('key',{fetcher:async()=>new Response('<html>denied</html>')})).status,'invalid_catalog');
 assert.equal((await probeSatelliteCatalog(null)).status,'key_missing');
});

test('numeric grids preserve fill codes and provider error text never counts as a numeric reception',async()=>{
 const {parseSatelliteGrid}=await import('../lib/gk2a-numeric-probe.mjs');
 assert.deepEqual(parseSatelliteGrid(' 2, 2,=\n1.00000e+00\t2.55000e+02\n5\t1\n'),{status:'numeric_grid_received',width:2,height:2,values:[1,255,5,1]});
 assert.equal(parseSatelliteGrid('# ERROR : ix(x)는 1부터 입력해야 합니다').status,'provider_error');
 assert.equal(parseSatelliteGrid('3,3,=\n1 2').status,'invalid_grid');
});
test('numeric probe confirms NetCDF signature and FOG values using one-based indices',async()=>{
 const {probeSatelliteNumeric}=await import('../lib/gk2a-numeric-probe.mjs');
 const result=await probeSatelliteNumeric('secret','fog',{now:Date.parse('2026-11-11T05:00:00Z'),fetcher:async url=>{
  if(url.pathname.endsWith('sat_file_data_list.php'))return new Response('gk2a_ami_le2_fog_ko_202611110420.nc');
  if(url.pathname.endsWith('sat_file_data_view.php')){
   assert.equal(url.searchParams.get('ix'),'1,3');assert.equal(url.searchParams.get('var'),'FOG');
   return new Response('3,3,=\n1 1 1\n1 1 1\n1 1 5\n');
  }
  return new Response(new Uint8Array([137,72,68,70,13,10,26,10]));
 }});
 assert.equal(result.nc.status,'received');assert.equal(result.grid.status,'numeric_grid_received');
 assert.equal(result.grid.values.at(-1),5);assert.doesNotMatch(JSON.stringify(result),/secret/);
});

test('numeric diagnostics are preview-only and reject arbitrary product selection',async()=>{
 const {handle}=await import('../lib/api.mjs');
 const base='https://numeric.test',env={APP_ORIGIN:base,SESSION_SECRET:'s'.repeat(64),VERCEL_ENV:'production',KMA_API_KEY:'secret'};
 const url=base+'/api/gk2a-numeric-diagnostic';
 assert.equal((await handle(new Request(url),env)).status,404);
 const preview={...env,VERCEL_ENV:'preview'};
 assert.equal((await handle(new Request(url+'?product=unapproved'),preview)).status,400);
 const result=await handle(new Request(url),preview,async()=>Response.json({data:[{dataType:'안개(FOG)',parameterNc:'fog',apiNc:'O'}]}));
 assert.equal(result.status,200);const report=await result.json();assert.equal(report.products[0].apiNc,'O');
 assert.doesNotMatch(JSON.stringify(report),/secret/);
});
