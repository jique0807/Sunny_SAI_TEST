import {kmaWeather} from './kma.mjs';
import {safemapWms} from './safemap.mjs';
import {synthesize} from './google-voice.mjs';
import {voiceCatalog} from '../public/voice-catalog.mjs';
const encoder = new TextEncoder(), decoder = new TextDecoder();
const windows = new Map();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const unb64 = s => Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')), c=>c.charCodeAt(0));
const random = () => b64(crypto.getRandomValues(new Uint8Array(24)));
export async function seal(value, secret, purpose) {
  const key = await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode(secret)),{name:'AES-GCM'},false,['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(purpose)},key,encoder.encode(JSON.stringify(value)));
  return b64(iv)+'.'+b64(bytes);
}
export async function unseal(token,secret,purpose) {
  try { const [iv,data,...extra] = token.split('.'); if(extra.length||token.length>4096)return null;
    const key = await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode(secret)),{name:'AES-GCM'},false,['decrypt']);
    const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:encoder.encode(purpose)},key,unb64(data));
    const result = JSON.parse(decoder.decode(plain)); return result.exp>Date.now()?result:null;
  } catch { return null; }
}
function cookie(req,name) {return (req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';}
function setCookie(name,value,secure,age=1800){return `${name}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`;}
function limit(id,max=35){const now=Date.now();for(const[k,v]of windows)if(now-v.time>60000)windows.delete(k);let v=windows.get(id);if(!v){if(windows.size>3000)return false;v={time:now,n:0};windows.set(id,v);}return ++v.n<=max;}
const coord = p => p && typeof p.lat==='number' && typeof p.lng==='number' && Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat>=32&&p.lat<=40&&p.lng>=123&&p.lng<=133;
const json = (status,data,headers={}) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers}});
async function body(req){if(!req.headers.get('content-type')?.startsWith('application/json'))throw Object.assign(Error(),{status:415});let size=0,chunks=[];const reader=req.body?.getReader();if(!reader)throw Object.assign(Error(),{status:400});while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16000){await reader.cancel();throw Object.assign(Error(),{status:413});}chunks.push(value);}let all=new Uint8Array(size),i=0;for(const c of chunks){all.set(c,i);i+=c.length;}try{return JSON.parse(decoder.decode(all));}catch{throw Object.assign(Error(),{status:400});}}
async function upstream(url,options={},fetcher=fetch){const r=await fetcher(url,{...options,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Object.assign(Error(),{status:502,providerStatus:r.status});return r.json();}
export function routeSamples(route, departure) {
 const roads=route.sections?.flatMap(s=>s.roads||[])||[];let elapsed=0,dist=0,points=[],vertices=[],rainPath=[];
 for(const r of roads){const v=r.vertexes||[];const part=[];for(let i=0;i+1<v.length;i+=2){const p={lng:v[i],lat:v[i+1]};if(coord(p)){part.push(p);vertices.push(p);}}
 const lengths=[0];for(let j=1;j<part.length;j++)lengths[j]=lengths[j-1]+Math.hypot((part[j].lat-part[j-1].lat)*111320,(part[j].lng-part[j-1].lng)*111320*Math.cos(part[j].lat*Math.PI/180));
 for(let j=0;j<part.length;j++)rainPath.push({...part[j],seconds:elapsed+Number(r.duration||0)*(lengths.at(-1)?lengths[j]/lengths.at(-1):0),label:r.name||'전방 경로'});
 if(part.length)points.push({label:r.name||'경로 구간',...part[Math.floor(part.length/2)],seconds:elapsed+Number(r.duration||0)/2,distance:dist+Number(r.distance||0)/2});elapsed+=Number(r.duration||0);dist+=Number(r.distance||0);}
 if(!points.length)throw Object.assign(Error(),{status:502});
 const count=Math.min(5,points.length),used=new Set(),samples=[];
 for(let i=0;i<count;i++){const target=(i+.5)*elapsed/count;const idx=points.reduce((best,p,j)=>Math.abs(p.seconds-target)<Math.abs(points[best].seconds-target)?j:best,0);if(used.has(idx))continue;used.add(idx);const p=points[idx];samples.push({...p,eta:new Date(departure+p.seconds*1000).toISOString()});}
 return {rainPath:rainPath.filter((_,i)=>i%Math.max(1,Math.ceil(rainPath.length/6000))===0||i===rainPath.length-1),vertices:vertices.filter((_,i)=>i%Math.max(1,Math.ceil(vertices.length/3500))===0||i===vertices.length-1),samples,distance:route.summary.distance,duration:route.summary.duration,departure:new Date(departure).toISOString(),source:'Kakao Mobility',fetchedAt:new Date().toISOString(),etaMethod:'도로별 예상 소요시간 누적 · 교통상황에 따라 변동'};
}
export function matchForecast(data,eta){const h=data?.hourly;const ts=Date.parse(eta)/1000;if(!h?.time?.length||!Number.isFinite(ts))return null;let idx=h.time.reduce((best,t,i)=>Math.abs(t-ts)<Math.abs(h.time[best]-ts)?i:best,0);if(Math.abs(h.time[idx]-ts)>3600)return null;const read=k=>typeof h[k]?.[idx]==='number'&&Number.isFinite(h[k][idx])?h[k][idx]:null;return {time:new Date(h.time[idx]*1000).toISOString(),temperature:read('temperature_2m'),rain:read('precipitation'),gust:read('wind_gusts_10m'),visibility:read('visibility')};}
export async function handle(req,env={},fetcher=fetch){
 const path=new URL(req.url).pathname;
 const origin=env.APP_ORIGIN||new URL(req.url).origin,secure=origin.startsWith('https:'),secret=env.SESSION_SECRET;
 try{
 const configured=new URL(origin);if(configured.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(configured.hostname))return json(503,{error:'HTTPS 배포 설정이 필요합니다.'});
 if(req.headers.get('sec-fetch-site')==='cross-site'||(req.headers.get('origin')&&req.headers.get('origin')!==origin))return json(403,{error:'허용되지 않은 요청입니다.'});
 if(req.method!=='GET'&&req.headers.get('origin')!==origin)return json(403,{error:'요청 출처를 확인하지 못했습니다.'});
 if(!secret||secret.length<43)return json(503,{error:'운영자 보안 설정을 준비 중입니다. 시연과 기본 음성은 사용할 수 있습니다.'});
 const uid=req.headers.get('oai-authenticated-user-id')||'local-browser';
 let session=await unseal(cookie(req,'sunny_session'),secret,'session');
 if(session?.uid!==uid)session=null;
 if(path==='/api/session'&&req.method==='GET'){
 let created=false;if(!session){created=true;session={sid:random(),csrf:random(),uid,exp:Date.now()+1800000};}
 const voice=await unseal(cookie(req,'sunny_voice'),secret,'voice:'+session.sid+':'+uid);
 const result=json(200,{csrf:session.csrf,connected:!!voice,voiceProvider:voice?.provider||null,expiresAt:session.exp,mapConfig:{kakao:env.KAKAO_JAVASCRIPT_KEY||'',vworld:env.VWORLD_API_KEY||''},connections:{route:!!env.KAKAO_REST_API_KEY,weather:true,kma:!!env.KMA_API_KEY,safemap:!!env.SAFEMAP_API_KEY,gk2a:false,road:false,terrain:false},voiceStorage:'암호화된 HttpOnly 쿠키 · 최대 30분'});
 if(created)result.headers.append('Set-Cookie',setCookie('sunny_session',await seal(session,secret,'session'),secure));return result;
 }
 if(!session)return json(401,{error:'세션이 만료되었습니다. 페이지를 새로 열어주세요.'});
 if(req.method!=='GET'&&req.headers.get('x-csrf-token')!==session.csrf)return json(403,{error:'요청을 확인하지 못했습니다.'});
 if(!limit(session.sid))return json(429,{error:'요청이 많습니다. 1분 뒤 다시 시도해주세요.'});
 if(path==='/api/safemap/wms'&&req.method==='GET')return await safemapWms(new URL(req.url).searchParams,env.SAFEMAP_API_KEY,fetcher);
 if(path==='/api/data-health'&&req.method==='POST'){
   const now=Date.now();
   const status={kma:{configured:!!env.KMA_API_KEY,state:'missing'},safemap:{configured:!!env.SAFEMAP_API_KEY,state:'missing'}};
   if(env.KMA_API_KEY){
     try{const eta=new Date(now+2*3600000).toISOString();const result=await kmaWeather([{lat:37.5665,lng:126.978,eta,label:'서울 시청 검증 지점'}],env.KMA_API_KEY,fetcher,now);
       status.kma={configured:true,state:result.samples[0]?.status==='forecast'?'received':'unavailable',message:result.samples[0]?.status==='forecast'?'기상청 예보 응답·유효시각 매칭 성공':'기상청 응답 미확인 · 활용승인/발표시각/데이터 범위 확인'};
     }catch{status.kma={configured:true,state:'unavailable',message:'기상청 외부 응답 검사 실패'};}
   }
   if(env.SAFEMAP_API_KEY){
     try{const params=new URLSearchParams({bbox:'14126000,4510000,14128000,4512000',width:'256',height:'256'});
       const picture=await safemapWms(params,env.SAFEMAP_API_KEY,fetcher);await picture.body?.cancel();
       status.safemap={configured:true,state:'received',message:'하천범람 WMS PNG 응답 확인 · 해당 위치에 범람지역이 존재한다는 뜻은 아님'};
     }catch{status.safemap={configured:true,state:'unavailable',message:'생활안전지도 WMS 응답 미확인 · 활용승인/인증/서비스 상태 확인'};}
   }
   return json(200,{sources:status,checkedAt:new Date(now).toISOString(),caution:'자료 서버 응답 검사이며 실제 주행·침수 발생 검증이 아닙니다.'});
 }
 if(path==='/api/voice/key'&&req.method==='POST'){const input=await body(req);const key=typeof input.key==='string'?input.key.trim():'';const provider=key.startsWith('AQ.')?'gemini':(input.provider||'cloud');if(!['gemini','cloud'].includes(provider))return json(400,{error:'음성 API 종류를 선택해주세요.'});if(key.length<16||key.length>2048||/[^\x21-\x7e]/.test(key))return json(400,{error:'API 키를 공백·줄바꿈 없이 붙여넣어주세요. 키의 시작 문자는 제한하지 않습니다.'});const token=await seal({key,provider,exp:session.exp},secret,'voice:'+session.sid+':'+uid);return json(200,{connected:true,provider,message:'암호화해 임시 연결했습니다. 실제 사용 가능 여부는 음성 재생 시 확인됩니다.'},{'Set-Cookie':setCookie('sunny_voice',token,secure,Math.max(0,Math.floor((session.exp-Date.now())/1000)))});}
 if(path==='/api/voice/key'&&req.method==='DELETE')return json(200,{connected:false},{'Set-Cookie':setCookie('sunny_voice','',secure,0)});
 if(path==='/api/voice/voices'&&req.method==='POST'){const {provider='cloud'}=await body(req);if(!['gemini','cloud'].includes(provider))return json(400,{error:'음성 API 종류를 선택해주세요.'});return json(200,{voices:voiceCatalog(provider),catalog:true});}
 if(path==='/api/voice/speak'&&req.method==='POST'){const {text,rate,voiceName,provider}=await body(req);if(typeof text!=='string'||!text.trim()||text.length>800)return json(400,{error:'음성 문장은 1~800자로 입력해주세요.'});const voice=await unseal(cookie(req,'sunny_voice'),secret,'voice:'+session.sid+':'+uid);if(!voice)return json(409,{error:'개인 Google 키를 연결해주세요. 연결은 최대 30분 유지됩니다.'});try{return json(200,await synthesize({key:voice.key,provider:voice.key.startsWith('AQ.')?'gemini':(provider||voice.provider||'cloud'),voiceName,text,rate},fetcher));}catch(e){return json(e.status===400?400:502,{error:e.message});}}
 if(path==='/api/map-health'&&req.method==='POST'){
 const check=async(name,key,url,image=false)=>{if(!key)return {name,state:'missing',message:'운영자 키 미설정'};try{const r=await fetcher(url,{headers:{Referer:origin+'/'},signal:AbortSignal.timeout(12000)});const type=r.headers.get('content-type')||'';let domainMismatch=false,serviceDisabled=false;if(!image&&!r.ok){const text=(await r.text()).slice(0,4096);domainMismatch=/domain mismatched/i.test(text);serviceDisabled=/disabled OPEN_MAP_AND_LOCAL service/i.test(text);}const ok=r.ok&&(image?type.startsWith('image/'):!type.includes('application/json'));if(image)await r.body?.cancel();return {name,state:ok?'received':'failed',status:r.status,message:serviceDisabled?'카카오맵 사용 설정이 꺼져 있습니다. 카카오디벨로퍼스의 해당 앱 → 카카오맵 → 사용 설정을 ON으로 변경해주세요.':domainMismatch?'SDK 허용 도메인 불일치':ok?(image?'위성 이미지 수신 확인':'SDK 응답 수신 · 브라우저 표시 별도 확인'):'외부 HTTP '+r.status+(image&&!type.startsWith('image/')?' · 이미지 응답 없음':'')};}catch{return {name,state:'unavailable',message:'검사 서버에서 외부 응답을 확인하지 못함'};}};
 const kakao='https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey='+encodeURIComponent(env.KAKAO_JAVASCRIPT_KEY||'');
 const vworld='https://api.vworld.kr/req/wmts/1.0.0/'+encodeURIComponent(env.VWORLD_API_KEY||'')+'/Satellite/16/25454/55923.jpeg';
 const checks=await Promise.all([check('카카오 지도 SDK',env.KAKAO_JAVASCRIPT_KEY,kakao),check('브이월드 위성',env.VWORLD_API_KEY,vworld,true)]);
 return json(200,{origin,checks,checkedAt:new Date().toISOString(),caution:'서버 검사 결과입니다. 사용자 브라우저와 네트워크 조건이 다를 수 있습니다.'});
 }
 if(path==='/api/search'&&req.method==='POST'){
 if(!env.KAKAO_REST_API_KEY)return json(503,{error:'카카오 REST 키가 아직 연결되지 않았습니다.'});
 const {query}=await body(req);
 if(typeof query!=='string'||!query.trim()||query.length>100)return json(400,{error:'검색어를 확인해주세요.'});
 const q=query.trim().replace(/\s+/g,' ');
 const headers={Authorization:'KakaoAK '+env.KAKAO_REST_API_KEY};
 const variants=[q];
 const push=v=>{v=v.trim().replace(/\s+/g,' ');if(v.length>=2&&!variants.includes(v)&&variants.length<5)variants.push(v);};
 const withoutRegion=q.replace(/^(?:세종특별자치시|세종시|세종|서울특별시|서울시|부산광역시|대전광역시|대구광역시|인천광역시|광주광역시|울산광역시)\s+/,'');
 if(withoutRegion!==q)push(withoutRegion);
 const apt=q.match(/(?:^|\s)(\d{1,3})\s*단지(?:\s|$)/);
 if(apt){
  push(q.replace(/(\d{1,3})\s*단지/,'$1단지 아파트'));
  if(/도담동/.test(q)){push(q.replace(/도담동/g,'도램마을'));push(q.replace(/(?:세종특별자치시|세종시|세종)\s*/g,'').replace(/도담동/g,'도램마을'));}
  if(withoutRegion!==q)push(withoutRegion.replace(/(\d{1,3})\s*단지/,'$1단지 아파트'));
 }
 const request=(kind,term)=>{
  const url=new URL('https://dapi.kakao.com/v2/local/search/'+kind+'.json');
  url.searchParams.set('query',term);url.searchParams.set('size',kind==='keyword'?'15':'10');
  return upstream(url.toString(),{headers},fetcher);
 };
 // Limit fan-out: original keyword and address, plus up to four alternate keywords.
 const calls=[{kind:'keyword',term:q},{kind:'address',term:q},...variants.slice(1).map(term=>({kind:'keyword',term}))];
 const responses=await Promise.allSettled(calls.map(c=>request(c.kind,c.term)));
 if(responses.every(r=>r.status==='rejected'))throw responses[0].reason;
 const results=[],seen=new Set();
 const normalize=t=>String(t||'').toLowerCase().replace(/\s+/g,'').replace(/(?:특별자치시|광역시|특별시)/g,'');
 const tokens=q.split(/\s+/).filter(Boolean);
 const numbers=[...q.matchAll(/(\d{1,3})\s*단지/g)].map(m=>m[1]);
 const score=p=>{
  const name=normalize(p.name),addr=normalize(p.address),all=name+' '+addr;
  let n=0;
  if(name===normalize(q))n+=120;
  if(name.includes(normalize(q)))n+=65;
  for(const t of tokens){const v=normalize(t);if(name.includes(v))n+=20;else if(addr.includes(v))n+=10;}
  if(/도담동/.test(q)&&(/도담동/.test(all)||/도램마을/.test(all)))n+=32;
  if(/세종/.test(q)&&/세종/.test(all))n+=25;
  if(numbers.length){const matching=numbers.some(v=>new RegExp('(?:^|[^0-9])'+v+'\s*단지').test(all));n+=matching?85:-90;}
  if(p.type==='place')n+=5;
  return n;
 };
 const add=p=>{
  if(!coord(p))return;
  const key=p.lat.toFixed(6)+','+p.lng.toFixed(6);
  if(seen.has(key))return;
  seen.add(key);results.push(p);
 };
 responses.forEach((result,i)=>{
  if(result.status!=='fulfilled')return;
  const type=calls[i].kind;
  for(const p of result.value.documents||[]){
   if(type==='keyword')add({name:p.place_name||p.road_address_name||p.address_name,address:p.road_address_name||p.address_name||'',lat:Number(p.y),lng:Number(p.x),type:'place'});
   else add({name:p.road_address?.address_name||p.address?.address_name||p.address_name||q,address:p.address?.address_name||p.road_address?.address_name||'',lat:Number(p.y),lng:Number(p.x),type:'address'});
  }
 });
 const places=results.map((p,i)=>({...p,_score:score(p),_order:i})).sort((a,b)=>b._score-a._score||a._order-b._order).slice(0,15).map(({_score,_order,...p})=>p);
 return json(200,{places});
}
 if(path==='/api/route'&&req.method==='POST'){if(!env.KAKAO_REST_API_KEY)return json(503,{error:'운영자의 카카오 길찾기 REST 키 연결이 필요합니다.'});const {origin:start,destination,departure}=await body(req);if(!coord(start)||!coord(destination))return json(400,{error:'대한민국 내 출발지와 목적지를 다시 선택해주세요.'});const time=Date.parse(departure);if(!Number.isFinite(time)||time<Date.now()-600000||time>Date.now()+86400000)return json(400,{error:'출발시각은 지금부터 24시간 이내로 선택해주세요.'});const future=time>Date.now()+900000;const url=new URL('https://apis-navi.kakaomobility.com/v1/'+(future?'future/directions':'directions'));url.searchParams.set('origin',start.lng+','+start.lat);url.searchParams.set('destination',destination.lng+','+destination.lat);url.searchParams.set('priority','RECOMMEND');url.searchParams.set('summary','false');if(future){const kst=new Date(time+9*3600000).toISOString();url.searchParams.set('departure_time',kst.slice(0,10).replaceAll('-','')+kst.slice(11,16).replaceAll(':',''));}const d=await upstream(url.toString(),{headers:{Authorization:'KakaoAK '+env.KAKAO_REST_API_KEY}},fetcher);const r=d.routes?.find(r=>r.result_code===0);if(!r)return json(422,{error:'차량 경로를 찾지 못했습니다. 장소와 출발시각을 확인해주세요.'});return json(200,routeSamples(r,time));}
 if(path==='/api/weather'&&req.method==='POST'){const {samples,provider='auto'}=await body(req);if(!['auto','kma','kma-ultra','open-meteo'].includes(provider))return json(400,{error:'기상 자료 제공자를 확인해주세요.'});if(!Array.isArray(samples)||!samples.length||samples.length>5||samples.some(p=>!coord(p)||!Number.isFinite(Date.parse(p.eta))||Math.abs(Date.parse(p.eta)-Date.now())>2*86400000))return json(400,{error:'경로와 예보시각을 확인해주세요.'});if(['kma','kma-ultra'].includes(provider)&&!env.KMA_API_KEY)return json(503,{error:'기상청 인증키 설정 대기: 운영 프로젝트의 KMA_API_KEY를 등록하고 재배포해주세요.'});if(['kma','kma-ultra'].includes(provider)||(provider==='auto'&&env.KMA_API_KEY))return json(200,await kmaWeather(samples,env.KMA_API_KEY,fetcher,Date.now(),provider==='kma-ultra'));const results=await Promise.all(samples.map(async p=>{try{const url=new URL('https://api.open-meteo.com/v1/forecast');Object.entries({latitude:p.lat,longitude:p.lng,hourly:'temperature_2m,precipitation,wind_gusts_10m,visibility',forecast_days:3,timeformat:'unixtime',timezone:'GMT',wind_speed_unit:'ms'}).forEach(([k,v])=>url.searchParams.set(k,String(v)));const data=await upstream(url.toString(),{},fetcher);const forecast=matchForecast(data,p.eta);return{...p,forecast,status:forecast?'forecast':'unavailable'};}catch{return{...p,forecast:null,status:'unavailable'};}}));return json(200,{samples:results,provider:'open-meteo',source:'Open-Meteo · 모델 예보',sourceUrl:'https://open-meteo.com/',license:'CC BY 4.0',fetchedAt:new Date().toISOString(),caution:'시간당 강수량·모델 격자 예보이며 실제 도로상태나 공식 특보가 아닙니다.'});}
 return json(404,{error:'지원하지 않는 요청입니다.'});
 }catch(e){const providerError=e.providerStatus?`외부 서비스가 요청을 거절했습니다 (HTTP ${e.providerStatus}). 운영자의 API 키 종류·사용 권한·호출 제한을 확인해주세요.`:e.name==='TimeoutError'?'외부 서비스 응답 시간이 초과됐습니다. 잠시 후 다시 시도해주세요.':null;return json(e.status||502,{error:e.status===413?'입력 크기를 초과했습니다.':providerError||'요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'});}
}

