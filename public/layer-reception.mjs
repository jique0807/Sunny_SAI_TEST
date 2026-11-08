const labels = {
 loading:'수신 중',
 received:'수신 완료',
 failed:'수신 실패',
 waiting:'조회 대기',
};

export function setLayerReception(id,state){
 const badge=document.getElementById(id+'Reception');
 if(!badge)return;
 badge.dataset.state=state;
 badge.textContent=labels[state]??'';
}
