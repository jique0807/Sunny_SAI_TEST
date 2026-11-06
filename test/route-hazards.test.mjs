import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildRouteHazards,hazardDetails,renderHazardRail,showHazardDetail} from '../public/route-hazards.mjs';
import {routeFraction} from '../public/drive-guidance.mjs';
import {newSnowfall,matchKma} from '../lib/kma.mjs';
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const driving=readFileSync(new URL('../public/drive-guidance.mjs',import.meta.url),'utf8';
const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
const path=[{lat:37.1,lng:127.1,seconds:0},{lat:37.2,lng:127.15,seconds:600},{lat:37.25,lng:127.3,seconds:1200}];
const sample=(seconds,pty,overrides={})=>({
 status:'forecast',seconds,label:'기상청 확인 경로 '+seconds,eta:'2026-11-06T12:00:00+09:00',
 grid:{nx:60,ny:127},
 forecast:{provider:'kma',precipitationType:pty,rain:0,rainLabel:'강수없음',time:'2026-11-06T12:00:00+09:00',...overrides}
});
test('only actual KMA precipitation observations become hazard icons; cannot fabricate flooding/icing',()=>{
 const list=[sample(150,1,{rain:3.2,rainLabel:'3.2mm'}),sample(750,3,{snowfall:null,snowfallLabel:null}),sample(950,2),
  sample(1050,0,{windSpeed:12}),{...sample(1100,1),status:'unavailable'},
  {...sample(1150,1),forecast:{provider:'open-meteo',precipitationType:1,rain:20}},
  {...sample(1200,1),forecast:null}];
 const hazards=buildRouteHazards(list);
 assert.deepEqual(hazards.map(x=>x.kind),['rain','snow','mixed']);
 assert.equal(hazards[0].rainLabel,'3.2mm');
 assert.equal(hazards[1].snowLabel,null);
 assert.ok(!hazards.some(x=>['flood','ice','fog'].includes(x.kind)));
 assert.deepEqual(buildRouteHazards(null),[]);
});
test('route hazard icons preserve chronological position and deduplicate nearby same-type events',()=>{
 const hazards=buildRouteHazards([sample(100,1,{rain:2}),sample(230,1,{rain:4}),
  sample(850,1,{rain:5}),sample(1100,3),sample(980,2)]);
 assert.deepEqual(hazards.map(x=>x.seconds),[100,850,980,1100]);
 const first=routeFraction(path,hazards[0].seconds);
 const second=routeFraction(path,hazards[1].seconds);
 assert.ok(first>=0&&first<second&&second<1);
});
test('1-hour snowfall comes only from genuine KMA SNO, not PTY',()=>{
 assert.deepEqual(newSnowfall('1.0cm 미만'),{snowfall:null,snowfallLabel:'1.0cm 미만'});
 assert.deepEqual(newSnowfall('3.5cm'),{snowfall:3.5,snowfallLabel:'3.5cm'});
 assert.deepEqual(newSnowfall(null),{snowfall:null,snowfallLabel:null});
 assert.deepEqual(newSnowfall('-999'),{snowfall:null,snowfallLabel:null});
 const items=[{fcstDate:'20261106',fcstTime:'1200',category:'PTY',fcstValue:'3',baseDate:'20261106',baseTime:'0830'},
  {fcstDate:'20261106',fcstTime:'1200',category:'SNO',fcstValue:'1.0cm 미만',baseDate:'20261106',baseTime:'0830'},
  {fcstDate:'20261106',fcstTime:'1200',category:'PCP',fcstValue:'1.0mm 미만',baseDate:'20261106',baseTime:'0830'}];
 const f=matchKma(items,'2026-11-06T12:00:00+09:00','short');
 assert.equal(f.snowfallLabel,'1.0cm 미만');assert.equal(f.snowfall,null);
 assert.equal(f.rainLabel,'1.0mm 미만');
 const noSno=matchKma(items.filter(x=>x.category!=='SNO'),'2026-11-06T12:00:00+09:00','short');
 assert.equal(noSno.snowfallLabel,null);
});
function mockDoc(){
 const byTag=[];
 const document={createElement(tag){
  const e={tagName:tag,children:[],attrs:{},style:{},dataset:{},hidden:false,
   addEventListener(type,fn){this['on_'+type]=fn;},
   setAttribute(k,v){this.attrs[k]=v;},
   replaceChildren(...args){this.children=[...args];},
   append(...args){this.children.push(...args);}
  };
  byTag.push(e);return e;
 }};
 return{document,byTag};
}
test('interactive risk marker renders at true route fraction and opens forecast popup',()=>{
 const save=globalThis.document;const {document}=mockDoc();globalThis.document=document;
 try{
  const container={children:[],replaceChildren(){this.children=[];},append(x){this.children.push(x);}};
  const panel={hidden:true,children:[],replaceChildren(){this.children=[];},append(x){this.children.push(x);}};
  const hazard=buildRouteHazards([sample(600,3,{rainLabel:'1.0mm 미만',snowfallLabel:'2.0cm'})])[0];
  const count=renderHazardRail(container,[hazard],path,{
   fractionAt:routeFraction,onSelect:v=>showHazardDetail(panel,v,()=> '12:00')
  });
  assert.equal(count,1);
  assert.equal(container.children.length,1);
  const marker=container.children[0];
  assert.equal(marker.tagName,'button');assert.equal(marker.dataset.risk,'snow');
  assert.equal(marker.style.bottom,(routeFraction(path,600)*100).toFixed(2)+'%');
  marker.on_click({stopPropagation(){}});
  assert.equal(panel.hidden,false);
  const content=panel.children.flatMap(x=>[x.textContent,...(x.children||[]).map(c=>c.textContent)]).join(' ');
  assert.match(content,/1.0mm 미만/);assert.match(content,/2.0cm/);
  const heading=panel.children[0];
  heading.children[1].on_click({});
  assert.equal(panel.hidden,true);
 }finally{globalThis.document=save;}
});
test('snow precipitation-type alone never displays an invented new snowfall amount',()=>{
 const item=buildRouteHazards([sample(400,3)])[0];
 const d=hazardDetails(item,()=> '12:00');
 assert.ok(d.includes('1시간 신적설: 자료 없음 · 눈 강수형태만 확인'));
});
test('route result and live guidance use the same hazard module and expose usable markers',()=>{
 assert.match(ui,/id="navRouteRiskMarks"/);
 assert.match(ui,/id="navRouteHazardDetail"/);
 assert.match(ui,/id="sunnyDriveRiskMarks"/);
 assert.match(ui,/id="sunnyDriveHazardDetail"/);
 assert.match(app,/function renderRouteHazards\(\)/);
 assert.match(app,/renderHazardRail\(rail,hazards,route\?\.rainPath/);
 assert.match(app,/function renderCards\(\)\{drawWeatherOverlays\(\);renderRouteHazards\(\)/);
 assert.match(driving,/renderHazardRail\(marks,official,route\.rainPath/);
 assert.match(css,/\.sunny-rail-hazard\{/);
 assert.match(css,/\.nav-route-risk-track\{/);
});
