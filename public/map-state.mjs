// Accept explicit WGS84 coordinates without depending on the place-search API.
export function coordinatePlace(value) {
 const match=String(value).trim().match(/^(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)$/);
 if(!match)return null;
 const lat=Number(match[1]),lng=Number(match[2]);
 if(lat<32||lat>40||lng<123||lng>133)return null;
 return {lat,lng,name:`${lat.toFixed(5)}, ${lng.toFixed(5)}`};
}
export function nearestSample(samples,point){
 if(!samples.length)return null;
 const distance=p=>(p.lat-point.lat)**2+((p.lng-point.lng)*Math.cos(point.lat*Math.PI/180))**2;
 return samples.reduce((best,p,i)=>distance(p)<distance(samples[best])?i:best,0);
}
export function tileHealth(loaded,failed){return loaded>0?'ready':failed>0?'failed':'loading';}
