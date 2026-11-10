// Geolocated TAAS REST accident clusters. These are 2024 historical statistics,
// not live incidents, road closures or proof of safe travel. No WMS imagery.
import {setLayerReception} from './layer-reception.mjs';
export const TAAS_REST_CONTROLS=Object.freeze({
 pedestrian:{toggle:'navLayerPedestrianWms',status:'navPedestrianWmsStatus',icon:'🚸',name:'보행자'},
 child:{toggle:'navLayerChildWms',status:'navChildWmsStatus',icon:'🧒',name:'어린이 보행자'},
 elderly:{toggle:'navLayerElderlyWms',status:'navElderlyWmsStatus',icon:'🧓',name:'노인 보행자'}
});
const korea=p=>p&&Number.isFinite(p.lat)&&p.lat>=32&&p.lat<=40&&Number.isFinite(p.lng)&&p.lng>=123&&p.lng<=133;
export function validTaasRestResult(result,kind){
 return result&&result.kind===kind&&result.year==='2024'&&
  result.source==='한국도로교통공단 TAAS'&&['received','partial','empty'].includes(result.status)&&
  Array.isArray(result.items)&&result.items.every(p=>p.kind===kind&&p.year==='2024'&&
   p.source==='한국도로교통공단 TAAS'&&p.historic===true&&p.live===false&&korea(p)&&
   Number.isInteger(p.accidentCount)&&p.accidentCount>=0);
}
export function initTaasRestOverlay({document,getRoute,getMap,ensureMap,query,onChange=()=>{}}){
 const state={pedestrian:null,child:null,elderly:null};
 const seq={pedestrian:0,child:0,elderly:0};
 const items={pedestrian:[],child:[],elderly:[]};
 let available=false,routeRef=null,opacity=.55;
 const el=id=>document.getElementById(id);
 const say=(kind,message)=>{
  const node=el(TAAS_REST_CONTROLS[kind].status);
  if(node)node.textContent=message;
 };
 function clear(kind){
  for(const x of items[kind]||[])try{x.overlay.setMap(null);}catch{}
  items[kind]=[];
 }
 const enabled=kind=>Boolean(available&&el(TAAS_REST_CONTROLS[kind].toggle)?.checked);
 function repaint(){
  for(const kind of Object.keys(TAAS_REST_CONTROLS)){
   clear(kind);
   if(!enabled(kind)||!validTaasRestResult(state[kind],kind))continue;
   const route=getRoute();
   if(route?.demo||route?.travelMode!=='walking'||route!==routeRef)continue;
   const map=getMap(),kakao=globalThis.window?.kakao;
   if(!map||!kakao?.maps?.CustomOverlay||!kakao?.maps?.LatLng)continue;
   for(const p of state[kind].items.slice(0,90)){
    if(!korea(p))continue;
    const marker=document.createElement('button');
    marker.type='button';marker.className='sunny-route-map-hazard';
    marker.textContent=TAAS_REST_CONTROLS[kind].icon;
    marker.style.opacity=String(opacity);
    const title=TAAS_REST_CONTROLS[kind].name+' 과거 사고다발지역 · 2024년 '+p.accidentCount+'건';
    marker.title=title;marker.setAttribute('aria-label',title);
    marker.addEventListener('click',event=>{
     event.stopPropagation?.();
     say(kind,title+' · 현재 사고가 발생했다는 뜻이 아닙니다.');
    });
    const overlay=new kakao.maps.CustomOverlay({
     map,position:new kakao.maps.LatLng(p.lat,p.lng),content:marker,
     xAnchor:.5,yAnchor:.5,zIndex:27,clickable:true
    });
    items[kind].push({overlay,marker});
   }
  }
 }
 async function load(kind){
  if(!Object.hasOwn(TAAS_REST_CONTROLS,kind)||!enabled(kind))return;
  const route=getRoute();
  if(!route||route.demo||route.travelMode!=='walking'){
   say(kind,'실제 도보 경로 탐색 후 표시합니다. 현재 사고정보가 아닙니다.');return;
  }
  const current=++seq[kind];routeRef=route;
  say(kind,'TAAS '+TAAS_REST_CONTROLS[kind].name+' REST 수신·좌표 검증 중…');
  setLayerReception(TAAS_REST_CONTROLS[kind].toggle,'loading');
  try{
   const result=await query(kind,route);
   if(current!==seq[kind]||getRoute()!==route||!enabled(kind))return;
   if(!validTaasRestResult(result,kind)){
    state[kind]=null;
    say(kind,'TAAS REST 자료 수신·승인 또는 형식 검증 실패 · 미표시');
    setLayerReception(TAAS_REST_CONTROLS[kind].toggle,'failed');
   }else{
    state[kind]=result;
    const count=result.items.length;
    say(kind,'TAAS 2024년 과거 사고집중지역 '+count+'곳 · '+(result.status==='partial'?'일부 지역 미수신 · ':'')+'현재 사고 아님');
    setLayerReception(TAAS_REST_CONTROLS[kind].toggle,result.status==='empty'?'empty':'received');
    if(count&&getMap()==null)await ensureMap();
   }
   repaint();onChange();
  }catch(e){
   if(current!==seq[kind]||getRoute()!==route)return;
   state[kind]=null;clear(kind);
   say(kind,'TAAS REST 조회 실패 · 승인·응답 검사 필요');
   setLayerReception(TAAS_REST_CONTROLS[kind].toggle,'failed');
  }
 }
 function onRouteChanged(){
  const current=getRoute();
  if(current===routeRef)return;
  routeRef=current;
  for(const kind of Object.keys(TAAS_REST_CONTROLS)){
   seq[kind]++;state[kind]=null;clear(kind);
   if(enabled(kind)&&current?.travelMode==='walking'&&!current.demo)void load(kind);
  }
 }
 function setAvailable(value){
  available=Boolean(value);
  for(const kind of Object.keys(TAAS_REST_CONTROLS)){
   const input=el(TAAS_REST_CONTROLS[kind].toggle);
   if(!input)continue;
   input.disabled=!available;
   if(!available){input.checked=false;seq[kind]++;state[kind]=null;clear(kind);}
   say(kind,available?'TAAS REST 키 등록 · 실제 응답 확인 후에만 표시':'TAAS REST 인증키 미등록 · 표출 보류');
  }
 }
 function updateOpacity(){
  const v=Number(el('navDemoOpacity')?.value??45);
  opacity=1-Math.max(0,Math.min(100,Number.isFinite(v)?v:45))/100;
  for(const group of Object.values(items))for(const x of group)x.marker.style.opacity=String(opacity);
 }
 for(const kind of Object.keys(TAAS_REST_CONTROLS)){
  el(TAAS_REST_CONTROLS[kind].toggle)?.addEventListener('change',()=>{
   if(enabled(kind))void load(kind);
   else{seq[kind]++;clear(kind);say(kind,'TAAS REST 지도 표시 OFF · 과거 사고통계');}
  });
 }
 return {setAvailable,updateOpacity,repaint,clear:()=>Object.keys(items).forEach(clear),
  onRouteChanged,load,hasData:kind=>validTaasRestResult(state[kind],kind)};
}
