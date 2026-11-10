import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDrivingRisk,evaluateWalkingRisk,compareRouteRiskCandidates} from '../public/safe-route-engine.mjs';
const departure='2026-11-10T11:00:00.000Z';
const line=[
 {lat:37.5665,lng:126.978,seconds:0},
 {lat:37.5665,lng:126.988,seconds:300},
 {lat:37.5665,lng:126.998,seconds:600}
];
const route=(mode='driving')=>({
 travelMode:mode,mode,departure,distance:1800,duration:600,rainPath:line,
 samples:[{lat:37.5665,lng:126.982,seconds:120},{lat:37.5665,lng:126.994,seconds:480}].map(p=>
  ({...p,eta:new Date(Date.parse(departure)+p.seconds*1000).toISOString()}))
});
const weather=(r,rain=9)=>r.samples.map(p=>({...p,status:'forecast',
 forecast:{provider:'kma',rain,precipitationType:rain>0?1:0,
  rainLabel:rain+'mm',time:p.eta}}));
const now=Date.parse('2026-11-10T10:55:00Z');
const historical={
 kind:'pedestrian-hotspot',provider:'한국도로교통공단 TAAS',
 year:'2024',historic:true,live:false,accidentCount:8,
 lat:37.5665,lng:126.988,seconds:300,distanceToPath:0,
 eta:new Date(Date.parse(departure)+300000).toISOString()
};
const its={
 kind:'its-incident',provider:'국가교통정보센터 ITS',
 reportedFresh:true,segmentVerified:false,
 validTime:'2026-11-10T10:50:00Z',expiresAt:'2026-11-10T13:00:00Z',
 lat:37.5665,lng:126.988,seconds:300,distanceToPath:0,
 eta:new Date(Date.parse(departure)+300000).toISOString()
};
test('car and walk enforce independent evidence source contracts and KMA route ETA',()=>{
 const car=route('driving'),walk=route('walking');
 const a=evaluateDrivingRisk(car,{weatherSamples:weather(car),extraHazards:[historical,its],now});
 assert.equal(a.state,'evaluated');
 assert.equal(a.coverage,100);
 assert.equal(a.signals.filter(x=>x.kind==='its-incident').length,1);
 assert.equal(a.signals.filter(x=>x.kind==='pedestrian-hotspot').length,0);
 const b=evaluateWalkingRisk(walk,{weatherSamples:weather(walk),extraHazards:[historical,its],now});
 assert.equal(b.state,'evaluated');
 assert.equal(b.coverage,100);
 assert.equal(b.signals.filter(x=>x.kind==='its-incident').length,0);
 assert.equal(b.signals.filter(x=>x.kind==='pedestrian-hotspot').length,1);
 assert.equal(b.signals.filter(x=>x.kind==='rain').length,1); // one rain episode; nearby KMA points are merged
});
test('stale route weather cannot be treated as current coverage even when ETA equals forecast valid time',()=>{
 const r=route(),stray=weather(r).map(p=>({...p,
  eta:new Date(Date.parse(p.eta)+60*60000).toISOString(),
  forecast:{...p.forecast,time:new Date(Date.parse(p.eta)+60*60000).toISOString()}}));
 const actual=evaluateDrivingRisk(r,{weatherSamples:stray,now});
 assert.equal(actual.coverage,0);
 assert.equal(actual.state,'insufficient-data');
 assert.equal(actual.signals.length,0);
 const good=evaluateDrivingRisk(r,{weatherSamples:weather(r),now});
 assert.equal(good.coverage,100);
});
test('an official pedestrian historical cluster 150m away is not a verified 120m route encounter',()=>{
 const r=route('walking'),bad={...historical,lat:37.56788,distanceToPath:0};
 const profile=evaluateWalkingRisk(r,{weatherSamples:weather(r,0),extraHazards:[bad],now});
 assert.equal(profile.state,'evaluated');
 assert.equal(profile.signals.filter(x=>x.kind==='pedestrian-hotspot').length,0);
 assert.equal(profile.unknownSignals,1);
});
test('road grade cannot be projected from a 70m-offset parallel link',()=>{
 const r=route(),item={kind:'ice',provider:'기상청 도로위험기상',
  lat:37.5672,lng:126.988,seconds:300,
  eta:new Date(Date.parse(departure)+300000).toISOString(),
  validTime:'2026-11-10T10:50:00Z',roadRisk:3,riskGradeVerified:true};
 const result=evaluateDrivingRisk(r,{weatherSamples:weather(r,0),extraHazards:[item],now});
 assert.equal(result.signalCount,0);
 assert.equal(result.unknownSignals,1);
});
test('ITS 150m away is contextual but not asserted as this route traffic hazard',()=>{
 const r=route(),fake={...its,lat:37.5679,distanceToPath:0};
 const result=evaluateDrivingRisk(r,{weatherSamples:weather(r,0),extraHazards:[fake],now});
 assert.equal(result.signalCount,0);
 assert.equal(result.unknownSignals,1);
});
test('two routes with only partial weather evidence do not receive safety recommendation',()=>{
 const a=route(),b={...route(),distance:2000,duration:660,
  rainPath:line.map(x=>({...x,seconds:x.seconds*1.1})),
  samples:route().samples.map(x=>({...x,seconds:x.seconds*1.1,
   eta:new Date(Date.parse(departure)+x.seconds*1100).toISOString()}))};
 const result=compareRouteRiskCandidates([
  {id:'A',route:a,weatherSamples:weather(a).slice(0,1)},
  {id:'B',route:b,weatherSamples:weather(b).slice(0,1)}
 ],{now});
 assert.equal(result.recommendation,null);
 assert.equal(result.status,'not-comparable');
});

