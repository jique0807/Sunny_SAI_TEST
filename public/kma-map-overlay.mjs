// KMA genuine 5 km grid forecast mosaic on Kakao / Leaflet maps.
// Only individually fetched grid cells may be coloured. No weather extrapolation.
export function isSnowPty(code){return [2,3,6,7].includes(code);}
export function sampleMapPoints(bounds){
 if(!bounds||[bounds.west,bounds.east,bounds.south,bounds.north].some(v=>!Number.isFinite(v))||
  bounds.west>=bounds.east||bounds.south>=bounds.north)return[];
 const positions=[.125,.375,.625,.875],points=[];
 for(const fy of positions)for(const fx of positions){
  const lat=bounds.south+(bounds.north-bounds.south)*fy;
  const lng=bounds.west+(bounds.east-bounds.west)*fx;
  if(lat>=32&&lat<=40&&lng>=123&&lng<=133)points.push({lat,lng});
 }
 return points;
}
export function rainColor(f){
 if(!f||f.rainLabel==null&&f.precipitationType==null)return null;
 const candidate=Number.isFinite(f.rain)?f.rain: Number.isFinite(f.rainMin)&&f.rainMin>0?f.rainMin:
  Number.isFinite(f.rainMax)&&f.rainMax>0?Math.min(f.rainMax,.8):null;
 if(candidate===0&&![1,2,4,5,6,7].includes(f.precipitationType))return null;
 if(candidate===null&&!([1,2,4,5,6,7].includes(f.precipitationType)))return null;
 const mm=candidate===null?.2:candidate;
 if(mm>=30)return '#56369b';
 if(mm>=15)return '#2261b6';
 if(mm>=7)return '#0872cd';
 if(mm>=3)return '#149ee0';
 if(mm>=1)return '#43c2f1';
 return '#8bdef6';
}
export function gridPresentation(f,nowcast,rain,snow){
 if(!f)return null;
 if(snow&&isSnowPty(f.precipitationType))
  return {color:'#8657c4',label:[3,7].includes(f.precipitationType)?'눈':'비·눈',kind:'snow'};
 if(rain){
  const color=rainColor(f);
  if(color)return {color,label:f.rainLabel||'강수형태 예보',kind:'rain'};
 }
 if(nowcast&&(Number.isFinite(f.temperature)||Number.isFinite(f.windSpeed))){
  const c=Number.isFinite(f.temperature)?f.temperature<5?'#457bd2':f.temperature>=25?'#d8833f':'#20a587':'#20a587';
  return {color:c,label:Number.isFinite(f.temperature)?f.temperature+'°C':f.windSpeed+'m/s',kind:'temperature'};
 }
 return null;
}
export function forecastForHour(cell,lead){
 if(!cell||cell.status!=='forecast')return null;
 return Array.isArray(cell.forecasts)?cell.forecasts[lead]||null:lead===0?cell.forecast||null:null;
}
export function initKmaMapOverlay({query,getContext,fallback,getActiveMap,format}){
 const controls=['navLayernowcast','navLayerrain','navLayersnow'].map(id=>document.getElementById(id));
 const status=document.getElementById('navKmaStatus');
 const refresh=document.getElementById('navKmaRefresh');
 const panel=document.getElementById('navWeatherTimeBar');
 const slider=document.getElementById('navWeatherTimeRange');
 const timeLabel=document.getElementById('navWeatherTimeLabel');
 const close=document.getElementById('navWeatherTimeClose');
 let configured=false,cache=null,painted=[],timer=null,seq=0,lead=0;
 const enabled=()=>controls.some(c=>c?.checked);
 const message=s=>{if(status)status.textContent='기상청 지도예보: '+s;};
 function clear(){
  for(const o of painted)try{if(o.kakao)o.item.setMap(null);else o.map.removeLayer(o.item);}catch{}
  painted=[];
 }
 function timePanel(){
  if(panel)panel.hidden=!enabled()||!configured;
  if(refresh)refresh.disabled=!enabled()||!configured;
 }
 function timing(data){
  const iso=data?.validTimes?.[lead];
  if(timeLabel)timeLabel.textContent=iso?
   new Date(iso).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' 예보':
   '현재 +'+lead+'시간 · 자료 조회 전';
 }
 function draw(data){
  clear();timePanel();timing(data);
  const ctx=getContext();
  if(!ctx?.ready||!enabled()||!data?.cells)return;
  const [nowcast,rain,snow]=controls.map(c=>Boolean(c?.checked));
  const alpha=Math.max(.05,1-Number(document.getElementById('navDemoOpacity')?.value??45)/100);
  let drawn=0,wet=0,snowing=0,valid=0;
  for(const cell of data.cells){
   const f=forecastForHour(cell,lead);
   if(!f||!Array.isArray(cell.corners)||!cell.corners.length)continue;
   valid++;
   if(rainColor(f))wet++;
   if(isSnowPty(f.precipitationType))snowing++;
   const style=gridPresentation(f,nowcast,rain,snow);
   if(!style)continue;drawn++;
   const text=[style.label,
    Number.isFinite(f.rain)?'1시간 강수량 '+f.rain+'mm':f.rainLabel?'1시간 강수량 '+f.rainLabel:null,
    Number.isFinite(f.temperature)?'기온 '+f.temperature+'°C':null,
    isSnowPty(f.precipitationType)?'강수형태 눈/진눈깨비 예보':null,
    '기상청 5km 격자 '+cell.grid.nx+','+cell.grid.ny,
    '유효시각 '+format(f.time||data.validTimes?.[lead]||data.validTime),
    '레이더 실황 아님'].filter(Boolean).join(' · ');
   if(ctx.type==='leaflet'&&window.L){
    const polygon=L.polygon(cell.corners.map(c=>[c.lat,c.lng]),
     {color:style.color,weight:.5,opacity:.32,fillColor:style.color,fillOpacity:Math.min(alpha,.8)})
     .addTo(ctx.map).bindTooltip(text,{sticky:true});
    polygon.bringToBack();
    painted.push({map:ctx.map,item:polygon});
   }else if(ctx.type==='kakao'&&window.kakao?.maps){
    const polygon=new kakao.maps.Polygon({map:ctx.map,
     path:cell.corners.map(c=>new kakao.maps.LatLng(c.lat,c.lng)),zIndex:1,
     strokeWeight:0,strokeOpacity:0,fillColor:style.color,fillOpacity:Math.min(alpha,.8)});
    kakao.maps.event.addListener(polygon,'click',()=>message(text));
    painted.push({kakao:true,item:polygon});
   }
  }
  const choices=[rain?'강수분포':null,snow?'눈/진눈깨비':null,nowcast?'기온·바람':null].filter(Boolean).join(' + ');
  message(choices+' · 유효 '+format(data.validTimes?.[lead]||data.validTime)+
   ' · 실제 격자 '+valid+'/'+data.cells.length+'개, 표출 '+drawn+'개'+
   (rain?' · 강수 격자 '+wet+'개':'')+(snow?' · 눈/혼합 '+snowing+'개':'')+
   ' · 색이 없는 지역은 강수없음 또는 미조회 · 실황 아님');
 }
 function availability(value){
  configured=Boolean(value);
  for(const c of controls){if(!c)continue;c.disabled=!configured;if(!configured)c.checked=false;}
  if(!configured){++seq;clear();cache=null;message('KMA_API_KEY 설정 전에는 실제 강수영역을 표시하지 않습니다');}
  else if(!cache)message('강수 버튼을 켜면 지도 위치의 실제 초단기예보 격자를 불러옵니다');
  timePanel();
 }
 async function update(force=false){
  clearTimeout(timer);
  if(!enabled()){++seq;clear();timePanel();return;}
  timePanel();
  if(!configured){clear();message('기상청 키가 필요합니다');return;}
  const ctx=getContext();
  if(!ctx){clear();message('카카오 또는 일반지도를 선택하세요');return;}
  if(!ctx.ready){clear();message('지도를 확대하세요 (카카오 7레벨 이하 · 일반지도 9 이상)');return;}
  const center={lat:(ctx.south+ctx.north)/2,lng:(ctx.west+ctx.east)/2};
  const age=cache?Date.now()-cache.at:Infinity;
  const distance=cache?Math.hypot((center.lat-cache.center.lat)*111,(center.lng-cache.center.lng)*89):Infinity;
  if(!force&&cache&&age<300000&&distance<12){draw(cache.data);return;}
  if(!force&&cache&&age<120000){clear();message('지도를 이동했습니다. 「현재 지도 범위 다시 조회」를 눌러주세요');return;}
  const points=sampleMapPoints(ctx);
  if(!points.length){clear();message('대한민국 영역으로 지도를 이동하세요');return;}
  const requestId=++seq;clear();message('기상청 실제 격자 예보 수신 중 · 최대 16개, 시각별 4장');
  if(refresh)refresh.disabled=true;
  try{
   const data=await query(points);
   if(requestId!==seq||!enabled())return;
   if(!data?.cells?.some(c=>c.status==='forecast')){
    cache=null;message('조회된 기상청 예보 없음 · 키 권한/발표시각 확인 필요');return;
   }
   cache={data,center,at:Date.now()};draw(data);
  }catch(e){if(requestId===seq){clear();message('강수영역 조회 실패 · '+(e.message||'API 상태를 확인하세요'));}}
  finally{if(requestId===seq)timePanel();}
 }
 function schedule(){if(!enabled())return;clearTimeout(timer);timer=setTimeout(()=>update(),650);}
 for(const c of controls)c?.addEventListener('change',()=>{
  if(!enabled()){update();return;}
  if(!getContext()&&getActiveMap()==='schematic'){fallback();return;}
  update();
 });
 slider?.addEventListener('input',()=>{
  lead=Math.max(0,Math.min(3,Number(slider.value)||0));
  if(cache)draw(cache.data);else timing();
 });
 close?.addEventListener('click',()=>{
  for(const c of controls)if(c)c.checked=false;
  update();
 });
 refresh?.addEventListener('click',()=>update(true));
 timePanel();timing();
 return {availability,update,schedule,updateOpacity:()=>{if(enabled()&&cache)draw(cache.data);},clear};
}
