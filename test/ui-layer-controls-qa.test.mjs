import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initNationalRainOverlay} from '../public/kma-rain-overlay.mjs';
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const mapSource=readFileSync(new URL('../public/kma-map-overlay.mjs',import.meta.url),'utf8');
const ids=['navLayersClose','navRainGridRefresh','navRainGridReset','navRainGridClose',
 'navWeatherTimeClose','navKmaRefresh','navSearchClose','navRouteResultClose'];
test('all panel close/reload/reset buttons appear exactly once and are accessible',()=>{
 for(const id of ids)assert.equal(ui.split('id="'+id+'"').length-1,1,id);
 const rain=ui.match(/<div class="sunny-rain-grid-head-actions"[^>]*>([\s\S]*?)<\/div>/)?.[1]||'';
 assert.ok(rain.indexOf('id="navRainGridRefresh"')<rain.indexOf('id="navRainGridReset"'));
 assert.ok(rain.indexOf('id="navRainGridReset"')<rain.indexOf('id="navRainGridClose"'));
 assert.match(rain,/id="navRainGridRefresh"[^>]*aria-label="[^"]*다시 조회"/);
 assert.match(rain,/id="navRainGridRefresh"[^>]*\bhidden\b/);
 assert.match(ui,/id="navRainGridClose"[^>]*aria-label="[^"]*닫기"/);
 assert.match(ui,/id="navLayersClose"[^>]*aria-label="[^"]*닫기"/);
 assert.match(ui,/id="navWeatherTimeClose"[^>]*aria-label="[^"]*닫기"/);
 assert.match(app,/getElementById\('navLayersClose'\)\?\.addEventListener\('click',closeNavLayers\)/);
 assert.match(mapSource,/close\?\.addEventListener\('click'/);
});
test('rain canvas controls are wired to existing real API logic',()=>{
 const src=readFileSync(new URL('../public/kma-rain-overlay.mjs',import.meta.url),'utf8');
 assert.match(src,/close\?\.addEventListener\('click',\(\)=>setEnabled\(false\)\)/);
 assert.match(src,/reset\?\.addEventListener\('click'/);
 assert.match(src,/refresh\?\.addEventListener\('click'/);
 assert.match(src,/frameCache\.clear\(\);clearHSRCache\(\);void load\(\{force:true\}\)/);
 assert.match(src,/\/api\/rain-grid\?lead=/);
 assert.match(src,/loadHSRFrame\(frame,\{signal:controller.signal,waitForSession,mode:routeRadar\?'nearest':'latest'\}\)/);
 assert.match(src,/\},600000\)/);
});
test('compact touch targets and icon alignment survive narrow displays',()=>{
 assert.match(css,/Sunny SAI 2026-11-07 UI QA: aligned close, reload, reset/);
 for(const selector of ['.nav-layers-sheet .nav-layers-close',
  '.sunny-rain-grid-head-actions button','#navWeatherTimeClose',
  '#navSearchClose,#navRouteResultClose'])
  assert.ok(css.includes(selector),selector);
 assert.match(css,/min-width:40px!important;min-height:40px!important/);
 assert.match(css,/\.sunny-rain-grid-head-actions button\{[\s\S]*?height:40px!important/);
 assert.match(css,/\.nav-layer-row\[hidden\]\{display:none!important\}/);
 assert.match(css,/@media\(max-width:650px\)\{[\s\S]*?max-height:min\(355px,60dvh\)!important/);
});
test('main layer menu omits generic temperature/wind and does not fake hazard availability',()=>{
 const menu=ui.slice(ui.indexOf('id="navLayersSheet"'),ui.indexOf('id="navRainGridTimeBar"'));
 assert.ok(menu.length>1000);
 assert.doesNotMatch(menu,/id="navNowcastRow"|온도|풍속/);
 assert.match(menu,/id="navLayerWeather" type="checkbox" checked/);
 assert.equal(menu.match(/type="checkbox"/g)?.length,18);
 assert.match(menu,/위성 영상/);
 assert.match(menu,/navGk2aRr/);
 assert.match(menu,/navGk2aCi/);
 assert.match(menu,/navGk2aFog/);
 assert.match(menu,/id="navLayerStatusRefresh"/);
 assert.match(menu,/id="navLayerStatusCheckedAt"/);
  // Three historical TAAS REST layers become available only after the keys are configured.
  for(const id of ['navLayerPedestrianWms','navLayerChildWms','navLayerElderlyWms'])
   assert.ok(menu.includes('id="'+id+'" type="checkbox" disabled'),id);
  for(const id of ['navLayerTrafficIncidents','navLayerPedestrianHotspots'])
   assert.ok(menu.includes('id="'+id+'" type="checkbox" disabled'),id);
  assert.ok(menu.includes('id="navLayerWalkFacilities" type="checkbox"'));
 for(const id of ['navLayerroad','navLayerfog','navLayerflood']){
  assert.ok(menu.includes('id="'+id+'" type="checkbox" disabled'));
 }
 assert.doesNotMatch(menu,/미구현/);
 assert.match(menu,/id="navLayerWarning" type="checkbox"/);
});
test('display menu keeps all seventeen toggles, no decorative emojis or TAAS in item names',()=>{
 const menu=ui.slice(ui.indexOf('id="navLayersSheet"'),ui.indexOf('id="navRainGridTimeBar"'));
 const rows=[...menu.matchAll(/<label class="nav-layer-row[^"]*"[^>]*><span><b>([^<]+)<\/b><small[^>]*>([^<]+)<\/small><\/span><input\s+id="([^"]+)"/g)];
 assert.equal(rows.length,17);
 assert.ok(rows.every(x=>x[2].trim().length>0),'each menu item has a short status line');
 assert.ok(rows.every(x=>!/\p{Extended_Pictographic}/u.test(x[1])),'menu titles must not include emoji');
 const walking=menu.slice(menu.indexOf('>교통·보행 정보<'));
 const names=[...walking.matchAll(/<b>([^<]+)<\/b><small/g)].map(x=>x[1]);
 assert.ok(names.length>=5);
 for(const name of names)assert.doesNotMatch(name,/TAAS|REST/);
 assert.doesNotMatch(menu,/sunny-optional-layer-note/);
 assert.match(css,/\.nav-layers-sheet \.nav-layer-row \.nav-layer-reception:not\(:empty\)\{display:inline-block\}/);
});
test('rain panel close and reload trigger the same state machine in simple DOM',async()=>{
 const original={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch};
 const elements=new Map(),classSet=new Set();
 const node=id=>{if(!elements.has(id)){
  const listeners=new Map();
  elements.set(id,{
   id,value:id==='navDemoOpacity'?'45':'0',checked:false,hidden:false,
   disabled:false,style:{},dataset:{},attributes:{},textContent:'',innerHTML:'',
   setAttribute(name,value){this.attributes[name]=value;},
   addEventListener(type,handler){listeners.set(type,handler);},
   dispatch(type){listeners.get(type)?.({type});}
  });
 }return elements.get(id);};
 const body={classList:{
  toggle(name,condition){if(condition)classSet.add(name);else classSet.delete(name);}
 }};
 const calls=[];
 globalThis.document={
  getElementById:node,body,hidden:false,addEventListener(){}
 };
 globalThis.window={addEventListener(){}};
 globalThis.fetch=async url=>{
  calls.push(url);
  return Response.json({provider:'kma',nx:149,ny:253,cells:[],valid:9295,
   missing:28402,issuedAt:'2026-11-07T03:10:00.000Z',
   validTime:'2026-11-07T04:00:00.000Z'});
 };
 const flush=()=>new Promise(resolve=>setTimeout(resolve,10));
 let overlay;
 try{
  overlay=initNationalRainOverlay({waitForSession:async()=>{}});
  assert.equal(node('navRainGridTimeBar').hidden,true);
  node('navRadarQuick').dispatch('click');
  await flush();
  assert.equal(classSet.has('sunny-rain-grid-active'),true);
  assert.equal(node('navRainGridTimeBar').hidden,false);
  assert.equal(calls.length,1);
  assert.equal(node('navRainGridPlay').disabled,false);
  node('navRainGridPlay').dispatch('click');
  assert.equal(node('navRainGridPause').disabled,false);
  node('navRainGridPause').dispatch('click');
  assert.equal(node('navRainGridPlay').disabled,false);
  assert.match(calls[0],/\/api\/rain-grid\?lead=0/);
  node('navRainGridRefresh').dispatch('click');
  await flush();
  assert.equal(calls.length,2);
  assert.equal(node('navRainGridStep').textContent,'13:00');
  assert.match(node('navRainGridTicks').innerHTML,/13:00.*14:00.*15:00.*16:00/);
  assert.equal(node('navRainGridStatus').dataset.receiveState,'received');
  node('navRainGridMinimize').dispatch('click');
  assert.equal(classSet.has('sunny-rain-grid-active'),true);
  assert.equal(node('navRainGridTimeBar').hidden,true);
  assert.equal(node('navRainSwitchBadge').textContent,'ON');
  node('navRadarQuick').dispatch('click');
  assert.equal(node('navRainGridTimeBar').hidden,false);
  assert.equal(calls.length,2);
  globalThis.fetch=async()=>Response.json({error:'일시적 오류'},{status:502});
  node('navRainGridRefresh').dispatch('click');
  assert.equal(node('navRainGridStatus').dataset.receiveState,'loading');
  await flush();
  assert.equal(node('navRainGridStatus').dataset.receiveState,'failed');
  node('navRainGridClose').dispatch('click');
  assert.equal(classSet.has('sunny-rain-grid-active'),false);
  assert.equal(node('navRainGridTimeBar').hidden,true);
  assert.equal(node('navRainSwitchBadge').textContent,'OFF');
  globalThis.fetch=async url=>{
   calls.push(url);
   return Response.json({error:'미수신'},{status:502});
  };
  node('navRouteRadar').dispatch('click');
  assert.equal(node('navRouteRadar').attributes['aria-pressed'],'true');
  assert.equal(node('navRainGridTimeBar').hidden,true);
  await flush();
  assert.equal(calls.at(-1),'/api/radar-overlay-frame?mode=nearest&frame=0');
  assert.equal(calls.length,3);
  assert.equal(node('navRouteRadar').attributes['aria-pressed'],'false');
  node('navRouteRadar').dispatch('click');
  overlay.disableRouteRadar();
  assert.equal(node('sunnyDriveRadar').attributes['aria-pressed'],'false');
  await flush();
  node('sunnyDriveRadar').dispatch('click');
  assert.equal(node('sunnyDriveRadar').attributes['aria-pressed'],'true');
  assert.equal(node('navRainGridTimeBar').hidden,true);
  await flush();
  assert.equal(calls.at(-1),'/api/radar-overlay-frame?mode=nearest&frame=0');
  assert.equal(calls.length,4);
  assert.equal(node('sunnyDriveRadar').attributes['aria-pressed'],'false');
 }finally{
  overlay?.disable();
  for(const [k,v] of Object.entries(original)){
   if(v===undefined)delete globalThis[k];
   else globalThis[k]=v;
  }
 }
});

test('mobile layer sheet uses a single scroll region and does not hide TAAS after ITS',()=>{
 const sheetStart=ui.indexOf('id="navLayersSheet"');
 const sheetEnd=ui.indexOf('id="navRainGridTimeBar"',sheetStart);
 const sheet=ui.slice(sheetStart,sheetEnd);
 assert.ok(sheetStart>=0&&sheetEnd>sheetStart);
 assert.match(sheet,/nav-layers-scroll-guide/);
 assert.match(sheet,/아래로 스크롤/);
 const incident=sheet.indexOf('id="navLayerTrafficIncidents"');
 const walk=sheet.indexOf('교통·보행 정보');
 assert.ok(incident>=0&&walk>incident,'walking category must remain below ITS');
 for(const id of ['navLayerWalkFacilities','navLayerPedestrianWms','navLayerChildWms','navLayerElderlyWms','navLayerPedestrianHotspots']){
  assert.ok(sheet.indexOf('id="'+id+'"')>walk,id+' must exist in walking category');
 }
 const latest=css.lastIndexOf('.nav-layers-sheet .nav-layer-list{');
 assert.ok(latest>0,'mobile override is missing');
 const lastRule=css.slice(latest,css.indexOf('}',latest)+1);
 assert.match(lastRule,/max-height:none!important/);
 assert.match(lastRule,/overflow:visible!important/);
 assert.match(css.slice(latest-700,latest),/overflow-y:auto!important/);
 assert.match(css,/one continuous scroll surface/);
});

test('layer header distinguishes status refresh from settings reset without changing click handlers',()=>{
 const menu=ui.slice(ui.indexOf('id="navLayersSheet"'),ui.indexOf('id="navRainGridTimeBar"'));
 const refreshIndex=menu.indexOf('id="navLayerStatusRefresh"');
 const resetIndex=menu.indexOf('id="navLayersReset"');
 const minimizeIndex=menu.indexOf('id="navLayersMinimize"');
 assert.ok(refreshIndex>=0&&resetIndex>refreshIndex&&minimizeIndex>resetIndex);
 const refresh=menu.slice(refreshIndex,resetIndex),reset=menu.slice(resetIndex,minimizeIndex);
 assert.ok(refresh.includes('aria-label="표출 API 및 자료 수신 상태 확인"'));
 assert.ok(refresh.includes('M3 12a9 9'));
 assert.ok(reset.includes('aria-label="표출 설정 초기화"'));
 assert.ok(reset.includes('title="표출 설정 초기화"'));
 assert.ok(reset.includes('<circle cx="15" cy="7" r="2"/>'));
 assert.ok(reset.includes('<circle cx="9" cy="17" r="2"/>'));
 assert.ok(!reset.includes('M3 11a9 9'));
 assert.ok(app.includes("getElementById('navLayersReset')?.addEventListener('click',()=>{"));
 assert.ok(app.includes("disableMapLayers();"));
 assert.ok(app.includes("$('navLayerStatusRefresh')?.addEventListener('click',async()=>{"));
});
