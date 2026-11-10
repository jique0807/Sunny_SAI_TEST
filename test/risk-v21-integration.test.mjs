import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {areRoutesSpatiallyDistinct} from '../public/safe-route-engine.mjs';
import {initWarningOverlay} from '../public/kma-warning-overlay.mjs';
import {initRoadRiskOverlay} from '../public/road-risk-overlay.mjs';

const route=(points=[
 {lat:37.5,lng:127,seconds:0},
 {lat:37.5,lng:127.01,seconds:300},
 {lat:37.5,lng:127.02,seconds:600}
])=>({
 rainPath:points,distance:1800,duration:600,travelMode:'driving',
 departure:new Date().toISOString(),samples:[
 {lat:37.5,lng:127.002,seconds:100,eta:new Date().toISOString()},
 {lat:37.5,lng:127.018,seconds:500,eta:new Date().toISOString()}
 ]
});

test('alternate road priorities require a geographically distinct polyline',()=>{
 const main=route();
 assert.equal(areRoutesSpatiallyDistinct(main,{...main,rainPath:main.rainPath.map(p=>({...p,seconds:p.seconds*1.2}))}),false);
 const detour=route([
  {lat:37.5,lng:127,seconds:0},
  {lat:37.52,lng:127.01,seconds:300},
  {lat:37.5,lng:127.02,seconds:600}
 ]);
 assert.equal(areRoutesSpatiallyDistinct(main,detour),true);
 assert.equal(areRoutesSpatiallyDistinct(main,{rainPath:[]}),false);
});

test('official weather warning evidence remains route-visible with map warning switch OFF',async()=>{
 const prior=globalThis.document;
 const toggle={checked:false,addEventListener(){}},status={textContent:''};
 globalThis.document={getElementById:id=>id==='navLayerWarning'?toggle:id==='navWarningStatus'?status:null};
 try{
  const engine=initWarningOverlay({
   query:async()=>({warnings:[{
    title:'호우특보',label:'서울권',icon:'⚠️',
    validTime:new Date().toISOString(),points:[{lat:37.5,lng:127.01}]
   }],stationError:false}),
   getMap:()=>null,ensureMap:async()=>{},onChange:()=>{}
  });
  assert.deepEqual(engine.routeHazards(route()),[]);
  await engine.loadForRisk();
  const got=engine.routeHazards(route());
  assert.equal(got.length,1);
  assert.equal(got[0].kind,'warning');
  assert.equal(toggle.checked,false);
 }finally{globalThis.document=prior;}
});

test('verified KMA road grade and geometry remain risk evidence when ice and fog layer switches OFF',async()=>{
 const prior=globalThis.document;
 const elements=new Map();
 const el=id=>{
  if(!elements.has(id))elements.set(id,{
   checked:false,disabled:false,textContent:'',dataset:{},
   addEventListener(){},closest(){return {classList:{toggle(){}}}}
  });
  return elements.get(id);
 };
 globalThis.document={getElementById:el};
 try{
  const overlay=initRoadRiskOverlay({
   query:async()=>({
    roadName:'실제 도로위험시험',receivedRoads:1,totalRoads:1,status:'georeferenced',
    locations:[{kind:'ice',risk:2,gradeMeaningVerified:true,linkId:'validated-link',
     dataTime:new Date().toISOString(),
     geometry:{type:'line',points:[{lat:37.5,lng:127.002},{lat:37.5,lng:127.004}]}}]
   }),
   getContext:()=>null,ensureMap:async()=>{},onChange:()=>{}
  });
  overlay.setAvailable(true);
  await overlay.loadForRisk();
  const hazards=overlay.routeHazards(route());
  assert.equal(el('navLayerroad').checked,false);
  assert.equal(el('navLayerfog').checked,false);
  assert.equal(hazards.length,1);
  assert.equal(hazards[0].riskGradeVerified,true);
  assert.equal(hazards[0].roadRisk,2);
 }finally{globalThis.document=prior;}
});

test('risk engine ingestion does not use individual map-layer checkboxes',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const api=readFileSync(new URL('../lib/api.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
 assert.match(app,/const routeExtraHazards=route=>[\s\S]*?route\?\.itsRiskEvents\|\|\[\]/);
 const extra=app.slice(app.indexOf('const routeExtraHazards='),app.indexOf('const roadRiskOverlay='));
 assert.doesNotMatch(extra,/\.checked|navLayerTrafficIncidents|navLayerPedestrianHotspots/);
 assert.match(app,/warningOverlay\.loadForRisk\(\)/);
 assert.match(app,/roadRiskOverlay\.loadForRisk\(\)/);
 assert.match(app,/compareRouteRiskCandidates\(/);
 assert.match(app,/areRoutesSpatiallyDistinct\(/);
 assert.match(app,/riskSuggestedRoute=\{initial,route:chosen\.route/);
 assert.match(app,/navRiskApply'\)\?\.addEventListener\('click'/);
 assert.match(ui,/id="navRiskCompare"/);
 assert.match(ui,/id="navRiskApply"/);
 assert.ok(api.includes("!['RECOMMEND','TIME','DISTANCE'].includes(drivingPriority)"));
 assert.match(api,/url\.searchParams\.set\('priority',drivingPriority\)/);
 assert.doesNotMatch(app,/compareDrivingRouteRisk[\s\S]*?automatic:\s*true/);
});
