import {readScenarios,saveScenario,sanitizeScenario,scenarioEvents} from './dummy-scenario-store.mjs';
export function initDummyScenarioUI({document,storage,search,onStart,isActive=()=>false,onInject=()=>{}}){
 const dialog=document.createElement('dialog');dialog.className='sunny-dummy-dialog';
 dialog.innerHTML=`<form method="dialog" class="dialog-head"><h2>더미 시연모드</h2><button aria-label="더미 설정 닫기">×</button></form>
 <p class="hint">실제 도로·보행 경로 위에서 가상 자료로 위험 엔진을 시험합니다.</p>
 <label>이동수단<select id="dummyMode"><option value="driving">자동차</option><option value="walking">도보</option></select></label>
 <div class="dummy-place"><label>출발지<input id="dummyOrigin" value="서울역" autocomplete="off"/></label><button type="button" id="dummyOriginSearch">검색</button></div><div id="dummyOriginResults" class="dummy-results"></div>
 <div class="dummy-place"><label>목적지<input id="dummyDestination" value="강남역" autocomplete="off"/></label><button type="button" id="dummyDestinationSearch">검색</button></div><div id="dummyDestinationResults" class="dummy-results"></div>
 <section><h3>① 일반 이벤트</h3><p class="hint">출발할 때 수신하는 자료입니다. 위험 위치는 경로 진행률입니다.</p><div id="dummyEvents"></div><button type="button" id="dummyAddEvent">＋ 이벤트 추가</button></section>
 <section><h3>② 긴급 이벤트</h3><p class="hint">이동 중 새로 수신합니다. 수신 시점을 위험 위치보다 앞에 설정하세요. 우회 후 미수신 이벤트는 새 경로의 진행률을 기준으로 합니다.</p><div id="dummyEmergencies"></div><button type="button" id="dummyAddEmergency">＋ 긴급 이벤트 추가</button></section>
 <details><summary>③ 시나리오 저장·불러오기</summary><label>저장된 구성 불러오기<select id="dummyScenario"></select></label><label>시나리오 이름<input id="dummyName" maxlength="60"/></label>
 <div class="buttonrow"><button id="dummySave" type="button">현재 구성 저장</button><button id="dummyExport" type="button">내보내기(JSON)</button><label class="dummy-import">가져오기<input id="dummyImport" type="file" accept="application/json,.json"/></label></div></details>
 <p class="hint">경로와 이벤트 구성을 함께 저장합니다. 같은 조건의 이벤트는 한 번만 적용됩니다.</p><p id="dummyStatus" role="status">출발지·목적지를 검색 결과에서 선택하세요.</p>
 <button id="dummyStart" class="primary" type="button">경로 확인 후 시연 시작</button>`;
 document.body.append(dialog);
 const briefing=document.createElement('details');briefing.id='dummyBriefing';briefing.className='sunny-dummy-briefing';briefing.hidden=true;briefing.open=true;
 briefing.innerHTML='<summary>더미 모드 · 진행 브리핑</summary><ol role="log" aria-live="polite"></ol><div class="buttonrow"><button type="button" data-inject>새 자료 입력</button><button type="button" data-report>실행 기록 JSON</button></div>';
 document.body.append(briefing);
 const $=id=>dialog.querySelector('#'+id);let places={origin:null,destination:null},run=null;
 const download=(value,name)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 function refresh(selected){const select=$('dummyScenario');select.replaceChildren();for(const scenario of readScenarios(storage)){const option=document.createElement('option');option.value=scenario.id;option.textContent=scenario.name;select.append(option);}if(selected)select.value=selected;load();}
 const labels={rain:'비',flood:'폭우·침수경보',heat:'고온',snow:'눈',wind:'강풍',fog:'안개',ice:'도로 살얼음',hotspot:'사고다발지역',missing:'자료 누락',stale:'오래된 자료',offroute:'경로 밖 자료',partial:'일부 자료 누락'};
 const defaults={rain:8,flood:65,heat:35,snow:0,wind:18,fog:200,ice:0,hotspot:5,missing:0,stale:0,offroute:0,partial:0};
 function addRow(item,emergency){const box=$(emergency?'dummyEmergencies':'dummyEvents');if(box.children.length>=8){$('dummyStatus').textContent='각 목록은 최대 8개입니다.';return;}
 const row=document.createElement('div');row.className='dummy-event-row';row.style.cssText='border:1px solid #ccd4df;border-radius:10px;padding:10px;margin:8px 0';
 row.innerHTML='<label>이벤트<select data-kind></select></label><div class="dummy-grid"><label>위험 위치 %<input data-position type="number" min="10" max="95"></label>'+(emergency?'<label>자료 수신 시점 %<input data-trigger type="number" min="1" max="85"></label>':'')+'<label data-value-label><span></span><input data-value type="number"></label></div><button type="button" data-remove>삭제</button>';
 const select=row.querySelector('[data-kind]');for(const [kind,label]of Object.entries(labels)){if(!emergency&&['flood','missing','stale','offroute','partial'].includes(kind))continue;const o=document.createElement('option');o.value=kind;o.textContent=label;select.append(o);}select.value=item.kind;
 row.querySelector('[data-position]').value=item.position;const trigger=row.querySelector('[data-trigger]');if(trigger)trigger.value=item.trigger;
 const units={rain:'강수량 mm/h',flood:'강수량 mm/h',heat:'기온 °C',wind:'풍속 m/s',fog:'시정 m',hotspot:'과거 사고 건수(더미)'};
 const render=()=>{const label=row.querySelector('[data-value-label]');label.hidden=!units[select.value];label.querySelector('span').textContent=units[select.value]||'수치';};
 row.querySelector('[data-value]').value=item.value;select.onchange=()=>{row.querySelector('[data-value]').value=defaults[select.value];render();};row.querySelector('[data-remove]').onclick=()=>row.remove();render();box.append(row);
 }
 function load(){const raw=readScenarios(storage).find(s=>s.id===$('dummyScenario').value);if(!raw)return;const item=scenarioEvents(raw);$('dummyName').value=item.name;for(const [id,list,emergency] of [['dummyEvents',item.events,false],['dummyEmergencies',item.emergencies,true]]){$(id).replaceChildren();for(const entry of list)addRow(entry,emergency);}if(item.journey){places={origin:item.journey.origin,destination:item.journey.destination};$('dummyMode').value=item.journey.mode;$('dummyOrigin').value=places.origin?.name||'';$('dummyDestination').value=places.destination?.name||'';}}
 const entries=id=>Array.from($(id).children).map(row=>({kind:row.querySelector('[data-kind]').value,position:Number(row.querySelector('[data-position]').value),trigger:Number(row.querySelector('[data-trigger]')?.value||0),value:Number(row.querySelector('[data-value]').value)}));
 const values=()=>sanitizeScenario({id:/^(custom-|import-)/.test($('dummyScenario').value)?$('dummyScenario').value:'custom-'+Date.now(),name:$('dummyName').value,type:'flood',events:entries('dummyEvents'),emergencies:entries('dummyEmergencies'),journey:{...places,mode:$('dummyMode').value}});
 $('dummyAddEvent').onclick=()=>addRow({kind:'rain',position:40,value:8},false);
 $('dummyAddEmergency').onclick=()=>addRow({kind:'flood',position:70,trigger:20,value:65},true);
 $('dummyScenario').onchange=load;
 $('dummySave').onclick=()=>{try{const item=saveScenario(storage,values());refresh(item.id);$('dummyStatus').textContent='이 브라우저에 시나리오를 저장했습니다.';}catch(e){$('dummyStatus').textContent='저장 실패: '+e.message;}};
 $('dummyExport').onclick=()=>download({schema:'sunny-dummy-scenario-v1',scenario:values()},'sunny-dummy-scenario.json');
 $('dummyImport').onchange=async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>100000)throw Error('파일이 너무 큽니다.');const raw=JSON.parse(await file.text());const item=saveScenario(storage,{...sanitizeScenario(raw.scenario||raw),id:'import-'+Date.now()});refresh(item.id);$('dummyStatus').textContent='시나리오를 가져왔습니다.';}catch(error){$('dummyStatus').textContent='가져오기 실패: '+error.message;}};
 for(const [key,inputId,buttonId,resultId] of [['origin','dummyOrigin','dummyOriginSearch','dummyOriginResults'],['destination','dummyDestination','dummyDestinationSearch','dummyDestinationResults']]){
  let seq=0;$(inputId).oninput=()=>{seq++;places[key]=null;$(resultId).replaceChildren();};
  $(buttonId).onclick=async()=>{const request=++seq;$(buttonId).disabled=true;try{const list=await search($(inputId).value.trim());if(request!==seq)return;$(resultId).replaceChildren();for(const p of list.slice(0,6)){const b=document.createElement('button');b.type='button';b.textContent=p.name+' · '+(p.address||p.roadAddress||'');b.onclick=()=>{places[key]=p;$(inputId).value=p.name;$(resultId).replaceChildren();$('dummyStatus').textContent=(key==='origin'?'출발지':'목적지')+' 선택: '+p.name;};$(resultId).append(b);}if(!list.length)$('dummyStatus').textContent='검색 결과가 없습니다.';}catch(e){$('dummyStatus').textContent='검색 실패: '+e.message;}finally{$(buttonId).disabled=false;}};
 }
 $('dummyStart').onclick=async()=>{if(!places.origin||!places.destination){$('dummyStatus').textContent='출발지와 목적지를 검색 결과에서 선택해주세요.';return;}const button=$('dummyStart');button.disabled=true;try{const ok=await onStart({origin:places.origin,destination:places.destination,mode:$('dummyMode').value,scenario:values()});if(ok)dialog.close();else $('dummyStatus').textContent='경로 준비 실패 · 안내 문구를 확인하고 다시 시도하세요.';}catch(e){$('dummyStatus').textContent=e.message;}finally{button.disabled=false;}};
 briefing.querySelector('[data-inject]').onclick=()=>onInject();briefing.querySelector('[data-report]').onclick=()=>{if(run)download(run,'sunny-dummy-run.json');};refresh();
 return {open(){if(isActive()){return false;}dialog.showModal();return true;},
  begin(data){run={schema:'sunny-dummy-run-v1',startedAt:new Date().toISOString(),...data,events:[]};briefing.querySelector('ol').replaceChildren();briefing.hidden=false;briefing.open=true;},
  brief(message,data={}){if(!run)return;const event={at:new Date().toISOString(),message,...data};run.events.push(event);if(/^(음성 출력|Google 음성 실패)/.test(message))return;const li=document.createElement('li');li.textContent=new Date(event.at).toLocaleTimeString('ko-KR',{hour12:false})+' '+message;const list=briefing.querySelector('ol');list.append(li);while(list.children.length>5)list.firstChild.remove();},
  end(){briefing.hidden=true;},getRun(){return run;}};
}
