import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_APP_SETTINGS,SETTINGS_KEY,sanitizeAppSettings,readAppSettings,initAppSettings} from '../public/app-settings.mjs';

const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const drive=readFileSync(new URL('../public/drive-guidance.mjs',import.meta.url),'utf8');

function fakeUI(){
 const elements=new Map();
 for(const id of ['settingFollowGps','settingHeadingMode','settingAlertCount','settingRefreshMinutes',
  'settingOverlayOpacity','settingOverlayOpacityValue','autoVoice','speed','settingReset','appSettingsStatus']){
  elements.set(id,{id,checked:false,value:'',textContent:'',events:{},
   addEventListener(type,callback){this.events[type]=callback;},
   fire(type){assert.ok(this.events[type],id+': '+type+' missing');this.events[type]();}});
 }
 return{document:{getElementById:id=>elements.get(id)},elements};
}
function storage(){
 const data=new Map();
 return{getItem:k=>data.get(k)??null,setItem(k,v){data.set(k,v);},removeItem(k){data.delete(k);}};
}
test('all user settings accept only safe allowed values, no location or API key persistence',()=>{
 assert.deepEqual(sanitizeAppSettings({}),DEFAULT_APP_SETTINGS);
 assert.deepEqual(sanitizeAppSettings({followGps:false,headingMode:'north',alertCount:'1',
  refreshMinutes:'5',overlayOpacity:'90',voiceAlerts:false,voiceSpeed:1.2}),
 {followGps:false,headingMode:'north',alertCount:1,refreshMinutes:5,overlayOpacity:90,voiceAlerts:false,voiceSpeed:1.2});
 const malformed=sanitizeAppSettings({headingMode:'arbitrary',alertCount:999,refreshMinutes:-2,
   overlayOpacity:500,voiceSpeed:100,voiceAlerts:'false',followGps:null,apiKey:'secret',
   latitude:37.1,longitude:127.1});
 assert.deepEqual(malformed,{...DEFAULT_APP_SETTINGS,overlayOpacity:100});
 assert.ok(!JSON.stringify(malformed).includes('apiKey'));
});
test('settings survive reload in browser storage and fall back if storage access is denied',()=>{
 const saved=storage();
 saved.setItem(SETTINGS_KEY,JSON.stringify({headingMode:'north',followGps:false,alertCount:1}));
 assert.equal(readAppSettings(saved).headingMode,'north');
 assert.equal(readAppSettings(saved).followGps,false);
 assert.equal(readAppSettings(saved).voiceSpeed,1);
 assert.deepEqual(readAppSettings({getItem(){throw Error('blocked');}}),DEFAULT_APP_SETTINGS);
});
test('settings controls immediately update, persist, report status and reset safely',()=>{
 const {document,elements}=fakeUI(),store=storage(),events=[];
 const manager=initAppSettings({document,storage:store,onChange:next=>events.push(next)});
 assert.equal(manager.get().headingMode,'course');
 assert.equal(elements.get('settingFollowGps').checked,true);
 elements.get('settingFollowGps').checked=false;elements.get('settingFollowGps').fire('change');
 assert.equal(manager.get().followGps,false);
 elements.get('settingHeadingMode').value='north';elements.get('settingHeadingMode').fire('change');
 elements.get('settingRefreshMinutes').value='5';elements.get('settingRefreshMinutes').fire('change');
 elements.get('settingAlertCount').value='1';elements.get('settingAlertCount').fire('change');
 elements.get('settingOverlayOpacity').value='70';elements.get('settingOverlayOpacity').fire('input');
 elements.get('autoVoice').checked=false;elements.get('autoVoice').fire('change');
 elements.get('speed').value='1.2';elements.get('speed').fire('input');
 assert.deepEqual(manager.get(),{followGps:false,headingMode:'north',alertCount:1,refreshMinutes:5,
  overlayOpacity:70,voiceAlerts:false,voiceSpeed:1.2});
 assert.equal(readAppSettings(store).overlayOpacity,70);
 assert.equal(elements.get('settingOverlayOpacityValue').textContent,'70%');
 assert.match(elements.get('appSettingsStatus').textContent,/저장/);
 assert.equal(events.length,7);
 elements.get('settingReset').fire('click');
 assert.deepEqual(manager.get(),DEFAULT_APP_SETTINGS);
 assert.deepEqual(readAppSettings(store),DEFAULT_APP_SETTINGS);
 assert.equal(elements.get('settingHeadingMode').value,'course');
});
test('all settings presented in modal are functional and bound to navigation',()=>{
 for(const id of ['settingFollowGps','settingHeadingMode','settingAlertCount','settingRefreshMinutes',
  'settingOverlayOpacity','settingReset','appSettingsStatus','autoVoice','speed'])
  assert.match(ui,new RegExp('id="'+id+'"'));
 assert.match(app,/appSettings=initAppSettings/);
 assert.match(app,/appPrefs\.headingMode==='north'/);
 assert.match(app,/!appPrefs\.followGps/);
 assert.match(app,/drivingUI\.setPreferences\(next\)/);
 assert.match(app,/rainLastFetch<appPrefs\.refreshMinutes\*60000/);
 assert.match(app,/reply\(text,appPrefs\.voiceAlerts\)/);
 assert.match(app,/appSettings\.set\(\{overlayOpacity:/);
 assert.match(drive,/prioritizeRouteHazards\(/);
 assert.match(drive,/getRoadHazards\(route\)/);
 assert.match(drive,/slots\.slice\(0,alertCount\)/);
});
