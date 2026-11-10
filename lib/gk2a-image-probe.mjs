// Server-only GK2A L2 probe. Never return keys, provider URLs or raw error bodies.
const PRODUCTS=Object.freeze([{code:'rr',label:'강우강도'},{code:'ci',label:'대류운 발생탐지'},{code:'fog',label:'안개'}]);
const BASE='https://apihub.kma.go.kr/api/typ01/url/';
const stampUTC=(ms)=>new Date(ms).toISOString().slice(0,16).replace(/[-:T]/g,'');
const dayUTC=(ms)=>stampUTC(ms).slice(0,8);
const classify=(txt)=>{
 const s=String(txt||'').toLowerCase();
 if(/authkey|인증|승인|access denied|unauthorized|forbidden|permission|등록되지|사용 불가|서비스.*권한/.test(s))return 'authorization_or_key_error';
 if(/not found|파일없|자료.*없|no data|no file|데이터.*없|조회.*결과.*없/.test(s))return 'no_file';
 if(/limit|트래픽|초과|too many|rate/.test(s))return 'rate_limited';
 if(/error|fail|잘못|invalid|오류/.test(s))return 'provider_error';
 return s.trim().length?'text_response':'empty';
};
async function readPrefix(response,maxBytes=65536){
 const reader=response.body?.getReader();
 if(!reader)return new Uint8Array();
 const chunks=[];let size=0;
 try{
  while(size<maxBytes){
   const {value,done}=await reader.read();
   if(done)break;
   const byteArray=new Uint8Array(value);
   const take=byteArray.subarray(0,Math.min(byteArray.length,maxBytes-size));
   chunks.push(take);size+=take.length;
   if(take.length<byteArray.length)break;
  }
 }finally{await reader.cancel().catch(()=>{});}
 const out=new Uint8Array(size);let offset=0;
 for(const c of chunks){out.set(c,offset);offset+=c.length;}
 return out;
}
const pngMeta=b=>b.length>=24&&b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71
 ? {width:(b[16]*16777216+b[17]*65536+b[18]*256+b[19]),height:(b[20]*16777216+b[21]*65536+b[22]*256+b[23])}:null;
async function safeGet(url,fetcher){
 return fetcher(url,{method:'GET',redirect:'manual',cache:'no-store',headers:{Accept:'image/png,text/plain,*/*'},signal:AbortSignal.timeout(11000)});
}
async function checkOne(product,key,fetcher,now){
 const day=dayUTC(now-90*60000);
 const list=new URL(BASE+'sat_file_data_list.php');
 for(const [k,v]of Object.entries({type:'img',lvl:'l2',data:product.code,area:'ko',tm:day,size:'n',authKey:key}))
  list.searchParams.set(k,v);
 let listState={status:'not_checked'},images=[];
 try{
  const response=await safeGet(list.toString(),fetcher);
  const prefix=await readPrefix(response);
  const text=new TextDecoder().decode(prefix);
  const dates=[...text.matchAll(/(20\d{10})(?!\d)/g)].map(x=>x[1]).filter(x=>x.startsWith(day));
  const files=[...new Set(dates)].sort().reverse();
  images=files;
  listState={status:response.ok?(files.length?'files_listed':classify(text)):'http_error',
   httpStatus:response.status,uniqueTimes:files.length,latestUTC:files[0]||null,
   contentType:(response.headers.get('content-type')||'').split(';')[0]};
 }catch{listState={status:'network_or_timeout'};}
 const fallback=stampUTC(Math.floor((now-120*60000)/600000)*600000);
 const picked=images[0]||fallback;
 const download=new URL(BASE+'sat_file_img_down.php');
 for(const [k,v]of Object.entries({lvl:'l2',data:product.code,area:'ko',tm:picked,authKey:key}))
  download.searchParams.set(k,v);
 let imageState={status:'not_checked'};
 if(listState.httpStatus===401||listState.httpStatus===403)
  imageState={status:'not_attempted_auth_http_error'};
 else{
  try{
   const response=await safeGet(download.toString(),fetcher);
   const prefix=await readPrefix(response,4096),png=pngMeta(prefix);
   const contentType=(response.headers.get('content-type')||'').split(';')[0];
   imageState={status:png?'png_received':!response.ok?'http_error':classify(new TextDecoder().decode(prefix.subarray(0,Math.min(prefix.length,600)))),
    httpStatus:response.status,contentType,width:png?.width||null,height:png?.height||null,
    reportedBytes:Number(response.headers.get('content-length'))||null,requestedUTC:picked};
  }catch{imageState={status:'network_or_timeout',requestedUTC:picked};}
 }
 return {product:product.code.toUpperCase(),name:product.label,list:listState,image:imageState};
}
export async function probeGk2aImages(key,fetcher=fetch,now=Date.now()){
 if(!key)return {status:'key_missing',checkedAt:new Date(now).toISOString(),results:[]};
 const results=await Promise.all(PRODUCTS.map(p=>checkOne(p,key,fetcher,now)));
 const received=results.filter(r=>r.image.status==='png_received').length;
 return {status:received===3?'all_images_received':received?'partial_images_received':'images_not_verified',
  checkedAt:new Date(now).toISOString(),productsChecked:results.length,imagesReceived:received,
  source:'KMA GK2A L2 via sat_file_data_list.php and sat_file_img_down.php',results,
  disclaimer:'This tests authenticated image reception, not map coordinate alignment or transparent background.'};
}
