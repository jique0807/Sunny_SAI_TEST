import {buildRoadWeatherHazards} from './road-weather-risk.mjs';
import {setLayerReception} from './layer-reception.mjs';
export function initRoadWeatherOverlay({document,request,getMap,ensureMap,onChange=()=>{}}){
 const toggle=document.getElementById('navLayerRoadWeather'),status=document.getElementById('navRoadWeatherStatus');
 let map=null,markers=[],data=null,pending=null,receivedAt=0,available=false;
 const say=s=>{if(status)status.textContent=s;};
 function clear(){for(const m of markers)m.setMap(null);markers=[];}
 function redraw(){
  clear();if(!toggle?.checked||!map||!globalThis.kakao?.maps||!data)return;
  for(const p of data.items||[]){
   if(Date.now()-Date.parse(p.observedAt)>30*60000)continue;
   const title=p.fog>0?'안개':p.snow>0?'눈':p.rain>0?'비':'맑음';
   const el=document.createElement('button');el.type='button';el.className='nav-map-weather-label';
   el.textContent='도로 '+title;el.title=p.name+' · '+p.observedAt+' · 영상 기반 날씨 분류';
   el.addEventListener('click',()=>say(el.title+' · 도로·차로 일치 미확인'));
   markers.push(new kakao.maps.CustomOverlay({map,position:new kakao.maps.LatLng(p.lat,p.lng),content:el,zIndex:5}));
  }
 }
 async function load(){
  if(!available)return {status:'missing',items:[]};
  if(data&&Date.now()-receivedAt<120000)return data;
  if(pending)return pending;
  setLayerReception('navLayerRoadWeather','loading');
  pending=(async()=>{try{
   data=await request();receivedAt=Date.now();
   setLayerReception('navLayerRoadWeather',data.status==='received'?'received':data.status==='empty'?'empty':'failed');
   say('수신 '+(data.items?.length||0)+'개 지점 · 30분 이내 자료만 사용 · 강수량·시정 실측 아님');
   return data;
  }catch{data=null;setLayerReception('navLayerRoadWeather','failed');say('도로날씨 수신 실패');return {status:'failed',items:[]};}
  finally{pending=null;redraw();onChange();}})();return pending;
 }
 toggle?.addEventListener('change',async()=>{if(toggle.checked){await ensureMap();map=getMap();await load();}redraw();onChange();});
 document.getElementById('navLayerStatusRefresh')?.addEventListener('click',()=>{if(!toggle?.checked)return;receivedAt=0;void load();});
 return {setAvailable(value){available=Boolean(value);if(toggle)toggle.disabled=!available;},setMap(value){map=value;redraw();},redraw,
  collectForRisk:()=>load(),routeHazards:route=>buildRoadWeatherHazards(route,data),clear};
}
