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
 assert.match(ui,/초단기 강수예측 <small>1시간 간격 · 최대 6시간/);
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
