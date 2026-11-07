import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHSRFrameHeaders,loadHSRFrame,drawHSROverKakao,radarKstLabel,HSR_MAX_FRAME}
 from '../public/kma-hsr-overlay.mjs';
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const overlay=readFileSync(new URL('../public/kma-rain-overlay.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
const geo={left:-385012.875,top:4821054,right:585174.375,bottom:3799270.5};
function makeHeaders(frame=0,obs='202611071140'){
 return new Headers({
  'x-radar-obs-kst':obs,
  'x-radar-interval-minutes':'10',
  'x-radar-projection':'LCC',
  'x-radar-frame':String(frame),
  'x-radar-coverage':Object.values(geo).join(',')
 });
}
test('HSR observation response must contain matching real 10-minute time, LCC bounds and frame',()=>{
 const d=parseHSRFrameHeaders(makeHeaders(2),2);
 assert.equal(d.timeKst,'202611071140');
 assert.equal(d.frame,2);
 assert.deepEqual(d.coverage,geo);
 assert.equal(radarKstLabel(d.timeKst),'2026.11.07 11:40 KST');
 assert.equal(HSR_MAX_FRAME,6);
 for(const i of [-1,7,1.2])assert.throws(()=>parseHSRFrameHeaders(makeHeaders(),i),/범위/);
 assert.throws(()=>parseHSRFrameHeaders(makeHeaders(0),1),/검증 실패/);
 const m=makeHeaders();m.set('x-radar-interval-minutes','30');
 assert.throws(()=>parseHSRFrameHeaders(m,0),/검증 실패/);
 const bad=makeHeaders();bad.set('x-radar-coverage','0,0,0,0');
 assert.throws(()=>parseHSRFrameHeaders(bad,0),/범위 오류/);
});
test('real HSR PNG loader never guesses data and includes no API credentials',async()=>{
 const calls=[],revokes=[];
 class MockImage{
  naturalWidth=457;naturalHeight=483;
  set src(url){this.srcUrl=url;queueMicrotask(()=>this.onload?.());}
 }
 const payload=new Blob([new Uint8Array(50)],{type:'image/png'});
 const frame=await loadHSRFrame(1,{
  waitForSession:async()=>calls.push('session'),
  fetcher:async(u,options)=>{
   calls.push({url:u,options});
   return new Response(payload,{status:200,headers:makeHeaders(1)});
  },
  ImageCtor:MockImage,
  makeObjectURL:blob=>{
   assert.equal(blob.type,'image/png');return 'blob:test-actual-radar';},
  revokeObjectURL:url=>revokes.push(url)
 });
 assert.equal(calls[0],'session');
 assert.equal(calls[1].url,'/api/radar-overlay-frame?mode=latest&frame=1');
 assert.equal(calls[1].options.credentials,'same-origin');
 assert.equal(frame.timeKst,'202611071140');
 assert.equal(frame.url,'blob:test-actual-radar');
 assert.deepEqual(frame.coverage,geo);
 assert.deepEqual(revokes,[]);
 const notFound=await assert.rejects(()=>loadHSRFrame(0,{
  fetcher:async()=>new Response(JSON.stringify({error:'Observation not found'}),{
   status:502,headers:{'content-type':'application/json'}}),
  ImageCtor:MockImage
 }),/Observation not found/);
 void notFound;
});
test('shared HSR mesh draws true source image exclusively over Kakao with WGS84 projection',()=>{
 const calls=[],ctx={save(){},restore(){},setTransform(){},beginPath(){},moveTo(){},
  lineTo(){},closePath(){},clip(){},transform(){},drawImage(){calls.push('png');}};
 const original=globalThis.kakao;
 try{
  globalThis.kakao={maps:{LatLng:class{constructor(lat,lng){this.lat=lat;this.lng=lng;}}}};
  const projection={containerPointFromCoords:p=>({x:p.lng*20,y:p.lat*20})};
  const triangles=drawHSROverKakao(ctx,{image:{width:457,height:483},coverage:geo},projection,1);
  assert.equal(triangles,144);assert.equal(calls.length,288);
  assert.equal(drawHSROverKakao(ctx,null,projection),0);
 }finally{
  if(original===undefined)delete globalThis.kakao;else globalThis.kakao=original;
 }
});
test('forecast popup has a single source and radar remains selectable in the layer menu',()=>{
 for(const id of ['navRainGridMinimize','navRainSourceTitle',
  'navRainGridLead','navRainGridTicks','navRainLegendTitle','navRainGridDisclaimer'])
  assert.equal(ui.split('id="'+id+'"').length-1,1,id);
 assert.match(ui,/초단기 예보/);
 assert.match(ui,/레이더 실황 HSR/);
 assert.match(overlay,/source='forecast'/);
 assert.match(overlay,/setSource\('forecast'\)/);
 assert.match(overlay,/\[nationalRadar,'radar'\]/);
 assert.match(overlay,/loadHSRFrame\(frame,\{signal:controller.signal,waitForSession\}\)/);
 assert.match(overlay,/drawHSROverKakao\(ctx,radarFrame,projection,density\)/);
 assert.match(overlay,/실제 레이더 관측/);
 assert.match(overlay,/강수량\(mm\) 자료 아님/);
 assert.match(overlay,/\},600000\)/);
 assert.match(overlay,/clearHSRCache\(\)/);
 assert.match(overlay,/\/api\/rain-grid\?lead=/);
 assert.match(overlay,/frameCache\.set\(lead/);
 assert.doesNotMatch(ui,/id="navRainDataMode"/);
});
