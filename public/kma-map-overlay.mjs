// KMA sampled 5-km grid forecast overlays: exact queried cells, no interpolation.
// Works with Kakao Maps and Leaflet. Does not show fabricated radar or snowfall totals.
export function isSnowPty(code){return [2,3,6,7].includes(code);}
export function sampleMapPoints(bounds){
 if(!bounds||[bounds.west,bounds.east,bounds.south,bounds.north].some(v=>!Number.isFinite(v)))return [];
 const samples=[];
 for(const fy of [.20,.50,.80])for(const fx of [.20,.50,.80]){
  const lat=bounds.south+(bounds.north-bounds.south)*fy;
  const lng=bounds.west+(bounds.east-bounds.west)*fx;
  if(lat>=32&&lat<=40&&lng>=123&&lng<=133)samples.push({lat,lng});
 }
 return samples;
}
export function gridPresentation(f,nowcast,rain,snow){
 if(!f)return null;
 const snowing=isSnowPty(f.precipitationType);
 if(snow&&snowing)return {color:'#7550ca',label:[3,7].includes(f.precipitationType)?'눈':'비·눈'};
 if(rain&&(f.rainLabel!=null||f.precipitationType!=null)){
  const present=f.rain>0||f.rainMin>0||f.rainMax>0||[1,2,4,5,6].includes(f.precipitationType);
  return {color:present?'#0b86cc':'#a8bbc8',label:present?(f.rainLabel||'강수 예보'):'강수없음'};
 }
 if(nowcast&&(Number.isFinite(f.temperature)||Number.isFinite(f.windSpeed))){
  return {color:Number.isFinite(f.temperature)?f.temperature<5?'#457bd2':f.temperature>=25?'#d8833f':'#20a587':'#20a587',
   label:Number.isFinite(f.temperature)?f.temperature+'°C':f.windSpeed+'m/s'};
 }
 return null;
}
export function initKmaMapOverlay({query,getContext,fallback,getActiveMap,format}){
 const controlIds=['navLayernowcast','navLayerrain','navLayersnow'];
 const controls=controlIds.map(id=>document.getElementById(id));
 const status=document.getElementById('navKmaStatus');
 const refreshButton=document.getElementById('navKmaRefresh');
 let configured=false,cache=null,painted=[],timer=null,seq=0;
 const enabled=()=>controls.some(c=>c?.checked);
 const message=s=>{if(status)status.textContent='기상청 예보: '+s;};
 function clear(){
  for(const entry of painted){try{
   if(entry.kakao)entry.object.setMap(null);
   else entry.map.removeLayer(entry.object);
  }catch{}}
  painted=[];
 }
 function draw(data){
  clear();
  const ctx=getContext();
  if(!ctx?.ready||!enabled()||!data?.cells)return;
  const [nowcast,rain,snow]=controls.map(c=>Boolean(c?.checked));
  const alpha=Math.max(0,1-Number(document.getElementById('navDemoOpacity')?.value??45)/100);
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let shown=0,snowCells=0;
  for(const cell of data.cells){
   if(cell.status!=='forecast'||!cell.forecast||!Array.isArray(cell.corners))continue;
   const f=cell.forecast;
   if(isSnowPty(f.precipitationType))snowCells++;
   const p=gridPresentation(f,nowcast,rain,snow);
   if(!p)continue;
   const detail=[p.label,Number.isFinite(f.temperature)?'기온 '+f.temperature+'°C':null,
    Number.isFinite(f.windSpeed)?'풍속 '+f.windSpeed+'m/s':null,
    f.rainLabel?'1시간 강수량 '+f.rainLabel:null,
    isSnowPty(f.precipitationType)?'강수형태 '+([3,7].includes(f.precipitationType)?'눈':'비·눈 혼합'):null,
    '기상청 초단기예보 '+format(f.time||data.validTime)+' · 격자 '+cell.grid.nx+','+cell.grid.ny+' · 실황 아님'
   ].filter(Boolean).join(' / ');
   if(ctx.type==='leaflet'&&window.L){
    const polygon=L.polygon(cell.corners.map(c=>[c.lat,c.lng]),{color:p.color,weight:1.5,opacity:.85,
      fillColor:p.color,fillOpacity:alpha}).addTo(ctx.map).bindTooltip(detail,{sticky:true});
    painted.push({map:ctx.map,object:polygon});
    const marker=L.marker([cell.center.lat,cell.center.lng],{interactive:false,icon:L.divIcon({
     className:'sunny-kma-grid-marker',html:'<span>'+escape(p.label)+'</span>',iconSize:[74,25],iconAnchor:[37,12]})}).addTo(ctx.map);
    painted.push({map:ctx.map,object:marker});
   }else if(ctx.type==='kakao'&&window.kakao?.maps){
    const polygon=new kakao.maps.Polygon({map:ctx.map,path:cell.corners.map(c=>new kakao.maps.LatLng(c.lat,c.lng)),
      strokeWeight:1.5,strokeColor:p.color,strokeOpacity:.85,fillColor:p.color,fillOpacity:alpha});
    const popup=document.createElement('div');
    popup.className='sunny-kma-grid-label';popup.textContent=p.label;popup.title=detail;
    const label=new kakao.maps.CustomOverlay({map:ctx.map,
      position:new kakao.maps.LatLng(cell.center.lat,cell.center.lng),
      content:popup,xAnchor:.5,yAnchor:.5,zIndex:4});
    painted.push({kakao:true,object:polygon},{kakao:true,object:label});
    kakao.maps.event.addListener(polygon,'click',()=>{message(detail);});
   }
   shown++;
  }
  const valid=data.cells.filter(c=>c.status==='forecast').length;
  const choices=[nowcast?'기온·풍속':null,rain?'강수':null,snow?'눈/진눈깨비':null].filter(Boolean).join(' · ');
  message(choices+' · 성공 '+valid+'/'+data.cells.length+'개 격자 · 지도 '+shown+'개'+
   (snow?' · 눈 예보 '+snowCells+'개':'')+' · 유효 '+format(data.validTime)+
   ' · 빈 지역은 미조회/미표출, 실황 아님');
 }
 function availability(state){
  configured=Boolean(state);
  for(const c of controls){if(!c)continue;c.disabled=!configured;if(!configured)c.checked=false;}
  if(refreshButton)refreshButton.disabled=!configured||!enabled();
  if(!configured){cache=null;clear();message('KMA_API_KEY 미설정 · 실제 예보 표출 불가');}
  else if(!cache)message('키 등록 · 초단기예보/강수/눈 버튼을 켜서 실제 격자를 조회하세요');
 }
 function geoDistance(a,b){return Math.hypot((a.lat-b.lat)*111,(a.lng-b.lng)*89);}
 async function update(force=false){
  clearTimeout(timer);
  if(!enabled()){++seq;clear();if(refreshButton)refreshButton.disabled=true;return;}
  if(refreshButton)refreshButton.disabled=false;
  if(!configured){clear();message('서버의 기상청 키가 필요합니다');return;}
  const ctx=getContext();
  if(!ctx){clear();message('카카오·일반지도·위성지도에서 표시 가능합니다');return;}
  if(!ctx.ready){clear();message('지도를 더 확대하세요 (일반지도 9 이상 · 카카오 지도 레벨 7 이하)');return;}
  const center={lat:(ctx.north+ctx.south)/2,lng:(ctx.west+ctx.east)/2};
  const age=cache?Date.now()-cache.at:Infinity;
  const distance=cache?geoDistance(center,cache.center):Infinity;
  if(!force&&cache&&age<300000&&distance<12){draw(cache.data);return;}
  if(!force&&cache&&age<120000){clear();message('지도 위치가 변경됐습니다. 「다시 조회」를 눌러 현재 지역을 조회하세요');return;}
  const points=sampleMapPoints(ctx);
  if(!points.length){clear();message('대한민국 지도 범위로 이동해주세요');return;}
  const requestId=++seq;clear();
  message('기상청 초단기예보 조회 중 · 표본 격자 최대 9개');
  if(refreshButton)refreshButton.disabled=true;
  try{
   const data=await query(points);
   if(requestId!==seq||!enabled())return;
   if(!data?.cells?.some(c=>c.status==='forecast')){
    cache=null;message('조회 실패 · '+(data?.cells?.[0]?.error||'실제 기상청 데이터가 없습니다'));return;
   }
   cache={data,center,at:Date.now()};draw(data);
  }catch(e){if(requestId===seq){clear();message('외부 데이터 조회 실패 · '+(e.message||'다시 시도해주세요'));}}
  finally{if(requestId===seq&&refreshButton)refreshButton.disabled=false;}
 }
 function schedule(){
  if(!enabled())return;
  clearTimeout(timer);timer=setTimeout(()=>update(false),700);
 }
 for(const c of controls)c?.addEventListener('change',()=>{
  if(!enabled()){update();return;}
  if(!getContext()&&getActiveMap()==='schematic'){fallback();return;}
  update(false);
 });
 refreshButton?.addEventListener('click',()=>update(true));
 return {availability,update,schedule,updateOpacity:()=>{if(enabled()&&cache)draw(cache.data);},clear};
}
