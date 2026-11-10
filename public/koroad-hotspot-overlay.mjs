// Historical KOROAD TAAS pedestrian collision clusters, not live warnings.
// Only validated API coordinates can create map overlays.
export function displayablePedestrianHotspots(data){
 if(data?.status!=='received'||!Array.isArray(data.items))return[];
 return data.items.filter(p=>p?.historic===true&&p.live===false&&p.year==='2024'&&
   Number.isFinite(p.lat)&&p.lat>=37.49&&p.lat<=37.65&&Number.isFinite(p.lng)&&p.lng>=126.90&&p.lng<=127.09&&
   Number.isInteger(p.accidentCount)&&p.accidentCount>=0).slice(0,60);
}
export function initKoroadHotspotOverlay({document,request,getContext,ensureMap}){
 const control=document.getElementById('navLayerPedestrianHotspots');
 const status=document.getElementById('navPedestrianHotspotStatus');
 const available=()=>Boolean(control&&!control.disabled);
 let data=null,items=[],seq=0,loading=false;
 const say=s=>{if(status)status.textContent=s};
 function clear(){for(const item of items)try{item.setMap(null)}catch{}items=[];}
 function repaint(){
  clear();if(!control?.checked||!data)return;
  const records=displayablePedestrianHotspots(data);
  if(!records.length){say(data.status==='empty'?'2024년 서울 중구에 제공된 사고다발지역 자료 없음':data.reason||'사고다발지역 좌표 확인 실패');return;}
  const ctx=getContext();if(!ctx?.map){say('카카오 지도로 이동한 뒤 표시합니다.');return;}
  if(!globalThis.kakao?.maps){say('카카오 지도 SDK 연결 전입니다.');return;}
  for(const p of records){
   const label='2024년 과거 보행자 사고다발지역 · '+p.name+' · '+p.accidentCount+'건 · 실시간 사고/통제 아님';
   const marker=document.createElement('button');marker.type='button';marker.className='sunny-historic-hotspot-pin';
   marker.textContent='⚠️';marker.title=label;marker.setAttribute('aria-label',label);
   marker.addEventListener('click',()=>say(label));
   items.push(new kakao.maps.CustomOverlay({map:ctx.map,position:new kakao.maps.LatLng(p.lat,p.lng),
     content:marker,xAnchor:.5,yAnchor:.5,zIndex:15,clickable:true}));
  }
  say('2024년 서울 중구 과거 보행자 사고다발지역 '+items.length+'곳 · 현재 사고 발생 여부 아님');
 }
 async function load(){
  if(!control?.checked||!available()||loading)return;
  const run=++seq;loading=true;say('한국도로교통공단 과거 사고다발지역 조회 중…');
  try{
   const fetched=await request();
   if(run!==seq||!control.checked)return;
   data=fetched;
   if(fetched.status==='failed'||fetched.status==='missing'){say(fetched.reason||'기관 API 응답을 확인하지 못했습니다.');clear();return;}
   if(!getContext()?.map)await ensureMap?.();
   if(run!==seq||!control.checked)return;
   repaint();
  }catch(e){if(run===seq){clear();say('KOROAD 기관 API 수신 실패 · 환경설정에서 승인 상태를 확인해주세요.');}}
  finally{if(run===seq)loading=false;}
 }
 control?.addEventListener('change',()=>{
  if(!control.checked){seq++;loading=false;clear();say(available()?'표출 해제 · 과거 통계':'기관 인증키 등록 전');return;}
  if(data)repaint();else void load();
 });
 function setAvailable(configured){
  if(!control)return;
  control.disabled=!configured;
  if(!configured){control.checked=false;seq++;clear();data=null;say('KOROAD_API_KEY 미설정 · 실제 통계 미표출');}
  else if(!data&&!control.checked)say('KOROAD 키 등록됨 · 선택 시 2024년 서울 중구 과거 통계 조회');
 }
 setAvailable(false);
 return {setAvailable,repaint,clear,load,shown:()=>items.length};
}
