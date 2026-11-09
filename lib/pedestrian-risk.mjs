// Pedestrian risk assessment from documented KMA forecast fields only.
// Risk is a planning caution, never proof of flooded or icy pavement.
const valid=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat>=32&&p.lat<=40&&p.lng>=123&&p.lng<=133;
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function validatePedestrianCandidates(candidates){
 if(!Array.isArray(candidates)||candidates.length<1||candidates.length>3)throw new RangeError('1~3개의 도보 후보 경로가 필요합니다.');
 return candidates.map((route,i)=>{
  if(!route||typeof route!=='object'||!Array.isArray(route.points)||route.points.length<2||route.points.length>12)throw new RangeError('각 경로에는 2~12개의 좌표가 필요합니다.');
  const duration=number(route.durationSeconds);
  if(duration===null||duration<=0||duration>21600)throw new RangeError('경로 소요시간이 올바르지 않습니다.');
  const distance=number(route.distanceMeters);
  if(distance===null||distance<=0||distance>100000)throw new RangeError('경로 거리가 올바르지 않습니다.');
  const points=route.points.map((p,j)=>{if(!valid(p))throw new RangeError('대한민국 범위의 좌표를 입력해주세요.');return {lat:p.lat,lng:p.lng,label:String(p.label||'도보 지점').slice(0,40),seconds:duration*j/(route.points.length-1)};});
  return {id:'candidate-'+(i+1),distanceMeters:distance,durationSeconds:duration,points};
 });
}
export function assessPedestrianWeather(samples){
 if(!Array.isArray(samples))return {level:'unknown',score:null,events:[],reason:'검증 가능한 예보가 없습니다.'};
 const events=[];
 let max=0,observed=0;
 for(const s of samples){
  if(s?.status!=='forecast'||s.forecast?.provider!=='kma')continue;
  observed++;
  const f=s.forecast,pty=number(f.precipitationType),temp=number(f.temperature),rain=number(f.rain),rainMin=number(f.rainMin),snow=number(f.snowfall);
  const precipitation=[1,2,3,4,5,6,7].includes(pty)||rain>0||rainMin>0;
  let score=0,reason=null;
  if([3,7].includes(pty)||snow>0){score=2;reason='눈 예보 · 미끄럼 주의';}
  else if(precipitation){score=1;reason='강수 예보 · 노면 상태 주의';}
  if(precipitation&&temp!==null&&temp<=0){score=Math.max(score,3);reason='영하 기온과 강수/눈 예보 동시 발생 · 결빙 가능성 주의';}
  else if(precipitation&&temp!==null&&temp<=2){score=Math.max(score,2);reason='저온과 강수 예보 · 미끄럼 가능성 주의';}
  if(score>0){
   max=Math.max(max,score);
   events.push({lat:s.lat,lng:s.lng,eta:s.eta||null,validTime:f.time||null,level:score,reason,source:'기상청 예보',observedHazard:false});
  }
 }
 const coverage=samples.length>0?observed/samples.length:0;
 if(!observed)return {level:'unknown',score:null,events:[],reason:'도보 경로와 일치하는 기상청 예보가 없습니다.',evaluatedPoints:0,totalPoints:samples.length,coverage};
 if(coverage<0.8)return {level:'incomplete',score:null,events,reason:'경로 전체의 예보를 확보하지 못했습니다. 확인된 위험 신호만 표시하며 안전한 경로라고 판정하지 않습니다.',evaluatedPoints:observed,totalPoints:samples.length,coverage};
 return {level:['low','caution','high','high'][max],score:max,events,reason:max?'기상 예보 기반 주의 수준이며 실제 침수·결빙 관측이 아닙니다.':'수신된 예보 범위에서 강수·적설 위험 신호가 확인되지 않았습니다. 미수신 구간은 별도 확인해야 합니다.',evaluatedPoints:observed,totalPoints:samples.length,coverage};
}
export function comparePedestrianCandidates(routes){
 const eligible=routes.filter(r=>r.assessment?.score!==null);
 if(!eligible.length)return {recommendedId:null,reason:'검증된 예보가 없어 안전한 경로를 판단할 수 없습니다.'};
 eligible.sort((a,b)=>a.assessment.score-b.assessment.score||a.durationSeconds-b.durationSeconds);
 return {recommendedId:eligible[0].id,reason:'예보 기반 주의도, 이후 소요시간 순으로 비교했습니다. 시설 통행 가능성과 실제 노면 안전을 보증하지 않습니다.'};
}
