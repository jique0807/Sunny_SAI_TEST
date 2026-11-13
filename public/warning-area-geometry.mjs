// CRS84 official warning polygons. Preserve holes and multipolygon islands.
const valid=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
const polygons=g=>g?.type==='Polygon'?[g.coordinates]:g?.type==='MultiPolygon'?g.coordinates:[];
function inRing(p,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
export function pointInWarningArea(point,geometry){
 return valid(point)&&polygons(geometry).some(rings=>rings.length&&inRing(point,rings[0])&&!rings.slice(1).some(r=>inRing(point,r)));
}
export function firstWarningAreaCrossing(path,geometry){
 if(!Array.isArray(path)||!polygons(geometry).length)return null;
 for(let i=0;i<path.length;i++){
  const a=path[i];if(!Number.isFinite(a?.lat)||!Number.isFinite(a?.lng)||!Number.isFinite(a?.seconds))continue;
  const p=[a.lng,a.lat];if(pointInWarningArea(p,geometry))return a;
  const b=path[i+1];if(!b||!Number.isFinite(b.seconds)||b.seconds<a.seconds)continue;
  const dx=b.lng-a.lng,dy=b.lat-a.lat,cuts=[0,1];
  for(const rings of polygons(geometry))for(const ring of rings)for(let j=1;j<ring.length;j++){
   const c=ring[j-1],d=ring[j],ex=d[0]-c[0],ey=d[1]-c[1],den=dx*ey-dy*ex;
   if(Math.abs(den)<1e-15)continue;
   const qx=c[0]-p[0],qy=c[1]-p[1],t=(qx*ey-qy*ex)/den,u=(qx*dy-qy*dx)/den;
   if(t>=0&&t<=1&&u>=0&&u<=1)cuts.push(t);
  }
  cuts.sort((x,y)=>x-y);
  for(let k=1;k<cuts.length;k++){
   const mid=(cuts[k-1]+cuts[k])/2;
   if(pointInWarningArea([p[0]+dx*mid,p[1]+dy*mid],geometry)){
    const t=cuts[k-1];return {lat:a.lat+dy*t,lng:a.lng+dx*t,seconds:a.seconds+(b.seconds-a.seconds)*t};
   }
  }
 }
 return null;
}
export function warningAreaPolygons(geometry){return polygons(geometry);}
