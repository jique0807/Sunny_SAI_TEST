import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessRouteHazard,withRiskAssessment,prioritizeRouteHazards,RISK_ENGINE_VERSION} from '../public/risk-engine.mjs';
import {buildRouteHazards,hazardDetails} from '../public/route-hazards.mjs';
const now=Date.parse('2026-11-09T10:00:00Z');
const routeSample={lat:36.5,lng:127.6,seconds:900,eta:'2026-11-09T11:00:00Z',
 validTime:'2026-11-09T11:00:00Z',provider:'기상청 격자예보',kind:'rain',rainMm:12,rainLabel:'12mm'};
test('Sunny rules engine is free deterministic classification rather than trained AI',()=>{
 assert.equal(RISK_ENGINE_VERSION,'rules-v1');
 assert.equal(assessRouteHazard(null).level,'unknown');
 assert.equal(assessRouteHazard({demo:true,kind:'warning'}).level,'simulation');
});
test('KMA rain classifications remain forecast-only and never invent flooding or icing',()=>{
 assert.equal(assessRouteHazard(routeSample).level,'notice');
 const severe=assessRouteHazard({...routeSample,rainMm:37,rainLabel:'37mm'});
 assert.equal(severe.level,'caution');
 assert.match(severe.caution,/침수/);
 assert.doesNotMatch(severe.label,/침수|살얼음|통제/);
 assert.equal(assessRouteHazard({...routeSample,rainMm:0,rainLabel:'강수 없음'}).level,'info');
 assert.equal(assessRouteHazard({...routeSample,validTime:'2026-11-09T17:00:00Z'}).level,'unknown');
 assert.equal(assessRouteHazard({...routeSample,lat:null}).score,0);
 assert.equal(assessRouteHazard({...routeSample,provider:'Open-Meteo'}).level,'unknown');
});
test('snow/PT Y does not authorize claiming verified road ice or unknown snowfall depth',()=>{
 const result=assessRouteHazard({...routeSample,kind:'snow',rainMm:null,snowLabel:null});
 assert.equal(result.level,'notice');
 assert.match(result.evidence,/적설량 확인 불가/);
 assert.match(result.caution,/결빙/);
});
test('official road-risk severity uses only georeferenced fresh approved records',()=>{
 const item={...routeSample,kind:'ice',provider:'기상청 도로위험기상',
  validTime:'2026-11-09T09:55:00Z',roadRisk:3,riskGradeVerified:true};
 const a=assessRouteHazard(item,{now});
 assert.equal(a.level,'high');assert.equal(a.score,95);
 assert.equal(assessRouteHazard({...item,roadRisk:2},{now}).level,'caution');
 assert.equal(assessRouteHazard({...item,roadRisk:1},{now}).level,'notice');
 assert.equal(assessRouteHazard({...item,validTime:'2026-11-09T09:40:00Z'},{now}).level,'unknown');
 assert.equal(assessRouteHazard({...item,roadRisk:4},{now}).score,0);
 assert.equal(assessRouteHazard({...item,riskGradeVerified:false},{now}).score,0);
 assert.equal(assessRouteHazard({...item,lat:undefined},{now}).score,0);
});
test('official warnings require verified point proximity and time but never claim polygon intersection',()=>{
 const warning={...routeSample,kind:'warning',provider:'기상청 특보현황 · 경로 500m 이내 관측지점 기준'};
 assert.equal(assessRouteHazard(warning,{now}).level,'caution');
 assert.match(assessRouteHazard(warning,{now}).caution,/교차|경계/);
 assert.equal(assessRouteHazard({...warning,validTime:null},{now}).score,0);
});
test('prioritization considers verified official risk, forecast time, and deduplicates',()=>{
 const rain={...routeSample,seconds:1000,rainMm:3};
 const rainNearby={...rain,seconds:1080};
 const official={...routeSample,kind:'ice',provider:'기상청 도로위험기상',
  validTime:'2026-11-09T09:55:00Z',roadRisk:3,riskGradeVerified:true,seconds:1200};
 const items=prioritizeRouteHazards([rain,rainNearby,official,{...rain,kind:'flood'}],800,2,{now});
 assert.equal(items.length,2);
 assert.equal(items[0].kind,'ice');
 assert.equal(items[1].kind,'rain');
 assert.equal(items[0].assessment.level,'high');
 assert.deepEqual(prioritizeRouteHazards([rain],1500,2,{now}),[]);
 assert.deepEqual(prioritizeRouteHazards([],0,2,{now}),[]);
});
test('route markers and detail panel expose engine reasoning but demo stays fictional',()=>{
 const sample={status:'forecast',lat:37.1,lng:127.1,seconds:300,eta:'2026-11-09T11:00:00Z',
  label:'실제 경로',forecast:{provider:'kma',precipitationType:1,rain:35,rainLabel:'35mm',
   time:'2026-11-09T11:00:00Z'}};
 const hazards=buildRouteHazards([sample]);
 assert.equal(hazards.length,1);
 assert.equal(hazards[0].assessment.level,'caution');
 const detail=hazardDetails(hazards[0]);
 assert.ok(detail.some(s=>s.includes('Sunny 규칙형 판정')));
 assert.ok(detail.some(s=>s.includes('판정 근거')));
 const mock=withRiskAssessment({demo:true,title:'가상의 비',kind:'rain'});
 assert.equal(mock.assessment.level,'simulation');
 assert.match(hazardDetails({...mock,label:'이천',measure:'100mm',provider:'시연'}).join(' '),/시연 데이터/);
});
