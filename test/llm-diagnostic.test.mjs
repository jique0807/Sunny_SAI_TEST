import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../lib/api.mjs';
import {diagnoseExplanationModel} from '../lib/llm-diagnostic.mjs';

const env={APP_ORIGIN:'https://llm-diag.example',SESSION_SECRET:'d'.repeat(64),VERCEL_ENV:'preview',
 LLM_GEMMA_MODEL:'gemma-3-27b-it',LLM_GEMMA_BASE_URL:'https://gemma-diag.example/v1',LLM_GEMMA_API_KEY:'gemma-secret-123456789',
 LLM_GPT_OSS_MODEL:'gpt-oss-20b',LLM_GPT_OSS_BASE_URL:'https://oss-diag.example/v1',LLM_GPT_OSS_API_KEY:'oss-secret-123456789'};
const selection={sentenceIds:['scope','decision','e0','e1','uncertainty'],action:'reroute'};
const req=(path,method='GET',data,cookie='',csrf='')=>new Request(env.APP_ORIGIN+path,{
 method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(method==='GET'?{}:{Origin:env.APP_ORIGIN,'Content-Type':'application/json'})},
 body:method==='GET'?undefined:JSON.stringify(data)
});
async function client(configuration=env){
 const r=await handle(req('/api/session'),configuration);
 return {cookie:r.headers.getSetCookie()[0].split(';')[0],csrf:(await r.json()).csrf};
}
test('Gemma and GPT-OSS use independent keys and validated fictional responses',async()=>{
 const {cookie,csrf}=await client();const calls=[];
 for(const mode of ['gemma','gpt-oss']){
  const r=await handle(req('/api/llm/diagnostic','POST',{mode},cookie,csrf),env,async(url,opts)=>{
   const expected=mode==='gemma'?env.LLM_GEMMA_MODEL:env.LLM_GPT_OSS_MODEL;
   assert.equal(JSON.parse(opts.body).model,expected);
   assert.equal(opts.headers.Authorization,'Bearer '+(mode==='gemma'?env.LLM_GEMMA_API_KEY:env.LLM_GPT_OSS_API_KEY));
   assert.ok(!opts.body.includes('latitude'));
   assert.ok(!opts.body.includes('longitude'));
   calls.push(url);
   return Response.json({model:expected,choices:[{message:{content:JSON.stringify(selection)}}]});
  });
  assert.equal(r.status,200);const result=await r.json();
  assert.equal(result.verified,true);assert.equal(result.actionUnchanged,true);
  assert.equal(result.modelIdentityMatched,true);assert.equal(result.mode,mode);
  assert.equal(result.fixture,'fictional-walking-risk-no-location');
  const serialized=JSON.stringify(result);
  for(const secret of [env.LLM_GEMMA_API_KEY,env.LLM_GPT_OSS_API_KEY,
    env.LLM_GEMMA_BASE_URL,env.LLM_GPT_OSS_BASE_URL])assert.ok(!serialized.includes(secret));
 }
 assert.equal(calls.length,2);assert.notEqual(calls[0],calls[1]);
});
test('missing configuration and upstream denial are not verified',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('must not call');};
 const missing=await diagnoseExplanationModel({mode:'gemma',env:{},fetcher});
 assert.equal(missing.configured,false);assert.equal(missing.verified,false);assert.equal(calls,0);
 const denied=await diagnoseExplanationModel({mode:'gemma',env,fetcher:async()=>new Response('secret',{status:403})});
 assert.equal(denied.verified,false);assert.equal(denied.reason,'provider-unavailable');
 assert.equal(denied.httpStatus,403);assert.equal(denied.failureKind,'access-denied');
});
test('sanitized HTTP diagnoses distinguish auth, permissions, model, quota and request format',async()=>{
 for(const [status,failureKind] of [
  [400,'request-rejected'],[401,'authentication-rejected'],[402,'billing-required'],
  [403,'access-denied'],[404,'model-or-endpoint-not-found'],
  [429,'quota-or-rate-limit'],[503,'provider-server-error']
 ]){
  const result=await diagnoseExplanationModel({mode:'gpt-oss',env,fetcher:async(url,opts)=>{
   const request=JSON.parse(opts.body);
   assert.equal(request.model,env.LLM_GPT_OSS_MODEL);
   assert.equal(Object.hasOwn(request,'response_format'),false);
   assert.equal(Object.hasOwn(request,'temperature'),false);
   return new Response('never expose this upstream response body secret-marker',{status});
  }});
  assert.equal(result.verified,false);
  assert.equal(result.reason,'provider-unavailable');
  assert.equal(result.httpStatus,status);
  assert.equal(result.failureKind,failureKind);
  assert.equal(result.actionUnchanged,true);
  assert.ok(!JSON.stringify(result).includes('secret-marker'));
 }
});
test('model ID mismatch cannot masquerade as model identity confirmation',async()=>{
 const r=await diagnoseExplanationModel({mode:'gemma',env,fetcher:async()=>Response.json({
  model:'different-safe-id',choices:[{message:{content:JSON.stringify(selection)}}]
 })});
 assert.equal(r.verified,true);assert.equal(r.modelIdentityMatched,false);
});
test('only configured preview sessions may request live diagnostics',async()=>{
 const {cookie,csrf}=await client();let calls=0;const fetcher=async()=>{calls++;throw Error('must not call');};
 const bad=await handle(req('/api/llm/diagnostic','POST',{mode:'off'},cookie,csrf),env,fetcher);
 assert.equal(bad.status,400);
 const extra=await handle(req('/api/llm/diagnostic','POST',{mode:'gemma',extra:'hidden'},cookie,csrf),env,fetcher);
 assert.equal(extra.status,400);
 const production=await handle(req('/api/llm/diagnostic','POST',{mode:'gemma'},cookie,csrf),{...env,VERCEL_ENV:'production'},fetcher);
 assert.equal(production.status,404);assert.equal(calls,0);
});
