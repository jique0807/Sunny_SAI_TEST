import {setLayerReception} from './layer-reception.mjs';
export function warningRouteHazards(warnings,path,departure){
 const hazards=[];
 for(const warning of warnings){
  // An AWS point identifies its own warning region only. Proximity is not a boundary test.
  const point=path.find(p=>warning.points.some(s=>
   Math.hypot((p.lat-s.lat)*111000,(p.lng-s.lng)*90000)<=500));
  if(!point)continue;
  const eta=Date.parse(departure)+point.seconds*1000;
  hazards.push({...warning,...point,label:warning.label,kind:'warning',
   eta:Number.isFinite(eta)?new Date(eta).toISOString():null,
   provider:'기상청 특보현황 · 경로 500m 이내 관측지점 기준'});
 }
 return hazards;
}
export function initWarningOverlay({query,getMap,ensureMap,onChange}){
 const toggle=document.getElementById('navLayerWarning'),status=document.getElementById('navWarningStatus');
 let data=null,items=[],request=0,timer=null,lastVerifiedAt=0;
 const say=text=>{if(status)status.textContent=text;};
 const clear=()=>{for(const item of items)item.setMap(null);items=[];};
 const repaint=()=>{
  clear();
  if(!toggle?.checked||!data)return;
  const map=getMap();
  if(!map)return;
  for(const w of data.warnings){
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
 // Route risk ingestion is independent of the user's map-layer switch.
 // Official station proximity is a caution only, never a verified warning polygon.
 async function load({forRisk=false}={}){
  if(!forRisk&&!toggle?.checked)return;
  const run=++request;
  if(!forRisk){say('발효 특보 확인 중');setLayerReception('navLayerWarning','loading');}
  try{
   const result=await query();
   if(run!==request||(!forRisk&&!toggle?.checked))return;
   data=result;lastVerifiedAt=Date.now();
   const matched=data.warnings.filter(w=>w.points.length).length;
   if(!forRisk){
    say('발효 특보 '+data.warnings.length+'건 · 지도 표시 '+matched+'건'+
     (data.stationError?' · 관측지점 조회 실패':' · 관측지점 위치'));
    setLayerReception('navLayerWarning',data.warnings.length?'received':'empty');
    if(matched)await ensureMap();
   }
  }catch(e){
   if(run!==request)return;
   if(!forRisk)setLayerReception('navLayerWarning',e.reception||'failed');
   data=null;lastVerifiedAt=0;
   if(!forRisk)say('기상특보 수신 실패 · '+e.message);
  }
  if(run===request){repaint();onChange();}
 }
 toggle?.addEventListener('change',()=>{
  clearInterval(timer);
  if(toggle.checked){void load();timer=setInterval(()=>{if(!document.hidden)void load();},120000);}
  else{request++;clear();say('');onChange();}
 });
 return {load,repaint,loadForRisk:()=>load({forRisk:true}),
  // An old "active warning" response is NOT authoritative forever.
  routeHazards:route=>route&&!route.demo&&data&&lastVerifiedAt>0&&
   Date.now()-lastVerifiedAt<=10*60000?
   warningRouteHazards(data.warnings,route.rainPath??[],route.departure):[]};
}
