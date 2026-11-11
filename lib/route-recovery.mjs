// At most one retry, only for transient transport/provider failures.
export async function withRouteRetry(run){
 try{return await run();}catch(error){
  const code=error.providerStatus;
  if(code===401||code===403||code===429||error.status===422)throw error;
  if(!(code>=500||error.name==='TimeoutError'||error.name==='AbortError'||error instanceof TypeError||error.message==='보행 경로 서비스 연결 실패'))throw error;
  return run();
 }
}
