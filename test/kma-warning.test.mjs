import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseWarnings,warningStations} from '../lib/kma-warning.mjs';
import {warningRouteHazards} from '../public/kma-warning-overlay.mjs';

test('warning snapshot excludes future and canceled warnings and matches only nearby official stations',()=>{
 const now=Date.parse('2026-11-08T03:00:00Z');
 const header='# REG_UP,REG_UP_KO,REG_ID,REG_KO,TM_FC,TM_EF,WRN,LVL,CMD';
 const row=(code,t,type,level,cmd)=>'L1000000,지역,'+code+',시험구역,202611081000,'+t+','+type+','+level+','+cmd;
 const warnings=parseWarnings([header,row('L1010100','202611081100','R',3,1),
  row('L1010200','202611081000','W',2,1),row('L1010200','202611081130','W',2,3),
  row('L1010300','202611081300','S',2,1)].join('\n'),now);
 assert.deepEqual(warnings.map(x=>x.title),['호우경보']);
 const points=warningStations('# STN_ID STN_KO STN_SP LON LAT HT FCT_ID WRN_ID WRN_KO\n1 지점 A 127.00 37.00 10 11A00000 L1010100 시험구역');
 const nearby={lat:37,lng:127,seconds:60},far={lat:38,lng:127,seconds:120};
 assert.equal(warningRouteHazards([{...warnings[0],points}],[nearby],new Date(now).toISOString())[0].title,'호우경보');
 assert.deepEqual(warningRouteHazards([{...warnings[0],points}],[far],new Date(now).toISOString()),[]);
 assert.throws(()=>parseWarnings('<html>denied</html>',now),/응답 형식/);
});
