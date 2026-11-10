// Compact API-key and observed-data badges inside the existing Sunny SAI layer sheet.
// No extra map UI, no secrets, and no claims of live coverage from an installed key.
export const LAYER_HEALTH_SOURCES=Object.freeze([
 ['navLayerWeather','forecast'],
 ['navGk2aRr','gk2aRr'],['navGk2aCi','gk2aCi'],['navGk2aFog','gk2aFog'],
 ['navNationalRadar','radar'],['navNationalRain','rain'],
 ['navLayersnow','forecast','precipitation-type-unverified'],
 ['navLayerroad','road','road-position-unverified'],['navLayerfog','road','road-position-unverified'],
 ['navLayerWarning','warning'],
 ['navLayerflood','floodNational','flood-partial'],
 ['navLayerTrafficIncidents','trafficIncident'],
 ['navLayerWalkFacilities','walk','walking-facilities-unverified'],
 ['navLayerPedestrianWms','taasPedestrianWms'],
 ['navLayerChildWms','taasChildWms'],['navLayerElderlyWms','taasElderlyWms'],
 ['navLayerPedestrianHotspots','pedestrianHotspots']
]);
export function summarizeLayerHealth(entry={},constraint=null){
 const s=entry.state||'unknown',key=entry.keyRegistered;
 const api=s==='ok'||s==='empty'||s==='partial'?'응답 확인':
  s==='error'||s==='disconnected'?'연결 실패':
  key===true?'키 등록':key===false?'미설정':'검사 전';
 let data=s==='ok'?'수신 성공':s==='partial'?'일부 수신·정합 확인 전':
  s==='empty'?'자료 없음':s==='error'||s==='disconnected'?'수신 실패':
  s==='checking'?'검사 중':s==='configured'?'검사 전':'미검증';
 if(constraint==='precipitation-type-unverified')data='PTY 별도 수신 미확인';
 if(constraint==='walking-facilities-unverified')data=s==='ok'?'시설별 위치 검증 전':'시설 수신 미검증';
 if(constraint==='road-position-unverified'&&s==='ok')data='도로 좌표·등급 검증 전';
 if(constraint==='flood-partial'&&['ok','partial'].includes(s))data='WMS 수신·범람 정합 전';
 const tone=api==='응답 확인'?'ok':api==='연결 실패'?'error':'neutral';
 const dataTone=['수신 성공'].includes(data)?'ok':
  ['수신 실패'].includes(data)?'error':'neutral';
 return {api:'API: '+api,data:'자료: '+data,tone,dataTone,
  description:String(entry.detail||'자료 및 API 검증 전').slice(0,240)};
}
export function initLayerHealth({document}={}){
 const elements=new Map();
 const make=(className)=>{const el=document.createElement('em');el.className=className;return el;};
 for(const [id] of LAYER_HEALTH_SOURCES){
  const control=document.getElementById(id);
  const row=control?.closest?.('.nav-layer-row');
  const copy=row?.querySelector?.(':scope > span');
  if(!copy)continue;
  const bar=document.createElement('small');bar.className='sunny-layer-health';
  const api=make('sunny-layer-health-tag'),data=make('sunny-layer-health-tag');
  bar.append(api,data);copy.append(bar);elements.set(id,{bar,api,data});
 }
 function update(values={}){
  for(const [id,src,constraint] of LAYER_HEALTH_SOURCES){
   const row=elements.get(id);if(!row)continue;
   const state=summarizeLayerHealth(values[src],constraint);
   row.api.textContent=state.api;row.data.textContent=state.data;
   row.api.dataset.health=state.tone;row.data.dataset.health=state.dataTone;
   row.bar.title=state.description;
  }
 }
 update();
 return {update,visibleCount:()=>elements.size};
}
