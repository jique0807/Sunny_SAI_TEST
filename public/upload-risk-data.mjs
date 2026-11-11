// User-imported evidence is advisory only: never impersonate an official feed.
const geo=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lng)&&p.lat>=32&&p.lat<=40&&p.lng>=123&&p.lng<=133;
const stamp=v=>typeof v==='number'?v*1000:typeof v==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
export function parseUploadedRiskData(text){
 if(typeof text!=='string'||text.length>1000000)throw Error('JSON 파일은 1MB 이하만 사용할 수 있습니다.');
 const data=JSON.parse(text);let rows=data;
 if(data?.hourly&&Number.isFinite(data.latitude)&&Number.isFinite(data.longitude)){
  const h=data.hourly;
  if(data.hourly_units?.precipitation!=='mm'||data.hourly_units?.temperature_2m!=='°C'||data.hourly_units?.wind_speed_10m!=='m/s')throw Error('예제 기상자료의 단위는 mm·°C·m/s여야 합니다.');
  if(!Array.isArray(h.time)||h.time.length>168)throw Error('기상자료 시간 범위를 확인해주세요.');
  rows=h.time.flatMap((t,i)=>[['rain',h.precipitation?.[i]],['temperature',h.temperature_2m?.[i]],['wind',h.wind_speed_10m?.[i]]].filter(([,v])=>v!==null&&v!==undefined).map(([kind,value])=>({lat:data.latitude,lng:data.longitude,kind,value,validFrom:t,validTo:typeof t==='number'?t+3600:new Date(Date.parse(t+'Z')+3600000).toISOString(),label:'Open-Meteo 업로드 참고자료'})));
 }
 if(!Array.isArray(rows)||!rows.length||rows.length>500)throw Error('JSON 배열 1~500건 또는 Open-Meteo hourly 응답을 올려주세요.');
 return rows.map((r,i)=>{
  const from=stamp(r.validFrom),to=stamp(r.validTo),range={rain:[0,500],temperature:[-80,70],wind:[0,150]}[r.kind];
  if(!geo(r)||!range||!Number.isFinite(r.value)||r.value<range[0]||r.value>range[1]||!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>86400000||r.mode&&!['driving','walking','all'].includes(r.mode))throw Error((i+1)+'행: 좌표·종류·단위·유효시각을 확인해주세요.');
  return {lat:r.lat,lng:r.lng,kind:r.kind,value:r.value,from,to,mode:r.mode||'all',label:String(r.label||'사용자 업로드').slice(0,80)};
 });
}
export function evaluateUploadedRisk(records,route,{now=Date.now()}={}){
 const report={matched:[],expired:0,excluded:0,reason:null};
 if(!route||route.demo||!Array.isArray(route.rainPath)||route.rainPath.length<2||!Number.isFinite(Date.parse(route.departure))){report.reason=route?.demo?'시연 경로에는 적용하지 않습니다.':'실제 경로를 먼저 조회해주세요.';return report;}
 const mode=route.travelMode||'driving',departure=Date.parse(route.departure),path=route.rainPath;
 for(const r of records){
  if(r.to<=now){report.expired++;continue;}
  if(r.mode!=='all'&&r.mode!==mode){report.excluded++;continue;}
  let closest=Infinity,seconds=null;
  const sx=111195*Math.cos(r.lat*Math.PI/180),sy=111195;
  for(let i=1;i<path.length;i++){
   const a=path[i-1],b=path[i];if(!geo(a)||!geo(b)||!Number.isFinite(a.seconds)||!Number.isFinite(b.seconds))continue;
   const ax=(a.lng-r.lng)*sx,ay=(a.lat-r.lat)*sy,dx=(b.lng-a.lng)*sx,dy=(b.lat-a.lat)*sy;
   const f=dx*dx+dy*dy?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy))):0;
   const distance=Math.hypot(ax+f*dx,ay+f*dy),s=a.seconds+f*(b.seconds-a.seconds),eta=departure+s*1000;
   if(distance<=500&&eta>=now-120000&&eta>=r.from&&eta<r.to&&distance<closest){closest=distance;seconds=s;}
  }
  if(seconds===null){report.excluded++;continue;}
  const level=r.kind==='rain'?(r.value>=30?'caution':r.value>=5?'notice':'info'):r.kind==='temperature'?(r.value>=33||r.value<=-12?'caution':'info'):r.value>=14?'caution':'info';
  report.matched.push({...r,seconds,distance:Math.round(closest),level});
 }
 return report;
}
export function initUploadedRisk({document,getRoute,getMap,onChange=()=>{},fetcher=fetch}){
 const panel=document.createElement('section');panel.className='sunny-settings-section';
 panel.innerHTML='<h3>위험자료 업로드</h3><p>위도·경도와 시각이 포함된 JSON · 최대 1MB / 500건</p><input type="file" accept=".json,application/json" aria-label="위험자료 JSON 파일"/><div class="buttonrow"><button type="button" data-example>공개 기상 API 자료로 시험</button><button type="button" data-apply disabled>경로 참고평가에 적용</button><button type="button" data-clear>해제·자료 삭제</button></div><p data-status role="status">파일 선택 전</p><p class="hint">사용자 자료는 공식 검증자료와 구분합니다. 경로 500m 이내·예상 통과시각이 맞는 자료만 참고평가하며 자동 우회에는 사용하지 않습니다. 파일은 서버에 올리거나 저장하지 않습니다.</p><details><summary>JSON 형식 안내</summary><pre>lat, lng, kind, value, validFrom, validTo\nkind: rain(mm/h), temperature(°C), wind(m/s)\n시각: UTC 오프셋 포함 ISO 8601 또는 Unix 초\nJSON 배열 또는 Open-Meteo hourly 원본 응답</pre></details>';
 document.getElementById('navLayersSheet')?.append(panel);
 const result=document.createElement('p');result.className='sunny-source-caution';result.hidden=true;result.setAttribute('role','status');document.getElementById('navRouteRiskStatus')?.after(result);
 let staged=[],active=[],markers=[],run=0;
 const status=panel.querySelector('[data-status]'),apply=panel.querySelector('[data-apply]'),input=panel.querySelector('input');
 function clearMarkers(){for(const m of markers)m.setMap(null);markers=[];}
 function refresh(){
  clearMarkers();result.hidden=!active.length;if(!active.length)return;
  const report=evaluateUploadedRisk(active,getRoute());
  const warnings=report.matched.filter(x=>x.level!=='info');
  result.textContent='업로드 참고평가 · '+(report.reason||'위치·통과시각 일치 '+report.matched.length+'건 / 주의 '+warnings.length+'건 / 만료 '+report.expired+'건 / 제외 '+report.excluded+'건')+' · 공식 위험판정과 별도';
  const map=getMap();const sdk=globalThis.kakao?.maps;if(!map||!sdk?.Marker)return;
  try{for(const r of report.matched.slice(0,60)){const marker=new sdk.Marker({map,position:new sdk.LatLng(r.lat,r.lng),title:'업로드 참고 · '+r.kind+' '+r.value+' · '+r.level});markers.push(marker);}}catch{clearMarkers();}
 }
 function stage(text){const next=parseUploadedRiskData(text);staged=next;apply.disabled=false;status.textContent='형식 검증 '+next.length+'건 · 적용 전 / 위도 '+next[0].lat+' · 경도 '+next[0].lng;}
 input.onchange=async()=>{const id=++run;staged=[];apply.disabled=true;try{const file=input.files?.[0];if(!file)return;if(file.size>1000000)throw Error('파일은 1MB 이하만 올려주세요.');const text=await file.text();if(id===run)stage(text);}catch(e){status.textContent='자료 제외: '+e.message;}};
 panel.querySelector('[data-example]').onclick=async e=>{const id=++run;e.target.disabled=true;staged=[];apply.disabled=true;status.textContent='서울시청 고정 좌표의 공개 기상 API 조회 중';try{const response=await fetcher('https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&hourly=temperature_2m,precipitation,wind_speed_10m&wind_speed_unit=ms&timeformat=unixtime&timezone=GMT&forecast_days=2',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('HTTP '+response.status);const text=await response.text();if(id===run)stage(text);}catch{if(id===run)status.textContent='예제 API 수신 실패 · 기존 경로와 위험판정은 유지됩니다.';}finally{e.target.disabled=false;}};
 apply.onclick=()=>{active=staged.map(r=>({...r}));refresh();status.textContent=active.length+'건 적용 · 현재 경로 기준 참고평가';onChange();};
 panel.querySelector('[data-clear]').onclick=()=>{run++;active=[];staged=[];input.value='';apply.disabled=true;clearMarkers();result.hidden=true;status.textContent='업로드 자료 삭제됨';onChange();};
 return {refresh};
}
