'use client';
import {useEffect,useRef,useState} from 'react';
type Point={lat:number;lng:number;name?:string;address?:string};
type Hazard={reason:string;eta:string|null;level:number;lat:number;lng:number;source:string;observedHazard:boolean};
type WalkingResult={route:{distanceMeters:number;durationSeconds:number;geometry:Point[];instructions:{description:string}[];facilities:{lat:number;lng:number;kind:string;status:string;source:string}[];provider:string};assessment:{level:string;score:number|null;reason:string;events:Hazard[];coverage?:number;evaluatedPoints?:number;totalPoints?:number};facilityData:string;caution:string};
declare global {interface Window {kakao?:any}}
export default function Walk(){
 const [session,setSession]=useState<{csrf:string;mapConfig?:{kakao?:string}}|null>(null);
 const [origin,setOrigin]=useState<Point|null>(null),[destination,setDestination]=useState<Point|null>(null);
 const [query,setQuery]=useState(''),[places,setPlaces]=useState<Point[]>([]);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('출발지를 설정하고 도착지를 검색하세요.');
 const [result,setResult]=useState<WalkingResult|null>(null);
 const mapNode=useRef<HTMLDivElement|null>(null),mapRef=useRef<any>(null),drawn=useRef<any[]>([]);
 const [mapReady,setMapReady]=useState(false);
 useEffect(()=>{let active=true;fetch('/api/session',{credentials:'same-origin'}).then(async r=>{if(!r.ok)throw Error('세션을 확인할 수 없습니다.');return r.json()}).then((s:any)=>{if(active)setSession(s)}).catch(e=>{if(active)setMessage(e.message)});return()=>{active=false}},[]);
 useEffect(()=>{const key=session?.mapConfig?.kakao;if(!key||!mapNode.current)return;
   let canceled=false;const attach=()=>{if(canceled||!window.kakao?.maps)return;window.kakao.maps.load(()=>{if(canceled||!mapNode.current)return;mapRef.current=new window.kakao.maps.Map(mapNode.current,{center:new window.kakao.maps.LatLng(37.5665,126.9780),level:5});setMapReady(true)})};
   if(window.kakao?.maps){attach();return()=>{canceled=true}};
   const el=document.createElement('script');el.src='https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey='+encodeURIComponent(key);el.async=true;el.onload=attach;el.onerror=()=>setMessage('지도 SDK 수신 실패 · 도메인 등록과 키 설정을 확인하세요.');document.head.appendChild(el);
   return()=>{canceled=true;el.remove()};
 },[session?.mapConfig?.kakao]);
 useEffect(()=>{if(!mapReady||!mapRef.current||!window.kakao?.maps)return;
    for(const item of drawn.current)item.setMap(null);drawn.current=[];
    const k=window.kakao.maps,map=mapRef.current;
    for(const p of [origin,destination])if(p){const m=new k.Marker({position:new k.LatLng(p.lat,p.lng),map});drawn.current.push(m);}
    if(result?.route.geometry?.length){const coords=result.route.geometry.map(p=>new k.LatLng(p.lat,p.lng));const line=new k.Polyline({path:coords,strokeWeight:5,strokeColor:'#1768ed',strokeOpacity:.9});line.setMap(map);drawn.current.push(line);
      const bounds=new k.LatLngBounds();coords.forEach(p=>bounds.extend(p));map.setBounds(bounds);
      for(const f of (result.route.facilities||[]).filter(f=>f.kind==='횡단보도'||f.kind==='지하보도').slice(0,15)){const label=f.kind==='횡단보도'?'🚶 횡단보도':'🚇 지하보도';const mark=new k.CustomOverlay({position:new k.LatLng(f.lat,f.lng),content:'<span style="display:block;background:#e7f2ff;border:1px solid #1768ed;padding:4px 8px;border-radius:14px;font-weight:bold">'+label+'</span>'});mark.setMap(map);drawn.current.push(mark);}
      for(const e of result.assessment.events.slice(0,12)){if(!Number.isFinite(e.lat)||!Number.isFinite(e.lng))continue;const mark=new k.CustomOverlay({position:new k.LatLng(e.lat,e.lng),content:'<span style="display:block;background:#fff4d2;border:1px solid #af7300;padding:4px 8px;border-radius:14px;font-weight:bold">⚠ 예보 주의</span>'});mark.setMap(map);drawn.current.push(mark);}
    }else if(origin){map.setCenter(new k.LatLng(origin.lat,origin.lng));}
 },[mapReady,origin,destination,result]);
 const post=async(path:string,data:object):Promise<any>=>{if(!session)throw Error('세션 초기화 중입니다.');const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':session.csrf},credentials:'same-origin',body:JSON.stringify(data)});const d:any=await r.json();if(!r.ok)throw Error(d.error||'API 요청 실패');return d};
 const locate=()=>{if(!navigator.geolocation){setMessage('GPS를 사용할 수 없습니다.');return;}setMessage('현재 위치 확인 중…');navigator.geolocation.getCurrentPosition(p=>{setOrigin({lat:p.coords.latitude,lng:p.coords.longitude,name:'현재 위치'});setResult(null);setMessage('현재 위치를 설정했습니다.');},e=>setMessage('GPS 위치 확인 실패: '+e.message),{enableHighAccuracy:true,timeout:12000,maximumAge:10000})};
 const search=async()=>{if(!query.trim())return;setBusy(true);try{const d=await post('/api/search',{query:query.trim()});setPlaces(d.places||[]);setMessage(d.places?.length?'목적지를 선택하세요.':'검색 결과가 없습니다.')}catch(e:any){setMessage(e.message)}finally{setBusy(false)}};
 const find=async()=>{if(!origin||!destination){setMessage('출발지와 도착지를 설정해주세요.');return;}setBusy(true);setResult(null);setMessage('TMAP 도보 경로 및 기상청 예보 조회 중…');try{const d=await post('/api/pedestrian/route',{origin,destination,departure:new Date().toISOString()});setResult(d);setMessage(d.caution)}catch(e:any){setMessage(e.message)}finally{setBusy(false)}};
 const badge=(level:string)=>level==='incomplete'?'일부 예보 미수신':level==='high'?'높음':level==='caution'?'주의':level==='low'?'낮음':'예보 확인 불가';
 return <main style={{fontFamily:'system-ui, sans-serif',maxWidth:1000,margin:'auto',padding:'16px',color:'#203247',lineHeight:1.5}}>
 <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:20}}>
 <div><strong style={{fontSize:22}}>Sunny SAI · 도보</strong><div style={{fontSize:12,color:'#64748b'}}>도보 경로와 기상예보 위험 확인 · 시험 기능</div></div><a href="/" style={{color:'#1768ed'}}>차량 내비게이션</a></header>
 <section style={{display:'grid',gap:12,gridTemplateColumns:'repeat(auto-fit,minmax(270px,1fr))'}}>
 <div style={{border:'1px solid #dce3ec',borderRadius:14,padding:16}}>
 <h2 style={{fontSize:17,margin:'0 0 12px'}}>도보 경로 탐색</h2>
 <button onClick={locate} type="button" style={{padding:12,width:'100%'}}>◎ GPS 현재 위치 설정</button>
 <p style={{fontSize:12}}>출발: {origin?.name||'미설정'} {origin?'('+origin.lat.toFixed(5)+', '+origin.lng.toFixed(5)+')':''}</p>
 <label htmlFor="walk-destination">도착지 검색</label><div style={{display:'flex',gap:6,marginTop:6}}><input id="walk-destination" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void search()}} placeholder="예: 서울역" style={{padding:10,flex:1,minWidth:0}}/><button onClick={search} disabled={busy||!session} type="button">검색</button></div>
 <div role="listbox" aria-label="목적지 검색 결과" style={{maxHeight:140,overflow:'auto'}}>{places.map((p,i)=><button type="button" key={i} onClick={()=>{setDestination(p);setPlaces([]);setResult(null);setMessage('목적지: '+(p.name||p.address||'선택됨'))}} style={{display:'block',width:'100%',padding:8,textAlign:'left',marginTop:4}}>{p.name||p.address||'검색 지점'}</button>)}</div>
 <p style={{fontSize:12}}>도착: {destination?.name||destination?.address||'미선택'}</p>
 <button type="button" disabled={busy||!session||!origin||!destination} onClick={find} style={{background:'#1768ed',color:'white',border:0,borderRadius:8,padding:14,width:'100%'}}>도보 경로와 위험 확인</button>
 <p role="status" aria-live="polite" style={{fontSize:12,whiteSpace:'pre-wrap'}}>{message}</p>
 </div>
 <div style={{border:'1px solid #dce3ec',borderRadius:14,overflow:'hidden',minHeight:330,position:'relative'}}><div ref={mapNode} aria-label="도보 경로 지도" style={{width:'100%',height:'100%',minHeight:330}}></div>{!mapReady&&<p style={{position:'absolute',top:12,left:12,background:'white',padding:8}}>지도 준비 중 또는 지도 SDK 연결 미확인</p>}</div>
 </section>
 <section style={{marginTop:16,border:'1px solid #dce3ec',borderRadius:14,padding:16}}>
 <h2 style={{fontSize:17,margin:'0 0 12px'}}>도보 위험평가</h2>
 {!result?<p>경로 탐색 후 기상 예보 기반 위험정보가 표시됩니다.</p>:<>
 <p><strong>{(result.route.distanceMeters/1000).toFixed(2)} km · {Math.round(result.route.durationSeconds/60)}분</strong> / 기상 예보 주의도: <strong>{badge(result.assessment.level)}</strong></p>
 <p>{result.assessment.reason}</p>
 <p style={{fontSize:12}}>기상자료 확보율: {result.assessment.totalPoints?`${result.assessment.evaluatedPoints||0}/${result.assessment.totalPoints} 지점`: '미확인'}</p>
 <p style={{fontSize:12}}>TMAP 제공 경로 시설 정보: {result.route.facilities?.length||0}건 (실시간 통제/침수 관측 아님)</p>
 {(result.route.facilities||[]).length>0&&<details><summary>횡단보도·지하보도·보행시설 위치</summary><ul>{result.route.facilities.map((f,i)=><li key={i}>{f.kind} · {f.source}</li>)}</ul></details>}
 <p style={{fontSize:12}}>위험 지점 {result.assessment.events.length}건 · 시설물 위치 및 침수·결빙 현장 관측은 미연결</p>
 <ul>{result.assessment.events.slice(0,12).map((event,i)=><li key={i}>{event.reason} · {event.eta?new Date(event.eta).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'시각 미제공'} · {event.source}</li>)}</ul>
 {result.route.instructions.length>0&&<details><summary>TMAP 도보 경로 안내 지점</summary><ol>{result.route.instructions.map((v,i)=><li key={i}>{v.description}</li>)}</ol></details>}
 </>}
 <p style={{fontSize:12,color:'#667085'}}>안전 안내: 시설물 통행 가능 여부와 실시간 침수·노면 결빙 여부를 확정할 수 없습니다. 실제 통제 및 현장 안내를 우선하세요.</p></section></main>
}
