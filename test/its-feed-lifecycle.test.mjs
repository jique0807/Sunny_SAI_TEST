import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createItsFeedLifecycle} from '../public/its-feed-lifecycle.mjs';
import {normalizeItsEvents} from '../lib/its-traffic.mjs';
import {buildItsRouteHazards} from '../public/its-route-risk.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('ITS failures back off with a cap and recovery resets the retry delay',()=>{
 const feed=createItsFeedLifecycle();let now=1000;
 for(const delay of [60000,120000,240000,480000,600000,600000]){
  const token=feed.begin(now);assert.notEqual(token,null);
  assert.equal(feed.begin(now),null);
  feed.settle(token,'failed',now);
  assert.equal(feed.begin(now+delay-1),null);now+=delay;
 }
 const token=feed.begin(now);feed.settle(token,'received',now);
 assert.equal(feed.snapshot().failures,0);
 assert.equal(feed.snapshot().nextAttemptAt,now+180000);
});
test('successful empty responses expire and are never cached indefinitely',()=>{
 const feed=createItsFeedLifecycle();const token=feed.begin(1000);
 feed.settle(token,'empty',1000);
 assert.equal(feed.isStale(180999),false);
 assert.equal(feed.isStale(181000),true);
 assert.equal(feed.begin(180999),null);
 assert.notEqual(feed.begin(181000),null);
});
test('cancelled and superseded requests cannot settle a newer request',()=>{
 const feed=createItsFeedLifecycle(),old=feed.begin(1000);feed.cancel(old);
 const current=feed.begin(2000);
 assert.equal(feed.settle(old,'received',2000),false);
 assert.equal(feed.snapshot().pending,true);
 assert.equal(feed.settle(current,'failed',2000),true);
 assert.equal(feed.snapshot().lastReceived,null);
});
test('a recovered official ITS response produces driving advisories and never walking hazards',()=>{
 const now=Date.parse('2026-11-11T00:00:00Z');
 const feed=createItsFeedLifecycle();let token=feed.begin(now-60000);
 feed.settle(token,'failed',now-60000);token=feed.begin(now);
 const parsed=normalizeItsEvents({response:{header:{resultcode:0},body:{items:{item:{
  coordx:126.99,coordy:37.566,eventType:'acc',startDate:'20261111085500',message:'fixture'
 }}}}},{now});
 feed.settle(token,parsed.status,now);
 const route={travelMode:'driving',departure:new Date(now).toISOString(),duration:600,
  rainPath:[{lat:37.566,lng:126.98,seconds:0},{lat:37.566,lng:127,seconds:600}]};
 const hazards=buildItsRouteHazards(route,parsed);
 assert.equal(hazards.length,1);
 assert.equal(hazards[0].segmentVerified,false);
 assert.equal(feed.isStale(now),false);
 assert.equal(buildItsRouteHazards({...route,travelMode:'walking'},parsed).length,0);
 assert.equal(buildItsRouteHazards(route,{status:'failed',items:parsed.items}).length,0);
});

test('actual app ingestion recovers, expires displayed incidents, and ignores a changed route',async()=>{
 let now=Date.parse('2026-11-11T00:00:00Z'),calls=0;
 const parsed=normalizeItsEvents({response:{data:[{coordX:126.99,coordY:37.566,
  eventType:'acc',startDate:'20261111085500',message:'fixture'}]}},{now});
 const route={travelMode:'driving',departure:new Date(now).toISOString(),duration:600,
  samples:[{lat:37.566,lng:126.98},{lat:37.566,lng:127}],
  rainPath:[{lat:37.566,lng:126.98,seconds:0},{lat:37.566,lng:127,seconds:600}]};
 const ctx=vm.createContext({route,createItsFeedLifecycle,buildItsRouteHazards,createRouteEvidenceRefresh:()=>async()=>{},WeakMap,Number,String,
  Date:class extends Date{static now(){return now;}},$:()=>null,
  document:{hidden:false,addEventListener(){}},drawWeatherOverlays(){},renderRouteHazards(){},
  drivingUI:{render(){}},api:async()=>{calls++;return calls===1?{status:'failed'}:parsed;}});
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 vm.runInContext(app.slice(app.indexOf('// ITS reports point locations;'),app.indexOf('function updateMapLayerOpacity()')),ctx);
 await ctx.loadItsRouteEvidence(route);
 assert.equal(route.itsEvidenceStatus,'failed');assert.equal(route.itsRiskEvents.length,0);
 await ctx.loadItsRouteEvidence(route);assert.equal(calls,1);
 now+=60000;await ctx.loadItsRouteEvidence(route);
 assert.equal(route.itsEvidenceStatus,'received');assert.equal(route.itsRiskEvents.length,1);
 let finish;ctx.api=()=>new Promise(resolve=>{finish=resolve;});
 now+=180000;const pending=ctx.loadItsRouteEvidence(route);
 assert.equal(route.itsRiskEvents.length,0);
 assert.equal(route.itsEvidenceStatus,'unavailable');
 ctx.route={travelMode:'walking'};finish(parsed);await pending;
 assert.equal(route.itsRiskEvents.length,0);
 assert.equal(ctx.route.itsEvidenceStatus,undefined);
});
