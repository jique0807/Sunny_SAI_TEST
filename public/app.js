(async()=>{
'use strict';
if(window.sunnyInitialized)return;window.sunnyInitialized=true;
const {assess,AlertGate}=await import('/rules.mjs');
const {makeDemoScenario,makeDemoBreakingWarning,shouldTriggerDemoBreakingWarning,DEMO_BREAKING_TRIGGER,DEMO_SEOUL_BUSAN,demoPointAtSeconds}=await import('/demo-scenario.mjs');
const {projectRoute,roadSection,kakaoRouteLink}=await import('/map-geometry.mjs');
const {coordinatePlace,nearestSample,tileHealth}=await import('/map-state.mjs');
const {voiceCatalog}=await import('/voice-catalog.mjs');
const {pointAlong}=await import('/journey.mjs');
const {ahead,locate,RainGate}=await import('/rain-monitor.mjs');
const {setLayerReception,fetchWithReception,forecastReception}=await import('/layer-reception.mjs');
const {initKmaMapOverlay}=await import('/kma-map-overlay.mjs');
const {initNationalRainOverlay}=await import('/kma-rain-overlay.mjs');
const {createRoutePin}=await import('/route-pin.mjs');
const {initWarningOverlay}=await import('/kma-warning-overlay.mjs');
const {initRoadRiskOverlay}=await import('/road-risk-overlay.mjs');
const {initDriveGuidance,segmentMeters,routeFraction}=await import('/drive-guidance.mjs');
const {buildRouteHazards,renderHazardRail,showHazardDetail}=await import('/route-hazards.mjs');
const {resolveDrivingHeading,angleStep}=await import('/heading-up.mjs');
const {DEFAULT_APP_SETTINGS,initAppSettings}=await import('/app-settings.mjs');
const {initConnectionStatusPanel}=await import('/connection-status.mjs');
let demoOverlays=[],carOverlay=null;
// Bind the DOM selector before any top-level UI event wiring (prevent TDZ startup crash).
const $=id=>document.getElementById(id);

/* Navigation-first mobile shell. Existing services remain available behind search. */
const navSheet=document.getElementById('navSearchSheet');
const navOpen=document.getElementById('navSearchOpen');
const navClose=document.getElementById('navSearchClose');
const navSlot=document.getElementById('navSearchSlot');
const navPlanner=document.querySelector('.planner');
const navPlannerHome=navPlanner?.parentElement;
const navPlannerNext=navPlanner?.nextSibling;
function showNavSearch(show){
 if(!navSheet||!navPlanner)return;
 if(show){if(typeof studioSync==='function')studioSync();if(typeof showNavLayers==='function')showNavLayers(false);setNavTab('navRoute');ensureNavigationKakao();navSlot?.appendChild(navPlanner);const destField=document.getElementById('destination')?.closest('.field');const suggestions=document.getElementById('places');if(destField&&suggestions&&destField.nextElementSibling!==suggestions)destField.after(suggestions);navSheet.hidden=false;document.body.classList.add('nav-sheet-open');document.body.classList.remove('nav-route-open');if(!originPlace){const origin=document.getElementById('origin');if(origin)origin.value='현재 위치 확인 중…';document.getElementById('locate')?.click();}document.getElementById('destination')?.focus();}
 else{if(navPlannerHome){if(navPlannerNext?.parentNode===navPlannerHome)navPlannerHome.insertBefore(navPlanner,navPlannerNext);else navPlannerHome.insertBefore(navPlanner,navPlannerHome.firstChild);}navSheet.hidden=true;document.body.classList.remove('nav-sheet-open');}
 navOpen?.setAttribute('aria-expanded',String(show));
}
navOpen?.addEventListener('click',()=>showNavSearch(true));
navClose?.addEventListener('click',()=>showNavSearch(false));
const navLayersSheet=document.getElementById('navLayersSheet');
// Provider-rendered forecast image: standalone view until georeferencing is validated.
const rainGridOverlay=initNationalRainOverlay({
 waitForSession:()=>sessionPromise,
 onEnable:()=>{
  // Close layer settings and return to the actual underlying screen.
  if(navLayersSheet&&!navLayersSheet.hidden){
   navLayersSheet.hidden=true;
   document.getElementById('navLayers')?.setAttribute('aria-expanded','false');
   setNavTab(drivingUI.isActive()?'navRoute':
    document.getElementById('navSearchSheet')?.hidden?'navHome':'navRoute');
  }
  const oldRain=document.getElementById('navLayerrain');
  if(oldRain?.checked){oldRain.checked=false;oldRain.dispatchEvent(new Event('change'));}
  // Home may keep either Kakao road or Kakao hybrid satellite base below rainfall.
  if(!kmap||!['kakao','skyview'].includes(activeMap))ensureNavigationKakao();
 }});
function setNavTab(id){['navHome','navRoute','navLayers','navSettings'].forEach(x=>{const el=document.getElementById(x);if(el){if(x===id)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');}});document.body.dataset.sunnyNav=({navHome:'home',navRoute:'route',navLayers:'layers',navSettings:'settings'})[id]||'home';}
// Only the Home screen offers general/satellite map switching; route and layer views use Kakao.
document.body.dataset.sunnyNav='home';
function ensureNavigationKakao(){if(activeMap!=='kakao'||!kmap)void showMap('kakao');}
function showNavLayers(open){
 if(!navLayersSheet)return;
 navLayersSheet.hidden=!open;
 document.getElementById('navLayers')?.setAttribute('aria-expanded',String(open));
 if(open){showNavSearch(false);setNavTab('navLayers');ensureNavigationKakao();}
 else setNavTab(drivingUI.isActive()?'navRoute':document.getElementById('navSearchSheet')?.hidden?'navHome':'navRoute');
}
// Bottom Home and driving Home both mean a clean initial screen, rather than
// retaining the previous route, navigation progress or weather overlays.
// Safari can keep a smaller visual viewport after focusing a search field.
const mobileViewport=window.visualViewport;
function syncMobileViewport(){
 if(!mobileViewport)return;
 const root=document.documentElement;
 const style=root.style;
 // Ignore the height lost to pinch zoom when detecting the software keyboard.
 const coveredHeight=root.clientHeight-mobileViewport.height*mobileViewport.scale;
 root.classList.toggle('sunny-keyboard-open',coveredHeight>120);
 style.setProperty('--sunny-visible-left',mobileViewport.offsetLeft+'px');
 style.setProperty('--sunny-visible-top',mobileViewport.offsetTop+'px');
 style.setProperty('--sunny-visible-width',mobileViewport.width+'px');
 style.setProperty('--sunny-visible-height',mobileViewport.height+'px');
}
mobileViewport?.addEventListener('resize',syncMobileViewport);
mobileViewport?.addEventListener('scroll',syncMobileViewport);
window.addEventListener('pageshow',syncMobileViewport);
syncMobileViewport();
function goToInitialHome(){
 stopPreviewPositionWatch();
 if(drivingUI.isActive())stopRain();
 stopVoice();
 // A fresh session view also clears in-flight route searches and recovers
 // the original Kakao first-load behavior. Local saved favorites remain intact.
 window.location.reload();
}
document.getElementById('navHome')?.addEventListener('click',goToInitialHome);
document.getElementById('sunnyBrandHome')?.addEventListener('click',goToInitialHome);
document.getElementById('sunnyDriveHome')?.addEventListener('click',goToInitialHome);
document.getElementById('navRoute')?.addEventListener('click',()=>{
 // Bottom navigation remains usable even during guidance. The search sheet
 // allows a NEW destination; the dedicated reroute control keeps this trip.
 showNavLayers(false);
 if(document.getElementById('navRouteResult')?.hidden===false){document.body.classList.add('nav-route-open');showNavSearch(false);ensureNavigationKakao();}
 else showNavSearch(true);
 setNavTab('navRoute');
});
document.getElementById('navLayers')?.addEventListener('click',()=>showNavLayers(navLayersSheet?.hidden!==false));
const minimizeNavLayers=event=>{event?.preventDefault?.();event?.stopPropagation?.();showNavLayers(false);document.getElementById('navLayers')?.focus?.({preventScroll:true});};
const disableMapLayers=()=>{
 for(const id of ['navLayersnow','navLayerroad','navLayerfog','navLayerflood','navLayerWarning']){
  const control=document.getElementById(id);
  if(control?.checked){control.checked=false;control.dispatchEvent(new Event('change'));}
 }
 const rain=document.getElementById('navNationalRain');
 if(rain?.checked){rain.checked=false;rain.dispatchEvent(new Event('change'));}
};
const closeNavLayers=event=>{disableMapLayers();minimizeNavLayers(event);};
document.getElementById('navLayersnow')?.addEventListener('change',event=>{
 if(event.currentTarget.checked)showNavLayers(false);
});
document.getElementById('navLayersMinimize')?.addEventListener('click',minimizeNavLayers);
document.getElementById('navLayersReset')?.addEventListener('click',()=>{
 disableMapLayers();
 const weather=document.getElementById('navLayerWeather');
 if(weather&&!weather.checked){weather.checked=true;weather.dispatchEvent(new Event('change'));}
 const opacity=document.getElementById('navDemoOpacity');
 if(opacity){opacity.value='45';opacity.dispatchEvent(new Event('input'));}
});
document.getElementById('navLayersClose')?.addEventListener('click',closeNavLayers);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!navLayersSheet?.hidden)minimizeNavLayers(event);});
document.getElementById('navMyLocation')?.addEventListener('click',()=>requestHomeLocation(true));
let tabBeforeSettings='navHome';
document.getElementById('navSettings')?.addEventListener('click',()=>{
 tabBeforeSettings=document.querySelector('.nav-bottom-bar [aria-current=page]')?.id||'navHome';
 showNavLayers(false);showNavSearch(false);setNavTab('navSettings');
 document.getElementById('settingsOpen')?.click();
});
document.getElementById('settings')?.addEventListener('close',()=>{
 if(tabBeforeSettings==='navLayers')showNavLayers(true);
 else setNavTab(drivingUI.isActive()?'navRoute':tabBeforeSettings);
});
const routeWeatherEnabled=()=>$('navLayerWeather')?.checked!==false;
$('navLayerWeather')?.addEventListener('change',()=>{
 drawWeatherOverlays();renderRouteHazards();drivingUI.render();
 if(routeWeatherEnabled()){rainLastFetch=0;void checkRain();}
});
let floodOverlay=null,floodMap=null,floodTimer=null,floodSeq=0;
const floodControl=document.getElementById('navLayerflood'),floodStatus=document.getElementById('navFloodStatus');
function floodMessage(message){if(floodStatus)floodStatus.textContent='하천범람 지도: '+message;}
function clearFlood(){
 clearTimeout(floodTimer);floodSeq++;
 if(floodOverlay&&floodMap){try{floodMap.removeLayer(floodOverlay);}catch{}}
 floodOverlay=null;floodMap=null;
}
function floodMercator(lng,lat){const r=6378137;return [lng*20037508.342789244/180,r*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];}
function updateFlood(){
 clearFlood();
 setLayerReception('navLayerflood','waiting');
 if(!floodControl?.checked)return;
 const map=activeMap==='osm'?osmMap:activeMap==='vworld'?lmap:null;
 if(!connections.safemap){floodMessage('API 키가 연결되지 않았습니다.');return;}
 if(!map||!window.L){floodMessage('일반지도 또는 브이월드에서만 표시됩니다.');return;}
 if(map.getZoom()<9){floodMessage('확대 9단계 이상에서 표시합니다.');return;}
 const bounds=map.getBounds(),west=bounds.getWest(),east=bounds.getEast(),south=bounds.getSouth(),north=bounds.getNorth();
 if(west<123||east>133||south<32||north>40||west>=east||south>=north){floodMessage('대한민국 지도 범위로 이동하세요.');return;}
 const [x0,y0]=floodMercator(west,south),[x1,y1]=floodMercator(east,north);
 const size=map.getSize(),ratio=Math.min(1,1024/Math.max(size.x,size.y)),width=Math.max(128,Math.round(size.x*ratio)),height=Math.max(128,Math.round(size.y*ratio));
 const url=new URL('/api/safemap/wms',location.origin);
 url.searchParams.set('bbox',[x0,y0,x1,y1].join(','));url.searchParams.set('width',String(width));url.searchParams.set('height',String(height));
 const current=++floodSeq;
 floodMap=map;
 floodOverlay=L.imageOverlay(url.pathname+url.search,[[south,west],[north,east]],{opacity:Math.max(0,1-Number(document.getElementById('navDemoOpacity')?.value||45)/100),interactive:false,alt:'국가하천 하천범람 예상 위험지도'}).addTo(map);
 setLayerReception('navLayerflood','loading');
 floodMessage('하천범람 WMS 이미지 조회 중');
 floodOverlay.on('load',()=>{if(current===floodSeq){setLayerReception('navLayerflood','received');floodMessage('WMS 이미지 수신 · 실시간 침수정보 아님');}});
 floodOverlay.on('error',()=>{if(current===floodSeq){setLayerReception('navLayerflood','failed');floodMessage('지도 수신 실패 · 데이터 연결 검사에서 API 승인 상태를 확인하세요.');}});
}
function scheduleFlood(){if(!floodControl?.checked)return;clearTimeout(floodTimer);floodTimer=setTimeout(updateFlood,350);}
floodControl?.addEventListener('change',()=>{
 if(!floodControl.checked){clearFlood();floodMessage('표출 해제');return;}
 if(!['osm','vworld'].includes(activeMap)){floodMessage('일반지도로 전환합니다.');showOpenStreetMap();return;}
 updateFlood();
});
const warningOverlay=initWarningOverlay({
 query:()=>api('/api/weather-warnings',{}),
 getMap:()=>['kakao','skyview'].includes(activeMap)?kmap:null,
 ensureMap:()=>['kakao','skyview'].includes(activeMap)&&kmap?undefined:showMap('kakao'),
 onChange:()=>{drawWeatherOverlays();renderRouteHazards();drivingUI.render();}
});
const routeExtraHazards=route=>route?.demo?(route.demoHazards||[]):[...roadRiskOverlay.routeHazards(route),...warningOverlay.routeHazards(route)];
const roadRiskOverlay=initRoadRiskOverlay({
 query:roadNum=>api('/api/road-risk',{roadNum}),
 onChange:()=>{drawWeatherOverlays();renderRouteHazards();drivingUI.render();},
 getContext:()=>{
  if((activeMap==='kakao'||activeMap==='skyview')&&kmap)return{type:'kakao',map:kmap};
  if(activeMap==='osm'&&osmMap)return{type:'leaflet',map:osmMap};
  if(activeMap==='vworld'&&lmap)return{type:'leaflet',map:lmap};
  return null;
 },
 ensureMap:async()=>{
  if(['kakao','skyview'].includes(activeMap)&&kmap)return;
  if(['osm','vworld'].includes(activeMap)&&(osmMap||lmap))return;
  if(mapConfig.kakao)await showMap('kakao');
  else await showOpenStreetMap();
 }
});
const kmaMapOverlay=initKmaMapOverlay({
 query:points=>api('/api/map-forecast',{points}),
 getContext:()=>{
  try{
   if(['kakao','skyview'].includes(activeMap)&&kmap){
    const bounds=kmap.getBounds(),sw=bounds.getSouthWest(),ne=bounds.getNorthEast();
    return {type:'kakao',map:kmap,ready:kmap.getLevel()<=7,
     west:sw.getLng(),south:sw.getLat(),east:ne.getLng(),north:ne.getLat()};
   }
   const map=activeMap==='osm'?osmMap:activeMap==='vworld'?lmap:null;
   if(map){const bounds=map.getBounds();return {type:'leaflet',map,ready:map.getZoom()>=9,
    west:bounds.getWest(),south:bounds.getSouth(),east:bounds.getEast(),north:bounds.getNorth()};}
  }catch{}
  return null;
 },
 fallback:()=>showMap('kakao'),
 getActiveMap:()=>activeMap,
 format:iso=>fmt(iso)
});
function updateMapLayerOpacity(){
 const opacity=Number(document.getElementById('navDemoOpacity')?.value??45);
 const value=Math.max(0,Math.min(100,Number.isFinite(opacity)?opacity:45));
 const label=document.getElementById('navDemoOpacityValue');
 if(label)label.textContent=value+'%';
 document.documentElement.style.setProperty('--sunny-weather-layer-opacity',String(1-value/100));
 if(floodOverlay)floodOverlay.setOpacity(1-value/100);
 kmaMapOverlay.updateOpacity();
 rainGridOverlay.redraw();
 const demo=document.getElementById('navDemoRainOverlay');
 if(demo)demo.remove(); // Old non-georeferenced demonstration is no longer presented as a weather layer.
}
document.getElementById('navDemoOpacity')?.addEventListener('input',updateMapLayerOpacity);
updateMapLayerOpacity();

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let csrf='',advanced=false,mapConfig={},connections={},originPlace=null,destPlace=null,route=null,weather=null,sessionPromise=null,searchSeq=0,routeSeq=0,progress=0,timer=null,playing=false,activeAudio=null,voiceSeq=0,finishVoice=null,recognition=null,kmap=null,lmap=null,routePolyline=null,lroute=null,kmarker=null,lmarker=null,routeCurrentMarker=null,installPrompt=null;
let homePosition=null,homeLocationMarker=null,homeLocationPending=false,osmMap=null,osmMarker=null,osmRoute=null;
// A current-position pin is independent of the starting point. Never fabricate GPS.
function updateRouteCurrentMarker(){
 const p=rainPosition||homePosition;
 if(!route||route.demo||!route.vertices?.length||drivingUI.isActive()||
    !['kakao','skyview'].includes(activeMap)||!kmap||!window.kakao?.maps||
    !Number.isFinite(p?.lat)||!Number.isFinite(p?.lng)){
  routeCurrentMarker?.setMap(null);routeCurrentMarker=null;return;
 }
 const position=new kakao.maps.LatLng(p.lat,p.lng);
 const first=route.vertices[0];
 const besideStart=first&&Number.isFinite(first.lat)&&Number.isFinite(first.lng)&&
  Math.hypot((p.lat-first.lat)*111320,(p.lng-first.lng)*88000)<120;
 if(!routeCurrentMarker){
  const content=createRoutePin('current');
  content.classList.toggle('sunny-route-pin-colocated',Boolean(besideStart));
  routeCurrentMarker=new kakao.maps.CustomOverlay({map:kmap,position,
   content,xAnchor:.5,yAnchor:.3,zIndex:22});
 }else{
  routeCurrentMarker.setPosition(position);
  routeCurrentMarker.getContent?.()?.classList?.toggle('sunny-route-pin-colocated',Boolean(besideStart));
 }
 const face=routeCurrentMarker.getContent?.()?.querySelector?.('.sunny-route-pin-face');
 if(face){
  const hasBearing=Number.isFinite(p.bearing);
  face.textContent=hasBearing?'▲':'●';
  face.style.rotate=hasBearing?p.bearing+'deg':'';
 }
}
let previewPositionWatch=null;
function stopPreviewPositionWatch(){
 if(previewPositionWatch===null)return;
 navigator.geolocation?.clearWatch(previewPositionWatch);
 previewPositionWatch=null;
}
function watchPreviewPosition(){
 if(previewPositionWatch!==null||!navigator.geolocation)return;
 let previous=null,bearing=null,bearingAt=0;
 previewPositionWatch=navigator.geolocation.watchPosition(({coords,timestamp})=>{
  if($('navRouteResult')?.hidden||drivingUI.isActive()){
   stopPreviewPositionWatch();return;
  }
  if(!Number.isFinite(coords.latitude)||!Number.isFinite(coords.longitude)||!(coords.accuracy<=150))return;
  const fix={lat:coords.latitude,lng:coords.longitude,accuracy:coords.accuracy,
   speed:coords.speed,heading:coords.heading,timestamp};
  const direction=resolveDrivingHeading(previous,fix,bearing,bearingAt);
  bearing=Number.isFinite(direction.bearing)?angleStep(bearing,direction.bearing):null;
  if(direction.source==='gps'||direction.source==='motion')bearingAt=timestamp;
  if(coords.accuracy<=60)previous=fix;
  homePosition={lat:fix.lat,lng:fix.lng,bearing};
  updateRouteCurrentMarker();
 },error=>{if(error.code===1)stopPreviewPositionWatch();},{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
}
window.addEventListener('pagehide',stopPreviewPositionWatch);
function centerHomeMap(){
 if(!homePosition)return;
 if(route?.vertices?.length){updateRouteCurrentMarker();return;}
 if(kmap&&(activeMap==='kakao'||activeMap==='skyview')&&window.kakao?.maps){
  const p=new kakao.maps.LatLng(homePosition.lat,homePosition.lng);
  kmap.setCenter(p);kmap.setLevel(4);
  if(homeLocationMarker)homeLocationMarker.setMap(null);
  homeLocationMarker=new kakao.maps.Marker({map:kmap,position:p,title:'현재 위치'});
 }else if(lmap&&activeMap==='vworld'){lmap.setView([homePosition.lat,homePosition.lng],15);}else if(osmMap&&activeMap==='osm'){osmMap.setView([homePosition.lat,homePosition.lng],15);if(osmMarker)osmMarker.remove();osmMarker=L.circleMarker([homePosition.lat,homePosition.lng],{radius:8,color:'#fff',weight:3,fillColor:'#1768ed',fillOpacity:1}).addTo(osmMap).bindTooltip('현재 위치');}
}
function requestHomeLocation(manual=false){
 if(!navigator.geolocation){if(manual)toast('이 브라우저는 위치를 지원하지 않습니다.');return;}
 if(homeLocationPending)return;homeLocationPending=true;
 navigator.geolocation.getCurrentPosition(p=>{
  homeLocationPending=false;homePosition={lat:p.coords.latitude,lng:p.coords.longitude};
  centerHomeMap();
  studioSync();if(manual)toast('현재 위치로 지도를 이동했습니다.');
 },e=>{homeLocationPending=false;if(manual)toast(e.code===1?'위치 권한을 허용해주세요.':'현재 위치를 확인할 수 없습니다.');},{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
}
let activeMap='schematic',selectedSample=null,kfocus=null,lfocus=null,ksection=null,lsection=null,mapRun=0,pickTarget=null,kend=null,lend=null,tileLoaded=0,tileFailed=0;
let weatherSeq=0;

let weatherOverlays=[];
function clearWeatherOverlays(){
 for(const overlay of weatherOverlays)overlay.setMap(null);
 weatherOverlays=[];
}
function drawWeatherOverlays(){
 clearWeatherOverlays();
 if(document.getElementById('navLayerWeather')?.checked===false||!kmap||!route||route.demo||!['kakao','skyview'].includes(activeMap))return;
 const hazards=[...buildRouteHazards((routeAheadWeather||weather)?.samples),...routeExtraHazards(route)];
 for(const hazard of hazards){
  if(!Number.isFinite(hazard.lat)||!Number.isFinite(hazard.lng))continue;
  const marker=document.createElement('button');
  marker.type='button';
  marker.className='sunny-route-map-hazard';
  marker.textContent=hazard.icon;
  marker.setAttribute('aria-label',hazard.title+' 상세정보');
  marker.addEventListener('click',event=>{
   event.stopPropagation();
   const panel=drivingUI.isActive()?$('sunnyDriveHazardDetail'):$('navRouteHazardDetail');
   showHazardDetail(panel,hazard,fmt);
  });
  weatherOverlays.push(new kakao.maps.CustomOverlay({
   map:kmap,position:new kakao.maps.LatLng(hazard.lat,hazard.lng),
   content:marker,xAnchor:0.5,yAnchor:0.5,zIndex:24,clickable:true
  }));
 }
}

const providerState={kakao:'미확인',vworld:'미확인'};
const gate=new AlertGate();
const fmt=iso=>new Date(iso).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'});
const localInput=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
const drivingUI=initDriveGuidance({
 onStop:goToInitialHome,
 onReroute:()=>{void refreshRouteFromGps();},
 formatTime:fmt,
 isWeatherEnabled:routeWeatherEnabled,
 getRoadHazards:routeExtraHazards
});
// Settings are device-local and affect the actual running navigation logic.
let appPrefs={...DEFAULT_APP_SETTINGS};
const appSettings=initAppSettings({
 document,storage:(()=>{try{return window.localStorage;}catch{return null;}})(),
 onChange:next=>{
  const old=appPrefs;appPrefs=next;
  drivingUI.setPreferences(next);
  if(old.alertCount!==next.alertCount)renderRouteHazards();
  const slider=$('navDemoOpacity');
  if(slider){slider.value=String(next.overlayOpacity);updateMapLayerOpacity();}
  if(!next.voiceAlerts)stopVoice();
  if(drivingUI.isActive()){
   if(old.headingMode!==next.headingMode){
    applyDrivingMapHeading();
    if(rainPosition){
     rainPosition.directionStatus=updateDrivingMapHeading(rainPosition);
     drawGps();
     drivingUI.update(rainProgress,rainPosition,Boolean(offRouteFix));
    }
   }
   if(!old.followGps&&next.followGps){lastFollowTime=0;lastFollowPosition=null;followDrivingGps();}
  }
 }
});
appPrefs=appSettings.get();
drivingUI.setPreferences(appPrefs);
if($('navDemoOpacity')){$('navDemoOpacity').value=String(appPrefs.overlayOpacity);updateMapLayerOpacity();}
$('navDemoOpacity')?.addEventListener('input',()=>appSettings.set({overlayOpacity:Number($('navDemoOpacity').value)}));
let gpsNavArrow=null,lastFollowTime=0,lastFollowPosition=null;
let lastHeadingFix=null,navBearing=null,navBearingAt=0;
function applyDrivingMapHeading(){
 // Kakao web road labels are painted inside raster tiles. Rotating #kakaoMap
 // also rotates every street/building label, including upside-down text.
 // Keep tiles north-up in BOTH modes; only the independent GPS vehicle marker
 // rotates to the measured heading (see drawGps). Never restore CSS tile rotation
 // from an older saved 'course' preference.
 const body=document.body;
 const wasRotated=body.classList.contains('sunny-heading-up');
 body.classList.remove('sunny-heading-up');
 body.style.removeProperty('--sunny-map-rotation');
 body.style.removeProperty('--sunny-rotated-map-size');
 if(wasRotated&&kmap&&activeMap==='kakao')kmap.relayout?.();
}
function resetDrivingMapHeading(){
 document.body.classList.remove('sunny-heading-up');
 document.body.style.removeProperty('--sunny-map-rotation');
 document.body.style.removeProperty('--sunny-rotated-map-size');
 lastHeadingFix=null;navBearing=null;navBearingAt=0;
 kmap?.setDraggable?.(true);kmap?.setZoomable?.(true);
 if(kmap&&activeMap==='kakao')kmap.relayout?.();
}
function updateDrivingMapHeading(fix){
 if(!drivingUI.isActive()||!fix)return '지도 북쪽 고정';
 const candidate=resolveDrivingHeading(lastHeadingFix,fix,navBearing,navBearingAt);
 if(Number.isFinite(fix.accuracy)&&fix.accuracy<=60)lastHeadingFix={...fix};
 if(Number.isFinite(candidate.bearing)){
  navBearing=angleStep(navBearing,candidate.bearing);
  if(candidate.source==='gps'||candidate.source==='motion')navBearingAt=fix.timestamp;
 }else{
  navBearing=null;
 }
 applyDrivingMapHeading();
 if(appPrefs.headingMode==='north')return '지도 북쪽 고정 · 글자 유지';
 return Number.isFinite(navBearing)?'지도 글자 고정 · 차량 진행방향 표시':'지도 글자 고정 · GPS 방향 확인 중';
}
window.addEventListener('resize',applyDrivingMapHeading);
mobileViewport?.addEventListener('resize',applyDrivingMapHeading);
function followDrivingGps(){
 if(!drivingUI.isActive()||!appPrefs.followGps||!rainPosition||!kmap||activeMap!=='kakao'||document.hidden)return;
 const now=Date.now();
 if(lastFollowTime&&now-lastFollowTime<1400)return;
 const moved=lastFollowPosition?segmentMeters(lastFollowPosition,rainPosition):Infinity;
 if(moved<6)return;
 try{
  const position=new kakao.maps.LatLng(rainPosition.lat,rainPosition.lng);
  if(!lastFollowTime)kmap.setLevel(4);
  if(typeof kmap.panTo==='function')kmap.panTo(position);else kmap.setCenter(position);
  lastFollowTime=now;lastFollowPosition={lat:rainPosition.lat,lng:rainPosition.lng};
 }catch{/* GPS status still updates if map animation is unavailable. */}
}

// Explicit foreground GPS monitoring: no background tracking or dry-weather speech.
$('searchForm').insertAdjacentHTML('afterend','<div class="trybox"><button type="button" id="rainStart" class="primary">▶ 안내 시작</button><button type="button" id="rainStop" hidden>■ 안내 종료</button><p id="gpsStatus" role="status">GPS 시작 전 · v0.2.1</p><p id="rainStatus" role="status">실제 경로 조회 후 시작 · 화면을 켜둔 상태에서 GPS 사용</p></div>');
let routeAheadWeather=null;
let lastMatchedPoint=null,offRouteFix=null;
let rainWatch=null,rainTimer=null,rainPosition=null,rainProgress=0,rainBusy=null,rainRun=0,rainGate=new RainGate(),rainLastFetch=0,rainLastPoint=null,gpsMarker=null,gpsLeaflet=null;
function clearGpsMarker(){gpsMarker?.setMap(null);gpsMarker=null;gpsNavArrow?.setMap(null);gpsNavArrow=null;if(gpsLeaflet&&lmap)lmap.removeLayer(gpsLeaflet);gpsLeaflet=null;}
function drawGps(){
 if(!rainPosition)return;
 const p=rainPosition;
 if(Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Number.isFinite(p.accuracy)&&p.accuracy<=150)
  homePosition={lat:p.lat,lng:p.lng};
 if(kmap&&window.kakao){const pos=new kakao.maps.LatLng(p.lat,p.lng);
   if(drivingUI.isActive()){
    routeCurrentMarker?.setMap(null);routeCurrentMarker=null;
    gpsMarker?.setMap(null);gpsMarker=null;
    if(!gpsNavArrow){
     const marker=document.createElement('span');marker.className='sunny-drive-gps-pointer';marker.innerHTML='<svg viewBox="0 0 32 36" width="32" height="36" aria-hidden="true"><path d="M16 3 29 31 16 25 3 31Z" fill="#1769ed" stroke="white" stroke-width="3" stroke-linejoin="round"/></svg>';marker.setAttribute('aria-label','GPS 실시간 차량 위치');
     gpsNavArrow=new kakao.maps.CustomOverlay({map:kmap,position:pos,content:marker,xAnchor:.5,yAnchor:.5,zIndex:12});
    }else gpsNavArrow.setPosition(pos);
    const marker=gpsNavArrow.getContent?.();
    if(marker?.style){
     marker.style.rotate=(navBearing??0)+'deg';
     marker.classList.toggle('sunny-bearing-unknown',!Number.isFinite(navBearing));
    }
   }else{
    gpsNavArrow?.setMap(null);gpsNavArrow=null;
    if(route?.vertices?.length&&!route.demo){
     gpsMarker?.setMap(null);gpsMarker=null;updateRouteCurrentMarker();
    }else if(!gpsMarker)gpsMarker=new kakao.maps.Marker({map:kmap,position:pos,title:'실제 GPS 현재 위치'});
    else gpsMarker.setPosition(pos);
   }
  }
 if(lmap&&window.L){if(!gpsLeaflet)gpsLeaflet=L.circleMarker([p.lat,p.lng],{radius:9,color:'#fff',weight:3,fillColor:'#1769ff',fillOpacity:1}).bindTooltip('실제 GPS 현재 위치').addTo(lmap);else gpsLeaflet.setLatLng([p.lat,p.lng]);}
}
function stopRain(){lastMatchedPoint=null;offRouteFix=null;lastRerouteAt=0;routeAheadWeather=null;rerouteBusy=false;drivingUI.stop();resetDrivingMapHeading();lastFollowTime=0;lastFollowPosition=null;rainRun++;if(rainWatch!==null)navigator.geolocation?.clearWatch(rainWatch);rainWatch=null;clearInterval(rainTimer);rainTimer=null;rainPosition=null;rainProgress=0;rainBusy=null;rainLastFetch=0;rainLastPoint=null;rainGate=new RainGate();clearGpsMarker();$('rainStop').hidden=true;$('rainStart').disabled=false;$('rainStatus').textContent='비 예보 음성 안내 종료';}
function remainingRoutePoints(){
 if(!drivingUI.isActive()||!lastMatchedPoint)return route?.vertices??[];
 return [lastMatchedPoint,...route.rainPath.filter(p=>p.seconds>lastMatchedPoint.seconds)];
}
function drawRemainingRoute(){
 if(!kmap||!lastMatchedPoint||!routePolyline?.setPath)return;
 const points=remainingRoutePoints();
 routePolyline.setPath(points.map(p=>new kakao.maps.LatLng(p.lat,p.lng)));
}
async function checkRain(){
 if(!rainPosition||!route||route.demo||document.hidden)return;
 const now=Date.now();if(now-rainPosition.timestamp>60000){$('gpsStatus').textContent='GPS 수신 지연 · 마지막 위치가 1분 이상 오래됨';return;}
 const found=locate(route.rainPath||[],rainPosition,Math.max(0,rainProgress-30));
 const threshold=Math.max(150,rainPosition.accuracy*3);
 if(!found||found.meters>threshold){
  $('gpsStatus').textContent='GPS 수신됨 · 경로 이탈 확인 중';
  drivingUI.update(rainProgress,rainPosition,true);followDrivingGps();
  if(rainPosition.accuracy>60||now-rainPosition.timestamp>15000){offRouteFix=null;return;}
  const time=rainPosition.timestamp;
  if(!offRouteFix||time-offRouteFix.last>15000)offRouteFix={first:time,last:time,count:1};
  else if(time>offRouteFix.last){offRouteFix.last=time;offRouteFix.count++;}
  if(offRouteFix.count>=3&&time-offRouteFix.first>=6000)void refreshRouteFromGps(true);
  return;
 }
 offRouteFix=null;
 if(found.seconds>=rainProgress){
  rainProgress=found.seconds;
  if(rainPosition.accuracy<=60){lastMatchedPoint=found;drawRemainingRoute();}
 }
 drawGps();drivingUI.update(rainProgress,rainPosition);followDrivingGps();
 $('gpsStatus').textContent='GPS '+fmt(rainPosition.timestamp)+' · 오차 ±'+Math.round(rainPosition.accuracy)+'m · '+rainPosition.lat.toFixed(5)+', '+rainPosition.lng.toFixed(5)+' · 경로와 '+Math.round(found.meters)+'m';
 if(!routeWeatherEnabled())return;
 if(!connections.kma){$('rainStatus').textContent='GPS 작동 중 · 기상청 키 미설정으로 비 예보 조회 대기';return;}
 const moved=rainLastPoint?Math.hypot((rainPosition.lat-rainLastPoint.lat)*111320,(rainPosition.lng-rainLastPoint.lng)*88000):Infinity;
 if(rainBusy!==null||rainLastFetch&&(now-rainLastFetch<appPrefs.refreshMinutes*60000||now-rainLastFetch<300000&&moved<1000))return;
 const samples=ahead(route.rainPath,rainProgress,now);if(!samples.length)return;
 const currentRoute=route,run=rainRun;rainBusy=run;rainLastFetch=now;rainLastPoint={...rainPosition};
 setLayerReception('navLayerWeather','loading');
 try{const d=await api('/api/weather',{provider:'kma-ultra',samples});if(run!==rainRun||route!==currentRoute||!routeWeatherEnabled()||document.hidden)return;
  // Discard forecasts fetched for a position the vehicle has already left.
  if(!rainPosition||Math.hypot((rainPosition.lat-rainLastPoint.lat)*111320,(rainPosition.lng-rainLastPoint.lng)*88000)>1000){setLayerReception('navLayerWeather','waiting');return;}
  setLayerReception('navLayerWeather',forecastReception(d.samples,p=>p.status==='forecast'));
  routeAheadWeather={...d,samples:d.samples.map((p,i)=>({...samples[i],...p,seconds:samples[i]?.seconds??rainProgress}))};
  drivingUI.setAhead(routeAheadWeather.samples);drawWeatherOverlays();const text=rainGate.take(d.samples,Date.now());$('rainStatus').textContent='초단기예보 '+fmt(d.fetchedAt)+' · '+d.samples.filter(p=>p.status==='forecast').length+'/'+samples.length+' 구간 · 비가 없거나 변화 없으면 음성 생략';
  if(text)reply(text,appPrefs.voiceAlerts);
 }catch(e){if(run===rainRun&&route===currentRoute){setLayerReception('navLayerWeather',e.reception||'failed');$('rainStatus').textContent='GPS와 별도: '+e.message;}}finally{if(rainBusy===run)rainBusy=null;}
}
function startRainGuidance(){
 if(!route||route.demo||!route.rainPath?.length){toast('먼저 실제 차량 경로를 조회해주세요.');return;}
 if(!window.isSecureContext){toast('GPS는 HTTPS 주소에서 사용해주세요.');return;}
 if(!navigator.geolocation){toast('이 기기는 GPS 위치를 지원하지 않는 환경입니다.');return;}
 stopRain();
 const rerouteButton=$('sunnyDriveReroute');if(rerouteButton)rerouteButton.disabled=false;
 stopPreviewPositionWatch();
 rainGridOverlay.disableRouteRadar();drivingUI.start(route,weather);setNavTab('navRoute');$('navRouteResult').hidden=true;document.body.classList.remove('nav-route-open');void showMap('kakao');const run=rainRun;$('rainStart').disabled=true;$('rainStop').hidden=false;$('gpsStatus').textContent='GPS 권한·위치 수신 대기';$('rainStatus').textContent='비 예보 대기';
 rainWatch=navigator.geolocation.watchPosition(p=>{
  if(run!==rainRun)return;
  if(!Number.isFinite(p.coords.latitude)||!Number.isFinite(p.coords.longitude)||!Number.isFinite(p.coords.accuracy)||p.coords.accuracy>200){$('gpsStatus').textContent='GPS 정확도 부족 · 실외에서 200m 이내 위치 수신 대기';return;}
  rainPosition={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,heading:p.coords.heading,speed:p.coords.speed,timestamp:p.timestamp};rainPosition.directionStatus=updateDrivingMapHeading(rainPosition);drawGps();checkRain();
 },e=>{if(run!==rainRun)return;if(e.code===1){stopRain();$('gpsStatus').textContent='GPS 권한 거부 · 브라우저와 휴대폰 위치 권한 확인 필요';}else $('gpsStatus').textContent=e.code===3?'GPS 일시 시간초과 · 감시 유지, 재수신 대기':'GPS 위치 수신 불가 · 감시 유지, 실외에서 재수신 대기';},{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
 rainTimer=setInterval(checkRain,10000);
}
// Manual and automatic reroutes share the same in-flight and cooldown guards.
let rerouteBusy=false,lastRerouteAt=0;
async function refreshRouteFromGps(automatic=false){
 if(rerouteBusy||!drivingUI.isActive()||rainWatch===null)return;
 if(!route||route.demo||!destPlace||!rainPosition){if(!automatic)toast('GPS·목적지를 먼저 확인해주세요.');return;}
 if(!Number.isFinite(rainPosition.accuracy)||rainPosition.accuracy>60||
    Date.now()-rainPosition.timestamp>30000){
  toast('GPS 정확도가 충분하지 않습니다. 실외에서 위치를 다시 확인하세요.');return;
 }
 if(lastRerouteAt&&Date.now()-lastRerouteAt<30000){
  if(!automatic)toast('경로를 방금 조회했습니다. 잠시 후 다시 시도해주세요.');return;
 }
 const previous=route,destination=destPlace,location={...rainPosition},sessionRun=rainRun;
 rerouteBusy=true;lastRerouteAt=Date.now();
 const button=$('sunnyDriveReroute');if(button)button.disabled=true;
 $('gpsStatus').textContent='현재 GPS 기준 경로 재탐색 중…';
 try{
  const origin={lat:location.lat,lng:location.lng,name:'현재 위치'};
  const result=await api('/api/route',{
   origin,destination,departure:new Date().toISOString()
  });
  // A newer user route or stopped guidance invalidates this in-flight reply.
  if(!drivingUI.isActive()||rainWatch===null||sessionRun!==rainRun||route!==previous||destPlace!==destination)return;
  if(automatic&&!offRouteFix)return;
  if(!result.rainPath?.length||!result.vertices?.length)throw Error('새 도로 좌표를 받지 못했습니다.');
  originPlace=origin;route={...result,demo:false};weather=null;routeAheadWeather=null;
  lastMatchedPoint=null;offRouteFix=null;rainProgress=0;rainLastFetch=0;rainLastPoint=null;rainGate=new RainGate();
  const updatedRoute=route;
  drivingUI.start(route,null);renderRoute();
  await showMap('kakao',{preserveCamera:true});
  if(!drivingUI.isActive()||sessionRun!==rainRun||route!==updatedRoute||!rainPosition)return;
  void loadWeather();
  rainPosition.directionStatus=updateDrivingMapHeading(rainPosition);
  drawGps();void checkRain();
  toast('현재 GPS 위치 기준으로 차량 경로와 기상예보를 새로 조회했습니다.');
 }catch(e){
  if(sessionRun!==rainRun||route!==previous)return;
  $('gpsStatus').textContent='재탐색 실패 · 기존 경로 유지';
  toast('경로 재탐색 실패 · '+String(e.message||'네트워크 상태 확인'));
 }finally{if(sessionRun===rainRun){rerouteBusy=false;if(button)button.disabled=false;}}
}
$('rainStart').onclick=startRainGuidance;
$('rainStop').onclick=()=>goToInitialHome();
document.addEventListener('visibilitychange',()=>{if(rainWatch===null)return;if(document.hidden){stopVoice();$('gpsStatus').textContent='화면 숨김 · 안내 일시정지 (백그라운드 작동 보장 안 됨)';}else{rainLastFetch=0;checkRain();}});

$('departure').value=localInput(new Date(Date.now()+120000));$('departure').min=localInput(new Date());$('departure').max=localInput(new Date(Date.now()+86400000));
function toast(t){$('toast').textContent=t;$('toast').hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>$('toast').hidden=true,5500);}
function reply(t,voice=false){$('reply').textContent=t;if(voice)speak(t);}
function stopVoice(){voiceSeq++;window.speechSynthesis?.cancel();if(activeAudio){activeAudio.pause();URL.revokeObjectURL(activeAudio.src);activeAudio=null;}finishVoice?.();finishVoice=null;}
async function speak(t){stopVoice();const seq=voiceSeq;$('voiceStatus').textContent='써니가 안내하고 있어요.';
 if(advanced){try{const d=await api('/api/voice/speak',{text:t,rate:Number($('speed').value),voiceName:$('voiceChoice').value||undefined,provider:$('voiceProvider').value});if(seq!==voiceSeq)return;const blob=new Blob([Uint8Array.from(atob(d.audioContent),c=>c.charCodeAt(0))],{type:d.mimeType||'audio/mpeg'});const a=new Audio(URL.createObjectURL(blob));activeAudio=a;await new Promise((resolve,reject)=>{finishVoice=resolve;a.onended=resolve;a.onerror=reject;a.play().catch(reject);});if(activeAudio===a){URL.revokeObjectURL(a.src);activeAudio=null;}if(seq===voiceSeq)$('voiceStatus').textContent='선택한 '+d.voiceName+' 목소리로 재생했어요.';return;}catch(e){if(seq!==voiceSeq)return;const message=e.message||'오디오 재생에 실패했습니다. 미리듣기를 다시 눌러주세요.';$('keyStatus').textContent=message;$('voiceStatus').textContent=message;toast(message);return;}}
 if(seq!==voiceSeq)return;if(!window.speechSynthesis){$('voiceStatus').textContent='음성을 지원하지 않는 기기입니다. 화면 안내를 확인해주세요.';return;}
 const u=new SpeechSynthesisUtterance(t);u.lang='ko-KR';u.rate=Number($('speed').value);u.onend=()=>{if(seq===voiceSeq)$('voiceStatus').textContent='안내를 마쳤어요.';};u.onerror=()=>{if(seq===voiceSeq)$('voiceStatus').textContent='음성 재생이 중단됐어요. 다시 듣기를 눌러주세요.';};speechSynthesis.speak(u);
}
async function session(){const r=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);csrf=d.csrf;advanced=d.connected;if(d.voiceProvider)$('voiceProvider').value=d.voiceProvider;loadVoices();mapConfig=d.mapConfig;connections=d.connections;kmaMapOverlay.availability(connections.kma);roadRiskOverlay.setAvailable(connections.roadRisk);if(floodControl){floodControl.disabled=!connections.safemap;if(!connections.safemap){floodControl.checked=false;clearFlood();floodMessage('SAFEMAP_API_KEY 미설정');}else floodMessage('서버 키 등록됨 · 실제 WMS 응답은 검사 전');}keyStatus();connectionStatus();return d;}
function keyStatus(){$('keyStatus').textContent=advanced?'암호화해 임시 연결됨 · 최대 30분 · 재생 시 사용 가능 여부 확인':'연결 안 됨 · 기기 기본 음성을 사용합니다.';}
async function api(path,data,method='POST',retried=false){await sessionPromise;if(!csrf)throw Error('보안 세션이 준비되지 않았습니다. 새로고침 후 다시 시도해주세요.');const r=await fetchWithReception(fetch,path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:data?JSON.stringify(data):undefined,cache:'no-store'});let d;try{d=await r.json();}catch{throw Error('서버 응답을 확인하지 못했습니다.');}if(r.status===401){csrf='';advanced=false;keyStatus();if(!retried&&['/api/weather','/api/route','/api/search','/api/map-health','/api/map-forecast','/api/road-risk','/api/weather-warnings'].includes(path)){sessionPromise=session();await sessionPromise;return api(path,data,method,true);}}if(!r.ok)throw Object.assign(Error(d.error||'요청을 처리하지 못했습니다.'),{reception:d.reception});return d;}
function connectionStatus(){$('weatherConnection').textContent=connections.kma?'기상청 서버 키 설정됨 · 실제 응답은 경로 조회 후 확인':'기상청 키 설정 대기 · 자동 모드에서는 Open-Meteo 예보를 표시합니다.';const rows=[['카카오 장소 검색·차량 경로',connections.route?'키 설정됨 · 실제 호출 확인 필요':'운영자 REST 키 필요'],['카카오 지도',mapConfig.kakao?'키 설정됨 · '+providerState.kakao:'운영자 JavaScript 키 필요'],['브이월드 위성 배경',mapConfig.vworld?'키 설정됨 · '+providerState.vworld:'운영자 키 필요'],['기상청 API허브',connections.kma?'서버 키 설정됨 · 경로 선택 후 호출 확인':'KMA_API_KEY 설정 대기'],['기상청 도로살얼음·저시정',connections.roadRisk?'서버 키 설정됨 · 위험정보 ZIP 별도 승인 및 위치정보 검증 필요':'KMA_API_KEY 설정 대기'],['생활안전지도 국가하천 WMS',connections.safemap?'서버 키 설정됨 · 실제 응답 검증 필요':'SAFEMAP_API_KEY 설정 대기'],['대체 기상예보','Open-Meteo · 출처 별도 표시'],['GK2A·공사·통제·지형','미연결 · 실시간 판단에 사용하지 않음']];$('connectionList').innerHTML=rows.map(([a,b])=>`<div class="connection-row"><b>${escape(a)}</b><span>${escape(b)}</span></div>`).join('');}
sessionPromise=session().catch(e=>{$('keyStatus').textContent=e.message;connectionStatus();});
// The environment settings now contain a real, read-only source health dashboard.
// Tests only run when the user presses refresh, avoiding extra provider/API usage.
const connectionPanel=initConnectionStatusPanel({document,waitForSession:async()=>{await sessionPromise;}});
void sessionPromise.then(session=>connectionPanel.setSession(session));
$('checkDataSources').onclick=async()=>{
 const button=$('checkDataSources'),target=$('dataHealth');button.disabled=true;target.textContent='기상청·생활안전지도 서버에 실제 조회 중입니다.';
 try{const result=await api('/api/data-health',{});target.replaceChildren();
  for(const [label,name]of [['kma','기상청'],['safemap','생활안전지도 하천범람']]){
   const item=result.sources?.[label]||{state:'unavailable'};
   const p=document.createElement('p');p.textContent=name+': '+(item.state==='received'?'응답 확인':item.state==='missing'?'키 미설정':'응답 미확인')+' · '+(item.message||'')+' · '+fmt(result.checkedAt);target.appendChild(p);
   if(label==='safemap'&&floodControl){floodControl.disabled=item.state!=='received';if(item.state!=='received'){floodControl.checked=false;clearFlood();floodMessage('API 응답 확인 전 · 표출 차단');}else floodMessage('WMS 이미지 수신 확인 · 범람 예상 영역만 표출');}
  }
 }catch(e){target.textContent='실제 응답 검사 실패: '+e.message;}finally{button.disabled=false;}
};
$('checkMaps').onclick=async()=>{$('checkMaps').disabled=true;$('mapHealth').textContent='현재 서비스 도메인으로 SDK·위성 응답을 검사하고 있어요.';try{const d=await api('/api/map-health',{});$('mapHealth').replaceChildren();const p=document.createElement('p');p.textContent='등록할 서비스 도메인: '+d.origin;$('mapHealth').append(p);for(const check of d.checks){const row=document.createElement('p');row.textContent=check.name+': '+check.message;$('mapHealth').append(row);}const caution=document.createElement('small');caution.textContent=d.caution+' · 검사 '+fmt(d.checkedAt);$('mapHealth').append(caution);}catch(e){$('mapHealth').textContent=e.message;}finally{$('checkMaps').disabled=false;}};
$('settingsOpen').onclick=()=>$('settings').showModal();$('sourcesOpen').onclick=()=>$('sources').showModal();$('settings').addEventListener('close',()=>$('googleKey').value='');
$('repeat').onclick=()=>speak($('reply').textContent);$('stop').onclick=()=>{stopVoice();recognition?.abort();$('voiceStatus').textContent='음성을 멈췄어요.';};
$('connect').onclick=async()=>{const key=$('googleKey').value.trim();$('googleKey').value='';$('connect').disabled=true;try{const d=await api('/api/voice/key',{key,provider:$('voiceProvider').value});advanced=d.connected;if(d.provider)$('voiceProvider').value=d.provider;keyStatus();$('keyStatus').textContent=d.message;await loadVoices();}catch(e){$('keyStatus').textContent=e.message;}finally{$('connect').disabled=false;}};
$('disconnect').onclick=async()=>{try{await api('/api/voice/key',null,'DELETE');advanced=false;stopVoice();keyStatus();loadVoices();}catch(e){$('keyStatus').textContent=e.message;}};
function loadVoices(){const provider=$('voiceProvider').value,voices=voiceCatalog(provider);$('voiceChoice').replaceChildren();for(const v of voices){const o=document.createElement('option');o.value=v.name;o.textContent=v.label;$('voiceChoice').append(o);}let saved;try{saved=localStorage.getItem('sunnyVoice:'+provider);}catch{}if(voices.some(v=>v.name===saved))$('voiceChoice').value=saved;$('voiceChoice').disabled=false;}
$('voiceProvider').onchange=()=>{stopVoice();loadVoices();$('keyStatus').textContent=advanced?'API 종류를 변경했어요. 연결한 키가 이 서비스를 지원하는지 미리듣기로 확인하세요.':'발급받은 서비스에 맞는 키를 연결해주세요.';};
$('voiceChoice').onchange=()=>{stopVoice();try{localStorage.setItem('sunnyVoice:'+$('voiceProvider').value,$('voiceChoice').value);}catch{}$('keyStatus').textContent=$('voiceChoice').selectedOptions[0].textContent+' 선택 · 미리듣기로 확인하세요.';};
$('previewVoice').onclick=async()=>{$('previewVoice').disabled=true;try{await speak('안녕하세요, 써니예요. 가는 길의 날씨를 함께 살펴볼게요. 잠시 뒤 비가 예상돼요. 여유 있게 이동하세요.');}finally{$('previewVoice').disabled=false;}};
loadVoices();
let suggestionTimer=null,suggestionField=null,suggestionQuery='',suggestionPlaces=[],suggestionRun=0;
const searchList=$('places');
$('originSearchToggle')?.addEventListener('click',()=>{const input=$('origin');if(!input)return;input.readOnly=false;input.value='';originPlace=null;input.focus();const suggestions=$('places');input.closest('.field')?.after(suggestions);});
searchList.setAttribute('role','listbox');searchList.setAttribute('aria-label','장소 검색 결과');
for(const field of ['origin','destination']){$(field).setAttribute('autocomplete','off');$(field).setAttribute('aria-controls','places');$(field).setAttribute('aria-autocomplete','list');}
function clearSuggestions(){clearTimeout(suggestionTimer);suggestionRun++;suggestionField=null;suggestionQuery='';suggestionPlaces=[];searchList.replaceChildren();}
const recentKey='sunny-nav-recent-v1',favoritesKey='sunny-nav-favorites-v1';
const queriesKey='sunny-nav-search-queries-v1';
function readQueries(){try{const a=JSON.parse(localStorage.getItem(queriesKey)||'[]');return Array.isArray(a)?a.filter(x=>typeof x==='string').slice(0,10):[];}catch{return [];}}
function renderQueries(){const list=$('navQueryHistoryList'),section=$('navQueryHistorySection');if(!list)return;list.replaceChildren();const a=readQueries();if(section)section.hidden=!a.length;for(const q of a){const b=document.createElement('button');b.type='button';b.textContent='⌕  '+q;b.onclick=()=>{$('destination').value=q;destPlace=null;$('destination').focus();findSuggestions('destination',q);};list.append(b);}}
function rememberQuery(q){q=String(q||'').trim();if(q.length<2)return;try{localStorage.setItem(queriesKey,JSON.stringify([q,...readQueries().filter(x=>x!==q)].slice(0,10)));}catch{}renderQueries();}
$('navClearQueries')?.addEventListener('click',()=>{try{localStorage.removeItem(queriesKey);}catch{}renderQueries();});
renderQueries();

/* Sunny Route Studio: a new search experience with explicit start/end choices. */
const studioQuery=$('studioQuery'),studioResults=$('studioResults');
let studioTimer=null,studioRun=0,studioFavoriteMode=false;
function studioSync(){const o=$('studioOriginLabel'),d=$('studioDestLabel');if(o)o.textContent=originPlace?.name||'현재 위치 확인 중';if(d)d.textContent=destPlace?.name||'목적지를 선택하세요';}
function studioCurrent(){if(homePosition&&Number.isFinite(homePosition.lat)&&Number.isFinite(homePosition.lng))return{name:'현재 위치',lat:homePosition.lat,lng:homePosition.lng,address:'GPS 현재 위치'};if(originPlace?.name==='현재 위치')return originPlace;return null;}
function studioSet(field,p){if(!p)return;setPlace(field,p);if(field==='destination')rememberDestination(p);studioFavoriteMode=false;studioQuery.value='';studioResults.hidden=true;studioSync();renderFavorites();}
function studioButton(label,handler,secondary=false){const b=document.createElement('button');b.type='button';b.className='studio-action'+(secondary?' secondary':'');b.textContent=label;b.addEventListener('click',handler);return b;}
function studioRow(p,isCurrent=false){const row=document.createElement('div');row.className='studio-result-row';const info=document.createElement('div');info.className='studio-result-info';const name=document.createElement('strong');name.textContent=p.name;const addr=document.createElement('small');addr.textContent=isCurrent?'GPS 기반 현재 위치':(p.address||'주소 정보 없음');info.append(name,addr);const actions=document.createElement('div');actions.className='studio-result-actions';if(studioFavoriteMode&&!isCurrent){actions.append(studioButton('저장',()=>{toggleFavorite(p);studioFavoriteMode=false;studioQuery.value='';studioResults.hidden=true;renderFavorites();}));}else{actions.append(studioButton('출발',()=>{if(isCurrent){const pos=studioCurrent();if(!pos){toast('현재 위치를 확인한 후 다시 선택해주세요.');$('locate')?.click();return;}p=pos;}studioSet('origin',p);},true),studioButton('도착',()=>{if(isCurrent){const pos=studioCurrent();if(!pos){toast('현재 위치를 확인한 후 다시 선택해주세요.');$('locate')?.click();return;}p=pos;}studioSet('destination',p);}));}row.append(info,actions);return row;}
function studioShow(places=[],status=''){studioResults.replaceChildren();studioResults.hidden=false;studioResults.append(studioRow(studioCurrent()||{name:'현재 위치'},true));if(status){const note=document.createElement('p');note.className='studio-search-status';note.textContent=status;studioResults.append(note);}for(const p of places.slice(0,8))studioResults.append(studioRow(p));}
async function studioSearch(q){const run=++studioRun;studioShow([],'검색 중…');try{const d=await api('/api/search',{query:q});if(run!==studioRun||studioQuery.value.trim()!==q)return;studioShow(d.places||[],(d.places||[]).length?'':'일치하는 장소가 없습니다. 다른 검색어를 입력해주세요.');}catch(e){if(run===studioRun)studioShow([],'검색 오류: '+e.message);}}
studioQuery?.addEventListener('input',()=>{clearTimeout(studioTimer);studioRun++;const q=studioQuery.value.trim();if(q.length<2){studioShow([],q?'두 글자 이상 입력해주세요.':'');return;}studioTimer=setTimeout(()=>studioSearch(q),300);});
studioQuery?.addEventListener('focus',()=>{if(!studioResults.hidden)return;const q=studioQuery.value.trim();if(q.length>=2)studioSearch(q);else studioShow();});
$('studioSearchClear')?.addEventListener('click',()=>{studioQuery.value='';studioRun++;studioShow();studioQuery.focus();});
$('studioSwap')?.addEventListener('click',()=>{if(!originPlace||!destPlace){toast('출발지와 목적지를 모두 선택한 뒤 바꿀 수 있습니다.');return;}const prev=originPlace;originPlace=destPlace;destPlace=prev;$('origin').value=originPlace.name;$('destination').value=destPlace.name;studioSync();});
$('studioRouteSearch')?.addEventListener('click',()=>{if(!originPlace){const pos=studioCurrent();if(pos){originPlace=pos;$('origin').value=pos.name;}else{toast('출발지를 선택하거나 현재 위치 권한을 허용해주세요.');studioQuery.focus();return;}}if(!destPlace){toast('목적지를 먼저 선택해주세요.');studioQuery.focus();return;}studioSync();$('searchForm')?.requestSubmit();});
$('origin')?.addEventListener('change',studioSync);$('destination')?.addEventListener('change',studioSync);
function readFavorites(){try{const a=JSON.parse(localStorage.getItem(favoritesKey)||'[]');return Array.isArray(a)?a.filter(p=>p&&typeof p.name==='string'&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)).slice(0,6):[];}catch{return [];}}
function saveFavorites(a){try{localStorage.setItem(favoritesKey,JSON.stringify(a.slice(0,6)));}catch{}renderFavorites();}
function toggleFavorite(p){const a=readFavorites(),exists=a.some(x=>x.lat===p.lat&&x.lng===p.lng);if(!exists&&a.length>=6){toast('즐겨찾기는 최대 6개입니다. 기존 장소를 해제한 뒤 추가해주세요.');return;}saveFavorites(exists?a.filter(x=>x.lat!==p.lat||x.lng!==p.lng):[{name:p.name,address:p.address||'',lat:p.lat,lng:p.lng},...a]);}
function placeItem(p){const row=document.createElement('div');row.className='nav-place-row';const b=document.createElement('button');b.type='button';b.className='nav-place-pick';const name=document.createElement('strong'),addr=document.createElement('small');name.textContent=p.name;addr.textContent=p.address||'주소 정보 없음';b.append(name,addr);b.onclick=()=>{setPlace('destination',p);$('destination').focus();};const fav=document.createElement('button');fav.type='button';fav.className='nav-favorite-toggle';const marked=readFavorites().some(x=>x.lat===p.lat&&x.lng===p.lng);fav.textContent=marked?'★':'☆';fav.setAttribute('aria-label',marked?'즐겨찾기 해제':'즐겨찾기 추가');fav.setAttribute('aria-pressed',String(marked));fav.onclick=()=>toggleFavorite(p);row.append(b,fav);return row;}
function renderFavorites(){const list=$('navFavoritesList'),section=$('navFavoritesSection');if(!list)return;list.replaceChildren();const items=readFavorites();if(section)section.hidden=false;items.forEach((p,i)=>{const tile=document.createElement('div');tile.className='nav-favorite-tile studio-favorite-tile';const name=document.createElement('strong');name.textContent=p.name;const actions=document.createElement('div');actions.className='studio-favorite-actions';actions.append(studioButton('출발',()=>studioSet('origin',p),true),studioButton('도착',()=>studioSet('destination',p)));const remove=document.createElement('button');remove.type='button';remove.className='studio-favorite-remove';remove.textContent='×';remove.setAttribute('aria-label',p.name+' 즐겨찾기 삭제');remove.onclick=()=>toggleFavorite(p);tile.append(name,actions,remove);list.append(tile);});for(let i=items.length;i<6;i++){const b=document.createElement('button');b.type='button';b.className='nav-favorite-empty';b.innerHTML='<span aria-hidden="true">＋</span><small>즐겨찾기 '+(i+1)+'</small>';b.setAttribute('aria-label','즐겨찾기 '+(i+1)+' 추가할 장소 검색');b.onclick=()=>{studioFavoriteMode=true;studioQuery.value='';studioShow([],'저장할 장소를 검색한 뒤 저장 버튼을 누르세요.');studioQuery.focus();studioQuery.scrollIntoView({block:'center',behavior:'smooth'});};list.append(b);}renderRecent();}
function readRecent(){try{const data=JSON.parse(localStorage.getItem(recentKey)||'[]');return Array.isArray(data)?data.filter(p=>p&&typeof p.name==='string'&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)).slice(0,3):[];}catch{return [];}}
function renderRecent(){const list=$('navRecentList'),section=$('navRecentSection');if(!list)return;list.replaceChildren();const items=readRecent();if(section)section.hidden=!items.length;items.forEach(p=>{const row=studioRow(p);row.classList.add('studio-recent-row');list.append(row);});}
function rememberDestination(p){if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng))return;try{const next=[{name:p.name,address:p.address||'',lat:p.lat,lng:p.lng},...readRecent().filter(x=>x.lat!==p.lat||x.lng!==p.lng)].slice(0,3);localStorage.setItem(recentKey,JSON.stringify(next));}catch{}renderRecent();}
$('navClearRecent')?.addEventListener('click',()=>{try{localStorage.removeItem(recentKey);}catch{}renderRecent();});
renderFavorites();
function setPlace(field,p){if(field==='origin'){originPlace=p;$('origin').readOnly=true;}else{rememberQuery($(field).value||p.name);destPlace=p;}$(field).value=p.name;clearSuggestions();}
function showSuggestions(field,places,select){
 searchList.replaceChildren();const title=document.createElement('li');title.className='search-result-title';title.textContent=(field==='origin'?'출발지':'도착지')+' 검색 결과 · 주소 확인 후 선택';searchList.append(title);
 if(!places.length){const li=document.createElement('li');li.textContent='검색 결과가 없습니다. 지역명이나 도로명 주소를 입력해주세요.';searchList.append(li);return;}
 places.forEach(p=>{const li=document.createElement('li');li.className='nav-suggestion-row';const row=placeItem(p);const pick=row.querySelector('.nav-place-pick');pick.setAttribute('role','option');pick.onclick=()=>select(p);li.append(row);searchList.append(li);});
}
async function findSuggestions(field,q){
 const run=++suggestionRun;suggestionField=field;suggestionQuery=q;suggestionPlaces=[];
 searchList.replaceChildren();const li=document.createElement('li');li.className='search-result-title';li.textContent='검색 중…';searchList.append(li);
 try{const d=await api('/api/search',{query:q});if(run!==suggestionRun||$(field).value.trim()!==q)return;suggestionPlaces=d.places||[];showSuggestions(field,suggestionPlaces,p=>setPlace(field,p));}
 catch(e){if(run===suggestionRun){searchList.replaceChildren();const li=document.createElement('li');li.textContent='검색 실패: '+e.message;searchList.append(li);}}
}
for(const field of ['origin','destination']){
 $(field).addEventListener('input',()=>{if(field==='origin'){originPlace=null;$('origin').closest('.field')?.after(searchList);}else{destPlace=null;$('destination').closest('.field')?.after(searchList);}clearSuggestions();const q=$(field).value.trim();if(q.length<2)return;suggestionTimer=setTimeout(()=>findSuggestions(field,q),350);});
 $(field).addEventListener('focus',()=>{const q=$(field).value.trim();if(q.length>=2&&!(field==='origin'?originPlace:destPlace)){clearSuggestions();suggestionTimer=setTimeout(()=>findSuggestions(field,q),200);}});
 $(field).addEventListener('keydown',e=>{if(e.key==='Escape')clearSuggestions();if(e.key==='ArrowDown'){const b=searchList.querySelector('button');if(b){e.preventDefault();b.focus();}}});
}
async function choose(field){
 const q=$(field).value.trim(),coordinate=coordinatePlace(q);if(coordinate){clearSuggestions();return coordinate;}
 if(!q){$(field).focus();throw Error((field==='origin'?'출발지':'도착지')+'를 입력해주세요.');}
 clearTimeout(suggestionTimer);
 const d=suggestionField===field&&suggestionQuery===q&&suggestionPlaces.length?{places:suggestionPlaces}:await api('/api/search',{query:q});
 const places=d.places||[];if(!places.length){$(field).focus();throw Error('장소를 찾지 못했습니다. 지역명이나 도로명 주소를 입력해주세요.');}
 const exact=places.filter(p=>p.name===q||p.address===q);
 if(exact.length===1){setPlace(field,exact[0]);return exact[0];}
 const token=++searchSeq;reply((field==='origin'?'출발지':'도착지')+' 검색 결과에서 장소를 선택해주세요.');
 return new Promise((resolve,reject)=>showSuggestions(field,places,p=>{if(token!==searchSeq){reject(Error('검색이 변경되었습니다.'));return;}setPlace(field,p);resolve(p);}));
}
$('searchForm').onsubmit=async e=>{e.preventDefault();stopRain();if(playing)return;const run=++routeSeq;$('routeSearch').disabled=true;pauseDrive();try{if(!originPlace)originPlace=await choose('origin');if(!destPlace)destPlace=await choose('destination');rememberQuery($('destination').value);if(run!==routeSeq)return;const departure=new Date($('departure').value).toISOString();reply('차량 경로와 예상 통과시각을 확인하고 있어요.');const d=await api('/api/route',{origin:originPlace,destination:destPlace,departure});if(run!==routeSeq)return;route={...d,demo:false};weather=null;progress=0;gate.reset();renderRoute();rememberDestination(destPlace);showNavSearch(false);showNavRouteResult();reply('차량 경로를 찾았어요. 구간별 예보를 확인합니다.');await Promise.all([loadWeather(),showMap('kakao')]);}catch(e){if(run===routeSeq)reply(e.message,true);}finally{if(run===routeSeq)$('routeSearch').disabled=false;}};
$('locate').onclick=()=>{if(!navigator.geolocation){toast('위치를 지원하지 않는 기기입니다. 출발지를 입력해주세요.');return;}$('locate').disabled=true;navigator.geolocation.getCurrentPosition(p=>{originPlace={lat:p.coords.latitude,lng:p.coords.longitude,name:'현재 위치'};homePosition={lat:p.coords.latitude,lng:p.coords.longitude};updateRouteCurrentMarker();$('origin').value='현재 위치';$('origin').readOnly=true;$('locate').disabled=false;toast('현재 위치를 출발지로 설정했어요. 검색 시 지도·기상 제공자에게 전달됩니다.');},()=>{$('locate').disabled=false;$('origin').value='위치 확인 실패 · 검색 버튼 사용';toast('위치를 확인하지 못했습니다. 출발지를 검색해주세요.');},{timeout:12000,maximumAge:30000,enableHighAccuracy:true});};
async function demoRoute(){
 stopRain();const run=++routeSeq;searchSeq++;pauseDrive();stopVoice();
 $('demo').disabled=true;$('routeSearch').disabled=true;$('places').replaceChildren();
 reply('서울시청에서 부산시청까지 주행 시연 경로를 준비하고 있어요.');
 try{
  // Fixed endpoints and fictional risk layers: NEVER borrow a user's GPS or real weather.
  const start={...DEMO_SEOUL_BUSAN.origin},end={...DEMO_SEOUL_BUSAN.destination};
  const d=await api('/api/route',{origin:start,destination:end,departure:new Date().toISOString()});
  if(run!==routeSeq)return;
  if(!d.vertices?.length||!d.rainPath?.length)throw Error('시연용 실제 도로 좌표를 받지 못했습니다.');
  originPlace=start;destPlace=end;
  $('origin').value=start.name;$('destination').value=end.name;studioSync();
  route={...d,demo:true};
  const scenario=makeDemoScenario(route);
  route.demoHazards=scenario.hazards;route.samples=scenario.samples;
  weather={samples:scenario.samples,source:'시연 모드 · 실제 기상관측 아님',fetchedAt:new Date().toISOString()};
  progress=0;gate.reset();renderRoute();renderCards();
  showNavSearch(false);showNavRouteResult();
  await showMap('kakao');
  reply('서울에서 부산까지 강수·안개·침수 위험지점을 배치했습니다. 아이콘을 누르거나 주행 시연을 시작해 보세요.');
 }catch(e){if(run===routeSeq)reply('시연 경로를 불러오지 못했어요. '+e.message);}
 finally{if(run===routeSeq){$('demo').disabled=false;$('routeSearch').disabled=false;}}
}
$('demo').onclick=demoRoute;
$('navDemoSeoulBusan')?.addEventListener('click',demoRoute);
$('realTrip').onclick=()=>{if(playing||$('routeSearch').disabled)return;originPlace={name:'진천군청',lat:36.855,lng:127.436};destPlace={name:'서울시청',lat:37.566,lng:126.978};$('origin').value=originPlace.name;$('destination').value=destPlace.name;$('departure').value=localInput(new Date(Date.now()+120000));$('searchForm').requestSubmit();};

function renderRoute(){if($('navRouteHazardDetail'))$('navRouteHazardDetail').hidden=true;clearWeatherOverlays();pickTarget=null;updatePick();$('cards').innerHTML='<article class="empty-card"><h3>새 경로의 구간별 예보를 확인하고 있어요.</h3></article>';$('cardCount').textContent='조회 중';$('driveControls').hidden=true;$('kakaoDirections').hidden=true;selectedSample=null;$('roadInspector').hidden=true;$('actualRoute').setAttribute('hidden','');renderActualRoute();if(!route.demo){$('kakaoDirections').href=kakaoRouteLink(originPlace,destPlace);$('kakaoDirections').hidden=false;renderActualRoute();}$('modeBadge').textContent=route.demo?'시연 모드':'실제 경로';$('mapTitle').textContent=route.demo?'실제 도로 · 상황 시연':'카카오모빌리티 경로';$('duration').innerHTML=Math.round(route.duration/60)+'<small> 분</small>';$('distance').innerHTML=(route.distance/1000).toFixed(1)+'<small> km</small>';$('arrival').textContent=fmt(new Date(Date.parse(route.departure)+route.duration*1000));$('drive').disabled=!route.demo;$('drive').textContent=route.demo?'▷ 시연 재생':'실제 주행 추적 준비 중';$('refresh').disabled=route.demo;$('originLabel').textContent='출발';$('destLabel').textContent='도착';$('demoMarkers').style.display=route.demo?'':'none';$('schematic').querySelector('svg').setAttribute('aria-label',route.demo?'시연용 서울 부산 경로 개요도. 실제 지도와 도로 형상이 아닙니다.':'추상적인 경로 개요도. 실제 도로 형상이 아닙니다.');$('floatingTitle').textContent=originPlace.name+' → '+destPlace.name;$('floatingSub').textContent=route.demo?'시연 모드 · 실제 기상관측/특보 아님':'도로별 소요시간을 누적한 예상 통과시각';$('progress').value='0';moveCar();}

function renderRouteHazards(){
 const rail=$('navRouteRiskMarks'),status=$('navRouteRiskStatus'),detail=$('navRouteHazardDetail');
 if(!rail||!status)return;
 const isDemo=!!route?.demo;
 const hazards=routeWeatherEnabled()?(isDemo?route.demoHazards||[]:
  [...buildRouteHazards(weather?.samples),...routeExtraHazards(route)].sort((a,b)=>a.seconds-b.seconds)):[];
 const count=renderHazardRail(rail,hazards,route?.rainPath,{
  fractionAt:routeFraction,max:isDemo?hazards.length:appPrefs.alertCount,
  onSelect:h=>showHazardDetail(detail,h,fmt)
 });
 if(!routeWeatherEnabled())status.textContent='';
 else if(isDemo)status.textContent='위험지점 '+count+'개 · 🌧️ 강수 / 🌫️ 안개 / 🌊 침수 · 아이콘 선택';
 else if(count)status.textContent='기상청 위험지점 '+count+'개 · 아이콘을 눌러 상세정보 확인';
 else if(!weather)status.textContent='경로 기상예보 조회 중 · 실제 위험예보만 표시';
 else if(!weather.samples?.some(p=>p.status==='forecast'&&p.forecast?.provider==='kma'))
  status.textContent='기상청 예보 미수신 · 위험 여부 판단 불가';
 else status.textContent='조회된 기상청 예보 지점에 비·눈 위험 표시 없음 · 미조회 구간은 판단 불가';
 if(detail)detail.hidden=true;
}
function showNavRouteResult(){
 const sheet=$('navRouteResult');if(!sheet||!route)return;
 $('navRouteDuration').textContent=Math.round(route.duration/60)+'분';
 $('navRouteDistance').textContent=(route.distance/1000).toFixed(1)+'km';
 $('navRouteArrival').textContent='도착 '+fmt(new Date(Date.parse(route.departure)+route.duration*1000));
 const disclaimer=$('navDemoDisclaimer');
 if(disclaimer)disclaimer.hidden=!route.demo;
 $('navStartGuidance').textContent=route.demo?'▶ 주행 시연 시작':'Sunny SAI 안내 시작 ▶';
 renderRouteHazards();sheet.hidden=false;document.body.classList.add('nav-route-open');
 setNavTab('navRoute');ensureNavigationKakao();
 if(!route.demo)watchPreviewPosition();
}
$('navRouteResultClose')?.addEventListener('click',goToInitialHome);
$('navStartGuidance')?.addEventListener('click',()=>route?.demo?startDemoGuidance():startRainGuidance());
async function loadWeather(){if(!route||route.demo)return;const current=route;const run=routeSeq;const weatherRun=++weatherSeq;$('refresh').disabled=true;$('weatherDetail').textContent='예보 확인 중';setLayerReception('navLayerWeather','loading');try{const d=await api('/api/weather',{samples:route.samples,provider:$('weatherProvider').value});if(route!==current||run!==routeSeq||weatherRun!==weatherSeq)return;weather=d;setLayerReception('navLayerWeather',forecastReception(d.samples,p=>p.forecast));renderCards();drivingUI.setWeather(weather);reply(d.samples.some(p=>p.forecast)?d.source+'를 확인했어요. 공사·통제는 별도 확인이 필요합니다.':'기상 예보를 확인하지 못했어요. '+(d.samples.find(p=>p.error)?.error||'자료 제공 범위를 확인해주세요.'));}catch(e){if(route!==current||run!==routeSeq||weatherRun!==weatherSeq)return;weather={provider:$('weatherProvider').value==='kma'?'kma':'open-meteo',samples:route.samples.map(p=>({...p,forecast:null,error:e.message})),source:'조회 실패',fetchedAt:new Date().toISOString()};setLayerReception('navLayerWeather',e.reception||'failed');renderCards();drivingUI.setWeather(weather);reply(e.message);}finally{if(route===current&&run===routeSeq&&weatherRun===weatherSeq)$('refresh').disabled=false;}}
$('refresh').onclick=loadWeather;$('weatherProvider').onchange=()=>{if(route&&!route.demo)loadWeather();};
function renderCards(){drawWeatherOverlays();renderRouteHazards();const list=weather?.samples||[];$('cardCount').textContent=list.length+'개 구간';$('cards').innerHTML=list.map((p,i)=>{const a=route?.demo&&p.demoHazard?{kind:'attention',icon:p.demoHazard.icon,title:p.demoHazard.title,text:p.demoHazard.measure+' · '+p.demoHazard.description}:p.event?{kind:'attention',icon:'⚒',title:'공사 안내 시연',text:p.event}:assess(p.forecast);return `<article class="weather-card ${a.kind}"><div class="card-top"><span>${escape(p.label)}</span><span class="weather-icon">${a.icon}</span></div><h3>${fmt(p.eta)} 예상 통과 · ${escape(a.title)}</h3><p>${escape(a.text)}</p><div class="source">${escape(weather.source)}${route.demo?' · 실제 자료 아님':''}<br>조회 ${fmt(weather.fetchedAt)}${p.forecast?.time?' · 예보 유효 '+fmt(p.forecast.time):''}${p.forecast?.issuedAt?' · 발표 '+escape(p.forecast.issuedAt.slice(4,6)+'/'+p.forecast.issuedAt.slice(6,8)+' '+p.forecast.issuedAt.slice(8,10)+':'+p.forecast.issuedAt.slice(10,12))+' KST':''}${p.grid?' · 격자 '+p.grid.nx+','+p.grid.ny:''}${p.error?'<br>'+escape(p.error):''}</div>${route.demo?'':`<button type="button" class="road-button" data-road="${i}" aria-pressed="false">도로 구간 살펴보기 ↗</button>`}<button type="button" class="detail-button" data-card="${i}">이 구간 안내 듣기 ↗</button></article>`;}).join('');document.querySelectorAll('[data-road]').forEach(b=>b.onclick=()=>selectRoad(Number(b.dataset.road)));document.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>{const p=list[Number(b.dataset.card)];const a=p.demoHazard?{text:p.demoHazard.measure+' · '+p.demoHazard.description}:p.event?{text:p.event}:assess(p.forecast);reply(p.label+', '+fmt(p.eta)+' 예상 통과. '+a.text,true);});$('weatherStatus').textContent=route.demo?'시연 기상정보':!list.some(p=>p.forecast)?'기상 자료 조회 실패':weather.provider==='kma'?'기상청 격자 예보':'Open-Meteo 예보';$('weatherDetail').textContent=route.demo?'실제 기상자료 아님':list.some(p=>p.forecast)?'모델 예보 · 조회 '+fmt(weather.fetchedAt):'조회 실패 · 추가 확인 필요';}
function renderActualRoute(){const pts=projectRoute(route.vertices||[]),ns='http://www.w3.org/2000/svg',svg=$('actualRoute');svg.replaceChildren();if(!pts.length)return;const line=document.createElementNS(ns,'path');line.setAttribute('d',pts.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' '));line.setAttribute('class','actual-road-line');svg.append(line);[pts[0],pts[pts.length-1]].forEach((p,i)=>{const c=document.createElementNS(ns,'circle');c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.setAttribute('r',i?'8':'6');c.setAttribute('class','route-endpoint');svg.append(c);});const label=document.createElementNS(ns,'text');label.setAttribute('x','24');label.setAttribute('y','466');label.setAttribute('class','route-vector-label');label.textContent='카카오모빌리티 실제 도로 형상 · 배경지도 아님';svg.append(label);if(selectedSample!==null){const sample=route.samples[selectedSample],section=roadSection(route.vertices,sample).map(p=>pts[route.vertices.indexOf(p)]);const focus=document.createElementNS(ns,'path');focus.setAttribute('d',section.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' '));focus.setAttribute('class','selected-road-line');svg.append(focus);}}
function selectRoad(i){const p=route?.samples?.[i];if(!p||route.demo)return;selectedSample=i;$('roadInspector').hidden=false;$('roadName').textContent=p.label;$('roadInfo').textContent=fmt(p.eta)+' 예상 통과 · '+p.lat.toFixed(5)+', '+p.lng.toFixed(5)+' · 예보는 도로 현장 측정값이 아닙니다.';document.querySelectorAll('[data-road]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.road)===i)));focusRoad();$('roadInspector').scrollIntoView({behavior:'smooth',block:'nearest'});}
function clearFocus(){kfocus?.setMap(null);ksection?.setMap(null);kfocus=null;ksection=null;if(lfocus&&lmap)lmap.removeLayer(lfocus);if(lsection&&lmap)lmap.removeLayer(lsection);lfocus=null;lsection=null;}
function focusRoad(){clearFocus();if(route)renderActualRoute();if(selectedSample===null||route?.demo)return;const p=route?.samples?.[selectedSample];if(!p)return;const section=roadSection(route.vertices,p);
 if((activeMap==='kakao'||activeMap==='skyview')&&kmap){kmap.setLevel(4);kmap.setCenter(new kakao.maps.LatLng(p.lat,p.lng));kfocus=new kakao.maps.Marker({map:kmap,position:new kakao.maps.LatLng(p.lat,p.lng)});ksection=new kakao.maps.Polyline({map:kmap,path:section.map(x=>new kakao.maps.LatLng(x.lat,x.lng)),strokeWeight:9,strokeColor:'#dc9f40'});}
 if(activeMap==='vworld'&&lmap){lmap.setView([p.lat,p.lng],16);lfocus=L.circleMarker([p.lat,p.lng],{radius:9,color:'#fff',weight:3,fillColor:'#dc9f40',fillOpacity:1}).addTo(lmap);lsection=L.polyline(section.map(x=>[x.lat,x.lng]),{color:'#dc9f40',weight:9}).addTo(lmap);}
}
$('fitRoute').onclick=()=>{selectedSample=null;$('roadInspector').hidden=true;document.querySelectorAll('[data-road]').forEach(b=>b.setAttribute('aria-pressed','false'));showMap(activeMap);};
$('inspectKakao').onclick=()=>showMap('kakao');$('inspectSkyview').onclick=()=>showMap('skyview');$('inspectSatellite').onclick=()=>showMap('vworld');
function clearDemoOverlays(){for(const o of demoOverlays){if(o.setMap)o.setMap(null);else if(lmap)lmap.removeLayer(o);}demoOverlays=[];carOverlay=null;}
function drawDemoOverlays(){
 clearDemoOverlays();if(!route?.demo)return;
 const mapIsKakao=(activeMap==='kakao'||activeMap==='skyview')&&kmap;
 const mapIsLeaflet=(activeMap==='osm'||activeMap==='vworld')&&lmap;
 if(!mapIsKakao&&!mapIsLeaflet)return;
 function add(position,content,onClick){
  let overlay=null;
  if(mapIsKakao){
   overlay=new kakao.maps.CustomOverlay({map:kmap,position:new kakao.maps.LatLng(position.lat,position.lng),
    content,yAnchor:.5,zIndex:5});
  }else{
   const html=typeof content==='string'?content:content.outerHTML;
   overlay=L.marker([position.lat,position.lng],{
    icon:L.divIcon({html,className:'demo-map-icon',iconSize:[48,52],iconAnchor:[24,26]})
   }).addTo(lmap);
   if(onClick)overlay.on('click',onClick);
  }
  if(overlay)demoOverlays.push(overlay);
  return overlay;
 }
 for(const h of route.demoHazards||[]){
  const marker=document.createElement('button');marker.type='button';
  marker.className='hazard-pin sunny-demo-pin'+(h.breaking?' sunny-demo-breaking-pin':'');marker.title=h.title+' · 상세보기';
  marker.setAttribute('aria-label',h.title+' 상세보기');
  const icon=document.createElement('span');icon.textContent=h.icon;
  const label=document.createElement('small');label.textContent=({rain:'강수',fog:'안개',flood:'침수',warning:'특보'})[h.kind]||'위험';
  marker.append(icon,label);
  const explain=()=>{
   const panel=drivingUI.isActive()?$('sunnyDriveHazardDetail'):$('navRouteHazardDetail');
   showHazardDetail(panel,h,fmt);
   reply(h.title+' · '+h.measure+' · '+h.description,false);
  };
  marker.addEventListener('click',explain);
  add(h,marker,explain);
 }
 carOverlay=add(route.rainPath?.[0]||route.vertices[0],'<div class="car-pin" aria-label="시연 자동차">🚙</div>');
}
function moveCar(){if(route?.vertices?.length){const p=route.demo?demoPointAtSeconds(route.rainPath,route.duration*progress/100):pointAlong(route.vertices,progress/100);if(carOverlay?.setPosition)carOverlay.setPosition(new kakao.maps.LatLng(p.lat,p.lng));else if(carOverlay?.setLatLng)carOverlay.setLatLng([p.lat,p.lng]);if(activeMap==='schematic'){let car=$('vectorCar');if(!car){car=document.createElementNS('http://www.w3.org/2000/svg','text');car.id='vectorCar';car.textContent='🚙';car.setAttribute('font-size','30');$('actualRoute').append(car);}const points=projectRoute(route.vertices),nearest=route.vertices.reduce((best,v,i)=>Math.hypot(v.lat-p.lat,v.lng-p.lng)<Math.hypot(route.vertices[best].lat-p.lat,route.vertices[best].lng-p.lng)?i:best,0);car.setAttribute('x',points[nearest].x-15);car.setAttribute('y',points[nearest].y+10);}return;}const path=$('routeLine'),point=path.getPointAtLength(path.getTotalLength()*progress/100);$('carMarker').setAttribute('transform',`translate(${point.x},${point.y})`);}
// Inject an entirely new event into an already running fictional journey.
// No remote weather-warning request or actual public alert is generated.
function injectDemoBreakingWarning(){
 if(!route?.demo||route.demoBreakingWarning||!drivingUI.isActive())return false;
 const hazard=makeDemoBreakingWarning(route);
 route.demoBreakingWarning=hazard;
 route.demoHazards=[...route.demoHazards,hazard].sort((a,b)=>a.seconds-b.seconds);
 const sample={...hazard,status:'demo',demoHazard:hazard,forecast:null};
 route.samples=[...(route.samples||[]),sample].sort((a,b)=>a.seconds-b.seconds);
 weather={...weather,samples:route.samples};
 renderCards();
 drawDemoOverlays();moveCar();
 drivingUI.render();
 reply('긴급 기상특보가 발효됐습니다. 전방 '+hazard.label+
  '에 호우 위험정보가 추가됐습니다. 속도를 줄이고 주의하세요.',appPrefs.voiceAlerts);
 return true;
}
function resetDemoBreakingWarning(){
 if(!route?.demo)return;
 route.demoBreakingWarning=null;
 route.demoHazards=(route.demoHazards||[]).filter(h=>!h.breaking);
 route.samples=(route.samples||[]).filter(s=>!s.breaking);
 weather={...weather,samples:route.samples};
 renderCards();drawDemoOverlays();moveCar();
 drivingUI.render();
}
function advance(value){
 const previous=progress;
 progress=Math.max(0,Math.min(100,Number(value)||0));
 $('progress').value=String(progress);moveCar();
 $('driveStatus').textContent=Math.round(progress)+'%';
 if(!route?.demo)return;
 const elapsed=route.duration*progress/100;
 if(drivingUI.isActive())drivingUI.update(elapsed,null,false);
 // Place new warning on the ahead-of-driver route only when it is issued mid-trip.
 const justIssued=shouldTriggerDemoBreakingWarning(previous,progress,!!route.demoBreakingWarning)
  &&injectDemoBreakingWarning();
 for(const h of route.demoHazards||[]){
  if(previous*route.duration/100<h.seconds&&elapsed>=h.seconds&&gate.take('demo:'+h.id) &&
    !justIssued)
   reply('전방 '+h.title+'. '+h.measure+'. '+h.description,appPrefs.voiceAlerts);
 }
 if(progress>=100){
  pauseDrive();$('driveStatus').textContent='시연 완료';
  reply('부산시청에 도착했습니다. 주행 안내를 종료합니다.',appPrefs.voiceAlerts);
 }
}
function pauseDrive(){
 clearInterval(timer);timer=null;playing=false;document.body.classList.remove('driving');
 if(route?.demo)$('drive').textContent='▷ 시연 재생';
 if($('sunnyDemoPause'))$('sunnyDemoPause').textContent='▶ 재생';
}
function startDemoPlayback(){
 if(!route?.demo||playing)return;
 if(progress>=100){progress=0;gate.reset();resetDemoBreakingWarning();advance(0);}
 playing=true;document.body.classList.add('driving');
 $('driveControls').hidden=false;$('drive').textContent='Ⅱ 일시정지';
 if($('sunnyDemoPause'))$('sunnyDemoPause').textContent='Ⅱ 일시정지';
 timer=setInterval(()=>advance(Math.min(100,progress+0.35)),150);
}
function startDemoGuidance(){
 if(!route?.demo)return;
 pauseDrive();rainGridOverlay.disableRouteRadar();
 // Clear previously issued synthetic warning when restarting a demo.
 resetDemoBreakingWarning();
 drivingUI.start(route,weather);
 $('navRouteResult').hidden=true;document.body.classList.remove('nav-route-open');
 setNavTab('navRoute');showNavSearch(false);
 $('sunnyDemoNext').hidden=false;$('sunnyDemoPause').hidden=false;
 $('driveControls').hidden=false;
 progress=0;gate.reset();advance(0);
 void showMap('kakao');
 reply('서울에서 부산까지 주행 안내를 시작합니다. 강수·안개·침수 위험 구간을 확인합니다.',appPrefs.voiceAlerts);
 startDemoPlayback();
}
$('sunnyDemoNext')?.addEventListener('click',()=>{
 if(!route?.demo)return;
 pauseDrive();
 const elapsed=route.duration*progress/100;
 const next=(route.demoHazards||[]).find(h=>h.seconds>elapsed+1);
 const triggerAt=route.duration*DEMO_BREAKING_TRIGGER;
 // Step-by-step playback also automatically injects a new warning after fog.
 if(!route.demoBreakingWarning&&triggerAt>elapsed+1&&(!next||triggerAt<next.seconds))
  advance(DEMO_BREAKING_TRIGGER*100+0.01);
 else if(next)advance(Math.min(100,(next.seconds/route.duration)*100+0.01));
 else{advance(100);toast('모든 위험 이벤트를 확인했습니다.');}
});
$('sunnyDemoPause')?.addEventListener('click',()=>{
 if(route?.demo)playing?pauseDrive():startDemoPlayback();
});
$('drive').onclick=()=>{
 if(!route?.demo)return;
 playing?pauseDrive():startDemoPlayback();
};
$('progress').oninput=e=>advance(Number(e.target.value));
$('endDrive').onclick=()=>{
 pauseDrive();stopVoice();progress=0;gate.reset();
 $('progress').value='0';moveCar();$('driveControls').hidden=true;
 if(drivingUI.isActive())drivingUI.stop();
 $('sunnyDemoNext').hidden=true;$('sunnyDemoPause').hidden=true;
 showNavRouteResult();
 reply('주행 시연을 종료했어요.');
};
document.addEventListener('visibilitychange',()=>{
 if(document.hidden&&playing){pauseDrive();stopVoice();$('driveStatus').textContent='화면이 닫혀 일시정지';}
});

const scriptLoads=new Map();
async function script(src){if(scriptLoads.has(src))return scriptLoads.get(src);const promise=new Promise((resolve,reject)=>{const s=document.createElement('script'),timeout=setTimeout(()=>{s.remove();scriptLoads.delete(src);reject(Error('지도 연결 시간이 초과됐습니다. 다시 시도해주세요.'));},12000);s.src=src;s.onload=()=>{clearTimeout(timeout);resolve();};s.onerror=()=>{clearTimeout(timeout);s.remove();scriptLoads.delete(src);reject(Error('지도 라이브러리를 불러오지 못했습니다.'));};document.head.append(s);});scriptLoads.set(src,promise);return promise;}
function notice(t){
 const box=$('mapNotice');box.replaceChildren();box.hidden=!t;
 if(t)box.append(document.createTextNode(t));
}
function kakaoConnectError(t){
 notice(t);
 const button=document.createElement('button');
 button.id='retryKakaoMap';button.type='button';button.className='kakao-map-retry';
 button.textContent='카카오맵 다시 연결';
 button.addEventListener('click',()=>{notice('카카오맵 연결을 다시 확인하고 있습니다.');void showMap('kakao');});
 $('mapNotice').append(button);
}
function updatePick(){['origin','destination'].forEach(x=>$('pick'+(x==='origin'?'Origin':'Destination')).setAttribute('aria-pressed',String(pickTarget===x)));$('pickHint').textContent=pickTarget?(pickTarget==='origin'?'출발':'도착')+' 위치를 지도에서 누르세요.':'장소 검색 또는 위도, 경도 입력 · 지도에서도 위치 선택 가능';}
function mapClick(p){if(pickTarget){const place=coordinatePlace(p.lat+','+p.lng);if(!place){toast('대한민국 내 위치를 선택해주세요.');return;}if(pickTarget==='origin')originPlace=place;else destPlace=place;$(pickTarget).value=place.name;pickTarget=null;updatePick();toast('위치를 설정했어요. 출발·도착을 정한 뒤 경로 살펴보기를 누르세요.');return;}if(route&&!route.demo){const i=nearestSample(route.samples,p);if(i!==null){selectRoad(i);toast('누른 위치에서 가장 가까운 예보 구간을 표시했어요.');}}}
['origin','destination'].forEach(target=>$('pick'+(target==='origin'?'Origin':'Destination')).onclick=async()=>{pickTarget=pickTarget===target?null:target;updatePick();if(pickTarget&&activeMap==='schematic')await showMap('kakao');});
function satelliteStatus(){const state=tileHealth(tileLoaded,tileFailed);providerState.vworld=state==='ready'?'타일 수신 확인':state==='failed'?'타일 수신 실패':'타일 확인 중';connectionStatus();if(activeMap!=='vworld')return;$('mapProvider').textContent=state==='ready'?'VWorld · 위성 배경 + 도로명':'VWorld · 타일 확인 중';if(state==='failed'){notice('브이월드 위성 타일을 받지 못했습니다. 도메인·키 또는 제공자 응답을 확인해주세요. 카카오 항공 버튼으로 다른 배경을 선택할 수 있습니다.');}else if(state==='ready')notice('');}
function updateMobileMapLayer(){
 const satellite=activeMap==='vworld'||activeMap==='skyview';
 $('navRoadMap')?.setAttribute('aria-pressed',String(!satellite));
 $('navSatelliteMap')?.setAttribute('aria-pressed',String(satellite));
}
$('navRoadMap')?.addEventListener('click',()=>{if(document.body.dataset.sunnyNav!=='home')return;mapSwitchViewport=captureMapViewport();showMap(mapConfig.kakao?'kakao':'osm');});
$('navSatelliteMap')?.addEventListener('click',async event=>{
 event.preventDefault();
 if(document.body.dataset.sunnyNav!=='home')return;
 const button=$('navSatelliteMap');
 button?.setAttribute('aria-busy','true');
 try{
  if(sessionPromise)await sessionPromise;
  if(mapConfig.kakao){mapSwitchViewport=captureMapViewport();toast('카카오 항공사진 + 도로명을 불러오는 중입니다.');await showMap('skyview');}
  else toast('카카오 JavaScript 지도 키가 설정되지 않았습니다. Vercel Preview 환경변수를 확인해주세요.');
 }catch(error){toast('위성지도 전환 실패: '+(error?.message||'지도 연결 상태를 확인해주세요.'));}
 finally{button?.removeAttribute('aria-busy');}
});
// Preserve the user's viewport when switching road/satellite basemaps.
let mapSwitchViewport=null;
function captureMapViewport(){
 try{
  if((activeMap==='kakao'||activeMap==='skyview')&&kmap){const c=kmap.getCenter();return{lat:c.getLat(),lng:c.getLng(),zoom:Math.max(1,20-kmap.getLevel())};}
  const m=activeMap==='osm'?osmMap:activeMap==='vworld'?lmap:null;
  if(m){const c=m.getCenter();return{lat:c.lat,lng:c.lng,zoom:m.getZoom()};}
 }catch(e){}
 return null;
}
function restoreMapViewport(view){
 if(!view||!Number.isFinite(view.lat)||!Number.isFinite(view.lng))return;
 if((activeMap==='kakao'||activeMap==='skyview')&&kmap){kmap.setCenter(new kakao.maps.LatLng(view.lat,view.lng));kmap.setLevel(Math.max(1,Math.min(14,Math.round(20-view.zoom))));}
 else if(activeMap==='osm'&&osmMap)osmMap.setView([view.lat,view.lng],view.zoom);
 else if(activeMap==='vworld'&&lmap)lmap.setView([view.lat,view.lng],view.zoom);
}
async function showOpenStreetMap(){
 const viewport=mapSwitchViewport||captureMapViewport();mapSwitchViewport=null;
 const run=++mapRun;activeMap='osm';updateMobileMapLayer();
 $('schematic').hidden=true;$('actualRoute').hidden=true;$('kakaoMap').hidden=true;$('vworldMap').hidden=true;$('osmMap').hidden=false;
 ['schematic','kakao','vworld','skyview'].forEach(x=>$(x+'Toggle').setAttribute('aria-pressed','false'));
 $('mapProvider').textContent='© OpenStreetMap contributors · 일반 도로지도';
 notice('');
 try{
  if(!window.L){if(!document.querySelector('link[data-osm-css]')){const c=document.createElement('link');c.rel='stylesheet';c.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';c.dataset.osmCss='true';document.head.append(c);}await script('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');}
  if(run!==mapRun)return;
  if(!osmMap){osmMap=L.map('osmMap',{zoomControl:false}).setView([36.5,127.8],7);osmMap.on('moveend',scheduleFlood);osmMap.on('moveend',kmaMapOverlay.schedule);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(osmMap);/* OSM zoom controls omitted; touch gestures work on Home. */osmMap.on('click',e=>mapClick({lat:e.latlng.lat,lng:e.latlng.lng}));}
  osmMap.invalidateSize();if(osmRoute){osmRoute.remove();osmRoute=null;}
  if(route?.vertices?.length){osmRoute=L.polyline(route.vertices.map(p=>[p.lat,p.lng]),{color:'#1768ed',weight:7}).addTo(osmMap);osmMap.fitBounds(osmRoute.getBounds(),{padding:[35,35]});}
  else if(viewport)restoreMapViewport(viewport);updateFlood();kmaMapOverlay.schedule();roadRiskOverlay.repaint();warningOverlay.repaint();
 }catch(e){if(run!==mapRun)return;notice('기본 도로지도 연결 실패: 네트워크 또는 지도 타일 접근을 확인해주세요.');$('osmMap').hidden=true;$('schematic').hidden=false;activeMap='schematic';}
}
async function showMap(type,{preserveCamera=false}={}){const keepKakaoCamera=preserveCamera&&type==='kakao'&&activeMap==='kakao'&&!!kmap;if(document.body.dataset.sunnyNav!=='home'&&type!=='kakao')type='kakao';const viewport=mapSwitchViewport||captureMapViewport();mapSwitchViewport=null;if(type==='osm'){mapSwitchViewport=viewport;return showOpenStreetMap();}$('osmMap').hidden=true;const run=++mapRun;activeMap=type;updateMobileMapLayer();await sessionPromise;if(run!==mapRun)return;clearDemoOverlays();clearFocus();const isKakao=type==='kakao'||type==='skyview';$('actualRoute').toggleAttribute('hidden',type!=='schematic'||!route);$('schematic').hidden=type!=='schematic'||!!route;$('kakaoMap').hidden=!isKakao;$('vworldMap').hidden=type!=='vworld';['schematic','kakao','vworld','skyview'].forEach(x=>$(x+'Toggle').setAttribute('aria-pressed',String(x===type)));notice(isKakao&&!kmap?'카카오맵을 연결하고 있습니다. 실제 지도를 불러오는 중입니다.':'');$('mapProvider').textContent=type==='schematic'?'도로 형상 · 배경지도 아님':type==='vworld'?'VWorld · 연결 중':type==='skyview'?'Kakao · 항공 배경':'Kakao · 도로 지도';
 if(type==='schematic'){rainGridOverlay.setMap(null);kmaMapOverlay.clear();roadRiskOverlay.clear();focusRoad();drawWeatherOverlays();drawDemoOverlays();moveCar();return;}
 // Demo mode has its own persistent disclaimer and labeled hazard markers; no map popup.
 try{if(isKakao){if(!mapConfig.kakao)throw Error('운영자의 카카오 JavaScript 키가 필요합니다.');if(!kmap){await script('https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey='+encodeURIComponent(mapConfig.kakao));await new Promise((resolve,reject)=>{if(!window.kakao?.maps)return reject(Error('카카오 지도 SDK 응답을 확인해주세요.'));const timeout=setTimeout(()=>reject(Error('카카오 지도 초기화 시간 초과')),12000);kakao.maps.load(()=>{clearTimeout(timeout);resolve();});});if(run!==mapRun)return;kmap=new kakao.maps.Map($('kakaoMap'),{center:new kakao.maps.LatLng(36.85,127.44),level:10});/* Kakao zoom sidebar removed; home can still pinch/double-tap to zoom. */kakao.maps.event.addListener(kmap,'click',e=>mapClick({lat:e.latLng.getLat(),lng:e.latLng.getLng()}));kakao.maps.event.addListener(kmap,'idle',kmaMapOverlay.schedule);}
 if(run!==mapRun)return;if(!keepKakaoCamera){kmap.relayout();rainGridOverlay.setMap(kmap);kmap.setMapTypeId(type==='skyview'?kakao.maps.MapTypeId.HYBRID:kakao.maps.MapTypeId.ROADMAP);}providerState.kakao='SDK 초기화 확인';connectionStatus();routePolyline?.setMap(null);kmarker?.setMap(null);kend?.setMap(null);routeCurrentMarker?.setMap(null);routePolyline=null;kmarker=null;kend=null;routeCurrentMarker=null;
 if(route?.demo){const bounds=new kakao.maps.LatLngBounds();[originPlace,destPlace].forEach(p=>bounds.extend(new kakao.maps.LatLng(p.lat,p.lng)));kmap.setBounds(bounds);}if(route?.vertices?.length){const pts=remainingRoutePoints().map(p=>new kakao.maps.LatLng(p.lat,p.lng));routePolyline=new kakao.maps.Polyline({map:kmap,path:pts,zIndex:10,strokeWeight:7,strokeColor:type==='skyview'?'#ffda7d':'#315fce',strokeOpacity:.95});kakao.maps.event.addListener(routePolyline,'click',e=>mapClick({lat:e.latLng.getLat(),lng:e.latLng.getLng()}));const bounds=new kakao.maps.LatLngBounds();pts.forEach(p=>bounds.extend(p));if(!keepKakaoCamera)kmap.setBounds(bounds);homeLocationMarker?.setMap(null);homeLocationMarker=null;
 kmarker=new kakao.maps.CustomOverlay({map:kmap,position:pts[0],content:createRoutePin('start'),xAnchor:.5,yAnchor:.3,zIndex:21});
 kend=new kakao.maps.CustomOverlay({map:kmap,position:pts[pts.length-1],content:createRoutePin('destination'),xAnchor:.5,yAnchor:.3,zIndex:21});
 updateRouteCurrentMarker();}if(!route?.vertices?.length&&viewport)restoreMapViewport(viewport);else if(!route?.vertices?.length&&homePosition)centerHomeMap();}
 else {rainGridOverlay.setMap(null);if(!mapConfig.vworld)throw Error('운영자의 브이월드 키와 서비스 도메인 등록이 필요합니다.');if(!window.L){const c=document.createElement('link');c.rel='stylesheet';c.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.append(c);await script('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');}if(run!==mapRun)return;if(!lmap){lmap=L.map('vworldMap').setView([36.85,127.44],8);lmap.on('moveend',scheduleFlood);lmap.on('moveend',kmaMapOverlay.schedule);lmap.on('click',e=>mapClick({lat:e.latlng.lat,lng:e.latlng.lng}));const base='https://api.vworld.kr/req/wmts/1.0.0/'+encodeURIComponent(mapConfig.vworld);L.tileLayer(base+'/Satellite/{z}/{y}/{x}.jpeg',{maxZoom:19,attribution:'© VWorld / 국토교통부 · 촬영시점은 위치별로 다름'}).on('tileload',()=>{tileLoaded++;satelliteStatus();}).on('tileerror',()=>{tileFailed++;satelliteStatus();}).on('loading',()=>{tileLoaded=0;tileFailed=0;}).addTo(lmap);L.tileLayer(base+'/Hybrid/{z}/{y}/{x}.png',{maxZoom:19,attribution:'도로명 © VWorld'}).addTo(lmap);L.control.scale({imperial:false}).addTo(lmap);}
 lmap.invalidateSize();if(!route?.vertices?.length&&viewport)restoreMapViewport(viewport);if(lroute)lmap.removeLayer(lroute);if(lmarker)lmap.removeLayer(lmarker);if(lend)lmap.removeLayer(lend);lroute=null;lmarker=null;lend=null;if(route?.demo)lmap.fitBounds([originPlace,destPlace].map(p=>[p.lat,p.lng]),{padding:[25,25]});if(route?.vertices?.length){const pts=route.vertices.map(p=>[p.lat,p.lng]);lroute=L.polyline(pts,{color:'#ffda7d',weight:7}).addTo(lmap);lmarker=L.circleMarker(pts[0],{radius:8,color:'#fff',fillColor:'#315fce',fillOpacity:1}).bindTooltip('출발').addTo(lmap);lend=L.circleMarker(pts[pts.length-1],{radius:8,color:'#fff',fillColor:'#c87046',fillOpacity:1}).bindTooltip('도착').addTo(lmap);lmap.fitBounds(lroute.getBounds(),{padding:[25,25]});}satelliteStatus();}
 if(isKakao)notice('');focusRoad();drawWeatherOverlays();drawDemoOverlays();moveCar();drawGps();if(drivingUI.isActive())followDrivingGps();updateFlood();kmaMapOverlay.schedule();roadRiskOverlay.repaint();warningOverlay.repaint();}catch(e){if(run!==mapRun)return;providerState[isKakao?'kakao':'vworld']='연결 실패';connectionStatus();let message=isKakao?(type==='skyview'?'카카오 항공지도':'카카오맵')+' 연결 실패: '+(e?.message||'SDK 응답 오류')+'.':'브이월드 지도 연결 실패: '+(e?.message||'지도 응답 오류')+'.';if(isKakao){$('kakaoMap').hidden=false;$('schematic').hidden=true;$('osmMap').hidden=true;$('vworldMap').hidden=true;$('mapProvider').textContent='카카오맵 · 연결 확인 필요';kakaoConnectError(message+' 현재 접속 도메인 '+location.origin+' 이 카카오디벨로퍼스 JavaScript SDK 허용 도메인에 등록되어 있는지 확인하세요. 테스트는 고정 프리뷰 주소 https://sunny-sai-preview.vercel.app 를 사용하세요.');}else{toast(message);notice(message);}}}
['schematic','kakao','vworld','skyview'].forEach(type=>$(type+'Toggle').onclick=()=>{if(document.body.dataset.sunnyNav!=='home')return;void showMap(type);});
// Start the real Kakao map first on all devices; request GPS only after map initialization.
Promise.resolve(sessionPromise).then(async()=>{await showMap('kakao');if(window.matchMedia('(max-width:900px)').matches)requestHomeLocation(false);}).catch(e=>kakaoConnectError('카카오맵 준비 실패: '+(e?.message||'세션 상태를 확인해주세요.')));
new ResizeObserver(()=>{if(kmap&&(activeMap==='kakao'||activeMap==='skyview')){kmap.relayout();rainGridOverlay.redraw();}if(lmap&&activeMap==='vworld')lmap.invalidateSize();}).observe($('kakaoMap').parentElement);
updatePick();
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(Recognition){recognition=new Recognition();recognition.lang='ko-KR';recognition.continuous=false;recognition.interimResults=false;recognition.onstart=()=>{$('mic').setAttribute('aria-pressed','true');$('voiceStatus').textContent='목적지를 말씀해주세요.';};recognition.onend=()=>{$('mic').setAttribute('aria-pressed','false');};recognition.onerror=()=>{$('voiceStatus').textContent='음성을 듣지 못했습니다. 권한을 확인하거나 직접 입력해주세요.';};recognition.onresult=e=>{const t=e.results[0][0].transcript;if(/다시.*듣|다시.*알려/.test(t)){$('repeat').click();return;}if(/멈춰|그만/.test(t)){$('stop').click();return;}$('destination').value=t.replace(/(?:으로|로)?\s*(?:가고\s*싶어(?:요)?|가자|가줘|찾아줘(?:요)?)\s*[.!?]?$/,'').trim();destPlace=null;reply('목적지를 '+$('destination').value+'로 들었어요. 출발지를 확인하고 경로 살펴보기를 눌러주세요.');};$('mic').onclick=()=>{if(playing)return;stopVoice();if($('mic').getAttribute('aria-pressed')==='true'){recognition.abort();return;}try{recognition.start();}catch{toast('잠시 뒤 다시 눌러주세요.');}};}else $('mic').onclick=()=>{toast('이 브라우저는 음성 입력을 지원하지 않습니다. 목적지를 직접 입력해주세요.');$('destination').focus();};
$('share').onclick=async()=>{const url=location.origin;try{if(navigator.share)await navigator.share({title:'Sunny SAI',text:'가는 길의 날씨를 함께 살펴보세요.',url});else{await navigator.clipboard.writeText(url);toast('앱 링크를 복사했어요.');}}catch(e){if(e.name!=='AbortError')toast('앱 주소: '+url);}};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});$('install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else toast('Android Chrome: 메뉴 → 홈 화면에 추가. iPhone Safari: 공유 → 홈 화면에 추가.');};if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
window.addEventListener('pagehide',()=>{pauseDrive();stopVoice();});
})();

