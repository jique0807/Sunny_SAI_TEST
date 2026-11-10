// GK2A RR/CI/FOG original-image inspector. This is NOT a Kakao map overlay.
// Provider product image pixels require an independently validated geographic
// grid/projection before the map-layer toggles or safety engine may use them.
export const GK2A_VIEWABLE=Object.freeze(['RR','CI','FOG']);
const utcLabel=slot=>/^\d{12}$/.test(slot)?
 slot.slice(0,4)+'-'+slot.slice(4,6)+'-'+slot.slice(6,8)+' '+
 slot.slice(8,10)+':'+slot.slice(10,12)+' UTC':'관측시각 미확인';
export function initGk2aInspector({document,fetcher=globalThis.fetch,waitForSession=async()=>{}}={}){
 const el=id=>document.getElementById(id);
 const kind=el('navSatelliteInspectKind'),check=el('navSatelliteInspectCheck'),
  time=el('navSatelliteInspectTime'),view=el('navSatelliteInspectView'),
  status=el('navSatelliteInspectStatus'),img=el('navSatelliteInspectImage');
 let available=false,run=0,selectedKind=null,observations=[],imageURL=null;
 const say=value=>{if(status)status.textContent=value;};
 function clearImage(){
  if(img){img.hidden=true;img.removeAttribute('src');}
  if(imageURL&&globalThis.URL?.revokeObjectURL)URL.revokeObjectURL(imageURL);
  imageURL=null;
 }
 function clear(){
  run++;selectedKind=null;observations=[];clearImage();
  if(time){time.replaceChildren();const option=document.createElement('option');option.value='';option.textContent='자료 목록 검사 전';time.appendChild(option);time.disabled=true;}
  if(view)view.disabled=true;
 }
 function reset(){clear();if(available)say('기상청 GK2A 실제 관측자료를 조회합니다. 지도 투영법·좌표는 아직 검증되지 않았습니다.');}
 async function load(){
  const product=kind?.value;
  if(!available||!GK2A_VIEWABLE.includes(product))return;
  const job=++run;clearImage();selectedKind=null;observations=[];
  if(time)time.disabled=true;if(view)view.disabled=true;if(check)check.disabled=true;
  say('기상청 GK2A '+product+' 파일목록 · 실제 관측시각 확인 중…');
  try{
   await waitForSession();
   const r=await fetcher('/api/gk2a-catalog?kind='+product,{credentials:'same-origin',cache:'no-store'});
   if(!r.ok)throw Error('파일목록 조회 HTTP '+r.status);
   const data=await r.json();
   if(job!==run||!available||kind?.value!==product)return;
   if(data.state!=='received'||!Array.isArray(data.observationTimes)||!data.observationTimes.length){
    say(data.state==='approval_pending'?'GK2A '+product+' API 개별 이용승인 확인 필요':
     'GK2A '+product+' 실제 영상 목록 미확인 · '+(data.detail||'원본 규격 확인 필요'));
    return;
   }
   const list=data.observationTimes.filter(x=>/^\d{12}$/.test(x)).slice(0,20);
   if(!list.length)return;
   selectedKind=product;observations=list;
   if(time){
    time.replaceChildren();
    for(const stamp of list){
     const option=document.createElement('option');
     option.value=stamp;option.textContent=utcLabel(stamp);time.appendChild(option);
    }
    time.disabled=false;
   }
   if(view)view.disabled=false;
   say('기상청 '+product+' 실제 관측시각 '+list.length+'개 확인 · 원본 영상 검증 가능. 카카오맵 위치정합 및 AI 위험점수는 아직 미적용.');
  }catch(e){if(job===run)say('GK2A 파일목록 검사 실패 · '+String(e.message||'실제 공급기관 응답 미확인').slice(0,90));}
  finally{if(job===run&&check)check.disabled=!available;}
 }
 async function preview(){
  if(!available||!selectedKind||kind?.value!==selectedKind||!time?.value||
    !observations.includes(time.value))return;
  const job=++run,utc=time.value,product=selectedKind;clearImage();
  if(view)view.disabled=true;
  say('기상청 '+product+' · '+utcLabel(utc)+' 원본 PNG 확인 중…');
  try{
   await waitForSession();
   const r=await fetcher('/api/gk2a-image?kind='+product+'&utc='+utc,{
    credentials:'same-origin',cache:'no-store'
   });
   if(!r.ok)throw Error('원본 영상 HTTP '+r.status);
   if(!String(r.headers.get('content-type')||'').toLowerCase().includes('image/png')||
      r.headers.get('x-gk2a-observation-utc')!==utc||
      r.headers.get('x-gk2a-product')!==product||
      r.headers.get('x-gk2a-georeferenced')!=='false')
    throw Error('원본 PNG 시각·자료유형 또는 위치검증 상태 불일치');
   const blob=await r.blob();
   if(blob.size<33||blob.size>8*1024*1024)throw Error('원본 PNG 크기 오류');
   if(job!==run||!available||kind?.value!==product)return;
   if(!globalThis.URL?.createObjectURL||!img)throw Error('브라우저에서 영상 미지원');
   imageURL=URL.createObjectURL(blob);
   img.src=imageURL;img.hidden=false;
   say('기상청 '+product+' · '+utcLabel(utc)+' 원본 PNG 수신 확인 · 카카오맵 중첩·실제 경로 위험판단용 좌표는 검증 전');
  }catch(e){if(job===run)say('GK2A 원본 영상 미수신 · '+String(e.message||'기관 응답 확인 필요').slice(0,100));}
  finally{if(job===run&&view)view.disabled=!available||!observations.includes(time?.value);}
 }
 kind?.addEventListener('change',reset);
 check?.addEventListener('click',()=>{void load();});
 view?.addEventListener('click',()=>{void preview();});
 function setAvailable(value){
  available=Boolean(value);
  reset();
  if(kind)kind.disabled=!available;
  if(check)check.disabled=!available;
  if(!available)say('기상청 API 키 미설정 또는 접근 미확인 · GK2A 자료 조회 대기');
 }
 setAvailable(false);
 return {setAvailable,load,preview,clear,isAvailable:()=>available};
}
