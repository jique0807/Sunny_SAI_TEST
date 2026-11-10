import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveRouteDeparture} from '../public/route-departure.mjs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('untouched default always refreshes at search time after long mobile idle',()=>{
 const opened=Date.parse('2026-11-10T06:00:00Z');
 const now=opened+30*60000;
 const staleDefault=new Date(opened+120000).toISOString();
 const result=resolveRouteDeparture(staleDefault,{now,userEdited:false});
 assert.equal(result.refreshed,true);
 assert.equal(result.iso,new Date(now+120000).toISOString());
 assert.ok(Date.parse(result.iso)>now);
});
test('explicit future departure is preserved while valid',()=>{
 const now=Date.parse('2026-11-10T06:00:00Z');
 const choice=new Date(now+2*3600000).toISOString();
 const result=resolveRouteDeparture(choice,{now,userEdited:true});
 assert.deepEqual(result,{iso:choice,refreshed:false});
});
test('explicit stale, invalid or >24-hour departure requires user correction',()=>{
 const now=Date.parse('2026-11-10T06:00:00Z');
 assert.throws(()=>resolveRouteDeparture(new Date(now-11*60000).toISOString(),{now,userEdited:true}),/출발시각이 지났습니다/);
 assert.throws(()=>resolveRouteDeparture('no date',{now,userEdited:true}),/출발시각을 확인/);
 assert.throws(()=>resolveRouteDeparture(new Date(now+25*3600000).toISOString(),{now,userEdited:true}),/24시간 이내/);
 assert.equal(resolveRouteDeparture(new Date(now-9*60000).toISOString(),{now,userEdited:true}).refreshed,false);
});
test('walking UI uses search-time departure and does not equate weather/map failure with TMAP failure',()=>{
 assert.match(app,/resolveRouteDeparture\(departureInput\.value/);
 assert.match(app,/departureEdited\|\|departureInput\.value!==autoDepartureValue/);
 assert.match(app,/Promise\.allSettled\(\[loadWeather\(\),showMap\('kakao'\)\]\)/);
 assert.match(app,/경로는 찾았습니다/);
 assert.doesNotMatch(app,/new Date\(\$\('departure'\)\.value\)\.toISOString\(\)/);
 assert.match(app,/d\.travelMode!==mode\|\|d\.mode!==mode/);
 assert.match(app,/if\(playing\|\|routeSearchPending\)return/);
 assert.match(app,/studioRouteSearch'\)\)\$('studioRouteSearch'\)\.disabled=true/);
});
