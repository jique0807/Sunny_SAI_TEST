import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {displayableWalkingFacilities,initWalkingFacilityOverlay} from '../public/walking-facilities-overlay.mjs';
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
const walking={travelMode:'walking',facilities:[
 {kind:'횡단보도',lat:37.55,lng:126.97,status:'location_only'},
 {kind:'지하보도',lat:37.551,lng:126.971,status:'location_only'},
 {kind:'계단',lat:37.552,lng:126.972,status:'location_only'}]};
test('TMAP facility coordinates are only location metadata, never hazard assessments',()=>{
 const got=displayableWalkingFacilities(walking);
 assert.equal(got.length,3);assert.ok(got.every(x=>x.verifiedHazard===false));
 assert.deepEqual(displayableWalkingFacilities({...walking,travelMode:'driving'}),[]);
 assert.deepEqual(displayableWalkingFacilities({...walking,facilities:[{kind:'횡단보도',lat:37.55,lng:126.97,status:'risk'}]}),[]);
 assert.deepEqual(displayableWalkingFacilities({...walking,facilities:[{kind:'계단',lat:999,lng:126.97,status:'location_only'}]}),[]);
});
test('without an actual walking route there is no fictitious marker',()=>{
 let checked=true;const events={},nodes={};
 nodes.navLayerWalkFacilities={get checked(){return checked},addEventListener:(n,fn)=>{events[n]=fn}};
 nodes.navWalkFacilitiesStatus={textContent:''};
 const o=initWalkingFacilityOverlay({document:{getElementById:id=>nodes[id]},getRoute:()=>null,getContext:()=>null});
 o.repaint();assert.equal(o.displayedCount(),0);assert.match(nodes.navWalkFacilitiesStatus.textContent,/도보 경로/);
 checked=false;events.change();assert.equal(o.displayedCount(),0);
});
test('new options appear in mobile menu without replacing the seven existing controls',()=>{
 for(const id of ['navLayerWalkFacilities','navLayerTrafficIncidents','navLayerPedestrianHotspots'])
  assert.equal(ui.split('id="'+id+'"').length-1,1);
 assert.match(ui,/id="navLayerTrafficIncidents"[^>]*disabled/);
 assert.match(ui,/id="navLayerPedestrianHotspots"[^>]*disabled/);
 for(const id of ['navLayerWeather','navNationalRain','navLayersnow','navLayerroad','navLayerfog','navLayerWarning','navLayerflood'])
  assert.equal(ui.split('id="'+id+'"').length-1,1);
 assert.match(app,/walkingFacilities\.repaint\(\)/);
 assert.match(css,/sunny-walk-facility-pin/);
});
