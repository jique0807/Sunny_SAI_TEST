import test from 'node:test';
import assert from 'node:assert/strict';
import reference from './fixtures/gk2a-ci-navigation-reference.json' with {type:'json'};
import {CI_NAVIGATION,ciPixelToLatLng,ciLatLngToPixel,isVerifiedCiNavigation,decodeCiCategory} from '../public/gk2a-ci-navigation.mjs';
const meters=(a,b)=>Math.hypot((a.lat-b.lat)*111195,(a.lng-b.lng)*111195*Math.cos(b.lat*Math.PI/180));
test('CI native corners and Korean city pixels agree with the independently downloaded NMSC grid',()=>{
 for(const p of reference.points){
  const geo=ciPixelToLatLng(p.column,p.row);
  assert.ok(meters(geo,p)<20,JSON.stringify({p,geo}));
 }
});
test('CI inverse round trip preserves fractional pixels and geographic axes',()=>{
 for(const [column,row] of [[0,0],[1899,1199],[950,600],[1073,482],[1049.25,645.75]]){
  const p=ciPixelToLatLng(column,row),back=ciLatLngToPixel(p.lat,p.lng);
  assert.ok(Math.abs(column-back.column)<1e-7);assert.ok(Math.abs(row-back.row)<1e-7);
 }
 assert.ok(ciPixelToLatLng(950,0).lat>ciPixelToLatLng(950,1199).lat);
 assert.ok(ciPixelToLatLng(0,600).lng<ciPixelToLatLng(1899,600).lng);
 assert.equal(ciLatLngToPixel(0,-50),null);
});
test('CI rejects a PNG footer, changed projection, one-pixel offset and invalid coordinates',()=>{
 assert.equal(isVerifiedCiNavigation({...CI_NAVIGATION,height:1230}),false);
 assert.equal(isVerifiedCiNavigation({...CI_NAVIGATION,column_offset:1124.5}),false);
 assert.equal(isVerifiedCiNavigation({...CI_NAVIGATION,grid_mapping_name:'lambert_conformal_conic'}),false);
 assert.throws(()=>ciPixelToLatLng(0,1200));assert.throws(()=>ciPixelToLatLng(NaN,0));
 assert.throws(()=>ciPixelToLatLng(0,0,{...CI_NAVIGATION,height:1230}));
});
test('CI ordinal categories, previous-object quality and missing values never become percentages or clear weather',()=>{
 assert.equal(decodeCiCategory(4,1).category,'strong-updraft');
 assert.equal(decodeCiCategory(4,1).probabilityPercent,null);
 assert.equal(decodeCiCategory(0,1).category,'non-ci');
 assert.equal(decodeCiCategory(4,0).status,'unavailable');
 assert.equal(decodeCiCategory(4,0).reason,'previous-object-missing');
 assert.equal(decodeCiCategory(255,1).category,null);
 for(const v of [null,NaN,-1,5])assert.equal(decodeCiCategory(v,1).status,'unavailable');
 assert.equal(decodeCiCategory(4,255).status,'unavailable');
});
