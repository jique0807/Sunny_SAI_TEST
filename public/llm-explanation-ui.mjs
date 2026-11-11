import {buildExplanationContext,templateExplanation} from './risk-explanation-context.mjs';
export function initLLMExplanation({document,api,onEvent=()=>{},onSpeak=()=>{}}){
 let current=null,identity=null,revision=0,busy=false,timer=null,lastRequest=0,lastAuto='',configured=false,answerText='';
 const section=document.createElement('section');section.className='sunny-settings-section';
 section.innerHTML=`<h3>LLM 상황 브리핑·근거 설명</h3><p class="hint">엔진이 확인한 근거 문장을 모델이 선택·배열합니다. 위험판정과 경로를 변경하지 않습니다. 요청 시 최소 판정 근거와 입력 질문이 선택한 모델 제공자에게 전송됩니다. 정확한 GPS·목적지·도로 형상은 보내지 않습니다.</p>
 <label class="checklabel"><input id="llmAuto" type="checkbox"/> 새 위험판정 시 자동 브리핑</label>
 <label for="llmProvider">모델 연결 방식</label><select id="llmProvider"><option value="gemini">Google Gemini</option><option value="compatible">서버에 등록된 호환 API</option></select>
 <label for="llmModel">모델 ID</label><input id="llmModel" maxlength="120" placeholder="계정에서 사용 가능한 모델 ID"/>
 <label for="llmKey">개인 LLM API 키</label><input id="llmKey" type="password" autocomplete="off" placeholder="임시 연결용 API 키"/>
 <div class="buttonrow"><button id="llmConnect" type="button">임시 연결·모델 변경</button><button id="llmDisconnect" type="button">연결 삭제</button></div>
 <p class="hint">키는 암호화된 HttpOnly 쿠키에 최대 30분 보관합니다. 같은 연결에서 모델 ID만 바꿀 때는 키를 다시 입력하지 않아도 됩니다. 모델 사용료가 발생할 수 있습니다. 호환 API 주소는 운영자가 서버 환경변수로 관리합니다.</p><p id="llmConfigStatus" role="status">연결 상태 확인 전</p>`;
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
 async function refresh(){try{const d=await api('/api/llm/status',null,'GET');configured=d.configured===true;$('llmProvider').value=d.provider||'gemini';$('llmModel').value=d.model||'';status(configured?'키·모델 등록됨 · 실제 설명 응답 검사 전':'미연결 · 정형 근거 설명을 사용할 수 있습니다.');}catch{configured=false;status('연결 상태 미확인 · 정형 근거 설명 사용');}}
 $('llmConnect').onclick=async()=>{const key=$('llmKey').value;$('llmKey').value='';$('llmConnect').disabled=true;revision++;answerText='';$('llmRead').disabled=true;
  try{await api('/api/llm/key',{key,provider:$('llmProvider').value,model:$('llmModel').value.trim()});await refresh();lastAuto='';}
  catch(e){status('연결 설정 실패: '+e.message);}finally{$('llmConnect').disabled=false;}};
 $('llmDisconnect').onclick=async()=>{try{await api('/api/llm/key',null,'DELETE');revision++;floating.hidden=true;await refresh();}catch(e){status(e.message);}};
 $('llmAuto').onchange=()=>{clearTimeout(timer);if(!$('llmAuto').checked)floating.hidden=true;else if(current&&configured)void generate(true);};
 document.getElementById('settings')?.addEventListener('close',()=>{$('llmKey').value='';});
 async function generate(automatic=false){
  if(!current||busy)return;const snapshot=current,version=revision,routeIdentity=identity;
  busy=true;$('llmGenerate').disabled=true;lastRequest=Date.now();
  $('llmAnswer').textContent='현재 판정 근거로 설명을 준비합니다.';
  let d;
  try{d=await api('/api/llm/explain',{profile:snapshot,question:$('llmQuestion').value});}
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
