import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pointAlong} from '../public/journey.mjs';
test('vehicle follows road segments by distance, including endpoints and duplicate vertices',()=>{
 const road=[{lat:37,lng:127},{lat:37,lng:127},{lat:37.01,lng:127},{lat:37.01,lng:127.01}];
 assert.deepEqual(pointAlong(road,-1),road[0]);assert.deepEqual(pointAlong(road,2),road[3]);assert.equal(pointAlong([],0),null);
 for(let i=0;i<=100;i++){const p=pointAlong(road,i/100);assert.ok(p.lng===127||Math.abs(p.lat-37.01)<1e-10);}
 assert.deepEqual(pointAlong([road[0],road[0]],.5),road[0]);
});
