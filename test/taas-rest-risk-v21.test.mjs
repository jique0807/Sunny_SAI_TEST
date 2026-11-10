import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KOROAD_ACCIDENT_REST,parseKoroadPedestrianHotspots,fetchKoroadPedestrianHotspots} from '../lib/koroad-pedestrian.mjs';
import {validTaasRestResult,initTaasRestOverlay} from '../public/taas-rest-overlay.mjs';

const sample={resultCode:'00',items:{item:[
 {bjd_cd:'1114010100',spot_nm:'공식 2024 사고 집중구역',lo_crd:'126.9762',la_crd:'37.5651',
  occrrnc_cnt:7,caslt_cnt:10,geom_json:'{"type":"Polygon","coordinates":[]}'}
]}};

test('TAAS official pedestrian, child, elderly REST endpoints are fixed and independently normalized',async()=>{
 assert.equal(new URL(KOROAD_ACCIDENT_REST.pedestrian).pathname,'/data/rest/frequentzone/pedstrians');
 assert.equal(new URL(KOROAD_ACCIDENT_REST.child).pathname,'/data/rest/frequentzone/child');
 assert.equal(new URL(KOROAD_ACCIDENT_REST.elderly).pathname,'/data/rest/frequentzone/oldman');
 for(const kind of ['pedestrian','child','elderly']){
  const result=await fetchKoroadPedestrianHotspots('DO_NOT_DISCLOSE',async rawUrl=>{
   const url=new URL(rawUrl);
   assert.equal(url.origin,'https://opendata.koroad.or.kr');
   assert.equal(url.pathname,new URL(KOROAD_ACCIDENT_REST[kind]).pathname);
   assert.equal(url.searchParams.get('searchYearCd'),'2024');
   return Response.json(sample);
  },undefined,kind);
  assert.equal(result.status,'received');
  assert.equal(result.items[0].kind,kind);
  assert.equal(result.items[0].historic,true);
  assert.equal(result.items[0].live,false);
  assert.equal(result.items[0].accidentCount,7);
  assert.ok(!JSON.stringify(result).includes('DO_NOT_DISCLOSE'));
  assert.ok(!JSON.stringify(result).includes('geom_json'));
 }
 assert.equal((await fetchKoroadPedestrianHotspots('x',async()=>{throw Error('should not call')},undefined,'arbitrary')).status,'failed');
});

test('wrong year, wrong kind, live data and fabricated accident count cannot be shown',()=>{
 const good={source:'한국도로교통공단 TAAS',kind:'elderly',year:'2024',status:'received',
 items:parseKoroadPedestrianHotspots(sample,{kind:'elderly'}).items};
 assert.equal(validTaasRestResult(good,'elderly'),true);
 assert.equal(validTaasRestResult({...good,year:'2025'},'elderly'),false);
 assert.equal(validTaasRestResult({...good,kind:'child'},'elderly'),false);
 assert.equal(validTaasRestResult({...good,items:[{...good.items[0],live:true}]},'elderly'),false);
 assert.equal(validTaasRestResult({...good,items:[{...good.items[0],accidentCount:-1}]},'elderly'),false);
});

test('TAAS REST layer fetches only after explicit pedestrian map toggle, never draws fake WMS',async()=>{
 const priorDoc=globalThis.document,priorWindow=globalThis.window;
 const nodes=new Map(),overlays=[],queries=[];
 const node=id=>{
  if(!nodes.has(id)){
   const handlers=new Map();
   nodes.set(id,{id,disabled:true,checked:false,textContent:'',dataset:{},value:'45',
    addEventListener(name,fn){handlers.set(name,fn);},
    change(){handlers.get('change')?.({type:'change'});}});
  }
  return nodes.get(id);
 };
 const document={
  getElementById:node,
  createElement:()=>({style:{},textContent:'',setAttribute(){},addEventListener(){}})
 };
 const walking={travelMode:'walking',demo:false,samples:[{lat:37.56,lng:126.97},{lat:37.57,lng:126.98}],rainPath:[
  {lat:37.56,lng:126.97,seconds:0},{lat:37.57,lng:126.98,seconds:600}]};
 const map={};
 globalThis.document=document;
 globalThis.window={kakao:{maps:{
  LatLng:class{constructor(lat,lng){this.lat=lat;this.lng=lng;}},
  CustomOverlay:class{constructor(x){this.data=x;overlays.push(this);}setMap(map){this.data.map=map;}}
 }}};
 try{
  const layer=initTaasRestOverlay({document,getRoute:()=>walking,getMap:()=>map,
   ensureMap:async()=>{},query:async(kind)=>{
    queries.push(kind);
    return{kind,status:'received',source:'한국도로교통공단 TAAS',year:'2024',
     items:parseKoroadPedestrianHotspots(sample,{kind}).items};
   }});
  layer.setAvailable(true);
  assert.equal(queries.length,0);
  node('navLayerChildWms').checked=true;node('navLayerChildWms').change();
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.deepEqual(queries,['child']);
  assert.equal(layer.hasData('child'),true);
  assert.equal(overlays.length,1);
  assert.match(node('navChildWmsStatus').textContent,/2024년.*1곳/);
  node('navLayerChildWms').checked=false;node('navLayerChildWms').change();
  assert.equal(overlays[0].data.map,null);
 }finally{globalThis.document=priorDoc;globalThis.window=priorWindow;}
});


