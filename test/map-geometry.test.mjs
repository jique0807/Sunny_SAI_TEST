import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectRoute,roadSection,kakaoRouteLink} from '../public/map-geometry.mjs';
test('route projection preserves north, east, fitting and coincident coordinates',()=>{const points=projectRoute([{lat:36,lng:127},{lat:37,lng:128}]);assert.ok(points[1].x>points[0].x);assert.ok(points[1].y<points[0].y);assert.ok(points.every(p=>p.x>=55-1e-6&&p.x<=905+1e-6&&p.y>=55-1e-6&&p.y<=435+1e-6));assert.deepEqual(projectRoute([]),[]);assert.deepEqual(projectRoute([{lat:37,lng:127}]),[{x:480,y:245}]);});
test('selected road section follows provider vertices and clamps endpoints',()=>{const vertices=Array.from({length:30},(_,i)=>({lat:37+i*.001,lng:127}));assert.deepEqual(roadSection(vertices,vertices[15],2),vertices.slice(13,18));assert.deepEqual(roadSection(vertices,vertices[0],2),vertices.slice(0,3));assert.deepEqual(roadSection([],vertices[0]),[]);});
test('Kakao route link uses car mode, latitude then longitude and escaped names',()=>{const u=kakaoRouteLink({name:'출발/위치',lat:37,lng:127},{name:'도착',lat:38,lng:128});assert.match(u,/link\/by\/car\//);assert.ok(u.includes('%2F'));assert.ok(u.includes(',37,127/'));});
