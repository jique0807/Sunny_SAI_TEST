const labels = {
 loading:'수신 중',
 received:'연결',
 failed:'연결실패',
 empty:'자료없음',
 disconnected:'연결실패',
};

export function setLayerReception(id,state){
 const badge=document.getElementById(id+'Reception');
 if(!badge)return;
 badge.dataset.state=state;
 badge.textContent=labels[state]??'';
}

export function forecastReception(rows,hasForecast){
 if(rows?.some(hasForecast))return 'received';
 for(const state of ['empty','disconnected']){
  if(rows?.length&&rows.every(row=>row.reception===state))return state;
 }
 return 'failed';
}

export async function fetchWithReception(fetcher,...args){
 try{return await fetcher(...args);}
 catch(error){throw Object.assign(new Error('통신 연결 실패',{cause:error}),{reception:'disconnected',name:error?.name||'Error'});}
}
