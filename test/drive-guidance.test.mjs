import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {segmentMeters,routeFraction,classifyRisk,upcomingRisks} from '../public/drive-guidance.mjs';
import {ahead,locate} from '../public/rain-monitor.mjs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
const path=[{lat:37,lng:127,seconds:0},{lat:37,lng:127.1,seconds:600},{lat:37.1,lng:127.1,seconds:1200}];
test('progress rail follows actual polyline distance, not an invented straight-line road',()=>{
 const first=segmentMeters(path[0],path[1]),second=segmentMeters(path[1],path[2]);
 assert.ok(Math.abs(routeFraction(path,0))<1e-9);
 assert.ok(Math.abs(routeFraction(path,600)-first/(first+second))<1e-9);
 assert.ok(Math.abs(routeFraction(path,1200)-1)<1e-9);
 assert.ok(routeFraction(path,900)>routeFraction(path,600));
 assert.equal(routeFraction(path,-200),0);
 assert.equal(routeFraction([],200),0);
});
test('approaching weather cards are limited to 2 and require actual fetched forecasts',()=>{
 const sample=(seconds,code,rain=0,status='forecast')=>({label:'정식 경로',seconds,status,forecast:{provider:'kma',product:'초단기예보',rain,precipitationType:code}});
 const samples=[sample(100,1,4),sample(150,1,5),sample(350,3,0),sample(700,2,0),sample(810,1,1,'unavailable')];
 const risks=upcomingRisks(samples,0,2);
 assert.equal(risks.length,2);assert.equal(risks[0].type,'rain');assert.equal(risks[0].minutes,2);
 assert.equal(risks[1].type,'snow');assert.equal(risks[1].minutes,6);
 assert.equal(upcomingRisks(samples,400,2).length,1);
 assert.equal(upcomingRisks([{seconds:10,status:'unavailable',forecast:{rain:40}}],0).length,0);
 assert.equal(upcomingRisks([{seconds:10,status:'forecast',forecast:null}],0).length,0);
});
test('no road closures, fog or icing are invented from rainfall forecast',()=>{
 assert.equal(classifyRisk({rain:0,precipitationType:0}),null);
 assert.equal(classifyRisk({rain:null,precipitationType:null}),null);
 assert.equal(classifyRisk({rain:35,precipitationType:1}).title,'강한 비 예보');
 assert.equal(classifyRisk({rain:0,precipitationType:2}).type,'mixed');
 assert.equal(classifyRisk({rain:0,precipitationType:3}).type,'snow');
 assert.equal(classifyRisk({windSpeed:40,visibility:10}),null);
});
test('GPS look-ahead includes route progress seconds for accurate time-to-risk labels',()=>{
 const p=locate(path,{lat:37,lng:127.05});
 const samples=ahead(path,p.seconds,Date.parse('2026-11-06T02:00:00Z'));
 assert.ok(Number.isFinite(samples[0].seconds));
 assert.ok(Math.abs(samples[0].seconds-p.seconds)<.01);
 assert.equal(samples[1].seconds-samples[0].seconds,300);
});
test('Start guidance stays inside Sunny SAI and projects GPS onto Kakao map',()=>{
 assert.match(app,/navStartGuidance'\)\?\.addEventListener\('click',startRainGuidance\)/);
 assert.doesNotMatch(app,/if\(link\?\.href&&link\.href\.startsWith\('http'\)\)/);
 assert.match(app,/navigator\.geolocation\.watchPosition\(/);
 assert.match(app,/kmap\.panTo\(position\)/);
 assert.match(app,/drivingUI\.update\(found\.seconds,rainPosition\)/);
 assert.match(app,/drivingUI\.setAhead\(/);
 assert.match(app,/lastFollowTime=0/);
});
test('small overlay shows at most two weather notices and a slim distance progress rail',()=>{
 assert.match(ui,/id="sunnyDriveOverlay"[^>]*hidden/);
 assert.match(ui,/id="sunnyDriveAlerts"/);
 assert.match(ui,/id="sunnyDriveProgressTrack"/);
 assert.match(ui,/id="sunnyDriveStop"/);
 assert.match(css,/\.sunny-drive-alerts\{/);
 assert.match(css,/\.sunny-drive-progress-track\{/);
 assert.match(css,/body\.sunny-guiding \.map-floating/);
});
