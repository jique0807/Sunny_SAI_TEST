import {buildExplanationContext,templateExplanation} from './risk-explanation-context.mjs';
export function initLLMExplanation({document,api,onEvent=()=>{},onSpeak=()=>{}}){
 let current=null,identity=null,revision=0,busy=false,timer=null,lastRequest=0,lastAuto='',configured=false,answerText='';
 const section=document.createElement('section');section.className='sunny-settings-section';
 section.innerHTML=`<h3>LLM 상황 브리핑·근거 설명</h3><p class="hint">위험판단의 이유를 설명합니다. LLM 미연결 시 정형 설명을 제공합니다. 연결 시 판정 근거와 질문만 모델 제공자에게 보내며, GPS·목적지는 보내지 않습니다.</p>
 <label class="checklabel"><input id="llmAuto" type="checkbox"/> 새 위험판정 시 자동 브리핑</label>
 <label for="llmProvider">LLM 설명 모델</label><select id="llmProvider"><option value="off">LLM 미사용 · 정형 설명</option><option value="gemini">Google Gemini</option><option value="gpt-oss">GPT-OSS</option><option value="custom">서버에 등록된 호환 API</option></select>
 <p class="hint">Gemini·GPT-OSS는 저장된 키로 연결합니다. 호환 API는 운영자가 별도 등록한 다른 모델 서버용입니다.</p>
 <details><summary>모델·연결 상세 설정</summary>
 <label for="llmModel">모델 ID</label><input id="llmModel" value="gemini-3.5-flash-lite" maxlength="120" placeholder="계정에서 사용 가능한 모델 ID"/>
 <label for="llmKey">개인 LLM API 키</label><input id="llmKey" type="password" autocomplete="off" placeholder="임시 연결용 API 키"/>

 <p class="hint">서버에 등록된 모델은 키 입력 없이 적용할 수 있습니다. 별도로 입력한 키만 최대 30분 임시 보관합니다. 모델 사용료가 발생할 수 있습니다.</p></details><div class="buttonrow"><button id="llmConnect" type="button">선택한 모델 적용</button><button id="llmDisconnect" type="button">서버 기본 연결로 복원</button></div><p id="llmConfigStatus" role="status">연결 상태 확인 전</p>`;
 const settings=document.getElementById('settings'),voice=document.getElementById('voicePreferencesHeading')?.closest('section');
 if(settings)settings.insertBefore(section,voice?.parentElement===settings?voice:null);
 const dialog=document.createElement('dialog');dialog.className='sunny-llm-dialog';
 dialog.innerHTML=`<form method="dialog" class="dialog-head"><h2>왜 이렇게 판단했나요?</h2><button aria-label="근거 설명 닫기">×</button></form><p class="hint">현재 엔진 판정 근거를 설명합니다.</p><label for="llmQuestion">질문</label><select id="llmQuestion"><option>현재 상황을 간단히 설명해주세요.</option><option>왜 이 조치를 권고했나요?</option><option>어떤 자료가 부족하거나 불확실한가요?</option></select><button id="llmGenerate" type="button">근거 설명 요청</button><p id="llmAnswer" role="status"></p><p id="llmAnswerSource" class="hint"></p><button id="llmRead" type="button">설명 읽어주기</button>`;
 document.body.append(dialog);
 const driveButton=document.createElement('button');driveButton.type='button';driveButton.className='sunny-llm-why';driveButton.textContent='판단 근거';document.body.append(driveButton);
 const routeButton=document.createElement('button');routeButton.type='button';routeButton.id='llmRouteWhy';routeButton.textContent='왜 이렇게 판단했나요?';document.getElementById('navRouteRiskStatus')?.after(routeButton);
 const floating=document.createElement('details');floating.className='sunny-llm-floating';floating.hidden=true;floating.innerHTML='<summary>LLM 상황 브리핑</summary><p></p>';document.body.append(floating);
 const $=id=>document.getElementById(id);
 const status=text=>{$('llmConfigStatus').textContent=text;};
 const defaultGeminiModel='gemini-3.5-flash-lite';
 const modelDrafts={off:'',gemini:defaultGeminiModel,'gpt-oss':'openai/gpt-oss-120b',custom:''};
 let serverModels=[],selectedProvider='gemini',appliedMode=null;
 function showMode(){
  const off=selectedProvider==='off';
  $('llmModel').disabled=off;$('llmKey').disabled=off;$('llmAuto').disabled=off;
  if(off){$('llmAuto').checked=false;clearTimeout(timer);floating.hidden=true;}
 }
 $('llmProvider').addEventListener('change',()=>{
  modelDrafts[selectedProvider]=$('llmModel').value.trim();
  selectedProvider=$('llmProvider').value;
  $('llmModel').value=modelDrafts[selectedProvider]||'';$('llmKey').value='';
  clearTimeout(timer);floating.hidden=true;configured=false;showMode();status('선택한 모델 적용을 눌러 저장해주세요.');
 });
 async function refresh(){try{
  const d=await api('/api/llm/status',null,'GET');configured=d.configured===true;serverModels=d.serverModels||[];
  for(const preset of serverModels){if(preset.configured&&preset.mode)modelDrafts[preset.mode]=preset.model;}
  selectedProvider=d.mode||'off';appliedMode=selectedProvider;$('llmProvider').value=selectedProvider;
  $('llmModel').value=d.model||modelDrafts[selectedProvider]||'';modelDrafts[selectedProvider]=$('llmModel').value;
  showMode();status(selectedProvider==='off'?'LLM 미사용 · 외부 모델 호출 없이 정형 설명을 제공합니다.':
   configured?(d.connection==='server'?'서버 저장 모델 · ':'임시 연결 · ')+d.model+' · 실제 설명 응답 검사 전':
   '미연결 · 호환 모델 서버 주소와 키를 운영자가 등록해야 합니다. 정형 설명을 사용합니다.');
 }catch{configured=false;status('연결 상태 미확인 · 정형 근거 설명 사용');}}
 $('llmConnect').onclick=async()=>{
  const key=$('llmKey').value;$('llmKey').value='';$('llmConnect').disabled=true;$('llmProvider').disabled=true;
  revision++;answerText='';$('llmRead').disabled=true;$('llmAnswerSource').textContent='';clearTimeout(timer);floating.hidden=true;
  try{await api('/api/llm/key',{mode:selectedProvider,key,model:$('llmModel').value.trim()});await refresh();lastAuto='';}
  catch(e){configured=false;status('연결 설정 실패: '+e.message);}finally{$('llmConnect').disabled=false;$('llmProvider').disabled=false;}
 };
 $('llmDisconnect').onclick=async()=>{try{await api('/api/llm/key',null,'DELETE');revision++;floating.hidden=true;await refresh();}catch(e){status(e.message);}};
 $('llmAuto').onchange=()=>{clearTimeout(timer);if(!$('llmAuto').checked)floating.hidden=true;else if(current&&configured)void generate(true);};
 document.getElementById('settings')?.addEventListener('close',()=>{$('llmKey').value='';});
 async function generate(automatic=false){
  if(!current||busy)return;
  if(selectedProvider!=='off'&&selectedProvider!==appliedMode){$('llmAnswer').textContent='환경설정에서 선택한 모델 적용을 먼저 눌러주세요.';return;}
  const snapshot=current,version=revision,routeIdentity=identity;
  busy=true;$('llmGenerate').disabled=true;lastRequest=Date.now();
  $('llmAnswer').textContent='현재 판정 근거로 설명을 준비합니다.';$('llmAnswerSource').textContent='';
  let d;
  try{if(selectedProvider==='off'){d={status:'template',text:templateExplanation(buildExplanationContext(snapshot)),reason:'llm-disabled'};}else d=await api('/api/llm/explain',{profile:snapshot,question:$('llmQuestion').value});}
  catch{const context=buildExplanationContext(snapshot);d={status:'template',text:templateExplanation(context),reason:'request-failed'};}
  finally{busy=false;$('llmGenerate').disabled=false;}
  if(version!==revision||identity!==routeIdentity||(automatic&&!$('llmAuto').checked))return;
  answerText=d.text;$('llmAnswer').textContent=d.text;$('llmRead').disabled=false;
  $('llmAnswerSource').textContent=d.status==='llm'?'LLM 응답 검증 완료 · '+d.provider+' / '+d.model:'정형 근거 설명 · LLM 응답 미사용 ('+(d.reason||'fallback')+')';
  status(d.status==='llm'?'실제 LLM 설명 응답 확인 · '+d.model:'정형 설명 사용 · '+(d.reason||'응답 미확인'));
  if(automatic&&!snapshot.simulation){floating.hidden=false;floating.open=true;floating.querySelector('p').textContent=d.text;}
  onEvent(d,automatic);
 }
 function open(){if(!current){$('llmAnswer').textContent='경로를 탐색해 위험판정 근거를 먼저 준비해주세요.';dialog.showModal();return;}
  dialog.showModal();void generate();}
 routeButton.onclick=open;driveButton.onclick=open;$('llmGenerate').onclick=()=>void generate();$('llmRead').disabled=true;$('llmRead').onclick=()=>{if(current&&answerText)onSpeak(answerText);};
 return {refresh,update(profile,routeIdentity){
  let next=null;try{if(profile){buildExplanationContext(profile);next={engine:profile.engine,mode:profile.mode,state:profile.state,coverage:profile.coverage,
   simulation:profile.simulation===true,decisionWithheld:profile.decisionWithheld===true,signals:profile.signals.map(h=>({kind:h.kind,roadRisk:h.roadRisk,
    validTime:h.validTime,impact:h.impact,affectedRadiusMeters:h.affectedRadiusMeters,rainMm:h.rainMm,temperature:h.temperature,windSpeed:h.windSpeed,
    assessment:{level:h.assessment?.level,score:h.assessment?.score}}))};}}catch{}
  const fingerprint=JSON.stringify(next),changed=fingerprint!==JSON.stringify(current)||routeIdentity!==identity;
  if(!changed)return;current=next;identity=routeIdentity;revision++;clearTimeout(timer);floating.hidden=true;answerText='';$('llmRead').disabled=true;$('llmAnswerSource').textContent='';$('llmAnswer').textContent='판정 근거가 변경되었습니다. 새 설명을 요청해주세요.';
  if(!next)return;
  if($('llmAuto').checked&&configured&&fingerprint!==lastAuto){lastAuto=fingerprint;timer=setTimeout(()=>void generate(true),Math.max(1000,60000-(Date.now()-lastRequest)));}
 },clear(){current=null;revision++;clearTimeout(timer);floating.hidden=true;answerText='';$('llmRead').disabled=true;$('llmAnswer').textContent='현재 경로의 판정 근거가 없습니다.';$('llmAnswerSource').textContent='';}};
}
