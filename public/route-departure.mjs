// Never reuse the page-load timestamp for a later route search.
// An untouched default must follow the real wall clock, while explicit user choices stay intact.
export function resolveRouteDeparture(input,{userEdited=false,now=Date.now()}={}){
 if(!Number.isFinite(now))throw Error('현재 시각을 확인할 수 없습니다.');
 if(!userEdited)return {iso:new Date(now+120000).toISOString(),refreshed:true};
 const chosen=Date.parse(input);
 if(!Number.isFinite(chosen))throw Error('출발시각을 확인해주세요.');
 if(chosen<now-600000)throw Error('설정한 출발시각이 지났습니다. 현재 시각으로 변경하거나 새 시간을 선택해주세요.');
 if(chosen>now+86400000)throw Error('출발시각은 지금부터 24시간 이내로 선택해주세요.');
 return {iso:new Date(chosen).toISOString(),refreshed:false};
}
