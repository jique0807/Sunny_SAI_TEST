import {assessRouteHazard,withRiskAssessment} from './risk-engine.mjs';
// Real geolocated KMA forecast risks, shared between route search and live driving.
// Do not infer flood/ice/fog or snowfall depth from precipitation type.
const ICONS=Object.freeze({rain:'🌧️',snow:'❄️',mixed:'🌨️',heat:'☀️',cold:'🥶',wind:'💨'});
const TITLE=Object.freeze({rain:'강수 예보',snow:'눈 예보',mixed:'비·눈 혼합 예보',heat:'고온 예보 주의',cold:'저온 예보 주의',wind:'강풍 예보 주의'});
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
  const label=String(s.label||'경로의 예보 지점').slice(0,50);
  const exactRain=safeValue(f.rain);
  const rainLabel=typeof f.rainLabel==='string'&&f.rainLabel.trim()?f.rainLabel.trim():exactRain!==null?exactRain+'mm':null;
  const exactSnow=safeValue(f.snowfall);
  const snowLabel=typeof f.snowfallLabel==='string'&&f.snowfallLabel.trim()?f.snowfallLabel.trim():
    exactSnow!==null?exactSnow+'cm':null;
  const common={seconds:s.seconds,label,lat:safeValue(s.lat),lng:safeValue(s.lng),
   eta:typeof s.eta==='string'?s.eta:null,validTime:f.time||null,
   provider:'기상청 격자예보',grid:s.grid||null};
  if(kind)events.push(withRiskAssessment({...common,kind,icon:ICONS[kind],title:TITLE[kind],
   rainLabel,rainMm:exactRain,rainMin:safeValue(f.rainMin),snowLabel}));
  // These are app-level precaution thresholds, not official heat/cold/wind warnings.
  const t=safeValue(f.temperature),w=safeValue(f.windSpeed);
  if(t!==null&&t>=33)events.push(withRiskAssessment({...common,kind:'heat',icon:ICONS.heat,
   title:TITLE.heat,temperature:t}));
  if(t!==null&&t<=-12)events.push(withRiskAssessment({...common,kind:'cold',icon:ICONS.cold,
   title:TITLE.cold,temperature:t}));
  if(w!==null&&w>=14)events.push(withRiskAssessment({...common,kind:'wind',icon:ICONS.wind,
   title:TITLE.wind,windSpeed:w}));
 }
 events.sort((a,b)=>a.seconds-b.seconds);
 const dedup=[];
 for(const event of events){
  if(dedup.some(last=>last.kind===event.kind&&Math.abs(event.seconds-last.seconds)<300))continue;
  dedup.push(event);if(dedup.length>=Math.max(1,Math.min(20,limit)))break;
 }
 return dedup;
}
export function hazardDetails(hazard,formatTime){
 const format=t=>t&&formatTime?formatTime(t):t||'시간정보 미제공';
 if(hazard.demo)return [
  hazard.title,'⚠️ 시연 데이터 · 실제 관측·특보 아님',
  '경로 구간: '+hazard.label,'예상 통과 시각: '+format(hazard.eta),
  '위험정보: '+hazard.measure,hazard.description,'출처: '+hazard.provider
 ];
 if(hazard.synthetic)return [
  hazard.title,'⚠️ 더미 시뮬레이션 · 실제 관측·특보 아님',
  '경로 구간: '+hazard.label,'예상 통과 시각: '+format(hazard.eta),
  '위험정보: '+hazard.measure,hazard.description,'출처: '+hazard.provider,
  hazard.assessment?.label?'Risk Engine 판정: '+hazard.assessment.label:'Risk Engine 평가 근거 확인 중',
  hazard.assessment?.caution||'실제 도로 상태와 통제 여부는 확인하지 않았습니다.'
 ];
 let details;
 if(hazard.kind==='its-incident')details=[
  hazard.title,'ITS 신고 위치: '+hazard.label,
  '돌발내용: '+String(hazard.measure||'확인된 상세 내용 없음'),
  '실제 경로와의 최단거리: '+hazard.distanceToPath+'m',
  '발생·접수시각: '+format(hazard.validTime),
  '예상 통과시각: '+format(hazard.eta),
  '출처: 국가교통정보센터 ITS',
  '같은 도로·진행방향·통제구간 일치 미확인 · 자동 우회 불가'
 ];
 else if(hazard.kind==='pedestrian-hotspot')details=[
  hazard.title,'과거 사고 집중구역: '+hazard.label,
  '자료연도: 2024년 · 한국도로교통공단 TAAS',
  '과거 사고건수: '+hazard.accidentCount+'건',
  '실제 경로와의 최단거리: '+(hazard.distanceToPath??'미확인')+'m',
  '예상 통과: '+format(hazard.eta),
  '현재 사고·도로 통제 정보가 아니며 안전한 우회경로를 보증하지 않습니다.'
 ];
 else if(['heat','cold','wind'].includes(hazard.kind))details=[
  hazard.title,'예상 통과: '+format(hazard.eta),'구간: '+hazard.label,
  '기상청 예보: '+(hazard.kind==='wind'?hazard.windSpeed+'m/s':hazard.temperature+'°C'),
  '예보 유효시각: '+format(hazard.validTime),
  '앱 내부 주의 기준이며 기상청 공식 특보가 아닙니다. 그늘·체감온도·실제 보행상태는 별도 확인이 필요합니다.'
 ];
 else if(['satellite-rain','satellite-convection','satellite-fog'].includes(hazard.kind))details=[
  hazard.title,'위성 산출값: '+hazard.measure,'관측시각: '+format(hazard.validTime),
  '예상 통과: '+format(hazard.eta),'자료: '+hazard.provider,
  '위성 추정·탐지이며 실제 노면 침수·시정·통제 정보가 아닙니다.'
 ];
 else if(hazard.kind==='warning')details=[
  hazard.title,'특보구역: '+hazard.label,'발효 시각: '+format(hazard.validTime),
  '자료: '+hazard.provider
 ];
 else if(hazard.roadRisk)details=[
  hazard.title,'위험 단계: '+({1:'관심',2:'주의',3:'위험'}[hazard.roadRisk]),
  '예상 통과: '+format(hazard.eta),'위치: '+hazard.label,
  '자료 시각: '+format(hazard.validTime),
  '자료: '+hazard.provider+' · 도로 위험 예측'
 ];
 else details=[
  hazard.title,'예상 통과: '+format(hazard.eta),'위치: '+hazard.label,
  '1시간 강수량: '+(hazard.rainLabel||'자료 없음'),
  '1시간 신적설: '+(hazard.snowLabel||'자료 없음 · 눈 강수형태만 확인'),
  '예보 유효시각: '+format(hazard.validTime),
  '자료: '+hazard.provider+' · 실제 노면 결빙·침수 관측 아님'
 ];
 const verdict=hazard.assessment||assessRouteHazard(hazard);
 return [...details,
  'Sunny 규칙형 판정: '+verdict.label+(verdict.level==='unknown'?' (검증 보류)':''),
  '판정 근거: '+verdict.evidence,
  '주의: '+verdict.caution
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
// Cluster marks that would land on top of each other in the narrow route rail.
// Route position is kept as metadata; display locations can spread slightly for touch access.
export function layoutHazardRail(hazards,routePath,fractionAt,{max=10,clusterThreshold=.09}={}){
 if(typeof fractionAt!=='function'||!Array.isArray(routePath)||routePath.length<2)return [];
 const points=[];
 for(const hazard of (Array.isArray(hazards)?hazards:[]).slice(0,max)){
  const fraction=fractionAt(routePath,hazard.seconds);
  if(Number.isFinite(fraction)&&fraction>=0&&fraction<=1)points.push({hazard,fraction});
 }
 points.sort((a,b)=>a.fraction-b.fraction);
 const groups=[];
 for(const point of points){
  const last=groups.at(-1);
  if(last&&point.fraction-last.members.at(-1).fraction<=clusterThreshold){
   last.members.push(point);
   last.fraction=last.members.reduce((sum,p)=>sum+p.fraction,0)/last.members.length;
  }else groups.push({fraction:point.fraction,members:[point]});
 }
 // Preserve order and leave room for a 28px touch icon at both ends.
 const min=.13,maxPos=.87;
 const separation=groups.length>1?Math.min(.27,(maxPos-min)/(groups.length-1)):0;
 const positions=groups.map(g=>Math.max(min,Math.min(maxPos,g.fraction)));
 for(let i=1;i<positions.length;i++)positions[i]=Math.max(positions[i],positions[i-1]+separation);
 if(positions.length&&positions.at(-1)>maxPos){
  const overflow=positions.at(-1)-maxPos;
  for(let i=0;i<positions.length;i++)positions[i]-=overflow;
  for(let i=positions.length-2;i>=0;i--)positions[i]=Math.min(positions[i],positions[i+1]-separation);
 }
 return groups.map((g,i)=>({...g,displayFraction:positions[i]}));
}
export function renderHazardRail(container,hazards,routePath,{fractionAt,onSelect,max=10}={}){
 if(!container)return 0;
 container.replaceChildren();
 const groups=layoutHazardRail(hazards,routePath,fractionAt,{max});
 let count=0;
 for(const group of groups){
  const list=group.members.map(p=>p.hazard),hazard=list[0];
  const btn=document.createElement('button');
  btn.type='button';btn.className='sunny-rail-hazard';
  btn.dataset.risk=hazard.kind;
  if(hazard.demo)btn.dataset.demo='true';
  btn.style.bottom=(group.displayFraction*100).toFixed(2)+'%';
  btn.dataset.routeFraction=(group.fraction*100).toFixed(2);
  btn.textContent=hazard.icon;
  const label=list.length>1?
   '위험정보 '+list.length+'건 · '+list.map(h=>h.title+' '+h.label).join(' / ')+' · 누를 때마다 상세정보 전환':
   hazard.title+' · '+hazard.label+' · 세부정보 보기';
  btn.title=label;
  btn.setAttribute('aria-label',label);
  if(list.length>1){btn.dataset.count=String(list.length);btn.dataset.cluster='true';}
  let selected=0;
  btn.addEventListener('click',e=>{e.stopPropagation();onSelect?.(list[selected%list.length]);selected++;});
  container.append(btn);
  count+=list.length;
 }
 return count;
}
