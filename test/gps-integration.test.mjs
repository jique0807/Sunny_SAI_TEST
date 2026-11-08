import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ahead,locate,RainGate} from '../public/rain-monitor.mjs';
import {forecastReception} from '../public/layer-reception.mjs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function harness(kma=true){
 const elements=new Map(),events={},calls=[],geo={};let time=Date.parse('2026-11-05T01:00:00Z');
 const $=id=>{if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,disabled:false});return elements.get(id);};
 const context=vm.createContext({forecastReception,stopPreviewPositionWatch(){},drawWeatherOverlays(){},setLayerReception(id,state){$(id+'Reception').state=state;},rainGridOverlay:{disableRouteRadar(){}},$,ahead,locate,RainGate,Math,Number,Date:class extends Date{static now(){return time;}},navigator:{geolocation:{watchPosition(ok,bad){geo.ok=ok;geo.bad=bad;return 7;},clearWatch(){geo.cleared=true;}}},window:{isSecureContext:true},document:{hidden:false,body:{classList:{add(){},remove(){}}},addEventListener(n,fn){events[n]=fn;}},route:{demo:false,rainPath:[{lat:37,lng:127,seconds:0},{lat:37,lng:127.1,seconds:6000}]},weather:null,connections:{kma},appPrefs:{refreshMinutes:1,voiceAlerts:true,followGps:true,headingMode:'course'},fmt:()=> '10:00',toast:()=>{},reply:()=>{},stopVoice:()=>{},kmap:null,lmap:null,gpsNavArrow:null,
  drivingUI:{start(){},stop(){},update(){},setAhead(){},isActive(){return false;}},resetDrivingMapHeading(){},updateDrivingMapHeading(){return '북쪽 기준';},
  setNavTab(){},showMap:async()=>{},followDrivingGps(){},setInterval:fn=>{geo.tick=fn;return 1;},clearInterval:()=>{},api:async(path,data)=>{calls.push({path,data});return {samples:data.samples.map(p=>({...p,status:'forecast',forecast:{provider:'kma',product:'초단기예보',rain:0,precipitationType:0}})),fetchedAt:new Date(time).toISOString()};}});
 vm.runInContext(source.match(/^const routeWeatherEnabled=.*;$/m)[0],context);
 vm.runInContext(source.slice(source.indexOf('let rainWatch='),source.indexOf("\n$('departure').value")),context);
 const fix=(lng=127.01,accuracy=10)=>geo.ok({coords:{latitude:37,longitude:lng,accuracy},timestamp:time});
 return {$,geo,context,calls,events,fix,advance:ms=>time+=ms};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('actual app GPS callbacks update diagnostics immediately; weather throttles without freezing GPS',async()=>{const h=harness();h.$('rainStart').onclick();h.fix();assert.equal(h.$('navLayerWeatherReception').state,'loading');await settle();assert.equal(h.$('navLayerWeatherReception').state,'received');assert.equal(h.calls.length,1);h.advance(10000);h.fix(127.012);await settle();assert.match(h.$('gpsStatus').textContent,/127.01200/);assert.equal(h.calls.length,1);h.advance(60000);h.fix(127.03);await settle();assert.equal(h.calls.length,2);assert.ok(h.calls[1].data.samples[0].lng>127.02);});
test('temporary GPS timeout recovers; denied permission stops and late callbacks are ignored',async()=>{const h=harness();h.$('rainStart').onclick();h.geo.bad({code:3});assert.equal(h.geo.cleared,undefined);h.fix();await settle();assert.match(h.$('gpsStatus').textContent,/GPS 10/);h.geo.bad({code:1});const text=h.$('gpsStatus').textContent;h.fix();assert.equal(h.$('gpsStatus').textContent,text);assert.equal(h.geo.cleared,true);});
test('foreground return resumes without losing watch; no calls while hidden',async()=>{const h=harness();h.$('rainStart').onclick();h.fix();await settle();h.context.document.hidden=true;h.events.visibilitychange();h.advance(310000);h.fix(127.03);await settle();assert.equal(h.calls.length,1);h.context.document.hidden=false;h.events.visibilitychange();await settle();assert.equal(h.calls.length,2);assert.equal(h.geo.cleared,undefined);});
test('GPS works without KMA key; bad accuracy never fetches weather; off-route is visible',async()=>{const h=harness(false);h.$('rainStart').onclick();h.fix(127.01,1000);await settle();assert.equal(h.calls.length,0);assert.match(h.$('gpsStatus').textContent,/정확도 부족/);h.fix();await settle();assert.match(h.$('rainStatus').textContent,/키 미설정/);h.fix(128);await settle();assert.match(h.$('gpsStatus').textContent,/이탈/);assert.equal(h.calls.length,0);});

test('disabling route weather preserves GPS and skips weather requests',async()=>{
 const h=harness();
 h.$('navLayerWeather').checked=false;
 h.$('rainStart').onclick();
 h.fix();
 await settle();
 assert.match(h.$('gpsStatus').textContent,/127.01000/);
 assert.equal(h.calls.length,0);
 h.$('navLayerWeather').checked=true;
 h.fix(127.012);
 await settle();
 assert.match(h.$('gpsStatus').textContent,/127.01200/);
 assert.equal(h.calls.length,1);
});

test('actual API client renews expired session once and does not repeat key mutations',async()=>{
 let requests=0,renewals=0;
 const ctx=vm.createContext({fetchWithReception:(fetcher,...args)=>fetcher(...args),csrf:'old',advanced:false,sessionPromise:Promise.resolve(),keyStatus:()=>{},session:async()=>{renewals++;ctx.csrf='new';},fetch:async()=>{requests++;return {status:requests===1?401:200,ok:requests!==1,json:async()=>requests===1?{error:'expired'}:{samples:[]}};},Error,JSON});
 vm.runInContext(source.slice(source.indexOf('async function api('),source.indexOf('function connectionStatus()')),ctx);
 await vm.runInContext("api('/api/weather',{samples:[]})",ctx);assert.equal(requests,2);assert.equal(renewals,1);
 requests=0;renewals=0;await assert.rejects(vm.runInContext("api('/api/voice/key',{key:'fake'})",ctx),/expired/);assert.equal(requests,1);assert.equal(renewals,0);
});

test('automatic reroute requires three distinct accurate off-route fixes over six seconds',async()=>{
 const h=harness(false);
 h.context.drivingUI.isActive=()=>true;
 h.context.destPlace={lat:37,lng:127.1};
 h.context.api=async(path,data)=>{h.calls.push({path,data});throw Error('simulated routing outage');};
 h.$('rainStart').onclick();
 h.fix(127.01);
 const remaining=vm.runInContext('remainingRoutePoints()',h.context);
 assert.ok(Math.abs(remaining[0].lng-127.01)<1e-8);
 assert.equal(remaining.at(-1).lng,127.1);
 h.fix(128);h.geo.tick();h.geo.tick();
 h.advance(3000);h.fix(128);
 assert.equal(h.calls.length,0);
 h.advance(3000);h.fix(128);
 await settle();
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].path,'/api/route');
 assert.equal(h.calls[0].data.origin.lng,128);
 h.advance(3000);h.fix(128);
 assert.equal(h.calls.length,1);
});
