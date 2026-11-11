import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRiskSourceEligibility as audit} from '../public/risk-source-eligibility.mjs';
const base=mode=>({travelMode:mode,distance:1800,duration:600,
 rainPath:[{lat:37.56,lng:126.97,seconds:0},{lat:37.57,lng:126.98,seconds:600}]});
const evaluated=mode=>({mode,state:'evaluated',coverage:100,unknownSignals:0,signalCount:0,signals:[]});
const get=(obj,id)=>obj.sources.find(s=>s.id===id);
test('driving ITS failure is visible even with complete KMA forecast coverage',()=>{
 const r=audit({route:{...base('driving'),itsEvidenceStatus:'failed',roadEvidenceStatus:'received',warningEvidenceStatus:'empty'},
  profile:evaluated('driving')});
 assert.equal(r.readiness,'limited-evidence');
 assert.equal(r.sourceCompleteness,'incomplete');
 assert.equal(get(r,'its').evaluation,'not-available');
 assert.equal(get(r,'road').evaluation,'received-not-route-verified');
 assert.equal(get(r,'warning').evaluation,'no-records-in-probe');
 assert.equal(r.automaticRerouteAuthorized,false);
 assert.equal(r.safeRouteCertified,false);
});
test('historical TAAS context is only used for walking, never driving',()=>{
 const historic={kind:'pedestrian-hotspot',provider:'한국도로교통공단 TAAS',historic:true,live:false};
 const ped=audit({route:{...base('walking'),pedestrianEvidenceStatus:'received'},
 profile:{...evaluated('walking'),signalCount:1,signals:[historic]}});
 assert.equal(get(ped,'taas').evaluation,'historical-route-context');
 assert.equal(get(ped,'its'),undefined);
 assert.equal(get(ped,'road'),undefined);
 assert.equal(ped.safeRouteCertified,false);
 const drive=audit({route:{...base('driving'),pedestrianEvidenceStatus:'received'},
  profile:{...evaluated('driving'),signalCount:1,signals:[historic]}});
 assert.equal(get(drive,'taas'),undefined);
 assert.equal(get(drive,'its').acceptedSignals,0);
});
test('walking and driving model mismatch cannot be eligible',()=>{
 const mismatch=audit({route:base('walking'),profile:evaluated('driving')});
 assert.equal(mismatch.readiness,'not-evaluable');
 const mismatch2=audit({route:base('driving'),profile:evaluated('walking')});
 assert.equal(mismatch2.readiness,'not-evaluable');
});
test('missing forecast coverage and demo never yield evaluated assessment',()=>{
 const route=base('driving');
 assert.equal(audit({route,profile:{...evaluated('driving'),coverage:0,state:'insufficient-data'}}).readiness,'not-evaluable');
 assert.equal(audit({route:{...route,demo:true},profile:evaluated('driving')}).readiness,'simulation');
});
test('a received upstream feed is not evidence of a verified road intersection',()=>{
 const a=audit({route:{...base('driving'),itsEvidenceStatus:'received',roadEvidenceStatus:'received'},profile:evaluated('driving')});
 assert.equal(get(a,'its').evaluation,'received-not-route-verified');
 assert.equal(get(a,'road').evaluation,'received-not-route-verified');
 assert.equal(a.safeRouteCertified,false);
});
test('payload contains no raw coordinates, user IDs, provider URLs or credentials',()=>{
 const r=audit({route:{...base('walking'),pedestrianEvidenceStatus:'received',apiKey:'SECRET-LIVE-KEY'},
  profile:{...evaluated('walking'),signals:[{kind:'rain',lat:37.561, lng:126.978,provider:'기상청 격자예보'}]}});
 const s=JSON.stringify(r);
 assert.ok(!s.includes('37.56'));
 assert.ok(!s.includes('126.978'));
 assert.ok(!s.includes('SECRET-LIVE-KEY'));
 assert.equal(r.routeMode,'walking');
});
test('unknown source statuses remain unverified; unknown signals counted separately',()=>{
 const r=audit({route:{...base('driving'),roadEvidenceStatus:'new-source-code'},
  profile:{...evaluated('driving'),unknownSignals:2}});
 assert.equal(get(r,'road').reception,'not-checked');
 assert.equal(r.excludedUnverifiedSignals,2);
});

test('point-only ITS reports cannot authorize a road closure or automatic detour',()=>{
 const near={kind:'its-incident',provider:'국가교통정보센터 ITS',segmentVerified:false};
 const out=audit({route:{...base('driving'),itsEvidenceStatus:'received'},
 profile:{...evaluated('driving'),signalCount:1,signals:[near]}});
 assert.equal(get(out,'its').evaluation,'point-near-route-link-unverified');
 assert.equal(out.automaticRerouteAuthorized,false);
 assert.equal(out.sourceCompleteness,'incomplete');
});
test('risk code without official grade verification is not accepted as matched road evidence',()=>{
 const unverified={kind:'ice',roadRisk:3,riskGradeVerified:false};
 const out=audit({route:{...base('driving'),roadEvidenceStatus:'received'},
 profile:{...evaluated('driving'),signals:[unverified]}});
 assert.equal(get(out,'road').acceptedSignals,0);
 assert.equal(get(out,'road').evaluation,'received-not-route-verified');
});
test('unsupported arbitrary route labels are not echoed into output',()=>{
 const out=audit({route:{...base('DRIVING-SENSITIVE-TOKEN')},profile:evaluated('driving')});
 assert.equal(out.routeMode,'unknown');
 assert.ok(!JSON.stringify(out).includes('SENSITIVE-TOKEN'));
});
