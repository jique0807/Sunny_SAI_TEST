import {probeAdditionalSource} from './additional-source-probe.mjs';
import {fetchRoadWeather} from './road-weather-observations.mjs';
export async function additionalSourceStatus(env,{fetcher=fetch,now=Date.now()}={}){
 const [road,...probes]=await Promise.all([fetchRoadWeather(env.KMA_API_KEY,fetcher,now),
  ...['aws','stations','snow','taas','shelterSafety','shelterMap'].map(mode=>probeAdditionalSource(env,mode,{fetcher,now}))]);
 const byMode=Object.fromEntries(probes.map(p=>[p.mode,p]));
 const aws=byMode.aws,station=byMode.stations,snow=byMode.snow;
 const code=p=>{try{const o=JSON.parse(p?.preview||'{}');return String(o.resultCode??o.header?.resultCode??'');}catch{return '';}};
 const error=p=>p?.status==='key_missing'?'인증키 미등록':p?.http&&p.http!==200?'HTTP '+p.http:code(p)==='30'?'기관 응답: 등록되지 않은 서비스키':'실제 자료 수신 미확인';
 return {checkedAt:new Date(now).toISOString(),results:[
  {id:'roadWeather',status:road.status,count:road.items.length,detail:'30분 이내 도로날씨 분류 '+road.items.length+'개 지점 · 도로·차로 일치 미확인'},
  {id:'awsLocal',status:aws?.count>0?'partial':'failed',count:aws?.count||0,detail:aws?.count>0?'AWS 관측 수신 · 관측소 좌표 '+(station?.http===403?'API HTTP 403':'미검증')+' · 지도·엔진 제외':error(aws)},
  {id:'snowfall',status:snow?.code==='00'&&snow.categories?.includes('SNO')?'received':'failed',count:snow?.count||0,detail:snow?.categories?.includes('SNO')?'단기예보 신적설 SNO 수신 · 지면 총적설 아님':error(snow)},
  {id:'taasAdditional',status:'unverified',detail:'법규위반 사고다발지역: '+error(byMode.taas)+' · 기존 보행자·어린이·노인 자료와 별도'},
  {id:'heatShelter',status:'unverified',detail:'무더위쉼터: 재난안전 '+error(byMode.shelterSafety)+' / 생활안전지도 '+error(byMode.shelterMap)+' · 실제 대피 목적지 제외'}
 ]};
}
