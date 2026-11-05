// Official KMA 5-km Lambert conformal grid. Geometry is per queried cell only:
// it must never be interpolated into unqueried areas.
import {toGrid,kmaWeather} from './kma.mjs';
const rad=Math.PI/180;
const re=6371.00877/5,slat1=30*rad,slat2=60*rad,lon0=126*rad;
const sn=Math.log(Math.cos(slat1)/Math.cos(slat2))/Math.log(Math.tan(Math.PI/4+slat2/2)/Math.tan(Math.PI/4+slat1/2));
const sf=Math.tan(Math.PI/4+slat1/2)**sn*Math.cos(slat1)/sn;
const ro=re*sf/Math.tan(Math.PI/4+38*rad/2)**sn;
export function fromGrid(nx,ny){
 const x=nx-43,y=ro+136-ny,r=Math.hypot(x,y);
 if(!Number.isFinite(r)||r<1e-8)throw Error('격자 좌표 오류');
 const lat=(2*Math.atan((re*sf/r)**(1/sn))-Math.PI/2)/rad;
 const lng=(lon0+Math.atan2(x,y)/sn)/rad;
 return {lat,lng};
}
export function cellGeometry(grid){
 const {nx,ny}=grid;
 return {
  center:fromGrid(nx,ny),
  corners:[fromGrid(nx-.5,ny-.5),fromGrid(nx+.5,ny-.5),fromGrid(nx+.5,ny+.5),fromGrid(nx-.5,ny+.5)]
 };
}
export async function kmaMapForecast(points,key,fetcher=fetch,now=Date.now()){
 if(!key)throw Object.assign(Error('KMA key missing'),{status:503});
 if(!Array.isArray(points)||!points.length||points.length>9||
    points.some(p=>!p||typeof p.lat!=='number'||typeof p.lng!=='number'||
      !Number.isFinite(p.lat)||!Number.isFinite(p.lng)||p.lat<32||p.lat>40||p.lng<123||p.lng>133))
   throw Object.assign(Error('Invalid map sampling points'),{status:400});
 // Remove duplicate 5-km cells, avoid needless official API calls.
 const unique=new Map();
 for(const p of points){const grid=toGrid(p.lat,p.lng),id=grid.nx+':'+grid.ny;if(!unique.has(id))unique.set(id,{...p,grid});}
 const validTime=new Date(Math.ceil((now+90*60000)/3600000)*3600000).toISOString();
 const result=await kmaWeather([...unique.values()].map(({lat,lng})=>({lat,lng,eta:validTime})),key,fetcher,now,true);
 return {
  provider:'kma',product:'초단기예보',source:'기상청 API허브 · 5km 격자 초단기예보',
  sourceUrl:'https://apihub.kma.go.kr/',validTime,issuedAt:result.samples.find(x=>x.forecast)?.forecast?.issuedAt||null,
  fetchedAt:result.fetchedAt,
  cells:result.samples.map(s=>{
   const geometry=cellGeometry(s.grid);
   return {grid:s.grid,...geometry,status:s.status,forecast:s.forecast,
      // Keep errors bounded to known proxy-produced messages, never expose upstream URLs or keys.
      error:s.status==='unavailable'?'해당 격자의 예보 자료를 받지 못했습니다.':null};
  }),
  caution:'실제 기상청 5km 격자 표본 셀만 표출합니다. 조회하지 않은 영역은 결측이며, 기상레이더 강수영상·적설량·실측·도로위험이 아닙니다. 눈은 PTY 강수형태 예보입니다.'
 };
}
