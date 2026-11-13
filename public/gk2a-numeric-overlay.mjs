import {buildSatelliteHazards} from './satellite-route-risk.mjs';
const names={rr:['navGk2aRr','navGk2aRrStatus'],ci:['navGk2aCi','navGk2aCiStatus'],fog:['navGk2aFog','navGk2aFogStatus']};
const ageLimit={rr:20,ci:20,fog:60};
const stamp=s=>Date.parse(String(s).replace(/^(....)(..)(..)(..)(..)$/,'$1-$2-$3T$4:$5:00Z'));
export function drawSatelliteCells(ctx,cells,project,product){
 let drawn=0;
 for(const cell of cells){
  if(cell.corners?.length!==4||!Number.isFinite(cell.value))continue;
  const points=cell.corners.map(project);if(points.some(p=>!Number.isFinite(p?.x)||!Number.isFinite(p?.y)))continue;
  ctx.fillStyle=product==='rr'?(cell.value>=30?'#d02632':cell.value>=10?'#f08720':cell.value>=3?'#28aa5e':'#5dace6'):
   product==='ci'?(cell.value>=4?'#bd35b4':cell.value===3?'#f17b26':'#f3c629'):(cell.value===5?'#8c64bc':'#b0a3c8');
  ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();ctx.fill();drawn++;
 }
 return drawn;
}
export function initGk2aNumericOverlay({document,getMap,ensureMap,waitForSession,request,onChange=()=>{}}){
 const frames=new Map(),versions={rr:0,ci:0,fog:0},routes=new WeakMap();let available=false,map=null,canvas=null,timer=null,listener=null;
 const get=id=>document.getElementById(id),toggle=k=>get(names[k][0]);
 const say=(k,s)=>{const el=get(names[k][1]);if(el)el.textContent=s;};
 function clearCanvas(){canvas?.remove();canvas=null;if(map&&listener)globalThis.kakao?.maps?.event.removeListener(map,'idle',listener);listener=null;map=null;}
 function redraw(){
  if(!map||!canvas)return;const root=get('kakaoMap'),projection=map.getProjection?.();if(!root||!projection)return;
  canvas.width=root.clientWidth;canvas.height=root.clientHeight;const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.globalAlpha=1-Math.max(0,Math.min(100,Number(get('navDemoOpacity')?.value??45)))/100;
  for(const [k,f]of frames){
   if(!toggle(k)?.checked)continue;
   if(Date.now()-stamp(f.observationUTC)>ageLimit[k]*60000){frames.delete(k);say(k,'자료 유효시각 경과 · 중첩 제외');continue;}
   drawSatelliteCells(ctx,f.cells,p=>{const q=projection.containerPointFromCoords(new kakao.maps.LatLng(p.lat,p.lng));return {x:q.x,y:q.y};},k);
  }
 }
 async function paint(){
  const next=getMap();if(!next)return;
  if(map!==next||!canvas){clearCanvas();map=next;canvas=document.createElement('canvas');canvas.className='sunny-gk2a-map-overlay';
   Object.assign(canvas.style,{position:'absolute',left:'0',top:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'13'});
   get('kakaoMap').append(canvas);listener=()=>{redraw();schedule();};kakao.maps.event.addListener(map,'idle',listener);}
  redraw();
 }
 function bounds(){const m=getMap(),b=m?.getBounds?.();if(!b)return null;const sw=b.getSouthWest(),ne=b.getNorthEast();
  const v={west:Math.max(123,sw.getLng()),east:Math.min(133,ne.getLng()),south:Math.max(32,sw.getLat()),north:Math.min(40,ne.getLat())};
  return Object.values(v).every(Number.isFinite)&&v.west<v.east&&v.south<v.north?v:null;}
 async function show(k){
  if(!available||!toggle(k)?.checked)return;const version=++versions[k];say(k,'위성 수치자료·좌표·품질 확인 중…');
  try{
   await waitForSession?.();if(!getMap())await ensureMap?.();const b=bounds();if(!b)throw Error('bounds');
   const data=await request('/api/satellite-map',{product:k,bounds:b});
   if(version!==versions[k]||!toggle(k)?.checked)return;
   if(data.status!=='received'||data.metadataVerified!==true||!Array.isArray(data.cells))throw Error('excluded');
   frames.set(k,data);await paint();
   say(k,'수치 격자 중첩 '+data.cells.length+'칸 · '+data.observationUTC+' UTC'+(data.displayStride>1?' · 격자 최대값 요약':'')+(k==='rr'?' · mm/h':k==='ci'?' · 발달 단계':' · 안개 가능/탐지'));
  }catch{if(version===versions[k]){frames.delete(k);toggle(k).checked=false;say(k,'수신·좌표·품질 검사 실패 · 중첩에서 제외');redraw();}}
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>{for(const k of Object.keys(names))if(toggle(k)?.checked)void show(k);},650);}
 for(const k of Object.keys(names))toggle(k)?.addEventListener('change',()=>{
  if(toggle(k).checked)void show(k);else{versions[k]++;frames.delete(k);say(k,'표출 해제 · 경로 자료 검사는 유지');redraw();}
 });
 get('navDemoOpacity')?.addEventListener('input',redraw);
 const poll=setInterval(()=>{redraw();if(!document.hidden)schedule();},120000);
 globalThis.window?.addEventListener('resize',redraw);globalThis.window?.addEventListener('pagehide',()=>{clearInterval(poll);clearTimeout(timer);clearCanvas();});
 return {
  setAvailable(v){available=!!v;for(const k of Object.keys(names)){const t=toggle(k);if(!t)continue;t.disabled=!available;t.closest('.nav-layer-row')?.classList.toggle('nav-layer-unavailable',!available);say(k,available?'NC 수치자료 · 선택 시 수신·좌표·품질 검사':'KMA API 키 미등록');}},
  setMap(next){if(map&&next!==map){clearCanvas();frames.clear();for(const k of Object.keys(names))if(toggle(k))toggle(k).checked=false;}},
  redraw,clear(){frames.clear();clearCanvas();},
  async collectForRisk(route){
   if(!route||route.demo)return {status:'excluded'};
   const source=(route.samples?.length?route.samples:route.rainPath)||[];
   const points=source.filter(p=>Number.isFinite(p.seconds)&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)).slice(0,96).map(({lat,lng,seconds})=>({lat,lng,seconds}));
   routes.delete(route);
   try{const report=await request('/api/satellite-route',{points});routes.set(route,report);onChange();return {status:report.status};}
   catch{return {status:'excluded'};}
  },
  routeHazards(route){return routes.has(route)?buildSatelliteHazards(route,routes.get(route)):[];}
 };
}
