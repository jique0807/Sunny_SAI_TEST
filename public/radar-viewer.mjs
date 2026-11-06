// Official KMA forecast image viewer. The KMA image contains its own basemap;
// its pixel coordinates are NOT registered to Kakao road coordinates.
export const FORECAST_LEADS=Object.freeze([0,30,60,90,120]);
export function radarTimeLabel(iso){
 const time=Date.parse(iso||'');
 return Number.isFinite(time)?new Date(time).toLocaleString('ko-KR',{
  timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false
 }):'확인되지 않음';
}
export function initRadarViewer({onOpen}={}){
 const get=id=>document.getElementById(id);
 const panel=get('navRadarPanel'),toggle=get('navRadarToggle'),quick=get('navRadarQuick');
 const close=get('navRadarClose'),refresh=get('navRadarRefresh'),slider=get('navRadarLead');
 const img=get('navRadarImage'),status=get('navRadarStatus'),time=get('navRadarTime');
 let opened=false,abort=null,seq=0,currentUrl=null,timer=null;
 const message=s=>{if(status)status.textContent=s;};
 const clearImage=()=>{
  if(img){img.hidden=true;img.removeAttribute('src');}
  if(currentUrl){URL.revokeObjectURL(currentUrl);currentUrl=null;}
 };
 async function load(){
  if(!opened||!img||!slider)return;
  const lead=Number(slider.value);
  if(!FORECAST_LEADS.includes(lead)){message('허용되지 않는 예측 시각입니다.');return;}
  abort?.abort();abort=new AbortController();const run=++seq;
  if(refresh)refresh.disabled=true;
  message('기상청 실제 강수예측 영상 조회 중…');
  if(time)time.textContent='기준시각 확인 중 · +'+lead+'분';
  try{
   const response=await fetch('/api/radar-frame?lead='+lead,{
    method:'GET',credentials:'same-origin',cache:'no-store',signal:abort.signal,
    headers:{Accept:'image/png,image/jpeg,image/webp,image/gif'}
   });
   if(!response.ok){
    let reason='HTTP '+response.status;
    try{const data=await response.json();if(typeof data.error==='string')reason=data.error.slice(0,130);}catch{}
    throw Error(reason);
   }
   const type=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
   if(!['image/png','image/jpeg','image/webp','image/gif'].includes(type))throw Error('영상 형식을 확인할 수 없습니다.');
   const blob=await response.blob();
   if(run!==seq||!opened)return;
   if(!blob.size||blob.size>3*1024*1024)throw Error('유효한 영상 크기가 아닙니다.');
   const url=URL.createObjectURL(blob);
   const previous=currentUrl;currentUrl=url;
   img.onload=()=>{if(run===seq&&opened){img.hidden=false;message('기상청 강수예측 영상 수신 · 지도 배경 포함 · 카카오 지도 중첩 아님');}};
   img.onerror=()=>{if(run===seq&&opened){img.hidden=true;message('수신한 이미지를 화면에 표시하지 못했습니다.');}};
   img.src=url;
   if(previous)URL.revokeObjectURL(previous);
   const base=response.headers.get('x-radar-base-time');
   const valid=response.headers.get('x-radar-requested-valid-time');
   if(time)time.textContent='요청 기준 '+radarTimeLabel(base)+' · +'+lead+'분'+
    (valid?' (요청 유효 '+radarTimeLabel(valid)+')':'');
  }catch(e){
   if(run!==seq||!opened||e?.name==='AbortError')return;
   clearImage();message('영상 없음 · '+(e.message||'기상청 응답을 확인하지 못했습니다.'));
   if(time)time.textContent='선택 시간 +'+lead+'분 · 확인된 영상 없음';
  }finally{if(run===seq&&refresh)refresh.disabled=false;}
 }
 function setOpen(show){
  if(!panel)return;opened=Boolean(show);
  panel.hidden=!opened;
  toggle?.setAttribute('aria-expanded',String(opened));
  quick?.setAttribute('aria-expanded',String(opened));
  if(opened){
   onOpen?.();
   load();
   if(!timer)timer=setInterval(()=>{if(!document.hidden)load();},300000);
  }else{
   ++seq;abort?.abort();abort=null;clearInterval(timer);timer=null;
   clearImage();if(time)time.textContent='자료 확인 전';
   message('선택 시각의 실제 영상만 표시합니다.');
  }
 }
 toggle?.addEventListener('click',()=>setOpen(!opened));
 quick?.addEventListener('click',()=>setOpen(!opened));
 close?.addEventListener('click',()=>setOpen(false));
 refresh?.addEventListener('click',()=>load());
 slider?.addEventListener('change',()=>load());
 document.addEventListener('visibilitychange',()=>{if(opened&&!document.hidden)load();});
 window.addEventListener('pagehide',()=>{setOpen(false);});
 return{open:()=>setOpen(true),close:()=>setOpen(false),isOpen:()=>opened,refresh:load};
}
