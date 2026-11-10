// Korea 2-km GK2A LCC (WGS84): official 900 x 900 grid, parallels 30N/60N,
// origin 38N 126E; pixel-center corners at +/-899000 metres.
// A 900x922 PNG is NOT aligned unless its non-raster strip is independently verified.
const R=Math.PI/180,A=6378137.0,E=Math.sqrt(0.00669437999014);
const m=p=>Math.cos(p)/Math.sqrt(1-E*E*Math.sin(p)**2);
const t=p=>Math.tan(Math.PI/4-p/2) / Math.pow((1-E*Math.sin(p))/(1+E*Math.sin(p)),E/2);
const p1=30*R,p2=60*R,p0=38*R,lon0=126*R;
const n=Math.log(m(p1)/m(p2))/Math.log(t(p1)/t(p2));
const F=m(p1)/(n*t(p1)**n),r0=A*F*t(p0)**n;
export function koLccPixelToLatLng(pixelX,pixelY){
 if(!Number.isFinite(pixelX)||!Number.isFinite(pixelY)||pixelX<0||pixelY<0||pixelX>900||pixelY>900)
  throw RangeError('GK2A KO pixel out of range');
 const x=(pixelX-450)*2000,y=(450-pixelY)*2000;
 const r=Math.hypot(x,r0-y),theta=Math.atan2(x,r0-y);
 const tt=Math.pow(r/(A*F),1/n);
 let lat=Math.PI/2-2*Math.atan(tt);
 for(let i=0;i<10;i++)lat=Math.PI/2-2*Math.atan(tt*Math.pow((1-E*Math.sin(lat))/(1+E*Math.sin(lat)),E/2));
 return {lat:lat/R,lng:(lon0+theta/n)/R};
}
export const koLccProviderCorners=Object.freeze({
 nw:{lng:113.996418,lat:45.728965},ne:{lng:138.003582,lat:45.728965},
 sw:{lng:116.753260,lat:29.312252},se:{lng:135.246740,lat:29.312252}
});
export function verifyKoLccProjection(toleranceDegrees=0.06){
 const expected=koLccProviderCorners;
 const actual={nw:koLccPixelToLatLng(.5,.5),ne:koLccPixelToLatLng(899.5,.5),
  sw:koLccPixelToLatLng(.5,899.5),se:koLccPixelToLatLng(899.5,899.5)};
 return Object.keys(expected).every(k=>Math.abs(actual[k].lat-expected[k].lat)<toleranceDegrees&&
  Math.abs(actual[k].lng-expected[k].lng)<toleranceDegrees);
}
export function imageAffineMatrix(source,target){
 const [a,b,c]=source,[p,q,r]=target;
 const d=(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);
 if(Math.abs(d)<1e-7)throw RangeError('Degenerate GK2A image triangle');
 const ax=((q.x-p.x)*(c.y-a.y)-(r.x-p.x)*(b.y-a.y))/d;
 const cx=((r.x-p.x)*(b.x-a.x)-(q.x-p.x)*(c.x-a.x))/d;
 const by=((q.y-p.y)*(c.y-a.y)-(r.y-p.y)*(b.y-a.y))/d;
 const dy=((r.y-p.y)*(b.x-a.x)-(q.y-p.y)*(c.x-a.x))/d;
 return {a:ax,b:by,c:cx,d:dy,e:p.x-ax*a.x-cx*a.y,f:p.y-by*a.x-dy*a.y};
}
