import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEMO_SEOUL_BUSAN,DEMO_SCENES,DEMO_INITIAL_WAYPOINTS,DEMO_DETOUR_CANDIDATES,DEMO_MIN_CLEARANCE_METERS,DEMO_BREAKING_TRIGGER,DEMO_BREAKING_POSITION,selectOptimalDemoDetour,demoBreakingTiming,demoPointAtSeconds,makeDemoScenario,makeDemoBreakingWarning,shouldTriggerDemoBreakingWarning,demoDistanceMeters,demoLeadSeconds,demoSpokenWarning} from '../public/demo-scenario.mjs';
import {buildRouteHazards,hazardDetails} from '../public/route-hazards.mjs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');

const route={duration:18000,departure:'2026-11-09T01:00:00.000Z',
 rainPath:[{lat:37.566,lng:126.978,seconds:0,label:'서울'},
 {lat:37.2722676,lng:127.4350893,seconds:2500,label:'이천'},
 {lat:36.75,lng:127.85,seconds:5300,label:'중부 경로'},
 {lat:36.4109398,lng:128.1591451,seconds:8000,label:'구미 접근'},
 {lat:36.1195708,lng:128.3442464,seconds:10500,label:'구미'},
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
 assert.equal(DEMO_BREAKING_TRIGGER,0.58);
 assert.equal(DEMO_BREAKING_POSITION,0.65);
 assert.equal(shouldTriggerDemoBreakingWarning(56,57,false),false);
 assert.equal(shouldTriggerDemoBreakingWarning(57,58,false),true);
 assert.equal(shouldTriggerDemoBreakingWarning(35,75,false),true);
 assert.equal(shouldTriggerDemoBreakingWarning(57,58,true),false);
 assert.equal(shouldTriggerDemoBreakingWarning(59,60,false),false);
});

test('fictional warning adds one nearby NEW geolocated point, never a KMA claim',()=>{
 const scenario=makeDemoScenario(route);
 const warning=makeDemoBreakingWarning(route,'2026-11-09T02:15:00.000Z');
 assert.equal(warning.id,'breaking-warning');
 assert.equal(warning.kind,'warning');
 assert.ok(warning.breaking&&warning.demo);
 assert.ok(warning.seconds>=10450&&warning.seconds<=10550);
 assert.equal(warning.issuedAt,'2026-11-09T02:15:00.000Z');
 assert.match(warning.measure,/호우특보/);
 assert.match(warning.provider,/시연/);
 assert.ok(Number.isFinite(warning.lat)&&Number.isFinite(warning.lng));
 assert.ok(!scenario.hazards.some(h=>h.id===warning.id));
 assert.ok(warning.seconds>Math.round(route.duration*.42));
 assert.ok(hazardDetails(warning).join(' ').includes('실제 관측·특보 아님'));
 assert.throws(()=>makeDemoBreakingWarning({...route,rainPath:[]}),/구미 경로|가상 특보/);
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


test('Gumi warning and two regular events are geographically separate',()=>{
 const places=DEMO_INITIAL_WAYPOINTS.map(p=>p.name);
 assert.match(places[0],/이천/);
 assert.match(places[1],/구미/);
 assert.match(places[2],/밀양/);
 const sequence=makeDemoScenario(route).hazards;
 const warning=makeDemoBreakingWarning(route);
 assert.equal(sequence[0].kind,'rain');
 assert.equal(warning.label,'구미시청 부근');
 assert.equal(sequence[1].kind,'fog');
 assert.ok(sequence[0].seconds<warning.seconds&&warning.seconds<sequence[1].seconds);
 const timing=demoBreakingTiming(route);
 assert.ok(timing.triggerSeconds<warning.seconds);
 assert.ok(timing.cityDistanceMeters<100);
});
test('fastest safe Kakao result is selected, not the fastest route through the warning',()=>{
 const hazard={lat:36.11957,lng:128.34425};
 const safePath=[{lat:36.16,lng:128.43,seconds:0},{lat:35.503817,lng:128.746605,seconds:9900},{lat:35.17955,lng:129.07564,seconds:11000}];
 const unsafePath=[{...hazard,seconds:0},{lat:35.503817,lng:128.746605,seconds:8500},{lat:35.17955,lng:129.07564,seconds:9000}];
 const option=(id,secs,points)=>({candidate:{id,label:id},route:{
  duration:secs,distance:200000,vertices:points,rainPath:points}});
 const cases=[option('unsafe-fast',9000,unsafePath),option('safe-slow',12500,safePath),option('safe-fast',10500,safePath)];
 const choice=selectOptimalDemoDetour(cases,hazard);
 assert.equal(choice.candidate.id,'safe-fast');
 assert.ok(choice.clearance>=DEMO_MIN_CLEARANCE_METERS);
 assert.ok(choice.fogDistance<12000);
 assert.equal(selectOptimalDemoDetour([cases[0]],hazard),null);
 assert.equal(selectOptimalDemoDetour([{candidate:{id:'invalid'},route:{duration:0,rainPath:[]}}],hazard),null);
 assert.equal(DEMO_DETOUR_CANDIDATES.length,5);
 assert.ok(DEMO_DETOUR_CANDIDATES.some(c=>c.id==='direct'&&c.waypoints.length===0));
});
test('simulator compares routes and does not show an extra sound-check button',()=>{
 assert.match(app,/Promise\.allSettled\(DEMO_DETOUR_CANDIDATES\.map/);
 assert.match(app,/selectOptimalDemoDetour\(completed,trip\.demoBreakingWarning\)/);
 assert.match(app,/chosen\.candidate\.label/);
 assert.match(app,/clearance/);
 assert.doesNotMatch(app,/sunnyDemoSoundTest|소리 확인/);
 assert.doesNotMatch(ui,/id="sunnyDemoSoundTest"|🔊 소리 확인/);
 assert.match(app,/appPrefs\.voiceAlerts/);
});
