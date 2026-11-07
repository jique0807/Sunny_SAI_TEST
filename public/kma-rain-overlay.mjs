import {loadHSRFrame,drawHSROverKakao,radarKstLabel,HSR_MAX_FRAME} from './kma-hsr-overlay.mjs';
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
 const nationalRain=get('navNationalRain'),nationalRadar=get('navNationalRadar'),quick=get('navRadarQuick');
 const sourceTitle=get('navRainSourceTitle'),sourceSub=get('navRainSourceSub'),
  ticks=get('navRainGridTicks'),legendTitle=get('navRainLegendTitle'),
  legendScale=get('navRainLegendScale'),disclaimer=get('navRainGridDisclaimer');
 const panel=get('navRainGridTimeBar'),slider=get('navRainGridLead'),
  status=get('navRainGridStatus'),when=get('navRainGridValid'),
  close=get('navRainGridClose'),minimize=get('navRainGridMinimize'),refresh=get('navRainGridRefresh'),
  play=get('navRainGridPlay'),pause=get('navRainGridPause'),reset=get('navRainGridReset'),
  step=get('navRainGridStep'),badge=get('navRainSwitchBadge'),
  quickLabel=get('navRainToggleLabel');
 let enabled=false,expanded=false,firstValidTime=null,map=null,canvas=null,forecast=null,radarFrame=null,
  source='forecast',requestId=0,controller=null,drawing=false,
  refreshTimer=null,playTimer=null,loadedAt=0;
 const frameCache=new Map(),FRAME_CACHE_MS=240000;
 const hsrCache=new Map(),HSR_CACHE_MS=240000;
 const clearHSRCache=()=>{
  for(const item of hsrCache.values()){if(item?.data?.url)URL.revokeObjectURL(item.data.url);}
  hsrCache.clear();
 };
 const hourLabel=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const reception=get('navHsrReception');
 const received=new Map();
 const renderReception=()=>{
  if(!reception)return;
  reception.innerHTML=Array.from({length:6},(_,i)=>{
   const frame=6-i;
   const states=frame===1?[received.get(1),received.get(0)]:[received.get(frame)];
   const state=states.includes('failed')?'failed':states.includes('loading')?'loading':
    states.every(v=>v==='received')?'received':'idle';
   const label={failed:'실패',loading:'수신 중',received:'수신 완료',idle:'미조회'}[state];
   return '<span data-state="'+state+'" title="'+label+'">'+label+'</span>';
  }).join('');
 };
 const syncLead=()=>{
  const value=Number(slider?.value||0);
  if(source==='radar'){
   if(step)step.textContent=value===0?'최근 관측':'-'+(value*10)+'분';
   if(ticks)ticks.innerHTML='<span>−60분</span><span>−40분</span><span>−20분</span><span>최근</span>';
   return;
  }
  const labels=Array.from({length:4},(_,i)=>firstValidTime===null?'—':hourLabel.format(firstValidTime+i*3600000));
  if(step)step.textContent=labels[value]??'—';
  if(ticks)ticks.innerHTML=labels.map(label=>'<span>'+label+'</span>').join('');
  slider?.setAttribute('aria-valuetext',firstValidTime===null?'예보 시각 확인 전':labels[value]);
 };
 const syncSourceUI=()=>{
  const radar=source==='radar';
  for(const control of [slider,ticks,reception,get('navRainGridPlay')?.parentElement]){
   if(control)control.hidden=!radar;
  }
  renderReception();
  if(sourceTitle)sourceTitle.textContent=source==='radar'?'레이더 실황':'초단기 예보';
  if(sourceSub)sourceSub.textContent=source==='radar'?'HSR 관측':'5km';
  if(slider){
   slider.style.direction=radar?'rtl':'ltr';
   slider.max=source==='radar'?String(HSR_MAX_FRAME):'3';
   slider.setAttribute('aria-label',source==='radar'?
    '레이더 관측 10분 단위 과거시각 선택 (0~60분 전)':'강수예보 유효시각 선택 (0~3시간)');
  }
  if(legendTitle)legendTitle.textContent=source==='radar'?'레이더 에코':'강수량 mm/1h';
  if(legendScale)legendScale.textContent=source==='radar'?
   '상대 강도 색상 · 강수량(mm) 아님':'0.1 · 1 · 3 · 7 · 15 · 30+';
  if(disclaimer)disclaimer.textContent=source==='radar'?
   'HSR 실제 레이더 관측 · 10분 간격 선택 · 최신 자료는 약 30분 지연 조회 · 영상 색으로 강수량 추정 불가':
   '실제 5km 예보 · 결측은 무강수가 아닙니다.';
  syncLead();
 };
 const pausePlayback=()=>{
  if(playTimer!==null){clearInterval(playTimer);playTimer=null;}
  if(play)play.disabled=!enabled;
  if(pause)pause.disabled=true;
 };
 const message=(text,state='idle')=>{
  if(status){status.textContent=text;status.dataset.receiveState=state;}
 };
 const isKakao=()=>Boolean(map&&window.kakao?.maps);
 const updateButtons=()=>{
  if(nationalRain)nationalRain.checked=enabled&&source==='forecast';
  if(nationalRadar)nationalRadar.checked=enabled&&source==='radar';
  quick?.setAttribute('aria-pressed',String(enabled));
  if(quick){
   quick.dataset.rainState=enabled?'on':'off';
   quick.setAttribute('aria-expanded',String(enabled&&expanded));
   quick.setAttribute('aria-label',enabled?'강수예보 켜짐, 팝업 열기':'강수예보 꺼짐, 눌러 켜기');
  }
  if(badge)badge.textContent=enabled?'ON':'OFF';
  if(quickLabel)quickLabel.textContent=source==='radar'?'레이더':'강수예보';
  if(panel)panel.hidden=!(enabled&&expanded);
  document.body.classList.toggle('sunny-rain-grid-active',enabled);
  document.body.classList.toggle('sunny-rain-grid-minimized',enabled&&!expanded);
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
  if(!enabled||!(source==='radar'?radarFrame:forecast)||!isKakao())return;
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
  if(source==='radar'){
   const frames=drawHSROverKakao(ctx,radarFrame,projection,density);
   if(!frames){
    message('레이더 지도 좌표 변환 실패 · 중첩을 표시하지 않았습니다.');
    return;
   }
   message('기상청 HSR 실제 레이더 관측 · '+radarKstLabel(radarFrame.timeKst)+
    ' · 투명 PNG 중첩 · 10분 간격 · 최근 영상 조회는 약 30분 지연 · 강수량(mm) 자료 아님');
   return;
  }
  const bounds=map.getBounds(),sw=bounds.getSouthWest(),ne=bounds.getNorthEast();
  const south=sw.getLat()-.12,north=ne.getLat()+.12,
   west=sw.getLng()-.12,east=ne.getLng()+.12;
  drawRainCells(ctx,forecast.cells,{south,north,west,east},
   p=>projection.containerPointFromCoords(new kakao.maps.LatLng(p.lat,p.lng)));
 }
 async function loadRadar({force=false}={}){
  if(!enabled||source!=='radar')return;
  controller?.abort();controller=new AbortController();const run=++requestId;
  const frame=Number(slider?.value||0);
  for(const [index,state] of received)if(state==='loading')received.delete(index);
  received.set(frame,'loading');renderReception();
  clear();forecast=null;radarFrame=null;
  if(refresh)refresh.disabled=true;
  if(when)when.textContent='실제 HSR 레이더 관측자료 수신 중';
  message('기상청 레이더 투명 PNG와 관측시각 및 LCC 좌표정보를 확인 중입니다.');
  try{
   if(!Number.isInteger(frame)||frame<0||frame>HSR_MAX_FRAME)
    throw Error('레이더 프레임 범위 초과');
   const cache=!force?hsrCache.get(frame):null;
   let data=cache&&cache.until>Date.now()?cache.data:null;
   if(!data){
    data=await loadHSRFrame(frame,{signal:controller.signal,waitForSession});
   }
   if(run!==requestId||!enabled||source!=='radar'){
    if(data&&data!==cache?.data&&data.url)URL.revokeObjectURL(data.url);
    return;
   }
   if(!cache?.data||cache.data!==data){
    const old=hsrCache.get(frame);
    if(old?.data?.url)URL.revokeObjectURL(old.data.url);
    hsrCache.set(frame,{data,until:Date.now()+HSR_CACHE_MS});
   }
   received.set(frame,'received');renderReception();
   radarFrame=data;loadedAt=Date.now();
   if(when)when.textContent='실제 관측 '+radarKstLabel(data.timeKst)+
    ' · 영상 시각 간격 10분';
   paint();
   if(!isKakao())message('레이더 실제 자료 수신 · 카카오 지도 연결 시 중첩됩니다.');
  }catch(e){
   if(run!==requestId||!enabled||source!=='radar'||e?.name==='AbortError')return;
   received.set(frame,'failed');renderReception();
   radarFrame=null;clear();
   message('해당 시각 레이더 미수신 · '+(e?.message||'자료 제공 상태 확인 필요')+
    ' · 실제 영상이 없을 때 가상 강수영역은 표시하지 않습니다.');
   if(when)when.textContent='실제 레이더 관측자료 수신 실패';
  }finally{if(run===requestId&&refresh)refresh.disabled=false;}
 }
 async function load({force=false}={}){
  if(!enabled)return;
  if(source==='radar')return loadRadar({force});
  controller?.abort();controller=new AbortController();const run=++requestId;
  clear();radarFrame=null;forecast=null;
  if(refresh)refresh.disabled=true;
  if(when)when.textContent='실제 강수격자 확인 중';
  message('수신 중','loading');
  try{
   const lead=0;
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
   const validTime=Date.parse(data.validTime);
   if(!Number.isFinite(validTime))throw Error('예보 시각 검증 실패');
   firstValidTime=validTime-lead*3600000;
   syncLead();
   frameCache.set(lead,{data,until:Date.now()+FRAME_CACHE_MS});
   forecast=data;loadedAt=Date.now();
   if(when)when.textContent='예보 발표 '+fmtTime(data.issuedAt)+' · 유효 '+fmtTime(data.validTime);
   const coverage=data.valid===0?' · 유효 격자 없음':data.cells.length===0?' · 유효 격자에 강수 없음':'';
   message('수신 완료'+coverage,'received');
   paint();
  }catch(e){
   if(run!==requestId||!enabled||e?.name==='AbortError')return;
   forecast=null;clear();message('수신 실패 · '+(e?.message||'자료 제공 상태 확인 필요'),'failed');
   if(when)when.textContent='실제 강수격자 수신 실패';
  }finally{if(run===requestId&&refresh)refresh.disabled=false;}
 }
 function stopRefresh(){
  if(refreshTimer!==null){clearInterval(refreshTimer);refreshTimer=null;}
 }
 function startRefresh(){
  stopRefresh();
  if(!enabled)return;
  refreshTimer=setInterval(()=>{
   if(!enabled||document.hidden||playTimer!==null)return;
   if(source==='radar'){
    // Recent KMA HSR frame advances in 10 real-minute increments.
    // Do not automatically replace an explicitly selected older frame.
    if(Number(slider?.value||0)===0){clearHSRCache();void load({force:true});}
   }else{
    frameCache.clear();void load({force:true});
   }
  },600000);
 }
 function setSource(next){
  if(next!=='radar'&&next!=='forecast')return;
  if(source===next)return;
  pausePlayback();++requestId;controller?.abort();
  forecast=null;radarFrame=null;clear();frameCache.clear();clearHSRCache();
  source=next;firstValidTime=null;received.clear();
  if(slider)slider.value='0';
  syncSourceUI();updateButtons();startRefresh();
  if(enabled)void load({force:true});
  else {
   message(source==='radar'?'레이더 실황을 켜면 기상청 HSR 실제 관측영상을 조회합니다.':
    '강수 예보를 켜면 전국 5km 격자값을 조회합니다.');
   if(when)when.textContent='자료 확인 전';
  }
 }
 const imageToggle=get('navForecastImageToggle');
 const imageView=get('navForecastImageView');
 const image=get('navForecastImage');
 const imageStatus=get('navForecastImageStatus');
 const imageLead=get('navForecastImageLead');
 const imagePlay=get('navForecastImagePlay');
 const imageStop=get('navForecastImageStop');
 const imageTime=get('navForecastImageTime');
 let imageController,imageTimer,imageBase;
 const images=new Map();
 function stopImagePlayback(){
  clearInterval(imageTimer);imageTimer=null;
  if(imagePlay)imagePlay.disabled=false;
  if(imageStop)imageStop.disabled=true;
 }
 function hideForecastImage(){
  stopImagePlayback();imageController?.abort();imageController=null;
  if(imageView)imageView.hidden=true;
  image?.removeAttribute?.('src');
  for(const frame of images.values())URL.revokeObjectURL(frame.url);
  images.clear();imageBase=null;
  imageToggle?.setAttribute('aria-pressed','false');
  if(imageToggle)imageToggle.textContent='레이더 영상 시작';
 }
 async function loadForecastImage(){
  imageController?.abort();
  const controller=new AbortController();
  imageController=controller;
  const lead=Number(imageLead.value);
  imageTime.textContent='+'+lead+'분';
  imageStatus.textContent='수신 중';imageStatus.dataset.receiveState='loading';
  try{
   await waitForSession?.();
   let frame=images.get(lead);
   if(!frame){
    const query=new URLSearchParams({lead:String(lead)});
    if(imageBase)query.set('base',imageBase);
    const response=await fetch('/api/radar-frame?'+query,{signal:controller.signal});
    if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error();
    const base=response.headers.get('x-radar-base-time');
    const valid=response.headers.get('x-radar-requested-valid-time');
    if(!base||!valid||imageBase&&base!==imageBase)throw Error();
    const blob=await response.blob();
    if(controller.signal.aborted)return;
    imageBase=base;
    frame={url:URL.createObjectURL(blob),valid};
    images.set(lead,frame);
   }
   if(controller.signal.aborted)return;
   image.src=frame.url;image.hidden=false;
   imageTime.textContent='+'+lead+'분 · '+fmtTime(frame.valid);
   imageStatus.textContent='수신 완료';imageStatus.dataset.receiveState='received';
  }catch{
   if(!controller.signal.aborted){
    image.hidden=true;
    imageStatus.textContent='수신 실패';imageStatus.dataset.receiveState='failed';
   }
  }finally{
   if(imageController===controller)imageController=null;
  }
 }
 imageLead?.addEventListener('input',()=>{stopImagePlayback();void loadForecastImage();});
 imagePlay?.addEventListener('click',()=>{
  if(imageTimer!=null)return;
  imagePlay.disabled=true;
  if(imageStop)imageStop.disabled=false;
  imageTimer=setInterval(()=>{
   if(imageController)return;
   imageLead.value=String(Number(imageLead.value)%120+10);
   void loadForecastImage();
  },2000);
 });
 imageStop?.addEventListener('click',stopImagePlayback);
 imageToggle?.addEventListener('click',()=>{
  if(!imageView||!image||!imageStatus||!imageLead||!imageTime)return;
  if(!imageView.hidden){hideForecastImage();return;}
  imageView.hidden=false;image.hidden=true;imageLead.value='10';
  imageToggle.setAttribute('aria-pressed','true');
  imageToggle.textContent='레이더 영상 종료';
  void loadForecastImage();
 });
 function setEnabled(next){
  enabled=Boolean(next);expanded=enabled;
  if(!enabled){hideForecastImage();received.clear();}
  if(!enabled){firstValidTime=null;if(slider)slider.value='0';}
  pausePlayback();
  updateButtons();syncSourceUI();
  if(enabled){onEnable?.();void load();startRefresh();}
  else{
   ++requestId;controller?.abort();forecast=null;radarFrame=null;clear();
   stopRefresh();loadedAt=0;frameCache.clear();clearHSRCache();
   message(source==='radar'?'레이더 실황을 켜면 기상청 HSR 실제 관측영상을 조회합니다.':
    '강수 예보를 켜면 전국 5km 격자값을 조회합니다.');
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
  if(source==='radar'&&Number(slider.value)===0){
   slider.value=String(HSR_MAX_FRAME);syncLead();void load();
  }
  playTimer=setInterval(()=>{
   if(!enabled||document.hidden){pausePlayback();return;}
   if(source==='radar'){
    if(refresh?.disabled)return;
    const current=Number(slider?.value||0);
    slider.value=String(current===0?HSR_MAX_FRAME:current-1);
   }else slider.value=String((Number(slider?.value||0)+1)%4);
   syncLead();void load();
  },2800);
 }
 for(const [control,mode] of [[nationalRain,'forecast'],[nationalRadar,'radar']]){
  control?.addEventListener('change',()=>{
   if(!control.checked){setEnabled(false);return;}
   if(enabled){expanded=true;setSource(mode);updateButtons();onEnable?.();return;}
   setSource(mode);setEnabled(true);
  });
 }
 quick?.addEventListener('click',()=>{
  expanded=true;
  if(enabled)updateButtons();
  else {setSource('forecast');setEnabled(true);}
 });
 minimize?.addEventListener('click',()=>{
  expanded=false;updateButtons();quick?.focus?.();
 });
 close?.addEventListener('click',()=>setEnabled(false));
 play?.addEventListener('click',startPlayback);
 pause?.addEventListener('click',pausePlayback);
 get('navHsrStop')?.addEventListener('click',()=>{
  pausePlayback();slider.value='0';syncLead();void load();
 });
 get('navOpenHsr')?.addEventListener('click',()=>{
  hideForecastImage();setSource('radar');
 });

 reset?.addEventListener('click',()=>{
  pausePlayback();
  if(slider)slider.value='0';syncLead();
  // Reset only presentation settings; never invent or edit forecast values.
  const opacity=get('navDemoOpacity');
  if(opacity&&opacity.value!=='45'){opacity.value='45';opacity.dispatchEvent(new Event('input',{bubbles:true}));}
  frameCache.clear();clearHSRCache();if(enabled)void load({force:true});
 });
 refresh?.addEventListener('click',()=>{
  frameCache.clear();clearHSRCache();void load({force:true});
 });
 slider?.addEventListener('change',()=>{syncLead();if(enabled)void load();});
 get('navDemoOpacity')?.addEventListener('input',schedule);
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden)pausePlayback();
  else if(enabled&&Date.now()-loadedAt>(source==='radar'?600000:180000)){
   if(source==='radar')clearHSRCache();
   void load({force:true});
  }
 });
 window.addEventListener('resize',schedule);
 window.addEventListener('pagehide',()=>{
  pausePlayback();++requestId;controller?.abort();stopRefresh();clearHSRCache();clear();
 });
 syncSourceUI();updateButtons();pausePlayback();
 return {setMap,redraw:schedule,disable:()=>setEnabled(false),isEnabled:()=>enabled};
}
