// Distance-weighted interpolation keeps the demo vehicle on the returned road geometry.
export function pointAlong(vertices, fraction) {
 if(!vertices?.length)return null;
 const distances=[0];let total=0;
 for(let i=1;i<vertices.length;i++){const a=vertices[i-1],b=vertices[i];total+=Math.hypot((b.lng-a.lng)*Math.cos((a.lat+b.lat)*Math.PI/360),b.lat-a.lat);distances.push(total);}
 const target=Math.max(0,Math.min(1,fraction))*total;
 for(let i=1;i<vertices.length;i++)if(distances[i]>=target){const a=vertices[i-1],b=vertices[i],t=(target-distances[i-1])/(distances[i]-distances[i-1]||1);return {lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t};}
 return vertices[vertices.length-1];
}
