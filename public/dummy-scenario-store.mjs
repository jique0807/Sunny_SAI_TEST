export const SCENARIO_KEY='sunnySai:dummyScenarios:v1';
export const BUILTIN_SCENARIOS=Object.freeze([
 {id:'rain-flood',name:'폭우·침수경보',type:'flood',initialRain:8,rain:65,temperature:35,warning:true,trigger:38},
 {id:'heat',name:'폭염·대피 안내',type:'heat',initialRain:0,rain:0,temperature:35,warning:false,trigger:38},
 {id:'missing',name:'자료 누락·판정 보류',type:'missing',initialRain:0,rain:0,temperature:25,warning:false,trigger:38}
]);
export function sanitizeScenario(value){
 if(!value||typeof value!=='object'||!['flood','heat','missing'].includes(value.type))throw Error('시나리오 형식을 확인해주세요.');
 const number=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):fallback;
 return {id:String(value.id||'custom').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60)||'custom',
  name:String(value.name||'사용자 시나리오').slice(0,60),type:value.type,
  initialRain:number(value.initialRain,0,200,0),rain:number(value.rain,0,200,65),
  temperature:number(value.temperature,-30,50,35),warning:value.warning===true,
  trigger:number(value.trigger,5,70,38)};
}
export function readScenarios(storage){
 try{const list=JSON.parse(storage?.getItem(SCENARIO_KEY)||'[]');
  return [...BUILTIN_SCENARIOS,...(Array.isArray(list)?list.slice(0,30).map(sanitizeScenario):[])];}
 catch{return [...BUILTIN_SCENARIOS];}
}
export function saveScenario(storage,scenario){
 const item=sanitizeScenario(scenario),custom=readScenarios(storage).filter(s=>!BUILTIN_SCENARIOS.some(b=>b.id===s.id)&&s.id!==item.id);
 storage.setItem(SCENARIO_KEY,JSON.stringify([...custom,item].slice(-30)));return item;
}
