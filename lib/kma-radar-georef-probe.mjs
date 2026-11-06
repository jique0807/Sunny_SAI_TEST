// Official KMA 500m HSR static geolocation sample for independent LCC validation.
const API='https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-rdr_latlon_api';
export function radarLatLonUrl(key,axis){
 if(!key||!['lat','lon'].includes(axis))throw Error('invalid geolocation request');
 const url=new URL(API);
 for(const [k,v]of Object.entries({cmp:'HSR',latlon:axis,disp:'B',authKey:key}))
  url.searchParams.set(k,v);
 return url;
}
export async function probeRadarGeolocation(key,axis,fetcher=fetch){
 try{
  const r=await fetcher(radarLatLonUrl(key,axis).toString(),{
   signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!r.ok||!r.body)return{axis,state:'provider_error'};
  const reader=r.body.getReader();let total=0,parts=[];
  try{
   while(total<640){
    const {done,value}=await reader.read();if(done)break;
    if(!value)continue;const b=value.subarray(0,Math.min(640-total,value.byteLength));
    parts.push(b);total+=b.byteLength;
   }
  }finally{try{await reader.cancel();}catch{}}
  const bytes=new Uint8Array(total);let j=0;for(const p of parts){bytes.set(p,j);j+=p.length;}
  if(bytes.length<20)return{axis,state:'incomplete',bytes:bytes.length};
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const nx=v.getUint16(0,true),ny=v.getUint16(2,true);
  if(nx!==2305||ny!==2881)return{axis,state:'unverified_header',
   bytes:bytes.length,nx,ny};
  const values=Array.from({length:Math.min(25,Math.floor((bytes.length-4)/4))},
   (_,i)=>v.getFloat32(4+4*i,true));
  const okay=values.every(n=>Number.isFinite(n)&&
   (axis==='lon'?n>=110&&n<=150:n>=20&&n<=50));
  return{axis,state:okay?'verified_prefix':'unverified_values',nx,ny,
   first25:values.map(x=>Math.round(x*1e6)/1e6)};
 }catch{return{axis,state:'request_failure'};}
}
