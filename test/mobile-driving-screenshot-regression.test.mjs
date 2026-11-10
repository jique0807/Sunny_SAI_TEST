import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initDriveGuidance} from '../public/drive-guidance.mjs';
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
const DOMIDS=['sunnyDriveOverlay','sunnyDriveAlerts','sunnyDriveProgressFill',
 'sunnyDriveProgressPointer','sunnyDriveRiskMarks','sunnyDriveHazardDetail',
 'sunnyDriveProgressTrack','sunnyDriveSummary','sunnyDriveGpsText',
 'sunnyDriveStop','sunnyDriveReroute'];
function createNode(id='node'){
 const listeners={};
 return {id,children:[],style:{},dataset:{},hidden:false,textContent:'',
  append(...elements){this.children.push(...elements);},
  replaceChildren(...elements){this.children=elements;},
  addEventListener(name,handler){listeners[name]=handler;},
  dispatch(name){listeners[name]?.({type:name});},
  setAttribute(k,v){this[k]=v;}
 };
}
function fakeDocument(){
 const nodes=new Map(DOMIDS.map(id=>[id,createNode(id)]));
 const classes=new Set();
 return {
  nodes, document:{
   getElementById:id=>nodes.get(id)||null,
   createElement:createNode,
   body:{classList:{
    add:x=>classes.add(x),remove:x=>classes.delete(x),
    contains:x=>classes.has(x)
   }}
  }
 };
}
test('Kakao raster street labels stay upright while the vehicle direction rotates',()=>{
 assert.doesNotMatch(css,/rotate\(var\(--sunny-map-rotation,0deg\)\)/);
 assert.doesNotMatch(app,/classList\.add\('sunny-heading-up'\)/);
 assert.match(app,/classList\.remove\('sunny-heading-up'\)/);
 assert.match(app,/marker\.style\.rotate=/);
 assert.match(app,/resetDrivingMapHeading\(\)/);
 assert.match(ui,/진행방향 위로 · 글자 고정/);
 assert.match(ui,/id="sunnyVectorMap"/);
 assert.match(app,/startVectorGuidance\(route\.rainPath\[0\],/);
});
test('screenshot: four bottom tabs are fixed and accessible even during active guidance',()=>{
 for(const id of ['navHome','navRoute','navLayers','navSettings'])
  assert.equal(ui.split('id="'+id+'"').length-1,1,id);
 assert.match(css,/\.nav-bottom-bar\{\s*display:grid!important;position:fixed!important/);
 assert.match(css,/body\.sunny-guiding \.dashboard \.map-canvas,[\s\S]*?height:calc\(100dvh - var\(--sunny-drive-navbar\)\)!important/);
 assert.match(css,/body\.sunny-guiding \.sunny-drive-footer\{[\s\S]*?bottom:7px!important/);
 const activeHandler=app.slice(app.indexOf("document.getElementById('navRoute')?.addEventListener"),app.indexOf("document.getElementById('navLayers')?.addEventListener"));
 assert.ok(activeHandler.includes("else showNavSearch(true);"),'search tab must open during driving');
 assert.ok(!activeHandler.includes('if(drivingUI.isActive()){showNavLayers(false);setNavTab'), 'driving search tab must not be inert');
});
test('screenshot: rain forecast and radar sheet is wide and shorter without replacing real modes',()=>{
 assert.match(css,/left:env\(safe-area-inset-left,0px\)!important;\s*right:env\(safe-area-inset-right,0px\)!important;transform:none!important;\s*width:auto!important/);
 assert.match(css,/max-height:min\(210px,42dvh\)!important/);
 assert.match(css,/body\.sunny-rain-grid-active\.sunny-guiding \.sunny-rain-grid-timeline/);
 for(const id of ['navRainGridMinimize','navRainGridClose',
  'navRainGridRefresh','navRainGridReset'])
  assert.equal(ui.split('id="'+id+'"').length-1,1,id);
 assert.match(ui,/초단기 강수예측/);
 assert.doesNotMatch(ui,/id="navNationalRadar"/);
});
test('driving panel fills the configured slots with distinct status or weather cards',()=>{
 const original=globalThis.document;
 const {nodes,document}=fakeDocument();
 try{
  globalThis.document=document;
  const guide=initDriveGuidance({onStop:()=>{},onReroute:()=>{},formatTime:()=> '18:30'});
  const route={distance:3000,duration:1200,rainPath:[
   {lat:37.5,lng:127,seconds:0},{lat:37.51,lng:127,seconds:1200}
  ]};
  guide.start(route,{samples:[]});
  assert.equal(nodes.get('sunnyDriveAlerts').children.length,2);
  assert.match(nodes.get('sunnyDriveAlerts').children[0].children[1].children[0].textContent,/전방 기상예보 미확인/);
  assert.match(nodes.get('sunnyDriveAlerts').children[1].children[1].children[0].textContent,/전방 예보 조회 상태/);
  guide.setWeather({samples:[{status:'forecast',seconds:400,label:'첫 구간',
   forecast:{provider:'kma',rain:2,precipitationType:1}},
   {status:'forecast',seconds:850,label:'두 번째 구간',
    forecast:{provider:'kma',rain:0,precipitationType:3}}]});
  assert.equal(nodes.get('sunnyDriveAlerts').children.length,2);
  guide.setPreferences({alertCount:1});
  assert.equal(nodes.get('sunnyDriveAlerts').children.length,1);
  guide.stop();
  assert.equal(nodes.get('sunnyDriveAlerts').children.length,0);
 }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
test('off-route shows explicit reroute action, invokes callback, hides again on recovery',()=>{
 const original=globalThis.document;
 const {nodes,document}=fakeDocument();
 let triggered=0;
 try{
  globalThis.document=document;
  const guide=initDriveGuidance({onStop:()=>{},onReroute:()=>{triggered++;},formatTime:()=> '18:30'});
  guide.start({distance:3000,duration:1200,rainPath:[
   {lat:37.5,lng:127,seconds:0},{lat:37.51,lng:127,seconds:1200}
  ]});
  const reroute=nodes.get('sunnyDriveReroute');
  assert.equal(reroute.hidden,true);
  guide.update(100,{accuracy:10},true);
  assert.equal(reroute.hidden,false);
  reroute.dispatch('click');
  assert.equal(triggered,1);
  assert.match(nodes.get('sunnyDriveAlerts').children[0].children[1].children[1].textContent,/재탐색/);
  guide.update(120,{accuracy:10},false);
  assert.equal(reroute.hidden,true);
  guide.stop();
  assert.equal(reroute.hidden,true);
 }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
test('reroute uses live GPS point, does not replace route on stale response, and is request-throttled',()=>{
 assert.match(app,/async function refreshRouteFromGps\(automatic=false\)/);
 assert.match(app,/rainPosition\.accuracy>60/);
 assert.match(app,/Date\.now\(\)-rainPosition\.timestamp>30000/);
 assert.match(app,/Date\.now\(\)-lastRerouteAt<30000/);
 assert.match(app,/origin,destination,departure:new Date\(\)\.toISOString\(\)/);
 assert.match(app,/sessionRun!==rainRun\|\|route!==previous/);
 assert.match(app,/drivingUI\.start\(route,null\);renderRoute\(\)/);
 assert.match(app,/Promise\.allSettled\(\[loadWeather\(\),showMap\('kakao'\)\]\)/);
 assert.match(ui,/id="sunnyDriveReroute" type="button" hidden/);
});
