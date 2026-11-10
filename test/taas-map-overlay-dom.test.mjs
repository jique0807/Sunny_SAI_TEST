import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initTaasPedestrianWmsOverlay} from '../public/taas-pedestrian-wms-overlay.mjs';
const kinds=['pedestrian','child','elderly'];
const ids={pedestrian:'navLayerPedestrianWms',child:'navLayerChildWms',elderly:'navLayerElderlyWms'};
const statuses={pedestrian:'navPedestrianWmsStatus',child:'navChildWmsStatus',elderly:'navElderlyWmsStatus'};
const bounds={west:126.96,south:37.55,east:127.02,north:37.58};
function mock(){
 const nodes=new Map(),overlays=[],issued=[],revoked=[],requests=[];
 const node=id=>{
  if(!nodes.has(id)){
   const listeners=new Map();
   nodes.set(id,{checked:false,disabled:true,value:id==='navDemoOpacity'?'45':'0',
    textContent:'',style:{},closest:()=>({classList:{toggle(){}}}),
    addEventListener(name,fn){listeners.set(name,fn);},
    async dispatch(name='change'){await listeners.get(name)?.({type:name});}});
  }
  return nodes.get(id);
 };
 const map={
  getBounds:()=>({getSouthWest:()=>({getLat:()=>bounds.south,getLng:()=>bounds.west}),
   getNorthEast:()=>({getLat:()=>bounds.north,getLng:()=>bounds.east})}),
  getProjection:()=>({pointFromCoords:p=>({x:p.lng*100000,y:-p.lat*100000})})
 };
 let currentMap=map;
 const document={getElementById:node,createElement:tag=>({tag,style:{},src:'',alt:''})};
 class LatLng{constructor(lat,lng){this.lat=lat;this.lng=lng;}}
 class CustomOverlay{
  constructor(o){this.props=o;this.visible=true;overlays.push(this);}
  setMap(next){this.visible=Boolean(next);}
 }
 return {nodes,overlays,issued,revoked,requests,map,document,node,
  getMap:()=>currentMap,setMap:m=>{currentMap=m;},
  kakao:{maps:{LatLng,CustomOverlay}},
  request:async(kind,b)=>{requests.push({kind,b});return{blob:new Blob(['PNG'],{type:'image/png'}),regionCode:'11140'};}};
}
test('all three TAAS WMS image overlays genuinely attach as georeferenced Kakao objects and honor opacity',async()=>{
 const previous=globalThis.kakao;
 const env=mock();
 globalThis.kakao=env.kakao;
 try{
  const overlay=initTaasPedestrianWmsOverlay({document:env.document,request:env.request,
   getMap:env.getMap,ensureMap:async()=>{}});
  overlay.setAvailable(true);
  for(const k of kinds){
   assert.equal(env.node(ids[k]).disabled,false);
   env.node(ids[k]).checked=true;
   await env.node(ids[k]).dispatch();
  }
  await new Promise(r=>setTimeout(r,610));
  assert.deepEqual(env.requests.map(x=>x.kind).sort(),[...kinds].sort());
  assert.equal(env.overlays.length,3);
  for(const item of env.overlays){
   assert.equal(item.props.position.lat,bounds.north);
   assert.equal(item.props.position.lng,bounds.west);
   assert.equal(item.props.xAnchor,0);
   assert.equal(item.props.yAnchor,0);
   assert.ok(Number.parseInt(item.props.content.style.width)>0);
   assert.ok(Number.parseInt(item.props.content.style.height)>0);
   assert.equal(item.props.content.style.opacity,'0.55');
   assert.match(item.props.content.alt,/2024년/);
  }
  env.node('navDemoOpacity').value='75';
  overlay.updateOpacity();
  for(const item of env.overlays)assert.equal(item.props.content.style.opacity,'0.25');
  env.node(ids.child).checked=false;
  await env.node(ids.child).dispatch();
  assert.equal(env.overlays.filter(x=>x.visible).length,2);
  assert.match(env.node(statuses.child).textContent,/해제/);
  env.setMap(null);
  overlay.repaint();
  assert.equal(env.overlays.filter(x=>x.visible).length,0);
  overlay.clear();
 }finally{
  if(previous===undefined)delete globalThis.kakao;else globalThis.kakao=previous;
 }
});
test('WMS failure does not present an empty map as successfully received',async()=>{
 const previous=globalThis.kakao;
 const env=mock();
 globalThis.kakao=env.kakao;
 try{
  const overlay=initTaasPedestrianWmsOverlay({document:env.document,
   request:async()=>{throw Error('기관 WMS 비정상 응답')},
   getMap:env.getMap,ensureMap:async()=>{}});
  overlay.setAvailable(true);
  env.node(ids.pedestrian).checked=true;
  await env.node(ids.pedestrian).dispatch();
  await new Promise(r=>setTimeout(r,610));
  assert.equal(env.overlays.length,0);
  assert.match(env.node(statuses.pedestrian).textContent,/수신 실패/);
  overlay.clear();
 }finally{
  if(previous===undefined)delete globalThis.kakao;else globalThis.kakao=previous;
 }
});
