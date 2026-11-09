import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEMO_SEOUL_BUSAN,DEMO_SCENES,DEMO_BREAKING_TRIGGER,DEMO_BREAKING_POSITION,demoPointAtSeconds,makeDemoScenario,makeDemoBreakingWarning,shouldTriggerDemoBreakingWarning,demoDistanceMeters,demoLeadSeconds,demoSpokenWarning} from '../public/demo-scenario.mjs';
import {buildRouteHazards,hazardDetails} from '../public/route-hazards.mjs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');

const route={duration:18000,departure:'2026-11-09T01:00:00.000Z',
 rainPath:[{lat:37.566,lng:126.978,seconds:0,label:'서울'},
 {lat:37.2722676,lng:127.4350893,seconds:2500,label:'이천'},
 {lat:36.75,lng:127.85,seconds:5300,label:'상주 진입'},
 {lat:36.4109398,lng:128.1591451,seconds:8000,label:'상주'},
 {lat:36.1398882,lng:128.1136245,seconds:10200,label:'김천'},
 {lat:35.5038173,lng:128.7466053,seconds:14500,label:'밀양'},
 {lat:35.17955,lng:129.07564,seconds:18000,label:'부산'}]};
test('real Seoul and Busan city hall endpoints are predefined and not user GPS',()=>{
 assert.equal(DEMO_SEOUL_BUSAN.origin.name,'서울시청');
 assert.equal(DEMO_SEOUL_BUSAN.destination.name,'부산시청');
 assert.ok(DEMO_SEOUL_BUSAN.origin.lat>37&&DEMO_SEOUL_BUSAN.destination.lat<36);
});
test('two clearly identified demo hazards follow route time and stay separate from KMA forecasts',()=>{
 const x=makeDemoScenario(route);
 assert.deepEqual(x.hazards.map(h=>h.kind),['rain','fog']);
 assert.equal(x.hazards.length,DEMO_SCENES.length);
 assert.ok(x.hazards.every(h=>h.demo&&/시연/.test(h.provider)&&Number.isFinite(h.lat)&&Number.isFinite(h.lng)));
 assert.ok(x.hazards.every((h,i)=>i===0||h.seconds>x.hazards[i-1].seconds));
 assert.ok(x.samples.every(s=>s.status==='demo'&&s.forecast===null));
 assert.deepEqual(buildRouteHazards(x.samples),[]);
 assert.ok(hazardDetails(x.hazards[1]).join(' ').includes('실제 관측·특보 아님'));
});
test('event locations interpolate through Kakao route timestamps',()=>{
 const p=demoPointAtSeconds(route.rainPath,9000);
 assert.ok(p.lat>35.7&&p.lat<36.5);
 assert.ok(p.lng>127.4&&p.lng<128.3);
 assert.equal(demoPointAtSeconds([],100),null);
 assert.throws(()=>makeDemoScenario({...route,rainPath:[]}),/시연 경로/);
});
test('demo route and two initial markers are wired into navigation rail, map, and simulated playback',()=>{
 assert.match(ui,/id="navDemoSeoulBusan"/);
 assert.match(ui,/id="navDemoDisclaimer"/);
 assert.match(ui,/id="sunnyDemoNext"/);
 assert.match(ui,/id="sunnyDemoPause"/);
 assert.match(app,/makeDemoScenario\(route\)/);
 assert.match(app,/route\.demoHazards/);
 assert.match(app,/startDemoGuidance\(\)/);
 assert.match(app,/function drawDemoOverlays\(\)/);
 assert.match(app,/function advance\(value/);
});

test('no newly issued warning is present before the surprise mid-drive trigger',()=>{
 const x=makeDemoScenario(route);
 assert.equal(x.hazards.some(h=>h.breaking),false);
 assert.equal(x.hazards.length,2);
 assert.equal(DEMO_BREAKING_TRIGGER,0.42);
 assert.equal(DEMO_BREAKING_POSITION,0.43);
 assert.equal(shouldTriggerDemoBreakingWarning(40,41,false),false);
 assert.equal(shouldTriggerDemoBreakingWarning(41,42,false),true);
 assert.equal(shouldTriggerDemoBreakingWarning(35,75,false),true);
 assert.equal(shouldTriggerDemoBreakingWarning(41,42,true),false);
 assert.equal(shouldTriggerDemoBreakingWarning(43,44,false),false);
});

test('fictional warning adds one nearby NEW geolocated point, never a KMA claim',()=>{
 const scenario=makeDemoScenario(route);
 const warning=makeDemoBreakingWarning(route,'2026-11-09T02:15:00.000Z');
 assert.equal(warning.id,'breaking-warning');
 assert.equal(warning.kind,'warning');
 assert.ok(warning.breaking&&warning.demo);
 assert.ok(warning.seconds>=7900&&warning.seconds<=8100);
 assert.equal(warning.issuedAt,'2026-11-09T02:15:00.000Z');
 assert.match(warning.measure,/호우특보/);
 assert.match(warning.provider,/시연/);
 assert.ok(Number.isFinite(warning.lat)&&Number.isFinite(warning.lng));
 assert.ok(!scenario.hazards.some(h=>h.id===warning.id));
 assert.ok(warning.seconds>Math.round(route.duration*.42));
 assert.ok(hazardDetails(warning).join(' ').includes('실제 관측·특보 아님'));
 assert.throws(()=>makeDemoBreakingWarning({...route,rainPath:[]}),/상주 경로|가상 특보/);
});

test('automatic new warning appears in route and driver UI but never in real path',()=>{
 const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
 const drive=readFileSync(new URL('../public/drive-guidance.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/id="sunnyDemoBreaking"/);
 assert.match(app,/function injectDemoBreakingWarning\(\)/);
 assert.match(app,/shouldTriggerDemoBreakingWarning\(previous,progress,false,demoBreakingTiming\(route\)\.triggerPercent\)/);
 assert.match(app,/route\.demoHazards=\[\.\.\.route\.demoHazards,hazard\]/);
 assert.match(app,/drawDemoOverlays\(\);moveCar\(\)/);
 assert.doesNotMatch(app,/sunnyDemoBreaking/);
 assert.match(app,/function resetDemoBreakingWarning\(\)/);
 assert.match(drive,/const breaking=upcoming\.find\(h=>h\.breaking\)/);
 assert.match(drive,/sunny-drive-alert-urgent/);
 assert.match(app,/simulateDemoDetourSelection\(\)/);
 assert.match(app,/demoDetourHideTimer=setTimeout\(/);
 assert.match(ui,/id="sunnyDemoDetourPopup"/);
 assert.match(app,/\},3000\);/);
});

test('demo screen avoids repetitive synthetic labels but keeps a clear presentation-only disclosure',()=>{
 const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const drive=readFileSync(new URL('../public/drive-guidance.mjs',import.meta.url),'utf8');
 const scenario=makeDemoScenario(route);
 assert.equal(scenario.hazards.length,2);
 assert.deepEqual(scenario.hazards.map(h=>h.title),['강한 비','짙은 안개']);
 assert.ok(scenario.hazards.every(h=>!/가상/.test(h.title+h.measure+h.description)));
 assert.match(ui,/id="navDemoDisclaimer"[^>]*>.*시연 모드.*실제 관측/);
 assert.doesNotMatch(ui,/sunny-demo-breaking-trigger|id="sunnyDemoBreaking"/);
 assert.match(drive,/시연 모드 · 실제 특보·위험정보 아님/);
 assert.match(app,/label\.textContent=\(\{rain:'강수',fog:'안개',flood:'침수',warning:'특보'\}\)/);
 const demo=app.slice(app.indexOf('async function demoRoute(){'),app.indexOf('const scriptLoads=new Map();'));
 const displayed=demo.split('\n').filter(line=>/reply\(|marker\.title|marker\.setAttribute\('aria-label'|label\.textContent/.test(line));
 assert.ok(displayed.length>8);
 assert.ok(displayed.every(line=>!line.includes('가상')),'demo narration and visible map pins should have no repeated virtual label');
});

test('demo warnings are short, fictional, and based on along-route distance',()=>{
 const demo=makeDemoScenario(route),warning=makeDemoBreakingWarning(route);
 assert.equal(DEMO_SCENES.length,2);
 assert.equal(demo.hazards.length+1,3);
 assert.match(demo.hazards[0].measure,/100mm/);
 assert.equal(demoSpokenWarning(demo.hazards[0],512),'전방 500미터에 비 100mm 주의입니다.');
 assert.equal(demoSpokenWarning(demo.hazards[1],499),'전방 500미터에 안개 주의입니다.');
 assert.equal(demoSpokenWarning(warning,1902),'전방 1900미터에 비 100mm 주의입니다.');
 assert.equal(demoSpokenWarning({...warning,demo:false},500),null);
 assert.equal(demoSpokenWarning(warning,null),null);
 assert.ok(demoDistanceMeters(route.rainPath,0,600)>0);
 const lead=demoLeadSeconds(route.rainPath,demo.hazards[0].seconds,500);
 assert.ok(lead>0&&lead<demo.hazards[0].seconds);
 assert.ok(Math.abs(demoDistanceMeters(route.rainPath,lead,demo.hazards[0].seconds)-500)<12);
});
test('detour notice makes no claims of verified road safety or real reroute',()=>{
 assert.match(app,/demoDetourSelected:true/);
 assert.match(app,/clearDemoDetourPopup\(\)/);
 assert.match(app,/const resumePlayback=playing/);
 assert.match(app,/if\(resumePlayback&&route\?\.demo&&progress<100&&drivingUI\.isActive\(\)\)startDemoPlayback\(\)/);
 assert.match(ui,/새 도로 경로는 카카오 API를 통해 조회합니다/);
});
