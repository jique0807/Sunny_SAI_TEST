import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRouteEvidenceRefresh} from '../public/route-evidence-refresh.mjs';
function setup(mode){
 const route={travelMode:mode};let active=route,time=1000;
 const calls={road:0,warning:0,pedestrian:0};
 const collect=kind=>async()=>{calls[kind]++;return {status:'received'};};
 const options={getRoute:()=>active,collectRoad:collect('road'),collectWarnings:collect('warning'),
  collectPedestrian:collect('pedestrian'),now:()=>time};
 return {route,calls,options,advance:ms=>time+=ms,setRoute:r=>active=r};
}
test('driving refreshes road and warning evidence separately while walking only refreshes history and warnings',async()=>{
 for(const mode of ['driving','walking']){
  const h=setup(mode),refresh=createRouteEvidenceRefresh(h.options);
  await refresh(h.route);await refresh(h.route);
  assert.deepEqual(h.calls,mode==='driving'?{road:1,warning:1,pedestrian:0}:{road:0,warning:1,pedestrian:1});
  h.advance(120000);await refresh(h.route);
  assert.equal(h.calls.warning,2);
  if(mode==='driving'){h.advance(60000);await refresh(h.route);assert.equal(h.calls.road,2);}
  else{assert.equal(h.calls.pedestrian,1);h.advance(1680000);await refresh(h.route);assert.equal(h.calls.pedestrian,2);}
 }
});
test('provider failures retry without blocking the other provider and recover to normal intervals',async()=>{
 const h=setup('driving');let fail=true;
 h.options.collectRoad=async()=>{h.calls.road++;if(fail)throw Error('fixture outage');return {status:'received'};};
 const refresh=createRouteEvidenceRefresh(h.options);await refresh(h.route);
 assert.equal(h.route.roadEvidenceStatus,'failed');assert.equal(h.route.warningEvidenceStatus,'received');
 h.advance(59999);await refresh(h.route);assert.equal(h.calls.road,1);
 h.advance(1);fail=false;await refresh(h.route);assert.equal(h.route.roadEvidenceStatus,'received');
 h.advance(179999);await refresh(h.route);assert.equal(h.calls.road,2);
 h.advance(1);await refresh(h.route);assert.equal(h.calls.road,3);
});
test('parallel refreshes share in-flight work and late responses cannot update a different route',async()=>{
 const h=setup('driving');let finish;
 h.options.collectRoad=()=>{h.calls.road++;return new Promise(resolve=>finish=resolve);};
 const refresh=createRouteEvidenceRefresh(h.options),pending=refresh(h.route);
 await refresh(h.route);assert.equal(h.calls.road,1);
 const next={travelMode:'walking'};h.setRoute(next);finish({status:'received'});await pending;
 assert.equal(next.roadEvidenceStatus,undefined);assert.equal(h.route.roadEvidenceStatus,undefined);
});
test('demo, unknown mode and inactive routes never trigger provider calls',async()=>{
 const h=setup('driving'),refresh=createRouteEvidenceRefresh(h.options);
 for(const r of [{travelMode:'driving',demo:true},{travelMode:'unsupported'},null,h.route]){
  if(r===h.route)h.setRoute(null);else h.setRoute(r);
  await refresh(r);
 }
 assert.deepEqual(h.calls,{road:0,warning:0,pedestrian:0});
});
