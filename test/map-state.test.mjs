import {test} from 'node:test';
import assert from 'node:assert/strict';
import {coordinatePlace,nearestSample,tileHealth} from '../public/map-state.mjs';
test('explicit coordinates allow routing without search and reject invalid locations',()=>{
 assert.deepEqual(coordinatePlace('37.566, 126.978'),{lat:37.566,lng:126.978,name:'37.56600, 126.97800'});
 for(const value of ['서울시청','126.978,37.566','NaN,127','0,0','37,127 extra','<script>'])assert.equal(coordinatePlace(value),null);
});
test('map clicks select the nearest forecast sample with deterministic ties',()=>{
 const samples=[{lat:36,lng:127},{lat:37,lng:127},{lat:38,lng:127}];
 assert.equal(nearestSample(samples,{lat:37.1,lng:127}),1);
 assert.equal(nearestSample([],{lat:37,lng:127}),null);
});
test('tile readiness requires an actual image load; partial failure retains available imagery',()=>{
 assert.equal(tileHealth(0,0),'loading');assert.equal(tileHealth(0,3),'failed');assert.equal(tileHealth(2,1),'ready');
});
