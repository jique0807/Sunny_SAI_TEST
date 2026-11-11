import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../lib/api.mjs';
import {diagnoseOpenRouterKey} from '../lib/llm-diagnostic.mjs';

const env={APP_ORIGIN:'https://openrouter-test.example',SESSION_SECRET:'z'.repeat(64),VERCEL_ENV:'preview',
 LLM_GEMMA_MODEL:'google/gemma-3-27b-it',LLM_GEMMA_BASE_URL:'https://openrouter.ai/api/v1',
 LLM_GEMMA_API_KEY:'sk-or-v1-gemma-key-123456789',
 LLM_GPT_OSS_MODEL:'openai/gpt-oss-20b',LLM_GPT_OSS_BASE_URL:'https://openrouter.ai/api/v1',
 LLM_GPT_OSS_API_KEY:'sk-or-v1-oss-key-123456789'};
const request=(path,method='GET',data,cookie='',csrf='')=>new Request(env.APP_ORIGIN+path,{
 method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,
  ...(method==='GET'?{}:{Origin:env.APP_ORIGIN,'Content-Type':'application/json'})},
 body:method==='GET'?undefined:JSON.stringify(data)});
const session=async()=>{
 const r=await handle(request('/api/session'),env);
 return {cookie:r.headers.getSetCookie()[0].split(';')[0],csrf:(await r.json()).csrf};
};

test('Gemma and GPT-OSS check independent OpenRouter keys without inference',async()=>{
 const {cookie,csrf}=await session(),seen=[];
 for(const mode of ['gemma','gpt-oss']){
  const response=await handle(request('/api/llm/openrouter-key-check','POST',{mode},cookie,csrf),env,async(url,opts)=>{
   const key=mode==='gemma'?env.LLM_GEMMA_API_KEY:env.LLM_GPT_OSS_API_KEY;
   assert.equal(url,'https://openrouter.ai/api/v1/key');
   assert.equal(opts.method,'GET');assert.equal(opts.body,undefined);
   assert.equal(opts.headers.Authorization,'Bearer '+key);
   seen.push(mode);
   return Response.json({data:{is_free_tier:false}});
  });
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.verified,true);assert.equal(data.checked,true);
  assert.equal(data.httpStatus,200);assert.equal(data.provider,'openrouter');
  for(const privateValue of [env.LLM_GEMMA_API_KEY,env.LLM_GPT_OSS_API_KEY,
   env.LLM_GEMMA_BASE_URL,env.LLM_GPT_OSS_BASE_URL])
   assert.ok(!JSON.stringify(data).includes(privateValue));
 }
 assert.deepEqual(seen,['gemma','gpt-oss']);
});

test('HTTP 401 is reported without provider response body or key',async()=>{
 const data=await diagnoseOpenRouterKey({mode:'gemma',env,
  fetcher:async()=>new Response('secret echoed upstream: never return',{status:401})});
 assert.equal(data.checked,true);assert.equal(data.verified,false);
 assert.equal(data.reason,'authentication-rejected');assert.equal(data.httpStatus,401);
 assert.ok(!JSON.stringify(data).includes('secret echoed'));
 assert.ok(!JSON.stringify(data).includes(env.LLM_GEMMA_API_KEY));
});

test('Wrong endpoint or key prefix prevents network requests',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('do not call');};
 const wrongEndpoint=await diagnoseOpenRouterKey({mode:'gemma',env:{
  ...env,LLM_GEMMA_BASE_URL:'https://not-openrouter.example/v1'},fetcher});
 assert.equal(wrongEndpoint.reason,'base-url-mismatch');
 const wrongProvider=await diagnoseOpenRouterKey({mode:'gpt-oss',env:{
  ...env,LLM_GPT_OSS_API_KEY:'sk-openai-1234567890'},fetcher});
 assert.equal(wrongProvider.reason,'key-provider-mismatch');
 assert.equal(calls,0);
});

test('Preview-only, mode and body validation, and CSRF are enforced',async()=>{
 const {cookie,csrf}=await session();let calls=0;
 const fetcher=async()=>{calls++;throw Error('do not call')};
 for(const [mode,status] of [['off',400],['custom',400]]){
  const r=await handle(request('/api/llm/openrouter-key-check','POST',{mode},cookie,csrf),env,fetcher);
  assert.equal(r.status,status);
 }
 const extra=await handle(request('/api/llm/openrouter-key-check','POST',{mode:'gemma',other:1},cookie,csrf),env,fetcher);
 assert.equal(extra.status,400);
 const badCsrf=await handle(request('/api/llm/openrouter-key-check','POST',{mode:'gemma'},cookie,'invalid'),env,fetcher);
 assert.equal(badCsrf.status,403);
 const prod=await handle(request('/api/llm/openrouter-key-check','POST',{mode:'gemma'},cookie,csrf),{
  ...env,VERCEL_ENV:'production'},fetcher);
 assert.equal(prod.status,404);
 assert.equal(calls,0);
});
