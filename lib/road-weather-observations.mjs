// KMA CCTV-derived weather classes, not video or measured visibility/rainfall.
export const ROAD_WEATHER_SOURCE='기상청 CCTV 도로날씨';
export const validPoint=p=>Number.isFinite(p?.lat)&&p.lat>=32&&p.lat<=40&&Number.isFinite(p?.lng)&&p.lng>=123&&p.lng<=133;
const stamp=t=>new Date(t+9*3600000).toISOString().slice(0,16).replace(/[-:T]/g,'');
export function parseRoadWeather(text,{now=Date.now()}={}){
 if(!text.includes('#START7777')||!text.includes('#7777END'))return {status:'invalid_response',items:[]};
 const latest=new Map();let rows=0,stale=0;
 for(const line of text.split(/\r?\n/)){
  if(!/^\d{12},/.test(line))continue;
  const c=line.split(',').map(s=>s.trim());if(c.length<10)continue;rows++;
  const [tm,id,name,lat,lng]=c;
  const iso=tm.replace(/^(....)(..)(..)(..)(..)$/,'$1-$2-$3T$4:$5:00+09:00'),time=Date.parse(iso);
  const p={id,name:name.slice(0,80),lat:Number(lat),lng:Number(lng),observedAt:iso,
   fog:Number(c[7]),rain:Number(c[8]),snow:Number(c[9]),provider:ROAD_WEATHER_SOURCE};
  if(!validPoint(p)||!/^\w{1,20}$/.test(id)||!Number.isFinite(time)||time>now)continue;
  if(now-time>30*60000){stale++;continue;}
  if(![0,11,12,13].includes(p.fog)||![0,21,22,23].includes(p.rain)||![0,31,32,33].includes(p.snow))continue;
  if(!latest.has(id)||Date.parse(latest.get(id).observedAt)<time)latest.set(id,p);
 }
 return {status:latest.size?'received':rows?'stale':'empty',items:[...latest.values()],rawRows:rows,staleRows:stale,
  source:ROAD_WEATHER_SOURCE,checkedAt:new Date(now).toISOString(),
  caution:'일부 고속도로 CCTV 기반 날씨 분류 · 관측지점 인근 참고 · 강수량·적설량·시정 실측 아님'};
}
const caches=new WeakMap();
export async function fetchRoadWeather(key,fetcher=fetch,now=Date.now()){
 if(!key)return {status:'missing',items:[]};
 let cache=caches.get(fetcher);if(!cache)caches.set(fetcher,cache=new Map());
 const hit=cache.get(key);if(hit?.until>now)return hit.value;
 const url=new URL('https://apihub.kma.go.kr/api/typ01/url/cctv_ana_info.php');
 url.search=new URLSearchParams({tm1:stamp(now-65*60000),tm2:stamp(now-5*60000),eqp:'0',disp:'0',help:'0',authKey:key});
 try{
  const r=await fetcher(url.toString(),{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok){await r.body?.cancel();return{status:'failed',http:r.status,items:[]};}
  const bytes=await r.arrayBuffer();if(bytes.byteLength>2000000)return{status:'oversized',items:[]};
  const text=new TextDecoder('euc-kr').decode(bytes),value=parseRoadWeather(text,{now});
  if(cache.size>4)cache.clear();cache.set(key,{until:now+120000,value});return value;
 }catch{return{status:'failed',items:[]};}
}
