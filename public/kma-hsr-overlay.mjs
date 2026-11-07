// Real KMA HSR/HSP observation PNG handling for the main Sunny SAI Kakao map.
// Preview-only server endpoint supplies actual observation time and LCC bounds
// in the SAME response as the transparent PNG, preventing stale-frame overlays.
// Never derive mm/h from radar reflectivity colours or fabricate unavailable rain.
import {renderRadarImage} from './radar-geometry.mjs';
export const HSR_MAX_FRAME=6;
export function parseHSRFrameHeaders(headers,frame){
 if(!Number.isInteger(frame)||frame<0||frame>HSR_MAX_FRAME)
  throw Error('레이더 10분 프레임 범위 초과');
 const timeKst=headers?.get?.('x-radar-obs-kst')||'';
 const projection=headers?.get?.('x-radar-projection')||'';
 const interval=headers?.get?.('x-radar-interval-minutes')||'';
 const returnedFrame=headers?.get?.('x-radar-frame')||'';
 const raw=headers?.get?.('x-radar-coverage')||'';
 if(!/^\d{12}$/.test(timeKst)||projection!=='LCC'||interval!=='10'||
    returnedFrame!==String(frame))
  throw Error('레이더 관측시각 또는 투영정보 검증 실패');
 if(raw.split(',').length!==4)throw Error('레이더 투영 좌표 범위 미확인');
 const [left,top,right,bottom]=raw.split(',').map(Number);
 if([left,top,right,bottom].some(v=>!Number.isFinite(v))||
    right<=left||top<=bottom||right-left<1000||top-bottom<1000||
    [left,top,right,bottom].some(v=>Math.abs(v)>10000000))
  throw Error('레이더 투영 좌표 범위 오류');
 return {timeKst,coverage:{left,top,right,bottom},frame};
}
export const radarKstLabel=timestamp=>
 /^\d{12}$/.test(timestamp||'')
 ?timestamp.slice(0,4)+'.'+timestamp.slice(4,6)+'.'+timestamp.slice(6,8)+' '+
  timestamp.slice(8,10)+':'+timestamp.slice(10,12)+' KST'
 :'관측시각 확인 불가';
export async function loadHSRFrame(frame,{
 signal,waitForSession,fetcher=fetch,ImageCtor=globalThis.Image,
 makeObjectURL=blob=>URL.createObjectURL(blob),
 revokeObjectURL=url=>URL.revokeObjectURL(url)
}={}){
 if(!Number.isInteger(frame)||frame<0||frame>HSR_MAX_FRAME)
  throw Error('레이더 10분 프레임 범위 초과');
 if(typeof waitForSession==='function')await waitForSession();
 if(signal?.aborted)throw Object.assign(Error('Aborted'),{name:'AbortError'});
 const response=await fetcher('/api/radar-overlay-frame?mode=latest&frame='+frame,{
  credentials:'same-origin',cache:'no-store',signal
 });
 if(!response.ok){
  let message='기상청 레이더 응답 HTTP '+response.status;
  try{const value=await response.json();
   if(typeof value.error==='string')message=value.error.slice(0,140);
  }catch{}
  throw Error(message);
 }
 const info=parseHSRFrameHeaders(response.headers,frame);
 const blob=await response.blob();
 if(blob.type!=='image/png'||blob.size<33||blob.size>4*1024*1024)
  throw Error('기상청 레이더 PNG 파일 검증 실패');
 if(typeof ImageCtor!=='function')throw Error('브라우저 이미지 디코더 미지원');
 const url=makeObjectURL(blob),image=new ImageCtor();
 try{
  await new Promise((resolve,reject)=>{
   image.onload=resolve;image.onerror=()=>reject(Error('레이더 PNG 디코딩 실패'));
   image.src=url;
  });
  if(signal?.aborted)throw Object.assign(Error('Aborted'),{name:'AbortError'});
  if(!(image.naturalWidth||image.width)||!(image.naturalHeight||image.height))
   throw Error('레이더 영상 크기 확인 실패');
  return {image,url,...info};
 }catch(e){revokeObjectURL(url);throw e;}
}
export function drawHSROverKakao(ctx,frame,projection,dpr=1){
 if(!frame?.image||!frame.coverage||!ctx||
    typeof projection?.containerPointFromCoords!=='function'||
    !globalThis.kakao?.maps?.LatLng)return 0;
 return renderRadarImage(ctx,frame.image,frame.coverage,
  p=>projection.containerPointFromCoords(
   new globalThis.kakao.maps.LatLng(p.lat,p.lng)),dpr,12);
}
