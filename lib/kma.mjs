// KMA API Hub typ02. Credentials are read only by the server.
const endpoint='https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/';
const caches=new WeakMap();
export function toGrid(lat,lng){
 const rad=Math.PI/180,re=6371.00877/5,slat1=30*rad,slat2=60*rad;
 const sn=Math.log(Math.cos(slat1)/Math.cos(slat2))/Math.log(Math.tan(Math.PI/4+slat2/2)/Math.tan(Math.PI/4+slat1/2));
 const sf=Math.pow(Math.tan(Math.PI/4+slat1/2),sn)*Math.cos(slat1)/sn;
 const ro=re*sf/Math.pow(Math.tan(Math.PI/4+38*rad/2),sn),ra=re*sf/Math.pow(Math.tan(Math.PI/4+lat*rad/2),sn);
 let theta=lng*rad-126*rad;if(theta>Math.PI)theta-=2*Math.PI;if(theta< -Math.PI)theta+=2*Math.PI;theta*=sn;
 return {nx:Math.floor(ra*Math.sin(theta)+43+.5),ny:Math.floor(ro-ra*Math.cos(theta)+136+.5)};
}
const stamp=t=>new Date(t+9*3600000).toISOString().replace(/[-:T]/g,'').slice(0,12);
export const ultraPublicationTime=now=>Math.floor((now-45*60000)/3600000)*3600000+30*60000;
export function publication(now,kind){
 if(kind==='ultra')return stamp(ultraPublicationTime(now));
 const d=new Date(now+9*3600000-20*60000);let hour=Math.floor((d.getUTCHours()-2)/3)*3+2;d.setUTCHours(hour,0,0,0);return d.toISOString().replace(/[-:T]/g,'').slice(0,12);
}
export function precipitation(value){
 const label=String(value??'').trim();if(!label||label==='-999'||label==='-')return {rain:null,rainLabel:null};
 if(label==='강수없음')return {rain:0,rainLabel:label};
 const exact=label.match(/^(\d+(?:\.\d+)?)\s*(?:mm)?$/i);if(exact)return {rain:Number(exact[1]),rainLabel:label};
 const less=label.match(/^(\d+(?:\.\d+)?)\s*mm\s*미만$/);if(less)return {rain:null,rainMin:0,rainMax:Number(less[1]),rainLabel:label};
 const above=label.match(/^(\d+(?:\.\d+)?)\s*mm\s*이상$/);if(above)return {rain:null,rainMin:Number(above[1]),rainMax:null,rainLabel:label};
 const range=label.match(/^(\d+(?:\.\d+)?)\s*[~～]\s*(\d+(?:\.\d+)?)\s*mm$/);if(range)return {rain:null,rainMin:Number(range[1]),rainMax:Number(range[2]),rainLabel:label};
 return {rain:null,rainLabel:null};
}
// 1-hour new snowfall (SNO) belongs to KMA short-range forecast, not PTY.
// Keep categorical text intact instead of converting ranges into an invented depth.
export function newSnowfall(value){
 const label=String(value??'').trim();
 if(!label||label==='-'||label==='-999')return{snowfall:null,snowfallLabel:null};
 if(label==='적설없음')return{snowfall:0,snowfallLabel:label};
 const exact=label.match(/^(\d+(?:\.\d+)?)\s*(?:cm)?$/i);
 if(exact)return{snowfall:Number(exact[1]),snowfallLabel:label.includes('cm')?label:label+'cm'};
 if(/^(?:\d+(?:\.\d+)?)\s*(?:~|～|cm\s*미만|cm\s*이상)/.test(label))
  return{snowfall:null,snowfallLabel:label};
 return{snowfall:null,snowfallLabel:null};
}
const number=v=>v!==undefined&&v!==null&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>-900?Number(v):null;
export function matchKma(items,eta,kind){
 const target=stamp((kind==='ultra'?Math.ceil:Math.round)(Date.parse(eta)/3600000)*3600000);const rows=items.filter(x=>String(x.fcstDate)+String(x.fcstTime).padStart(4,'0')===target);if(!rows.length)return null;
 const values=Object.fromEntries(rows.map(x=>[x.category,x.fcstValue]));const first=rows[0];
 const result={provider:'kma',product:kind==='ultra'?'초단기예보':'단기예보',time:target.slice(0,4)+'-'+target.slice(4,6)+'-'+target.slice(6,8)+'T'+target.slice(8,10)+':'+target.slice(10,12)+':00+09:00',issuedAt:String(first.baseDate)+String(first.baseTime).padStart(4,'0'),temperature:number(values.T1H??values.TMP),windSpeed:number(values.WSD),precipitationType:number(values.PTY),...precipitation(values.RN1??values.PCP),...newSnowfall(values.SNO),gust:null,visibility:null};
 return result.temperature===null&&result.windSpeed===null&&result.rainLabel===null&&result.precipitationType===null?null:result;
}
export async function kmaWeather(samples,key,fetcher=fetch,now=Date.now(),ultraOnly=false,seriesHours=0,includeSnowfall=false){
 if(!key)throw Error('기상청 인증키 미설정');
 let cache=caches.get(fetcher);if(!cache){cache=new Map();caches.set(fetcher,cache);}
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),b=>b.toString(16).padStart(2,'0')).join('');
 async function get(grid,kind){const base=publication(now,kind),id=[digest,kind,base,grid.nx,grid.ny].join(':');const hit=cache.get(id);if(hit&&hit.expires>now)return hit.promise;
 const promise=(async()=>{const url=new URL(endpoint+(kind==='ultra'?'getUltraSrtFcst':'getVilageFcst'));for(const [k,v]of Object.entries({authKey:key,pageNo:1,numOfRows:1000,dataType:'JSON',base_date:base.slice(0,8),base_time:base.slice(8),...grid}))url.searchParams.set(k,String(v));
 let response;try{response=await fetcher(url.toString(),{signal:AbortSignal.timeout(12000)});}catch{throw Object.assign(Error('기상청 연결 지연 또는 외부 통신 실패'),{reception:'disconnected'});}
 if(!response.ok){await response.body?.cancel();throw Error('기상청 HTTP '+response.status);}
 let data;try{data=await response.json();}catch{throw Error('기상청 응답 형식 오류 · 인증키와 활용신청 상태를 확인해주세요.');}
 const code=String(data.response?.header?.resultCode??'');if(!['00','0'].includes(code))throw Error('기상청 결과 코드 '+( /^[A-Za-z0-9_-]{1,10}$/.test(code)?code:'확인 불가')+' · 인증키·활용신청·제공시각 확인 필요');
 const items=data.response?.body?.items?.item;if(!Array.isArray(items)||!items.length)throw Object.assign(Error('기상청 예보 자료 없음'),{reception:'empty'});return items;})();
 if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(id,{promise,expires:now+300000});try{return await promise;}catch(e){cache.delete(id);throw e;}}
 const results=await Promise.all(samples.map(async p=>{const grid=toGrid(p.lat,p.lng);try{let kind=ultraOnly||Date.parse(p.eta)-now<=5*3600000?'ultra':'short',forecast=null,items=null;let firstError;try{items=await get(grid,kind);forecast=matchKma(items,p.eta,kind);}catch(e){firstError=e;}
 if(!forecast&&kind==='ultra'&&!ultraOnly){kind='short';items=await get(grid,kind);forecast=matchKma(items,p.eta,kind);}
 let forecasts=seriesHours>0&&ultraOnly&&items?Array.from({length:Math.min(5,seriesHours)+1},(_,hour)=>matchKma(items,new Date(Date.parse(p.eta)+hour*3600000).toISOString(),kind)):undefined;
 if(includeSnowfall&&kind==='ultra'&&(forecast||forecasts?.some(Boolean))){
  let short=[];try{short=await get(grid,'short');}catch{}
  const enrich=f=>{if(!f)return f;const extra=matchKma(short,f.time,'short');return {...f,
   snowfall:extra?.time===f.time?extra.snowfall:null,snowfallLabel:extra?.time===f.time?extra.snowfallLabel:null,
   snowfallIssuedAt:extra?.time===f.time?extra.issuedAt:null,snowfallStatus:extra?.snowfallLabel!=null?'received':'unavailable'};};
  forecast=enrich(forecast);if(forecasts)forecasts=forecasts.map(enrich);
 }
 if(!forecast&&!forecasts?.some(Boolean))throw firstError||Object.assign(Error('해당 통과시각의 기상청 예보 없음'),{reception:'empty'});return {...p,grid,forecast,forecasts,status:'forecast'};
 }catch(e){return {...p,grid,forecast:null,status:'unavailable',error:e.message,reception:e.reception};}}));
 return {provider:'kma',samples:results,source:'기상청 API허브 · 격자 예보',sourceUrl:'https://apihub.kma.go.kr/',fetchedAt:new Date(now).toISOString(),caution:'5km 격자 예보 · 도로 현장 관측 아님. 순간풍속·가시거리·공사·침수·통제는 이 자료로 확인하지 않습니다.'};
}

