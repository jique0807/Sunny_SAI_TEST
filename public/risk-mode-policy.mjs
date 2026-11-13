// Separate, deterministic exposure scoring for vehicle and pedestrian routes.
// Inputs must already be verified and mode-filtered by safe-route-engine.mjs.
// Scores are RELATIVE INDICES only: not probabilities or guarantees of safety.
export const DRIVING_POLICY='driving-exposure-v1';
export const WALKING_POLICY='walking-exposure-v1';
const LEVEL_WEIGHT=Object.freeze({high:35,caution:18,notice:9,info:3});
const safe=x=>Number.isFinite(x)?x:0;
const cap=x=>Math.max(0,Math.min(100,Math.round(x)));

export function drivingRiskIndex(signals=[]){
 const weights=Object.freeze({rain:1.35,snow:1.35,mixed:1.35,wind:.8,
  heat:.4,cold:.65,warning:1,'its-incident':1.55,roadRisk:1.65,
  'observed-road-fog':.6,'observed-road-rain':.6,'observed-road-snow':.6,'satellite-rain':.6,'satellite-convection':.35,'satellite-fog':.6});
 const ranked=signals.flatMap((h,i)=>{
  if(!h||h.demo===true||h.kind==='pedestrian-hotspot')return [];
  const type=h.roadRisk!==undefined?'roadRisk':h.kind;
  const multiplier=weights[type];
  const severity=LEVEL_WEIGHT[h.assessment?.level];
  if(!Number.isFinite(multiplier)||!severity)return [];
  return [{kind:h.kind,priority:safe(severity*multiplier),index:i}];
 }).sort((a,b)=>b.priority-a.priority||a.index-b.index);
 return {policy:DRIVING_POLICY,signalIndex:cap(ranked.reduce((v,x)=>v+x.priority,0)),
  priorities:ranked.map(x=>x.kind),evidenceCount:ranked.length};
}

export function walkingRiskIndex(signals=[]){
 // Historic hotspots are contextual and are never treated as a live incident.
 const weights=Object.freeze({rain:1.15,snow:1.25,mixed:1.25,wind:1.35,
  heat:1.8,cold:1.75,warning:1.15,'pedestrian-hotspot':.65,
  'observed-road-fog':.6,'observed-road-rain':.6,'observed-road-snow':.6,'satellite-rain':.6,'satellite-convection':.35,'satellite-fog':.6});
 const ranked=signals.flatMap((h,i)=>{
  if(!h||h.demo===true||h.roadRisk!==undefined||h.kind==='its-incident')return [];
  const multiplier=weights[h.kind];
  const severity=LEVEL_WEIGHT[h.assessment?.level];
  if(!Number.isFinite(multiplier)||!severity)return [];
  return [{kind:h.kind,priority:safe(severity*multiplier),index:i}];
 }).sort((a,b)=>b.priority-a.priority||a.index-b.index);
 return {policy:WALKING_POLICY,signalIndex:cap(ranked.reduce((v,x)=>v+x.priority,0)),
  priorities:ranked.map(x=>x.kind),evidenceCount:ranked.length};
}

export function scoreModeRisk(mode,signals=[]){
 if(mode==='driving')return drivingRiskIndex(signals);
 if(mode==='walking')return walkingRiskIndex(signals);
 return {policy:'unsupported',signalIndex:0,priorities:[],evidenceCount:0};
}
