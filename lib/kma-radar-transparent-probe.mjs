// Explore the official KMA image-without-background composite API.
// This is a diagnostic only; metadata is not yet accepted as georegistered.
const BASE='https://apihub.kma.go.kr/api/typ03/cgi/rdr/nph-rdr_cmp1_imgp';
const SAMPLE=Object.freeze({
 PROJ:'LCC',cmp:'HSP',obs:'ECHD',qcd:'HSLP',grid:'2',itv:'10',
 tm_mode:'m10',data0:'RCM',level:'C',map:'R',dtm:'m0',zoom_level:'0',
 zoom_rate:'2',zoom_x:'0000000',zoom_y:'0000000',auto_man:'a',
 mode:'H',umove:'10',fmove:'2',dmove:'180',bmove:'10',winnum:'0',rand:'10',
 size:'320',an_frn:'1',an_itv:'1',
 river:'off',road:'off',city:'off',gis_auto:'on',stnname:'off',ctrl:'0',
 dataDtlCd:'rdr_hsr_0',data1:'h01',data2:'hsr',data3:'0',
 overlay:'spr',color:'C4',effect:'N',height:'320',qpf:'M',ef:'',
 legend:'0',STARTX:'-384032.28285233676',STARTY:'4878817.500765007',
 ENDX:'758967.7171476632',ENDY:'3778150.834098339',ZOOMLVL:'11',selWs:'kh'
});
export function transparentRadarRequest(key,tm){
 if(!key||!/^\d{12}$/.test(tm))throw Error('Invalid radar image request');
 const url=new URL(BASE);
 for(const [k,v]of Object.entries(SAMPLE))url.searchParams.set(k,v);
 for(const k of ['tm','tm_st','tm_ed','tm2'])url.searchParams.set(k,tm);
 url.searchParams.set('authKey',key);
 return url;
}
export async function inspectTransparentRadar(key,tm,fetcher=fetch){
 if(!key)return{status:'no_key'};
 const url=transparentRadarRequest(key,tm);
 try{
  const response=await fetcher(url.toString(),{signal:AbortSignal.timeout(14000),redirect:'error'});
  if(!response.body)return{status:'empty_response',http:response.status};
  const reader=response.body.getReader();let total=0;const parts=[];
  try{
   while(total<110000){
    const {done,value}=await reader.read();if(done)break;if(!value)continue;
    const b=value.subarray(0,Math.min(value.length,110000-total));parts.push(b);total+=b.length;
   }
  }finally{try{await reader.cancel();}catch{}}
  const bytes=new Uint8Array(total);let off=0;for(const p of parts){bytes.set(p,off);off+=p.length;}
  const str=new TextDecoder().decode(bytes),type=response.headers.get('content-type')||'';
  let state='unverified';
  if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)state='image_png';
  else if(bytes[0]===255&&bytes[1]===216)state='image_jpeg';
  else if(/permission|authkey|not authorized|인증키|미승인/i.test(str))state='authorization_uncertain';
  else if(/not.found|no.data|file.not|자료.?없|존재하지|생성.?전/i.test(str))state='no_data';
  const parsed=(()=>{try{return JSON.parse(str)}catch{return null}})();
  const list=[];
  if(parsed&&typeof parsed==='object'){
   const queue=[parsed];let seen=0;
   while(queue.length&&seen++<80){
    const value=queue.shift();if(!value||typeof value!=='object')continue;
    for(const [k,v]of Object.entries(value)){
     if(typeof v==='string'&&/(?:url|image|img|path|png|file|pro[j]|start|end|bounds)/i.test(k)){
      if(/auth|key|token/i.test(k)||/authKey|token=/i.test(v))continue;
      list.push({key:k,value:v.slice(0,180)});
     }else if(v&&typeof v==='object')queue.push(v);
    }
   }
   if(state==='unverified')state='json_metadata';
  }
  return {http:response.status,kind:state,contentType:type.slice(0,80),bytesInspected:total,
   fields:list.slice(0,18),jsonKeys:parsed?Object.keys(parsed).slice(0,30):[]};
 }catch{return{status:'network_timeout_or_failure'};}
}
