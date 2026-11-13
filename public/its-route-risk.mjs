// Route-local advisories from REAL ITS event points. Never infer confirmed closure/segment safety.
import {closestWalkingRoutePoint} from './pedestrian-history-risk.mjs';
const kinds={accident:['🚧','전방 사고정보'],construction:['🚧','전방 도로공사'],restriction:['⛔','전방 통제정보'],
 weather:['⚠️','도로 관련 기상·재난정보'],incident:['⚠️','도로 돌발상황']};
export function buildItsRouteHazards(route,data,{max=15,proximityMeters=120}={}){
 if(!route||route.demo||route.travelMode!=='driving'||!Array.isArray(route.rainPath)||route.rainPath.length<2||
  data?.status!=='received'||!Array.isArray(data.items))return [];
 const hazards=[];
 for(const p of data.items){
  if(p.provider!=='국가교통정보센터 ITS'||p.live!==true||p.reportedFresh!==true||
   !Number.isFinite(p.lat)||!Number.isFinite(p.lng)||!p.occurredAt||!Number.isFinite(Date.parse(p.occurredAt)))continue;
  const nearest=closestWalkingRoutePoint(route.rainPath,p);
  if(!nearest||nearest.distance>proximityMeters||!Number.isFinite(nearest.seconds))continue;
  if(nearest.seconds<0||nearest.seconds>route.duration)continue;
  const seconds=Math.round(nearest.seconds);
  const [icon,title]=kinds[p.type]||kinds.incident;
  hazards.push({id:'its:'+p.lat.toFixed(5)+':'+p.lng.toFixed(5)+':'+p.type,kind:'its-incident',icon,title,
   label:p.roadName||p.kind||'도로 인접',lat:p.lat,lng:p.lng,seconds,
   eta:new Date(Date.parse(route.departure)+seconds*1000).toISOString(),
   provider:'국가교통정보센터 ITS',validTime:p.occurredAt,expiresAt:p.expiresAt||null,
   reportedFresh:true,segmentVerified:false,distanceToPath:Math.round(nearest.distance),
   measure:p.message||p.detail||p.kind||'ITS 돌발상황',
   description:'경로 인접 ITS 신고 위치입니다. 같은 도로·진행 방향·실제 차단 구간 일치는 확인되지 않았습니다. 자동 우회하지 않습니다.'});
 }
 hazards.sort((a,b)=>a.seconds-b.seconds||a.distanceToPath-b.distanceToPath);
 return hazards.filter((h,i,a)=>!a.slice(0,i).some(p=>p.id===h.id&&Math.abs(p.seconds-h.seconds)<300)).slice(0,max);
}
