import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoreModeRisk,drivingRiskIndex,walkingRiskIndex} from '../public/risk-mode-policy.mjs';
const s=(kind,level,extra={})=>({kind,assessment:{level},...extra});
test('driving weights traffic and road surface more than pedestrian exposure',()=>{
 const car=drivingRiskIndex([s('its-incident','notice'),s('ice','high',{roadRisk:3}),s('pedestrian-hotspot','notice')]);
 assert.equal(car.policy,'driving-exposure-v1');
 assert.equal(car.evidenceCount,2);
 assert.equal(car.priorities[0],'ice');
 assert.ok(car.signalIndex>60);
});
test('walking weights heat and historic walking crash context, never ITS',()=>{
 const walk=walkingRiskIndex([s('heat','caution'),s('pedestrian-hotspot','notice'),s('its-incident','high'),s('ice','high',{roadRisk:3})]);
 assert.equal(walk.policy,'walking-exposure-v1');
 assert.equal(walk.evidenceCount,2);
 assert.equal(walk.priorities[0],'heat');
 assert.ok(!walk.priorities.includes('its-incident'));
});
test('same validated evidence produces distinct mode exposure',()=>{
 const shared=[s('rain','caution'),s('heat','caution')];
 const driving=scoreModeRisk('driving',shared),walking=scoreModeRisk('walking',shared);
 assert.ok(walking.signalIndex>driving.signalIndex);
 assert.ok(driving.priorities[0]==='rain');
 assert.ok(walking.priorities[0]==='heat');
});
test('empty, simulation and malformed evidence do not create hazard',()=>{
 assert.equal(scoreModeRisk('driving',[]).signalIndex,0);
 assert.equal(scoreModeRisk('walking',[{kind:'heat'}]).signalIndex,0);
 assert.equal(scoreModeRisk('driving',[s('rain','high',{demo:true})]).signalIndex,0);
 assert.equal(scoreModeRisk('spacecraft',[s('rain','high')]).policy,'unsupported');
});
test('source objects are left untouched and indices are capped',()=>{
 const records=Array.from({length:30},()=>s('rain','high'));
 assert.equal(scoreModeRisk('walking',records).signalIndex,100);
 assert.equal(records[0].assessment.level,'high');
});
