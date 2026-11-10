import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initNationalRainOverlay} from '../public/kma-rain-overlay.mjs';

const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const overlaySource=readFileSync(new URL('../public/kma-rain-overlay.mjs',import.meta.url),'utf8');
const apiSource=readFileSync(new URL('../lib/api.mjs',import.meta.url),'utf8');

test('old 10-minute graphic is replaced by real KMA 2.2 numeric forecast in one Kakao canvas',()=>{
 assert.match(ui,/id="navForecastImageToggle"[^>]*>초단기 강수예보/);
 assert.doesNotMatch(ui,/id="navForecastControls"|id="navForecastImageView"|id="navForecastImageLead"/);
 assert.match(ui,/id="navRainGridLead"[^>]*max="5"[^>]*step="1"/);
 assert.match(ui,/1시간 간격 · 최대 6시간/);
  assert.match(ui,/HSR 레이더 실황 <small>10분 간격/);
 assert.match(overlaySource,/source='grid'/);
 assert.match(overlaySource,/drawRainCells\(ctx,forecast\.cells/);
 assert.match(overlaySource,/\/api\/rain-grid\?lead=/);
 assert.doesNotMatch(overlaySource,/\/api\/radar-frame\?/);
 assert.doesNotMatch(overlaySource,/loadForecastImage|imageLead\.value|10분 구간별 미래 예측/);
 assert.match(overlaySource,/imageToggle\?\.addEventListener\('click'/);
 assert.match(apiSource,/nationalRainGrid\(Number\(params\.get\('lead'\)\)/);
});

test('the same UI button queries 5km KMA RN1 leads 0 and 1 and never fetches provider map images',async()=>{
 const prior={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch};
 const elements=new Map(),listeners=new Map(),calls=[];
 const element=id=>{
  if(!elements.has(id)){
   const handlers=new Map();
   elements.set(id,{id,checked:false,disabled:false,hidden:true,
    value:id==='navDemoOpacity'?'45':'0',style:{},dataset:{},attributes:{},textContent:'',innerHTML:'',
    setAttribute(k,v){this.attributes[k]=v;},
    getAttribute(k){return this.attributes[k];},
    addEventListener(k,fn){handlers.set(k,fn);},
    dispatch(k){return handlers.get(k)?.({type:k});},
    classList:{toggle(){},add(){},remove(){}},
    parentElement:{hidden:false}});
  }
  return elements.get(id);
 };
 const body={classList:{toggle(){}}};
 const valid='2026-11-10T06:00:00.000Z';
 globalThis.document={getElementById:element,body,hidden:false,addEventListener(){}};
 globalThis.window={addEventListener(){},devicePixelRatio:1};
 globalThis.fetch=async url=>{
  calls.push(url);
  const lead=Number(new URL('https://example.invalid'+url).searchParams.get('lead'));
  return Response.json({provider:'kma',nx:149,ny:253,cells:[],valid:9295,missing:28402,zero:9295,
   issuedAt:'2026-11-10T04:50:00.000Z',validTime:new Date(Date.parse(valid)+lead*3600000).toISOString(),maxLead:5});
 };
 const wait=()=>new Promise(resolve=>setTimeout(resolve,15));
 let overlay;
 try{
  overlay=initNationalRainOverlay({waitForSession:async()=>{}});
  element('navForecastImageToggle').dispatch('click');
  await wait();
  assert.equal(element('navForecastImageToggle').attributes['aria-pressed'],'true');
  assert.equal(element('navRainGridTimeBar').hidden,false);
  assert.deepEqual(calls,['/api/rain-grid?lead=0']);
  assert.equal(element('navRainGridLead').max,'5');
  assert.equal(element('navRainSourceTitle').textContent,'초단기 강수예보');
  assert.match(element('navRainGridTicks').innerHTML,/15:00.*16:00/);
  element('navRainGridLead').value='1';
  element('navRainGridLead').dispatch('change');
  await wait();
  assert.deepEqual(calls,['/api/rain-grid?lead=0','/api/rain-grid?lead=1']);
  // Re-selecting a tab does not turn off either real Kakao precipitation layer.
  element('navForecastImageToggle').dispatch('click');
  assert.equal(element('navRainGridTimeBar').hidden,false);
  assert.equal(element('navForecastImageToggle').attributes['aria-pressed'],'true');
  assert.equal(calls.length,2);
 }finally{
  overlay?.disable();
  for(const [k,v]of Object.entries(prior)){
   if(v===undefined)delete globalThis[k];else globalThis[k]=v;
  }
 }
});
