import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initRoadRiskOverlay} from '../public/road-risk-overlay.mjs';
import {initWarningOverlay} from '../public/kma-warning-overlay.mjs';
for(const kind of ['road','warning'])test(`${kind}: displaying cached data cannot postpone its actual collection deadline`,async()=>{
 const oldDocument=globalThis.document,oldNow=Date.now;let now=1000,calls=0,changes=0,fail=false;
 const elements=new Map();
 for(const id of ['navLayerroad','navLayerfog','navRoadRiskRefresh','navRoadRiskStatus','navLayerWarning','navWarningStatus'])
  elements.set(id,{checked:true,textContent:'',addEventListener(){}});
 globalThis.document={getElementById:id=>elements.get(id)||null};
 Date.now=()=>now;
 try{
  const query=async()=>{calls++;if(fail)throw Error('fixture outage');return kind==='road'?{locations:[],status:'georeferenced'}:{warnings:[]};};
  const onChange=()=>changes++;
  const overlay=kind==='road'?initRoadRiskOverlay({query,getContext:()=>null,ensureMap:async()=>{},onChange}):
   initWarningOverlay({query,getMap:()=>null,ensureMap:async()=>{},onChange});
  if(kind==='road')overlay.setAvailable(true);
  const lifetime=kind==='road'?180000:120000;
  await overlay.load();assert.equal(calls,1);
  now+=lifetime-1000;await overlay.load();assert.equal(calls,1);
  now+=1001;await overlay.load();assert.equal(calls,2);
  now+=lifetime+1;fail=true;const before=changes;
  const missing=await overlay.collectForRisk();
  assert.equal(missing.status,'unavailable');
  assert.ok(changes>before,'expired data must notify the display even if its refresh fails');
 }finally{Date.now=oldNow;globalThis.document=oldDocument;}
});
