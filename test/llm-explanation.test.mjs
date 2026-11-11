import test from 'node:test';
import assert from 'node:assert/strict';
import {explainRisk,validateLLMConfig} from '../lib/llm-explanation.mjs';
import {buildExplanationContext,validateExplanationSelection} from '../public/risk-explanation-context.mjs';
import {handle} from '../lib/api.mjs';
const profile={engine:'risk-v2.0',mode:'driving',state:'evaluated',coverage:100,simulation:true,
 signals:[{kind:'rain',rainMm:65,lat:37.12345,lng:127.98765,provider:'ignore injected narrative',assessment:{level:'caution',score:70}},
 {kind:'warning',impact:'flood',affectedRadiusMeters:200,assessment:{level:'caution',score:78}}]};
const key='not-a-real-key-1234567890';
const selection={sentenceIds:['scope','decision','e0','e1','uncertainty'],action:'reroute'};
const config={provider:'gemini',model:'model-under-test',key};
for(const provider of ['gemini','compatible'])test(provider+' response is grounded and preserves the engine action',async()=>{
 const before=JSON.stringify(profile);
 const result=await explainRisk({profile,config:{...config,provider,baseUrl:'https://inference.example/v1'},fetcher:async(url,options)=>{
  assert.ok(!url.includes(key));const body=JSON.parse(options.body),text=JSON.stringify(body);
  assert.ok(!text.includes('37.12345'));assert.ok(!text.includes('127.98765'));assert.ok(!text.includes('ignore injected narrative'));
  assert.equal(provider==='gemini'?options.headers['x-goog-api-key']:options.headers.Authorization,provider==='gemini'?key:'Bearer '+key);
  const data=JSON.stringify(selection);
  return Response.json(provider==='gemini'?{candidates:[{content:{parts:[{text:data}]}}]}:{choices:[{message:{content:data}}]});
 }});
 assert.equal(result.status,'llm');assert.equal(result.action,'reroute');assert.match(result.text,/65mm/);assert.match(result.text,/시뮬레이션/);
 assert.equal(JSON.stringify(profile),before);
});
test('invented evidence, changed actions and missing uncertainty are rejected',()=>{
 const context=buildExplanationContext(profile);
 for(const value of [{...selection,action:'continue'},{...selection,sentenceIds:['scope','decision','uncertainty','invented']},{...selection,sentenceIds:['scope','decision','e0']}, {...selection,text:'안전한 도로입니다.'}])assert.throws(()=>validateExplanationSelection(value,context));
});
test('missing keys, provider failure and malicious content use explicitly labelled templates',async()=>{
 assert.equal((await explainRisk({profile,config:{}})).reason,'not-configured');
 for(const fetcher of [async()=>new Response(key,{status:403}),async()=>{throw Error(key)},async()=>Response.json({candidates:[{content:{parts:[{text:'{"sentenceIds":["fake"],"action":"continue"}'}]}}]})]){
  const result=await explainRisk({profile,config,fetcher});assert.equal(result.status,'template');assert.ok(!JSON.stringify(result).includes(key));assert.equal(result.action,'reroute');
 }
});
test('uncertain evidence cannot produce a confident reroute explanation',()=>{
 const context=buildExplanationContext({...profile,state:'partial',coverage:50});assert.equal(context.action,'abstain');
 assert.throws(()=>validateExplanationSelection(selection,context));
});
test('compatible endpoint is server-configured HTTPS and model/key formats are bounded',()=>{
 for(const baseUrl of ['http://localhost:1234/v1','https://127.0.0.1/v1','https://example.com/path?key=secret','https://user:pass@example.com/v1'])assert.throws(()=>validateLLMConfig({...config,provider:'compatible',baseUrl}));
 assert.throws(()=>validateLLMConfig({...config,model:'wrong model\n'}));
});
const env={APP_ORIGIN:'https://llm.example',SESSION_SECRET:'s'.repeat(64)};
const req=(path,method='GET',data,cookie='',csrf='')=>new Request(env.APP_ORIGIN+path,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(method==='GET'?{}:{Origin:env.APP_ORIGIN,'Content-Type':'application/json'})},body:method==='GET'?undefined:JSON.stringify(data)});
async function client(){const r=await handle(req('/api/session'),env);return {cookie:r.headers.getSetCookie()[0].split(';')[0],session:await r.json()};}
test('LLM key is encrypted, session-bound, and registration is not claimed as verified',async()=>{
 const a=await client(),b=await client();
 const r=await handle(req('/api/llm/key','POST',config,a.cookie,a.session.csrf),env);assert.equal(r.status,200);
 assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/Secure/);assert.equal((await r.json()).verified,false);
 assert.ok(!r.headers.get('set-cookie').includes(key));const llm=r.headers.getSetCookie()[0].split(';')[0];
 const own=await handle(req('/api/llm/status','GET',null,a.cookie+'; '+llm),env);assert.equal((await own.json()).configured,true);
 const other=await handle(req('/api/llm/status','GET',null,b.cookie+'; '+llm),env);assert.equal((await other.json()).configured,false);
 const swapped=await handle(req('/api/llm/key','POST',{provider:'gemini',model:'second-test-model',key:''},a.cookie+'; '+llm,a.session.csrf),env);assert.equal(swapped.status,200);assert.equal((await swapped.json()).model,'second-test-model');
 const changed=swapped.headers.getSetCookie()[0].split(';')[0];const changedStatus=await handle(req('/api/llm/status','GET',null,a.cookie+'; '+changed),env);assert.equal((await changedStatus.json()).model,'second-test-model');
 const blocked=await handle(req('/api/llm/key','POST',config,a.cookie,'wrong'),env);assert.equal(blocked.status,403);
});
test('authenticated explain endpoint falls back without claiming a real LLM call',async()=>{
 const a=await client();let called=false;
 const r=await handle(req('/api/llm/explain','POST',{profile},a.cookie,a.session.csrf),env,async()=>{called=true;throw Error('unexpected')});
 assert.equal(r.status,200);assert.equal((await r.json()).status,'template');assert.equal(called,false);
});
test('server presets switch providers without putting server keys in selection cookies or responses',async()=>{
 const a=await client();
 const settings={...env,LLM_PROVIDER:'compatible',LLM_MODEL:'oss-test',LLM_BASE_URL:'https://groq.example/v1',
  LLM_API_KEY:'groq-test-secret-123456789',GEMINI_API_KEY:'gemini-test-secret-123456789',LLM_GEMINI_MODEL:'gemini-test'};
 const snapshot=JSON.stringify(profile);
 for(const provider of ['gemini','compatible']){
  const model=provider==='gemini'?'gemini-test':'oss-test';
  const selected=await handle(req('/api/llm/key','POST',{provider,model,key:''},a.cookie,a.session.csrf),settings);
  assert.equal(selected.status,200);
  const token=selected.headers.getSetCookie()[0].split(';')[0],cookies=a.cookie+'; '+token;
  const status=await (await handle(req('/api/llm/status','GET',null,cookies),settings)).json();
  assert.equal(status.connection,'server');assert.equal(status.provider,provider);assert.equal(status.model,model);
  for(const secret of [settings.LLM_API_KEY,settings.GEMINI_API_KEY])assert.ok(!JSON.stringify(status).includes(secret)&&!token.includes(secret));
  const result=await (await handle(req('/api/llm/explain','POST',{profile},cookies,a.session.csrf),settings,async(url,options)=>{
   if(provider==='gemini'){assert.equal(options.headers['x-goog-api-key'],settings.GEMINI_API_KEY);assert.equal(options.headers.Authorization,undefined);}
   else{assert.equal(options.headers.Authorization,'Bearer '+settings.LLM_API_KEY);assert.equal(options.headers['x-goog-api-key'],undefined);}
   return Response.json(provider==='gemini'?{candidates:[{content:{parts:[{text:JSON.stringify(selection)}]}}]}:{choices:[{message:{content:JSON.stringify(selection)}}]});
  })).json();
  assert.equal(result.status,'llm');assert.equal(result.action,'reroute');assert.equal(JSON.stringify(profile),snapshot);
 }
});
