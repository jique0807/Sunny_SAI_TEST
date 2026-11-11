// Heading-up vector navigation. The Kakao Mobility API remains the source of
// vehicle routes. This UI renders an independent rotating OpenStreetMap
// basemap; its symbols remain viewport aligned even as roads rotate.
const LIBRARY_JS='https://unpkg.com/maplibre-gl@5.11.0/dist/maplibre-gl.js';
const LIBRARY_CSS='https://unpkg.com/maplibre-gl@5.11.0/dist/maplibre-gl.css';
export const VECTOR_STYLE='https://tiles.openfreemap.org/styles/liberty';
let libraryPromise=null;

export function vectorCameraPadding(height){
 const h=Number.isFinite(height)&&height>0?height:640;
 return {top:Math.round(h*.43),bottom:0,left:0,right:0};
}
export function vectorRouteGeojson(route){
 const line=route?.vertices?.length>1?route.vertices:route?.rainPath||[];
 const stride=Math.max(1,Math.ceil(line.length/10000));
 const coords=[];
 for(let i=0;i<line.length;i+=stride){
  const p=line[i];
  if(Number.isFinite(p?.lat)&&Number.isFinite(p?.lng))coords.push([p.lng,p.lat]);
 }
 const last=line.at(-1);
 if(last&&Number.isFinite(last.lat)&&Number.isFinite(last.lng)&&
  (!coords.length||coords.at(-1)[0]!==last.lng||coords.at(-1)[1]!==last.lat))
  coords.push([last.lng,last.lat]);
 return {type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}};
}
export function vectorCameraOptions(point,bearing,height,headingMode='course'){
 if(!Number.isFinite(point?.lat)||!Number.isFinite(point?.lng))return null;
 return {center:[point.lng,point.lat],
  bearing:headingMode==='north'?0:Number.isFinite(bearing)?bearing:0,
  pitch:0,zoom:15.6,padding:vectorCameraPadding(height)};
}
function loadLibrary(){
 if(window.maplibregl)return Promise.resolve(window.maplibregl);
 if(libraryPromise)return libraryPromise;
 libraryPromise=new Promise((resolve,reject)=>{
  if(!document.querySelector('link[data-sunny-maplibre]')){
   const css=document.createElement('link');
   css.rel='stylesheet';css.href=LIBRARY_CSS;css.dataset.sunnyMaplibre='true';
   document.head.append(css);
  }
  const existing=document.querySelector('script[data-sunny-maplibre]');
  const script=existing||document.createElement('script');
  const timeout=setTimeout(()=>fail(Error('진행방향 지도 라이브러리 응답 시간 초과')),16000);
  function done(){clearTimeout(timeout);if(window.maplibregl)resolve(window.maplibregl);
   else reject(Error('진행방향 지도 라이브러리를 불러오지 못했습니다.'));}
  function fail(error){clearTimeout(timeout);script.remove();reject(error);}
  script.addEventListener('load',done,{once:true});
  script.addEventListener('error',()=>fail(Error('진행방향 지도 라이브러리 연결 실패')),{once:true});
  if(!existing){script.src=LIBRARY_JS;script.async=true;
   script.dataset.sunnyMaplibre='true';document.head.append(script);}
 });
 libraryPromise.catch(()=>{libraryPromise=null;});
 return libraryPromise;
}
function symbolLabelsUpright(map){
 if(!map.getStyle?.()?.layers)return 0;
 let count=0;
 for(const layer of map.getStyle().layers){
  if(layer.type!=='symbol'||!layer.layout?.['text-field'])continue;
  try{
   map.setLayoutProperty(layer.id,'text-rotation-alignment','viewport');
   map.setLayoutProperty(layer.id,'text-pitch-alignment','viewport');
   count++;
  }catch{/* Older provider layers may not support the alignment override. */}
 }
 return count;
}
function arrowElement(travelMode='driving'){
 const el=document.createElement('span');
 el.className='sunny-vector-vehicle';el.setAttribute('aria-label',travelMode==='walking'?'현재 보행자 위치':'현재 차량 위치');
 if(travelMode==='walking'){el.textContent='🚶';el.classList.add('sunny-vector-pedestrian');}
 else el.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 50" width="44" height="50" aria-hidden="true"><path d="M22 3 41 46 22 36 3 46Z" stroke="#fff" stroke-width="5" stroke-linejoin="round" fill="#1769ec"/><path d="M22 13v19" stroke="#b7e0ff" stroke-width="3" stroke-linecap="round"/></svg>';
 return el;
}
export function initVectorDriving({element,onSelect=()=>{},onFailure=()=>{}}){
 let map=null,api=null,vehicle=null,markers=[],route=null,ready=false,sequence=0,lastPoint=null,lastBearing=null,lastMode='course';
 const isActive=()=>!!map&&ready&&!element.hidden;
 function clearMarkers(){for(const marker of markers)marker.remove?.();markers=[];}
 function hide(){
  sequence++;ready=false;clearMarkers();vehicle?.remove?.();vehicle=null;
  map?.remove?.();map=null;api=null;route=null;lastPoint=null;lastBearing=null;
  element.hidden=true;
  element.dataset.navigationState='idle';
 }
 function applyCamera(point,bearing,mode='course',animate=true){
  if(!isActive())return;
  const camera=vectorCameraOptions(point,bearing,element.clientHeight,mode);
  if(!camera)return;
  lastPoint=point;lastBearing=bearing;lastMode=mode;
  const opts={...camera,duration:animate?600:0,essential:true};
  if(animate)map.easeTo(opts);else map.jumpTo(opts);
  const arrow=vehicle?.getElement?.();
  if(arrow)arrow.style.rotate=(mode==='course'?0:Number.isFinite(bearing)?bearing:0)+'deg';
  vehicle?.setLngLat?.([point.lng,point.lat]);
 }
 function setRoute(next){
  route=next;
  if(!isActive()||!route)return;
  const data=vectorRouteGeojson(route);
  const existing=map.getSource('sunny-vector-route');
  if(existing?.setData)existing.setData(data);
  refreshHazards();
 }
 function refreshHazards(hazards=[]){
  if(!isActive())return;
  clearMarkers();
  for(const hazard of hazards.slice(0,80)){
   if(!Number.isFinite(hazard?.lat)||!Number.isFinite(hazard?.lng))continue;
   const markerElement=document.createElement('button');
   markerElement.type='button';
   markerElement.className='sunny-vector-risk'+(hazard.breaking?' sunny-vector-risk-new':'');
   markerElement.textContent=hazard.icon||'!';
   markerElement.setAttribute('aria-label',hazard.title+' 상세정보');
   markerElement.title=hazard.title+' · '+(hazard.label||'경로 지점');
   markerElement.addEventListener('click',e=>{e.stopPropagation();onSelect(hazard);});
   const marker=new api.Marker({element:markerElement,anchor:'center',rotationAlignment:'viewport'})
    .setLngLat([hazard.lng,hazard.lat]).addTo(map);
   markers.push(marker);
  }
 }
 async function start(nextRoute,point,bearing,mode='course',hazards=[]){
  hide();element.dataset.navigationState='loading';if(!nextRoute?.rainPath?.length||!point)return false;
  const ticket=sequence;
  try{
   const lib=await loadLibrary();
   if(ticket!==sequence)return false;
   // MapLibre 5 has no supported() export; its Map constructor checks WebGL.
   if(typeof lib.supported==='function'&&!lib.supported())throw Error('이 기기의 브라우저에서 WebGL 지도를 지원하지 않습니다.');
   element.hidden=false;
   api=lib;route=nextRoute;
   map=new lib.Map({container:element,style:VECTOR_STYLE,
    center:[point.lng,point.lat],zoom:15.6,bearing:mode==='north'?0:bearing||0,
    pitch:0,attributionControl:false,renderWorldCopies:false,
    dragRotate:false,pitchWithRotate:false,cooperativeGestures:false});
   map.addControl(new lib.AttributionControl({compact:true}),'bottom-left');
   const localMap=map;
   await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('벡터 지도 스타일 연결 시간이 초과됐습니다.')),22000);
    localMap.once('load',()=>{clearTimeout(timeout);resolve();});
    localMap.once('error',e=>{
     if(!localMap.isStyleLoaded?.()){clearTimeout(timeout);reject(Error('벡터 지도 스타일 수신 실패: '+(e.error?.message||'network')));}
    });
   });
   if(ticket!==sequence||localMap!==map)return false;
   symbolLabelsUpright(map);
   const data=vectorRouteGeojson(route);
   if(data.geometry.coordinates.length<2)throw Error('주행 경로 좌표가 부족합니다.');
   map.addSource('sunny-vector-route',{type:'geojson',data});
   const before=map.getStyle().layers.find(layer=>layer.type==='symbol')?.id;
   map.addLayer({id:'sunny-vector-casing',type:'line',source:'sunny-vector-route',
    layout:{'line-join':'round','line-cap':'round'},
    paint:{'line-color':'#ffffff','line-width':13,'line-opacity':.96}},before);
   map.addLayer({id:'sunny-vector-path',type:'line',source:'sunny-vector-route',
    layout:{'line-join':'round','line-cap':'round'},
    paint:{'line-color':'#1769f1','line-width':8,'line-opacity':.96}},before);
   vehicle=new lib.Marker({element:arrowElement(route?.travelMode),anchor:'center',rotationAlignment:'viewport'})
     .setLngLat([point.lng,point.lat]).addTo(map);
   ready=true;element.dataset.navigationState='ready';delete element.dataset.navigationError;map.resize();
   applyCamera(point,bearing,mode,false);
   refreshHazards(hazards);
   return true;
  }catch(err){
   if(ticket===sequence){hide();element.dataset.navigationState='error';element.dataset.navigationError=err?.message||'지도 연결 실패';onFailure(err);}
   return false;
  }
 }
 function resize(){if(isActive()){map.resize();if(lastPoint)applyCamera(lastPoint,lastBearing,lastMode,false);}}
 return {start,update:applyCamera,setRoute,refreshHazards,stop:hide,resize,isActive,
  snapshot:()=>({active:isActive(),bearing:map?.getBearing?.(),position:lastPoint,
   center:map?.getCenter?.(),zoom:map?.getZoom?.(),hazards:markers.length,
   labelLayers:map?.getStyle?.()?.layers?.filter(x=>x.type==='symbol'&&x.layout?.['text-field']).length||0})};
}
