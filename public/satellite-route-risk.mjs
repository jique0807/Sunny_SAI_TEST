export const SATELLITE_PROVIDER='기상청 GK2A 수치 산출물';
export const SATELLITE_KINDS=['satellite-rain','satellite-convection','satellite-fog'];
export function buildSatelliteHazards(route,report,{now=Date.now()}={}){
 if(!route||route.demo||!['received','partial'].includes(report?.status))return [];
 const hazards=[],seen=new Set();
 for(const p of (Array.isArray(report.samples)?report.samples:[]).filter(p=>p&&typeof p==='object').sort((a,b)=>a.seconds-b.seconds)){
  if(!p||!Number.isFinite(p.value)||!Number.isFinite(p.seconds)||!Number.isFinite(p.lat)||!Number.isFinite(p.lng))continue;
  const observed=/^\d{12}$/.test(p.observationUTC||'')?p.observationUTC.replace(/^(....)(..)(..)(..)(..)$/,'$1-$2-$3T$4:$5:00Z'):null;
  const age=now-Date.parse(observed),eta=Date.parse(route.departure)+p.seconds*1000;
  if(!p.navigationVerified||!p.qualityVerified||!Number.isFinite(age)||age<0||age>(p.product==='fog'?60:20)*60000||!Number.isFinite(eta)||eta<now-120000||eta>now+15*60000)continue;
  const label=p.product==='rr'?'위성 추정 강우':p.product==='ci'?'위성 대류운 발달':'위성 안개 탐지';
  if(p.product==='rr'&&!(p.value>=10)||p.product==='ci'&&![2,3,4].includes(p.value)||p.product==='fog'&&![4,5].includes(p.value))continue;
  const kind={rr:'satellite-rain',ci:'satellite-convection',fog:'satellite-fog'}[p.product];if(!kind)continue;
  const cell=p.product+':'+p.column+':'+p.row+':'+p.observationUTC;
  if(seen.has(cell))continue;seen.add(cell);
  hazards.push({...p,kind,icon:p.product==='rr'?'🌧️':p.product==='ci'?'⛈️':'🌫️',title:label,label,
   eta:new Date(eta).toISOString(),validTime:observed,provider:SATELLITE_PROVIDER,metadataVerified:true,
   measure:p.product==='rr'?p.value.toFixed(2)+' mm/h':p.product==='ci'?['','','약한 상승','중간 상승','강한 상승'][p.value]:p.value===5?'안개 탐지':'안개 가능',
   description:'위성 산출물 참고정보 · 노면 침수·시정·통제 관측이 아닙니다.'});
 }
 return hazards;
}
