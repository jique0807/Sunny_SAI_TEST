import {readScenarios,saveScenario,sanitizeScenario} from './dummy-scenario-store.mjs';
export function initDummyScenarioUI({document,storage,search,onStart,isActive=()=>false,onInject=()=>{}}){
 const dialog=document.createElement('dialog');dialog.className='sunny-dummy-dialog';
 dialog.innerHTML=`<form method="dialog" class="dialog-head"><h2>더미 시연모드</h2><button aria-label="더미 설정 닫기">×</button></form>
 <p class="hint">실제 도로·보행 경로 위에서 가상 자료로 위험 엔진을 시험합니다.</p>
 <label>이동수단<select id="dummyMode"><option value="driving">자동차</option><option value="walking">도보</option></select></label>
 <div class="dummy-place"><label>출발지<input id="dummyOrigin" value="서울역" autocomplete="off"/></label><button type="button" id="dummyOriginSearch">검색</button></div><div id="dummyOriginResults" class="dummy-results"></div>
 <div class="dummy-place"><label>목적지<input id="dummyDestination" value="강남역" autocomplete="off"/></label><button type="button" id="dummyDestinationSearch">검색</button></div><div id="dummyDestinationResults" class="dummy-results"></div>
 <details open><summary>시나리오 보관함</summary><label>저장된 시나리오<select id="dummyScenario"></select></label>
 <label>시나리오 이름<input id="dummyName" maxlength="60"/></label>
 <label>이벤트 종류<select id="dummyType"><option value="flood">폭우·침수경보</option><option value="heat">폭염·대피 안내</option><option value="missing">자료 누락·판정 보류</option><option value="snow">눈 예보</option><option value="wind">강풍 예보</option><option value="stale">오래된 예보</option><option value="offroute">경로 밖 자료</option><option value="partial">일부 자료 누락</option></select></label>
 <div class="dummy-grid"><label>초기 강수 mm/h<input id="dummyInitial" type="number" min="0" max="200"/></label><label>새 강수 mm/h<input id="dummyRain" type="number" min="0" max="200"/></label><label>새 풍속 m/s<input id="dummyWind" type="number" min="0" max="100"/></label><label>새 기온 °C<input id="dummyTemperature" type="number" min="-30" max="50"/></label><label>자료 입력 시점 %<input id="dummyTrigger" type="number" min="5" max="70"/></label></div>
 <label class="checklabel"><input id="dummyWarning" type="checkbox"/> 가상 침수경보 추가</label>
 <div class="buttonrow"><button id="dummySave" type="button">이 기기에 저장</button><button id="dummyExport" type="button">시나리오 파일 내보내기(JSON)</button><label class="dummy-import">JSON 가져오기<input id="dummyImport" type="file" accept="application/json,.json"/></label></div></details>
 <p class="hint">저장은 수정한 이벤트 조건을 이 브라우저에 보관합니다. JSON은 같은 조건을 다른 기기에서 불러오거나 평가자료로 제출하는 파일입니다. 실행 결과 기록은 이동 화면에서 별도로 내려받습니다.</p><p id="dummyStatus" role="status">출발지·목적지를 검색 결과에서 선택하세요.</p><p class="hint">시나리오는 이 브라우저에 저장됩니다. 실행 기록은 좌표·입력·판정·조치와 함께 JSON으로 내려받을 수 있습니다.</p>
 <button id="dummyStart" class="primary" type="button">경로 탐색</button>`;
 document.body.append(dialog);
 const briefing=document.createElement('details');briefing.id='dummyBriefing';briefing.className='sunny-dummy-briefing';briefing.hidden=true;briefing.open=true;
 briefing.innerHTML='<summary>더미 모드 · 진행 브리핑</summary><ol role="log" aria-live="polite"></ol><div class="buttonrow"><button type="button" data-inject>새 자료 입력</button><button type="button" data-report>실행 기록 JSON</button></div>';
 document.body.append(briefing);
 const $=id=>dialog.querySelector('#'+id);let places={origin:null,destination:null},run=null;
 const download=(value,name)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 function refresh(selected){const select=$('dummyScenario');select.replaceChildren();for(const scenario of readScenarios(storage)){const option=document.createElement('option');option.value=scenario.id;option.textContent=scenario.name;select.append(option);}if(selected)select.value=selected;load();}
 function load(){const item=readScenarios(storage).find(s=>s.id===$('dummyScenario').value);if(!item)return;
  for(const [id,key] of [['dummyName','name'],['dummyType','type'],['dummyInitial','initialRain'],['dummyRain','rain'],['dummyTemperature','temperature'],['dummyWind','windSpeed'],['dummyTrigger','trigger']])$(id).value=item[key];$('dummyWarning').checked=item.warning;}
 const values=()=>sanitizeScenario({id:/^(custom-|import-)/.test($('dummyScenario').value)?$('dummyScenario').value:'custom-'+Date.now(),name:$('dummyName').value,type:$('dummyType').value,initialRain:$('dummyInitial').value,rain:$('dummyRain').value,temperature:$('dummyTemperature').value,windSpeed:$('dummyWind').value,trigger:$('dummyTrigger').value,warning:$('dummyWarning').checked});
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
  brief(message,data={}){if(!run)return;const event={at:new Date().toISOString(),message,...data};run.events.push(event);const li=document.createElement('li');li.textContent=new Date(event.at).toLocaleTimeString('ko-KR',{hour12:false})+' '+message;const list=briefing.querySelector('ol');list.append(li);while(list.children.length>5)list.firstChild.remove();},
  end(){briefing.hidden=true;},getRun(){return run;}};
}
