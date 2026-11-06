// Safe, preview-only KMA radar authorization probe. No raw provider content,
// authenticated URLs or credentials ever enter a response or log.
const ROOT='https://apihub.kma.go.kr/api/typ03/cgi/rdr/';
const paramsDistribution=Object.freeze({
 qpf:'M',eva:'1',option:'1',ef:'60',map:'HR',grid:'2',legend:'0',
 size:'600',itv:'5',zoom_level:'0',zoom_x:'0000000',zoom_y:'0000000',gov:''
});
const paramsNoMap=Object.freeze({
 PROJ:'LCC',cmp:'HSR',obs:'qpf',qcd:'EXT',grid:'2',itv:'10',tm_mode:'m10',
 data0:'RCM',level:'C',map:'R',dtm:'m0',zoom_level:'0',zoom_rate:'2',
 zoom_x:'0000000',zoom_y:'0000000',auto_man:'1',mode:'H',
 umove:'10',fmove:'2',dmove:'180',bmove:'10',winnum:'0',rand:'10',
 size:'320',an_frn:'1',an_itv:'1',river:'off',road:'off',city:'off',gis_auto:'on',
 stnname:'off',ctrl:'0',dataDtlCd:'rdr_rdr_qpf_ana1_0',data1:'r01',
 data2:'rdr_qpf_ana1',data3:'0',overlay:'spr',color:'C4',effect:'N',
 height:'320',qpf:'M',ef:'60',eva:'1',option:'1',
 STARTX:'-384032.28285233676',STARTY:'4878817.500765007',
 ENDX:'758967.7171476632',ENDY:'3778150.834098339',ZOOMLVL:'11',selWs:'kh'
});
export function latestKoreanRadarTime(now=Date.now()){
 // Allow radar production lag. KMA example tm uses KST, not UTC.
 const formatter=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
 const value=Object.fromEntries(formatter.formatToParts(new Date(now-40*60000))
  .filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 const minute=String(Math.floor(Number(value.minute)/10)*10).padStart(2,'0');
 return [value.year,value.month,value.day,value.hour,minute].join('');
}
export function probeUrl(kind,key,now=Date.now()){
 if(!key||!['distribution','nomap'].includes(kind))throw Error('Radar test credentials or product missing');
 const stamp=latestKoreanRadarTime(now);
 const url=new URL(ROOT+(kind==='distribution'?'nph-qpf_ana_img':'nph-qpf_ana_imgp'));
 const params=kind==='distribution'?paramsDistribution:paramsNoMap;
 for(const [name,value]of Object.entries(params))url.searchParams.set(name,value);
 for(const name of kind==='distribution'?['tm']:['tm','tm_st','tm_ed','tm2'])url.searchParams.set(name,stamp);
 url.searchParams.set('authKey',key);
 return url;
}
const readLimited=async(response)=>{
 if(!response.body)return new Uint8Array();
 const reader=response.body.getReader();let bytes=[],total=0;
 try{
  while(total<16384){
   const {done,value}=await reader.read();if(done)break;
   if(value?.length){const available=Math.min(16384-total,value.length);bytes.push(value.subarray(0,available));total+=available;}
  }
 }finally{try{await reader.cancel();}catch{}}
 const joined=new Uint8Array(total);let at=0;
 for(const b of bytes){joined.set(b,at);at+=b.length;}
 return joined;
};
function sniff(bytes,contentType){
 const imageSignature=bytes.length>12&&(
  (bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)||
  (bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||
  (bytes[0]===71&&bytes[1]===73&&bytes[2]===70)||
  (bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80)
 );
 if(imageSignature)return{state:'image_received',message:'이미지 응답 형식 확인'};
 const text=new TextDecoder().decode(bytes).slice(0,15000);
 if(/(인증키|API.?KEY|apikey|auth.?key|access.?denied|permission|not.?authorized|미승인|활용신청|서비스.?신청|승인되지|invalid.?key|등록되지.?않)/i.test(text))
  return{state:'access_unverified',message:'API 사용 승인 또는 인증 확인 필요'};
 if(/(자료.?없|not.?found|no.?data|file.?not|생성.?전|존재하지)/i.test(text))
  return{state:'data_unavailable',message:'해당 예측시각의 영상자료를 찾지 못함'};
 if(contentType.includes('json')){
  try{const object=JSON.parse(text);
   if(object&&typeof object==='object'&&
     JSON.stringify(object).match(/(img|png|jpg|image|filePath|file_path)/i))
    return{state:'metadata_received',message:'영상 메타데이터 응답 확인 · 실제 이미지 수신은 추가 검증 필요'};
  }catch{}
 }
 return{state:'unconfirmed',message:'예상 영상 포맷과 다른 응답 · 원본 형식 분석 필요'};
}
export async function runRadarProbe(kind,key,fetcher=fetch,now=Date.now()){
 const url=probeUrl(kind,key,now);
 try{
  const r=await fetcher(url.toString(),{signal:AbortSignal.timeout(8500),
   headers:{Accept:'image/png,image/jpeg,image/webp,application/json,*/*'}});
  const contentType=(r.headers.get('content-type')||'').toLowerCase();
  const bytes=await readLimited(r);
  const result=sniff(bytes,contentType);
  return{product:kind,providerStatus:r.status,...result,
   // Network HTTP success alone is not proof of the API being authorized.
   receivedImage:r.ok&&result.state==='image_received',
   timeKst:latestKoreanRadarTime(now)};
 }catch{
  return{product:kind,state:'network_unavailable',receivedImage:false,
   message:'기상청 레이더 API 연결 또는 응답 시간 초과',timeKst:latestKoreanRadarTime(now)};
 }
}
export async function checkRadarAccess(key,fetcher=fetch,now=Date.now()){
 if(!key)return{configured:false,checkedAt:new Date(now).toISOString(),
  results:[],message:'KMA_API_KEY 환경변수가 없음'};
 const results=await Promise.all(['distribution','nomap'].map(kind=>runRadarProbe(kind,key,fetcher,now)));
 return{configured:true,checkedAt:new Date(now).toISOString(),results,
  message:'이미지 원본 또는 예상 메타데이터 확인은 API 응답 검사이며, 회원 활용신청의 승인상태를 직접 조회한 것은 아님'};
}
