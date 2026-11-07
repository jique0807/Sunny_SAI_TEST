// Diagnostic PNG pixel integrity and transparency check of real KMA HSR image.
// Produces only statistical counts; does not alter or fabricate weather pixels.
import {inflateSync} from 'node:zlib';
const fail=message=>{throw Error(message);};
function pngInfo(input){
 if(!(input instanceof Uint8Array)||input.byteLength<60)fail('Invalid PNG source');
 const d=new DataView(input.buffer,input.byteOffset,input.byteLength);
 const sign=[137,80,78,71,13,10,26,10];
 if(sign.some((x,i)=>input[i]!==x))fail('Not PNG');
 const width=d.getUint32(16,false),height=d.getUint32(20,false);
 if(!width||!height||width>4096||height>4096||input[24]!==8||input[25]!==6||input[28]!==0)
  fail('Only 8-bit RGBA non-interlaced PNG accepted');
 let offset=8,compressed=[];
 while(offset+12<=input.byteLength){
  const len=d.getUint32(offset,false);const type=String.fromCharCode(...input.slice(offset+4,offset+8));
  const end=offset+len+12;
  if(len>8000000||end>input.byteLength)fail('Invalid PNG chunk');
  if(type==='IDAT')compressed.push(input.subarray(offset+8,offset+8+len));
  offset=end;if(type==='IEND')break;
 }
 const compressedSize=compressed.reduce((sum,b)=>sum+b.byteLength,0);
 if(compressedSize>5000000)fail('Compressed PNG too large');
 const compressedBytes=new Uint8Array(compressedSize);let at=0;
 for(const b of compressed){compressedBytes.set(b,at);at+=b.length;}
 const raw=inflateSync(compressedBytes,{maxOutputLength:width*height*4+height});
 const bpp=4,stride=width*bpp;
 if(raw.byteLength!==height*(stride+1))fail('Unexpected PNG image size');
 const samples=[],totals={transparent:0,translucent:0,opaque:0,grey:0,color:0,
  coloredVisible:0,visibleBbox:null,topLeft:null};
 const prior=new Uint8Array(stride),pixels=new Uint8Array(stride);
 let minx=width,miny=height,maxx=-1,maxy=-1;
 for(let y=0;y<height;y++){
  const rowOffset=y*(stride+1),filter=raw[rowOffset];
  if(filter>4)fail('Unsupported PNG filter');
  for(let i=0;i<stride;i++){
   const value=raw[rowOffset+1+i],left=i>=bpp?pixels[i-bpp]:0,up=prior[i],
    upLeft=i>=bpp?prior[i-bpp]:0;
   let predictor=0;
   if(filter===1)predictor=left;
   else if(filter===2)predictor=up;
   else if(filter===3)predictor=(left+up)>>1;
   else if(filter===4){
    const p=left+up-upLeft,da=Math.abs(p-left),db=Math.abs(p-up),dc=Math.abs(p-upLeft);
    predictor=da<=db&&da<=dc?left:db<=dc?up:upLeft;
   }
   pixels[i]=(value+predictor)&255;
  }
  for(let x=0;x<width;x++){
   const i=4*x,r=pixels[i],g=pixels[i+1],b=pixels[i+2],a=pixels[i+3];
   if(x===0&&y===0)totals.topLeft=[r,g,b,a];
   if(a===0)totals.transparent++;else if(a===255)totals.opaque++;else totals.translucent++;
   if(r===g&&g===b)totals.grey++;else totals.color++;
   if(a>0&&!(r===g&&g===b)){
    totals.coloredVisible++;
    minx=Math.min(minx,x);miny=Math.min(miny,y);maxx=Math.max(maxx,x);maxy=Math.max(maxy,y);
   }
   if(samples.length<20&&((y*width+x)%13973===0))samples.push({x,y,rgba:[r,g,b,a]});
  }
  prior.set(pixels);
 }
 if(maxx>=0)totals.visibleBbox={minx,miny,maxx,maxy};
 return {width,height,pixels:width*height,...totals,samples};
}
export {pngInfo};