test('actual authenticated TAAS child route request uses two permitted upstream hosts and never exposes keys',async()=>{
 const {handle}=await import('../lib/api.mjs');
 const origin='https://sunny.example',env={APP_ORIGIN:origin,SESSION_SECRET:'s'.repeat(64),
  KAKAO_REST_API_KEY:'SECRET_KAKAO',KOROAD_API_KEY:'SECRET_TAAS'};
 const session=await handle(new Request(origin+'/api/session'),env);
 const cookie=session.headers.getSetCookie()[0].split(';')[0];
 const {csrf}=await session.json(),seen=[];
 const body={kind:'child',points:[{lat:37.565,lng:126.976},{lat:37.566,lng:126.977}]};
 const req=new Request(origin+'/api/pedestrian-route-context',{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':csrf,Cookie:cookie},
  body:JSON.stringify(body)});
 const result=await handle(req,env,async url=>{
  const u=new URL(url);seen.push(u);
  if(u.hostname==='dapi.kakao.com')
   return Response.json({documents:[{region_type:'B',code:'1114010100',region_1depth_name:'서울특별시',region_2depth_name:'중구'}]});
  assert.equal(u.hostname,'opendata.koroad.or.kr');
  assert.equal(u.pathname,'/data/rest/frequentzone/child');
  return Response.json(sample);
 });
 assert.equal(result.status,200);
 const raw=await result.text(),data=JSON.parse(raw);
 assert.equal(data.status,'received');
 assert.equal(data.kind,'child');
 assert.equal(data.items[0].kind,'child');
 assert.equal(seen.filter(u=>u.hostname==='opendata.koroad.or.kr').length,1);
 assert.ok(!raw.includes('SECRET_KAKAO')&&!raw.includes('SECRET_TAAS'));
 const invalid=await handle(new Request(origin+'/api/pedestrian-route-context',{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':csrf,Cookie:cookie},
  body:JSON.stringify({...body,kind:'../private'})}),env,
  async()=>{throw Error('invalid kind should never contact provider')});
 assert.equal(invalid.status,400);
});

test('Kakao driving alternatives send only documented priority values',async()=>{
 const {handle}=await import('../lib/api.mjs');
 const origin='https://sunny.example',env={APP_ORIGIN:origin,SESSION_SECRET:'s'.repeat(64),KAKAO_REST_API_KEY:'SERVER_SECRET'};
 const session=await handle(new Request(origin+'/api/session'),env);
 const cookie=session.headers.getSetCookie()[0].split(';')[0],{csrf}=await session.json();
 const body={origin:{lat:37.566,lng:126.978},destination:{lat:37.57,lng:127.01},
  departure:new Date(Date.now()+60000).toISOString(),travelMode:'driving'};
 const request=p=>new Request(origin+'/api/route',{method:'POST',
  headers:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':csrf,Cookie:cookie},
  body:JSON.stringify({...body,drivingPriority:p})});
 const mockedRoute={result_code:0,summary:{distance:1500,duration:600},
  sections:[{roads:[{name:'시범도로',duration:600,distance:1500,vertexes:[126.978,37.566,127.01,37.57]}]}]};
 for(const option of ['RECOMMEND','TIME','DISTANCE']){
  const response=await handle(request(option),env,async url=>{
   const parsed=new URL(url);
   assert.equal(parsed.searchParams.get('priority'),option);
   return Response.json({routes:[mockedRoute]});
  });
  assert.equal(response.status,200);
  assert.equal((await response.json()).travelMode,'driving');
 }
 const blocked=await handle(request('UNSAFE'),env,async()=>{throw Error('provider should not be called')});
 assert.equal(blocked.status,400);
});
