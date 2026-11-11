import {setLayerReception} from './layer-reception.mjs';
import {firstWarningAreaCrossing,warningAreaPolygons} from './warning-area-geometry.mjs';
export function warningRouteHazards(warnings,path,departure){
 const hazards=[];
 for(const warning of warnings){
  if(warning.geometryStatus!=='official_crs84_polygon')continue;
  const point=firstWarningAreaCrossing(path,warning.geometry);
  if(!point)continue;
  const eta=Date.parse(departure)+point.seconds*1000;
  hazards.push({...warning,...point,label:warning.label,kind:'warning',
   eta:Number.isFinite(eta)?new Date(eta).toISOString():null,
   provider:'기상청 특보현황 · 공식 특보구역 경로 교차',spatialMatch:'official-warning-polygon'});
 }
 return hazards;
}
export function initWarningOverlay({query,getMap,ensureMap,onChange}){
 const toggle=document.getElementById('navLayerWarning'),status=document.getElementById('navWarningStatus');
 let data=null,items=[],request=0,timer=null,riskPending=null,lastRiskAttempt=0,riskReceivedAt=0;
 const say=text=>{if(status)status.textContent=text;};
 const clear=()=>{for(const item of items)item.setMap(null);items=[];};
 const repaint=()=>{
  clear();
  if(!toggle?.checked||!data)return;
  const map=getMap();
  if(!map)return;
  for(const w of data.warnings){
   if(w.geometryStatus==='official_crs84_polygon'){
    for(const rings of warningAreaPolygons(w.geometry))items.push(new kakao.maps.Polygon({map,
     path:rings.map(r=>r.map(p=>new kakao.maps.LatLng(p[1],p[0]))),
     strokeWeight:2,strokeColor:'#dc2626',strokeOpacity:.7,fillColor:'#f97316',fillOpacity:.18}));
   }
   const p=w.points[0];
   if(!p)continue;
   const button=document.createElement('button');
   button.type='button';button.className='sunny-route-map-hazard';button.textContent=w.icon;
   button.setAttribute('aria-label',w.label+' '+w.title);
   button.addEventListener('click',()=>say(w.label+' '+w.title+' · 관측지점 위치'));
   items.push(new kakao.maps.CustomOverlay({map,position:new kakao.maps.LatLng(p.lat,p.lng),
    content:button,zIndex:23,clickable:true}));
  }
 };
 async function collectForRisk(){
  if(data&&Date.now()-riskReceivedAt<=120000)return {status:'received'};
  if(data){data=null;clear();onChange?.();}
  if(riskPending){await riskPending;return {status:data?'received':'unavailable'};}
  if(Date.now()-lastRiskAttempt<120000)return {status:'unavailable'};
  lastRiskAttempt=Date.now();
  riskPending=query().then(result=>{data=result;riskReceivedAt=Date.now();return result;}).catch(()=>null)
   .finally(()=>{riskPending=null;});
  const result=await riskPending;
  if(result){repaint();onChange?.();}
  return {status:result?'received':'unavailable'};
 }
 async function load(){
  if(!toggle?.checked)return;
  const run=++request;
  say('발효 특보 확인 중');
  setLayerReception('navLayerWarning','loading');
  try{
   const cached=data&&Date.now()-riskReceivedAt<=120000?data:null;
   const result=cached||(riskPending?await riskPending:await query());
   if(!result)throw Error('특보 자료 수신 실패');
   if(run!==request||!toggle.checked)return;
   data=result;if(!cached)riskReceivedAt=Date.now();
   const matched=data.warnings.filter(w=>w.geometryStatus==='official_crs84_polygon').length;
   say('발효 특보 '+data.warnings.length+'건 · 지도 표시 '+matched+'건'+
    ' · 공식 특보구역 경계'+(matched<data.warnings.length?' · 일부 구역 경계 미확보':''));
   setLayerReception('navLayerWarning',data.warnings.length?'received':'empty');
   if(matched)await ensureMap();
  }catch(e){
   if(run!==request)return;
   setLayerReception('navLayerWarning',e.reception||'failed');
   data=null;say('기상특보 수신 실패 · '+e.message);
  }
  if(run===request){repaint();onChange();}
 }
 toggle?.addEventListener('change',()=>{
  clearInterval(timer);
  if(toggle.checked){void load();timer=setInterval(()=>{if(!document.hidden)void load();},120000);}
  else{request++;clear();say('');onChange();}
 });
 return {load,collectForRisk,repaint,routeHazards:(route,{forRisk=false}={})=>route&&!route.demo&&(forRisk||toggle?.checked)&&data&&Date.now()-riskReceivedAt<=120000?
  warningRouteHazards(data.warnings,route.rainPath??[],route.departure):[]};
}
