import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseRoadWeather,fetchRoadWeather} from '../lib/road-weather-observations.mjs';
import {buildRoadWeatherHazards} from '../public/road-weather-risk.mjs';
import {assessRouteHazard} from '../public/risk-engine.mjs';
import {kmaWeather} from '../lib/kma.mjs';
const now=Date.parse('2026-11-11T05:00:00Z');
const line=(time='202611111350',fog='12')=>`${time},0500C00001,station,37.5,127,-99,${fog},${fog},00,00,=`;
const wrap=rows=>'#START7777\n'+rows.join('\n')+'\n#7777END';
test('CCTV parser keeps latest valid station and excludes stale, future and invalid classes',()=>{
 const result=parseRoadWeather(wrap([line('202611111340','11'),line(),line('202611111401'),line('202611111200')]),{now});
 assert.equal(result.items.length,1);assert.equal(result.items[0].fog,12);
 assert.equal(parseRoadWeather(wrap([line('202611111200')]),{now}).status,'stale');
 assert.equal(parseRoadWeather(wrap([]),{now}).status,'empty');
 assert.equal(parseRoadWeather('unauthorized',{now}).status,'invalid_response');
 assert.equal(parseRoadWeather(wrap([line(undefined,'99')]),{now}).items.length,0);
});
test('fresh nearby observations enter engine; distant paths, stale observations and far-future ETA do not',()=>{
 const report=parseRoadWeather(wrap([line()]),{now});
 const route={travelMode:'driving',departure:new Date(now).toISOString(),rainPath:[{lat:37.5,lng:126.999,seconds:0},{lat:37.5,lng:127.001,seconds:100}]};
 const hazards=buildRoadWeatherHazards(route,report,{now});assert.equal(hazards.length,1);
 assert.equal(assessRouteHazard(hazards[0],{now}).level,'caution');
 assert.equal(assessRouteHazard({...hazards[0],distanceToPath:251},{now}).level,'unknown');
 assert.equal(buildRoadWeatherHazards({...route,departure:new Date(now+3600000).toISOString()},report,{now}).length,0);
 assert.equal(buildRoadWeatherHazards(route,report,{now:now+3600000}).length,0);
 assert.equal(buildRoadWeatherHazards({...route,demo:true},report,{now}).length,0);
});
test('provider failure remains failure and no key is returned',async()=>{
 const result=await fetchRoadWeather('secret',async()=>new Response('secret',{status:403}),now);
 assert.equal(result.status,'failed');assert.ok(!JSON.stringify(result).includes('secret'));
});
test('same-hour SNO supplements ultra forecast while preserving categorical depth and separate issuance',async()=>{
 const samples=[{lat:37.5,lng:127,eta:'2026-11-11T06:00:00Z'}];
 const rows=(short)=>[['PTY','3'],['T1H','0'],...(short?[['SNO','1.0~4.9cm']]:[])].map(([category,fcstValue])=>({category,fcstValue,baseDate:'20261111',baseTime:short?'1400':'1330',fcstDate:'20261111',fcstTime:'1500'}));
 const fetcher=async url=>Response.json({response:{header:{resultCode:'00'},body:{items:{item:rows(url.includes('getVilageFcst'))}}}});
 const result=await kmaWeather(samples,'key',fetcher,now,false,0,true),f=result.samples[0].forecast;
 assert.equal(f.snowfall,null);assert.equal(f.snowfallLabel,'1.0~4.9cm');assert.equal(f.snowfallIssuedAt,'202611111400');assert.equal(f.gust,null);
 const partial=await kmaWeather(samples,'key',async url=>url.includes('getVilageFcst')?new Response('',{status:403}):fetcher(url),now,false,0,true);
 assert.equal(partial.samples[0].status,'forecast');assert.equal(partial.samples[0].forecast.snowfallStatus,'unavailable');
});
test('authenticated road-weather API validates input and feeds provider classes without credentials',async()=>{
 const {handle}=await import('../lib/api.mjs');const origin='https://additional.test';
 const env={APP_ORIGIN:origin,SESSION_SECRET:'s'.repeat(64),KMA_API_KEY:'private-key'};
 const r=await handle(new Request(origin+'/api/session'),env),session=await r.json();
 const cookie=r.headers.get('set-cookie').split(';')[0];
 const send=(input,token=session.csrf)=>handle(new Request(origin+'/api/road-weather',{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':token,'Content-Type':'application/json'},body:JSON.stringify(input)}),env,async()=>new Response(wrap([])));
 assert.equal((await send({},'invalid')).status,403);assert.equal((await send({url:'https://unapproved.example'})).status,400);
 const result=await send({});assert.equal(result.status,200);const text=await result.text();assert.equal(JSON.parse(text).status,'empty');assert.ok(!text.includes('private-key'));
});
test('both mobility engines accept verified road-weather evidence and reject stale evidence',async()=>{
 const {evaluateDrivingRisk,evaluateWalkingRisk}=await import('../public/safe-route-engine.mjs');
 const route={travelMode:'driving',departure:new Date(now).toISOString(),duration:100,distance:200,samples:[],rainPath:[{lat:37.5,lng:126.999,seconds:0},{lat:37.5,lng:127.001,seconds:100}]};
 const extraHazards=buildRoadWeatherHazards(route,parseRoadWeather(wrap([line()]),{now}),{now});
 for(const [mode,evaluate]of [['driving',evaluateDrivingRisk],['walking',evaluateWalkingRisk]]){
  const profile=evaluate({...route,travelMode:mode},{extraHazards,now});
  assert.ok(profile.signals.some(e=>e.kind==='observed-road-fog'));
  const stale=evaluate({...route,travelMode:mode},{extraHazards,now:now+3600000});
  assert.ok(!stale.signals.some(e=>e.assessment?.score>0&&e.kind==='observed-road-fog'));
 }
});
