// Shared pure KMA LCC -> WGS84 / Kakao map radar mesh geometry.
// This helper MUST NOT initialize browser maps or fetch data.
const baseRad=Math.PI/180;
const slat1=30*baseRad,slat2=60*baseRad,lon0=126*baseRad;
const n=Math.log(Math.cos(slat1)/Math.cos(slat2))/
 Math.log(Math.tan(Math.PI/4+slat2/2)/Math.tan(Math.PI/4+slat1/2));
const F=(Math.cos(slat1)*Math.tan(Math.PI/4+slat1/2)**n)/n;
const radius=6371008.77, rho0=radius*F;
export function radarLccToLatLng(x,y){
 if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Invalid KMA LCC coordinate');
 const yy=rho0-y,rho=Math.hypot(x,yy);
 if(!rho)throw Error('Out of domain');
 const lat=(2*Math.atan((radius*F/rho)**(1/n))-Math.PI/2)/baseRad;
 const lng=(lon0+Math.atan2(x,yy)/n)/baseRad;
 return {lat,lng};
}
export function radarProjectedPixel(u,v,w,h,bounds){
 if(!Number.isFinite(u)||!Number.isFinite(v)||!(w>0&&h>0)||!bounds)
  throw Error('Invalid radar image geometry');
 return{ x:bounds.left+(u/w)*(bounds.right-bounds.left),
  y:bounds.top-(v/h)*(bounds.top-bounds.bottom)};
}
export function affineTriangle(ctx,img,src,dest,dpr=1){
 const [[u1,v1],[u2,v2],[u3,v3]]=src;
 const [[x1,y1],[x2,y2],[x3,y3]]=dest;
 const determinant=(u1-u3)*(v2-v3)-(u2-u3)*(v1-v3);
 if(!Number.isFinite(determinant)||Math.abs(determinant)<1e-8)return;
 const a=((x1-x3)*(v2-v3)-(x2-x3)*(v1-v3))/determinant;
 const c=((u1-u3)*(x2-x3)-(u2-u3)*(x1-x3))/determinant;
 const b=((y1-y3)*(v2-v3)-(y2-y3)*(v1-v3))/determinant;
 const d=((u1-u3)*(y2-y3)-(u2-u3)*(y1-y3))/determinant;
 const e=x3-a*u3-c*v3,f=y3-b*u3-d*v3;
 if([a,b,c,d,e,f].some(x=>!Number.isFinite(x)))return;
 ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineTo(x3,y3);
 ctx.closePath();ctx.clip();
 ctx.transform(a,b,c,d,e,f);ctx.drawImage(img,0,0);ctx.restore();
}
export function renderRadarImage(ctx,img,bounds,project,dpr=1,mesh=12){
 if(!img||!bounds||typeof project!=='function')return 0;
 const width=img.naturalWidth||img.width,height=img.naturalHeight||img.height;
 if(!width||!height)return 0;
 let drawn=0;
 const stepX=width/mesh,stepY=height/mesh;
 for(let row=0;row<mesh;row++)for(let col=0;col<mesh;col++){
  const u0=col*stepX,u1=(col+1)*stepX,v0=row*stepY,v1=(row+1)*stepY;
  const source=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]];
  const dest=source.map(([u,v])=>{
   const p=radarProjectedPixel(u,v,width,height,bounds);
   return project(radarLccToLatLng(p.x,p.y));
  });
  if(dest.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))continue;
  const d=dest.map(p=>[p.x,p.y]);
  affineTriangle(ctx,img,[source[0],source[1],source[2]],[d[0],d[1],d[2]],dpr);
  affineTriangle(ctx,img,[source[0],source[2],source[3]],[d[0],d[2],d[3]],dpr);
  drawn++;
 }
 return drawn;
}
