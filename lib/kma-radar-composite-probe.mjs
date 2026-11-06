// Preview-only, credential-safe KMA HSR/PCPH composite endpoint probe.
// Test real KMA responses before attempting a geo-referenced radar map layer.
// Official docs: https://apihub.kma.go.kr/apiList.do?seqApi=5
const BASE='https://apihub.kma.go.kr/api/typ01/cgi-bin/url/';
const SERVICE=Object.freeze({info:'nph-rdr_cmp_inf',grid:'nph-rdr_cmp1_api'});
const COMPOSITES=Object.freeze(['HSR','PCPH']);
const MAX_PEEK=48*1024;
export function compositeRequest(kind,cmp,key,tm=''){
 if(!Object.hasOwn(SERVICE,kind)||!COMPOSITES.includes(cmp)||!key)
  throw Error('Invalid KMA radar request');
 if(tm&&!/^\d{12}$/.test(tm))throw Error('Invalid radar observation time');
 const url=new URL(BASE+SERVICE[kind]);
 for(const [k,v] of Object.entries({
  cmp,qcd:'MSK',map:'HB',disp:kind==='grid'?'B':'A',...(kind==='grid'?{obs:'ECHO',...(cmp==='PCPH'?{acc:'60'}:{})}:{})
 }))url.searchParams.set(k,v);
 if(tm)url.searchParams.set('tm',tm);
 url.searchParams.set('authKey',key);
 return url;
}
const short = vals=>vals.slice(0,24);
function sniffRadar(bytes,status,type){
 if(!status)return {state:'network_failure'};
 if(status<200||status>=300)return {state:'http_error',http:status};
 const first=new TextDecoder().decode(bytes.slice(0,Math.min(bytes.length,3500)));
 if(/not.found|no.data|file.not|자료.?없|존재하지|생성.?전/i.test(first))
  return {state:'no_data'};
 if(/permission|not.authorized|invalid.?key|access.denied|인증키|미승인|활용신청|등록되지/i.test(first))
  return {state:'authorization_uncertain'};
 if(/<!DOCTYPE|<html|<\?xml|<error|^\s*\{/i.test(first))
  return {state:'non_grid_response',type:type.slice(0,60)};
 if(bytes.length>=8){
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(const endian of [true,false]){
   const nx=v.getUint16(0,endian),ny=v.getUint16(2,endian);
   if(nx>=100&&nx<=5000&&ny>=100&&ny<=5000){
    const valid=short(Array.from({length:Math.min((bytes.length-4)/2,28)},(_,i)=>v.getInt16(4+i*2,endian)));
    return {state:'binary_grid_header',nx,ny,endian:endian?'little':'big',firstValues:valid};
   }
  }
 }
 const numeric=first.match(/^\s*(\d{2,5})[\s,=]+(\d{2,5})[\s,=]+/m);
 if(numeric)return {state:'ascii_grid_header',nx:Number(numeric[1]),ny:Number(numeric[2]),type:type.slice(0,40)};
 // Info endpoint is plain ASCII metadata; scrub anything that may contain credentials or URLs.
 const lines=first.split(/\r?\n/).map(x=>x.trim()).filter(x=>
  /^(?:#\s*)?(?:[A-Z_]{2,16}\s*[=:]|\d{2,5}[,\s=]+\d{2,5}|[A-Z_]+\s+\d+)/.test(x));
 return {state:'unverified_format',http:status,type:type.slice(0,50),
  metadata:short(lines.filter(x=>!/(auth|key|https?:)/i.test(x)).map(x=>x.slice(0,95)))};
}
async function peek(response){
 if(!response.body)return new Uint8Array(0);
 const reader=response.body.getReader(),parts=[];let total=0;
 try{
  while(total<MAX_PEEK){
   const {done,value}=await reader.read();if(done)break;if(!value?.byteLength)continue;
   const take=value.subarray(0,Math.min(value.byteLength,MAX_PEEK-total));
   parts.push(take);total+=take.byteLength;
  }
 }finally{try{await reader.cancel();}catch{}}
 const bytes=new Uint8Array(total);let p=0;
 for(const value of parts){bytes.set(value,p);p+=value.byteLength;}
 return bytes;
}
export async function probeComposite(kind,cmp,key,fetcher=fetch,tm=''){
 const u=compositeRequest(kind,cmp,key,tm);
 try{
  const response=await fetcher(u.toString(),{redirect:'error',
   signal:AbortSignal.timeout(12000),headers:{Accept:'application/octet-stream,text/plain,*/*'}});
  const bytes=await peek(response);
  return {kind,cmp,requestedTime:tm||'latest',bytesInspected:bytes.byteLength,
   ...sniffRadar(bytes,response.status,response.headers.get('content-type')||'')};
 }catch{return{kind,cmp,state:'request_failed',requestedTime:tm||'latest'};}
}
export async function radarCompositeDiagnostic(key,fetcher=fetch,tm=''){
 if(!key)return {configured:false,status:'key_missing',results:[]};
 const results=await Promise.all([
  probeComposite('info','HSR',key,fetcher,tm),
  probeComposite('info','PCPH',key,fetcher,tm),
  probeComposite('grid','HSR',key,fetcher,tm),
  probeComposite('grid','PCPH',key,fetcher,tm)
 ]);
 return {configured:true,checkedAt:new Date().toISOString(),results};
}
