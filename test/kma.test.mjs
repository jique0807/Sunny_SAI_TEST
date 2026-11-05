import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toGrid,publication,precipitation,matchKma,kmaWeather} from '../lib/kma.mjs';
import {handle} from '../lib/api.mjs';
import {assess} from '../public/rules.mjs';
const now=Date.parse('2026-10-26T01:50:00Z'),eta='2026-10-26T12:00:00+09:00';
const sample={lat:37.5665,lng:126.978,eta};
const rows=(date='20261026',time='1200')=>[['T1H','18'],['RN1','1.0mm 미만'],['WSD','4'],['PTY','1']].map(([category,fcstValue])=>({category,fcstValue,baseDate:'20261026',baseTime:'1030',fcstDate:date,fcstTime:time}));
test('KMA Seoul grid and KST publication rollover include release delay',()=>{
 assert.deepEqual(toGrid(37.5665,126.978),{nx:60,ny:127});assert.equal(publication(now,'ultra'),'202610261030');
 assert.equal(publication(Date.parse('2026-10-26T00:10:00+09:00'),'short'),'202610252300');
 assert.equal(publication(Date.parse('2026-10-26T02:10:00+09:00'),'short'),'202610252300');
 assert.equal(publication(Date.parse('2026-10-26T02:30:00+09:00'),'short'),'202610260200');
});
test('precipitation ranges, missing codes and wind are not fabricated as exact amounts or gusts',()=>{
 assert.equal(precipitation('강수없음').rain,0);assert.equal(precipitation('1.2mm').rain,1.2);assert.equal(precipitation('-999').rain,null);
 assert.deepEqual(precipitation('30.0~50.0mm'),{rain:null,rainMin:30,rainMax:50,rainLabel:'30.0~50.0mm'});
 const f=matchKma(rows(),eta,'ultra');assert.equal(f.rain,null);assert.equal(f.rainMax,1);assert.equal(f.windSpeed,4);assert.equal(f.gust,null);assert.equal(f.visibility,null);assert.equal(assess(f).kind,'normal');
 assert.equal(matchKma(rows(),'2026-10-27T12:00:00+09:00','ultra'),null);assert.equal(assess({...f,rainMin:30,rainLabel:'30.0~50.0mm'}).kind,'attention');
});
test('KMA proxy encodes server key, deduplicates grids, and never returns the credential',async()=>{
 let calls=0;const key='private-key+&/?';const fetcher=async url=>{calls++;const u=new URL(url);assert.equal(u.hostname,'apihub.kma.go.kr');assert.equal(u.searchParams.get('authKey'),key);assert.equal(u.searchParams.get('dataType'),'JSON');assert.equal(u.searchParams.get('nx'),'60');return Response.json({response:{header:{resultCode:'00'},body:{items:{item:rows()}}}});};
 const d=await kmaWeather([sample,{...sample,label:'same grid'}],key,fetcher,now);assert.equal(calls,1);assert.equal(d.provider,'kma');assert.ok(d.samples.every(p=>p.status==='forecast'));assert.ok(!JSON.stringify(d).includes(key));await kmaWeather([sample],key,fetcher,now+1000);assert.equal(calls,1);
});
test('KMA rejects provider error bodies and returns explicit missing values, never other-provider weather',async()=>{
 const d=await kmaWeather([sample],'secret',async()=>new Response('secret upstream private details',{status:403}),now);assert.equal(d.samples[0].forecast,null);assert.equal(d.samples[0].status,'unavailable');assert.match(d.samples[0].error,/403/);assert.ok(!JSON.stringify(d).includes('secret'));
 const noData=await kmaWeather([sample],'test',async()=>Response.json({response:{header:{resultCode:'03'},body:{}}}),now);assert.match(noData.samples[0].error,/03/);
});
test('explicit KMA selection fails clearly without a server key; client cannot supply one',async()=>{
 const origin='https://test.example',env={SESSION_SECRET:'s'.repeat(64),APP_ORIGIN:origin};const r=await handle(new Request(origin+'/api/session'),env);const session=await r.json();assert.equal(session.connections.kma,false);const cookie=r.headers.getSetCookie()[0].split(';')[0];
 const response=await handle(new Request(origin+'/api/weather',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify({provider:'kma',samples:[{...sample,eta:new Date().toISOString()}],authKey:'client-injected'})}),env,async()=>{throw Error('must not fetch');});
 assert.equal(response.status,503);assert.match((await response.json()).error,/KMA_API_KEY/);
});
