import {explainRisk,resolveExplanationMode,validateLLMConfig} from './llm-explanation.mjs';

// Fixed fictional evidence. No GPS, destination, route geometry, real observations,
// arbitrary user questions or provider records leave the server during diagnostics.
const FIXTURE=Object.freeze({
 engine:'risk-v2.0',mode:'walking',state:'evaluated',coverage:100,simulation:true,
 signals:[
  {kind:'rain',rainMm:65,assessment:{level:'caution',score:70}},
  {kind:'warning',impact:'flood',affectedRadiusMeters:200,assessment:{level:'caution',score:78}}
 ]
});
export const LLM_DIAGNOSTIC_MODES=Object.freeze(['gemma','gpt-oss']);

export async function diagnoseExplanationModel({mode,env={},fetcher=fetch,clock=()=>Date.now()}){
 if(!LLM_DIAGNOSTIC_MODES.includes(mode))throw Error('지원하지 않는 모델 진단입니다.');
 let config;
 try{config=validateLLMConfig(resolveExplanationMode(env,mode));}
 catch{return {mode,configured:false,verified:false,reason:'not-configured',
  requestedModel:null,reportedModel:null,modelIdentityMatched:null,latencyMs:null,
  httpStatus:null,failureKind:null,
  actionUnchanged:true,contract:'approved-sentence-selection-v1'};}
 const started=clock();
 const response=await explainRisk({
  profile:FIXTURE,question:'현재 상황을 간단히 설명해주세요.',
  config,fetcher
 });
 const verified=response.status==='llm'&&response.action==='reroute';
 return {mode,configured:true,verified,
  reason:verified?null:response.reason||'response-not-validated',
  httpStatus:Number.isInteger(response.httpStatus)?response.httpStatus:null,
  failureKind:typeof response.failureKind==='string'?response.failureKind:null,
  requestedModel:config.model,reportedModel:response.reportedModel||null,
  modelIdentityMatched:response.reportedModel?response.reportedModel===config.model:null,
  latencyMs:Math.max(0,Math.min(30000,Math.round(clock()-started))),
  actionUnchanged:response.action==='reroute',
  contract:'approved-sentence-selection-v1',
  fixture:'fictional-walking-risk-no-location'};
}

// Preview-only OpenRouter credential check: no chat inference and no user data.
// Validates credentials using OpenRouter's documented GET /api/v1/key endpoint.
export async function diagnoseOpenRouterKey({mode,env={},fetcher=fetch}){
 if(!LLM_DIAGNOSTIC_MODES.includes(mode))throw Error('지원하지 않는 모델 키 검사입니다.');
 let config;
 try{config=validateLLMConfig(resolveExplanationMode(env,mode));}
 catch{return {mode,provider:'openrouter',checked:false,verified:false,reason:'not-configured',httpStatus:null};}
 const baseUrl=config.baseUrl;
 if(baseUrl!=='https://openrouter.ai/api/v1')
  return {mode,provider:'openrouter',checked:false,verified:false,reason:'base-url-mismatch',httpStatus:null};
 // Avoid sending obviously non-OpenRouter keys to an external service.
 if(!config.key.startsWith('sk-or-'))
  return {mode,provider:'openrouter',checked:false,verified:false,reason:'key-provider-mismatch',httpStatus:null};
 try{
  const response=await fetcher('https://openrouter.ai/api/v1/key',{
   method:'GET',headers:{Authorization:'Bearer '+config.key,Accept:'application/json'},
   redirect:'error',signal:AbortSignal.timeout(10000)
  });
  if(!response.ok){
   const httpStatus=response.status;
   await response.body?.cancel();
   return {mode,provider:'openrouter',checked:true,verified:false,
    reason:httpStatus===401?'authentication-rejected':'provider-http-error',httpStatus};
  }
  // Confirm a real OpenRouter response without returning key metadata, balances or labels.
  const raw=await response.text();
  const data=raw.length<10000?JSON.parse(raw):null;
  const verified=response.status===200&&data?.data&&typeof data.data==='object'&&!Array.isArray(data.data);
  return {mode,provider:'openrouter',checked:true,verified:Boolean(verified),
   reason:verified?null:'unexpected-response',httpStatus:response.status};
 }catch{
  return {mode,provider:'openrouter',checked:false,verified:false,reason:'request-failed',httpStatus:null};
 }
}
