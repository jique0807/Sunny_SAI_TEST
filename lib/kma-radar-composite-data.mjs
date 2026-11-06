// Safe whole-grid statistics of official HSR/PCPH 500 m composites.
// No synthetic values and no unauthorized provider URL in the response.
import {compositeRequest} from './kma-radar-composite-probe.mjs';
export const RADAR_NX=2305,RADAR_NY=2881,RADAR_TOTAL=RADAR_NX*RADAR_NY;
const MAX_BYTES=16*1024*1024;
const err=(status,message)=>Object.assign(Error(message),{status});
async function receiveBinary(response){
 if(!response.ok){await response.body?.cancel();throw err(502,'KMA radar request not accepted');}
 if(Number(response.headers.get('content-length')||0)>MAX_BYTES){
  await response.body?.cancel();throw err(502,'Radar response exceeds size limit');}
 if(!response.body)throw err(502,'Empty radar response');
 const reader=response.body.getReader();let size=0;const chunks=[];
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;if(!value)continue;
   size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw err(502,'Radar response exceeds size limit');}
   chunks.push(value);
  }
 }finally{try{reader.releaseLock();}catch{}}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 return bytes;
}
export function parseCompositeBinary(bytes,cmp='PCPH'){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<4)throw err(502,'Empty radar grid');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const nx=v.getUint16(0,true),ny=v.getUint16(2,true);
 if(nx!==RADAR_NX||ny!==RADAR_NY)throw err(502,'Radar grid dimensions are not verified');
 if(bytes.byteLength!==4+RADAR_TOTAL*2)throw err(502,'Radar pixel count does not match grid header');
 let outOfRange=0,noEcho=0,otherMissing=0,zero=0,positive=0,min=Infinity,max=-Infinity;
 let minX=nx,minY=ny,maxX=-1,maxY=-1;
 const sample=[];const stride=89;
 for(let i=0;i<RADAR_TOTAL;i++){
  const x=i%nx,y=Math.floor(i/nx),raw=v.getInt16(4+2*i,true);
  if(raw===-30000){outOfRange++;continue;}
  if(raw===-25000){noEcho++;continue;}
  if(raw<0){otherMissing++;continue;}
  if(raw===0){zero++;continue;}
  positive++;if(raw<min)min=raw;if(raw>max)max=raw;
  if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
  if(sample.length<24&&i%stride===0)sample.push({x,y,raw});
 }
 return {nx,ny,unit:cmp==='PCPH'?'mm/1h':'dBZ',scale:0.01,
  total:RADAR_TOTAL,outOfRange,noEcho,otherMissing,zero,positive,
  minPositive:positive?min/100:null,maxPositive:positive?max/100:null,
  wetGridBbox:positive?{minX,minY,maxX,maxY}:null,
  sample:sample.map(({x,y,raw})=>({x,y,value:raw/100}))};
}
export async function summarizeRealRadar(key,cmp='PCPH',fetcher=fetch,tm=''){
 if(!key)throw err(503,'KMA radar key not configured');
 if(!['HSR','PCPH'].includes(cmp))throw err(400,'Radar product not allowed');
 const url=compositeRequest('grid',cmp,key,tm);
 const response=await fetcher(url.toString(),{
  signal:AbortSignal.timeout(25000),redirect:'error',
  headers:{Accept:'application/octet-stream,*/*'}
 });
 const bytes=await receiveBinary(response);
 return {provider:'KMA',product:cmp,timeRequestedKst:tm||'latest',
  ...parseCompositeBinary(bytes,cmp)};
}
