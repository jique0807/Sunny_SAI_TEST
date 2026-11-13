// ITS official Open API (Ministry of Land, Infrastructure and Transport)
// Adapter for JSON envelopes. Pure input parser; never accesses credentials or network.
// Supports response.body.items.item (official), top-level arrays and legacy forms.
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const first=(obj,...keys)=>keys.reduce((acc,k)=>acc===undefined?obj?.[k]:acc,undefined);

export function itsResultCode(raw){
 const root=isObject(raw)?raw:{};
 const outer=isObject(root.response)?root.response:root;
 const code=first(outer.header,'resultCode','resultcode','result_code')??
   first(outer,'resultCode','resultcode','result_code')??
   first(root.header,'resultCode','resultcode','result_code');
 if(code===null||code===undefined||code==='')return null;
 return String(code).trim().toUpperCase();
}
export function itsProviderRejected(raw){
 const code=itsResultCode(raw);
 return code!==null&&!new Set(['0','00','0000','200','SUCCESS','NORMAL_CODE']).has(code);
}

export function itsProviderRecords(raw){
 if(Array.isArray(raw))return raw;
 if(!isObject(raw))return null;
 const res=isObject(raw.response)?raw.response:raw;
 const body=isObject(res.body)?res.body:res;
 const candidates=[body.items?.item,body.items,body.data,body.eventInfo,body.trafficInfo,
  res.items?.item,res.items,res.data,res.eventInfo,res.trafficInfo,
  raw.items?.item,raw.data,raw.eventInfo,raw.trafficInfo];
 for(const candidate of candidates){
  if(Array.isArray(candidate))return candidate;
  if(isObject(candidate)&&Array.isArray(candidate.item))return candidate.item;
  if(isObject(candidate)&&isObject(candidate.item))return [candidate.item];
  // The OpenAPI sometimes serializes a single <item> as an object.
  if(isObject(candidate)&&['coordX','coordx','coordY','coordy','linkId','linkid','speed','eventType'].some(k=>candidate[k]!==undefined))return [candidate];
 }
 const total=first(body,'totalCount','totalcount')??first(res,'totalCount','totalcount')??first(raw,'totalCount','totalcount');
 if(total!==undefined&&total!==null&&total!==''&&Number(total)===0)return [];
 return null; // unknown schema must NOT be interpreted as zero traffic events
}
