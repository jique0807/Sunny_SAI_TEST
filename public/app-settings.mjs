// Sunny SAI user-adjustable preferences. Store only non-sensitive UI choices
// on this device; no location, API keys or route history is stored here.
export const SETTINGS_KEY='sunnySai:preferences:v1';
export const DEFAULT_APP_SETTINGS=Object.freeze({
 followGps:true,headingMode:'course',alertCount:2,refreshMinutes:1,
 overlayOpacity:45,voiceAlerts:true,voiceSpeed:1
});
const isValue=(value,allowed)=>allowed.includes(value);
export function sanitizeAppSettings(value){
 const x=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const count=Number(x.alertCount),refresh=Number(x.refreshMinutes),opacity=Number(x.overlayOpacity),speed=Number(x.voiceSpeed);
 return {
  followGps:typeof x.followGps==='boolean'?x.followGps:true,
  headingMode:isValue(x.headingMode,['course','north'])?x.headingMode:'course',
  alertCount:isValue(count,[1,2])?count:2,
  refreshMinutes:isValue(refresh,[1,3,5])?refresh:1,
  overlayOpacity:Number.isFinite(opacity)?Math.round(Math.min(100,Math.max(0,opacity))):45,
  voiceAlerts:typeof x.voiceAlerts==='boolean'?x.voiceAlerts:true,
  voiceSpeed:isValue(speed,[.7,.8,.9,1,1.1,1.2,1.3])?speed:1
 };
}
export function readAppSettings(storage){
 try{
  const raw=storage?.getItem(SETTINGS_KEY);
  return raw?sanitizeAppSettings(JSON.parse(raw)):{...DEFAULT_APP_SETTINGS};
 }catch{return {...DEFAULT_APP_SETTINGS};}
}
export function initAppSettings({document,storage,onChange=()=>{}}){
 let settings=readAppSettings(storage);
 const $=id=>document.getElementById(id);
 const controls=[
  ['settingFollowGps','followGps','checked'],
  ['settingHeadingMode','headingMode','value'],
  ['settingAlertCount','alertCount','value'],
  ['settingRefreshMinutes','refreshMinutes','value'],
  ['settingOverlayOpacity','overlayOpacity','value'],
  ['autoVoice','voiceAlerts','checked'],
  ['speed','voiceSpeed','value']
 ];
 const status=$('appSettingsStatus');
 function show(){
  for(const [id,key,field] of controls){
   const element=$(id);if(!element)continue;
   element[field]=field==='checked'?settings[key]:String(settings[key]);
  }
  const label=$('settingOverlayOpacityValue');
  if(label)label.textContent=settings.overlayOpacity+'%';
 }
 function set(next){
  settings=sanitizeAppSettings({...settings,...next});show();
  let saved=false;
  try{storage?.setItem(SETTINGS_KEY,JSON.stringify(settings));saved=!!storage;}
  catch{saved=false;}
  if(status)status.textContent=saved?'이 기기에 설정 저장됨':'브라우저 저장이 제한되어 현재 실행 중에만 적용됨';
  onChange({...settings});
 }
 for(const [id,key,field] of controls){
  const element=$(id);if(!element)continue;
  element.addEventListener(field==='checked'?'change':key==='overlayOpacity'||key==='voiceSpeed'?'input':'change',()=>{
   const value=field==='checked'?element.checked:
    ['alertCount','refreshMinutes','overlayOpacity','voiceSpeed'].includes(key)?Number(element.value):element.value;
   set({[key]:value});
  });
 }
 $('settingReset')?.addEventListener('click',()=>set(DEFAULT_APP_SETTINGS));
 if(status)status.textContent='이 기기에만 설정을 저장합니다. GPS 위치와 API 키는 저장하지 않습니다.';
 show();
 return {get:()=>({...settings}),set};
}
