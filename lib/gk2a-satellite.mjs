// KMA GK2A Level-2 observation preflight. Server-only auth, fixed provider host.
// The product images are NOT yet geo-registered to Kakao map pixels. Receipt
// never implies a verified weather hazard or safe/unsafe road condition.
export const GK2A_PRODUCTS=Object.freeze({
 RR:Object.freeze({name:'위성 강우강도',description:'GK2A L2 강우강도 · 관측 산출물'}),
 CI:Object.freeze({name:'위성 대류운 발생탐지',description:'GK2A L2 대류운 발생탐지'}),
 FOG:Object.freeze({name:'위성 안개',description:'GK2A L2 안개 산출물'})
});
const HOST='https://apihub.kma.go.kr';
const MAX_LIST_BYTES=1048576,MAX_IMAGE_BYTES=8*1024*1024;
const UTC_STAMP=d=>new Date(d).toISOString().replace(/[-:T]/g,'').slice(0,12);
const DATE_12=/^\d{12}$/;
export function observedAtUTC(t){
 if(typeof t!=='string'||!DATE_12.test(t))return null;
 const d=new Date(t.slice(0,4)+'-'+t.slice(4,6)+'-'+t.slice(6,8)+'T'+t.slice(8,10)+':'+t.slice(10,12)+':00Z');
 return Number.isFinite(d.getTime())&&UTC_STAMP(d)===t?d.getTime():null;
}
export function gk2aListUrl(kind,key,now=Date.now()){
 if(!Object.hasOwn(GK2A_PRODUCTS,kind)||typeof key!=='string'||!key)throw Error('지원하지 않는 GK2A 산출물 또는 키 없음');
 const until=Math.floor((now-20*60000)/(10*60000))*(10*60000);
 const since=until-150*60000;
 const url=new URL('/api/typ05/api/GK2A/LE2/'+kind+'/KO/imageList',HOST);
 url.searchParams.set('sDate',UTC_STAMP(since));
 url.searchParams.set('eDate',UTC_STAMP(until));
 url.searchParams.set('format','json');
 url.searchParams.set('authKey',key);
 return url;
}
export function gk2aImageUrl(kind,utc,key){
 if(!Object.hasOwn(GK2A_PRODUCTS,kind)||observedAtUTC(utc)===null||!key)throw Error('유효하지 않은 위성 관측상품·시각');
 const url=new URL('/api/typ05/api/GK2A/LE2/'+kind+'/KO/image',HOST);
 url.searchParams.set('date',utc);url.searchParams.set('authKey',key);
 return url;
}
const boundedRead=async(response,limit)=>{
 const len=Number(response.headers?.get('content-length'));
 if(Number.isFinite(len)&&len>limit)throw Error('기관 응답 크기 제한 초과');
 const body=await response.arrayBuffer();
 if(body.byteLength>limit)throw Error('기관 응답 크기 제한 초과');
 return new Uint8Array(body);
};
const error=(state,detail)=>({state,detail,observationTimes:[],georeferenced:false,overlayReady:false});
const timeToken=v=>{
 if(typeof v!=='string'&&typeof v!=='number')return null;
 const text=String(v);
 const hit=text.match(/(?:^|[^\d])((?:20\d{2})(?:0[1-9]|1[0-2])(?:[0-2]\d|3[01])(?:[01]\d|2[0-3])[0-5]\d)(?:[^\d]|$)/);
 return hit&&observedAtUTC(hit[1])!==null?hit[1]:null;
};
// Accept only explicitly dated records; never infer image time from a filename
// unless the filename itself unambiguously embeds a valid UTC YYYYMMDDHHmm.
export function parseGk2aImageList(data,{now=Date.now()}={}){
 const arrays=[data,data?.data,data?.items,data?.images,data?.files,data?.list,
  data?.response?.body?.items?.item,data?.response?.body?.items,data?.result?.items,
  data?.result?.data,data?.result?.list];
 const rows=arrays.find(Array.isArray);
 if(!rows)return error('format_unverified','기관 파일목록 JSON 구조 미확인 · 관측자료 사용 보류');
 const out=new Set();
 for(const row of rows.slice(0,500)){
  const values=typeof row==='string'?[row]:
   row&&typeof row==='object'?
   ['date','dateTime','datetime','obsTime','observationTime','tm','time','fileName','filename'].map(k=>row[k]).filter(v=>v!==undefined):[];
  for(const value of values){
   const utc=timeToken(value);
   const ms=utc&&observedAtUTC(utc);
   if(ms!==null&&ms<=now+60000&&now-ms<=6*3600000)out.add(utc);
  }
 }
 const observationTimes=[...out].sort().reverse().slice(0,20);
 return {state:observationTimes.length?'received':rows.length?'format_unverified':'empty',
  detail:observationTimes.length?'공식 관측시간 목록 확인 · 원본 이미지·좌표정합 별도 검증':
   rows.length?'명시적으로 검증 가능한 최신 UTC 관측시각 없음':'선택 기간에 공개된 영상 없음',
  observationTimes,georeferenced:false,overlayReady:false};
}
export async function fetchGk2aCatalog(kind,key,fetcher=fetch,now=Date.now()){
 if(!Object.hasOwn(GK2A_PRODUCTS,kind))return error('unsupported','허용되지 않은 위성 산출물');
 if(!key)return error('missing','KMA_API_KEY 미등록');
 try{
  const url=gk2aListUrl(kind,key,now);
  const res=await fetcher(url.toString(),{redirect:'error',headers:{Accept:'application/json'},
   signal:AbortSignal.timeout(12000)});
  if(!res.ok){await res.body?.cancel?.();return error(res.status===401||res.status===403?'approval_pending':'failed',
    '기상청 위성 파일목록 HTTP '+res.status+' · 상품별 이용승인 확인 필요');}
  const bytes=await boundedRead(res,MAX_LIST_BYTES);
  let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}
  catch{return error('format_unverified','기상청 파일목록 JSON 미확인 · 자료 형식 검증 필요');}
  return {...parseGk2aImageList(data,{now}),kind,product:GK2A_PRODUCTS[kind].name,
   region:'KO',timeZone:'UTC',source:'기상청 API허브 GK2A LE2',checkedAt:new Date(now).toISOString()};
 }catch{return error('failed','기상청 위성 API 연결 또는 응답 제한 · 검사 실패');}
}
export async function fetchGk2aVerifiedImage(kind,utc,key,fetcher=fetch,now=Date.now()){
 if(!Object.hasOwn(GK2A_PRODUCTS,kind)||observedAtUTC(utc)===null||
   observedAtUTC(utc)>now+60000||now-observedAtUTC(utc)>6*3600000)
  return {status:400,error:'최근 6시간 이내의 실제 GK2A UTC 관측시각만 요청할 수 있습니다.'};
 if(!key)return {status:503,error:'기상청 API 키 미설정'};
 // Re-check the provider's actual list; callers cannot fabricate a time slot.
 const catalog=await fetchGk2aCatalog(kind,key,fetcher,now);
 if(!catalog.observationTimes?.includes(utc))
  return {status:422,error:'기상청 파일목록에서 확인되지 않은 관측시각입니다.'};
 try{
  const url=gk2aImageUrl(kind,utc,key);
  const response=await fetcher(url.toString(),{redirect:'error',
   headers:{Accept:'image/png'},signal:AbortSignal.timeout(15000)});
  if(!response.ok){await response.body?.cancel?.();return {status:502,error:'기상청 위성영상 조회 실패 · 상품별 이용승인 확인 필요'};}
  const bytes=await boundedRead(response,MAX_IMAGE_BYTES);
  const sig=[137,80,78,71,13,10,26,10];
  if(bytes.length<33||!sig.every((v,i)=>bytes[i]===v))
   return {status:502,error:'기상청 응답이 유효한 PNG 영상이 아닙니다.'};
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const width=view.getUint32(16),height=view.getUint32(20);
  if(width<16||height<16||width>12000||height>12000)
   return {status:502,error:'위성영상 크기 검증 실패'};
  return {status:200,bytes,width,height,observationUTC:utc,kind,
   overlayReady:false,georeferenced:false,source:'기상청 GK2A LE2'};
 }catch{return {status:502,error:'기상청 위성영상 수신 또는 크기 제한 검사 실패'};}
}
