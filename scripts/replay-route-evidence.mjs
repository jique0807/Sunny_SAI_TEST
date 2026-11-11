// Offline replay of public test routes and sanitized provider responses.
// No network, credentials, deployment or invented observations.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {evaluateDrivingRisk,evaluateWalkingRisk} from '../public/safe-route-engine.mjs';
import {buildPedestrianHistoryHazards,closestWalkingRoutePoint} from '../public/pedestrian-history-risk.mjs';
import {buildItsRouteHazards} from '../public/its-route-risk.mjs';
import {displayableRisks,matchRouteRoadRisks} from '../public/road-risk-overlay.mjs';
import {warningRouteHazards} from '../public/kma-warning-overlay.mjs';
import {buildRiskLineage} from '../public/risk-lineage.mjs';

export function replayRouteEvidence(input){
 const now=Date.parse(input.checkedAt);
 assert.ok(Number.isFinite(now),'An acquisition timestamp is required');
 const output={checkedAt:input.checkedAt,deployment:input.deployment,
  replay:'local updated policy; existing deployment provider responses',cases:{},
  note:'Public fixed routes, not user GPS. Scores are uncalibrated relative indices.'};
 for(const mode of ['driving','walking']){
  const c=input.cases[mode],r=c.route,weather=c.weather;
  assert.equal(r.travelMode,mode);
  assert.equal(r.mode,mode);
  if(mode==='walking')assert.equal(r.provider,'TMAP');
  assert.ok(r.rainPath.length>1&&r.samples.length>0);
  assert.ok(r.rainPath.every((p,i)=>Number.isFinite(p.seconds)&&p.seconds>=0&&
   (!i||p.seconds>=r.rainPath[i-1].seconds)));
  assert.ok(weather.samples.every(s=>s.status==='forecast'&&s.forecast?.provider==='kma'));
  const checks=weather.samples.map(s=>{
   const expected=r.samples.find(p=>Math.abs(p.seconds-s.seconds)<1&&p.lat===s.lat&&p.lng===s.lng);
   assert.ok(expected,'Forecast must retain the actual provider route sample');
   assert.equal(s.eta,expected.eta);
   const offset=Math.abs(Date.parse(s.forecast.time)-Date.parse(s.eta))/60000;
   assert.ok(offset<=90,'Forecast validity must match passage ETA');
   return {seconds:s.seconds,forecastTime:s.forecast.time,eta:s.eta,timeOffsetMinutes:offset,
    distanceToPathMeters:closestWalkingRoutePoint(r.rainPath,s).distance};
  });
  const route={...r,itsEvidenceStatus:mode==='driving'?c.context.status:'not-checked',
   pedestrianEvidenceStatus:mode==='walking'?c.context.status:'not-checked',
   roadEvidenceStatus:mode==='driving'&&input.road.status==='georeferenced'?'received':'not-checked',
   warningEvidenceStatus:Array.isArray(input.warnings.warnings)?'received':'failed'};
  const historical=mode==='walking'?buildPedestrianHistoryHazards(route,c.context):[];
  const incidents=mode==='driving'?buildItsRouteHazards(route,c.context):[];
  const road=mode==='driving'?matchRouteRoadRisks(displayableRisks(input.road.locations,true,true),
   r.rainPath,r.departure,now):[];
  const warnings=warningRouteHazards(input.warnings.warnings||[],r.rainPath,r.departure);
  const profile=(mode==='driving'?evaluateDrivingRisk:evaluateWalkingRisk)(route,
   {weatherSamples:weather.samples,extraHazards:[...historical,...incidents,...road,...warnings],now});
  const lineage=buildRiskLineage({route,weather,profile,now});
  assert.equal(lineage.evidenceReadiness.safeRouteCertified,false);
  assert.equal(lineage.evidenceReadiness.automaticRerouteAuthorized,false);
  if(mode==='driving'&&c.context.status==='failed')assert.equal(incidents.length,0);
  output.cases[mode]={provider:r.provider||r.source,distanceMeters:r.distance,durationSeconds:r.duration,
   geometryPoints:r.rainPath.length,totalSamples:r.samples.length,receivedSamples:weather.samples.length,
   sampleValidation:checks,coverage:profile.coverage,state:profile.state,modePolicy:profile.modePolicy,
   signalIndex:profile.signalIndex,signalCount:profile.signalCount,riskLevel:profile.riskLevel,
   contextStatus:c.context.status,contextCount:c.context.items?.length||0,
   historicalMatched:historical.map(h=>({distanceToPath:h.distanceToPath,accidentCount:h.accidentCount,
    year:h.year,historic:h.historic,live:h.live})),
   itsFailure:mode==='driving'?{events:c.context.reasonCode,traffic:c.context.traffic?.reasonCode}:null,
   roadMatched:road.length,warningMatched:warnings.length,lineage};
 }
 output.road={status:input.road.status,recordCount:input.road.recordCount,
  returnedLocations:input.road.locations.length,
  gradeVerified:input.road.locations.filter(x=>x.gradeMeaningVerified===true).length,
  dataTime:input.road.dataTime,roadNum:input.road.roadNum,
  scope:'Separate Gyeongbu highway probe; not evidence for the Seoul local road route'};
 return output;
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const [source,target]=process.argv.slice(2);
 if(!source||!target)throw Error('Usage: node scripts/replay-route-evidence.mjs INPUT.json OUTPUT.json');
 const output=replayRouteEvidence(JSON.parse(readFileSync(source,'utf8')));
 writeFileSync(target,JSON.stringify(output,null,2)+'\n');
 for(const [mode,c] of Object.entries(output.cases))console.log(JSON.stringify({mode,...c,
  sampleValidation:undefined,lineage:undefined}));
}
