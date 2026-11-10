// Historical pedestrian crashes along an *actual* provider-backed walking route.
// Never re-label this as a current collision, official live warning or safe detour.
const safe=p=>Number.isFinite(p?.lat)&&p.lat>=32&&p.lat<=40&&Number.isFinite(p?.lng)&&p.lng>=123&&p.lng<=133;
const clamp=t=>Math.max(0,Math.min(1,t));
export function closestWalkingRoutePoint(path,point){
 if(!Array.isArray(path)||path.length<2||!safe(point))return null;
 const scaleX=111195*Math.cos(point.lat*Math.PI/180),scaleY=111195;
 let best=null;
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i];if(!safe(a)||!safe(b))continue;
  const ax=(a.lng-point.lng)*scaleX,ay=(a.lat-point.lat)*scaleY;
  const dx=(b.lng-a.lng)*scaleX,dy=(b.lat-a.lat)*scaleY;
  const t=clamp((-(ax*dx+ay*dy))/(dx*dx+dy*dy||1));
  const distance=Math.hypot(ax+t*dx,ay+t*dy);
  if(best===null||distance<best.distance)best={distance,seconds:a.seconds+(b.seconds-a.seconds)*t};
 }
 return best;
}
export function buildPedestrianHistoryHazards(route,result,{limit=12,proximityMeters=120}={}){
 if(route?.demo||route?.travelMode!=='walking'||!Array.isArray(route.rainPath)||
    !['received','partial'].includes(result?.status)||!Array.isArray(result.items))return [];
 const hazards=[];
 for(const p of result.items){
  if(!safe(p)||p.historic!==true||p.live!==false||p.year!=='2024'||
     p.source!=='한국도로교통공단 TAAS'||!Number.isInteger(p.accidentCount))continue;
  const nearest=closestWalkingRoutePoint(route.rainPath,p);
  if(!nearest||nearest.distance>proximityMeters||!Number.isFinite(nearest.seconds))continue;
  const seconds=Math.max(0,Math.round(nearest.seconds));
  if(seconds>route.duration)continue;
  hazards.push({id:'history:'+p.lat.toFixed(5)+':'+p.lng.toFixed(5),
   kind:'pedestrian-hotspot',icon:'🚸',title:'과거 보행자 사고다발지역',
   label:String(p.name||'보행자 사고 집중구역').slice(0,80),
   lat:p.lat,lng:p.lng,seconds,eta:new Date(Date.parse(route.departure)+seconds*1000).toISOString(),
   distanceToPath:Math.round(nearest.distance),accidentCount:p.accidentCount,
   year:'2024',historic:true,live:false,provider:'한국도로교통공단 TAAS',
   measure:'과거 사고 '+p.accidentCount+'건 · 2024년 자료',
   description:'과거 사고 집중지역이며 현재 사고 발생이나 보행로 통제를 의미하지 않습니다.'});
 }
 hazards.sort((a,b)=>a.seconds-b.seconds||a.distanceToPath-b.distanceToPath);
 const chosen=[];
 for(const h of hazards){
  if(chosen.some(x=>Math.abs(x.seconds-h.seconds)<30&&Math.abs(x.lat-h.lat)<.0003&&Math.abs(x.lng-h.lng)<.0003))continue;
  chosen.push(h);if(chosen.length>=limit)break;
 }
 return chosen;
}
export function routeHistoryQueryPoints(route,max=5){
 if(!Array.isArray(route?.samples)||route.samples.length<2)return [];
 const samples=route.samples.filter(s=>safe(s)&&Number.isFinite(s.seconds));
 if(samples.length<2)return [];
 const chosen=[];
 for(let i=0;i<Math.min(max,samples.length);i++){
  const p=samples[Math.round((samples.length-1)*i/(Math.min(max,samples.length)-1))];
  if(p&&!chosen.some(x=>x.lat===p.lat&&x.lng===p.lng))chosen.push({lat:p.lat,lng:p.lng});
 }
 return chosen;
}
