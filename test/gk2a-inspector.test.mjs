import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initGk2aInspector} from '../public/gk2a-inspector.mjs';
const src=readFileSync(new URL('../public/gk2a-inspector.mjs',import.meta.url),'utf8');
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
function dom(){
 const nodes=new Map();
 const node=id=>{
  if(!nodes.has(id)){
   const handlers=new Map();
   nodes.set(id,{id,hidden:true,disabled:false,textContent:'',value:id==='navSatelliteInspectKind'?'RR':'',
    children:[],src:'',attributes:{},
    appendChild(x){this.children.push(x);if(this.children.length===1&&this.id==='navSatelliteInspectTime')this.value=x.value;},
    replaceChildren(){this.children=[];this.value='';},
    removeAttribute(k){delete this[k];},addEventListener(k,fn){handlers.set(k,fn);},
    change(){handlers.get('change')?.();},click(){handlers.get('click')?.();}});
  }
  return nodes.get(id);
 };
 return {document:{getElementById:node,createElement:()=>({value:'',textContent:''})},node};
}
test('GK2A inspection has three official products, keeps map switches disabled and no invented map georeference',()=>{
 assert.match(ui,/id="navSatelliteInspectKind"/);
 assert.match(ui,/id="navSatelliteInspectTime"/);
 assert.match(ui,/id="navSatelliteInspectImage"/);
 for(const kind of ['RR','CI','FOG'])assert.match(ui,new RegExp('option value="'+kind+'"'));
 for(const id of ['navSatelliteRR','navSatelliteCI','navSatelliteFog'])
  assert.match(ui,new RegExp('id="'+id+'" type="checkbox" disabled'));
 assert.doesNotMatch(src,/kakao\.maps\.CustomOverlay|setMap\(|sunny-satellite-risk/);
 assert.match(ui,/좌표가 검증되기 전에는 카카오맵에 중첩하거나 AI 위험판단에 사용하지 않습니다/);
});
test('original image is only visible after KMA catalog and original PNG metadata agree',async()=>{
 const {document,node}=dom(),calls=[];
 const bytes=new Uint8Array(33),utc='202611101100';
 const fetcher=async path=>{
  calls.push(path);
  if(path.startsWith('/api/gk2a-catalog?')){
   return Response.json({kind:'RR',state:'received',observationTimes:[utc],georeferenced:false,overlayReady:false});
  }
  return new Response(bytes,{status:200,headers:{
   'content-type':'image/png','X-GK2A-Observation-UTC':utc,
   'X-GK2A-Product':'RR','X-GK2A-Georeferenced':'false'
  }});
 };
 const inspector=initGk2aInspector({document,fetcher});
 assert.equal(node('navSatelliteInspectCheck').disabled,true);
 inspector.setAvailable(true);
 await inspector.load();
 assert.equal(node('navSatelliteInspectTime').children.length,1);
 assert.equal(node('navSatelliteInspectView').disabled,false);
 assert.match(node('navSatelliteInspectStatus').textContent,/카카오맵 위치정합/);
 await inspector.preview();
 assert.equal(node('navSatelliteInspectImage').hidden,false);
 assert.equal(calls.length,2);
 node('navSatelliteInspectKind').value='FOG';node('navSatelliteInspectKind').change();
 assert.equal(node('navSatelliteInspectView').disabled,true);
 assert.equal(node('navSatelliteInspectImage').hidden,true);
 inspector.setAvailable(false);
 assert.equal(node('navSatelliteInspectCheck').disabled,true);
});
test('missing observation catalog never enables image viewer or calls image endpoint',async()=>{
 const {document,node}=dom(),calls=[];
 const inspector=initGk2aInspector({document,fetcher:async path=>{
  calls.push(path);return Response.json({kind:'CI',state:'approval_pending',observationTimes:[]});
 }});
 inspector.setAvailable(true);node('navSatelliteInspectKind').value='CI';
 await inspector.load();await inspector.preview();
 assert.deepEqual(calls,['/api/gk2a-catalog?kind=CI']);
 assert.equal(node('navSatelliteInspectView').disabled,true);
 assert.match(node('navSatelliteInspectStatus').textContent,/승인/);
});
