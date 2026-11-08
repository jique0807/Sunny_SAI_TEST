// KMA Road Risk Weather Data (API Hub road_file_down.php).
// Fetches official highway-specific ZIP archives. Values with no verified
// geographic geometry are NOT drawn as road hazards.
import {inflateRawSync} from 'node:zlib';
const HOST='https://apihub.kma.go.kr/api/typ04/url/road_file_down.php';
export const ROAD_NAMES=Object.freeze({
 '001':'경부','012':'무안광주대구','015':'서해안','020':'새만금포항',
 '025':'호남','027':'순천완주','030':'서산영덕','035':'통영대전중부',
 '045':'중부내륙','050':'영동','055':'중앙','251':'호남지선'
});
const MAX_ZIP=6*1024*1024, MAX_ENTRY=2*1024*1024;
const nameKey=k=>String(k).normalize('NFKC').trim().toLowerCase().replace(/[\s_\-()]/g,'');
const num=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
const latlon=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=32&&lat<=40&&lng>=123&&lng<=133?{lat,lng}:null;
const error=(status,message)=>Object.assign(Error(message),{status});
function dec(buf){
 const u=new TextDecoder('utf-8',{fatal:false}).decode(buf);
 if(u.includes('\uFFFD')){try{return new TextDecoder('euc-kr').decode(buf);}catch{return u;}}
 return u;
}
export function extractZipFiles(binary){
 const buf=Buffer.from(binary);
 if(buf.length<22||buf.length>MAX_ZIP)throw error(502,'도로위험 ZIP 크기 또는 형식을 확인할 수 없습니다.');
 let eocd=-1;
 for(let pos=buf.length-22;pos>=Math.max(0,buf.length-65557);pos--){
  if(buf.readUInt32LE(pos)===0x06054b50){eocd=pos;break;}
 }
 if(eocd<0)throw error(502,'기상청 응답이 ZIP 파일이 아닙니다. API 활용승인을 확인하세요.');
 const n=buf.readUInt16LE(eocd+10),at=buf.readUInt32LE(eocd+16);
 if(n>75||at>=eocd)throw error(502,'도로위험 ZIP 목록을 해석할 수 없습니다.');
 let pos=at,total=0;const files=[];
 for(let i=0;i<n;i++){
  if(pos+46>eocd||buf.readUInt32LE(pos)!==0x02014b50)throw error(502,'도로위험 ZIP 목차 형식 오류');
  const method=buf.readUInt16LE(pos+10),size=buf.readUInt32LE(pos+20),
    plainSize=buf.readUInt32LE(pos+24),nameLen=buf.readUInt16LE(pos+28),
    extra=buf.readUInt16LE(pos+30),comment=buf.readUInt16LE(pos+32),
    offset=buf.readUInt32LE(pos+42),flags=buf.readUInt16LE(pos+8);
  if(flags&1||size>MAX_ENTRY||plainSize>MAX_ENTRY||total+plainSize>4*MAX_ENTRY)throw error(502,'도로위험 ZIP 제한 크기 초과');
  const name=dec(buf.subarray(pos+46,pos+46+nameLen));
  pos+=46+nameLen+extra+comment;
  if(!/\.(?:txt|csv|json|geojson)$/i.test(name))continue;
  if(![0,8].includes(method)||offset+30>buf.length||buf.readUInt32LE(offset)!==0x04034b50)continue;
  const start=offset+30+buf.readUInt16LE(offset+26)+buf.readUInt16LE(offset+28);
  if(start+size>buf.length)throw error(502,'도로위험 ZIP 데이터 범위 오류');
  const compressed=buf.subarray(start,start+size);
  let contents;
  try{contents=method===8?inflateRawSync(compressed,{maxOutputLength:MAX_ENTRY}):compressed;}
  catch{throw error(502,'도로위험 ZIP 데이터 압축 해제 실패');}
  if(contents.length>MAX_ENTRY)throw error(502,'도로위험 ZIP 내용 크기 제한 초과');
  total+=contents.length;
  files.push({name:name.slice(-180),text:dec(contents)});
 }
 return files;
}
function splitDelimited(line,separator){
 const out=[];let word='',quoted=false;
 for(let i=0;i<line.length;i++){
  const c=line[i];
  if(c==='"'){if(quoted&&line[i+1]==='"'){word+='"';i++;}else quoted=!quoted;}
  else if(c===separator&&!quoted){out.push(word.trim());word='';}
  else word+=c;
 }
 out.push(word.trim());return out;
}
function records(file){
 if(/\.geojson$|\.json$/i.test(file.name)){
  try{
   const data=JSON.parse(file.text),items=Array.isArray(data)?data:Array.isArray(data.features)?data.features:
     Array.isArray(data.items)?data.items:Array.isArray(data.records)?data.records:[];
   return items.slice(0,2000).map(x=>({...(x.properties||x),geometry:x.geometry??x.properties?.geometry}));
  }catch{return [];}
 }
 const lines=file.text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim()&&!x.trim().startsWith('#'));
 if(lines.length<2)return [];
 const first=lines[0],sep=first.includes('\t')?'\t':first.includes(',')?',':'|';
 const header=splitDelimited(first,sep);
 // No header -> do not infer arbitrary fixed-column positions.
 const names=header.map(nameKey);
 if(!names.some(n=>/^(lat|latitude|위도|lon|lng|longitude|경도|geometry|geom|wkt|linkid|stdlinkid|표준링크id)$/.test(n)))return [];
 return lines.slice(1,2001).map(line=>Object.fromEntries(names.map((key,i)=>[key,splitDelimited(line,sep)[i]])));
}
function prop(row,...keys){
 const obj=Object.fromEntries(Object.entries(row).map(([k,v])=>[nameKey(k),v]));
 for(const key of keys)if(obj[nameKey(key)]!==undefined)return obj[nameKey(key)];
 return null;
}
function parseGeometry(row){
 let geom=prop(row,'geometry','geom','wkt','location_data');
 if(typeof geom==='string'){
  if(geom.trim().startsWith('{')){try{geom=JSON.parse(geom);}catch{}}
  else{
   const w=geom.match(/^\s*(POINT|LINESTRING)\s*\((.+)\)\s*$/i);
   if(w){
    const points=w[2].replace(/[()]/g,'').split(',').map(p=>{const a=p.trim().split(/\s+/).map(Number);return latlon(a[1],a[0]);});
    if(points.some(p=>!p))return null;
    return {type:w[1].toUpperCase()==='LINESTRING'?'line':'point',points:points.slice(0,500)};
   }
  }
 }
 if(geom&&typeof geom==='object'){
  if(geom.type==='Feature')geom=geom.geometry;
  if(geom?.type==='Point'&&Array.isArray(geom.coordinates)){
   const p=latlon(num(geom.coordinates[1]),num(geom.coordinates[0]));
   return p?{type:'point',points:[p]}:null;
  }
  if(geom?.type==='LineString'&&Array.isArray(geom.coordinates)){
   const points=geom.coordinates.slice(0,500).map(pair=>latlon(num(pair?.[1]),num(pair?.[0])));
   return points.length>=2&&points.every(Boolean)?{type:'line',points}:null;
  }
 }
 const p=latlon(num(prop(row,'lat','latitude','위도','location_y')),num(prop(row,'lon','lng','longitude','경도','location_x')));
 return p?{type:'point',points:[p]}:null;
}
function level(value){
 const v=String(value??'').trim().toLowerCase();
 const names={'관심':1,'주의':2,'위험':3,'안전':0,'정상':0,'없음':0,'safe':0,'interest':1,'caution':2,'warning':2,'danger':3};
 if(Object.hasOwn(names,v))return names[v];
 // Bare numeric grade codes cannot be translated to severity until the official KMA ZIP code table is verified.
 return null;
}
// KMA API Hub road format: link filenames carry the UTC production time.
function officialLinkFile(name,roadNum){
 const match=name.split('/').at(-1).match(/^R(\d{3})_LINK_(FRG|FOG)_(\d{12})\.csv$/i);
 if(!match||match[1]!==roadNum)return null;
 const stamp=match[3];
 const iso=stamp.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/,'$1-$2-$3T$4:$5:00.000Z');
 const time=Date.parse(iso);
 if(!Number.isFinite(time)||new Date(time).toISOString()!==iso)return null;
 return {kind:match[2].toUpperCase()==='FRG'?'ice':'visibility',dataTime:iso};
}
export function geolocatedRisks(files,roadNum){
 const locations=[],kindKeys=[
  {kind:'ice',fields:['icerisk','icingrisk','roadicingrisk','blackicerisk','icelevel','icinglevel','도로살얼음','살얼음위험등급','결빙위험등급']},
  {kind:'visibility',fields:['visibilityrisk','visrisk','visibilitylevel','fogrisk','foglevel','가시거리위험등급','시정위험등급']}
 ];
 let recordCount=0,unmapped=0,dataTime=null;
 for(const file of files){
  const official=officialLinkFile(file.name,roadNum);
  if(official&&(!dataTime||official.dataTime>dataTime))dataTime=official.dataTime;
  for(const row of records(file)){
   recordCount++;
   if(official){
    const risk=String(prop(row,official.kind==='ice'?'B_ICE':'FOG')??'');
    if(!/^[123]$/.test(risk))continue;
    const from=latlon(num(prop(row,'F_LAT')),num(prop(row,'F_LON')));
    const to=latlon(num(prop(row,'T_LAT')),num(prop(row,'T_LON')));
    const linkId=String(prop(row,'LINK_ID')??'');
    if(!from||!to||!/^\d+$/.test(linkId)){unmapped++;continue;}
    if(locations.length<350)locations.push({...official,risk:Number(risk),roadNum,linkId,
     geometry:{type:'line',points:[from,to]}});
    continue;
   }
   const geo=parseGeometry(row);
   for(const kind of kindKeys){
    const val=prop(row,...kind.fields);
    if(val===null)continue;
    const risk=level(val);
    if(risk===null||risk===0)continue;
    if(!geo){unmapped++;continue;}
    const id=String(prop(row,'linkid','stdlinkid','link_id','표준링크id')||'').slice(0,40);
    const road=String(prop(row,'roadnum','roadnumber','노선번호')||roadNum).slice(0,12);
    if(road!==roadNum&&road!==String(Number(roadNum)))continue;
    locations.push({kind:kind.kind,risk,geometry:geo,linkId:id,roadNum});
    if(locations.length>=350)return{locations,recordCount,unmapped,dataTime};
   }
  }
 }
 return{locations,recordCount,unmapped,dataTime};
}
export async function kmaRoadRisk(roadNum,key,fetcher=fetch){
 if(!(roadNum in ROAD_NAMES))throw error(400,'지원하는 고속도로 노선번호가 아닙니다.');
 if(!key)throw error(503,'KMA_API_KEY가 설정되지 않았습니다.');
 const url=new URL(HOST);url.searchParams.set('roadNum',roadNum);url.searchParams.set('authKey',key);
 let r;
 try{r=await fetcher(url.toString(),{signal:AbortSignal.timeout(15000),headers:{Accept:'application/zip,application/octet-stream'}});}
 catch{throw error(502,'도로위험 기상정보 API에 연결하지 못했습니다.');}
 if(!r.ok){await r.body?.cancel();throw error(502,'도로위험 기상정보 API 응답 HTTP '+r.status+' · 별도 활용승인/서비스 시기 확인');}
 const declared=Number(r.headers.get('content-length')||0);
 if(declared>MAX_ZIP){await r.body?.cancel();throw error(502,'도로위험 ZIP 응답 크기 제한 초과');}
 const bytes=new Uint8Array(await r.arrayBuffer());
 if(bytes.length>MAX_ZIP)throw error(502,'도로위험 ZIP 응답이 너무 큽니다.');
 if(bytes[0]!==80||bytes[1]!==75)throw error(502,'도로위험 ZIP이 아닌 응답 · 기상청 API 활용승인 확인 필요');
 const files=extractZipFiles(bytes);
 const result=geolocatedRisks(files,roadNum);
 return {provider:'KMA',product:'도로위험기상정보',roadNum,roadName:ROAD_NAMES[roadNum],
  fetchedAt:new Date().toISOString(),dataTime:result.dataTime,
  status:result.locations.length?'georeferenced':result.recordCount?'unmapped':'unsupported_format',
  locations:result.locations,recordCount:result.recordCount,unmapped:result.unmapped,
  fileTypes:files.map(f=>f.name.replace(/^.*\./,'').toLowerCase()).slice(0,20),
  source:'기상청 도로위험기상정보 · 노선별 최신 ZIP',
  caution:'살얼음 발생 가능성 및 가시거리 위험예측이며 실제 결빙·미끄럼·통제 관측이 아닙니다. 위치정보·등급코드·자료시각이 확인되지 않으면 안전 판단에 사용하지 마세요.'};
}

// Share one batch between concurrent requests in the same server instance.
const allRoadCache=new WeakMap();
export async function kmaAllRoadRisks(key,fetcher=fetch){
 const hit=allRoadCache.get(fetcher);
 if(hit?.key===key&&hit.until>Date.now())return hit.promise;
 const roads=Object.keys(ROAD_NAMES);
 const promise=Promise.allSettled(roads.map(road=>kmaRoadRisk(road,key,fetcher))).then(results=>{
  const received=results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
  if(!received.length)throw results[0].reason;
  const locations=received.flatMap(road=>road.locations);
  return {roadName:'지원 고속도로 전체',totalRoads:roads.length,receivedRoads:received.length,
   fetchedAt:new Date().toISOString(),locations,
   status:locations.length?'georeferenced':received.some(road=>road.status==='unmapped')?'unmapped':'unsupported_format'};
 });
 const entry={key,until:Date.now()+60000,promise};
 allRoadCache.set(fetcher,entry);
 try{return await promise;}
 catch(e){entry.until=Date.now()+15000;throw e;}
}
