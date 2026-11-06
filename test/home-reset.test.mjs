import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
test('bottom Home and small driving Home both reset to the same initial Kakao map',()=>{
 assert.match(code,/document\.getElementById\('navHome'\)\?\.addEventListener\('click',goToInitialHome\)/);
 assert.match(code,/document\.getElementById\('sunnyDriveHome'\)\?\.addEventListener\('click',goToInitialHome\)/);
 assert.match(code,/document\.getElementById\('sunnyBrandHome'\)\?\.addEventListener\('click',goToInitialHome\)/);
 assert.match(ui,/id="sunnyDriveHome"[^>]*aria-label="초기화면으로 돌아가기"/);
 assert.match(code,/Promise\.resolve\(sessionPromise\)\.then\(async\(\)=>\{await showMap\('kakao'\)/);
});
test('Home clears active GPS navigation and reloads fresh rather than showing previous route',()=>{
 const from=code.indexOf('function goToInitialHome(){');
 const end=code.indexOf("\ndocument.getElementById('navHome')",from);
 assert.ok(from>0&&end>from);
 const events=[];
 const environment={drivingUI:{isActive:()=>true},stopRain(){events.push('stopRain');},
  window:{location:{reload(){events.push('reload');}}}};
 const ctx=vm.createContext(environment);
 vm.runInContext(code.slice(from,end),ctx);
 vm.runInContext('goToInitialHome()',ctx);
 assert.deepEqual(events,['stopRain','reload']);
 events.length=0;environment.drivingUI.isActive=()=>false;
 vm.runInContext('goToInitialHome()',ctx);
 assert.deepEqual(events,['reload']);
});
