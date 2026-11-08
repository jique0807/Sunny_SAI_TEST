import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compositeRequest,probeComposite} from '../lib/kma-radar-composite-probe.mjs';
import {RADAR_NX,RADAR_NY,RADAR_TOTAL,parseCompositeBinary,summarizeRealRadar} from '../lib/kma-radar-composite-data.mjs';
import {handle} from '../lib/api.mjs';
const key='mock-secret-never-respond',tm='202407100900';
function binary(){
 const b=new Uint8Array(RADAR_TOTAL*2+4),v=new DataView(b.buffer);
 v.setUint16(0,RADAR_NX,true);v.setUint16(2,RADAR_NY,true);
 // Unobserved is never safe/dry and must not be painted.
 for(let i=0;i<RADAR_TOTAL;i++)v.setInt16(4+i*2,-30000,true);
 v.setInt16(4+2*89,150,true);
 v.setInt16(4+2*(RADAR_NX+5),2020,true);
 v.setInt16(4+2*(RADAR_NX+6),-25000,true);
 v.setInt16(4+2*(RADAR_NX+7),0,true);
 return b;
}
test('official PCPH source explicitly requests accumulation in MM rather than default dBZ',()=>{
 const u=compositeRequest('grid','PCPH',key,tm);
 assert.equal(u.hostname,'apihub.kma.go.kr');
 assert.equal(u.pathname,'/api/typ01/cgi-bin/url/nph-rdr_cmp1_api');
 for(const [k,v] of [['cmp','PCPH'],['qcd','MSK'],['unit','MM'],
  ['acc','60'],['disp','B'],['map','HB'],['tm',tm],['authKey',key]])
  assert.equal(u.searchParams.get(k),v);
 assert.equal(compositeRequest('grid','HSR',key).searchParams.get('unit'),null);
 assert.throws(()=>compositeRequest('grid','PCPH',key,'2024-07-10'),/Invalid/);
});
test('real radar grid parser distinguishes rainfall, no echo and unknown values',()=>{
 const stats=parseCompositeBinary(binary(),'PCPH');
 assert.equal(stats.nx,2305);assert.equal(stats.ny,2881);
 assert.equal(stats.total,RADAR_TOTAL);assert.equal(stats.positive,2);
 assert.equal(stats.noEcho,1);assert.equal(stats.zero,1);
 assert.equal(stats.outOfRange,RADAR_TOTAL-4);
 assert.equal(stats.maxPositive,20.2);assert.equal(stats.minPositive,1.5);
 assert.deepEqual(stats.wetGridBbox,{minX:5,minY:0,maxX:89,maxY:1});
 assert.ok(!JSON.stringify(stats).includes(key));
 assert.throws(()=>parseCompositeBinary(new Uint8Array(4),'PCPH'),/dimensions/);
});
test('provider full grid is streamed and parsed with no secret exposed',async()=>{
 const stats=await summarizeRealRadar(key,'PCPH',async url=>{
  assert.equal(new URL(url).searchParams.get('unit'),'MM');
  return new Response(binary(),{headers:{'content-type':'application/octet-stream'}});
 },tm);
 assert.equal(stats.positive,2);assert.equal(stats.unit,'mm/1h');
});
test('radar diagnostic endpoint stays preview-only and rejects arbitrary input',async()=>{
 const root='https://sunny.test',env={VERCEL_ENV:'preview',APP_ORIGIN:root,
  KMA_API_KEY:key,SESSION_SECRET:'x'.repeat(64)};
 const bad=await handle(new Request(root+'/api/radar-composite-stats?tm=2024-07-10'),env);
 assert.equal(bad.status,400);
 const prod=await handle(new Request(root+'/api/radar-composite-stats?tm='+tm),
  {...env,VERCEL_ENV:'production'});
 assert.equal(prod.status,404);
 const r=await handle(new Request(root+'/api/radar-composite-stats?tm='+tm),env,
  async()=>new Response(binary()));
 assert.equal(r.status,200);
 const stats=await r.json();assert.equal(stats.positive,2);
 assert.ok(!JSON.stringify(stats).includes(key));
});
test('short provider response cannot masquerade as binary radar',async()=>{
 const status=await probeComposite('grid','PCPH',key,
  async()=>new Response('data not found'),tm);
 assert.notEqual(status.state,'binary_grid_header');
});
