// Safe ITS transport diagnostics for the server-side Node.js fetch adapter.
// Converts error TYPES / CAUSE CODES to a small allow-list, never raw messages,
// IPs, API keys, request URLs, stack traces or arbitrary provider responses.
// A transport failure is never equivalent to zero traffic events.
const CODES=Object.freeze({
 ENOTFOUND:['dns_error','ITS 기관 도메인 조회 실패'],
 EAI_AGAIN:['dns_error','ITS 기관 도메인 조회 지연'],
 ETIMEDOUT:['timeout','ITS 기관 네트워크 응답시간 초과'],
 UND_ERR_CONNECT_TIMEOUT:['timeout','ITS 기관 네트워크 연결시간 초과'],
 ECONNREFUSED:['connect_error','ITS 기관 TCP 연결 거부'],
 ECONNRESET:['connect_error','ITS 기관 TCP 연결 중단'],
 EHOSTUNREACH:['connect_error','ITS 기관 네트워크 경로 도달 불가'],
 ENETUNREACH:['connect_error','ITS 기관 네트워크 경로 도달 불가'],
 EPIPE:['connect_error','ITS 기관 연결이 종료됨'],
 UND_ERR_SOCKET:['connect_error','ITS 기관 네트워크 소켓 연결 오류'],
 ERR_TLS_CERT_ALTNAME_INVALID:['tls_error','ITS 기관 TLS 인증서 이름 확인 실패'],
 CERT_HAS_EXPIRED:['tls_error','ITS 기관 TLS 인증서 유효기간 문제'],
 UNABLE_TO_VERIFY_LEAF_SIGNATURE:['tls_error','ITS 기관 TLS 인증서 검증 실패'],
 DEPTH_ZERO_SELF_SIGNED_CERT:['tls_error','ITS 기관 TLS 인증서 신뢰성 확인 실패'],
 SELF_SIGNED_CERT_IN_CHAIN:['tls_error','ITS 기관 TLS 인증서 체인 검증 실패']
});
const FALLBACK=Object.freeze({status:'failed',reasonCode:'network_error',reason:'ITS 기관 네트워크 연결 실패'});
export function classifyItsTransportFailure(error){
 const queue=[error],seen=new Set();let steps=0;
 while(queue.length&&steps++<10){
  const err=queue.shift();
  if(!err||typeof err!=='object'||seen.has(err))continue;
  seen.add(err);
  if(['TimeoutError','AbortError'].includes(err.name))
   return {status:'failed',reasonCode:'timeout',reason:'ITS 기관 응답시간 초과'};
  const code=String(err.code||'');
  if(Object.hasOwn(CODES,code)){
   const [reasonCode,reason]=CODES[code];
   return {status:'failed',reasonCode,reason};
  }
  if(err.cause)queue.push(err.cause);
  if(Array.isArray(err.errors))queue.push(...err.errors.slice(0,6));
 }
 return {...FALLBACK};
}
