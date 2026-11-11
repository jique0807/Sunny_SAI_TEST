// CI ELA GEOS, checked against NMSC's 1200x1900 standard latitude/longitude grid.
// Public API uses zero-based pixel centres; the NMSC scan equation uses column+1,row+1.
// Do not feed the PNG (1900x1230) to this native numeric-grid navigation.
// Source CI sweep_angle_axis='x' does NOT reproduce NMSC's reference grid via
// generic PROJ geos sweep=x. This explicit NMSC convention is independently tested.
const DEG=Math.PI/180;
export const CI_NAVIGATION=Object.freeze({width:1900,height:1200,
 grid_mapping_name:'geostationary',longitude_of_projection_origin:128.1999969482422,
 perspective_point_height:35785864,semi_major_axis:6378137,semi_minor_axis:6356752.5,
 column_scale_factor:20425338,line_scale_factor:20425338,column_offset:1125.5,line_offset:2337.5});
export function isVerifiedCiNavigation(metadata){
 if(!metadata||metadata.grid_mapping_name!=='geostationary')return false;
 return Object.entries(CI_NAVIGATION).every(([k,v])=>typeof v==='string'?metadata[k]===v:
  Number.isFinite(metadata[k])&&Math.abs(metadata[k]-v)<=Math.max(1e-7,Math.abs(v)*1e-10));
}
export function ciPixelToLatLng(column,row,metadata=CI_NAVIGATION){
 if(!isVerifiedCiNavigation(metadata))throw Error('Unverified CI navigation');
 if(!Number.isFinite(column)||!Number.isFinite(row)||column<-.5||row<-.5||column>metadata.width-.5||row>metadata.height-.5)
  throw RangeError('CI native pixel out of range');
 const m=metadata,a=m.semi_major_axis,b=m.semi_minor_axis,H=a+m.perspective_point_height,k=a*a/(b*b);
 const x=(column+1-m.column_offset)*65536/m.column_scale_factor*DEG;
 const y=(row+1-m.line_offset)*65536/m.line_scale_factor*DEG;
 const cx=Math.cos(x),cy=Math.cos(y),sy=Math.sin(y),q=cy*cy+k*sy*sy,v=H*cx*cy;
 const discriminant=v*v-q*(H*H-a*a);
 if(discriminant<0)return null;
 const sn=(v-Math.sqrt(discriminant))/q;
 const s1=H-sn*cx*cy,s2=sn*Math.sin(x)*cy,s3=-sn*sy;
 return {lat:Math.atan2(k*s3,Math.hypot(s1,s2))/DEG,
  lng:m.longitude_of_projection_origin+Math.atan2(s2,s1)/DEG};
}
export function ciLatLngToPixel(lat,lng,metadata=CI_NAVIGATION){
 if(!isVerifiedCiNavigation(metadata))throw Error('Unverified CI navigation');
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>=90||Math.abs(lng)>180)return null;
 const m=metadata,a=m.semi_major_axis,b=m.semi_minor_axis,H=a+m.perspective_point_height,k=b*b/(a*a);
 const clat=Math.atan(k*Math.tan(lat*DEG));
 const r=b/Math.sqrt(1-(1-k)*Math.cos(clat)**2),delta=(lng-m.longitude_of_projection_origin)*DEG;
 const X=r*Math.cos(clat)*Math.cos(delta),Y=r*Math.cos(clat)*Math.sin(delta),Z=r*Math.sin(clat);
 if(X*(H-X)-Y*Y-Z*Z/k<=0)return null;
 const sx=Math.atan2(Y,H-X)/DEG,sy=Math.atan2(-Z,Math.hypot(H-X,Y))/DEG;
 const column=m.column_offset+sx*m.column_scale_factor/65536-1;
 const row=m.line_offset+sy*m.line_scale_factor/65536-1;
 return column>=-.5&&row>=-.5&&column<=m.width-.5&&row<=m.height-.5?{column,row}:null;
}
const categories=Object.freeze(['non-ci','cloud-microphysical-state','weak-updraft','medium-updraft','strong-updraft']);
export function decodeCiCategory(value,quality){
 if(!Number.isInteger(value)||value<0||value>4)return {status:'unavailable',reason:value===255?'fill-value':'invalid-category',category:null};
 if(quality!==0&&quality!==1)return {status:'unavailable',reason:'invalid-quality',category:null};
 return {status:quality===1?'usable':'unavailable',reason:quality===1?null:'previous-object-missing',
  category:categories[value],code:value,quality,unit:'category',probabilityPercent:null};
}
