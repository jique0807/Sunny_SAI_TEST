import {test} from 'node:test';import assert from 'node:assert/strict';
import {koLccPixelToLatLng,verifyKoLccProjection,imageAffineMatrix} from '../public/gk2a-georef.mjs';
import {satelliteGeorefState,pngDimensions,parseSatelliteList,satellitePublicMeta,getSatelliteFrame} from '../lib/gk2a-satellite.mjs';
import {canMapGk2aImage} from '../public/gk2a-overlay.mjs';
import {readFileSync} from 'node:fs';
test('official GK2A KO LCC inverse projection has correct origin and four corners',()=>{
 assert.equal(verifyKoLccProjection(),true);
 const p=koLccPixelToLatLng(450,450);
 assert.ok(Math.abs(p.lat-38)<1e-7&&Math.abs(p.lng-126)<1e-7);
 assert.throws(()=>koLccPixelToLatLng(450,922));
 const a=imageAffineMatrix([{x:0,y:0},{x:10,y:0},{x:0,y:10}],[{x:3,y:7},{x:23,y:7},{x:3,y:37}]);
 assert.equal(a.a,2);assert.equal(a.d,3);assert.equal(a.e,3);assert.equal(a.f,7);
});
test('satellite 900x922 source is NEVER overlaid onto 900x900 geolocation',()=>{
 assert.equal(satelliteGeorefState('ko',{width:900,height:922}),'unverified_raster_geometry');
 assert.equal(satelliteGeorefState('ela',{width:900,height:900}),'unverified_raster_geometry');
 assert.equal(canMapGk2aImage({status:'received',area:'ko',width:900,height:922,georeference:'unverified_raster_geometry'}),false);
 assert.equal(canMapGk2aImage({status:'received',area:'ko',width:900,height:900,georeference:'verified_ko_lcc_900'}),true);
});
test('GK2A list parse selects actual UTC filenames and no guessed missing file',()=>{
 const now=Date.parse('2026-11-11T02:00:00Z');
 assert.deepEqual(parseSatelliteList('gk2a_ami_le2_rr_ko_202611110130.png\ngk2a_ami_202611110120.png\n202611120000',now),['202611110130','202611110120']);
 assert.deepEqual(parseSatelliteList('No data',now),[]);
});
test('GK2A provider returns only verified dimensions without leaking authKey',async()=>{
 const bytes=new Uint8Array(40);bytes.set([137,80,78,71,13,10,26,10]);bytes.set([73,72,68,82],12);bytes.set([0,0,3,132,0,0,3,154],16); // 900x922
 assert.deepEqual(pngDimensions(bytes),{width:900,height:922});
 const now=Date.parse('2026-11-11T02:00:00Z');
 const calls=[];
 const fetcher=async u=>{const url=new URL(u);calls.push(url);
  return url.pathname.includes('sat_file_data_list')
   ?new Response('gk2a_ami_le2_rr_ko020lc_202611110130.png')
   :new Response(bytes,{headers:{'content-type':'image/png'}});};
 const result=await getSatelliteFrame('private-key','rr',{fetcher,now});
 assert.equal(result.status,'received');assert.equal(result.georeference,'unverified_raster_geometry');
 assert.equal(result.width,900);assert.equal(result.height,922);
 assert.equal(calls.length,2);assert.equal(calls[0].searchParams.get('area'),'ko');
 assert.doesNotMatch(JSON.stringify(satellitePublicMeta(result)),/private-key|authKey|bytes/);
});
test('CI requests ELA LC, never switches to KO and never claims unreceived data',async()=>{
 const seen=[];
 const fetcher=async url=>{const u=new URL(url);seen.push(u);return new Response('no data')};
 const result=await getSatelliteFrame('secret','ci',{fetcher,now:Date.parse('2026-11-11T02:00:00Z')});
 assert.equal(result.status,'not_received');
 assert.ok(seen.every(u=>u.searchParams.get('area')==='ela'&&u.searchParams.get('map')==='LC'));
 assert.ok(seen.some(u=>u.searchParams.get('data')==='ci-ci1'));
});
test('ITS diagnostic is fixed-location and GK2A endpoints whitelist products',()=>{
 const api=readFileSync(new URL('../lib/api.mjs',import.meta.url),'utf8');
 assert.match(api,/path==='\/api\/its-live-diagnostic'/);
 assert.match(api,/path==='\/api\/gk2a-live-diagnostic'/);
 assert.match(api,/path==='\/api\/taas-rest-diagnostic'/);
 assert.match(api,/env\.VERCEL_ENV!=='preview'/);
 assert.match(api,/path==='\/api\/gk2a-layer-status'/);
 assert.match(api,/georeference!=='verified_ko_lcc_900'/);
});

test('GK2A Kakao overlay uses the real map container, not an undocumented SDK map node method',()=>{
 const source=readFileSync(new URL('../public/gk2a-overlay.mjs',import.meta.url),'utf8');
 const styles=readFileSync(new URL('../app/navigation-ui.css',import.meta.url),'utf8');
 assert.doesNotMatch(source,/map\.getNode|liveMap\.getNode/);
 assert.match(source,/const p=map\.getProjection\?\.\(\),root=get\('kakaoMap'\)/);
 assert.match(source,/get\('kakaoMap'\)\.append\(canvas\)/);
 assert.match(source,/containerPointFromCoords\(new kakao\.maps\.LatLng/);
 assert.match(styles,/#kakaoMap > \.sunny-gk2a-map-overlay\{/);
});

test('satellite diagnostics distinguish image reception, map readiness and numeric risk readiness',()=>{
 const image=satellitePublicMeta({status:'received',product:'rr',area:'ko',width:900,height:922,
  georeference:'unverified_raster_geometry',bytes:new Uint8Array(24)});
 assert.equal(image.mapReady,false);assert.equal(image.riskInputReady,false);
 assert.equal(image.mappingBlocker,'raster_origin_and_22px_strip_unverified');
 const ela=satellitePublicMeta({...image,area:'ela'});
 assert.equal(ela.mappingBlocker,'ela_projection_and_extent_unverified');
});
