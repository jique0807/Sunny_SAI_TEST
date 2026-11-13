// Fixed public test queries, provider keys remain in the deployment environment.
const stamp=t=>new Date(t+9*3600000).toISOString().slice(0,16).replace(/[-:T]/g,'');
export async function probeAdditionalSource(env,mode,{fetcher=fetch,now=Date.now()}={}){
 const key=mode==='shelterSafety'?(env.HEAT_SHELTER_API_KEY||env.SAFETYDATA_API_KEY):mode==='shelterMap'?env.SAFEMAP_API_KEY:mode==='taas'?(env.KOROAD_VIOLATION_API_KEY||env.KOROAD_API_KEY):env.KMA_API_KEY;
 if(!key)return {mode,status:'key_missing'};
 const kst=stamp(now-5*60000),from=stamp(now-15*60000);
 const d=new Date(now+9*3600000-20*60000);d.setUTCHours(Math.floor((d.getUTCHours()-2)/3)*3+2,0,0,0);const pub=d.toISOString().slice(0,13).replace(/[-T]/g,'')+'00';
 const configs={
  aws:['https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-aws2_min',{tm2:kst,stn:'0',disp:'1',help:'1',authKey:key}],
  stations:['https://apihub.kma.go.kr/api/typ01/url/stn_inf.php',{inf:'AWS',stn:'0',help:'1',authKey:key}],
  cctv:['https://apihub.kma.go.kr/api/typ01/url/cctv_ana_info.php',{tm1:from,tm2:kst,eqp:'0',disp:'0',help:'1',authKey:key}],
  snow:['https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst',{authKey:key,pageNo:'1',numOfRows:'1000',dataType:'JSON',base_date:pub.slice(0,8),base_time:pub.slice(8),nx:'60',ny:'127'}],
  shelterSafety:['https://www.safetydata.go.kr/V2/api/DSSP-IF-10942',{serviceKey:key,returnType:'json',pageNo:'1',numOfRows:'10'}],
  shelterMap:['https://www.safemap.go.kr/openapi2/IF_0001',{serviceKey:key,returnType:'JSON',pageNo:'1',numOfRows:'10'}],
  taas:['https://opendata.koroad.or.kr/data/rest/frequentzone/lgrViolt',{authKey:key,searchYearCd:'2024',siDo:'11',guGun:'140',type:'json',numOfRows:'200',pageNo:'1'}]
 };
 if(!configs[mode])return {status:'invalid_mode'};
 const [host,params]=configs[mode],url=new URL(host);url.search=new URLSearchParams(params);
 try{
  const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!r.ok){await r.body?.cancel();return {mode,status:'http_error',http:r.status};}
  const b=await r.text();if(b.length>3000000)return {mode,status:'oversized'};
  let safe=b.split(key).join('[redacted]').split(encodeURIComponent(key)).join('[redacted]');
  if(mode==='snow'){
   const x=JSON.parse(b),rows=x?.response?.body?.items?.item||[];
   return {mode,http:200,code:x?.response?.header?.resultCode,count:rows.length,categories:[...new Set(rows.map(v=>v.category))],rows:rows.filter(v=>['SNO','PTY'].includes(v.category)).slice(0,16)};
  }
  const lines=b.split(/\r?\n/).filter(v=>/^\d{12},/.test(v));
  return {mode,http:200,status:'response_received',characters:b.length,count:lines.length,
   latest:lines.map(v=>v.slice(0,12)).sort().at(-1)||null,preview:safe.slice(0,['aws','stations','cctv'].includes(mode)?14000:9000)};
 }catch{return {mode,status:'request_or_format_failed'};}
}
