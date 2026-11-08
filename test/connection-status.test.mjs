import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 DATA_CONNECTION_SOURCES,CONNECTION_STATE_TEXT,initialConnectionResults,
 applySessionConfiguration,mapConnectionProbe,summarizeConnectionResults,
 initConnectionStatusPanel
} from '../public/connection-status.mjs';
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
const session={mapConfig:{kakao:'public-js-app-id',vworld:'public-vworld-id'},
 connections:{route:true,kma:true,roadRisk:true,safemap:true}};
const journey={
 mapSdk:{fixedPreviewAlias:{status:'received',http:200}},
 search:{status:'received',matchCount:5},
 route:{status:'received',distanceMeters:3773,durationSeconds:840,timedPoints:5},
 kma:{status:'received',validTimePresent:true,hasRainValue:true}
};
const rain={results:[0,1,2,3].map(lead=>({lead,status:'received',valid:9295,wetCells:0}))};
const radar={status:'real_radar_received',observationKst:'202611071500',radarColorPixels:1690};
const layers={
 road:{state:'provider_zip_parsed',recordCount:8000},
 roadSchema:{schemas:[{hasCoordinateColumns:true,georeferencedRows:2295}]},
 warning:{state:'text_received',http:200},
 flood:{state:'http_error',http:400}
};
function el(name='div'){
 return {
  nodeName:name,children:[],dataset:{},attributes:{},textContent:'',disabled:false,
  listeners:new Map(),append(...items){this.children.push(...items);},
  appendChild(item){this.children.push(item);return item;},
  setAttribute(k,v){this.attributes[k]=v;},
  addEventListener(name,fn){this.listeners.set(name,fn);},
  click(){this.listeners.get('click')?.();}
 };
}
function dom(){
 const nodes=new Map([
  ['settingConnectionItems',el()],['settingConnectionRefresh',el('button')],
  ['settingConnectionSummary',el('p')],['settingConnectionCheckedAt',el('p')]
 ]);
 return{document:{getElementById:id=>nodes.get(id),createElement:el},nodes};
}
test('source inventory covers all agreed menu sources but excludes CCTV and ordinary temperature',()=>{
 const ids=DATA_CONNECTION_SOURCES.map(x=>x.id);
 assert.equal(new Set(ids).size,ids.length);
 assert.ok(ids.includes('map')&&ids.includes('vworld')&&ids.includes('rain')&&ids.includes('radar'));
 assert.equal(ids.length,12);
 assert.ok(ids.includes('road')&&ids.includes('warning'));
 assert.ok(ids.includes('floodNational')&&ids.includes('floodLocal'));
 assert.ok(ids.includes('riverLevel'));
 for(const rejected of ['humidity','windDirection','temperature','cctv'])
  assert.ok(!ids.includes(rejected));
 assert.equal(CONNECTION_STATE_TEXT.partial,'부분 확인');
});
test('key presence never equals a verified provider response',()=>{
 const empty=initialConnectionResults();
 assert.equal(empty.map.state,'unknown');
 assert.equal(empty.floodLocal.state,'pending');
 const configured=applySessionConfiguration(empty,session);
 assert.equal(configured.rain.state,'configured');
 assert.equal(configured.map.state,'configured');
 assert.equal(configured.vworld.state,'configured');
 assert.equal(configured.floodNational.state,'configured');
 assert.equal(configured.riverLevel.state,'pending');
 const missing=applySessionConfiguration(empty,{mapConfig:{},connections:{}});
 assert.equal(missing.route.state,'missing');
 assert.equal(missing.vworld.state,'missing');
 assert.equal(missing.rain.state,'missing');
 assert.equal(missing.floodLocal.state,'pending');
});
test('live forecast/radar/route success never mislabels unverified road risk or flood risk as safe',()=>{
 let values=applySessionConfiguration(initialConnectionResults(),session);
 values=mapConnectionProbe('journey',journey,values);
 values=mapConnectionProbe('rain',rain,values);
 values=mapConnectionProbe('radar',radar,values);
 values=mapConnectionProbe('layers',layers,values);
 for(const id of ['map','search','route','forecast','rain','radar'])
  assert.equal(values[id].state,'ok',id);
 assert.match(values.radar.detail,/15:00 KST/);
 assert.equal(values.road.state,'partial');
 assert.match(values.road.detail,/등급\/유효시각 미검증/);
 assert.equal(values.warning.state,'partial');
 assert.match(values.warning.detail,/구역경계 미검증/);
 assert.equal(values.floodNational.state,'error');
 assert.match(values.floodNational.detail,/HTTP 400/);
 assert.equal(values.floodLocal.state,'pending');
 assert.equal(values.riverLevel.state,'pending');
 assert.equal(summarizeConnectionResults(values).counts.ok,6);
 assert.equal(values.vworld.state,'configured'); // No actual VWorld tile probe
 assert.match(summarizeConnectionResults(values).text,/키 등록 1/);
 assert.doesNotMatch(JSON.stringify(values),/모든 도로 안전|침수 없음/);
});
test('missing credential cannot be changed to success by a provider probe',()=>{
 let values=applySessionConfiguration(initialConnectionResults(),{
  mapConfig:{},connections:{}});
 values=mapConnectionProbe('journey',journey,values);
 values=mapConnectionProbe('rain',rain,values);
 values=mapConnectionProbe('layers',layers,values);
 assert.equal(values.map.state,'missing');
 assert.equal(values.rain.state,'missing');
 assert.equal(values.road.state,'missing');
});
test('environment settings include readable status panel and correctly wired source checker',()=>{
 for(const id of ['settings','settingsDataConnections','settingConnectionItems',
 'settingConnectionSummary','settingConnectionRefresh','settingConnectionCheckedAt'])
  assert.equal(ui.split('id="'+id+'"').length-1,1,id);
 assert.match(ui,/인증키 등록 ≠ 실제 수신 성공/);
 assert.match(ui,/자료 종류 12개/);
 assert.match(app,/await import\('\/connection-status\.mjs'\)/);
 assert.match(app,/connectionPanel=initConnectionStatusPanel/);
 assert.match(css,/sunny-source-row\[data-connection-state="ok"\]/);
 assert.match(css,/@media\(max-width:650px\)\{/);
});
test('settings refresh makes real diagnostic requests and maps results to honest statuses',async()=>{
 const {document,nodes}=dom(),calls=[];
 const response={
  '/api/session':session,
  '/api/preview-journey-smoke':journey,
  '/api/rain-grid-diagnostic':rain,
  '/api/radar-latest-diagnostic':radar,
  '/api/route-layer-feasibility':layers
 };
 const fetcher=async path=>{
  calls.push(path);
  return Response.json(response[path],{status:200});
 };
 const panel=initConnectionStatusPanel({
  document,fetcher,waitForSession:async()=>{},now:()=>Date.parse('2026-11-07T08:18:00.000Z')
 });
 assert.equal(panel.getStatus().map.state,'unknown');
 assert.ok(nodes.get('settingConnectionItems').children.length>11);
 assert.equal(await panel.refresh(),true);
 assert.deepEqual(calls,[
  '/api/session','/api/preview-journey-smoke','/api/rain-grid-diagnostic',
  '/api/radar-latest-diagnostic','/api/route-layer-feasibility'
 ]);
 assert.equal(panel.getStatus().rain.state,'ok');
 assert.equal(panel.getStatus().vworld.state,'configured');
 assert.equal(panel.getStatus().road.state,'partial');
 assert.equal(panel.getStatus().floodNational.state,'error');
 assert.match(nodes.get('settingConnectionSummary').textContent,/수신 성공 6/);
 assert.match(nodes.get('settingConnectionSummary').textContent,/키 등록 1/);
 assert.match(nodes.get('settingConnectionCheckedAt').textContent,/2026/);
 assert.equal(nodes.get('settingConnectionRefresh').disabled,false);
 assert.equal(panel.isChecking(),false);
});
test('rate-limit response is not treated as successful data and unmapped sources remain pending',async()=>{
 const {document}=dom(),panel=initConnectionStatusPanel({document,fetcher:async path=>{
  if(path==='/api/session')return Response.json(session);
  if(path==='/api/rain-grid-diagnostic')return Response.json({error:'too many'},{status:429});
  if(path==='/api/route-layer-feasibility')return Response.json(layers);
  if(path==='/api/radar-latest-diagnostic')return Response.json(radar);
  return Response.json(journey);
 }});
 await panel.refresh();
 assert.equal(panel.getStatus().rain.state,'unverified');
 assert.match(panel.getStatus().rain.detail,/검사 횟수 제한/);
 assert.equal(panel.getStatus().floodLocal.state,'pending');
});
