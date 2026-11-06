// Georegistered nationwide KMA 5-km 1-hour rainfall forecast drawn *over* Kakao.
// No second basemap, invented rain cells or spatial interpolation.
// Kakao MapProjection.containerPointFromCoords aligns with the actual map viewport.
const rad=Math.PI/180,re=6371.00877/5,slat1=30*rad,slat2=60*rad,lon0=126*rad;
const sn=Math.log(Math.cos(slat1)/Math.cos(slat2))/
 Math.log(Math.tan(Math.PI/4+slat2/2)/Math.tan(Math.PI/4+slat1/2));
const sf=Math.tan(Math.PI/4+slat1/2)**sn*Math.cos(slat1)/sn;
const ro=re*sf/Math.tan(Math.PI/4+38*rad/2)**sn;
export function gridCorner(nx,ny){
 if(!Number.isFinite(nx)||!Number.isFinite(ny)||nx<.5||nx>149.5||ny<.5||ny>253.5)
  throw Error('격자 좌표 범위 초과');
 const x=nx-43,y=ro+136-ny,r=Math.hypot(x,y);
 return {lat:(2*Math.atan((re*sf/r)**(1/sn))-Math.PI/2)/rad,
  lng:(lon0+Math.atan2(x,y)/sn)/rad};
}
export const rainShade=mm=>!Number.isFinite(mm)||mm<=0?null:
 mm>=30?'#56369b':mm>=15?'#2261b6':mm>=7?'#0872cd':
 mm>=3?'#149ee0':mm>=1?'#43c2f1':'#8bdef6';
