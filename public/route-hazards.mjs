// Real geolocated KMA forecast risks, shared between route search and live driving.
// Do not infer flood/ice/fog or snowfall depth from precipitation type.
const ICONS=Object.freeze({rain:'🌧️',snow:'❄️',mixed:'🌨️'});
const TITLE=Object.freeze({rain:'강수 예보',snow:'눈 예보',mixed:'비·눈 혼합 예보'});
const safeValue=v=>Number.isFinite(v)?v:null;
export function buildRouteHazards(samples,{limit=12}={}){
 if(!Array.isArray(samples))return [];
 const events=[];
 for(const s of samples){
  if(!s||s.status!=='forecast'||!Number.isFinite(s.seconds)||s.seconds<0)continue;
  const f=s.forecast;
  // PTY is a KMA-specific code; do not interpret non-KMA weather codes as KMA.
  if(f?.provider!=='kma')continue;
  const pty=f.precipitationType;
  const kind=[3,7].includes(pty)?'snow':[2,6].includes(pty)?'mixed':
    [1,4,5].includes(pty)||safeValue(f.rain)>0||safeValue(f.rainMin)>0?'rain':null;
  if(!kind)continue;
  const label=String(s.label||'경로의 예보 지점').slice(0,50);
  const exactRain=safeValue(f.rain);
  const rainLabel=typeof f.rainLabel==='string'&&f.rainLabel.trim()?f.rainLabel.trim():exactRain!==null?exactRain+'mm':null;
  const exactSnow=safeValue(f.snowfall);
  const snowLabel=typeof f.snowfallLabel==='string'&&f.snowfallLabel.trim()?f.snowfallLabel.trim():
    exactSnow!==null?exactSnow+'cm':null;
  events.push({kind,icon:ICONS[kind],title:TITLE[kind],seconds:s.seconds,label,lat:safeValue(s.lat),lng:safeValue(s.lng),
   eta:typeof s.eta==='string'?s.eta:null,validTime:f.time||null,
   rainLabel,snowLabel,provider:'기상청 격자예보',grid:s.grid||null});
 }
 events.sort((a,b)=>a.seconds-b.seconds);
 const dedup=[];
 for(const event of events){
  const last=dedup[dedup.length-1];
  if(last?.kind===event.kind&&event.seconds-last.seconds<300)continue;
  dedup.push(event);if(dedup.length>=Math.max(1,Math.min(20,limit)))break;
 }
 return dedup;
}
export function hazardDetails(hazard,formatTime){
 const format=t=>t&&formatTime?formatTime(t):t||'시간정보 미제공';
 if(hazard.kind==='warning')return [
  hazard.title,'특보구역: '+hazard.label,'발효 시각: '+format(hazard.validTime),'자료: '+hazard.provider
 ];
 if(hazard.roadRisk)return [
  hazard.title,
  '위험 단계: '+({1:'관심',2:'주의',3:'위험'}[hazard.roadRisk]),
  '예상 통과: '+format(hazard.eta),
  '위치: '+hazard.label,
  '자료 시각: '+format(hazard.validTime),
  '자료: '+hazard.provider+' · 도로 위험 예측'
 ];
 return [
  hazard.title,
  '예상 통과: '+format(hazard.eta),
  '위치: '+hazard.label,
  '1시간 강수량: '+(hazard.rainLabel||'자료 없음'),
  '1시간 신적설: '+(hazard.snowLabel||'자료 없음 · 눈 강수형태만 확인'),
  '예보 유효시각: '+format(hazard.validTime),
  '자료: '+hazard.provider+' · 실제 노면 결빙·침수 관측 아님'
 ];
}
export function showHazardDetail(panel,hazard,formatTime){
 if(!panel)return;
 panel.replaceChildren();
 if(!hazard){panel.hidden=true;return;}
 const heading=document.createElement('div');heading.className='sunny-hazard-detail-heading';
 const title=document.createElement('strong');title.textContent=hazard.icon+' '+hazard.title;
 const close=document.createElement('button');close.type='button';close.textContent='✕';
 close.setAttribute('aria-label','위험정보 닫기');close.addEventListener('click',()=>{panel.hidden=true;});
 heading.append(title,close);panel.append(heading);
 for(const line of hazardDetails(hazard,formatTime).slice(1)){
  const p=document.createElement('p');p.textContent=line;panel.append(p);
 }
 panel.hidden=false;
}
export function renderHazardRail(container,hazards,routePath,{fractionAt,onSelect,max=10}={}){
 if(!container)return 0;
 container.replaceChildren();
 if(typeof fractionAt!=='function'||!Array.isArray(routePath)||routePath.length<2)return 0;
 let count=0;
 for(const hazard of hazards.slice(0,max)){
  const fraction=fractionAt(routePath,hazard.seconds);
  if(!Number.isFinite(fraction)||fraction<0||fraction>1)continue;
  const btn=document.createElement('button');btn.type='button';
  btn.className='sunny-rail-hazard';btn.dataset.risk=hazard.kind;
  btn.style.bottom=(fraction*100).toFixed(2)+'%';
  btn.textContent=hazard.icon;
  btn.title=hazard.title+' · '+hazard.label+' · 세부정보 보기';
  btn.setAttribute('aria-label',hazard.title+' · '+hazard.label+' 상세정보 열기');
  btn.addEventListener('click',e=>{e.stopPropagation();onSelect?.(hazard);});
  container.append(btn);count++;
 }
 return count;
}
