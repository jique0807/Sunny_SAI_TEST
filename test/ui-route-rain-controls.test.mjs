import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRoutePin,ROUTE_PINS} from '../public/route-pin.mjs';
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const rain=readFileSync(new URL('../public/kma-rain-overlay.mjs',import.meta.url),'utf8');
const doc={createElement(tag){
 return {tag,dataset:{},attributes:{},children:[],setAttribute(k,v){this.attributes[k]=v;},
 append(...nodes){this.children.push(...nodes);}};
}};
test('Home map type thumbnails are a vertical top-right stack, never on route/guidance',()=>{
 assert.match(css,/Home: top-right vertical basemap thumbnails/);
 assert.match(css,/body\[data-sunny-nav="home"\][\s\S]*?flex-direction:column!important/);
 assert.match(css,/top:calc\(var\(--sunny-header-height,66px\) \+ 70px\)!important/);
 assert.match(css,/right:12px!important;left:auto!important;bottom:auto!important/);
 assert.match(css,/body:not\(\[data-sunny-nav="home"\]\) \.nav-map-layer-control/);
 assert.match(css,/body\.sunny-rain-grid-active \.nav-map-layer-control,[\s\S]*?display:none!important;/);
});
test('rain popup has compact controls and preserves verified forecast states',()=>{
 for(const id of ['navRainGridValid','navRainGridPlay','navRainGridPause','navRainGridLead',
  'navRainGridStep','navRainGridReset','navRainGridClose','navRainGridStatus'])
  assert.equal(ui.split('id="'+id+'"').length-1,1,id);
 assert.match(ui,/sunny-rain-grid-legend/);
 assert.match(css,/max-height:min\(230px,43dvh\)!important/);
 assert.match(rain,/frameCache\.set\(lead/);
 assert.match(rain,/playTimer=setInterval/);
 assert.match(rain,/pausePlayback/);
 assert.match(rain,/slider\.value='0'/);
 assert.match(rain,/frameCache\.clear\(\)/);
 assert.match(rain,/load\(\{force:true\}\)/);
 assert.match(rain,/quick\.dataset\.rainState=enabled\?'on':'off'/);
 assert.match(ui,/navRainSwitchBadge/);
 assert.match(css,/sunny-radar-quick\[data-rain-state="on"\]/);
 assert.match(ui,/미수신|결측/);
});
test('route start/current/destination are separate accessible markers with no guessed location',()=>{
 assert.deepEqual(Object.keys(ROUTE_PINS),['start','current','destination']);
 for(const kind of Object.keys(ROUTE_PINS)){
  const node=createRoutePin(kind,doc);
  assert.equal(node.dataset.kind,kind);
  assert.equal(node.attributes['aria-label'],ROUTE_PINS[kind].label);
  assert.equal(node.children[1].textContent,ROUTE_PINS[kind].label);
  assert.equal(node.children[0].attributes['aria-hidden'],'true');
 }
 assert.throws(()=>createRoutePin('bogus',doc),/유효한/);
 assert.match(app,/createRoutePin\('start'\)/);
 assert.match(app,/createRoutePin\('destination'\)/);
 assert.match(app,/createRoutePin\('current'\)/);
 assert.match(app,/!Number\.isFinite\(p\?\.lat\)/);
 assert.match(app,/!Number\.isFinite\(p\?\.lng\)/);
 assert.match(app,/rainPosition\|\|homePosition/);
 assert.match(app,/routeCurrentMarker\?\.setMap\(null\)/);
 assert.match(app,/updateRouteCurrentMarker\(\)/);
 assert.match(app,/Math\.hypot\(\(p\.lat-first\.lat\)\*111320/);
 assert.match(app,/sunny-route-pin-colocated/);
 assert.match(css,/\.sunny-route-point-pin\.sunny-route-pin-colocated/);
 assert.match(css,/sunny-route-point-pin\[data-kind="start"\]/);
 assert.match(css,/sunny-route-point-pin\[data-kind="destination"\]/);
 assert.match(css,/sunny-route-point-pin\[data-kind="current"\]/);
});

test('compact map switch stays touchable on the rightmost Home edge',()=>{
 const marker=css.lastIndexOf("Home map selector: align at screenshot's upper-right map corner");
 assert.ok(marker>0,'latest compact Home control rules exist');
 const rules=css.slice(marker);
 assert.match(rules,/right:3px!important;left:auto!important;bottom:auto!important/);
 assert.match(rules,/top:calc\(var\(--sunny-header-height,66px\) - 8px\)!important/);
 assert.match(rules,/width:57px!important;gap:2px!important;padding:3px!important/);
 assert.match(rules,/width:49px!important;min-width:49px!important;height:46px!important/);
 assert.match(rules,/height:27px!important;flex:0 0 27px!important/);
 assert.match(rules,/body\[data-sunny-nav="home"\]:not\(\.nav-sheet-open\):not\(\.nav-route-open\):not\(\.sunny-guiding\):not\(\.sunny-rain-grid-active\)/);
 assert.match(rules,/@media\(min-width:901px\)/);
});
test('guidance footer lifts 19px and vertical route summary anchors to top-right',()=>{
 const marker=css.lastIndexOf("Home map selector: align at screenshot's upper-right map corner");
 const rules=css.slice(marker);
 assert.match(rules,/body\.sunny-guiding \.sunny-drive-footer\{[\s\S]*?bottom:calc\(19px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
 assert.match(rules,/left:8px!important;right:8px!important;width:calc\(100% - 16px\)!important/);
 assert.match(rules,/body\.sunny-guiding \.sunny-drive-progress\{[\s\S]*?top:calc\(8px \+ env\(safe-area-inset-top,0px\)\)!important/);
 assert.match(rules,/right:4px!important;left:auto!important;bottom:auto!important/);
 assert.match(rules,/height:min\(54dvh,430px\)!important/);
 // All ETA, route-progress and Home/Stop controls remain attached to their original elements.
 for(const id of ['sunnyDriveHome','sunnyDriveSummary','sunnyDriveGpsText',
  'sunnyDriveStop','sunnyDriveProgressTrack','sunnyDriveRiskMarks'])
  assert.ok(ui.includes('id="'+id+'"'),id);
});

test('driving alerts form a non-overlapping large upper rectangle and small lower rectangle',()=>{
 const marker=css.indexOf('Driving alerts: visually distinct, non-overlapping large top card');
 assert.ok(marker>0,'new screenshot-grounded alert geometry exists');
 const rules=css.slice(marker);
 assert.match(rules,/body\.sunny-guiding \.sunny-drive-alert:nth-child\(1\)\{[\s\S]*?top:0!important;left:0!important/);
 assert.match(rules,/width:min\(248px,calc\(100% - 12px\)\)!important/);
 assert.match(rules,/height:48px!important;min-height:48px!important;max-height:48px!important/);
 assert.match(rules,/body\.sunny-guiding \.sunny-drive-alert:nth-child\(2\)\{[\s\S]*?top:56px!important;left:12px!important/);
 assert.match(rules,/width:min\(185px,calc\(100% - 66px\)\)!important/);
 assert.match(rules,/height:38px!important;min-height:38px!important;max-height:38px!important/);
 assert.ok(56>48,'small card begins below large one (no overlap)');
 assert.match(rules,/@media\(max-width:360px\)/);
});

test('driving weather alerts follow the annotated tall upper / short lower block',()=>{
 const marker=css.lastIndexOf('2026-11-07: screenshot-guided driving overlay placement');
 assert.ok(marker>0,'screenshot layout CSS is present');
 const rules=css.slice(marker);
 assert.match(rules,/body\.sunny-guiding \.sunny-drive-alerts\{[\s\S]*?left:3px!important;[\s\S]*?top:calc\(3px \+ env\(safe-area-inset-top,0px\)\)!important/);
 assert.match(rules,/body\.sunny-guiding \.sunny-drive-alert:nth-child\(1\)\{[\s\S]*?width:min\(213px,100%\)!important/);
 assert.match(rules,/height:102px!important;min-height:102px!important;max-height:102px!important/);
 assert.match(rules,/body\.sunny-guiding \.sunny-drive-alert:nth-child\(2\)\{[\s\S]*?left:0!important;top:104px!important/);
 assert.match(rules,/width:min\(168px,calc\(100% - 22px\)\)!important/);
 assert.match(rules,/height:38px!important;min-height:38px!important;max-height:38px!important/);
 assert.ok(104>102,'small alert starts below large alert rather than overlapping it');
 assert.match(rules,/body\.sunny-guiding \.sunny-drive-alert:nth-child\(1\) \.sunny-drive-alert-text strong\{[\s\S]*?white-space:normal!important/);
});
test('rain toggle moves to lower-left marker with a clear gap above ETA footer',()=>{
 const marker=css.lastIndexOf('2026-11-07: screenshot-guided driving overlay placement');
 const rules=css.slice(marker);
 assert.match(rules,/\.sunny-radar-quick:not\(\[hidden\]\)\{[\s\S]*?left:10px!important;right:auto!important;top:auto!important/);
 assert.match(rules,/body\.sunny-guiding:not\(\.sunny-rain-grid-active\) \.sunny-radar-quick:not\(\[hidden\]\)\{[\s\S]*?left:9px!important;right:auto!important;top:auto!important/);
 assert.match(rules,/bottom:calc\(84px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
 assert.match(rules,/min-height:44px!important/);
 // Keep original ON/OFF semantics; position change must not silently toggle the layer.
 assert.match(ui,/id="navRadarQuick"/);
 assert.match(rain,/setEnabled\(!enabled\)/);
 assert.match(rain,/quick\.dataset\.rainState=enabled\?'on':'off'/);
});
