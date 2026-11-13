import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initVectorDriving,VECTOR_STYLE,vectorCameraPadding,vectorCameraOptions,vectorRouteGeojson} from '../public/vector-driving.mjs';

const html=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const vector=readFileSync(new URL('../public/vector-driving.mjs',import.meta.url),'utf8');

test('heading-up mode renders a separate MapLibre vector layer without changing Kakao routing',()=>{
 assert.match(html,/id="sunnyVectorMap"/);
 assert.match(html,/진행방향 위로 · 글자 고정/);
 assert.match(vector,/maplibre-gl@5\.11\.0/);
 assert.equal(VECTOR_STYLE,'https://tiles.openfreemap.org/styles/liberty');
 assert.match(app,/initVectorDriving\(/);
 assert.match(app,/startVectorGuidance\(/);
 assert.match(app,/vectorDriving\.stop\(\)/);
 assert.match(app,/vectorDriving\.setRoute\(route\)/);
 assert.match(app,/vectorDriving\.refreshHazards\(hazards\)/);
 assert.match(app,/vectorDriving\.update\(fix,navBearing,appPrefs\.headingMode,true\)/);
 assert.match(app,/route\.demo\?demoPointAtSeconds/);
 assert.match(app,/api\('\/api\/route'/);
});
test('car is placed near bottom center; heading-up map rotates without tilting labels',()=>{
 const padding=vectorCameraPadding(800);
 assert.deepEqual(padding,{top:344,bottom:0,left:0,right:0});
 assert.ok((400+(padding.top-padding.bottom)/2)/800>.70);
 const point={lat:36.1,lng:127.8};
 const east=vectorCameraOptions(point,90,800,'course');
 assert.deepEqual(east.center,[127.8,36.1]);
 assert.equal(east.bearing,90);
 assert.equal(east.pitch,0);
 assert.equal(vectorCameraOptions(point,90,800,'north').bearing,0);
 assert.equal(vectorCameraOptions(point,null,800,'course').bearing,0);
 assert.equal(vectorCameraOptions(null,90,800,'course'),null);
 assert.match(vector,/setLayoutProperty\(layer\.id,'text-rotation-alignment','viewport'\)/);
 assert.match(vector,/setLayoutProperty\(layer\.id,'text-pitch-alignment','viewport'\)/);
 assert.match(vector,/rotationAlignment:'viewport'/);
 assert.match(vector,/className='sunny-vector-vehicle'/);
 assert.doesNotMatch(css,/rotate\(var\(--sunny-map-rotation/);
 assert.match(css,/#sunnyVectorMap\.sunny-vector-map/);
});
test('route coordinates are safe GeoJSON lon-lat with a bounded number of vertices',()=>{
 const data=vectorRouteGeojson({vertices:[{lat:37.5,lng:127.0},{lat:36.5,lng:128.0},{lat:35,lng:129}]});
 assert.equal(data.type,'Feature');
 assert.equal(data.geometry.type,'LineString');
 assert.deepEqual(data.geometry.coordinates,[[127,37.5],[128,36.5],[129,35]]);
 const many=Array.from({length:35000},(_,i)=>({lat:37-i*.00001,lng:126+i*.00002}));
 const reduced=vectorRouteGeojson({vertices:many});
 assert.ok(reduced.geometry.coordinates.length<=10001);
 assert.deepEqual(reduced.geometry.coordinates[0],[126,37]);
 assert.deepEqual(reduced.geometry.coordinates.at(-1),[many.at(-1).lng,many.at(-1).lat]);
});
test('danger pins are viewport-aligned and synthetic alerts never call official warning providers',()=>{
 assert.match(vector,/hazards\.slice\(0,80\)/);
 assert.match(vector,/hazard\.title\+' 상세정보'/);
 assert.match(vector,/onSelect\(hazard\)/);
 assert.match(app,/function vectorGuidanceHazards\(/);
 assert.match(app,/route\.demo\?\(route\.demoHazards\|\|\[\]\)/);
 assert.match(app,/injectDemoBreakingWarning\(/);
 assert.match(app,/function updateDemoVector\(animate=true\)/);
 assert.match(app,/startVectorGuidance\(route\.rainPath\[0\],demoCourseAt\(0\)\)/);
 assert.doesNotMatch(vector,/\/api\/weather-warnings|\/api\/weather/);
});


test('MapLibre without optional supported export starts and updates heading; constructor failure falls back',async t=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 t.after(()=>{globalThis.window=oldWindow;globalThis.document=oldDocument;});
 const cameras=[],sources=[];let removed=0;
 class MapStub {
  addControl(){} once(event,callback){if(event==='load')queueMicrotask(callback);}
  getStyle(){return {layers:[]};} addSource(id,source){sources.push(source.data);}
  addLayer(){} resize(){} jumpTo(camera){cameras.push(camera);} easeTo(camera){cameras.push(camera);}
  remove(){removed++;}
 }
 class MarkerStub {
  constructor({element}){this.element=element;} setLngLat(){return this;}
  addTo(){return this;} getElement(){return this.element;} remove(){}
 }
 globalThis.document={createElement:()=>({style:{},setAttribute(){}})};
 globalThis.window={maplibregl:{Map:MapStub,Marker:MarkerStub,AttributionControl:class {}}};
 const failures=[],element={hidden:true,clientHeight:800,dataset:{},replaceChildren(){}};
 const ui=initVectorDriving({element,onFailure:error=>failures.push(error.message)});
 const route={rainPath:[{lat:37,lng:127},{lat:36,lng:128}]};
 assert.equal(await ui.start(route,route.rainPath[0],90),true);
 assert.equal(ui.isActive(),true);assert.equal(element.hidden,false);
 assert.equal(sources[0].geometry.coordinates.length,2);
 ui.update(route.rainPath[1],135);assert.equal(cameras.at(-1).bearing,135);
 ui.update(route.rainPath[1],135,'north');assert.equal(cameras.at(-1).bearing,0);
 ui.stop();assert.equal(ui.isActive(),false);assert.equal(removed,1);
 globalThis.window.maplibregl.Map=class {constructor(){throw Error('WebGL unavailable');}};
 assert.equal(await ui.start(route,route.rainPath[0],90),false);
 assert.equal(element.hidden,true);assert.equal(element.dataset.navigationState,'error');assert.deepEqual(failures,['WebGL unavailable']);
});
