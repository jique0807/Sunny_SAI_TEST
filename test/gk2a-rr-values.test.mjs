import test from 'node:test';import assert from 'node:assert/strict';
import {decodePackedRr} from '../public/gk2a-rr-values.mjs';
import {probeSatelliteNumeric} from '../lib/gk2a-numeric-probe.mjs';
test('RR packed values use the NC scale once, preserve zero and never become flood confirmation',()=>{
 const high=decodePackedRr(9832,8);assert.ok(Math.abs(high.rainMmPerHour-98.32)<.00001);
 assert.equal(high.unit,'mm/h');assert.equal(high.roadFloodConfirmed,false);
 const zero=decodePackedRr(0,0);assert.equal(zero.status,'estimate');assert.equal(zero.rainMmPerHour,0);
 assert.equal(zero.cloudTypeQualityFlag,false);
 for(const x of [65535,NaN,null,-1,10001])assert.equal(decodePackedRr(x,8).status,'unavailable');
 assert.equal(decodePackedRr(5,255).status,'unavailable');
 assert.equal(decodePackedRr(5,8,null).status,'unavailable');
});
test('RR numeric receiver requests confirmed ELA source and the actual RR variable',async()=>{
 const result=await probeSatelliteNumeric('secret','rr',{now:Date.parse('2026-11-11T06:00:00Z'),fetcher:async url=>{
  assert.equal(url.searchParams.get('area'),'ela');assert.equal(url.searchParams.get('map'),'LC');
  if(url.pathname.endsWith('sat_file_data_list.php'))return new Response('gk2a_ami_le2_rr_ela020ge_202611110508.nc');
  if(url.pathname.endsWith('sat_file_data_view.php')){
   assert.equal(url.searchParams.get('var'),'RR');return new Response('3,3,=\n0 0 0\n0 0 0\n0 0 0');
  }
  return new Response(new Uint8Array([137,72,68,70,13,10,26,10]));
 }});
 assert.equal(result.nc.status,'received');assert.equal(result.grid.status,'numeric_grid_received');
 assert.equal(result.grid.valuesAre,'packed_nc_values');
 assert.ok(Math.abs(result.grid.packing.scaleFactor-.01)<1e-8);
});
