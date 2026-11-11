// Bounded recovery policy. No network, timers, credentials or cached incidents.
export function createItsFeedLifecycle(){
 let next=0,pending=null,sequence=0,failures=0,lastReceived=null;
 return {
  begin(now){
   if(!Number.isFinite(now)||pending!==null||now<next)return null;
   pending=++sequence;return pending;
  },
  settle(token,status,now){
   if(token!==pending||pending===null)return false;
   pending=null;
   if(['received','empty'].includes(status)){
    failures=0;lastReceived=now;next=now+180000;
   }else{
    failures=Math.min(failures+1,5);
    next=now+Math.min(600000,60000*2**(failures-1));
   }
   return true;
  },
  cancel(token){if(token===pending){pending=null;next=0;}},
  isStale(now){return lastReceived===null||now-lastReceived>=180000;},
  snapshot(){return {nextAttemptAt:next,pending:pending!==null,failures,lastReceived};}
 };
}
