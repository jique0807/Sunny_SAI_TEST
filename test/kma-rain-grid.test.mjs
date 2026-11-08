import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rainGridRequest,parseRainGrid,nationalRainGrid} from '../lib/kma-rain-grid.mjs';
import {gridRequest,stampKst} from '../lib/kma-rain-grid-probe.mjs';
import {gridCorner,gridCellCorners,rainShade,drawRainCells} from '../public/kma-rain-overlay.mjs';
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
 await assert.rejects(nationalRainGrid(6,'key',async()=>new Response(example()),now),/시간/);
 const res=await nationalRainGrid(0,'secret',async url=>{
  assert.equal(new URL(url).searchParams.get('vars'),'RN1');
  return new Response(example(),{headers:{'Content-Type':'text/plain'}});
 },now);
 assert.equal(res.provider,'kma');assert.equal(res.valid,4);assert.equal(res.cells.length,3);
 assert.match(res.caution,/레이더 관측/);
 assert.ok(!JSON.stringify(res).includes('secret'));
});
test('the first frame stays at or ahead of the current hour across midnight KST',()=>{
 const now=Date.parse('2026-11-07T14:20:00Z');
 assert.equal(rainGridRequest(0,'key',now).validTime,'2026-11-07T15:00:00.000Z');
 assert.equal(rainGridRequest(3,'key',now).url.searchParams.get('tmef'),'2026110803');
});
test('actual forecast endpoint is session bound and rejects invalid time',async()=>{
 const origin='https://rain.test',secret='x'.repeat(64),key='server-secret-key';
 const env={APP_ORIGIN:origin,SESSION_SECRET:secret,KMA_API_KEY:key,VERCEL_ENV:'preview'};
 const url=origin+'/api/rain-grid?lead=0';
 const unauthorized=await handle(new Request(url),env,async()=>{throw Error('must not fetch');});
 assert.equal(unauthorized.status,401);
 const auth=await handle(new Request(origin+'/api/session'),env),cookie=auth.headers.getSetCookie()[0].split(';')[0];
 const headers={Cookie:cookie};
 const bad=await handle(new Request(origin+'/api/rain-grid?lead=6',{headers}),env);
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
 const prod=await handle(new Request(origin+'/api/rain-grid?lead=invalid',{headers}),
  {...env,VERCEL_ENV:'production'},async()=>{throw Error('invalid input must not fetch');});
 assert.equal(prod.status,400);
});
test('non-home map switch is suppressed and full-country grid is drawn on Kakao only',()=>{
 const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
 for(const id of ['navRoadMap','navSatelliteMap','navRainGridLead','navRainGridStatus','navRadarQuick'])assert.ok(ui.includes('id="'+id+'"'));
 assert.match(css,/body:not\(\[data-sunny-nav="home"\]\) \.nav-map-layer-control/);
 assert.match(css,/\.sunny-rain-grid-canvas/);
 assert.match(app,/rainGridOverlay\.setMap\(kmap\)/);
 assert.match(ui,/초단기 예보/);
 assert.doesNotMatch(ui,/id="navRadarImage"/);
});

test('KST base/valid date creation accepts Date and Number without 9-hour shift',()=>{
 const fixed=Date.parse('2026-11-06T11:50:25Z'); // 20:50:25 KST
 assert.equal(stampKst(new Date(fixed)),'202611062050');
 assert.equal(stampKst(fixed),'202611062050');
 const q=gridRequest('test-key',fixed);
 assert.equal(q.baseTime,'202611062000');
 assert.equal(q.validTime,'2026110621');
 assert.equal(q.url.searchParams.get('tmfc'),'202611062000');
 assert.equal(q.url.searchParams.get('tmef'),'2026110621');
 const hour0=rainGridRequest(0,'test-key',fixed);
 assert.equal(hour0.issuedAt,'2026-11-06T11:00:00.000Z');
 assert.equal(hour0.validTime,'2026-11-06T12:00:00.000Z');
 assert.equal(hour0.url.searchParams.get('tmef'),'2026110621');
 const hour3=rainGridRequest(3,'test-key',fixed);
 assert.equal(hour3.validTime,'2026-11-06T15:00:00.000Z');
 assert.equal(hour3.url.searchParams.get('tmef'),'2026110700');
});
test('georeferenced drawing paints only real positive rain cells in the visible map',()=>{
 const p=gridCorner(60,127),fills=[];
 let currentColor='';
 const ctx={set fillStyle(v){currentColor=v;},get fillStyle(){return currentColor;},
  beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){fills.push(currentColor);}};
 const bounds={south:p.lat-.02,north:p.lat+.02,west:p.lng-.02,east:p.lng+.02};
 const projection=q=>({x:q.lng*100,y:q.lat*100});
 assert.equal(drawRainCells(ctx,[[60,127,4]],bounds,projection),1);
 assert.deepEqual(fills,['#149ee0']);
 assert.equal(drawRainCells(ctx,[],bounds,projection),0);
 assert.equal(drawRainCells(ctx,[[60,127,0]],bounds,projection),0);
 assert.equal(drawRainCells(ctx,[[60,127,4]],bounds,()=>({x:NaN,y:5})),0);
 assert.equal(fills.length,1);
});
test('rain control is bottom-aligned and both map selector/quick action hide while panel open',()=>{
 const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(css,/\.sunny-radar-quick\{\s*position:fixed!important;top:auto!important/);
 assert.match(css,/body\.sunny-rain-grid-active \.sunny-radar-quick,[\s\S]*?\.nav-map-layer-control,[\s\S]*?display:none!important;/);
 assert.match(css,/body\.sunny-guiding:not\(\.sunny-rain-grid-active\) \.sunny-radar-quick/);
 assert.match(css,/body\.sunny-rain-grid-active\[data-sunny-nav="home"\] \.nav-map-layer-control\{\s*display:none!important/);
 assert.match(app,/setNavTab\(drivingUI\.isActive\(\)\?'navRoute'/);
 assert.match(app,/waitForSession:\(\)=>sessionPromise/);
});

test('preview forecast diagnostics genuinely checks all four leads without simulated provider rain',async()=>{
 const origin='https://rain-diagnostic.test',key='not-exported-key';
 const env={APP_ORIGIN:origin,SESSION_SECRET:'x'.repeat(64),KMA_API_KEY:key,VERCEL_ENV:'preview'};
 const urls=[];
 const response=await handle(new Request(origin+'/api/rain-grid-diagnostic'),env,async url=>{
  urls.push(new URL(url));
  return new Response(example(),{headers:{'Content-Type':'text/plain'}});
 });
 assert.equal(response.status,200);
 const json=await response.json();
 assert.equal(json.results.length,4);
 assert.deepEqual(json.results.map(x=>x.lead),[0,1,2,3]);
 assert.ok(json.results.every(x=>x.status==='received'&&x.wetCells===3&&x.zero===1));
 assert.equal(urls.length,4);
 assert.equal(new Set(urls.map(u=>u.searchParams.get('tmef'))).size,4);
 assert.ok(!JSON.stringify(json).includes(key));
 const production=await handle(new Request(origin+'/api/rain-grid-diagnostic'),
  {...env,VERCEL_ENV:'production'},async()=>{throw Error('do not call');});
 assert.equal(production.status,404);
});
