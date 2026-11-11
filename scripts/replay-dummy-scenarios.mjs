import {writeFile} from 'node:fs/promises';
import {BUILTIN_SCENARIOS} from '../public/dummy-scenario-store.mjs';
import {makeSyntheticRiskFixture} from '../public/synthetic-risk-demo.mjs';
const out=process.argv[2]||'docs/validation/dummy-execution-20261111.json';
const cases=[];
for(const mode of ['driving','walking'])for(const [name,scenario,expected] of [
 ['폭우·침수경보',BUILTIN_SCENARIOS[0],'reroute'],
 ['약한 강수·침수경보 없음',{...BUILTIN_SCENARIOS[0],rain:4,warning:false},'advisory'],
 ['고온',BUILTIN_SCENARIOS[1],'heat-advisory'],
 ['자료 누락',BUILTIN_SCENARIOS[2],'abstain']]){
 const route={demo:true,travelMode:mode,mode,provider:'test-route-fixture',departure:'2026-11-11T01:00:00Z',duration:1800,distance:10000,
  rainPath:[{lat:37.55,lng:126.97,seconds:0},{lat:37.5,lng:127.03,seconds:1800}],vertices:[{lat:37.55,lng:126.97},{lat:37.5,lng:127.03}],dummyScenario:scenario};
 const initial=makeSyntheticRiskFixture(route,'initial'),received=makeSyntheticRiskFixture(route,'alert');
 cases.push({name,mode,expected,actual:received.profile.action?.type,pass:received.profile.action?.type===expected,
  trace:[{stage:'initial-input',input:initial.weatherSamples,signals:initial.inputSignals,profile:initial.profile},
   {stage:'new-input',input:received.weatherSamples,signals:received.inputSignals},
   {stage:'engine-assessment',profile:received.profile},{stage:'action-recommendation',action:received.profile.action}]});
}
const report={schema:'sunny-dummy-execution-report-v1',generatedAt:new Date().toISOString(),
 scope:'Actual route-risk core and common advisory policy with synthetic inputs; route geometry is a test fixture. No live map/API/voice/GPS or browser rendering verification.',
 deployed:false,cases,pass:cases.every(c=>c.pass)};
await writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({path:out,pass:report.pass,results:cases.map(({name,mode,actual,pass})=>({name,mode,actual,pass}))},null,2));
if(!report.pass)process.exitCode=1;
