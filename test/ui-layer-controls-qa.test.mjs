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
 assert.doesNotMatch(rain,/id="navRainGridRefresh"[^>]*\bhidden\b/);
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
 assert.match(src,/loadHSRFrame\(frame,\{signal:controller.signal,waitForSession\}\)/);
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
 assert.equal(menu.match(/type="checkbox"/g)?.length,8);
 for(const group of ['도로 살얼음·안개','기상특보','침수위험']){
  const row=menu.split('<label class="nav-layer-row">').find(row=>row.startsWith('<span><b>'+group+'</b>'));
  assert.match(row??'', /준비 중<\/small><\/span><input type="checkbox" disabled/);
 }
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
 }finally{
  overlay?.disable();
  for(const [k,v] of Object.entries(original)){
   if(v===undefined)delete globalThis[k];
   else globalThis[k]=v;
  }
 }
});
