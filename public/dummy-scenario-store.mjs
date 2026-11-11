export const SCENARIO_KEY='sunnySai:dummyScenarios:v1';
export const BUILTIN_SCENARIOS=Object.freeze([
 {id:'rain-flood',name:'폭우·침수경보',type:'flood',initialRain:8,rain:65,temperature:35,warning:true,trigger:45},
 {id:'heat',name:'폭염·대피 안내',type:'heat',initialRain:0,rain:0,temperature:35,warning:false,trigger:45},
 {id:'missing',name:'자료 누락·판정 보류',type:'missing',initialRain:0,rain:0,temperature:25,warning:false,trigger:45},
 {id:'rain-only',name:'폭우 예보만 수신 · 주의 안내',type:'flood',initialRain:0,rain:65,temperature:25,warning:false,trigger:45},
 {id:'light-rain',name:'약한 비 · 경로 유지',type:'flood',initialRain:0,rain:4,temperature:25,warning:false,trigger:45},
 {id:'dry',name:'위험 신호 없음',type:'flood',initialRain:0,rain:0,temperature:25,warning:false,trigger:45},
 {id:'snow',name:'눈 예보 · 미끄럼 주의',type:'snow',initialRain:0,rain:0,temperature:-1,warning:false,trigger:45},
 {id:'wind',name:'강풍 · 이동 주의',type:'wind',initialRain:0,rain:0,temperature:20,windSpeed:18,warning:false,trigger:45},
 {id:'stale',name:'오래된 예보 · 유효시각 불일치',type:'stale',initialRain:0,rain:0,temperature:25,warning:false,trigger:45},
 {id:'offroute',name:'경로 밖 자료 · 정합 실패',type:'offroute',initialRain:0,rain:0,temperature:25,warning:false,trigger:45},
 {id:'partial',name:'예보 일부 누락 · 판단 보류',type:'partial',initialRain:0,rain:0,temperature:25,warning:false,trigger:45}
]);
export function sanitizeScenario(value){
 if(!value||typeof value!=='object'||!['flood','heat','missing','snow','wind','stale','offroute','partial'].includes(value.type))throw Error('시나리오 형식을 확인해주세요.');
 const number=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):fallback;
 const result={id:String(value.id||'custom').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60)||'custom',
  name:String(value.name||'사용자 시나리오').slice(0,60),type:value.type,
  initialRain:number(value.initialRain,0,200,0),rain:number(value.rain,0,200,65),
  temperature:number(value.temperature,-30,50,35),windSpeed:number(value.windSpeed,0,100,18),warning:value.warning===true,
  trigger:number(value.trigger,5,70,45)};
 const event=(v,emergency)=>{if(!v||!['rain','flood','heat','snow','wind','fog','ice','hotspot','missing','stale','offroute','partial'].includes(v.kind))throw Error('지원하지 않는 이벤트입니다.');
 const position=number(v.position,10,95,emergency?75:35),trigger=emergency?number(v.trigger,1,85,45):0;
 if(emergency&&trigger>=position)throw Error('긴급자료 수신 시점은 위험 위치보다 앞이어야 합니다.');
 const bounds=v.kind==='heat'?[-30,50]:v.kind==='fog'?[0,10000]:v.kind==='wind'?[0,100]:v.kind==='hotspot'?[1,10000]:[0,200];return {kind:v.kind,position,trigger,value:number(v.value,...bounds,v.kind==='hotspot'?1:0)};};
 if(Array.isArray(value.events)||Array.isArray(value.emergencies)){
 const unique=list=>Array.from(new Map(list.map(v=>[JSON.stringify(v),v])).values());
 result.events=unique((value.events||[]).slice(0,8).map(v=>event(v,false)));
 result.emergencies=unique((value.emergencies||[]).slice(0,8).map(v=>event(v,true))).sort((a,b)=>a.trigger-b.trigger);
 result.trigger=result.emergencies[0]?.trigger||45;
 }
 if(value.journey&&['driving','walking'].includes(value.journey.mode)){const place=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat>=32&&p.lat<=40&&p.lng>=123&&p.lng<=133?{lat:p.lat,lng:p.lng,name:String(p.name||'선택 지점').slice(0,100)}:null;result.journey={mode:value.journey.mode,origin:place(value.journey.origin),destination:place(value.journey.destination)};}
 return result;
}
export function readScenarios(storage){
 try{const list=JSON.parse(storage?.getItem(SCENARIO_KEY)||'[]');
  const items=[...BUILTIN_SCENARIOS,...(Array.isArray(list)?list.slice(0,30).map(sanitizeScenario):[])],seen=new Set();return items.filter(item=>{const s=scenarioEvents(item),key=JSON.stringify([s.events.map(e=>[e.kind,e.position,e.value]).sort(),s.emergencies.map(e=>[e.kind,e.position,e.trigger,e.value]).sort(),s.journey||null]);if(seen.has(key))return false;seen.add(key);return true;});}
 catch{return [...BUILTIN_SCENARIOS];}
}
export function saveScenario(storage,scenario){
 let item=sanitizeScenario(scenario);const signature=s=>JSON.stringify([s.events,s.emergencies,s.journey]);const existing=readScenarios(storage).find(s=>s.events&&item.events&&signature(s)===signature(item));if(existing)item={...item,id:existing.id};const custom=readScenarios(storage).filter(s=>!BUILTIN_SCENARIOS.some(b=>b.id===s.id)&&s.id!==item.id);
 storage.setItem(SCENARIO_KEY,JSON.stringify([...custom,item].slice(-30)));return item;
}

export function scenarioEvents(s){
 if(Array.isArray(s.events))return s;
 return {...s,events:s.initialRain>0?[{kind:'rain',position:35,trigger:0,value:s.initialRain}]:[],
 emergencies:s.id==='dry'?[]:[{kind:s.type==='flood'?(s.warning?'flood':'rain'):s.type,position:75,trigger:s.trigger||45,value:s.type==='heat'?s.temperature:s.type==='wind'?s.windSpeed||18:s.rain}]};
}
