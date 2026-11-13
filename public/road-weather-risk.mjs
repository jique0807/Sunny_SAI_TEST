import {closestWalkingRoutePoint} from './pedestrian-history-risk.mjs';
export const ROAD_WEATHER_KINDS=['observed-road-fog','observed-road-rain','observed-road-snow'];
export function buildRoadWeatherHazards(route,report,{now=Date.now()}={}){
 if(route?.demo||!['driving','walking'].includes(route?.travelMode)||!['received','partial'].includes(report?.status))return[];
 const hazards=[];
 for(const p of report.items||[]){
  if(p.provider!=='기상청 CCTV 도로날씨')continue;
  const near=closestWalkingRoutePoint(route.rainPath,p),age=now-Date.parse(p.observedAt);
  if(!near||near.distance>250||!Number.isFinite(age)||age<0||age>30*60000||!Number.isFinite(near.seconds))continue;
  const eta=Date.parse(route.departure)+near.seconds*1000;
  if(!Number.isFinite(eta)||eta<now-120000||eta>now+10*60000)continue;
  for(const [field,base,title]of [['fog',10,'인근 도로 안개'],['rain',20,'인근 도로 비'],['snow',30,'인근 도로 눈']]){
   const grade=p[field]-base;if(![1,2,3].includes(grade))continue;
   hazards.push({id:'road-weather:'+p.id+':'+field,kind:'observed-road-'+field,icon:{fog:'🌫️',rain:'🌧️',snow:'❄️'}[field],title,label:title,
    lat:p.lat,lng:p.lng,seconds:near.seconds,eta:new Date(eta).toISOString(),validTime:p.observedAt,
    provider:p.provider,grade,distanceToPath:Math.round(near.distance),stationId:p.id,
    measure:['','약','중','강'][grade]+' · 영상 기반 분류',description:'관측지점 인근 참고 · 실제 주행 도로·차로 일치 미확인'});
  }
 }
 return hazards;
}
