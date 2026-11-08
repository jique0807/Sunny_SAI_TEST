// Safemap national-river 100-year flood extent, NOT live roadway inundation.
// Official source: https://www.safemap.go.kr/opna/data/dataViewRenew.do?objtId=209
// Credentials are read only in server-side handlers, never exported to clients.
const WMS_ENDPOINT='https://www.safemap.go.kr/openapi2/IF_0089_WMS';
const LAYER='A2SM_FLOODFOVRRISK1';
const MAX_MERCATOR=20037508.342789244;
const mercatorX=lng=>lng*MAX_MERCATOR/180;
const mercatorY=lat=>6378137*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
const invalid=()=>Object.assign(Error('Invalid flood map bounds'),{status:400});
export function safemapUrl(params,key){
 if(!key)throw Object.assign(Error('Safemap key missing'),{status:503});
 const raw=String(params.get('bbox')||'').split(',');
 if(raw.length!==4||raw.some(x=>!x.trim()))throw invalid();
 const b=raw.map(Number),width=Number(params.get('width')),height=Number(params.get('height'));
 if(b.some(x=>!Number.isFinite(x))||!Number.isInteger(width)||!Number.isInteger(height)||width<128||height<128||width>1024||height>1024)throw invalid();
 const [west,south,east,north]=b;
 if(!(west<east&&south<north)||west<mercatorX(123)||east>mercatorX(133)||south<mercatorY(32)||north>mercatorY(40)||east-west>950000||north-south>1150000)throw invalid();
 const url=new URL(WMS_ENDPOINT);
 for(const [k,v]of Object.entries({serviceKey:key,service:'WMS',request:'GetMap',version:'1.1.1',layers:LAYER,styles:'',srs:'EPSG:3857',bbox:b.join(','),format:'image/png',width,height,transparent:'TRUE'}))url.searchParams.set(k,String(v));
 return url;
}
export async function safemapWms(params,key,fetcher=fetch){
 const url=safemapUrl(params,key);
 let upstream;
 try{upstream=await fetcher(url.toString(),{signal:AbortSignal.timeout(12000),headers:{Accept:'image/png'}});}
 catch{throw Object.assign(Error('Safemap upstream unavailable'),{status:502});}
 if(!upstream.ok){await upstream.body?.cancel();throw Object.assign(Error('Safemap HTTP failure'),{status:502});}
 if(!(upstream.headers.get('content-type')||'').toLowerCase().startsWith('image/png')){await upstream.body?.cancel();throw Object.assign(Error('Safemap WMS image missing'),{status:502});}
 const size=Number(upstream.headers.get('content-length')||0);
 if(size>3000000){await upstream.body?.cancel();throw Object.assign(Error('Safemap image too large'),{status:502});}
 const bytes=new Uint8Array(await upstream.arrayBuffer());
 if(bytes.length<8||bytes.length>3000000||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))throw Object.assign(Error('Safemap returned invalid PNG'),{status:502});
 return new Response(bytes,{status:200,headers:{'Content-Type':'image/png','Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