test('map hazard layer excludes stale KMA forecasts even when their raw RN1 values claim rain',async()=>{
 const {buildRouteHazards}=await import('../public/route-hazards.mjs');
 const r=route(),s=weather(r,34)[0];
 const wrong={...s,forecast:{...s.forecast,time:new Date(Date.parse(s.eta)+2*3600000).toISOString()}};
 assert.equal(buildRouteHazards([wrong]).length,0);
 assert.equal(buildRouteHazards([s]).length,1);
});
test('official region station warning evidence expires after ten minutes without a fresh query',async()=>{
 const {initWarningOverlay}=await import('../public/kma-warning-overlay.mjs');
 const prior=globalThis.document;
 let current=Date.parse('2026-11-10T10:00:00Z');
 const toggle={checked:false,addEventListener(){}},status={textContent:''};
 globalThis.document={getElementById:id=>id==='navLayerWarning'?toggle:id==='navWarningStatus'?status:null};
 try{
  const engine=initWarningOverlay({
   query:async()=>({warnings:[{
    label:'시험 경계',title:'특보 인접',icon:'⚠️',
    validTime:'2026-11-10T09:00:00Z',points:[{lat:37.5665,lng:126.988}]
   }]}),
   getMap:()=>null,ensureMap:async()=>{},onChange:()=>{},now:()=>current
  });
  const r=route();
  assert.deepEqual(engine.routeHazards(r),[]);
  await engine.loadForRisk();
  assert.equal(engine.routeHazards(r).length,1);
  current+=11*60000;
  assert.equal(engine.routeHazards(r).length,0);
  await engine.loadForRisk();
  assert.equal(engine.routeHazards(r).length,1);
 }finally{globalThis.document=prior;}
});
test('route guidance actively rechecks warnings, road and ITS independent of map ON/OFF',async()=>{
 const {readFileSync}=await import('node:fs');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/function collectRouteRiskEvidence\(force=false\)/);
 assert.match(app,/now-lastEvidenceAt<8\*60000/);
 assert.match(app,/if\(connections\.kma\)void warningOverlay\.loadForRisk\(\)/);
 assert.match(app,/if\(route\.travelMode==='driving'&&connections\.roadRisk\)void roadRiskOverlay\.loadForRisk\(\)/);
 assert.match(app,/if\(route\.travelMode==='driving'&&connections\.its\)void loadItsRouteEvidence\(route\)/);
 assert.match(app,/if\(!routeWeatherEnabled\(\)\)return;\n collectRouteRiskEvidence\(\);/);
});
