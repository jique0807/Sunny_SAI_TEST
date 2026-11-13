import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const overlay=readFileSync(new URL('../public/kma-rain-overlay.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');

test('One Kakao overlay popup contains the HSR and RN1 6-hour tabs',()=>{
 for(const id of ['navRainGridTimeBar','navOpenHsr','navForecastImageToggle',
   'navRainGridLead','navRainGridPlay','navRainGridPause','navHsrStop',
   'navRainGridRefresh','navRainOverlayOpacity','navRainMapStatus']){
  assert.ok(ui.includes('id="'+id+'"'),id+' missing');
 }
 assert.match(ui,/HSR 레이더 실황 <small>10분 간격 · 과거 1시간/);
 assert.match(ui,/id="navForecastImageToggle"[^>]*>초단기 강수예측<\/button>/);
 assert.match(css,/Rain popup restoration/);
});

test('Tabs activate their respective source without disabling the active overlay',()=>{
 assert.match(overlay,/radarMode\?\.addEventListener\('click',\(\)=>selectRainSource\('radar'\)\)/);
 assert.match(overlay,/imageToggle\?\.addEventListener\('click',\(\)=>selectRainSource\('grid'\)\)/);
 assert.match(overlay,/if\(!enabled\)\{setEnabled\(true\);return;\}/);
 assert.match(overlay,/playTimer=setInterval/);
 assert.match(overlay,/const updateMapStatus=/);
});

test('HSR and RN1 are both drawn over the same Kakao map coordinate projection',()=>{
 assert.match(overlay,/drawHSROverKakao\(ctx,radarFrame,projection,density\)/);
 assert.match(overlay,/drawRainCells\(ctx,forecast\.cells/);
 assert.match(overlay,/projection\.containerPointFromCoords\(new kakao\.maps\.LatLng/);
 assert.match(overlay,/pointer-events:none|node\.className='sunny-rain-grid-canvas'/);
 assert.match(overlay,/data\.valid\+data\.missing!==37697/);
 assert.match(overlay,/\'\/api\/rain-grid\?lead=\'/);
});

test('compact rain popup keeps only minimize and close visible, without removed explanatory labels',()=>{
 const head=ui.match(/<div class="sunny-rain-grid-head-actions"[^>]*>([\s\S]*?)<\/div>/)?.[1]||'';
 for(const id of ['navRainGridRefresh','navRainGridReset'])
  assert.match(head,new RegExp('id="'+id+'"[^>]*\\bhidden\\b'));
 for(const id of ['navRainGridMinimize','navRainGridClose']){
  assert.match(head,new RegExp('id="'+id+'"'));
  assert.doesNotMatch(head,new RegExp('id="'+id+'"[^>]*\\bhidden\\b'));
 }
 assert.match(css,/#navRainGridTimeBar #navRainGridRefresh,[\s\S]*?#navRainGridTimeBar #navRainGridReset,[\s\S]*?display:none!important/);
 assert.doesNotMatch(ui,/전국 5km 격자 · 1시간 간격 · 최대 6시간/);
 assert.doesNotMatch(ui,/id="navForecastImageToggle"[^>]*<small>/);
 assert.match(ui,/id="navRainGridDisclaimer"[^>]*hidden/);
 assert.match(overlay,/legend\.hidden=radar/);
 assert.match(overlay,/disclaimer\.hidden=!radar/);
 assert.doesNotMatch(overlay,/10분 간격 선택|영상 색상은 강수량으로 환산하지 않음|실제 5km 예보 · 결측은 무강수가 아닙니다/);
 assert.match(overlay,/HSR 실제 레이더 관측 · 최신 자료는 약 30분 지연 조회/);
});
