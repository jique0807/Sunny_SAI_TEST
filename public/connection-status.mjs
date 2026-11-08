// Connection status displayed INSIDE Sunny SAI environment settings.
// Uses the existing preview-only, rate-limited real-provider diagnostics.
// Never display credentials or infer road safety from key presence or raw data.
export const DATA_CONNECTION_SOURCES=[
 {id:'map',group:'지도·길찾기',name:'카카오맵 지도',description:'JavaScript SDK · 프리뷰 허용 도메인'},
 {id:'vworld',group:'지도·길찾기',name:'VWorld 위성지도',description:'키·허용 도메인 · 실제 타일 수신은 지도에서 확인'},
 {id:'search',group:'지도·길찾기',name:'카카오 장소검색',description:'장소명·주소 찾기'},
 {id:'route',group:'지도·길찾기',name:'카카오 자동차 길찾기',description:'도로 경로·거리·예상 통과시각'},
 {id:'forecast',group:'강수·눈',name:'경로별 기상예보',description:'예상 통과시각의 기상청 예보'},
 {id:'rain',group:'강수·눈',name:'전국 강수량 격자 예보',description:'RN1 5km 격자 · 가장 가까운 정시의 1시간 강수량'},
 {id:'radar',group:'강수·눈',name:'HSR 레이더 실황',description:'실제 관측영상 · 10분 간격 표출'},
 {id:'road',group:'도로위험',name:'도로살얼음·안개',description:'도로 링크별 공식 위험기상정보'},
 {id:'warning',group:'기상특보',name:'기상특보 현황',description:'발효지역·특보등급 검증 필요'},
 {id:'floodNational',group:'침수·수위',name:'국가하천 범람예상지도',description:'생활안전지도 WMS · 실제 침수 아님'},
 {id:'floodLocal',group:'침수·수위',name:'지방하천 범람예상지도',description:'신청 목록 확인 · 별도 WMS 수신 미검증'},
 {id:'riverLevel',group:'침수·수위',name:'하천수위 측정정보',description:'XML 신청 목록 확인 · 프로그램 연동 전'}
];
export const CONNECTION_STATE_TEXT={
 unknown:'검사 전',unverified:'검사 보류',checking:'조회 중',configured:'키 등록',
 ok:'수신 성공',partial:'부분 확인',error:'수신 오류',missing:'키 없음',pending:'미연동'
};
export function initialConnectionResults(){
 return Object.fromEntries(DATA_CONNECTION_SOURCES.map(x=>[x.id,{
  state:['floodLocal','riverLevel'].includes(x.id)?'pending':'unknown',
  detail:['floodLocal','riverLevel'].includes(x.id)?
   '연동·개별 데이터 수신 검증 전':'연결 상태를 새로고침해 실제 API를 확인하세요.'
 }]));
}
function state(state,detail){return{state,detail};}
function providerFailure(http){
 return http===429?'API 검사 횟수 제한 · 잠시 후 재검사':
  http===404?'이 배포 환경에는 실수신 진단이 제공되지 않음':
  http===401?'검사 세션 만료 · 다시 열어주세요':
  http>=500?'진단 API 응답 실패 · 잠시 후 재검사':
  'API 검사 응답 확인 불가';
}
export function applySessionConfiguration(current,session){
 const copy={...current},config=session?.connections||{};
 const configured={
  map:Boolean(session?.mapConfig?.kakao),vworld:Boolean(session?.mapConfig?.vworld),
  search:config.route,route:config.route,
  forecast:config.kma,rain:config.kma,radar:config.kma,
  road:config.roadRisk,warning:config.kma,floodNational:config.safemap
 };
 for(const [id,yes]of Object.entries(configured)){
  copy[id]=yes?state('configured','서버에 인증키 등록됨 · 실수신 검사 필요'):
   state('missing','서버 인증키 미설정');
 }
 return copy;
}
export function mapConnectionProbe(kind,data,previous){
 const result={...previous};
 const put=(id,status,description)=>{
  if(result[id]?.state!=='missing')result[id]=state(status,description);
 };
 if(kind==='journey'){
  const mapSdk=data?.mapSdk?.fixedPreviewAlias||data?.mapSdk||{};
  put('map',mapSdk.status==='received'?'ok':mapSdk.http===401?'error':'error',
   mapSdk.status==='received'?'고정 프리뷰 도메인 SDK 응답 · 브라우저 화면 별도 확인':
    mapSdk.http===401?'SDK 접근 거절(401) · 카카오 허용 도메인 확인':'지도 SDK 실수신 미확인');
  for(const [id,key,label]of [
   ['search','search','장소검색'],['route','route','차량 경로']
  ]){
   const v=data?.[key];
   put(id,v?.status==='received'?'ok':'error',v?.status==='received'?
    label+' 실제 API 응답 확인':'카카오 '+label+' 호출 미확인');
  }
  const forecast=data?.kma;
  put('forecast',forecast?.status==='received'?'ok':'error',
   forecast?.status==='received'?'기상청 경로 지점·예보시각 응답 확인':
    '기상청 경로 지점 예보 응답 미확인');
 }
 if(kind==='rain'){
  const found=Array.isArray(data?.results)?data.results:[];
  const received=found.filter(x=>x.status==='received').length;
  put('rain',received===4?'ok':received>0?'partial':'error',
   received>0?'RN1 예보 '+received+'/4개 시간 수신 · 결측은 무강수가 아님':
    'RN1 실제 강수 격자 미수신');
 }
 if(kind==='radar'){
  const ok=data?.status==='real_radar_received'&&/^\d{12}$/.test(data.observationKst||'');
  const time=ok?(data.observationKst.slice(8,10)+':'+data.observationKst.slice(10,12)+' KST'):'';
  put('radar',ok?'ok':'error',ok?
   '실제 HSR 영상 '+time+' 관측 · 약 30분 안전 지연 조회':
   '레이더 실제 관측영상 미수신');
 }
 if(kind==='layers'){
  const road=data?.road,geos=data?.roadSchema?.schemas||[];
  const hasCoords=geos.some(s=>s.hasCoordinateColumns&&s.georeferencedRows>0);
  put('road',road?.state==='provider_zip_parsed'?'partial':'error',
   road?.state==='provider_zip_parsed'?
    '도로위험 ZIP 수신'+(hasCoords?'· 좌표 확인':'')+' · 등급/유효시각 미검증':
    '도로위험 공식 자료 수신 미확인');
  const wrn=data?.warning;
  put('warning',wrn?.state==='text_received'||wrn?.state==='header_or_empty_received'?
   'partial':'error',wrn?.state==='text_received'||wrn?.state==='header_or_empty_received'?
    '공식 텍스트 응답 · 특보내용·구역경계 미검증':
    wrn?.http===403?'기상특보 접근 거절(403)':'기상특보 API 실수신 미확인');
  const flood=data?.flood;
  put('floodNational',['png_received','png_content_type_received'].includes(flood?.state)?
   'partial':'error',['png_received','png_content_type_received'].includes(flood?.state)?
    'WMS 이미지 응답형식 확인 · 실제 범람정보 미검증':
    flood?.http?'하천범람 WMS HTTP '+flood.http+' · 제공 상태 확인':
     '하천범람 WMS 이미지 수신 미확인');
 }
 return result;
}
export function summarizeConnectionResults(results){
 const counts={ok:0,partial:0,error:0,missing:0,pending:0,unknown:0,unverified:0,checking:0,configured:0};
 for(const v of Object.values(results))counts[v.state]=(counts[v.state]||0)+1;
 return {counts,text:[
  counts.ok?'수신 성공 '+counts.ok:'',counts.partial?'부분 확인 '+counts.partial:'',
  counts.error?'오류 '+counts.error:'',counts.missing?'키 없음 '+counts.missing:'',
  counts.configured?'키 등록 '+counts.configured:'',counts.pending?'연동 대기 '+counts.pending:'',
  counts.unverified?'검사 보류 '+counts.unverified:'',counts.checking?'검사 중 '+counts.checking:'',
  counts.unknown?'검사 전 '+counts.unknown:''
 ].filter(Boolean).join(' · ')||'검사 전'};
}
export function initConnectionStatusPanel({
 document,fetcher=globalThis.fetch,waitForSession=async()=>{},
 timeoutMs=25000,now=()=>Date.now()
}={}){
 const $=id=>document.getElementById(id);
 const items=$('settingConnectionItems'),button=$('settingConnectionRefresh'),
  summary=$('settingConnectionSummary'),stamp=$('settingConnectionCheckedAt');
 let values=initialConnectionResults(),busy=false,lastChecked=null,request=0;
 const nodes=new Map();
 function render(){
  if(!items)return;
  if(!nodes.size){
   let group='';
   for(const definition of DATA_CONNECTION_SOURCES){
    if(definition.group!==group){
     group=definition.group;
     const heading=document.createElement('h4');
     heading.className='sunny-source-group';heading.textContent=group;
     items.appendChild(heading);
    }
    const row=document.createElement('div');row.className='sunny-source-row';
    row.setAttribute('role','listitem');
    const copy=document.createElement('div');copy.className='sunny-source-row-copy';
    const title=document.createElement('strong');title.textContent=definition.name;
    const description=document.createElement('small');description.textContent=definition.description;
    copy.append(title,description);
    const badge=document.createElement('span');badge.className='sunny-source-state';
    const explanation=document.createElement('small');explanation.className='sunny-source-detail';
    row.append(copy,badge,explanation);items.appendChild(row);
    nodes.set(definition.id,{row,badge,explanation});
   }
  }
  for(const [id,refs] of nodes){
   const entry=values[id]||state('unknown','검사 전');
   refs.row.dataset.connectionState=entry.state;
   refs.badge.textContent=CONNECTION_STATE_TEXT[entry.state]||'확인 불가';
   refs.explanation.textContent=entry.detail||'';
  }
  if(summary)summary.textContent=summarizeConnectionResults(values).text;
  if(stamp)stamp.textContent=lastChecked?
   '최종 검사: '+new Date(lastChecked).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+
   ' KST · 검사 시점의 서버 상태':'최종 검사: 없음';
 }
 async function requestJSON(path){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetcher(path,{credentials:'same-origin',
    cache:'no-store',signal:controller.signal});
   if(!response.ok){const err=Error(providerFailure(response.status));
    err.http=response.status;throw err;}
   return await response.json();
  }finally{clearTimeout(timer);}
 }
 async function refresh(){
  if(busy)return false;
  busy=true;const run=++request;
  if(button){button.disabled=true;button.textContent='연결 검사 중…';}
  try{
   await waitForSession();
   const session=await requestJSON('/api/session');
   if(run!==request)return false;
   values=applySessionConfiguration(initialConnectionResults(),session);
   for(const [ids]of [
    [['map','search','route','forecast']],[['rain']],[['radar']],
    [['road','warning','floodNational']]
   ])for(const id of ids)if(values[id]?.state==='configured')
    values[id]=state('checking','실제 공급기관 API 응답 확인 중');
   render();
   const checks=[
    ['journey','/api/preview-journey-smoke',['map','search','route','forecast']],
    ['rain','/api/rain-grid-diagnostic',['rain']],
    ['radar','/api/radar-latest-diagnostic',['radar']],
    ['layers','/api/route-layer-feasibility',['road','warning','floodNational']]
   ];
   await Promise.all(checks.map(async([kind,path,ids])=>{
    if(!ids.some(id=>values[id]?.state==='checking'))return;
    try{
     const data=await requestJSON(path);
     if(run===request){values=mapConnectionProbe(kind,data,values);render();}
    }catch(e){
     if(run!==request)return;
     const message=providerFailure(e?.http);
     for(const id of ids)if(values[id]?.state==='checking')
      values[id]=state([401,404,429].includes(e?.http)||e?.name==='AbortError'?'unverified':'error',message);
     render();
    }
   }));
   lastChecked=now();render();return true;
  }catch{
   if(summary)summary.textContent='설정 검사를 시작하지 못했습니다. 세션·네트워크 연결을 확인해주세요.';
   return false;
  }finally{
   if(run===request){
    busy=false;
    if(button){button.disabled=false;button.textContent='↻ 상태 새로고침';}
   }
  }
 }
 button?.addEventListener('click',()=>{void refresh();});
 render();
 return {refresh,getStatus:()=>({...values}),isChecking:()=>busy};
}
