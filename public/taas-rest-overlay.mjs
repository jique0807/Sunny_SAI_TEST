// Kakao marker-only TAAS REST layers, coordinates are validated server-side.
const SOURCES=Object.freeze({
 pedestrian:['navLayerPedestrianWms','navPedestrianWmsStatus','보행자 사고다발지역','🚸'],
 child:['navLayerChildWms','navChildWmsStatus','어린이 보행사고 다발지역','🧒'],
 elderly:['navLayerElderlyWms','navElderlyWmsStatus','노인 보행사고 다발지역','🧓']
});
const safe=p=>p&&Number.isFinite(p.lat)&&p.lat>=32&&p.lat<=40&&Number.isFinite(p.lng)&&p.lng>=123&&p.lng<=133&&p.historic===true&&p.live===false&&p.year==='2024'&&Number.isInteger(p.accidentCount);
export function initTaasRestOverlay({document,request,getMap,ensureMap}){
 let configured=false,timer=null;
 const entries=new Map(),versions=Object.fromEntries(Object.keys(SOURCES).map(k=>[k,0]));
 const input=k=>document.getElementById(SOURCES[k][0]),status=k=>document.getElementById(SOURCES[k][1]);
 const say=(k,value)=>{if(status(k))status(k).textContent=value;};
 function remove(k){for(const x of entries.get(k)?.overlays||[])try{x.setMap(null)}catch{}entries.delete(k);}
 function clear(){clearTimeout(timer);timer=null;for(const k of Object.keys(SOURCES)){versions[k]++;remove(k);}}
 function currentOpacity(){const n=Number(document.getElementById('navDemoOpacity')?.value??45);return 1-Math.max(0,Math.min(100,n))/100;}
 function updateOpacity(){for(const e of entries.values())for(const el of e.elements)el.style.opacity=String(currentOpacity());}
 function boundsOf(map){
  if(!map?.getBounds)return null;
  const b=map.getBounds(),sw=b.getSouthWest(),ne=b.getNorthEast(),v={west:sw.getLng(),south:sw.getLat(),east:ne.getLng(),north:ne.getLat()};
  if(!Object.values(v).every(Number.isFinite)||v.east<=v.west||v.north<=v.south||v.east-v.west>.20||v.north-v.south>.20||v.west<123||v.east>133||v.south<32||v.north>40)return null;
  return v;
 }
 async function load(k,map,bounds){
  const id=++versions[k];
  remove(k);say(k,'2024년 과거 사고지역 REST 조회 중…');
  try{
   const data=await request(k,bounds);
   if(versions[k]!==id||!configured||!input(k)?.checked||map!==getMap())return;
   if(!['received','empty'].includes(data?.status))throw Error('실제 TAAS REST 자료 확인 실패');
   const list=(data.items||[]).filter(p=>safe(p)&&p.kind===k).slice(0,100);
   const overlays=[],elements=[];
   for(const p of list){
    const element=document.createElement('button');element.type='button';element.className='sunny-historic-hotspot-pin';
    element.textContent=SOURCES[k][3];element.title='2024년 '+SOURCES[k][2]+' · '+p.accidentCount+'건 · 현재 사고 아님';
    element.setAttribute('aria-label',element.title);element.style.opacity=String(currentOpacity());
    element.addEventListener('click',()=>say(k,element.title));
    overlays.push(new kakao.maps.CustomOverlay({map,position:new kakao.maps.LatLng(p.lat,p.lng),
     content:element,xAnchor:.5,yAnchor:.5,zIndex:13,clickable:true}));
    elements.push(element);
   }
   entries.set(k,{map,overlays,elements});
   say(k,list.length?'2024년 과거 '+SOURCES[k][2]+' '+list.length+'곳 · 현재 사고 아님':
    '현재 지도의 확인된 2024년 사고다발지역 없음 · 안전 판정 아님');
  }catch{if(versions[k]===id){remove(k);say(k,'기관 REST 미수신 · 실시간 안전 판정 불가');}}
 }
 async function refresh(){
  if(!configured)return;
  const map=getMap(),bounds=boundsOf(map);
  if(!map||!bounds||!globalThis.kakao?.maps){
   for(const k of Object.keys(SOURCES))if(input(k)?.checked){versions[k]++;remove(k);say(k,'지도를 확대해 조회하세요 · 단일 법정구역 기준');}
   return;
  }
  await Promise.all(Object.keys(SOURCES).filter(k=>input(k)?.checked).map(k=>load(k,map,bounds)));
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>{timer=null;void refresh();},450);}
 function repaint(){
  if(!configured){clear();return;}
  for(const k of Object.keys(SOURCES))if(!input(k)?.checked){versions[k]++;remove(k);}
  schedule();
 }
 function setAvailable(available){
  configured=Boolean(available);
  for(const k of Object.keys(SOURCES)){
   const control=input(k);if(!control)continue;
   control.disabled=!configured;
   control.closest('.nav-layer-row')?.classList.toggle('nav-layer-unavailable',!configured);
   if(!configured){control.checked=false;versions[k]++;remove(k);}
   say(k,configured?'REST 인증키 등록됨 · 선택하면 2024년 실제 좌표 조회':'KOROAD/카카오 키 미등록');
  }
 }
 for(const k of Object.keys(SOURCES)){
  input(k)?.addEventListener('change',async()=>{
   if(!input(k).checked){versions[k]++;remove(k);say(k,'표출 해제');return;}
   if(!getMap())await ensureMap?.();
   schedule();
  });
 }
 setAvailable(false);
 return {setAvailable,repaint,schedule,clear,updateOpacity};
}
