import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fromGrid,cellGeometry,kmaMapForecast} from '../lib/kma-map.mjs';
import {toGrid} from '../lib/kma.mjs';
import {sampleMapPoints,isSnowPty,gridPresentation,rainColor,forecastForHour} from '../public/kma-map-overlay.mjs';
import {handle} from '../lib/api.mjs';
const now=Date.parse('2026-11-05T05:10:00Z');
const validTime='2026-11-05T05:00:00.000Z';
const stamp=t=>new Date(Date.parse(t)+9*3600000).toISOString().replace(/[-:T]/g,'').slice(0,12);
const target=stamp(validTime);
const values=[['T1H','13'],['WSD','4'],['RN1','1.0mm 미만'],['PTY','2']];
const items=values.map(([category,fcstValue])=>({category,fcstValue,fcstDate:target.slice(0,8),fcstTime:target.slice(8),
 baseDate:'20261105',baseTime:'1330'}));
test('KMA inverse grid matches geographic forward mapping and 5-km cell corners',()=>{
 const xy=toGrid(37.5665,126.978),center=fromGrid(xy.nx,xy.ny);
 assert.deepEqual(toGrid(center.lat,center.lng),xy);
 assert.ok(Math.abs(center.lat-37.5665)<.05);assert.ok(Math.abs(center.lng-126.978)<.05);
 const geometry=cellGeometry(xy);
 assert.equal(geometry.corners.length,4);
 for(const p of geometry.corners){assert.ok(Number.isFinite(p.lat));assert.ok(Number.isFinite(p.lng));}
});
test('map viewport sampling stays within Korea and caps at sixteen actual point queries',()=>{
 assert.equal(sampleMapPoints({west:126.8,east:127.3,south:37.3,north:37.8}).length,16);
 assert.equal(sampleMapPoints({west:0,east:1,south:0,north:1}).length,0);
 assert.equal(sampleMapPoints(null).length,0);
});
test('snow means PTY snow/mixed precipitation, never invented snowfall totals',()=>{
 assert.equal(isSnowPty(3),true);assert.equal(isSnowPty(2),true);assert.equal(isSnowPty(6),true);assert.equal(isSnowPty(7),true);assert.equal(isSnowPty(1),false);
 const f={temperature:13,windSpeed:4,rain:null,rainMin:0,rainMax:1,rainLabel:'1.0mm 미만',precipitationType:2};
 assert.equal(gridPresentation(f,false,false,true).label,'비·눈');
 assert.equal(gridPresentation({...f,precipitationType:1},false,false,true),null);
 assert.equal(gridPresentation(f,false,true,false).color,'#8bdef6');
 assert.equal(gridPresentation({...f,precipitationType:0,rainLabel:'강수없음',rain:0,rainMin:null,rainMax:null},false,true,false),null);
});
test('KMA map requests official grid records and deduplicates cells without leaking keys',async()=>{
 let calls=0;
 const key='private+/&';
 const d=await kmaMapForecast([{lat:37.5665,lng:126.978},{lat:37.5665,lng:126.978}],key,async u=>{
  calls++;
  const url=new URL(u);assert.equal(url.hostname,'apihub.kma.go.kr');
  assert.equal(url.searchParams.get('authKey'),key);
  assert.match(url.pathname,/getUltraSrtFcst$/);
  return Response.json({response:{header:{resultCode:'00'},body:{items:{item:items}}}});
 },now);
 assert.equal(calls,1);assert.equal(d.cells.length,1);assert.equal(d.cells[0].status,'forecast');assert.equal(d.validTimes.length,6);assert.equal(d.cells[0].forecasts.length,6);
 assert.equal(d.cells[0].forecast.precipitationType,2);
 assert.equal(d.cells[0].forecast.rainLabel,'1.0mm 미만');
 assert.deepEqual(d.cells[0].grid,{nx:60,ny:127});
 assert.ok(!JSON.stringify(d).includes(key));
});
test('map forecast endpoint validates session and points and keeps raw provider credentials server-only',async()=>{
 const origin='https://sunny.example',env={APP_ORIGIN:origin,SESSION_SECRET:'x'.repeat(64),KMA_API_KEY:'private-key'};
 const unauthorized=await handle(new Request(origin+'/api/map-forecast',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}),env);
 assert.equal(unauthorized.status,401);
 const session=await handle(new Request(origin+'/api/session'),env),info=await session.json();
 assert.equal(info.connections.kma,true);
 const cookie=session.headers.getSetCookie()[0].split(';')[0],headers={Origin:origin,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':info.csrf};
 const invalid=await handle(new Request(origin+'/api/map-forecast',{method:'POST',headers,body:JSON.stringify({points:[{lat:0,lng:0}]})}),env,async()=>{throw Error('must not fetch')});
 assert.equal(invalid.status,400);
 const ok=await handle(new Request(origin+'/api/map-forecast',{method:'POST',headers,body:JSON.stringify({points:[{lat:37.5665,lng:126.978}]})}),env,async url=>Response.json({response:{header:{resultCode:'00'},body:{items:{item:items}}}}));
 const d=await ok.json();
 assert.equal(ok.status,200);
 assert.equal(d.provider,'kma');
 assert.ok(!JSON.stringify(d).includes('private-key'));
});

test('time-slider only selects official returned forecast hour, and dry cells stay transparent',()=>{
 const cell={status:'forecast',forecasts:[{rain:0,rainLabel:'강수없음',precipitationType:0},{rain:8,rainLabel:'8',precipitationType:1},null,null]};
 assert.equal(forecastForHour(cell,0).rain,0);
 assert.equal(forecastForHour(cell,1).rain,8);
 assert.equal(forecastForHour(cell,2),null);
 assert.equal(rainColor(cell.forecasts[0]),null);
 assert.equal(rainColor(cell.forecasts[1]),'#0872cd');
 assert.equal(rainColor({rain:null,rainLabel:null,precipitationType:null}),null);
});
test('KMA series returns distinct valid forecast hours from a single real grid response',async()=>{
 const dates=[0,1,2,3,4,5].map(h=>stamp(new Date(Date.parse(validTime)+h*3600000).toISOString()));
 const frames=dates.flatMap((date,i)=>[['T1H',String(10+i)],['RN1',String(i)],['PTY',i?'1':'0']].map(([category,fcstValue])=>({
  category,fcstValue,baseDate:'20261105',baseTime:'1330',fcstDate:date.slice(0,8),fcstTime:date.slice(8)
 })));
 let calls=0;
 const data=await kmaMapForecast([{lat:37.5665,lng:126.978}],'key',async()=>{
  calls++;return Response.json({response:{header:{resultCode:'00'},body:{items:{item:frames}}}});
 },now);
 assert.equal(calls,1);
 assert.deepEqual(data.cells[0].forecasts.map(f=>f?.temperature),[10,11,12,13,14,15]);
 assert.equal(data.validTimes.length,6);
});
