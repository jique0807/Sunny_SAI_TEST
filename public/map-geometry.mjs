// Route geometry is supplied by the vehicle-routing provider, never fabricated.
export function projectRoute(vertices,width=960,height=490,padding=55){
 if(!vertices.length)return [];
 const mercator=p=>({x:p.lng*Math.PI/180,y:Math.log(Math.tan(Math.PI/4+p.lat*Math.PI/360))});
 const pts=vertices.map(mercator),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const scale=Math.min((width-padding*2)/Math.max(maxX-minX,1e-9),(height-padding*2)/Math.max(maxY-minY,1e-9));
 return pts.map(p=>({x:width/2+(p.x-(minX+maxX)/2)*scale,y:height/2-(p.y-(minY+maxY)/2)*scale}));
}
export function roadSection(vertices,sample,radius=8){
 if(!vertices.length)return [];
 const distance=p=>(p.lat-sample.lat)**2+((p.lng-sample.lng)*Math.cos(sample.lat*Math.PI/180))**2;
 const index=vertices.reduce((best,p,i)=>distance(p)<distance(vertices[best])?i:best,0);
 return vertices.slice(Math.max(0,index-radius),Math.min(vertices.length,index+radius+1));
}
export function kakaoRouteLink(start,end){
 return 'https://map.kakao.com/link/by/car/'+[start,end].map(p=>encodeURIComponent(p.name)+','+p.lat+','+p.lng).join('/');
}
