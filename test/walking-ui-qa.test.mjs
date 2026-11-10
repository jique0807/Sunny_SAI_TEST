import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');

test('mobile mobility tabs and form radios are paired and accessible',()=>{
 for(const id of ['navModeDriving','navModeWalking','navModeHint','travelModeSelector','navRouteModeBadge','navRouteFacilitySummary','mapRouteLegendLabel'])
  assert.equal(ui.split('id="'+id+'"').length-1,1,id);
 assert.match(ui,/id="navModeDriving"[^>]*aria-pressed="true"/);
 assert.match(ui,/id="navModeWalking"[^>]*aria-pressed="false"/);
 assert.match(ui,/name="travelMode" value="driving" checked/);
 assert.match(ui,/name="travelMode" value="walking"/);
 assert.match(ui,/id="navStartGuidance"/);
 assert.match(ui,/id="navRouteResult"/);
});
test('narrow-screen mode controls retain keyboard accessibility and fixed app navigation',()=>{
 assert.match(css,/\.sunny-mobile-mobility button\{[\s\S]*?min-height:49px/);
 assert.match(css,/\.sunny-mobile-mobility button:focus-visible\{outline:3px/);
 assert.match(css,/\.nav-route-result:not\(\[hidden\]\)\{box-sizing:border-box;max-height:calc\(100dvh - 142px\)/);
 assert.match(css,/\.nav-search-sheet \.sunny-travel-modes\{display:none!important\}/);
 for(const id of ['navHome','navRoute','navLayers','navSettings'])
  assert.equal(ui.split('id="'+id+'"').length-1,1,id);
});
test('walking result shows real provider and explicitly labels facility data as non-observed',()=>{
 assert.match(app,/route\.provider==='TMAP'\?'TMAP 보행로 경로'/);
 assert.match(app,/시설 위치 참고/);
 assert.match(app,/통행상태 미확인/);
 assert.match(app,/보행시설 세부정보 미수신/);
 assert.match(app,/보행 구간 살펴보기/);
 assert.match(app,/routeWeatherEnabled\(\).*?buildRouteHazards/s);
});
test('mobile quick buttons change original shared radio state and reject changes during navigation',()=>{
 const start=app.indexOf("const selectedTravelMode=()=>");
 const stop=app.indexOf("/* Navigation-first mobile shell.",start);
 assert.ok(start>0&&stop>start);
 const elements=new Map();
 const element=id=>{if(!elements.has(id)){const handlers={};elements.set(id,{
  checked:false,hidden:false,disabled:false,textContent:'',attributes:{},value:'',
  addEventListener(name,fn){handlers[name]=fn},dispatchEvent(e){handlers[e.type]?.(e)},replaceChildren(){},
  setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this.attributes[k]},
  click(){handlers.click?.()}
 })}return elements.get(id)};
 const radios=['driving','walking'].map(value=>{
  const r=element(value);r.value=value;return r;
 });
 for(const r of radios){
  let state=r.value==='driving';
  Object.defineProperty(r,'checked',{get(){return state},set(v){state=!!v;if(state)for(const other of radios)if(other!==r)other.checked=false}});
 }
 let guiding=false,warning='',replyText='';
 const doc={
  getElementById:element,
  querySelector(selector){if(selector.includes(':checked'))return radios.find(r=>r.checked)||null;
    const match=selector.match(/value="(driving|walking)"/);return match?element(match[1]):null;},
  querySelectorAll:()=>radios
 };
 const context={document:doc,originPlace:null,destPlace:null,kakaoRouteLink:()=>'',playing:false,routePolyline:null,
  drivingUI:{isActive:()=>guiding},route:{travelMode:'driving',demo:false},
  toast:msg=>{warning=msg},reply:msg=>{replyText=msg},
  Event:class{constructor(type){this.type=type}}};
 vm.runInNewContext('const $=id=>document.getElementById(id);'+app.slice(start,stop),context);
 element('navModeWalking').click();
 assert.equal(radios[1].checked,true);
 assert.equal(element('navModeWalking').attributes['aria-pressed'],'true');
 assert.equal(element('navModeDriving').attributes['aria-pressed'],'false');
 assert.equal(element('navStartGuidance').disabled,true);
 assert.match(replyText,/도보 경로를 새로/);
 guiding=true;element('navModeDriving').click();
 assert.equal(radios[1].checked,true);
 assert.match(warning,/안내를 종료/);
 guiding=false;context.route={travelMode:'walking',demo:false};
 element('navModeDriving').click();
 assert.equal(radios[0].checked,true);
 assert.equal(element('navModeDriving').attributes['aria-pressed'],'true');
});


test('mobile route button dispatches to actual route handler rather than silently failing hidden-form validation',()=>{
 const begin=app.indexOf("$('studioRouteSearch')?.addEventListener('click',()=>{");
 const end=app.indexOf("\n$('origin')?.addEventListener('change',studioSync);",begin);
 assert.ok(begin>0&&end>begin);
 const snippet=app.slice(begin,end);
 assert.doesNotMatch(snippet,/requestSubmit\(\)/);
 assert.match(snippet,/dispatchEvent\(new Event\('submit'/);
 const registry={},updates=[];
 const elements={
  studioRouteSearch:{addEventListener(type,fn){registry[type]=fn;}},
  searchForm:{dispatchEvent(e){updates.push(['submit',e.type]);return true;}},
  origin:{value:''},studioQuery:{focus(){updates.push(['focus'])}}
 };
 const get=id=>elements[id]||null;
 const sandbox={
  $:get,routeSearchPending:false,originPlace:{name:'국가기상위성센터',lat:36.991,lng:127.430},
  destPlace:{name:'바늘말',lat:36.995,lng:127.44},
  studioCurrent:()=>null,studioSync:()=>updates.push(['sync']),
  studioRouteMessage:(message,state)=>updates.push(['notice',message,state]),
  toast:message=>updates.push(['toast',message]),
  Event:class{constructor(type){this.type=type;}}
 };
 vm.runInNewContext(snippet,sandbox);
 registry.click();
 assert.ok(updates.some(x=>x[0]==='submit'&&x[1]==='submit'));
 assert.ok(updates.some(x=>x[0]==='notice'&&/탐색하고/.test(x[1])));
 updates.length=0;sandbox.routeSearchPending=true;registry.click();
 assert.ok(!updates.some(x=>x[0]==='submit'));
});
test('mobile walking errors and progress remain visible without opening hidden planner',()=>{
 assert.match(ui,/id="studioRouteStatus"[^>]*role="status"/);
 assert.match(app,/studioRouteMessage\(\(walking\?'도보':'자동차'\)\+' 경로 탐색 실패:/);
 assert.match(app,/studioRouteMessage\(\(selectedTravelMode\(\)==='walking'\?'TMAP 도보'/);
 assert.match(css,/\.studio-route-status\[data-state="error"\]/);
});
