import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUploadedRiskData,evaluateUploadedRisk} from '../public/upload-risk-data.mjs';
const now=Date.parse('2026-11-11T10:00:00Z');
const route={departure:new Date(now).toISOString(),travelMode:'driving',rainPath:[{lat:37.55,lng:127,seconds:0},{lat:37.56,lng:127,seconds:600}]};
const row={lat:37.555,lng:127,kind:'rain',value:40,validFrom:'2026-11-11T10:00:00Z',validTo:'2026-11-11T11:00:00Z'};
test('uploaded data only contributes a separate advisory for matched position, time and mode',()=>{
 const before=JSON.stringify(route),rows=parseUploadedRiskData(JSON.stringify([row]));
 const report=evaluateUploadedRisk(rows,route,{now});assert.equal(report.matched.length,1);assert.equal(report.matched[0].level,'caution');assert.equal(JSON.stringify(route),before);
 assert.equal(evaluateUploadedRisk([{...rows[0],lng:128}],route,{now}).matched.length,0);
 assert.equal(evaluateUploadedRisk([{...rows[0],from:now+7200000,to:now+10800000}],route,{now}).matched.length,0);
 assert.equal(evaluateUploadedRisk([{...rows[0],mode:'walking'}],route,{now}).matched.length,0);
 assert.equal(evaluateUploadedRisk(rows,{...route,demo:true},{now}).matched.length,0);
 assert.equal(evaluateUploadedRisk(rows,route,{now:now+7200000}).expired,1);
});
test('malformed, missing time, non-Korean and unsupported measurements are rejected',()=>{
 for(const r of [{...row,lat:127},{...row,value:'40'},{...row,validTo:null},{...row,kind:'flood'},{...row,mode:'train'}])assert.throws(()=>parseUploadedRiskData(JSON.stringify([r])));
 assert.throws(()=>parseUploadedRiskData('x'.repeat(1000001)));
});
test('Open-Meteo original API arrays are normalized using returned grid coordinates and checked units',()=>{
 const raw={latitude:37.55,longitude:127,hourly_units:{precipitation:'mm',temperature_2m:'°C',wind_speed_10m:'m/s'},hourly:{time:[now/1000],precipitation:[40],temperature_2m:[35],wind_speed_10m:[15]}};
 const rows=parseUploadedRiskData(JSON.stringify(raw));assert.equal(rows.length,3);assert.equal(rows[0].lat,37.55);assert.equal(evaluateUploadedRisk(rows,route,{now}).matched.length,3);
 raw.hourly_units.wind_speed_10m='km/h';assert.throws(()=>parseUploadedRiskData(JSON.stringify(raw)));
});
