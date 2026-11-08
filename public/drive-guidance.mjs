// Sunny SAI in-app foreground driving panel.
import {buildRouteHazards,renderHazardRail,showHazardDetail} from './route-hazards.mjs';
// All progress comes from GPS projected onto the real Kakao Mobility route.
// Live mode only uses real provider records. Separate demo mode is explicitly fictional.
const EARTH=111320;
export function segmentMeters(a,b){
 return Math.hypot((b.lat-a.lat)*EARTH,(b.lng-a.lng)*EARTH*Math.cos((a.lat+b.lat)*Math.PI/360));
}
export function routeFraction(path,seconds){
 if(!Array.isArray(path)||path.length<2||!Number.isFinite(seconds))return 0;
 let total=0,passed=0;
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],length=segmentMeters(a,b);
  total+=length;
  const duration=b.seconds-a.seconds;
  const share=duration>0?Math.max(0,Math.min(1,(seconds-a.seconds)/duration)):seconds>=b.seconds?1:0;
  passed+=length*share;
 }
 return total>0?Math.max(0,Math.min(1,passed/total)):0;
}
export function classifyRisk(f){
 if(!f||typeof f!=='object')return null;
 const pty=f.precipitationType,amount=Number.isFinite(f.rain)?f.rain:
  Number.isFinite(f.rainMin)?f.rainMin:Number.isFinite(f.rainMax)?f.rainMax:null;
 if([3,7].includes(pty))return {type:'snow',icon:'❄',title:'눈 예보'};
 if([2,6].includes(pty))return {type:'mixed',icon:'❄',title:'비·눈 예보'};
 if((amount!==null&&amount>0)||[1,4,5].includes(pty))return {
  type:'rain',icon:'☂',title:amount!==null&&amount>=30?'강한 비 예보':'비 예보'
 };
 return null;
}
export function upcomingRisks(samples,seconds,limit=2){
 if(!Array.isArray(samples))return [];
 const results=[];
 for(const s of samples){
  if(!s||s.status!=='forecast'||!Number.isFinite(s.seconds)||s.seconds<seconds-45)continue;
  const risk=classifyRisk(s.forecast);if(!risk)continue;
  const item={...risk,seconds:s.seconds,minutes:Math.max(0,Math.round((s.seconds-seconds)/60)),
   label:String(s.label||'전방 경로').slice(0,44),
   forecastTime:s.forecast?.time||null,source:s.forecast?.provider==='kma'?'기상청 격자예보':'기상예보'};
  results.push(item);
 }
 results.sort((a,b)=>a.seconds-b.seconds);
 const selected=[];
 for(const r of results){
  // Merge nearby forecasts about the same weather episode, but keep a later
  // recurrence of rain or snow as a separate upcoming event.
  const last=selected[selected.length-1];
  if(last&&last.type===r.type&&r.seconds-last.seconds<600)continue;
  selected.push(r);
  if(selected.length>=limit)break;
 }
 return selected;
}
export function initDriveGuidance({onStop,onReroute,formatTime,getRoadHazards=()=>[], isWeatherEnabled=()=>true}){
 const root=document.getElementById('sunnyDriveOverlay');
 const alerts=document.getElementById('sunnyDriveAlerts');
 const fill=document.getElementById('sunnyDriveProgressFill');
 const pointer=document.getElementById('sunnyDriveProgressPointer');
 const marks=document.getElementById('sunnyDriveRiskMarks');
 const hazardPanel=document.getElementById('sunnyDriveHazardDetail');
 const progress=document.getElementById('sunnyDriveProgressTrack');
 const summary=document.getElementById('sunnyDriveSummary');
 const gps=document.getElementById('sunnyDriveGpsText');
 const close=document.getElementById('sunnyDriveStop');
 const reroute=document.getElementById('sunnyDriveReroute');
 let active=false,route=null,seconds=0,weather=null,aheadSamples=null,offRoute=false,alertCount=2;
 close?.addEventListener('click',()=>onStop());
 reroute?.addEventListener('click',()=>onReroute?.());
 const setText=(node,text)=>{if(node)node.textContent=text;};
 function combinedSamples(){
  const data=[...(weather?.samples||[]),...(aheadSamples||[])];
  return data.filter(x=>x?.status==='forecast'&&x.forecast);
 }
 function render(){
  if(!active||!route)return;
  if(reroute)reroute.hidden=!offRoute;
  const fraction=routeFraction(route.rainPath,seconds);
  if(fill)fill.style.height=(fraction*100).toFixed(2)+'%';
  if(pointer)pointer.style.bottom=(fraction*100).toFixed(2)+'%';
  if(progress)progress.setAttribute('aria-valuenow',String(Math.round(fraction*100)));
  const remaining=Math.max(0,(route.distance||0)*(1-fraction));
  const duration=Math.max(0,(route.duration||0)-seconds);
  const km=remaining>=1000?(remaining/1000).toFixed(1)+'km':Math.round(remaining)+'m';
  const mins=Math.round(duration/60);
  const eta=formatTime?formatTime(new Date(Date.now()+duration*1000).toISOString()):'—';
  setText(summary,km+' 남음 · 약 '+mins+'분 · '+eta+' 도착 예상');
  const showWeather=isWeatherEnabled();
  if(!showWeather&&hazardPanel)hazardPanel.hidden=true;
  const risks=offRoute||!showWeather?[]:route.demo
   ?(route.demoHazards||[]).filter(h=>h.seconds>=seconds-45).slice(0,alertCount)
      .map(h=>({...h,minutes:Math.max(0,Math.round((h.seconds-seconds)/60))}))
   :upcomingRisks(combinedSamples(),seconds,alertCount);
  if(alerts){
   alerts.replaceChildren();
   const slots=[];
   if(offRoute){
    slots.push({title:'경로 이탈 감지',subtitle:'이탈이 계속되면 자동 재탐색 · 정차 후 수동 재탐색 가능',icon:'!',status:true});
    if(showWeather)slots.push({title:'전방 기상안내 일시중지',subtitle:'경로 복귀 후 다시 확인',icon:'·',status:true});
   }else if(showWeather){
    for(const item of risks)slots.push({
      title:(item.minutes===0?'현재 부근':item.minutes+'분 후')+' · '+item.title,
      subtitle:item.label+' · '+(route.demo?'[가상 시연 · 실제 위험 아님]':item.source),icon:item.icon,status:false
    });
    if(!slots.length){
      const known=route.demo||combinedSamples().length>0;
      slots.push({title:route.demo?'이후 가상 위험 이벤트 없음':known?'조회 지점에 추가 비·눈 예보 없음':'전방 기상예보 미확인',
       subtitle:route.demo?'시연 데이터이며 실제 날씨는 확인하지 않았습니다':known?'미조회 구간은 판단 불가':'실제 기상자료 미수신 · 위험 여부 판단 불가',
       icon:'·',status:true});
    }
    if(slots.length<alertCount){
     const checked=route.demo?(route.demoHazards||[]).filter(h=>h.seconds>=seconds).length:new Set(combinedSamples().filter(sample=>sample.seconds>=seconds).map(sample=>sample.seconds)).size;
     slots.push({title:route.demo?'시연 데이터 안내':'전방 예보 조회 상태',
      subtitle:route.demo?'모든 위험값은 가상 · 남은 이벤트 '+checked+'개':checked?'조회된 전방 지점 '+checked+'곳':'조회된 전방 지점 없음',
      icon:'·',status:true});
    }
   }
   for(const [index,item] of slots.slice(0,alertCount).entries()){
    const card=document.createElement('div');
    card.className='sunny-drive-alert'+(item.status?' sunny-drive-alert-muted':'');
    card.dataset.order=String(index+1);
    const icon=document.createElement('span');icon.className='sunny-drive-alert-icon';icon.textContent=item.icon;
    const detail=document.createElement('div');detail.className='sunny-drive-alert-text';
    const title=document.createElement('strong');title.textContent=item.title;
    const sub=document.createElement('small');sub.textContent=item.subtitle;
    detail.append(title,sub);card.append(icon,detail);alerts.append(card);
   }
  }
  if(marks){
   const official=showWeather&&!offRoute?[...buildRouteHazards(combinedSamples()),...getRoadHazards(route)].sort((a,b)=>a.seconds-b.seconds).filter(hazard=>hazard.seconds>=seconds):[];
   renderHazardRail(marks,official,route.rainPath,{
    fractionAt:routeFraction,max:route.demo?route.demoHazards.length:alertCount,
    onSelect:hazard=>showHazardDetail(hazardPanel,hazard,formatTime)
   });
  }
 }
 function start(newRoute,forecast){
  route=newRoute;weather=forecast||null;aheadSamples=null;seconds=0;offRoute=false;active=true;
  if(root)root.hidden=false;
  if(reroute)reroute.hidden=true;
  document.body.classList.add('sunny-guiding');setText(gps,route.demo?'가상 주행 재생 · 실제 GPS 사용 안 함':'GPS 위치 확인 중');render();
 }
 function stop(){
  active=false;route=null;weather=null;aheadSamples=null;seconds=0;offRoute=false;
  document.body.classList.remove('sunny-guiding');if(root)root.hidden=true;
  if(reroute)reroute.hidden=true;
  if(alerts)alerts.replaceChildren();if(marks)marks.replaceChildren();
  if(hazardPanel){hazardPanel.hidden=true;hazardPanel.replaceChildren();}
 }
 function update(routeSeconds,position,off=false){
  if(!active)return;
  offRoute=Boolean(off);
  if(Number.isFinite(routeSeconds)&&!offRoute)seconds=Math.max(0,routeSeconds);
  if(route?.demo){setText(gps,'가상 이동 중 · 실제 GPS 사용 안 함');render();return;}
  if(position){
   const error=Number.isFinite(position.accuracy)?' · 오차 ±'+Math.round(position.accuracy)+'m':'';
   setText(gps,(offRoute?'경로 이탈':'GPS 추적 중')+error+(position.directionStatus?' · '+position.directionStatus:''));
  }else if(offRoute)setText(gps,'경로 이탈 · 현재 위치 확인');
  render();
 }
 function setWeather(nextWeather){weather=nextWeather;render();}
 function setAhead(samples){aheadSamples=Array.isArray(samples)?samples:null;render();}
 function setPreferences(prefs){alertCount=prefs?.alertCount===1?1:2;render();}
 return {start,stop,update,setWeather,setAhead,setPreferences,render,isActive:()=>active};
}
