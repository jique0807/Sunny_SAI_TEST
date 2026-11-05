export function assess(f){
 if(!f)return {kind:'unknown',icon:'◌',title:'예보를 확인하지 못했어요',text:'자료가 없거나 예보 범위를 벗어났습니다. 추가 확인이 필요합니다.'};
 if(f.provider==='kma'){
 const flags=[];if((f.rain??f.rainMin??0)>=5)flags.push('시간당 강수 '+f.rainLabel+' 예보');if(f.windSpeed>=14)flags.push('풍속 '+f.windSpeed+' m/s 예보');if([2,3,6,7].includes(f.precipitationType))flags.push('눈 또는 비·눈 예보');
 const values=[];if(typeof f.temperature==='number')values.push(Math.round(f.temperature)+'°C');if(f.rainLabel)values.push('강수 '+f.rainLabel);if(typeof f.windSpeed==='number')values.push('풍속 '+f.windSpeed+' m/s');
 const missing=f.temperature===null||!f.rainLabel||f.windSpeed===null;
 return {kind:flags.length?'attention':missing?'unknown':'normal',icon:flags.length?'🌧':'☁',title:flags.length?'출발 전 확인할 기상조건':missing?'일부 예보 항목 확인 필요':'기상청 '+f.product,text:(flags.length?flags:values).join(' · ')+(flags.length?'. 실제 도로상태는 별도 확인하세요.':missing?' · 일부 항목 결측':' · 격자 예보입니다.')};
 }
 const flags=[];
 if(typeof f.rain==='number'&&f.rain>=5)flags.push(`시간당 강수량 ${f.rain.toFixed(1)} mm 예보`);
 if(typeof f.gust==='number'&&f.gust>=14)flags.push(`순간풍속 ${f.gust.toFixed(1)} m/s 예보`);
 if(typeof f.visibility==='number'&&f.visibility<1000)flags.push(`모델 가시거리 ${Math.round(f.visibility)} m`);
 if(flags.length)return {kind:'attention',icon:'☂',title:'출발 전 확인할 기상조건',text:flags.join(' · ')+'. 실제 도로상태는 별도 확인하세요.'};
 const values=[];if(typeof f.temperature==='number')values.push(`${Math.round(f.temperature)}°C`);if(typeof f.rain==='number')values.push(`강수 ${f.rain.toFixed(1)} mm/h`);if(typeof f.gust==='number')values.push(`돌풍 ${f.gust.toFixed(1)} m/s`);
 const missing=['rain','gust','visibility'].some(k=>typeof f[k]!=='number');
 return {kind:missing?'unknown':'normal',icon:missing?'◌':'☁',title:missing?'일부 예보 항목 확인 필요':'구간별 모델 예보',text:values.join(' · ')+(missing?' · 일부 항목 결측':' · 현재 설정한 알림 기준 미해당')};
}
export class AlertGate { constructor(){this.seen=new Set();} take(id){if(this.seen.has(id))return false;this.seen.add(id);return true;} reset(){this.seen.clear();} }
