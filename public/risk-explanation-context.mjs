import {decideRouteAction} from './route-action-policy.mjs';
import {scoreModeRisk} from './risk-mode-policy.mjs';
const LEVELS=new Set(['info','notice','caution','high']);
export function buildExplanationContext(profile){
 if(!profile||profile.engine!=='risk-v2.0'||!['driving','walking'].includes(profile.mode)||
  !['evaluated','partial','insufficient-data','unsupported','simulation'].includes(profile.state))throw Error('지원하는 위험 엔진 결과가 필요합니다.');
 const coverage=Number(profile.coverage);
 if(!Number.isFinite(coverage)||coverage<0||coverage>100||!Array.isArray(profile.signals)||profile.signals.length>24)throw Error('판정 근거 형식이 올바르지 않습니다.');
 const signals=profile.signals.filter(h=>h&&LEVELS.has(h.assessment?.level)&&
  (['rain','snow','mixed','heat','cold','wind','warning','its-incident','pedestrian-hotspot'].includes(h.kind)||h.roadRisk!==undefined))
  .map(h=>({kind:h.kind,roadRisk:h.roadRisk,impact:h.impact==='flood'?'flood':undefined,
   affectedRadiusMeters:Number.isFinite(h.affectedRadiusMeters)&&h.affectedRadiusMeters>0?h.affectedRadiusMeters:undefined,
   rainMm:Number.isFinite(h.rainMm)&&h.rainMm>=0&&h.rainMm<=500?h.rainMm:undefined,
   temperature:Number.isFinite(h.temperature)&&Math.abs(h.temperature)<100?h.temperature:undefined,
   windSpeed:Number.isFinite(h.windSpeed)&&h.windSpeed>=0&&h.windSpeed<150?h.windSpeed:undefined,
   assessment:{level:h.assessment?.level,score:Number.isFinite(h.assessment?.score)?h.assessment.score:0}}));
 const normalized={state:profile.decisionWithheld?'partial':profile.state,coverage,signals,
  signalIndex:scoreModeRisk(profile.mode,signals).signalIndex};
 const action=decideRouteAction(normalized);
 const facts=[];const add=(id,text,required=false)=>facts.push({id,text,required});
 add('scope',profile.simulation?'더미 시뮬레이션 자료에 대한 설명입니다.':'현재 엔진에 전달된 경로 자료의 판정 근거를 설명합니다.',true);
 add('coverage','경로 예보 조회 범위는 '+coverage+'%입니다.');
 const decisions={reroute:'엔진은 강한 강수와 침수 영향자료를 근거로 우회경로 검토를 권고했습니다.',
  'heat-advisory':'엔진은 고온 주의 안내와 휴식·대피 검토를 권고했습니다.',
  abstain:'자료가 불충분해 엔진의 위험판단을 보류했습니다.',
  advisory:'엔진은 확인된 위험 신호를 안내하고 경로를 유지하도록 했습니다.',
  continue:'조회 지점에서 추가 위험 신호가 확인되지 않았습니다.'};
 add('decision',decisions[action.type],true);
 const words={rain:'강수',snow:'눈',mixed:'비·눈 혼합 강수',heat:'고온',cold:'저온',wind:'강풍',warning:'기상특보 근접 참고정보','its-incident':'경로 인접 ITS 돌발 신고','pedestrian-hotspot':'과거 보행사고 집중구역'};
 signals.forEach((h,i)=>{
  let text=words[h.kind]||'도로 위험기상';
  if(h.kind==='rain'&&h.rainMm!==undefined)text='1시간 강수량 '+h.rainMm+'mm';
  if(['heat','cold'].includes(h.kind)&&h.temperature!==undefined)text='기온 '+h.temperature+'°C';
  if(h.kind==='warning'&&h.impact==='flood')text='경로에 정합된 침수 영향자료';
  add('e'+i,text+'가 판정 근거에 포함되었습니다.');
 });
 add('uncertainty',action.type==='abstain'?'자료가 없다는 것이 안전하다는 뜻은 아닙니다.':'이 판정은 도로의 실제 안전이나 통행 가능 여부를 보증하지 않습니다.',true);
 return {schema:'sunny-explanation-context-v1',engine:profile.engine,mode:profile.mode,
  simulation:profile.simulation===true,state:normalized.state,action:action.type,facts};
}
export function templateExplanation(context){
 const ids=['scope','decision',...context.facts.filter(f=>!f.required).slice(0,2).map(f=>f.id),'uncertainty'];
 return renderExplanation(context,ids);
}
export function renderExplanation(context,ids){
 const map=new Map(context.facts.map(f=>[f.id,f.text]));return ids.map(id=>map.get(id)).join(' ');
}
export function validateExplanationSelection(value,context){
 if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['sentenceIds','action'].includes(k))||
  value.action!==context.action||!Array.isArray(value.sentenceIds)||value.sentenceIds.length<3||value.sentenceIds.length>7||
  new Set(value.sentenceIds).size!==value.sentenceIds.length||
  value.sentenceIds.some(id=>typeof id!=='string'||!context.facts.some(f=>f.id===id))||
  context.facts.some(f=>f.required&&!value.sentenceIds.includes(f.id)))throw Error('설명 근거 또는 조치 검증 실패');
 return {text:renderExplanation(context,value.sentenceIds),sentenceIds:value.sentenceIds};
}
