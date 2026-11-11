import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CI_NAVIGATION,isVerifiedCiNavigation} from '../public/gk2a-ci-navigation.mjs';
const scalar=v=>Array.isArray(v)||ArrayBuffer.isView(v)?v.length===1?v[0]:Array.from(v):v;
const attrs=o=>Object.fromEntries(Object.entries(o.attrs).map(([k,a])=>[k,scalar(a.value)]));
export async function decodeSatelliteNc(bytes,product,observationUTC){
 const h5=await import('h5wasm/node');await h5.ready;
 const dir=mkdtempSync(join(tmpdir(),'sunny-nc-'));let f;
 try{
  const file=join(dir,'frame.nc');writeFileSync(file,bytes);f=new h5.File(file,'r');
  const root=attrs(f),p=attrs(f.get('gk2a_imager_projection'));
  if(root.title!==({rr:'AMI L2 RR',ci:'AMI L2 CI',fog:'AMI L2 FOG'})[product])throw Error('product_mismatch');
  const name={rr:'RR',ci:'CI1_prob',fog:'FOG'}[product],qname={rr:'Raining_CT_flag',ci:'DQF_CI1',fog:'DQF_FOG'}[product];
  const d=f.get(name),q=f.get(qname),[height,width]=d.shape;
  if(d.shape.length!==2||width*height>2280000||q.shape.join(',')!==d.shape.join(','))throw Error('shape_mismatch');
  let navigation;
  if(product==='fog'){
   const expected={standard_parallel1:30,standard_parallel2:60,origin_latitude:38,central_meridian:126,
    pixel_size:2000,upper_left_easting:-899000,upper_left_northing:899000};
   if(width!==900||height!==900||p.grid_mapping_name!=='lambert_conformal_conic'||
    Object.entries(expected).some(([k,v])=>!Number.isFinite(p[k])||Math.abs(p[k]-v)>1e-5))throw Error('unverified_projection');
   navigation='ko-lcc-900';
  }else{
   if(!isVerifiedCiNavigation({...p,width,height}))throw Error('unverified_projection');
   navigation='ela-nmsc-geos';
  }
  const packing=attrs(d);
  if(product==='rr'&&(packing.units!=='mm/h'||Math.abs(packing.scale_factor-.01)>1e-7||packing._FillValue!==65535||packing.valid_max!==10000))throw Error('unverified_packing');
  return {product,width,height,navigation,observationUTC,values:d.value.slice(),quality:q.value.slice(),
   packing,metadataVerified:true,projection:product==='fog'?p:{...CI_NAVIGATION},source:'기상청 GK2A 수치 산출물'};
 }finally{if(f)f.close();rmSync(dir,{recursive:true,force:true});}
}
