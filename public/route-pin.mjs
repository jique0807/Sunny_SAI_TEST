// Distinct route endpoint/location markers; only display a current-position marker
// after the browser has supplied a real GPS fix (never infer position on route).
export const ROUTE_PINS=Object.freeze({
 start:Object.freeze({text:'S',label:'출발지'}),
 current:Object.freeze({text:'●',label:'현재 위치'}),
 destination:Object.freeze({text:'⚑',label:'목적지'})
});
export function createRoutePin(kind,doc=globalThis.document){
 const spec=ROUTE_PINS[kind];if(!spec||!doc?.createElement)throw Error('유효한 경로 마커가 아닙니다.');
 const root=doc.createElement('div');
 root.className='sunny-route-point-pin';root.dataset.kind=kind;
 root.setAttribute('role','img');root.setAttribute('aria-label',spec.label);
 const face=doc.createElement('span');face.className='sunny-route-pin-face';
 face.textContent=spec.text;face.setAttribute('aria-hidden','true');
 const label=doc.createElement('small');label.textContent=spec.label;
 label.setAttribute('aria-hidden','true');
 root.append(face,label);return root;
}
