import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ahead,locate,RainGate,rainLevel} from '../public/rain-monitor.mjs';
import {publication,matchKma,toGrid,kmaWeather} from '../lib/kma.mjs';
const now=Date.parse('2026-11-05T00:50:00Z');
const sample=(amount,pty=1,mins=5)=>({label:'경부고속도로',status:'forecast',eta:new Date(now+mins*60000).toISOString(),forecast:{provider:'kma',product:'초단기예보',rain:amount,precipitationType:pty}});
test('rain only, escalation, missing and duplicate suppression',()=>{
 const g=new RainGate();assert.equal(g.take([sample(0,0)],now),null);assert.match(g.take([sample(2)],now),/비 또는 빗방울/);assert.equal(g.take([sample(2)],now+1000),null);assert.equal(g.take([{status:'unavailable'}],now+61000),null);assert.equal(g.take([sample(2)],now+62000),null);assert.match(g.take([sample(30)],now+63000),/강한 비/);assert.equal(rainLevel({provider:'kma',rain:0,precipitationType:5}),1);
 assert.equal(g.take([sample(50,1,90)],now+65000),null);
});
test('GPS progress projects onto route; lookahead coordinates follow route time',()=>{
 const path=[{lat:37,lng:127,seconds:0},{lat:37,lng:127.1,seconds:600}];const p=locate(path,{lat:37,lng:127.05});assert.ok(Math.abs(p.seconds-300)<.01);assert.ok(p.meters<1);const s=ahead(path,300,now);assert.equal(s.length,2);assert.ok(Math.abs(s[0].lng-127.05)<.0001);assert.equal(Date.parse(s[1].eta)-now,300000);
});
test('official spreadsheet Seoul coordinate and hourly accumulation end-time matching',()=>{
 assert.deepEqual(toGrid(37.5635694444444,126.980008333333),{nx:60,ny:127});
 assert.equal(publication(Date.parse('2026-11-05T00:44:00Z'),'ultra'),'202611050830');assert.equal(publication(now,'ultra'),'202611050930');
 const rows=[{fcstDate:'20261105',fcstTime:'1000',category:'RN1',fcstValue:'30.0~50.0mm'}];assert.equal(matchKma(rows,'2026-11-05T00:10:00Z','ultra').rainMin,30);
});
test('ultra-only never substitutes short forecast on missing data',async()=>{
 const calls=[];const r=await kmaWeather([{lat:37.5,lng:127,eta:new Date(now).toISOString()}],'test-key',async url=>{calls.push(url);return Response.json({response:{header:{resultCode:'03'}}});},now,true);assert.equal(calls.length,1);assert.ok(calls[0].includes('getUltraSrtFcst'));assert.equal(r.samples[0].status,'unavailable');
});
