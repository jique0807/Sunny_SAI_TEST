// Sunny SAI risk assessment rules v1.0: free, explainable, not a trained AI.
// A weather forecast never proves road flooding, black ice or a road closure.
export const RISK_ENGINE_VERSION='rules-v1';
const located=h=>Number.isFinite(h?.lat)&&Number.isFinite(h?.lng)&&h.lat>=32&&h.lat<=40&&h.lng>=123&&h.lng<=133;
const validTime=t=>typeof t==='string'&&Number.isFinite(Date.parse(t));
const assessment=(level,label,evidence,caution,score)=>({level,label,evidence,caution,score,engine:RISK_ENGINE_VERSION});
export function assessRouteHazard(h,{now=Date.now()}={}){
 if(!h||typeof h!=='object')
  return assessment('unknown','자료 미수신','확인된 자료 없음','자료가 없다고 안전한 것은 아닙니다.',0);
 if(h.demo)return assessment('simulation','시연','가상의 기상위험','실제 위험판정이 아닙니다.',0);
 const source=String(h.provider||'');
 // Historic crash clusters are cautionary context, NOT observed real-time collisions.
 if(h.kind==='pedestrian-hotspot'){
  if(source!=='한국도로교통공단 TAAS'||h.historic!==true||h.live!==false||
     h.year!=='2024'||!located(h)||!Number.isFinite(h.seconds)||!validTime(h.eta)||
     !Number.isInteger(h.accidentCount)||h.accidentCount<1)
   return assessment('unknown','과거 보행 사고정보 검증 필요','원본·연도·위치·건수 미확인','근거 없는 사고 위험은 생성하지 않습니다.',0);
  return assessment('notice','과거 보행 사고 집중구역',
   '한국도로교통공단 TAAS · 2024년 과거 사고 '+h.accidentCount+'건 · 실제 경로 120m 이내',
   '현재 사고가 발생했다는 뜻이 아니며 향후 사고확률이나 통제 여부는 알 수 없습니다.',42);
 }

 if(h.roadRisk!==undefined){
  const g=h.roadRisk,age=validTime(h.validTime)?now-Date.parse(h.validTime):Infinity;
  if(!source.includes('기상청 도로위험')||h.riskGradeVerified!==true||![1,2,3].includes(g)||!located(h)||!validTime(h.eta)||age<0||age>15*60000)
   return assessment('unknown','도로위험 자료 검증 필요','출처·등급·위치·시각 미검증','검증 전 운전자에게 확정된 도로위험으로 알리지 않습니다.',0);
  const rank={1:48,2:75,3:95},level={1:'notice',2:'caution',3:'high'};
  return assessment(level[g],'기상청 도로위험 '+({1:'관심',2:'주의',3:'위험'}[g]),source+' · 위치 및 15분 이내 자료시각 확인',
   '위험예측이며 실제 결빙·도로통제 확정은 아닙니다.',rank[g]);
 }
 if(h.kind==='warning'){
  if(!source.includes('기상청')||!located(h)||!validTime(h.eta)||!validTime(h.validTime))
   return assessment('unknown','특보 자료 검증 필요','위치 또는 유효시각 미확인','특보구역 전체와 도로 교차 여부 미확인',0);
  return assessment('caution','기상특보 근접 참고',source+' · 경로 인접 관측지점 기준',
   '공식 특보구역 경계·도로 통제 확인은 아닙니다.',78);
 }
 if(!['rain','snow','mixed'].includes(h.kind)||source!=='기상청 격자예보')
  return assessment('unknown','지원하지 않는 위험자료','검증된 기상청 위험 항목 아님','근거 없는 위험은 생성하지 않습니다.',0);
 if(!located(h)||!validTime(h.eta)||!validTime(h.validTime))
  return assessment('unknown','예보 위치·시각 검증 필요','경로좌표·통과시각·유효시각 미확인','미조회 구간은 안전하다고 판단하지 않습니다.',0);
 if(Math.abs(Date.parse(h.eta)-Date.parse(h.validTime))>90*60000)
  return assessment('unknown','예보 유효시각 불일치','통과 시각과 예보 유효시각이 90분 넘게 다름','잘못된 시간 예보를 위험판정에 쓰지 않습니다.',0);
 if(h.kind==='snow'||h.kind==='mixed')
  return assessment('notice',h.kind==='snow'?'눈 예보':'비·눈 예보',
   '기상청 강수형태 · '+(h.snowLabel?'신적설 '+h.snowLabel:'적설량 확인 불가'),
   '실제 도로 결빙 여부는 미확인입니다.',45);
 const amount=Number.isFinite(h.rainMm)?h.rainMm:Number.isFinite(h.rainMin)&&h.rainMin>0?h.rainMin:null;
 if(amount!==null&&amount>=30)
  return assessment('caution','강한 비 예보', '기상청 1시간 강수 '+(h.rainLabel||amount+'mm'),
   '강수 예보 강도일 뿐, 도로 침수·통제·안전한 우회를 증명하지 않습니다.',70);
 if(amount!==null&&amount>=5)
  return assessment('notice','비 예보 주의', '기상청 1시간 강수 '+(h.rainLabel||amount+'mm'),
   '강수만으로 침수·결빙을 추정하지 않습니다.',48);
 return assessment('info','비 예보 확인','기상청 강수형태 · '+(h.rainLabel||'강수량 미확인'),
  '실제 도로 노면위험은 미확인입니다.',30);
}
export function withRiskAssessment(h,options){
 return h?{...h,assessment:assessRouteHazard(h,options)}:h;
}
export function prioritizeRouteHazards(hazards,seconds,limit=2,{now=Date.now()}={}){
 if(!Array.isArray(hazards)||!Number.isFinite(seconds))return [];
 const list=hazards.filter(h=>h&&!h.demo&&Number.isFinite(h.seconds)&&h.seconds>=seconds-45)
  .map(h=>withRiskAssessment(h,{now})).filter(h=>h.assessment.score>0);
 const score=h=>h.assessment.score-Math.min(65,Math.max(0,h.seconds-seconds)/60*.65);
 list.sort((a,b)=>score(b)-score(a)||a.seconds-b.seconds);
 const selected=[];
 for(const h of list){
  if(selected.some(x=>x.kind===h.kind&&Math.abs(x.seconds-h.seconds)<600))continue;
  selected.push(h);if(selected.length>=Math.max(1,Math.min(10,limit)))break;
 }
 return selected.map(h=>({...h,minutes:Math.max(0,Math.round((h.seconds-seconds)/60))}));
}