export function gridCellCorners(nx,ny){
 return [gridCorner(nx-.5,ny-.5),gridCorner(nx+.5,ny-.5),
  gridCorner(nx+.5,ny+.5),gridCorner(nx-.5,ny+.5)];
}
// Pure renderer used by the real canvas and repeatable geometry tests.
// Only returned nonzero KMA cells are painted; no fallback or simulated precipitation.
export function drawRainCells(ctx,cells,bounds,project){
 let drawn=0;
 for(const [nx,ny,mm] of cells){
  const color=rainShade(mm);if(!color)continue;
  const center=gridCorner(nx,ny);
  if(center.lat<bounds.south||center.lat>bounds.north||
     center.lng<bounds.west||center.lng>bounds.east)continue;
  const points=gridCellCorners(nx,ny).map(project);
  if(points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))continue;
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
  ctx.closePath();ctx.fill();drawn++;
 }
 return drawn;
}
const fmtTime=iso=>{
 const t=Date.parse(iso||'');
 return Number.isFinite(t)?new Date(t).toLocaleString('ko-KR',{
  timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',
  minute:'2-digit',hour12:false}):'시간 확인 불가';
};
export function initNationalRainOverlay({onEnable,waitForSession}={}){
 const get=id=>document.getElementById(id);
 const toggle=get('navRadarToggle'),quick=get('navRadarQuick');
 const panel=get('navRainGridTimeBar'),slider=get('navRainGridLead'),
  status=get('navRainGridStatus'),when=get('navRainGridValid'),
  close=get('navRainGridClose'),refresh=get('navRainGridRefresh'),
  play=get('navRainGridPlay'),pause=get('navRainGridPause'),reset=get('navRainGridReset'),
  step=get('navRainGridStep'),badge=get('navRainSwitchBadge'),
  quickLabel=get('navRainToggleLabel');
 let enabled=false,map=null,canvas=null,forecast=null,requestId=0,controller=null,
  drawing=false,refreshTimer=null,playTimer=null,loadedAt=0;
 const frameCache=new Map(),FRAME_CACHE_MS=240000;
 const syncLead=()=>{if(step)step.textContent='+'+String(slider?.value||0)+'시간';};
 const pausePlayback=()=>{
  if(playTimer!==null){clearInterval(playTimer);playTimer=null;}
  if(play)play.disabled=!enabled;
  if(pause)pause.disabled=true;
 };
 const message=t=>{if(status)status.textContent=t;};
 const isKakao=()=>Boolean(map&&window.kakao?.maps);
 const updateButtons=()=>{
  toggle?.setAttribute('aria-pressed',String(enabled));
  quick?.setAttribute('aria-pressed',String(enabled));
  if(quick){
   quick.dataset.rainState=enabled?'on':'off';
   quick.setAttribute('aria-label',enabled?'강수예보 켜짐, 눌러 끄기':'강수예보 꺼짐, 눌러 켜기');
  }
  if(badge)badge.textContent=enabled?'ON':'OFF';
  if(quickLabel)quickLabel.textContent='강수예보';
  if(toggle)toggle.textContent=enabled?'🌧 전국 강수예보 중첩 ON · 끄기':'🌧 전국 강수예보 중첩 OFF · 켜기';
  if(panel)panel.hidden=!enabled;
  document.body.classList.toggle('sunny-rain-grid-active',enabled);
 };
 function clear(){
  if(canvas){canvas.remove();canvas=null;}
 }
 function schedule(){
  if(drawing||!enabled)return;
  // Throttle geo-projection to 10 Hz while the user pans/zooms or GPS follows.
  drawing=true;setTimeout(()=>{drawing=false;paint();},100);
 }
 function paint(){
  if(!enabled||!forecast||!isKakao())return;
  const container=get('kakaoMap');if(!container||container.hidden||!container.clientWidth||!container.clientHeight)return;
  const projection=map.getProjection?.();
  if(!projection||typeof projection.containerPointFromCoords!=='function'){
   message('카카오맵 좌표 변환을 확인하지 못해 강수영역을 표시하지 않았습니다.');return;
  }
  const width=container.clientWidth,height=container.clientHeight;
  const density=Math.min(2,Math.max(1,window.devicePixelRatio||1));
  let node=canvas;
  if(!node||node.parentElement!==container){
   node=document.createElement('canvas');node.className='sunny-rain-grid-canvas';
   container.appendChild(node);canvas=node;
  }
  // Resetting dimensions clears only our overlay; the underlying Kakao map stays intact.
  node.width=Math.round(width*density);node.height=Math.round(height*density);
  node.style.width=width+'px';node.style.height=height+'px';
  const ctx=node.getContext('2d');if(!ctx)return;
  ctx.setTransform(density,0,0,density,0,0);
  const opacity=Number(get('navDemoOpacity')?.value||45);
  ctx.globalAlpha=Math.max(.16,Math.min(.85,1-opacity/100));
  const bounds=map.getBounds(),sw=bounds.getSouthWest(),ne=bounds.getNorthEast();
  const south=sw.getLat()-.12,north=ne.getLat()+.12,
   west=sw.getLng()-.12,east=ne.getLng()+.12;
  const drawn=drawRainCells(ctx,forecast.cells,{south,north,west,east},
   p=>projection.containerPointFromCoords(new kakao.maps.LatLng(p.lat,p.lng)));
  const dry=forecast.valid-forecast.cells.length;
  const summary=forecast.cells.length===0
   ?'정상 수신 · 유효 격자 중 강수 예보 0개 → 표시할 강수 색상 없음'
   :'정상 수신 · 전국 강수 '+forecast.cells.length+'격자 · 현재 지도 '+drawn+'격자'+
    (drawn===0?' (현재 지도 범위에는 강수 없음 또는 표시 범위 밖)':'');
  message(summary+' · '+fmtTime(forecast.validTime)+
   ' · 유효 무강수 '+dry+'격자 / 결측 '+forecast.missing+'격자'+
   ' · 결측은 무강수가 아님 · 레이더 실황 아님');
 }
 async function load({force=false}={}){
  if(!enabled)return;
  controller?.abort();controller=new AbortController();const run=++requestId;
  clear();forecast=null;
  if(refresh)refresh.disabled=true;
  if(when)when.textContent='실제 강수격자 확인 중';
  message('기상청 전국 RN1 강수예보 5km 격자를 확인하고 있습니다.');
  try{
   const lead=Number(slider?.value||0);
   if(!Number.isInteger(lead)||lead<0||lead>3)throw Error('허용되지 않은 예측시간');
   if(typeof waitForSession==='function')await waitForSession();
   if(run!==requestId||!enabled)return;
   const cached=!force?frameCache.get(lead):null;
   let data=cached&&cached.until>Date.now()?cached.data:null;
   if(!data){
    const response=await fetch('/api/rain-grid?lead='+lead,{
     credentials:'same-origin',cache:'no-store',signal:controller.signal});
    if(!response.ok){
     let reason='기상청 응답 HTTP '+response.status;
     try{const v=await response.json();if(typeof v.error==='string')reason=v.error.slice(0,130);}catch{}
     throw Error(reason);
    }
    data=await response.json();
   }
   if(run!==requestId||!enabled)return;
   if(data.provider!=='kma'||data.nx!==149||data.ny!==253||!Array.isArray(data.cells)||
     !Number.isInteger(data.valid)||!Number.isInteger(data.missing)||
     data.valid+data.missing!==37697)
     throw Error('강수예보 전체 격자 검증 실패');
   if(data.cells.length>37697||data.cells.some(c=>!Array.isArray(c)||c.length!==3||
     !Number.isInteger(c[0])||!Number.isInteger(c[1])||c[0]<1||c[0]>149||
     c[1]<1||c[1]>253||!Number.isFinite(c[2])||c[2]<=0))
     throw Error('강수예보 격자값 검증 실패');
   frameCache.set(lead,{data,until:Date.now()+FRAME_CACHE_MS});
   forecast=data;loadedAt=Date.now();
   if(when)when.textContent='예보 발표 '+fmtTime(data.issuedAt)+' · 유효 '+fmtTime(data.validTime);
   if(data.cells.length===0){
    message('정상 수신 · 유효 격자 '+data.valid.toLocaleString('ko-KR')+
     '개 모두 강수량 0 · 결측 '+data.missing.toLocaleString('ko-KR')+
     '개는 미확인 · 지도에 칠할 강수영역 없음');
   }
   paint();
   if(!isKakao())message('강수자료 수신 · 카카오맵 연결 후 지도 위에 표시됩니다.');
  }catch(e){
   if(run!==requestId||!enabled||e?.name==='AbortError')return;
   forecast=null;clear();message('강수 격자 미수신 · '+(e?.message||'자료 제공 상태 확인 필요')+
     ' · 미조회 지역을 무강수로 판단하지 마세요.');
   if(when)when.textContent='실제 강수격자 수신 실패';
  }finally{if(run===requestId&&refresh)refresh.disabled=false;}
 }
 function setEnabled(next){
  enabled=Boolean(next);
  if(!enabled)pausePlayback();
  updateButtons();syncLead();
  if(enabled){
   onEnable?.();load();
   if(!refreshTimer)refreshTimer=setInterval(()=>{if(!document.hidden){frameCache.clear();load({force:true});}},300000);
  }else{
   ++requestId;controller?.abort();forecast=null;clear();
   clearInterval(refreshTimer);refreshTimer=null;loadedAt=0;frameCache.clear();
   message('강수 예보를 켜면 전국 5km 격자값을 조회합니다.');
   if(when)when.textContent='자료 확인 전';
  }
 }
 function setMap(next){
  if(map===next){schedule();return;}
  map=next;clear();
  if(isKakao()){
   kakao.maps.event.addListener(map,'idle',schedule);
   kakao.maps.event.addListener(map,'center_changed',schedule);
   kakao.maps.event.addListener(map,'zoom_changed',schedule);
   schedule();
  }
 }
 function startPlayback(){
  if(!enabled||playTimer!==null)return;
  if(play)play.disabled=true;
  if(pause)pause.disabled=false;
  playTimer=setInterval(()=>{
   if(!enabled||document.hidden){pausePlayback();return;}
   slider.value=String((Number(slider?.value||0)+1)%4);
   syncLead();void load();
  },2800);
 }
 toggle?.addEventListener('click',()=>setEnabled(!enabled));
 quick?.addEventListener('click',()=>setEnabled(!enabled));
 close?.addEventListener('click',()=>setEnabled(false));
 play?.addEventListener('click',startPlayback);
 pause?.addEventListener('click',pausePlayback);
 reset?.addEventListener('click',()=>{
  pausePlayback();
  if(slider)slider.value='0';syncLead();
  // Reset only presentation settings; never invent or edit forecast values.
  const opacity=get('navDemoOpacity');
  if(opacity&&opacity.value!=='45'){opacity.value='45';opacity.dispatchEvent(new Event('input',{bubbles:true}));}
  frameCache.clear();if(enabled)void load({force:true});
 });
 refresh?.addEventListener('click',()=>{frameCache.clear();void load({force:true});});
 slider?.addEventListener('change',()=>{syncLead();if(enabled)void load();});
 get('navDemoOpacity')?.addEventListener('input',schedule);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pausePlayback();else if(enabled&&Date.now()-loadedAt>180000)load({force:true});});
 window.addEventListener('resize',schedule);
 window.addEventListener('pagehide',()=>{pausePlayback();controller?.abort();clearInterval(refreshTimer);});
 updateButtons();syncLead();pausePlayback();
 return {setMap,redraw:schedule,disable:()=>setEnabled(false),isEnabled:()=>enabled};
}
