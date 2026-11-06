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
 assert.match(css,/sunny-route-point-pin\[data-kind="start"\]/);
 assert.match(css,/sunny-route-point-pin\[data-kind="destination"\]/);
 assert.match(css,/sunny-route-point-pin\[data-kind="current"\]/);
});
