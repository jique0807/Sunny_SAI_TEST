import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
test('first paint is Kakao placeholder, not schematic or an unverified alternative map',()=>{
 assert.match(ui,/id="schematic" class="schematic" hidden/);
 assert.match(ui,/id="kakaoMap" class="real-map"><\/div>/);
 assert.match(ui,/id="mapNotice"[^>]*>카카오맵을 불러오는 중입니다/);
 assert.match(app,/Promise\.resolve\(sessionPromise\)\.then\(async\(\)=>\{await showMap\('kakao'\)/);
 assert.doesNotMatch(app,/showMap\(mapConfig\.kakao\?'kakao':'osm'\)\)\.catch/);
 assert.doesNotMatch(app,/await showMap\('schematic'\);await Promise\.all/);
});
test('only Home exposes provider picker on route and layer screens',()=>{
 for(const section of ['route','layers']){
  assert.ok(css.includes('body[data-sunny-nav="'+section+'"] .nav-map-layer-control'));
  assert.ok(css.includes('body[data-sunny-nav="'+section+'"] .map-switch'));
 }
 assert.match(app,/if\(document\.body\.dataset\.sunnyNav!=='home'&&type!=='kakao'\)type='kakao'/);
 const start=app.indexOf('function setNavTab(id)'),end=app.indexOf('\n// Only the Home screen',start);
 assert.ok(start>0&&end>start);
 const controls=new Map(),document={body:{dataset:{}},getElementById(id){
  if(!controls.has(id))controls.set(id,{setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];}});
  return controls.get(id);
 }};
 const ctx=vm.createContext({document});
 vm.runInContext(app.slice(start,end),ctx);
 vm.runInContext("setNavTab('navRoute')",ctx);
 assert.equal(document.body.dataset.sunnyNav,'route');
 vm.runInContext("setNavTab('navLayers')",ctx);
 assert.equal(document.body.dataset.sunnyNav,'layers');
 vm.runInContext("setNavTab('navHome')",ctx);
 assert.equal(document.body.dataset.sunnyNav,'home');
});
test('Kakao initialization does not accidentally enter the VWorld branch',async()=>{
 const start=app.indexOf('async function showMap(type,');
 const end=app.indexOf("\n['schematic','kakao','vworld','skyview'].forEach",start);
 assert.ok(start>0&&end>start);
 const elements=new Map(),events=[];
 const $=id=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',setAttribute(){},toggleAttribute(){}});return elements.get(id);};
 const kakao={maps:{MapTypeId:{ROADMAP:'road',HYBRID:'hybrid'},LatLng:class {}}};
 const kmap={relayout(){events.push('kakao.relayout');},setMapTypeId(type){events.push('kakao.'+type);}};
 const providerState={},calls=[];
 const context=vm.createContext({
  document:{body:{dataset:{sunnyNav:'home'}}},window:{kakao},kakao,$,
  activeMap:'schematic',kmap,lmap:null,osmMap:null,mapRun:0,
  mapSwitchViewport:null,captureMapViewport:()=>null,sessionPromise:Promise.resolve(),
  mapConfig:{kakao:'stub-key'},route:null,homePosition:null,
  clearDemoOverlays(){},clearFocus(){},updateMobileMapLayer(){},
  routePolyline:null,kmarker:null,kend:null,routeCurrentMarker:null,
  providerState,connectionStatus(){},focusRoad(){},drawWeatherOverlays(){},
  drawDemoOverlays(){},moveCar(){},drawGps(){},updateFlood(){},
  drivingUI:{isActive(){return false;}},followDrivingGps(){},
  roadWeatherOverlay:{setMap(){}},kmaMapOverlay:{schedule(){}},rainGridOverlay:{setMap(){},redraw(){}},gk2aOverlay:{setMap(){},redraw(){}},roadRiskOverlay:{repaint(){}},warningOverlay:{repaint(){}},
  notice:t=>calls.push(t),toast:t=>calls.push('toast:'+t),
  kakaoConnectError:t=>calls.push('error:'+t),
  showOpenStreetMap:()=>{throw Error('No alternate map should initialize');},
  Error,Promise
 });
 vm.runInContext(app.slice(start,end),context);
 await vm.runInContext("showMap('kakao')",context);
 assert.deepEqual(events,['kakao.relayout','kakao.road']);
 assert.equal(providerState.kakao,'SDK 초기화 확인');
 assert.equal(elements.get('kakaoMap').hidden,false);
 assert.equal(elements.get('vworldMap').hidden,true);
 assert.ok(!calls.some(x=>x.includes('브이월드')||x.startsWith('error:')||x.startsWith('toast:')));
});
test('initial map failure never invokes OSM or schematic fallback',()=>{
 assert.match(app,/kakaoConnectError\(message\+/);
 assert.doesNotMatch(app,/await showMap\(window\.matchMedia\('\(max-width:900px\)'\)\.matches\?'osm':'schematic'\)/);
 assert.match(app,/button\.textContent='카카오맵 다시 연결'/);
});

test('app entry parses as the classic browser script served by the page',()=>{assert.doesNotThrow(()=>new vm.Script(app));});
