import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseWarnings,warningStations} from '../lib/kma-warning.mjs';
import {warningRouteHazards} from '../public/kma-warning-overlay.mjs';

test('warning snapshot excludes future and canceled warnings; stations alone never prove intersection',()=>{
 const now=Date.parse('2026-11-08T03:00:00Z');
 const header='# REG_UP,REG_UP_KO,REG_ID,REG_KO,TM_FC,TM_EF,WRN,LVL,CMD';
 const row=(code,t,type,level,cmd)=>'L1000000,지역,'+code+',시험구역,202611081000,'+t+','+type+','+level+','+cmd;
 const warnings=parseWarnings([header,row('L1010100','202611081100','R',3,1),
  row('L1010200','202611081000','W',2,1),row('L1010200','202611081130','W',2,3),
  row('L1010300','202611081300','S',2,1)].join('\n'),now);
 assert.deepEqual(warnings.map(x=>x.title),['호우경보']);
 const points=warningStations('# STN_ID STN_KO STN_SP LON LAT HT FCT_ID WRN_ID WRN_KO\n1 지점 A 127.00 37.00 10 11A00000 L1010100 시험구역');
 const nearby={lat:37,lng:127,seconds:60},far={lat:38,lng:127,seconds:120};
 assert.deepEqual(warningRouteHazards([{...warnings[0],points}],[nearby],new Date(now).toISOString()),[]);
 assert.deepEqual(warningRouteHazards([{...warnings[0],points}],[far],new Date(now).toISOString()),[]);
 assert.throws(()=>parseWarnings('<html>denied</html>',now),/응답 형식/);
});

test('official polygons match sparse route crossings, preserve holes, and reject station-only proximity',async()=>{
 const {firstWarningAreaCrossing,pointInWarningArea}=await import('../public/warning-area-geometry.mjs');
 const geometry={type:'Polygon',coordinates:[[[126,36],[128,36],[128,38],[126,38],[126,36]],[[126.8,36.8],[127.2,36.8],[127.2,37.2],[126.8,37.2],[126.8,36.8]]]};
 assert.equal(pointInWarningArea([127,37],geometry),false);
 assert.equal(pointInWarningArea([126.5,37],geometry),true);
 const path=[{lng:125,lat:37,seconds:0},{lng:129,lat:37,seconds:400}];
 assert.equal(firstWarningAreaCrossing(path,geometry).seconds,100);
 const warning={title:'호우경보',points:[],geometry,geometryStatus:'official_crs84_polygon'};
 const result=warningRouteHazards([warning],path,'2026-11-11T04:00:00Z');
 assert.equal(result[0].seconds,100);assert.equal(result[0].spatialMatch,'official-warning-polygon');
 assert.equal(warningRouteHazards([{...warning,geometryStatus:'boundary_unavailable'}],path,'2026-11-11T04:00:00Z').length,0);
});
test('official KMA warning snapshot joins exact region codes without guessed boundaries',async()=>{
 const {attachWarningAreas}=await import('../lib/kma-warning.mjs');
 const result=attachWarningAreas([{code:'L1010400'},{code:'L9999999'}]);
 assert.equal(result[0].geometryStatus,'official_crs84_polygon');
 assert.equal(result[0].geometry.type,'MultiPolygon');
 assert.equal(result[1].geometryStatus,'boundary_unavailable');assert.equal(result[1].geometry,null);
});
