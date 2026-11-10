// Swappable, explainable risk-policy adapters. Independent of any LLM provider.
// All adapters consume the SAME vetted Risk Engine 2.0 profile and can only
// withhold a decision. They cannot invent hazards, upgrade coverage or mark safe.
import {evaluateDrivingRisk,evaluateWalkingRisk} from './safe-route-engine.mjs';
export const DEFAULT_RISK_MODEL='rules-v2';
export const EXPLANATION_CONTRACT=Object.freeze({
 input:'validated-risk-profile',output:'advisory-text-only',mayAlterEvidence:false,
 availability:'no-third-party-llm-adapter-connected'
});
const ID=/^[a-z][a-z0-9-]{2,40}$/;
const policy=(id,name,refine)=>Object.freeze({id,name,refine});
export function createRiskModelRegistry(){
 const adapters=new Map([
  [DEFAULT_RISK_MODEL,policy(DEFAULT_RISK_MODEL,'Risk Engine 2.0 기본 검증',()=>({abstain:false}))],
  ['rules-v2-strict',policy('rules-v2-strict','강화 검증 · 불충분 자료 판단 보류',
   profile=>({abstain:profile.state!=='evaluated'||profile.coverage!==100||profile.unknownSignals>0}))]
 ]);
 const api={
  register(adapter){
   if(!adapter||typeof adapter.id!=='string'||!ID.test(adapter.id)||
      typeof adapter.name!=='string'||!adapter.name.trim()||
      typeof adapter.refine!=='function'||adapters.has(adapter.id))throw Error('승인된 위험정책 어댑터 정의가 필요합니다.');
   adapters.set(adapter.id,policy(adapter.id,adapter.name.slice(0,80),adapter.refine));
   return api;
  },
  list(){return [...adapters.values()].map(({id,name})=>({id,name,type:'deterministic-policy'}));},
  evaluate(route,{mode='driving',modelId=DEFAULT_RISK_MODEL,weatherSamples=[],extraHazards=[],now=Date.now()}={}){
   const baseline=mode==='walking'?
    evaluateWalkingRisk(route,{weatherSamples,extraHazards,now}):
    mode==='driving'?evaluateDrivingRisk(route,{weatherSamples,extraHazards,now}):
    {state:'unsupported',reason:'지원하지 않는 이동수단',riskLevel:'unknown',signals:[],
     coverage:0,unknownSignals:0,signalCount:0};
   const selected=adapters.get(modelId)||adapters.get(DEFAULT_RISK_MODEL);
   let withhold=false,failed=false;
   if(!['unsupported','simulation'].includes(baseline.state)){
    try{
     // Keep the accepted evidence immutable from an adapter's point of view.
     const vetted=Object.freeze({...baseline,signals:Object.freeze(
      (baseline.signals||[]).map(x=>Object.freeze({...x})))});
     const answer=selected.refine(vetted);
     if(!answer||typeof answer.abstain!=='boolean')throw Error('invalid policy response');
     withhold=answer.abstain;
    }catch{withhold=true;failed=true;}
   }
   return {...baseline,decisionModel:selected.id,decisionModelType:'deterministic-policy',
    decisionWithheld:withhold,policyAdapterFailed:failed,
    state:withhold&&baseline.state==='evaluated'?'partial':baseline.state,
    riskLevel:withhold?'unknown':baseline.riskLevel,
    reason:withhold?'자료 검증 미완료 또는 판단 어댑터 오류 · 자동 위험 등급 판정을 보류합니다.':baseline.reason};
  }
 };
 return api;
}
export const DEFAULT_RISK_REGISTRY=createRiskModelRegistry();
