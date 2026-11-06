import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rainGridRequest,parseRainGrid,nationalRainGrid} from '../lib/kma-rain-grid.mjs';
import {gridCorner,gridCellCorners,rainShade} from '../public/kma-rain-overlay.mjs';
import {handle} from '../lib/api.mjs';
const COUNT=149*253,NX=149,now=Date.parse('2026-11-06T10:55:00Z');
const example=()=>{
 const values=Array(COUNT).fill('-99');
 values[0]='0';values[148]='2.5';values[149]='1.25';values[149*99+60]='7';
 const rows=[];for(let i=0;i<values.length;i+=20)rows.push(values.slice(i,i+20).join(',')+',=');
 return rows.join('\n');
};
test('KMA national grid has official 149x253 geometry, x fastest, no interpolation',()=>{
 const parsed=parseRainGrid(example());
 assert.equal(parsed.nx,149);assert.equal(parsed.ny,253);
 assert.equal(parsed.valid,4);assert.equal(parsed.zero,1);
 assert.equal(parsed.missing,COUNT-4);
 assert.deepEqual(parsed.cells,[[149,1,2.5],[1,2,1.25],[61,100,7]]);
 assert.throws(()=>parseRainGrid('0,1,2'),/격자 개수/);
 assert.throws(()=>parseRainGrid('failed authentication'),/격자 개수/);
 const invalid=Array(COUNT).fill('-99');invalid[40]='abc';
 assert.throws(()=>parseRainGrid(invalid.join(',')),/형식/);
});
test('5km LCC grid cells match known Seoul KMA grid without guessed positions',()=>{
 const p=gridCorner(60,127);
 assert.ok(p.lat>37.3&&p.lat<37.8);
 assert.ok(p.lng>126.7&&p.lng<127.3);
 const corners=gridCellCorners(60,127);
 assert.equal(corners.length,4);
 assert.ok(corners.every(c=>Number.isFinite(c.lat)&&Number.isFinite(c.lng)));
 assert.equal(rainShade(0),null);
 assert.equal(rainShade(-99),null);
 assert.equal(rainShade(7),'#0872cd');
});
test('official nationwide provider request uses KMA host and real date',async()=>{
 const q=rainGridRequest(2,'server-only',now);
 assert.equal(q.url.hostname,'apihub.kma.go.kr');
 assert.equal(q.url.pathname,'/api/typ01/cgi-bin/url/nph-dfs_vsrt_grd');
 assert.equal(q.url.searchParams.get('vars'),'RN1');
 assert.equal(q.url.searchParams.get('authKey'),'server-only');
 assert.equal(q.url.searchParams.get('tmef').length,10);
 assert.equal(q.lead,2);
 await assert.rejects(nationalRainGrid(4,'key',async()=>new Response(example()),now),/시간/);
 const res=await nationalRainGrid(0,'secret',async url=>{
  assert.equal(new URL(url).searchParams.get('vars'),'RN1');
  return new Response(example(),{headers:{'Content-Type':'text/plain'}});
 },now);
 assert.equal(res.provider,'kma');assert.equal(res.valid,4);assert.equal(res.cells.length,3);
 assert.match(res.caution,/레이더 관측/);
 assert.ok(!JSON.stringify(res).includes('secret'));
});
test('actual forecast endpoint is preview-only, session bound and rejects invalid time',async()=>{
 const origin='https://rain.test',secret='x'.repeat(64),key='server-secret-key';
 const env={APP_ORIGIN:origin,SESSION_SECRET:secret,KMA_API_KEY:key,VERCEL_ENV:'preview'};
 const url=origin+'/api/rain-grid?lead=0';
 const unauthorized=await handle(new Request(url),env,async()=>{throw Error('must not fetch');});
 assert.equal(unauthorized.status,401);
 const auth=await handle(new Request(origin+'/api/session'),env),cookie=auth.headers.getSetCookie()[0].split(';')[0];
 const headers={Cookie:cookie};
 const bad=await handle(new Request(origin+'/api/rain-grid?lead=4',{headers}),env);
 assert.equal(bad.status,400);
 const ok=await handle(new Request(url,{headers}),env,async providerUrl=>{
  const u=new URL(providerUrl);
  assert.equal(u.hostname,'apihub.kma.go.kr');
  assert.equal(u.searchParams.get('authKey'),key);
  return new Response(example());
 });
 assert.equal(ok.status,200);
 const body=await ok.json();
 assert.deepEqual(body.cells,[[149,1,2.5],[1,2,1.25],[61,100,7]]);
 assert.equal(body.nx*body.ny,COUNT);
 assert.ok(!JSON.stringify(body).includes(key));
 const prod=await handle(new Request(url,{headers}),{...env,VERCEL_ENV:'production'},async()=>{throw Error('must not fetch');});
 assert.equal(prod.status,404);
});
test('non-home map switch is suppressed and full-country grid is drawn on Kakao only',()=>{
 const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
 for(const id of ['navRoadMap','navSatelliteMap','navRainGridLead','navRainGridStatus','navRadarQuick'])assert.ok(ui.includes('id="'+id+'"'));
 assert.match(css,/body:not\(\[data-sunny-nav="home"\]\) \.nav-map-layer-control/);
 assert.match(css,/\.sunny-rain-grid-canvas/);
 assert.match(app,/rainGridOverlay\.setMap\(kmap\)/);
 assert.match(ui,/레이더 실황이 아닌 초단기예보/);
 assert.doesNotMatch(ui,/id="navRadarImage"/);
});
