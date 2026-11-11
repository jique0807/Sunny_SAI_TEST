export function syntheticSpokenWarning(hazard,distanceMeters){
 if(hazard?.synthetic!==true||!Number.isFinite(distanceMeters)||distanceMeters<0)return null;
 const distance=Math.max(10,Math.round(distanceMeters/10)*10),prefix='전방 약 '+distance+'미터, ';
 if(hazard.kind==='warning'&&hazard.impact==='flood')return prefix+'침수경보 구간입니다. 우회 안내를 확인해주세요.';
 if(hazard.kind==='rain'&&Number.isFinite(hazard.rainMm))return prefix+'1시간 강수량 '+hazard.rainMm+'밀리미터 예보입니다. '+(hazard.rainMm>=30?'강한 비에 주의하세요.':'빗길에 주의하세요.');
 if(hazard.kind==='heat'&&Number.isFinite(hazard.temperature))return prefix+'기온 '+hazard.temperature+'도 예보입니다. 고온에 주의하고 휴식을 취하세요.';
 if(hazard.kind==='wind'&&Number.isFinite(hazard.windSpeed))return prefix+'초속 '+hazard.windSpeed+'미터 강풍 예보입니다. 이동에 주의하세요.';
 if(hazard.kind==='fog')return prefix+'시정 '+hazard.visibility+'미터 안개 구간입니다. 주의하세요.';
 if(hazard.kind==='ice')return prefix+'살얼음 주의 구간입니다. 속도를 줄이세요.';
 if(hazard.kind==='hotspot')return prefix+'사고다발지역입니다. 주변을 확인하세요.';
 if(hazard.kind==='snow')return prefix+'눈 예보입니다. 미끄럼에 주의하세요. 실제 적설량과 노면 결빙은 확인되지 않았습니다.';
 return null;
}

// Keep new dummy-mode notices from cancelling one another. Existing live/legacy
// speech remains unchanged. Obsolete journey messages are dropped after reroute.
export function createSyntheticVoiceQueue({speak,isBusy,getRoute,schedule=setTimeout,cancel=clearTimeout,now=Date.now}){
 let pending=[],timer=null;
 function drain(){
  timer=null;pending=pending.filter(item=>item.route===getRoute()&&now()-item.at<45000);
  if(!pending.length)return;
  if(isBusy()){timer=schedule(drain,250);return;}
  const item=pending.shift();void speak(item.text);
  if(pending.length)timer=schedule(drain,250);
 }
 return {push(text){if(!text)return;pending.push({text,route:getRoute(),at:now()});pending=pending.slice(-4);if(timer===null)drain();},clear(){pending=[];if(timer!==null)cancel(timer);timer=null;}};
}
