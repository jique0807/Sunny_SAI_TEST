import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handle} from '../lib/api.mjs';
import {explanationModeCatalog,resolveExplanationMode,validateLLMConfig} from '../lib/llm-explanation.mjs';
import {sanitizeAppSettings} from '../public/app-settings.mjs';
const env={APP_ORIGIN:'https://model-switch.example',SESSION_SECRET:'s'.repeat(64),
 LLM_GEMMA_MODEL:'gemma-3-27b-it',LLM_GEMMA_BASE_URL:'https://gemma-inference.example/v1',LLM_GEMMA_API_KEY:'gemma-secret-123456789',
 LLM_GPT_OSS_MODEL:'gpt-oss-20b',LLM_GPT_OSS_BASE_URL:'https://oss-inference.example/v1',LLM_GPT_OSS_API_KEY:'oss-secret-123456789'};
const profile={engine:'risk-v2.0',mode:'walking',state:'evaluated',coverage:100,simulation:true,
 signals:[{kind:'rain',rainMm:65,assessment:{level:'caution',score:70}},{kind:'warning',impact:'flood',assessment:{level:'caution',score:78}}]};
const selection={sentenceIds:['scope','decision','e0','e1','uncertainty'],action:'reroute'};
const req=(path,method='GET',data,cookie='',csrf='')=>new Request(env.APP_ORIGIN+path,{
 method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(method==='GET'?{}:{Origin:env.APP_ORIGIN,'Content-Type':'application/json'})},
 body:method==='GET'?undefined:JSON.stringify(data)});
async function client(){const r=await handle(req('/api/session'),env);return {cookie:r.headers.getSetCookie()[0].split(';')[0],csrf:(await r.json()).csrf};}
test('presets are isolated operator-only model configs',()=>{
 assert.equal(resolveExplanationMode(env,'off'),null);
 assert.equal(resolveExplanationMode(env,'gemma').model,'gemma-3-27b-it');
 assert.equal(resolveExplanationMode(env,'gpt-oss').model,'gpt-oss-20b');
 assert.equal(validateLLMConfig(resolveExplanationMode(env,'gemma')).provider,'compatible');
 assert.equal(validateLLMConfig(resolveExplanationMode(env,'gpt-oss')).provider,'compatible');
 assert.throws(()=>resolveExplanationMode(env,'invalid'));
 assert.deepEqual(explanationModeCatalog({}).filter(x=>x.id==='gemma'||x.id==='gpt-oss').map(x=>x.configured),[false,false]);
 assert.deepEqual(explanationModeCatalog(env).filter(x=>x.id==='gemma'||x.id==='gpt-oss').map(x=>x.configured),[true,true]);
 assert.equal(explanationModeCatalog({...env,LLM_GEMMA_BASE_URL:'http://localhost:8000/v1'}).find(x=>x.id==='gemma').configured,false);
});
test('settings safely default off and expose model selector',()=>{
 assert.equal(sanitizeAppSettings({}).llmMode,'off');
 assert.equal(sanitizeAppSettings({llmMode:'gemma'}).llmMode,'gemma');
 assert.equal(sanitizeAppSettings({llmMode:'gpt-oss'}).llmMode,'gpt-oss');
 assert.equal(sanitizeAppSettings({llmMode:'malicious'}).llmMode,'off');
 const html=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
 for(const v of ['settingExplanationMode','value="gemma"','value="gpt-oss"','value="off"'])assert.ok(html.includes(v));
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.ok(app.includes('llmUI?.setMode()'));assert.ok(app.includes('getMode:()=>appSettings.get().llmMode'));
});
test('same walking profile switches actual adapter requests with verified sentence selection',async()=>{
 const {cookie,csrf}=await client();const calls=[];
 for(const mode of ['gemma','gpt-oss']){
  const r=await handle(req('/api/llm/explain','POST',{mode,profile},cookie,csrf),env,async(url,opts)=>{
   calls.push(url);
   assert.equal(opts.headers.Authorization,'Bearer '+(mode==='gemma'?env.LLM_GEMMA_API_KEY:env.LLM_GPT_OSS_API_KEY));
   const body=JSON.parse(opts.body);assert.equal(body.model,mode==='gemma'?env.LLM_GEMMA_MODEL:env.LLM_GPT_OSS_MODEL);
   assert.equal(JSON.stringify(body).includes('latitude'),false);
   return Response.json({choices:[{message:{content:JSON.stringify(selection)}}]});
  });
  assert.equal(r.status,200);const result=await r.json();
  assert.equal(result.status,'llm');assert.equal(result.selectedMode,mode);assert.equal(result.action,'reroute');
  assert.equal(result.model,mode==='gemma'?env.LLM_GEMMA_MODEL:env.LLM_GPT_OSS_MODEL);
 }
 assert.equal(calls.length,2);assert.notEqual(calls[0],calls[1]);
});
test('off never calls a model; invalid and missing model fall back safely',async()=>{
 const {cookie,csrf}=await client();let calls=0;const fetcher=async()=>{calls++;throw Error('do not call');};
 const off=await handle(req('/api/llm/explain','POST',{mode:'off',profile},cookie,csrf),env,fetcher);
 assert.equal(off.status,200);const d=await off.json();assert.equal(d.status,'template');assert.equal(d.reason,'llm-disabled');assert.equal(d.selectedMode,'off');assert.equal(calls,0);
 const invalid=await handle(req('/api/llm/explain','POST',{mode:'unknown',profile},cookie,csrf),env,fetcher);
 assert.equal(invalid.status,400);assert.equal(calls,0);
 const missing=await handle(req('/api/llm/explain','POST',{mode:'gemma',profile},cookie,csrf),{...env,LLM_GEMMA_API_KEY:''},fetcher);
 assert.equal((await missing.json()).status,'template');assert.equal(calls,0);
});
test('status separates configured from verified and never exposes provider secrets',async()=>{
 const {cookie}=await client();const r=await handle(req('/api/llm/status','GET',null,cookie),env);
 assert.equal(r.status,200);const d=await r.json();
 assert.equal(d.modes.find(x=>x.id==='gemma').configured,true);
 assert.equal(d.modes.find(x=>x.id==='gpt-oss').configured,true);
 assert.equal(d.modes.find(x=>x.id==='gemma').verified,false);
 const text=JSON.stringify(d);
 for(const secret of [env.LLM_GEMMA_API_KEY,env.LLM_GPT_OSS_API_KEY,env.LLM_GEMMA_BASE_URL])assert.ok(!text.includes(secret));
});
