import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('Kakao map boot binds the DOM selector before top-level event registrations',()=>{
 const declaration=source.indexOf('const $=id=>document.getElementById(id);');
 const firstUse=source.indexOf("$('navLayerWeather')");
 assert.ok(declaration>=0,'DOM selector must be declared');
 assert.ok(firstUse>declaration,'Using the DOM selector before its declaration freezes Kakao map startup');
 assert.equal(source.split('const $=').length-1,1,'DOM selector must have one declaration');
 assert.ok(source.includes("await showMap('kakao')"),'startup must initialize Kakao map');
});
