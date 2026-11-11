// Existing settings dialog: read-only provider configuration and current route lineage.
// Does NOT invoke provider diagnostics, store GPS, print keys, or create any risk score.
import {buildRiskLineage} from './risk-lineage.mjs';
const LABELS=Object.freeze({
 route:'경로 확인',acquire:'자료 수집',validate:'근거 검증',decide:'위험판단',present:'지도·안내'
});
const STATES=Object.freeze({
 received:'확인',partial:'일부만 확인',empty:'자료 없음',
 failed:'수신 실패',missing:'키 미등록',checking:'확인 중',
 unavailable:'자료 이용 불가','not-checked':'검사 전',simulation:'시연자료'
});
export function initArchitecturePanel({document,fetcher=globalThis.fetch,waitForSession=async()=>{}}={}){
 const $=id=>document.getElementById(id);
 const section=$('settingArchitectureDetails'),summary=$('settingPipelineSummary');
 const flow=$('settingPipelineStages'),catalog=$('settingCapabilitySources');
 const refresh=$('settingCapabilityRefresh');
 let latest=buildRiskLineage(),busy=false,loaded=false;
 function row(container,name,detail){
  const item=document.createElement('div');
  item.className='sunny-source-row';item.setAttribute('role','listitem');
  const title=document.createElement('b'),desc=document.createElement('small');
  title.textContent=name;desc.textContent=detail;
  item.append(title,desc);container.appendChild(item);
 }
 function render(){
  if(summary)summary.textContent=latest.routeMode==='unknown'?
   '실제 경로 탐색 전 · 위험판단 자료 없음':
   latest.decision==='simulation'?'시연자료 · 실제 위험판단이 아닙니다':
   '이동수단 '+(latest.routeMode==='walking'?'도보':'차량')+
   ' · 판단정책 '+latest.decisionModel+
   ' · 기상 근거 '+latest.forecastCoverage+'% · 위험 신호 '+
   latest.acceptedRiskSignals+'건 · 검증 제외 '+latest.excludedUnverifiedSignals+'건'+
   (latest.decisionWithheld?' · 결정 보류':'');
  if(!flow)return;
  flow.replaceChildren();
  for(const stage of latest.stages)row(flow,LABELS[stage.id]||stage.id,
   STATES[stage.status]||stage.status);
  for(const source of latest.sources)row(flow,source.label,
   (STATES[source.status]||source.status)+' · '+source.detail);
 }
 async function load(){
  if(busy)return;
  busy=true;if(refresh)refresh.disabled=true;
  if(catalog)catalog.textContent='구성 확인 중…';
  try{
   await waitForSession();
   const response=await fetcher('/api/capability-catalog',{method:'GET',credentials:'same-origin',cache:'no-store'});
   if(!response.ok)throw Error('구성 조회 실패');
   const report=await response.json();
   if(report?.schema!=='sunny-capabilities-v1'||!Array.isArray(report.sources))
    throw Error('구성 응답 형식 미확인');
   loaded=true;
   if(catalog){
    catalog.replaceChildren();
    for(const source of report.sources){
     row(catalog,source.name+' · '+(source.configuration==='configured'?'키 등록':
       source.configuration==='no-key-required'?'별도 키 없음':'키 미설정'),
      source.slot+' · '+source.apiPath+' · '+source.keys.join(', ')+
      ' · 실수신 별도 검증'+(source.swapInApp?' · 제공자 선택 가능':''));
    }
    row(catalog,'위험판단 정책',report.riskModels.filter(m=>m.status==='implemented').map(m=>m.id).join(' / '));
    row(catalog,'LLM 설명 어댑터','선택 연결 · 환경설정의 LLM 상태 확인 · 위험판정 변경 없음');
   }
  }catch{
   if(catalog)catalog.textContent='API 구성 조회 실패 · 환경설정 데이터 연결 상태를 확인하세요.';
  }finally{busy=false;if(refresh)refresh.disabled=false;}
 }
 section?.addEventListener('toggle',()=>{if(section.open&&!loaded)void load();});
 refresh?.addEventListener('click',()=>{void load();});
 render();
 return {update(input){latest=buildRiskLineage(input);render();},
  getLatest:()=>latest,refresh:load};
}
