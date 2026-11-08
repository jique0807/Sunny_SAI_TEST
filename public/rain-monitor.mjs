// Route time is a traffic estimate, not measured vehicle speed.
export const distance=(a,b)=>Math.hypot((a.lat-b.lat)*111320,(a.lng-b.lng)*111320*Math.cos(a.lat*Math.PI/180));
export function locate(path,position,minimum=0){
 let best=null;
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i];if(b.seconds<minimum)continue;
  const c=Math.cos(position.lat*Math.PI/180),x=(b.lng-a.lng)*c,y=b.lat-a.lat;
  const t=Math.max(0,Math.min(1,((position.lng-a.lng)*c*x+(position.lat-a.lat)*y)/(x*x+y*y||1)));
  const p={lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t,seconds:a.seconds+(b.seconds-a.seconds)*t};
  const meters=distance(position,p);if(!best||meters<best.meters)best={...p,meters};
 }return best;
}
export function ahead(path,seconds,now=Date.now()){
 if(!path.length)return [];
 const out=[];
 for(const delta of [0,300,600,1200,1800]){
  const target=seconds+delta;if(target>path.at(-1).seconds)continue;
  const i=path.findIndex(p=>p.seconds>=target);const b=path[Math.max(0,i)],a=path[Math.max(0,i-1)];
  const f=Math.max(0,Math.min(1,(target-a.seconds)/(b.seconds-a.seconds||1)));
  out.push({lat:a.lat+(b.lat-a.lat)*f,lng:a.lng+(b.lng-a.lng)*f,seconds:target,label:b.label||'전방 경로',eta:new Date(now+delta*1000).toISOString()});
 }return out;
}
export function rainLevel(f){
 if(!f||f.provider!=='kma')return 0;
 const amount=f.rain??f.rainMin;
 if(typeof amount==='number'&&amount>=30)return 2;
 return (typeof amount==='number'&&amount>0)||[1,2,4,5,6].includes(f.precipitationType)||(f.rainMax>0)?1:0;
}
export class RainGate{
 constructor(){this.level=0;this.last=-Infinity;}
 take(samples,now=Date.now()){
  const candidates=samples.filter(p=>p.status==='forecast'&&p.forecast?.product==='초단기예보'&&Date.parse(p.eta)>=now-60000&&Date.parse(p.eta)<=now+1800000);
  const level=Math.max(0,...candidates.map(p=>rainLevel(p.forecast)));
  // Missing data must not reset a wet episode and cause duplicate announcements.
  if(!level){if(candidates.length&&candidates.length===samples.length&&candidates.every(p=>p.forecast.precipitationType===0&&p.forecast.rain===0))this.level=0;return null;}
  if(level<=this.level||now-this.last<60000)return null;
  const p=candidates.find(p=>rainLevel(p.forecast)===level);this.level=level;this.last=now;
  const mins=Math.max(0,Math.round((Date.parse(p.eta)-now)/60000));
  return `${mins?mins+'분 뒤 지날':'현재 지나는'} ${p.label}. ${level===2?'시간당 30밀리미터 이상 강한 비':'비 또는 빗방울'} 예보가 있습니다. ${level===2?'속도를 줄이고 차간거리를 확보하세요.':'젖은 노면에 주의하세요.'}`;
 }
}
