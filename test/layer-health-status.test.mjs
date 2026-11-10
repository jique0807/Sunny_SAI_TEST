import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LAYER_HEALTH_SOURCES,summarizeLayerHealth,initLayerHealth} from '../public/layer-health-status.mjs';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../lib/ui.ts',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('all 17 existing menu toggles get dual API and received-data status without a new dialog',()=>{
 assert.equal(LAYER_HEALTH_SOURCES.length,17);
 assert.equal(new Set(LAYER_HEALTH_SOURCES.map(x=>x[0])).size,17);
 for(const [id] of LAYER_HEALTH_SOURCES)assert.equal(ui.split('id="'+id+'"').length-1,1,id);
 assert.match(app,/initLayerHealth\(\{document\}\)/);
 assert.match(app,/onUpdate:\(values,meta\)=>/);
});
test('key configured is not a proven received API response',()=>{
 const state=summarizeLayerHealth({state:'configured',keyRegistered:true});
 assert.equal(state.api,'API: 키 등록');
 assert.equal(state.data,'자료: 검사 전');
 assert.equal(summarizeLayerHealth({state:'ok',keyRegistered:true}).data,'자료: 수신 성공');
 assert.equal(summarizeLayerHealth({state:'empty',keyRegistered:true}).data,'자료: 자료 없음');
 assert.equal(summarizeLayerHealth({state:'partial',keyRegistered:true}).data,'자료: 일부 수신·정합 확인 전');
 assert.equal(summarizeLayerHealth({state:'ok',keyRegistered:true},'precipitation-type-unverified').data,'자료: PTY 별도 수신 미확인');
 assert.equal(summarizeLayerHealth({state:'ok',keyRegistered:true},'walking-facilities-unverified').data,'자료: 시설별 위치 검증 전');
});
test('status badges use existing layer-row DOM, no inline HTML injection',()=>{
 const nodes=new Map(), created=[];
 const element=(tag='div')=>({tag,children:[],dataset:{},title:'',textContent:'',
  append(...xs){this.children.push(...xs)},createElement(){},closest(){return this.row},
  querySelector(){return this.copy},setAttribute(){},getElementById(){}});
 const document={createElement(tag){const e=element(tag);created.push(e);return e;},
  getElementById(id){if(!nodes.has(id)){const copy=element('span'),row=element('label');
   row.querySelector=()=>copy;const x=element('input');x.row=row;nodes.set(id,x);}return nodes.get(id);}};
 const panel=initLayerHealth({document});
 assert.equal(panel.visibleCount(),17);
 panel.update({gk2aRr:{state:'partial',keyRegistered:true,detail:'PNG 900x922 · LCC 정합 전'}});
 const rr=nodes.get('navGk2aRr').row.querySelector().children.at(-1);
 assert.match(rr.title,/900x922/);assert.equal(rr.children[0].textContent,'API: 응답 확인');
 assert.equal(rr.children[1].textContent,'자료: 일부 수신·정합 확인 전');
});
