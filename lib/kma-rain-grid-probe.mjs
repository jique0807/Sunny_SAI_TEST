// Probe the official nationwide 5-km KMA RN1 grid (not the composite radar image).
// Preview-only diagnostic response never reveals raw credentials or upstream URL.
const BASE='https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-dfs_vsrt_grd';
function stampKst(now){return new Date(now+9*3600000).toISOString().slice(0,16).replace(/[-:T]/g,'');}
export function gridRequest(key,now=Date.now()){
 if(!key)throw Error('기상청 키 미설정');
 const start=new Date(Math.floor((now-45*60000)/600000)*600000);
 const effective=new Date(Math.ceil((start.getTime()+30*60000)/3600000)*3600000);
 const url=new URL(BASE);
 url.searchParams.set('tmfc',stampKst(start));
 url.searchParams.set('tmef',stampKst(effective).slice(0,10));
 url.searchParams.set('vars','RN1');
 url.searchParams.set('authKey',key);
 return {url,baseTime:stampKst(start),validTime:stampKst(effective).slice(0,10)};
}
export async function probeRainGrid(key,fetcher=fetch,now=Date.now()){
 if(!key)return {configured:false,state:'not_configured'};
 const {url,baseTime,validTime}=gridRequest(key,now);
 try{
  const r=await fetcher(url.toString(),{signal:AbortSignal.timeout(12000)});
  const declared=Number(r.headers.get('content-length')||0);
  if(declared>2000000){await r.body?.cancel();return {configured:true,state:'too_large',http:r.status,baseTime,validTime};}
  const reader=r.body?.getReader();let size=0,parts=[];
  if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;if(!value)continue;size+=value.byteLength;
   if(size>1500000){await reader.cancel();return {configured:true,state:'too_large',http:r.status,baseTime,validTime};}parts.push(value);}}
   finally{try{reader.releaseLock();}catch{}}}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const txt=new TextDecoder().decode(bytes);
  const lines=txt.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const firstData=lines.find(x=>!x.startsWith('#'))||'';
  const onlyNumeric=firstData.replace(/[0-9\s,=.+\-eE]/g,'').length===0;
  const numericCount=(firstData.match(/-?\d+(?:\.\d+)?/g)||[]).length;
  const forbidden=/apikey|auth.?key|unauthorized|permission denied|미승인|인증키|활용신청|서비스.?신청|error|invalid key|access denied/i.test(txt.slice(0,1200));
  const state=forbidden?'unavailable':r.ok&&onlyNumeric&&numericCount>=2?'numeric_grid':'unverified';
  return {configured:true,state,http:r.status,baseTime,validTime,
   bytes:size,lines:lines.length,commentLines:lines.filter(x=>x.startsWith('#')).length,
   firstDataNumbers:state==='numeric_grid'?firstData.match(/-?\d+(?:\.\d+)?/g)?.slice(0,5).map(Number):[],
   dataLineNumbers:state==='numeric_grid'?(lines.find(x=>!x.startsWith('#')&&x!==firstData)||'').match(/-?\d+(?:\.\d+)?/g)?.slice(0,9).map(Number)||[]:[],
   dataStats:(()=>{
    if(state!=='numeric_grid')return null;
    const raw=txt.match(/-?\d+(?:\.\d+)?/g)||[];
    const values=raw.map(Number),positive=values.filter(v=>v>0&&v<5000);
    return {numberCount:values.length,line1Count:(firstData.match(/-?\d+(?:\.\d+)?/g)||[]).length,
      lastLineCount:(lines.at(-1).match(/-?\d+(?:\.\d+)?/g)||[]).length,
      missingMinus99:values.filter(v=>v===-99).length,zeros:values.filter(v=>v===0).length,
      positiveCount:positive.length,minPositive:positive.length?Math.min(...positive):null,
      maxPositive:positive.length?Math.max(...positive):null,
      firstPositiveIndex:values.findIndex(v=>v>0&&v<5000),
      lastPositiveIndex:values.findLastIndex(v=>v>0&&v<5000)};
   })()};
 }catch{return{configured:true,state:'network_unavailable',baseTime,validTime};}
}
