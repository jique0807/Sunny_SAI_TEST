// Heading-up support for Sunny SAI foreground mobile web navigation.
// GPS heading is preferred only while moving. If unavailable, estimate from
// sufficiently accurate, separated fixes. Never invent a course while stopped.
const RAD=Math.PI/180;
export function compassBearing(a,b){
 if(!a||!b||![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite))return null;
 const lat1=a.lat*RAD,lat2=b.lat*RAD,delta=(b.lng-a.lng)*RAD;
 const y=Math.sin(delta)*Math.cos(lat2);
 const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(delta);
 if(Math.abs(x)+Math.abs(y)<1e-12)return null;
 return (Math.atan2(y,x)/RAD+360)%360;
}
export function headingDistanceMeters(a,b){
 if(!a||!b)return 0;
 return Math.hypot((b.lat-a.lat)*111320,(b.lng-a.lng)*111320*Math.cos((a.lat+b.lat)*RAD/2));
}
export function resolveDrivingHeading(previous,current,lastBearing=null,lastFixTime=0){
 const valid=c=>c&&Number.isFinite(c.lat)&&Number.isFinite(c.lng)&&
  Number.isFinite(c.timestamp)&&Number.isFinite(c.accuracy)&&c.accuracy<=60;
 if(!valid(current))return {bearing:null,source:'unreliable'};
 const moving=Number.isFinite(current.speed)&&current.speed>=1.5;
 if(moving&&Number.isFinite(current.heading)&&current.heading>=0&&current.heading<360)
  return {bearing:current.heading,source:'gps'};
 if(valid(previous)&&current.timestamp>previous.timestamp){
  const dt=(current.timestamp-previous.timestamp)/1000,meters=headingDistanceMeters(previous,current);
  if(dt>=1&&dt<=40&&meters>=12&&current.accuracy<=35&&previous.accuracy<=35&&
    meters/dt>=1.5)
   return {bearing:compassBearing(previous,current),source:'motion'};
 }
 // Retain a recent course briefly, including a short stop at traffic lights.
 if(Number.isFinite(lastBearing)&&current.timestamp-lastFixTime<=20000&&current.timestamp>=lastFixTime)
  return {bearing:lastBearing,source:'held'};
 return {bearing:null,source:'awaiting-motion'};
}
export function angleStep(oldValue,newValue,alpha=.55){
 if(!Number.isFinite(newValue))return oldValue;
 if(!Number.isFinite(oldValue))return newValue;
 const shortest=((newValue-oldValue+540)%360)-180;
 return (oldValue+shortest*alpha+360)%360;
}
