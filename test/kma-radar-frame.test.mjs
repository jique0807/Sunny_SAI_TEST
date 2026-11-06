import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fetchRadarFrame,radarRequest,requestedTimes,RADAR_LEADS} from '../lib/kma-radar-frame.mjs';
import {radarTimeLabel,FORECAST_LEADS} from '../public/radar-viewer.mjs';
import {handle} from '../lib/api.mjs';

const now=Date.parse('2026-11-06T04:25:00Z');
const key='mock-secret-should-never-appear';
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1]);
test('radar requests use only the official KMA host and bounded times',()=>{
 assert.deepEqual([...RADAR_LEADS],[0,30,60,90,120]);
 assert.deepEqual([...FORECAST_LEADS],[...RADAR_LEADS]);
 for(const lead of RADAR_LEADS){
  const url=radarRequest(lead,key,now);
  assert.equal(url.hostname,'apihub.kma.go.kr');
  assert.equal(url.pathname,'/api/typ03/cgi/rdr/nph-qpf_ana_img');
  assert.equal(url.searchParams.get('authKey'),key);
  assert.equal(url.searchParams.get('ef'),String(lead));
  assert.equal(url.searchParams.get('tm'),'202611061240');
 }
 assert.throws(()=>radarRequest(-30,key,now),/지원하지 않는/);
 assert.throws(()=>radarRequest(61,key,now),/지원하지 않는/);
 assert.throws(()=>radarRequest(60,'',now),/인증키/);
 assert.deepEqual(requestedTimes(now,60),{
  baseTime:'2026-11-06T03:40:00.000Z',requestedValidTime:'2026-11-06T04:40:00.000Z'
 });
 assert.ok(radarTimeLabel('2026-11-06T04:40:00Z').includes('13:40'));
});
test('image body must have a real image signature, not HTTP 200 HTML/error',async()=>{
 const actual=await fetchRadarFrame(60,key,async()=>new Response(png,{headers:{'Content-Type':'image/png'}}),now);
 assert.equal(actual.mime,'image/png');
 assert.deepEqual(Array.from(actual.bytes),Array.from(png));
 await assert.rejects(
  fetchRadarFrame(60,key,async()=>new Response('<html>permission denied</html>',{status:200}),now),
  /강수영상/);
 await assert.rejects(
  fetchRadarFrame(60,key,async()=>new Response(png,{status:403}),now),
  /HTTP 403/);
 await assert.rejects(
  fetchRadarFrame(60,key,async()=>new Response(png,{headers:{'Content-Length':String(9*1024*1024)}}),now),
  /크기 제한/);
});
test('preview radar image requires a valid session, has no key in response or URL',async()=>{
 const origin='https://sunny.test',env={APP_ORIGIN:origin,SESSION_SECRET:'x'.repeat(64),
  KMA_API_KEY:key,VERCEL_ENV:'preview'};
 const path=origin+'/api/radar-frame?lead=60';
 const noSession=await handle(new Request(path),env,async()=>{throw Error('must not fetch');});
 assert.equal(noSession.status,401);
 const auth=await handle(new Request(origin+'/api/session'),env);
 const cookie=auth.headers.getSetCookie()[0].split(';')[0];
 let requested=0;
 const fetched=await handle(new Request(path,{headers:{Cookie:cookie}}),env,async(url)=>{
  requested++;
  const u=new URL(url);assert.equal(u.hostname,'apihub.kma.go.kr');
  assert.equal(u.searchParams.get('authKey'),key);
  return new Response(png,{headers:{'Content-Type':'image/png'}});
 });
 assert.equal(requested,1);assert.equal(fetched.status,200);
 assert.equal(fetched.headers.get('content-type'),'image/png');
 assert.equal(fetched.headers.get('x-radar-lead-minutes'),'60');
 assert.match(fetched.headers.get('x-radar-base-time'),/^20\d\d-/);
 assert.deepEqual(Array.from(new Uint8Array(await fetched.arrayBuffer())),Array.from(png));
 assert.ok(!JSON.stringify([...fetched.headers]).includes(key));
 const bad=await handle(new Request(origin+'/api/radar-frame?lead=60&authKey=x',{headers:{Cookie:cookie}}),env);
 assert.equal(bad.status,400);
 const out=await handle(new Request(path,{headers:{Cookie:cookie}}),{...env,VERCEL_ENV:'production'},async()=>{throw Error('must not fetch');});
 assert.equal(out.status,404);
});
test('mobile UI opens standalone forecast viewer and never claims geographic alignment',()=>{
 const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
 for(const id of ['navRadarPanel','navRadarQuick','navRadarToggle','navRadarLead','navRadarImage','navRadarStatus'])
  assert.ok(ui.includes('id="'+id+'"'),id);
 assert.match(ui,/카카오 도로지도와 별도/);
 assert.match(app,/initRadarViewer/);
 assert.match(css,/\.sunny-radar-panel\{/);
 assert.match(css,/body\.sunny-guiding \.sunny-radar-panel/);
});
