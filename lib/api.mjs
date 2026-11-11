import {additionalSourceStatus} from './additional-source-status.mjs';
import {fetchRoadWeather} from './road-weather-observations.mjs';
import {makeSyntheticRiskFixture} from '../public/synthetic-risk-demo.mjs';
import {searchSyntheticDetour} from '../public/synthetic-detour-search.mjs';
import {explainRisk,validateLLMConfig} from './llm-explanation.mjs';
import {getActiveWarnings} from './kma-warning.mjs';
import {capabilityCatalog} from './capability-catalog.mjs';
import {kmaWeather} from './kma.mjs';
import {walkingQuery,normalizeWalkingRoute,WALK_ROUTE_MODES} from './kakao-walk.mjs';
import {tmapWalkingRoute} from './tmap-walk.mjs';
import {probePedestrianRoute,probeNationalPedestrianRoutes} from './pedestrian-diagnostic.mjs';
import {fetchKoroadPedestrianHotspots,KOROAD_PEDESTRIAN_CONTEXT} from './koroad-pedestrian.mjs';
import {fetchItsRouteContext,validateItsPoints} from './its-traffic.mjs';
import {probeTaasHighway,probeTaasPedestrianWms} from './koroad-approved.mjs';
import {fetchTaasMapImage,PEDESTRIAN_WMS_KINDS,validTaasMapBounds} from './taas-pedestrian-wms-map.mjs';
import {fetchRoutePedestrianHistory} from './pedestrian-route-context.mjs';
import {fetchTaasRestMap} from './taas-rest-map.mjs';
import {kmaMapForecast} from './kma-map.mjs';
import {kmaRoadRisk,kmaAllRoadRisks} from './kma-road.mjs';
import {checkRouteLayerFeasibility} from './route-layer-feasibility.mjs';
import {checkRadarAccess} from './kma-radar-probe.mjs';
import {radarCompositeDiagnostic} from './kma-radar-composite-probe.mjs';
import {summarizeRealRadar} from './kma-radar-composite-data.mjs';
import {inspectTransparentRadar} from './kma-radar-transparent-probe.mjs';
import {getRadarImageMetadata,getRadarImage,visibleRadarMetadata} from './kma-radar-overlay-image.mjs';
import {probeRadarGeolocation} from './kma-radar-georef-probe.mjs';
import {pngInfo} from './kma-radar-png-stats.mjs';
import {fetchRadarFrame,RADAR_LEADS} from './kma-radar-frame.mjs';
import {probeRainGrid} from './kma-rain-grid-probe.mjs';
import {nationalRainGrid} from './kma-rain-grid.mjs';
import {getSatelliteFrame,satellitePublicMeta} from './gk2a-satellite.mjs';
import {probeSatelliteCatalog,probeSatelliteNumeric} from './gk2a-numeric-probe.mjs';
import {loadSatelliteNumeric,satelliteMapCells,satelliteRouteValues} from './gk2a-numeric-data.mjs';
import {safemapWms} from './safemap.mjs';
import {checkFloodWmsVariants} from './safemap-wms-variants.mjs';
import {synthesize} from './google-voice.mjs';
import {voiceCatalog} from '../public/voice-catalog.mjs';
import {DEMO_SEOUL_BUSAN,DEMO_DETOUR_CANDIDATES,makeDemoScenario,demoBreakingTiming,demoPointAtSeconds,demoDistanceMeters,selectOptimalDemoDetour} from '../public/demo-scenario.mjs';
import {WALK_DEMO,WALK_DEMO_SHELTER,WALK_DEMO_TRIGGER,validateWalkingDemoRoute,makeWalkingDemoScenario,makeWalkingDemoBreakingWarning} from '../public/walking-demo.mjs';
const encoder = new TextEncoder(), decoder = new TextDecoder();
const windows = new Map();
let radarProbeCache=null;
const dummyDetourDiagnosticCache=new Map();
let radarCompositeProbeCache=null;
let radarIntervalProbeCache=null;
const radarTransparentProbeCache=new Map();
const radarWholeGridSummaryCache=new Map();
let rainGridProbeCache=null;
let rainGridDiagnosticCache=null;
let routeLayerFeasibilityCache=null;
let previewJourneySmokeCache=null;
let pedestrianRouteDiagnosticCache=null;
let pedestrianNationalDiagnosticCache=null;
let demoDrivingDiagnosticCache=null,demoWalkingDiagnosticCache=null;
let koroadPedestrianCache=null;
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
const MAX_ROUTE_WEATHER_SAMPLES=24;
export function routeSamples(route, departure) {
 const roads=route.sections?.flatMap(s=>s.roads||[])||[];let elapsed=0,dist=0,points=[],vertices=[],rainPath=[];
 for(const r of roads){const v=r.vertexes||[];const part=[];for(let i=0;i+1<v.length;i+=2){const p={lng:v[i],lat:v[i+1]};if(coord(p)){part.push(p);vertices.push(p);}}
 const lengths=[0];for(let j=1;j<part.length;j++)lengths[j]=lengths[j-1]+Math.hypot((part[j].lat-part[j-1].lat)*111320,(part[j].lng-part[j-1].lng)*111320*Math.cos(part[j].lat*Math.PI/180));
 for(let j=0;j<part.length;j++)rainPath.push({...part[j],seconds:elapsed+Number(r.duration||0)*(lengths.at(-1)?lengths[j]/lengths.at(-1):0),label:r.name||'전방 경로'});
 if(part.length)points.push({label:r.name||'경로 구간',...part[Math.floor(part.length/2)],seconds:elapsed+Number(r.duration||0)/2,distance:dist+Number(r.distance||0)/2});elapsed+=Number(r.duration||0);dist+=Number(r.distance||0);}
 if(!points.length)throw Object.assign(Error(),{status:502});
 const count=Math.min(MAX_ROUTE_WEATHER_SAMPLES,Math.max(Math.min(5,points.length),Math.ceil(elapsed/600)));
 const samples=[];
 const addSample=p=>samples.push({...p,eta:new Date(departure+p.seconds*1000).toISOString()});
 if(elapsed<=600){
  const used=new Set();
  for(let i=0;i<count;i++){
   const target=(i+.5)*elapsed/count;
   const idx=points.reduce((best,p,j)=>Math.abs(p.seconds-target)<Math.abs(points[best].seconds-target)?j:best,0);
   if(!used.has(idx)){used.add(idx);addSample(points[idx]);}
  }
 }else{
  let index=1;
  for(let i=0;i<count;i++){
   const seconds=(i+.5)*elapsed/count;
   while(index<rainPath.length-1&&rainPath[index].seconds<seconds)index++;
   const before=rainPath[index-1],after=rainPath[index]??before;
   const span=after.seconds-before.seconds;
   const fraction=span>0?Math.max(0,Math.min(1,(seconds-before.seconds)/span)):0;
   addSample({seconds,label:after.label,lat:before.lat+fraction*(after.lat-before.lat),
    lng:before.lng+fraction*(after.lng-before.lng)});
  }
 }
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
 // Provider reception diagnostics: fixed inputs, previews only, no credential leakage.
 if(path==='/api/satellite-integration-diagnostic'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  if(!limit('satellite-integration-diagnostic',1))return json(429,{error:'Satellite diagnostic rate limited'});
  const points=[{lat:37.5665,lng:126.978,seconds:0},{lat:37.5547,lng:126.9706,seconds:600}];
  const frames=await Promise.all(['rr','ci','fog'].map(p=>loadSatelliteNumeric(env.KMA_API_KEY,p,{fetcher})));
  return json(200,{testOnly:true,checkedAt:new Date().toISOString(),scope:'fixed public Seoul coordinates; not a navigation route',results:frames.map(frame=>{
   const view=satelliteMapCells(frame,{west:123,east:133,south:32,north:40});
   return {product:frame.product,status:frame.status,reason:frame.reason||null,observationUTC:frame.observationUTC||null,
    metadataVerified:frame.metadataVerified===true,mapStatus:view.status,mapCells:view.cells.length,displayStride:view.displayStride||null,
    sampleCells:view.cells.slice(0,2),routeSamples:satelliteRouteValues(frame,points)};
  })});
 }
 if(path==='/api/gk2a-data-diagnostic'&&req.method==='GET'){
  if(!['preview','production'].includes(env.VERCEL_ENV))return json(404,{error:'Deployment only'});
  if(!limit('gk2a-data-diagnostic',2))return json(429,{error:'Satellite diagnostic rate limited'});
  const frames=await Promise.all(['rr','ci','fog'].map(p=>loadSatelliteNumeric(env.KMA_API_KEY,p,{fetcher})));
  return json(200,{checkedAt:new Date().toISOString(),results:frames.map(f=>({product:f.product,status:f.status,
   metadataVerified:f.metadataVerified===true,navigation:f.navigation||null,width:f.width||null,height:f.height||null,
   observationUTC:f.observationUTC||null,reason:f.reason||null}))});
 }
 if(path==='/api/gk2a-numeric-diagnostic'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  const product=new URL(req.url).searchParams.get('product');
  if(product&&!['rr','ci','fog','ciDeep'].includes(product))return json(400,{error:'Unsupported product'});
  if(!limit('gk2a-numeric-diagnostic:'+(product||'catalog'),1))return json(429,{error:'Satellite probe rate limited'});
  return json(200,{checkedAt:new Date().toISOString(),...(product?
   await probeSatelliteNumeric(env.KMA_API_KEY,product,{fetcher}):await probeSatelliteCatalog(env.KMA_API_KEY,{fetcher}))});
 }
 if(path==='/api/gk2a-live-diagnostic'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  if(new URL(req.url).search)return json(400,{error:'No arguments'});
  if(!limit('gk2a-live-diagnostic',1))return json(429,{error:'GK2A diagnostic rate limited'});
  const results=await Promise.all(['rr','ci','fog'].map(async product=>{
   try{return satellitePublicMeta(await getSatelliteFrame(env.KMA_API_KEY,product,{fetcher}));}
   catch{return {product,status:'request_failed'};}
  }));
  return json(200,{checkedAt:new Date().toISOString(),results,
   caution:'PNG reception does not verify georeferencing or cropping'});
 }
 if(path==='/api/additional-source-diagnostic'&&req.method==='GET'){
  if(new URL(req.url).search)return json(400,{error:'No arguments'});
  if(!limit('additional-source-diagnostic',1))return json(429,{error:'잠시 후 재검사해주세요.'});
  return json(200,await additionalSourceStatus(env,{fetcher}));
 }
 if(path==='/api/road-weather-diagnostic'&&req.method==='GET'){
  if(new URL(req.url).search)return json(400,{error:'No arguments'});
  if(!limit('road-weather-diagnostic',1))return json(429,{error:'잠시 후 재검사해주세요.'});
  const result=await fetchRoadWeather(env.KMA_API_KEY,fetcher);
  return json(200,{...result,items:undefined,count:result.items.length,latest:result.items.map(p=>p.observedAt).sort().at(-1)||null});
 }
 if(path==='/api/taas-rest-diagnostic'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  if(new URL(req.url).search)return json(400,{error:'No arguments'});
  if(!limit('taas-rest-diagnostic',1))return json(429,{error:'TAAS probe rate limited'});
  const results=await Promise.all(['pedestrian','child','elderly'].map(async kind=>{
   try{const result=await fetchKoroadPedestrianHotspots(env.KOROAD_API_KEY,fetcher,KOROAD_PEDESTRIAN_CONTEXT,kind);
    return {kind,status:result.status,count:result.items?.length||0,providerStatus:result.providerStatus||null,reason:result.reason||null};}
   catch{return {kind,status:'request_failed',count:0};}
  }));
  return json(200,{checkedAt:new Date().toISOString(),year:'2024',region:'서울 중구',results,
   caution:'Historical REST crash areas, not real-time incidents'});
 }
 // Fixed public test endpoints: real provider geometry + fictional risk records.
 if(path==='/api/dummy-detour-diagnostic'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  const params=new URL(req.url).searchParams,mode=params.get('mode')||'driving';
  if([...params.keys()].some(k=>k!=='mode')||params.getAll('mode').length>1||!['driving','walking'].includes(mode))return json(400,{error:'mode는 driving 또는 walking만 가능합니다.'});
  const cached=dummyDetourDiagnosticCache.get(mode);if(cached?.until>Date.now())return json(200,{...cached.data,cached:true});
  if(!limit('dummy-detour-diagnostic:'+mode,1))return json(429,{error:'경로 진단은 잠시 후 다시 시도해주세요.'});
  if(mode==='walking'?!env.TMAP_API_KEY:!env.KAKAO_REST_API_KEY)return json(200,{status:'missing-key',mode});
  try{
   const query=async input=>{
    try{
     if(input.travelMode==='walking')return await tmapWalkingRoute(input.origin,input.destination,Date.parse(input.departure),env.TMAP_API_KEY,fetcher,'BROAD_FIRST');
     const url=new URL('https://apis-navi.kakaomobility.com/v1/directions');
     url.searchParams.set('origin',input.origin.lng+','+input.origin.lat);url.searchParams.set('destination',input.destination.lng+','+input.destination.lat);
     if(input.waypoints?.length)url.searchParams.set('waypoints',input.waypoints.map(p=>p.lng+','+p.lat).join('|'));
     url.searchParams.set('priority','RECOMMEND');url.searchParams.set('summary','false');
     const data=await upstream(url.toString(),{headers:{Authorization:'KakaoAK '+env.KAKAO_REST_API_KEY}},fetcher);
     const result=data.routes?.find(r=>r.result_code===0);if(!result)throw Error('no route');
     return {...routeSamples(result,Date.parse(input.departure)),mode:'driving',travelMode:'driving',provider:'Kakao Mobility'};
    }catch{throw Error('실제 길찾기 제공자 응답 미확인');}
   };
   const origin={name:'서울역',lat:37.55472,lng:126.97083},destination={name:'강남역',lat:37.49794,lng:127.02762};
   const original=await query({origin,destination,departure:new Date().toISOString(),travelMode:mode});
   const fixture=makeSyntheticRiskFixture({...original,demo:true},'alert');
   const trip={...fixture.route,syntheticRiskHazards:fixture.signals,syntheticFloodSignal:fixture.signals.find(h=>h.kind==='warning')};
   const current=demoPointAtSeconds(trip.rainPath,trip.duration*.38);
   const report=await searchSyntheticDetour({trip,current,destination,query});
   const chosen=report.chosen;
   const data={status:chosen?'reroute-received':'no-verified-alternative',mode,checkedAt:new Date().toISOString(),
    syntheticHazard:true,original:{distance:original.distance,duration:original.duration},attempts:report.attempts,
    chosen:chosen?{candidate:chosen.candidate.label,provider:chosen.route.provider,travelMode:chosen.route.travelMode,
     distance:chosen.route.distance,duration:chosen.route.duration,clearance:Math.round(chosen.clearance),
     minimumClearance:trip.syntheticFloodSignal.affectedRadiusMeters,engineState:chosen.engineCheck.profile.state}:null,
    caution:'실제 제공자 경로와 가상 위험 지점의 회피 검증입니다. 실제 침수·통제 또는 도로 안전성 검증이 아닙니다.'};
   dummyDetourDiagnosticCache.set(mode,{data,until:Date.now()+600000});return json(200,data);
  }catch{return json(200,{status:'provider-unavailable',mode,checkedAt:new Date().toISOString()});}
 }
 // Fixed Seoul public road probe; no user-supplied geometry or secrets.
 if(path==='/api/its-live-diagnostic'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  if(new URL(req.url).search)return json(400,{error:'No parameters allowed'});
  if(!limit('its-live-diagnostic',1))return json(429,{error:'ITS probe rate limited'});
  const points=[{lat:37.5665,lng:126.978},{lat:37.5547,lng:126.9706}];
  const value=await fetchItsRouteContext(env.ROAD_API_KEY,points,fetcher);
  return json(200,{checkedAt:new Date().toISOString(),events:{status:value.status,count:value.items?.length||0,
   providerStatus:value.providerStatus||null,reasonCode:value.reasonCode||null,reason:value.reason||null},
   traffic:{status:value.traffic?.status||'unknown',count:value.traffic?.count||0,
    reason:value.traffic?.reason||null,reasonCode:value.traffic?.reasonCode||null,
     providerStatus:value.traffic?.providerStatus||null},
   routeMatched:false,caution:'No road-link or travel direction verification; no automatic rerouting'});
 }
 if(path==='/api/session'&&req.method==='GET'){
 let created=false;if(!session){created=true;session={sid:random(),csrf:random(),uid,exp:Date.now()+1800000};}
 const voice=await unseal(cookie(req,'sunny_voice'),secret,'voice:'+session.sid+':'+uid);
 const result=json(200,{csrf:session.csrf,connected:!!voice,voiceProvider:voice?.provider||null,expiresAt:session.exp,mapConfig:{kakao:env.KAKAO_JAVASCRIPT_KEY||'',vworld:env.VWORLD_API_KEY||''},connections:{route:!!env.KAKAO_REST_API_KEY,walking:!!env.TMAP_API_KEY||!!env.KAKAO_REST_API_KEY,tmap:!!env.TMAP_API_KEY,walkingProvider:env.TMAP_API_KEY?'tmap':env.KAKAO_REST_API_KEY?'kakao':'none',koroad:!!env.KOROAD_API_KEY,taasWms:!!env.KOROAD_API_KEY&&!!env.KAKAO_REST_API_KEY,its:!!env.ROAD_API_KEY,safetydata:!!env.SAFETYDATA_API_KEY,weather:true,kma:!!env.KMA_API_KEY,roadRisk:!!env.KMA_API_KEY,safemap:!!env.SAFEMAP_API_KEY,gk2a:!!env.KMA_API_KEY,road:false,terrain:false},voiceStorage:'암호화된 HttpOnly 쿠키 · 최대 30분'});
 if(created)result.headers.append('Set-Cookie',setCookie('sunny_session',await seal(session,secret,'session'),secure));return result;
 }
 // Short, fixed public test case: verify the real Kakao place-search and Mobility
 // directions, then KMA weather valid at a future route passing time.
 // Diagnostic requests use fixed inputs. Query strings cannot change provider requests.
 // No arbitrary user locations, credentials, or road geometry returned.
 if(path==='/api/preview-journey-smoke'&&req.method==='GET'){
  if(!['preview','production'].includes(env.VERCEL_ENV))return json(404,{error:'Deployment only'});
  const now=Date.now();
  if(previewJourneySmokeCache?.until>now)
   return json(200,{...previewJourneySmokeCache.value,cached:true});
  if(!limit('preview-journey-smoke',1))
   return json(429,{error:'Journey smoke check temporarily rate limited'});
  const result={case:'Seoul City Hall to Seoul Station public smoke route',
   timeChecked:new Date(now).toISOString(),testOnly:true,
   search:{status:'not_tested'},route:{status:'not_tested'},
   kma:{status:'not_tested'},mapSdk:{status:'not_tested'}};
  if(!env.KAKAO_REST_API_KEY){
   result.search.status='key_missing';result.route.status='key_missing';
  }else{
   const auth={Authorization:'KakaoAK '+env.KAKAO_REST_API_KEY};
   const direction=new URL('https://apis-navi.kakaomobility.com/v1/directions');
   direction.searchParams.set('origin','126.9780,37.5665');
   direction.searchParams.set('destination','126.9706,37.5547');
   direction.searchParams.set('priority','RECOMMEND');
   direction.searchParams.set('summary','false');
   const search=new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
   search.searchParams.set('query','서울역');search.searchParams.set('size','5');
   const checked=await Promise.allSettled([
    upstream(search.toString(),{headers:auth},fetcher),
    upstream(direction.toString(),{headers:auth},fetcher)
   ]);
   if(checked[0].status==='fulfilled'){
    const v=checked[0].value;const count=Array.isArray(v.documents)?v.documents.length:0;
    result.search={status:count>0?'received':'no_matches',matchCount:count};
   }else{
    result.search={status:'failed',providerStatus:checked[0].reason?.providerStatus||null};
   }
   if(checked[1].status==='fulfilled'){
    const routes=checked[1].value.routes;
    const candidate=Array.isArray(routes)?routes.find(r=>r.result_code===0):null;
    if(candidate){
     try{
      const route=routeSamples(candidate,now+5*60000);
      const seconds=route.rainPath.map(p=>p.seconds);
      const valid=route.distance>0&&route.duration>0&&
       route.rainPath.length>=2&&route.samples.length>=1&&
       seconds.every((x,i)=>Number.isFinite(x)&&x>=0&&(!i||x>=seconds[i-1]));
      result.route={status:valid?'received':'invalid_geometry',
       distanceMeters:Math.round(route.distance),
       durationSeconds:Math.round(route.duration),
       timedPoints:route.samples.length,geometryPoints:route.rainPath.length,
       etaValuesValid:route.samples.every(p=>Number.isFinite(Date.parse(p.eta)))};
     }catch{result.route={status:'route_geometry_unusable'};}
    }else result.route={status:'no_valid_route'};
   }else result.route={status:'failed',providerStatus:checked[1].reason?.providerStatus||null};
  }
  if(!env.KMA_API_KEY)result.kma={status:'key_missing'};
  else{
   try{
    const weather=await kmaWeather([
     {lat:37.5601,lng:126.9745,
      label:'Public route validation point',
      eta:new Date(now+2*3600000).toISOString()}
    ],env.KMA_API_KEY,fetcher,now);
    const sample=weather?.samples?.[0];
    result.kma={status:sample?.status==='forecast'?'received':'no_matching_forecast',
     source:weather?.provider||'kma',
     validTimePresent:!!sample?.forecast?.time,
     hasRainValue:sample?.forecast?.rain!==undefined||
      sample?.forecast?.rainLabel!==undefined||
      sample?.forecast?.precipitationType!==undefined};
   }catch{result.kma={status:'failed'};}
  }
  // Two public referrers, because the unique Vercel deployment URL is not
  // necessarily in the Kakao JavaScript key's registered Site Domains.
  // Never disclose the app key or raw SDK response.
  if(!env.KAKAO_JAVASCRIPT_KEY)result.mapSdk={status:'key_missing'};
  else{
   const sdkUrl=new URL('https://dapi.kakao.com/v2/maps/sdk.js');
   sdkUrl.searchParams.set('autoload','false');
   sdkUrl.searchParams.set('appkey',env.KAKAO_JAVASCRIPT_KEY);
   const check=async referrer=>{
    try{
     const sdkResponse=await fetcher(sdkUrl.toString(),{
      redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{Referer:referrer}
     });
     const mime=(sdkResponse.headers.get('content-type')||'').toLowerCase();
     const body=(await sdkResponse.text()).slice(0,4500);
     const denied=/domain mismatched|disabled OPEN_MAP_AND_LOCAL service|invalid appkey|unauthorized/i.test(body);
     const javascript=/(javascript|ecmascript|text\/plain)/.test(mime);
     return {status:sdkResponse.ok&&javascript&&!denied?'received':'failed',
      http:sdkResponse.status,reason:denied?'domain_or_service_configuration':
       !sdkResponse.ok?'http_error':!javascript?'not_javascript':null};
    }catch{return {status:'unavailable'};}
   };
   const checks=await Promise.all([
    check(origin+'/'),
    check('https://sunny-sai-preview.vercel.app/'),
    check('https://sunny-sai.vercel.app/')
   ]);
   result.mapSdk={currentDomain:env.VERCEL_ENV==='production'?checks[0]:checks[1],
    deployedUrl:checks[0],fixedPreviewAlias:checks[1],
    originalDomain:checks[2]};
  }
  previewJourneySmokeCache={until:now+10*60000,value:result};
  return json(200,{...result,cached:false});
 }
 // On-demand fixed route diagnostics. No credentials, user GPS or raw path returned.
 if(path==='/api/pedestrian-route-diagnostic'&&req.method==='GET'){
  if(!['preview','production'].includes(env.VERCEL_ENV))return json(404,{error:'Deployment only'});
  const now=Date.now();
  if(!env.TMAP_API_KEY)return json(200,await probePedestrianRoute({key:null,kakaoFallback:!!env.KAKAO_REST_API_KEY,now}));
  if(pedestrianRouteDiagnosticCache?.until>now)
   return json(200,{...pedestrianRouteDiagnosticCache.value,cached:true});
  if(!limit('pedestrian-route-diagnostic-global',2))
   return json(429,{error:'도보 경로 API 연결 검사는 잠시 후 다시 진행해주세요.'});
  const value=await probePedestrianRoute({key:env.TMAP_API_KEY,fetcher,now});
  pedestrianRouteDiagnosticCache={until:now+10*60000,value};
  return json(200,{...value,cached:false});
 }
 // Two fixed preview-only demonstrations verify actual provider routes, not user GPS.
 // No query parameters, raw path geometry, or server credentials are returned.
 if(path==='/api/demo-driving-diagnostic'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  if(new URL(req.url).search)return json(400,{error:'Fixed inputs only'});
  const now=Date.now();
  if(demoDrivingDiagnosticCache?.until>now)return json(200,{...demoDrivingDiagnosticCache.data,cached:true});
  if(!limit('demo-driving-diagnostic-global',1))return json(429,{error:'Driving diagnostics rate limited'});
  const out={checkedAt:new Date(now).toISOString(),provider:'Kakao Mobility',testOnly:true,
   initial:{status:'not_tested'},warning:{status:'not_tested'},detour:{status:'not_tested'},
   caution:'특보는 가상이며 3km 이격은 한 위험 지점에 대한 직선 거리입니다. 위험 도로 전체의 안전을 입증하지 않습니다.'};
  if(!env.KAKAO_REST_API_KEY)out.initial={status:'key_missing'};
  else{
   const fetchRoad=async(from,to,stops=[])=>{
    const url=new URL('https://apis-navi.kakaomobility.com/v1/directions');
    url.searchParams.set('origin',from.lng+','+from.lat);
    url.searchParams.set('destination',to.lng+','+to.lat);
    if(stops.length)url.searchParams.set('waypoints',stops.map(p=>p.lng+','+p.lat).join('|'));
    url.searchParams.set('priority','RECOMMEND');url.searchParams.set('summary','false');
    const data=await upstream(url.toString(),{headers:{Authorization:'KakaoAK '+env.KAKAO_REST_API_KEY}},fetcher);
    const found=data.routes?.find(x=>x.result_code===0);
    if(!found)throw Error('Kakao route unavailable');
    return {...routeSamples(found,now),mode:'driving',travelMode:'driving'};
   };
   try{
    const main=await fetchRoad(DEMO_SEOUL_BUSAN.origin,DEMO_SEOUL_BUSAN.destination);
    out.initial={status:'received',distanceMeters:Math.round(main.distance),
     durationSeconds:Math.round(main.duration),geometryPoints:main.rainPath.length,
     travelMode:main.travelMode,forcedWaypoints:false};
    try{
     out.initial.events=makeDemoScenario(main).hazards.map(h=>({kind:h.kind,label:h.label,fictional:true,onActualRoad:true}));
    }catch{out.initial.eventStatus='unable_to_place';}
    try{
     const timing=demoBreakingTiming(main),pos=demoPointAtSeconds(main.rainPath,timing.triggerSeconds);
     const hazard={lat:timing.point.lat,lng:timing.point.lng};
     out.warning={status:'found',distanceFromGumiMeters:Math.round(timing.cityDistanceMeters),
      leadMeters:Math.round(demoDistanceMeters(main.rainPath,timing.triggerSeconds,timing.seconds)),
      triggerPercent:Math.round(timing.triggerPercent*10)/10};
     const candidates=await Promise.allSettled(DEMO_DETOUR_CANDIDATES.map(async candidate=>({
      candidate,route:await fetchRoad(pos,DEMO_SEOUL_BUSAN.destination,candidate.waypoints)
     })));
     const good=candidates.filter(c=>c.status==='fulfilled').map(c=>c.value);
     const chosen=selectOptimalDemoDetour(good,hazard);
     out.detour={status:chosen?'eligible_candidate':'none_eligible',requested:candidates.length,
      received:good.length,eligible:good.filter(c=>!!selectOptimalDemoDetour([c],hazard)).length,
      chosen:chosen?{id:chosen.candidate.id,clearanceMeters:Math.round(chosen.clearance),
       distanceMeters:Math.round(chosen.route.distance),durationSeconds:Math.round(chosen.route.duration)}:null};
    }catch{
     out.warning={status:'not_on_default_route',reason:'기본 카카오 경로의 구미 약 30km 전 사건 시점을 확인하지 못했습니다.'};
     out.detour={status:'not_tested'};
    }
   }catch{out.initial={status:'provider_unavailable'};}
  }
  demoDrivingDiagnosticCache={until:now+10*60000,data:out};
  return json(200,{...out,cached:false});
 }
 if(path==='/api/demo-walking-diagnostic'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  if(new URL(req.url).search)return json(400,{error:'Fixed inputs only'});
  const now=Date.now();
  if(demoWalkingDiagnosticCache?.until>now)return json(200,{...demoWalkingDiagnosticCache.data,cached:true});
  if(!limit('demo-walking-diagnostic-global',1))return json(429,{error:'Walking diagnostics rate limited'});
  const out={checkedAt:new Date(now).toISOString(),provider:'TMAP',testOnly:true,
   initial:{status:'not_tested'},heat:{status:'not_tested'},shelter:{status:'not_tested',facilityVerified:false},
   caution:'무더위 이벤트는 가상이며, 목적지 좌표는 무더위쉼터의 실제 시설 및 운영 여부를 검증하지 않았습니다.'};
  if(!env.TMAP_API_KEY)out.initial={status:'key_missing'};
  else{
   try{
    const main=await tmapWalkingRoute(WALK_DEMO.origin,WALK_DEMO.destination,now,env.TMAP_API_KEY,fetcher,'BROAD_FIRST');
    validateWalkingDemoRoute(main);
    const risks=makeWalkingDemoScenario(main).hazards;
    const heat=makeWalkingDemoBreakingWarning(main);
    const current=demoPointAtSeconds(main.rainPath,main.duration*WALK_DEMO_TRIGGER/100);
    out.initial={status:'received',travelMode:main.travelMode,provider:main.provider,
     distanceMeters:Math.round(main.distance),durationSeconds:Math.round(main.duration),
     geometryPoints:main.rainPath.length,risks:risks.map(h=>h.kind),
     facilities:(main.facilities||[]).reduce((o,f)=>(o[f.kind]=(o[f.kind]||0)+1,o),{})};
    out.heat={status:'on_tmap_route',triggerPercent:WALK_DEMO_TRIGGER,
     warningLeadMeters:Math.round(demoDistanceMeters(main.rainPath,main.duration*WALK_DEMO_TRIGGER/100,heat.seconds))};
    try{
     const next=await tmapWalkingRoute(current,WALK_DEMO_SHELTER,now,env.TMAP_API_KEY,fetcher,'BROAD_FIRST');
     out.shelter={status:next.provider==='TMAP'&&next.travelMode==='walking'?'pedestrian_reroute_received':'invalid_provider',
      travelMode:next.travelMode,provider:next.provider,
      distanceMeters:Math.round(next.distance),durationSeconds:Math.round(next.duration),
      geometryPoints:next.rainPath.length,facilityVerified:false};
    }catch{out.shelter={status:'tmap_route_unavailable',facilityVerified:false};}
   }catch{out.initial={status:'tmap_route_unavailable'};}
  }
  demoWalkingDiagnosticCache={until:now+10*60000,data:out};
  return json(200,{...out,cached:false});
 }
 // Fixed Seoul/Busan/Daejeon tests; no arbitrary locations, no secrets in response.
 if(path==='/api/pedestrian-national-diagnostic'&&req.method==='GET'){
  if(!['preview','production'].includes(env.VERCEL_ENV))return json(404,{error:'Deployment only'});
  if(new URL(req.url).search)return json(400,{error:'테스트 지역은 서버에서 고정합니다.'});
  const now=Date.now();
  if(pedestrianNationalDiagnosticCache?.until>now)
   return json(200,{...pedestrianNationalDiagnosticCache.value,cached:true});
  if(!limit('pedestrian-national-diagnostic-global',1))
   return json(429,{error:'전국 도보 API 진단 호출량 제한 · 잠시 후 다시 시도해주세요.'});
  const value=await probeNationalPedestrianRoutes({key:env.TMAP_API_KEY,fetcher,now});
  pedestrianNationalDiagnosticCache={until:now+20*60000,value};
  return json(200,{...value,cached:false});
 }
 // Preview-only fixed test case; no query-controlled region, no secrets or raw provider output.
 if(path==='/api/taas-approved-diagnostic'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  if(new URL(req.url).search)return json(400,{error:'고정 시험 구간만 확인할 수 있습니다.'});
  if(!limit('taas-approved-diagnostic',1))return json(429,{error:'TAAS 진단 호출량 제한'});
  const [wms,highway]=await Promise.all([
   probeTaasPedestrianWms(env.KOROAD_API_KEY,fetcher),
   probeTaasHighway(env.KOROAD_API_KEY,fetcher)]);
  return json(200,{wms,highway,source:'한국도로교통공단 TAAS',riskAction:'diagnostic-only'});
 }
 // Fixed 2024 Seoul Jung-gu historical pedestrian crash clusters.
 // No arbitrary coordinates or credentials accepted in request. Never called until layer is enabled.
 if(path==='/api/koroad-pedestrian-hotspots'&&req.method==='GET'){
  if(new URL(req.url).search)return json(400,{error:'조회 조건을 임의로 변경할 수 없습니다.'});
  if(!env.KOROAD_API_KEY)return json(200,{status:'missing',items:[],reason:'KOROAD_API_KEY 미설정'});
  const now=Date.now();
  if(koroadPedestrianCache?.until>now)return json(200,{...koroadPedestrianCache.value,cached:true});
  if(!limit('koroad-junggu-pedestrian',2))return json(429,{error:'기관 조회 횟수 제한 · 잠시 후 다시 확인하세요.'});
  const value=await fetchKoroadPedestrianHotspots(env.KOROAD_API_KEY,fetcher);
  if(['received','empty'].includes(value.status))koroadPedestrianCache={until:now+15*60000,value};
  return json(200,{...value,cached:false});
 }
 // No session secrets/keys or raw hazard locations emitted.
 // A successful API response is NOT proof that a route-specific alert is valid.
 if(path==='/api/route-layer-feasibility'&&req.method==='GET'){
  if(!['preview','production'].includes(env.VERCEL_ENV))return json(404,{error:'Deployment only'});
  const now=Date.now();
  if(routeLayerFeasibilityCache?.until>now)
   return json(200,{...routeLayerFeasibilityCache.value,previewOnly:env.VERCEL_ENV==='preview',cached:true});
  if(!limit('route-layer-feasibility',2))
   return json(429,{error:'Provider feasibility probe rate limited'});
  const value=await checkRouteLayerFeasibility({
   kmaKey:env.KMA_API_KEY,safemapKey:env.SAFEMAP_API_KEY,fetcher});
  routeLayerFeasibilityCache={until:now+15*60000,value};
  return json(200,{...value,previewOnly:env.VERCEL_ENV==='preview',cached:false});
 }
 // Preview-only diagnostic for comparing the documented minimal Safemap WMS request
 // with the previous custom request. Never exposes image, key, provider URL or data.
 if(path==='/api/flood-wms-variants'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  if(new URL(req.url).search)return json(400,{error:'No additional parameters supported'});
  if(!limit('flood-wms-variants',1))return json(429,{error:'WMS diagnostics rate limited'});
  const result=await checkFloodWmsVariants(env.SAFEMAP_API_KEY,fetcher);
  return json(200,result);
 }
 // One-off safe test for a nationwide georeferenced KMA RN1 5km raster.
 if(path==='/api/rain-grid-probe'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  const now=Date.now();
  if(rainGridProbeCache&&rainGridProbeCache.until>now)
   return json(200,{...rainGridProbeCache.value,cached:true});
  if(!limit('rain-grid-probe-global',1))return json(429,{error:'요청 횟수 제한'});
  const value=await probeRainGrid(env.KMA_API_KEY,fetcher,now);
  rainGridProbeCache={until:now+15*60000,value};
  return json(200,{...value,cached:false});
 }
 // Real 4-frame diagnostic: uses exactly the same grid loader as the map.
 // No mock rain, credentials, raw provider URL, or full grid is exposed here.
 if(path==='/api/rain-grid-diagnostic'&&req.method==='GET'){
  if(!['preview','production'].includes(env.VERCEL_ENV))return json(404,{error:'Deployment only'});
  if(!env.KMA_API_KEY)return json(503,{error:'기상청 인증 미설정'});
  const now=Date.now();
  if(rainGridDiagnosticCache&&rainGridDiagnosticCache.until>now)
   return json(200,{...rainGridDiagnosticCache.value,cached:true});
  if(!limit('rain-grid-diagnostic',2))return json(429,{error:'강수예보 진단 요청 횟수 제한'});
  const results=await Promise.all([0,1,2,3].map(async lead=>{
   try{
    const data=await nationalRainGrid(lead,env.KMA_API_KEY,fetcher,now);
    return {lead,status:'received',issuedAt:data.issuedAt,validTime:data.validTime,
     valid:data.valid,missing:data.missing,zero:data.zero,wetCells:data.cells.length,
     maxRain:data.cells.length?Math.max(...data.cells.map(c=>c[2])):0};
   }catch(e){return {lead,status:'unavailable',errorType:e.status||502,reception:e.reception};}
  }));
  const value={source:'기상청 전국 5km 초단기 RN1 강수예보',checkedAt:new Date(now).toISOString(),
   results,caption:'실제 예보 자료 통계이며 미조회/결측은 무강수가 아닙니다.'};
  rainGridDiagnosticCache={until:now+12*60000,value};
  return json(200,{...value,cached:false});
 }
 // Inspect KMA's official radar imagery-without-basemap metadata; no raw URL returned.
 if(path==='/api/radar-transparent-probe'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  const q=new URL(req.url).searchParams,tm=q.get('tm')||'';
  if([...q.keys()].some(k=>k!=='tm')||q.getAll('tm').length!==1||
    !/^\d{12}$/.test(tm))return json(400,{error:'Invalid observation timestamp'});
  if(!env.KMA_API_KEY)return json(503,{error:'KMA radar key unavailable'});
  const cached=radarTransparentProbeCache.get(tm),now=Date.now();
  if(cached?.until>now)return json(200,{...cached.data,cached:true});
  if(!limit('radar-transparent-probe',2))return json(429,{error:'Radar requests limited'});
  const data=await inspectTransparentRadar(env.KMA_API_KEY,tm,fetcher);
  radarTransparentProbeCache.set(tm,{data,until:now+10*60000});
  if(radarTransparentProbeCache.size>8)radarTransparentProbeCache.delete(radarTransparentProbeCache.keys().next().value);
  return json(200,{...data,cached:false});
 }
 // Read only the prefix of KMA's official HSR lat/lon grid to calibrate LCC.
 if(path==='/api/radar-georef-probe'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  if(new URL(req.url).search)return json(400,{error:'Parameters not supported'});
  if(!limit('radar-georef-probe',2))return json(429,{error:'Geolocation probe limited'});
  const result=await Promise.all(['lon','lat'].map(a=>probeRadarGeolocation(env.KMA_API_KEY,a,fetcher)));
  return json(200,{product:'KMA HSR official lat/lon 500m',points:result});
 }
 // Analyze official original RGBA transparency/colored pixels before map overlay.
 if(path==='/api/radar-history-alpha'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  if(new URL(req.url).search)return json(400,{error:'No extra parameters'});
  if(!limit('radar-history-alpha',2))return json(429,{error:'Radar alpha probe limit'});
  try{
   const img=await getRadarImage(env.KMA_API_KEY,'case',fetcher);
   return json(200,{timeKst:img.metadata.timeKst,
    transparency:pngInfo(img.bytes)});
  }catch(e){return json(502,{error:'Radar RGBA pixel analysis failed',
   reason:String(e.message||'error').slice(0,90)});}
 }
 // Diagnostic transport for ONE historical KMA HSR PNG. Never accepts arbitrary source URLs.
 // Preview-only and rate-limited. A real public weather observation, no API credentials.
 if(path==='/api/radar-history-sample'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  if(new URL(req.url).search)return json(400,{error:'Parameters not supported'});
  if(!limit('radar-history-sample',3))return json(429,{error:'Historical radar sample rate limit'});
  try{
   const img=await getRadarImage(env.KMA_API_KEY,'case',fetcher);
   if(img.bytes.length>120000)return json(502,{error:'Historical image exceeds diagnostic limit'});
   return json(200,{
    source:'KMA HSR historical no-basemap PNG',historical:true,
    ...visibleRadarMetadata(img.metadata),width:img.width,height:img.height,
    rgba:img.colorType===6,
    pngBase64:btoa(String.fromCharCode(...img.bytes))
   },{'Cache-Control':'private,max-age=120'});
  }catch(e){return json(502,{error:'Historical HSR original image unavailable'});}
 }
 // Verify consecutive historical 10-minute frames from the real KMA provider.
 // Reports timestamps/opaque pixel counts only; no credentials or invented imagery.
 if(path==='/api/radar-10min-diagnostic'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  if(new URL(req.url).search)return json(400,{error:'No query parameters allowed'});
  if(!env.KMA_API_KEY)return json(503,{error:'KMA radar key unavailable'});
  const now=Date.now();
  if(radarIntervalProbeCache?.until>now)
   return json(200,{...radarIntervalProbeCache.value,cached:true});
  if(!limit('radar-10min-diagnostic',1))return json(429,{error:'Radar diagnostic rate limited'});
  const results=[];
  for(const frame of [0,1,2]){
   try{
    const img=await getRadarImage(env.KMA_API_KEY,'case',fetcher,now,frame);
    const summary=pngInfo(img.bytes);
    results.push({frame,observationKst:img.metadata.timeKst,status:'received',
     width:img.width,height:img.height,visibleRadarPixels:summary.coloredVisible});
   }catch(e){
    results.push({frame,status:'unavailable',reason:
     String(e.message||'Provider unavailable').slice(0,120)});
   }
  }
  const value={source:'KMA HSR/HSP radar transparent PNG',
   observationIntervalMinutes:10,historical:true,
   results,allReceived:results.every(x=>x.status==='received')};
  radarIntervalProbeCache={value,until:now+20*60000};
  return json(200,{...value,cached:false});
 }
 // Check an actual recent HSR frame without exposing credentials or image URLs.
 // This reports observation time and alpha pixels, not guessed live weather.
 if(path==='/api/radar-latest-diagnostic'&&req.method==='GET'){
  if(!['preview','production'].includes(env.VERCEL_ENV))return json(404,{error:'Deployment only'});
  if(!env.KMA_API_KEY)return json(503,{error:'KMA key not configured'});
  if(!limit('radar-latest-diagnostic',2))return json(429,{error:'Recent radar check rate limited'});
  try{
   const img=await getRadarImage(env.KMA_API_KEY,'latest',fetcher);
   const stats=pngInfo(img.bytes);
   return json(200,{status:'real_radar_received',
    observationKst:img.metadata.timeKst,
    provider:'KMA HSR',observationStepMinutes:10,
    safeReleaseLagMinutes:30,transparent:stats.transparent,
    radarColorPixels:stats.coloredVisible,width:stats.width,height:stats.height,
    projection:img.metadata.projection,providerBasemap:false});
  }catch(e){return json(502,{status:'radar_not_available',
   reason:String(e.message||'KMA radar unavailable').slice(0,130)});}
 }
 // Preview-only image preflight returns projection and PNG dimensions, not credentials.
 if(path==='/api/radar-overlay-preflight'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  if(new URL(req.url).search)return json(400,{error:'No query parameters allowed'});
  if(!limit('radar-overlay-preflight',2))return json(429,{error:'Radar preflight rate limited'});
  try{
   const img=await getRadarImage(env.KMA_API_KEY,'case',fetcher);
   return json(200,{state:'image_verified',...visibleRadarMetadata(img.metadata),
    width:img.width,height:img.height,colorType:img.colorType,bytes:img.bytes.byteLength});
  }catch(e){return json(502,{state:'unavailable',
   reason:/^(?:Radar|KMA|No valid|No KMA|Untrusted)/.test(String(e.message||''))?
    String(e.message).slice(0,125):'Upstream image not available'});}
 }
 // One real full-resolution KMA composite grid summary, available in preview only.
 // Returns statistics, never provider binary, credentials, or arbitrary upstream requests.
 if(path==='/api/radar-composite-stats'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  if(!env.KMA_API_KEY)return json(503,{error:'KMA radar key missing'});
  const q=new URL(req.url).searchParams,tm=q.get('tm')||'',cmp=q.get('cmp')||'PCPH';
  if([...q.keys()].some(k=>!['tm','cmp'].includes(k))||q.getAll('tm').length>1||
     q.getAll('cmp').length>1||(tm&&!/^\d{12}$/.test(tm))||!['HSR','PCPH'].includes(cmp))
   return json(400,{error:'Invalid observation time or product'});
  const id=cmp+':'+(tm||'latest'),now=Date.now(),hit=radarWholeGridSummaryCache.get(id);
  if(hit?.until>now)return json(200,{...hit.value,cached:true});
  if(!limit('radar-composite-stats',2))return json(429,{error:'Radar full-grid diagnostics rate limited'});
  try{
   const value=await summarizeRealRadar(env.KMA_API_KEY,cmp,fetcher,tm);
   radarWholeGridSummaryCache.set(id,{value,until:now+10*60000});
   if(radarWholeGridSummaryCache.size>8)radarWholeGridSummaryCache.delete(radarWholeGridSummaryCache.keys().next().value);
   return json(200,{...value,cached:false});
  }catch(e){const safe=/^(?:Radar |KMA |Empty radar)/.test(String(e.message||''))?String(e.message).slice(0,110):'Upstream radar request failed';return json(502,{error:'Radar binary grid unavailable or unverifiable',reason:safe,kind:e.status||502});}
 }
 // Permission-safe provider-format probe: no raw data, tokens, or image returned.
 if(path==='/api/radar-composite-diagnostic'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  const q=new URL(req.url).searchParams;
  if([...q.keys()].some(k=>k!=='tm')||q.getAll('tm').length>1||
     (q.has('tm')&&!/^\d{12}$/.test(q.get('tm')||'')))
   return json(400,{error:'허용되지 않는 레이더 조회 시각입니다.'});
  const tm=q.get('tm')||'',now=Date.now(),id=tm||'latest';
  if(radarCompositeProbeCache?.id===id&&radarCompositeProbeCache.until>now)
   return json(200,{...radarCompositeProbeCache.value,cached:true});
  if(!limit('radar-composite-diagnostic',3))
   return json(429,{error:'레이더 진단 재조회 제한'});
  const value=await radarCompositeDiagnostic(env.KMA_API_KEY,fetcher,tm);
  radarCompositeProbeCache={id,until:now+10*60000,value};
  return json(200,{...value,cached:false});
 }
 // Preview-only radar authorization probe. It exposes only sanitized status,
 // no provider image, response body, credential, or configurable URL parameters.
 if(path==='/api/radar-probe'&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview 전용 검사입니다.'});
  const now=Date.now();
  if(radarProbeCache&&now<radarProbeCache.expires)
   return json(200,{...radarProbeCache.value,cached:true});
  if(!limit('radar-probe-global',1))
   return json(429,{error:'레이더 검사 요청 횟수 제한 · 1분 후 다시 확인해주세요.'});
  const value=await checkRadarAccess(env.KMA_API_KEY,fetcher,now);
  radarProbeCache={expires:now+15*60000,value};
  return json(200,{...value,cached:false});
 }
 if(!session)return json(401,{error:'세션이 만료되었습니다. 페이지를 새로 열어주세요.'});
 // Read-only capability/credential-name inventory; never probes providers or returns keys.
 if(path==='/api/capability-catalog'&&req.method==='GET'){
  if(new URL(req.url).search)return json(400,{error:'조회 조건을 사용할 수 없습니다.'});
  return json(200,capabilityCatalog(env));
 }
 if(req.method!=='GET'&&req.headers.get('x-csrf-token')!==session.csrf)return json(403,{error:'요청을 확인하지 못했습니다.'});
 if(!limit(session.sid))return json(429,{error:'요청이 많습니다. 1분 뒤 다시 시도해주세요.'});
 const llmCookie=async()=>await unseal(cookie(req,'sunny_llm'),secret,'llm:'+session.sid+':'+uid);
 // Provider credentials remain on the server; cookies may select a server preset.
 const llmEnv=(provider=env.LLM_PROVIDER||'gemini')=>({provider,
  model:provider==='gemini'?(env.LLM_GEMINI_MODEL||((env.LLM_PROVIDER||'gemini')==='gemini'?env.LLM_MODEL:'')||'gemini-3.5-flash-lite'):env.LLM_MODEL||'',
  key:provider==='gemini'?(env.GEMINI_API_KEY||((env.LLM_PROVIDER||'gemini')==='gemini'?env.LLM_API_KEY:'')||''):
   env.LLM_PROVIDER==='compatible'?env.LLM_API_KEY||'':'',baseUrl:env.LLM_BASE_URL||''});
 const modeOf=config=>config?.mode||(!config?'off':config.provider==='gemini'?'gemini':/gpt-oss/.test(config.model||'')?'gpt-oss':'custom');
 const llmPreset=mode=>mode==='off'?null:mode==='gemini'?llmEnv('gemini'):
  mode==='gpt-oss'?llmEnv('compatible'):
  {provider:'compatible',model:env.LLM_CUSTOM_MODEL||'',key:env.LLM_CUSTOM_API_KEY||'',baseUrl:env.LLM_CUSTOM_BASE_URL||''};
 const llmConfig=personal=>personal?.mode==='off'?null:personal?.mode?
  {...(personal.server?llmPreset(personal.mode):personal),baseUrl:llmPreset(personal.mode)?.baseUrl||'',model:personal.model}:
  personal?.server?{...llmEnv(personal.provider),model:personal.model}:
  personal?{...personal,baseUrl:env.LLM_BASE_URL||''}:llmEnv();
 if(path==='/api/llm/status'&&req.method==='GET'){
  const personal=await llmCookie(),config=llmConfig(personal);
  return json(200,{mode:personal?.mode||modeOf(config),provider:config?.provider||null,model:config?.model||'',configured:Boolean(config?.key&&config?.model),
   connection:personal&&!personal.server?'temporary':'server',compatibleAvailable:Boolean(env.LLM_CUSTOM_BASE_URL),
   serverModels:['gemini','gpt-oss','custom'].map(mode=>{const c=llmPreset(mode);return {mode,provider:c.provider,model:c.model,configured:Boolean(c.key&&c.model&&(c.provider==='gemini'||c.baseUrl))};}),
   contract:'approved-sentence-selection-v1',caution:'키 등록과 실제 모델 응답 성공은 다릅니다.'});
 }
 if(path==='/api/llm/key'&&req.method==='DELETE')return json(200,{connected:false},{'Set-Cookie':setCookie('sunny_llm','',secure,0)});
 if(path==='/api/llm/key'&&req.method==='POST'){
  const input=await body(req);let config;const previous=await llmCookie();
  if(input.mode!==undefined&&!['off','gemini','gpt-oss','custom'].includes(input.mode))return json(400,{error:'지원하지 않는 설명 모델입니다.'});
  if(input.mode==='off'){
   const token=await seal({mode:'off',server:true,exp:session.exp},secret,'llm:'+session.sid+':'+uid);
   return json(200,{connected:false,mode:'off',verified:false},{'Set-Cookie':setCookie('sunny_llm',token,secure,Math.max(0,Math.floor((session.exp-Date.now())/1000)))});
  }
  const server=input.mode?llmPreset(input.mode):llmEnv(input.provider);
  const provider=input.mode?server.provider:input.provider;
  const reuse=previous?.provider===provider&&!previous.server&&(!input.mode||previous.mode===input.mode);
  const selectedKey=input.key||(reuse?previous.key:'')||server.key;
  const useServer=!input.key&&selectedKey===server.key;
  try{config=validateLLMConfig({provider,model:input.model||server.model,key:selectedKey,baseUrl:server.baseUrl});}
  catch{return json(400,{error:'모델 ID·API 키 또는 서버의 호환 API 설정을 확인해주세요.'});}
  const connection=useServer?{provider:config.provider,model:config.model,server:true,exp:session.exp}:
   {provider:config.provider,model:config.model,key:config.key,exp:session.exp};
  if(input.mode)connection.mode=input.mode;
  const token=await seal(connection,secret,'llm:'+session.sid+':'+uid);
  return json(200,{connected:true,provider:config.provider,model:config.model,verified:false},
   {'Set-Cookie':setCookie('sunny_llm',token,secure,Math.max(0,Math.floor((session.exp-Date.now())/1000)))});
 }
 if(path==='/api/llm/explain'&&req.method==='POST'){
  if(!limit('llm:'+session.sid,4)||!limit('llm-global',40))return json(429,{error:'설명 요청이 많습니다. 잠시 뒤 다시 시도해주세요.'});
  const input=await body(req),personal=await llmCookie();
  const config=llmConfig(personal);
  try{return json(200,await explainRisk({profile:input.profile,question:input.question,config,fetcher}));}
  catch{return json(400,{error:'지원하는 경로 위험판정 근거가 필요합니다.'});}
 }

 // 10-minute real HSR frames. All metadata is attached to the SAME PNG response,
 // preventing mismatches while playback switches observations.
 if(path==='/api/radar-overlay-frame'&&req.method==='GET'){
  if(!env.KMA_API_KEY)return json(503,{error:'KMA radar authentication missing'});
  const q=new URL(req.url).searchParams,mode=q.get('mode')||'case',frameText=q.get('frame')||'0';
  if([...q.keys()].some(k=>!['mode','frame'].includes(k))||
     q.getAll('mode').length>1||q.getAll('frame').length>1||
     !['case','latest','nearest'].includes(mode)||!/^[0-6]$/.test(frameText)||(mode==='nearest'&&frameText!=='0'))
   return json(400,{error:'Unsupported radar 10-minute observation frame'});
  if(!limit('radar-overlay-frames:'+session.sid,12)||!limit('radar-overlay-frames-global',150))
   return json(429,{error:'10-minute radar frame requests limited'});
  try{
   const now=Date.now();
   const key=env.KMA_API_KEY;
   let img;
   if(mode==='nearest'){
    // Probe the current slot through the normal publication-lag slot in parallel.
    const candidates=await Promise.allSettled([0,1,2,3].map(frame=>getRadarImage(key,mode,fetcher,now,frame)));
    img=candidates.find(candidate=>candidate.status==='fulfilled')?.value;
    if(!img)throw Error('KMA recent radar observation unavailable');
   }else img=await getRadarImage(key,mode,fetcher,now,Number(frameText));
   const {left,top,right,bottom}=img.metadata.coverage;
   return new Response(img.bytes,{status:200,headers:{
    'Content-Type':'image/png','Cache-Control':'private,max-age=90',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'X-Radar-Obs-Kst':img.metadata.timeKst,
    'X-Radar-Projection':img.metadata.projection,
    'X-Radar-Coverage':[left,top,right,bottom].join(','),
    'X-Radar-Frame':frameText,'X-Radar-Interval-Minutes':'10'
   }});
  }catch(e){
   const safe=String(e.message||'');
   return json(e.status===400?400:502,{error:/^(?:Radar|KMA|No valid|No KMA|Untrusted|Unsupported)/.test(safe)?
    safe.slice(0,130):'KMA 10-minute radar observation unavailable'});
  }
 }
 // KMA background-free HSR image: only enable in preview with verified metadata.
 if((path==='/api/radar-overlay-meta'||path==='/api/radar-overlay-image')&&req.method==='GET'){
  if(env.VERCEL_ENV!=='preview')return json(404,{error:'Preview only'});
  if(!env.KMA_API_KEY)return json(503,{error:'KMA radar authentication missing'});
  const params=new URL(req.url).searchParams,mode=params.get('mode')||'case';
  if([...params.keys()].some(k=>k!=='mode')||params.getAll('mode').length>1||
     !['case','latest'].includes(mode))
   return json(400,{error:'Unsupported radar view'});
  if(!limit('radar-overlay:'+session.sid,12))return json(429,{error:'Radar calls limited'});
  try{
   if(path==='/api/radar-overlay-meta'){
    const metadata=await getRadarImageMetadata(env.KMA_API_KEY,mode,fetcher);
    return json(200,visibleRadarMetadata(metadata),{'Cache-Control':'private,max-age=90'});
   }
   const img=await getRadarImage(env.KMA_API_KEY,mode,fetcher);
   return new Response(img.bytes,{status:200,headers:{
    'Content-Type':'image/png','Cache-Control':'private,max-age=90',
    'X-Content-Type-Options':'nosniff','X-Radar-Obs-Kst':img.metadata.timeKst,
    'X-Radar-Image-Width':String(img.width),'X-Radar-Image-Height':String(img.height)
   }});
  }catch(e){
   const safe=String(e.message||'');
   return json(e.status===400?400:502,{error:/^(?:Radar|KMA|No valid|No KMA|Untrusted|Unsupported)/.test(safe)?
    safe.slice(0,130):'KMA radar image or coordinate reference unavailable'});
  }
 }
 // Only authenticated sessions can stream real KMA imagery; image URLs contain no API key.
 // This is a provider-rendered map image, NOT a geo-registered Kakao overlay.
 if(path==='/api/radar-frame'&&req.method==='GET'){
  if(!env.KMA_API_KEY)return json(503,{error:'기상청 강수영상 인증 설정이 없습니다.'});
  const query=new URL(req.url).searchParams;
  if([...query.keys()].some(k=>k!=='lead'&&k!=='base')||query.getAll('lead').length!==1||query.getAll('base').length>1)
   return json(400,{error:'강수예측 시간만 선택할 수 있습니다.'});
  const lead=Number(query.get('lead'));
  if(!RADAR_LEADS.includes(lead))return json(400,{error:'지원하지 않는 강수예측 시간입니다.'});
  const base=query.get('base');
  if(base!==null&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:[0-5]0:00\.000Z$/.test(base)||
   !Number.isFinite(Date.parse(base))||Date.parse(base)>Date.now()||Date.parse(base)<Date.now()-7200000))
   return json(400,{error:'강수예측 기준 시각이 만료되었거나 올바르지 않습니다.'});
  if(!limit('radar-frame:'+session.sid,24)||!limit('radar-frame-global',90))
   return json(429,{error:'강수영상 조회가 많습니다. 잠시 후 다시 시도해주세요.'});
  try{
   const frame=await fetchRadarFrame(lead,env.KMA_API_KEY,fetcher,Date.now(),base);
   return new Response(frame.bytes,{status:200,headers:{
    'Content-Type':frame.mime,'Cache-Control':'private, max-age=60',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'X-Radar-Base-Time':frame.baseTime,
    'X-Radar-Requested-Valid-Time':frame.requestedValidTime,
    'X-Radar-Lead-Minutes':String(frame.lead)
   }});
  }catch(e){return json(e.status===400?400:e.status===503?503:502,
    {reception:e.reception,error:e.message?.startsWith('기상청')||e.message?.startsWith('해당 시각')?
     String(e.message).slice(0,160):'기상청 강수영상 조회 실패'});}
 }
 // Nationwide official rainfall forecast cells: valid KMA LCC coordinates, no provider basemap.
 if(path==='/api/rain-grid'&&req.method==='GET'){
  if(!env.KMA_API_KEY)return json(503,{error:'기상청 인증키가 설정되지 않았습니다.'});
  const params=new URL(req.url).searchParams;
  if(params.getAll('lead').length!==1||[...params.keys()].some(k=>k!=='lead')||
   !/^[0-5]$/.test(params.get('lead')||''))
   return json(400,{error:'0~5시간 예측시간 중 하나를 선택하세요.'});
  if(!limit('nation-rain:'+session.sid,8)||!limit('nation-rain-global',35))
   return json(429,{error:'전국 강수예보 호출 횟수 제한 · 잠시 후 재조회하세요.'});
  try{
   const data=await nationalRainGrid(Number(params.get('lead')),env.KMA_API_KEY,fetcher);
   return json(200,data,{'Cache-Control':'private,max-age=120'});
  }catch(e){return json(e.status===400?400:e.status===503?503:502,
   {reception:e.reception,error:e.message?.startsWith('기상청')||e.message?.startsWith('전국')||e.message?.startsWith('강수')?
    String(e.message).slice(0,160):'전국 강수예보를 확인하지 못했습니다.'});}
 }
 if(path==='/api/weather-warnings'&&req.method==='POST'){
  if(!env.KMA_API_KEY)return json(503,{error:'기상청 인증키 설정 필요'});
  if(!limit('weather-warnings:'+session.sid,6))return json(429,{error:'잠시 뒤 다시 조회하세요'});
  try{return json(200,await getActiveWarnings(env.KMA_API_KEY,fetcher));}
  catch(e){return json(502,{reception:e.reception,error:/^(?:기상청|기상특보)/.test(e.message)?e.message:'기상청 특보 조회 실패'});}
 }
 if(path==='/api/road-risk'&&req.method==='POST'){
  if(!env.KMA_API_KEY)return json(503,{error:'기상청 KMA_API_KEY 미설정 · 도로위험기상정보 조회 불가'});
  if(!limit('road-kma:'+session.sid,2)||!limit('road-kma-global',30))return json(429,{error:'도로위험정보 요청 횟수 제한 · 잠시 뒤 다시 조회하세요'});
  const {roadNum='all'}=await body(req);
  if(typeof roadNum!=='string'||!/^(all|001|012|015|020|025|027|030|035|045|050|055|251)$/.test(roadNum))return json(400,{error:'지원하는 노선번호를 선택하세요'});
  try{return json(200,await (roadNum==='all'?kmaAllRoadRisks(env.KMA_API_KEY,fetcher):kmaRoadRisk(roadNum,env.KMA_API_KEY,fetcher)));}
  catch(e){const status=e.status===400?400:e.status===503?503:502;
   return json(status,{reception:e.reception,error:String(e.message||'도로위험기상정보 응답 실패').slice(0,170)});}
 }
 if(path==='/api/map-forecast'&&req.method==='POST'){
  if(!env.KMA_API_KEY)return json(503,{error:'기상청 API 키가 프리뷰 서버에 설정되지 않았습니다.'});
  if(!limit('map-kma:'+session.sid,2))return json(429,{error:'격자 예보 반복 조회 제한 · 잠시 후 다시 시도해주세요.'});
  const {points}=await body(req);
  return json(200,await kmaMapForecast(points,env.KMA_API_KEY,fetcher));
 }
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
 if(path==='/api/satellite-map'&&req.method==='POST'){
  const {product,bounds:b}=await body(req);
  if(!['rr','ci','fog'].includes(product)||!b||!['west','east','south','north'].every(k=>Number.isFinite(b[k]))||b.west<123||b.east>133||b.south<32||b.north>40||b.west>=b.east||b.south>=b.north)return json(400,{error:'위성 종류와 지도 범위를 확인해주세요.'});
  if(!limit('satellite-map:'+session.sid,18))return json(429,{error:'위성 지도 조회 횟수 제한'});
  const frame=await loadSatelliteNumeric(env.KMA_API_KEY,product,{fetcher});
  return json(200,satelliteMapCells(frame,b));
 }
 if(path==='/api/satellite-route'&&req.method==='POST'){
  const {points}=await body(req);
  if(!Array.isArray(points)||points.length<2||points.length>96||points.some(p=>!coord(p)||!Number.isFinite(p.seconds)||p.seconds<0||p.seconds>172800))return json(400,{error:'유효한 경로 지점이 필요합니다.'});
  if(!limit('satellite-route:'+session.sid,3))return json(429,{error:'위성 경로 조회 횟수 제한'});
  const frames=await Promise.all(['rr','ci','fog'].map(product=>loadSatelliteNumeric(env.KMA_API_KEY,product,{fetcher})));
  const samples=frames.flatMap(f=>satelliteRouteValues(f,points));
  const results=frames.map(f=>({product:f.product,status:f.status,reason:f.reason||null,observationUTC:f.observationUTC||null,
   eligibleSamples:samples.filter(p=>p.product===f.product).length}));
  const count=results.filter(r=>r.status==='received').length;
  return json(200,{status:count===3?'received':count?'partial':'excluded',results,
   samples,caution:'위성 추정·탐지자료이며 실제 도로 침수·시정·통제 확인이 아닙니다.'});
 }
 // Real GK2A L2 satellite PNG: fixed product whitelist; never proxy arbitrary URLs.
 if((path==='/api/gk2a-layer-status'||path==='/api/gk2a-layer-image')&&req.method==='GET'){
  const u=new URL(req.url),product=u.searchParams.get('product');
  if([...u.searchParams.keys()].some(k=>k!=='product')||u.searchParams.getAll('product').length!==1||
    !['rr','ci','fog'].includes(product))return json(400,{error:'Unknown satellite product'});
  if(!limit('gk2a-layer:'+session.sid,10)||!limit('gk2a-layer-global',80))
   return json(429,{error:'Satellite request rate limited'});
  const result=await getSatelliteFrame(env.KMA_API_KEY,product,{fetcher});
  if(path==='/api/gk2a-layer-status')return json(200,satellitePublicMeta(result));
  if(result.status!=='received'||result.georeference!=='verified_ko_lcc_900')
   return json(422,{error:'Satellite source pixels not georeferenced; image output blocked'});
  return new Response(result.bytes,{status:200,headers:{'Content-Type':'image/png','Cache-Control':'private,max-age=60',
    'X-Content-Type-Options':'nosniff','X-GK2A-UTC':result.observationUTC}});
 }
 // ITS live event/traffic points scoped to a verified-shape route, with no provider credentials returned.
 if(path==='/api/its-route-context'&&req.method==='POST'){
  if(!env.ROAD_API_KEY)return json(200,{status:'missing',items:[],reason:'ROAD_API_KEY 미설정'});
  if(!limit('its-route-context:'+session.sid,4)||!limit('its-route-context-global',30))
   return json(429,{error:'ITS 교통정보 조회 횟수 제한 · 잠시 후 다시 시도해주세요.'});
  const {points}=await body(req);
  if(!validateItsPoints(points))return json(400,{error:'국내 경로좌표 2~24개를 확인해주세요.'});
  return json(200,await fetchItsRouteContext(env.ROAD_API_KEY,points,fetcher));
 }
 // REST accident hotspots for 2024: no WMS, verified coordinates only.
 if(path==='/api/taas-rest-map'&&req.method==='POST'){
  if(!env.KOROAD_API_KEY||!env.KAKAO_REST_API_KEY)
   return json(200,{status:'missing',items:[],reason:'TAAS 또는 카카오 인증키 미설정'});
  if(!limit('taas-rest-map:'+session.sid,6)||!limit('taas-rest-map-global',60))
   return json(429,{error:'TAAS REST 요청 제한'});
  const {kind,bounds}=await body(req);
  if(!['pedestrian','child','elderly'].includes(kind)||!validTaasMapBounds(bounds))
   return json(400,{error:'지도 영역 또는 자료 유형 확인 필요'});
  return json(200,await fetchTaasRestMap({koroadKey:env.KOROAD_API_KEY,
   kakaoKey:env.KAKAO_REST_API_KEY,kind,bounds,fetcher}));
 }
 // TAAS historical foot-traffic layers: authenticated WMS PNG proxy, no authKey in browser.
 if(path==='/api/taas-pedestrian-map'&&req.method==='POST'){
  if(!env.KOROAD_API_KEY||!env.KAKAO_REST_API_KEY)return json(503,{error:'TAAS 및 지도 위치 인증키 미설정'});
  const {kind,bounds}=await body(req);
  if(!PEDESTRIAN_WMS_KINDS[kind]||!validTaasMapBounds(bounds))
   return json(400,{error:'지원하지 않는 TAAS 레이어 또는 지도 확대 범위'});
  if(!limit('taas-wms:'+session.sid,12)||!limit('taas-wms-global',80))
   return json(429,{error:'TAAS 과거 사고지도 조회 횟수 제한'});
  const result=await fetchTaasMapImage({key:env.KOROAD_API_KEY,kakaoKey:env.KAKAO_REST_API_KEY,
   kind,bounds,fetcher});
  if(result.status!=='received')return json(502,{error:result.reason||'TAAS 지도이미지 수신 실패'});
  return new Response(result.bytes,{status:200,headers:{
   'Content-Type':'image/png','Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff',
   'Referrer-Policy':'no-referrer','X-TAAS-Year':'2024',
   'X-TAAS-Region-Code':result.districtCode,'X-TAAS-Coverage':'single-district',
   'X-TAAS-Layer':kind
  }});
 }
 // Route-local 2024 historical evidence: validated legal-dong districts, not live accidents.
 if(path==='/api/pedestrian-route-context'&&req.method==='POST'){
  if(!env.KOROAD_API_KEY||!env.KAKAO_REST_API_KEY)
   return json(200,{status:'missing',items:[],year:'2024',
    reason:'사고다발지역 조회에 필요한 KOROAD·카카오 서버 인증이 준비되지 않았습니다.'});
  if(!limit('pedestrian-route-context:'+session.sid,3))
   return json(429,{error:'보행 위험정보 조회 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.'});
  const {points,path:historyPath}=await body(req);
  if(!Array.isArray(points)||points.length<2||points.length>6||points.some(p=>!coord(p)))
   return json(400,{error:'경로 위치 2~6개를 확인해주세요.'});
  if(historyPath!==undefined&&(!Array.isArray(historyPath)||historyPath.length<2||historyPath.length>6000||historyPath.some(p=>!coord(p))))
   return json(400,{error:'보행 경로 형상을 확인해주세요.'});
  const result=await fetchRoutePedestrianHistory({points,path:historyPath,koroadKey:env.KOROAD_API_KEY,
   kakaoKey:env.KAKAO_REST_API_KEY,fetcher});
  return json(200,result);
 }
 if(path==='/api/route'&&req.method==='POST'){if(!env.KAKAO_REST_API_KEY&&!env.TMAP_API_KEY)return json(503,{error:'운영자의 차량 또는 도보 길찾기 API 인증키 연결이 필요합니다.'});const {origin:start,destination,departure,waypoints=[],travelMode='driving',walkingPriority='BROAD_FIRST'}=await body(req);if(!['driving','walking'].includes(travelMode))return json(400,{error:'이동수단은 차량 또는 도보 중 선택해주세요.'});if(!coord(start)||!coord(destination))return json(400,{error:'대한민국 내 출발지와 목적지를 다시 선택해주세요.'});if(!Array.isArray(waypoints)||waypoints.length>5||waypoints.some(p=>!coord(p)))return json(400,{error:'경유지는 대한민국 내 위치로 최대 5개까지 지정해주세요.'});const time=Date.parse(departure);if(!Number.isFinite(time)||time<Date.now()-600000||time>Date.now()+86400000)return json(400,{error:'출발시각은 지금부터 24시간 이내로 선택해주세요.'});if(travelMode==='walking'){
 if(!WALK_ROUTE_MODES.includes(walkingPriority))return json(400,{error:'도보 경로 옵션을 확인해주세요.'});
 // Prefer the separately registered TMAP pedestrian route product. Never
 // silently fall back to a paid provider when a configured TMAP call fails.
 if(env.TMAP_API_KEY){
  if(waypoints.length)return json(422,{error:'TMAP 도보 길찾기의 경유지 기능은 아직 지원하지 않습니다. 경유지를 해제해주세요.'});
  return json(200,await tmapWalkingRoute(start,destination,time,env.TMAP_API_KEY,fetcher,walkingPriority));
 }
 if(!env.KAKAO_REST_API_KEY)return json(503,{error:'도보 길찾기 API 키가 등록되지 않았습니다. TMAP_API_KEY를 설정해주세요.'});
 // Legacy Kakao walking API is used only when TMAP is not configured.
 // Dedicated Kakao Maps routing API, not Kakao Mobility vehicle directions.
 const url=walkingQuery(start,destination,waypoints,walkingPriority);
 const d=await upstream(url.toString(),{headers:{Authorization:'KakaoAK '+env.KAKAO_REST_API_KEY}},fetcher);
 return json(200,normalizeWalkingRoute(d,time,{origin:start,destination}));
}
if(!env.KAKAO_REST_API_KEY)return json(503,{error:'운영자의 카카오 차량 길찾기 REST 키 연결이 필요합니다.'});
const future=time>Date.now()+900000;const url=new URL('https://apis-navi.kakaomobility.com/v1/'+(future?'future/directions':'directions'));url.searchParams.set('origin',start.lng+','+start.lat);url.searchParams.set('destination',destination.lng+','+destination.lat);if(waypoints.length)url.searchParams.set('waypoints',waypoints.map(p=>p.lng+','+p.lat).join('|'));url.searchParams.set('priority','RECOMMEND');url.searchParams.set('summary','false');if(future){const kst=new Date(time+9*3600000).toISOString();url.searchParams.set('departure_time',kst.slice(0,10).replaceAll('-','')+kst.slice(11,16).replaceAll(':',''));}const d=await upstream(url.toString(),{headers:{Authorization:'KakaoAK '+env.KAKAO_REST_API_KEY}},fetcher);const r=d.routes?.find(r=>r.result_code===0);if(!r)return json(422,{error:'차량 경로를 찾지 못했습니다. 장소와 출발시각을 확인해주세요.'});return json(200,{...routeSamples(r,time),travelMode:'driving',mode:'driving'});}
 if(path==='/api/road-weather'&&req.method==='POST'){
  const input=await body(req);if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)return json(400,{error:'조회 인자가 필요하지 않습니다.'});
  return json(200,await fetchRoadWeather(env.KMA_API_KEY,fetcher));
 }
 if(path==='/api/weather'&&req.method==='POST'){const {samples,provider='auto'}=await body(req);if(!['auto','kma','kma-ultra','open-meteo'].includes(provider))return json(400,{error:'기상 자료 제공자를 확인해주세요.'});if(!Array.isArray(samples)||!samples.length||samples.length>MAX_ROUTE_WEATHER_SAMPLES||samples.some(p=>!coord(p)||!Number.isFinite(Date.parse(p.eta))||Math.abs(Date.parse(p.eta)-Date.now())>2*86400000))return json(400,{error:'경로와 예보시각을 확인해주세요.'});if(['kma','kma-ultra'].includes(provider)&&!env.KMA_API_KEY)return json(503,{error:'기상청 인증키 설정 대기: 운영 프로젝트의 KMA_API_KEY를 등록하고 재배포해주세요.'});if(['kma','kma-ultra'].includes(provider)||(provider==='auto'&&env.KMA_API_KEY))return json(200,await kmaWeather(samples,env.KMA_API_KEY,fetcher,Date.now(),provider==='kma-ultra',0,true));const results=await Promise.all(samples.map(async p=>{try{const url=new URL('https://api.open-meteo.com/v1/forecast');Object.entries({latitude:p.lat,longitude:p.lng,hourly:'temperature_2m,precipitation,wind_gusts_10m,visibility',forecast_days:3,timeformat:'unixtime',timezone:'GMT',wind_speed_unit:'ms'}).forEach(([k,v])=>url.searchParams.set(k,String(v)));const data=await upstream(url.toString(),{},fetcher);const forecast=matchForecast(data,p.eta);return{...p,forecast,status:forecast?'forecast':'unavailable'};}catch{return{...p,forecast:null,status:'unavailable'};}}));return json(200,{samples:results,provider:'open-meteo',source:'Open-Meteo · 모델 예보',sourceUrl:'https://open-meteo.com/',license:'CC BY 4.0',fetchedAt:new Date().toISOString(),caution:'시간당 강수량·모델 격자 예보이며 실제 도로상태나 공식 특보가 아닙니다.'});}
 return json(404,{error:'지원하지 않는 요청입니다.'});
 }catch(e){const providerError=e.providerStatus?`외부 서비스가 요청을 거절했습니다 (HTTP ${e.providerStatus}). 운영자의 API 키 종류·사용 권한·호출 제한을 확인해주세요.`:e.name==='TimeoutError'?'외부 서비스 응답 시간이 초과됐습니다. 잠시 후 다시 시도해주세요.':null;return json(e.status||502,{error:e.status===413?'입력 크기를 초과했습니다.':providerError||'요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'});}
}

