// Raw packed RR from the received AMI L2 RR NetCDF, not PNG colors.
export const RR_PACKING=Object.freeze({units:'mm/h',fillValue:65535,validMin:0,validMax:10000,
 scaleFactor:0.009999999776482582,addOffset:0});
export function decodePackedRr(raw,cloudTypeFlag,packing=RR_PACKING){
 if(!packing||packing.units!=='mm/h'||!Number.isFinite(packing.scaleFactor)||packing.scaleFactor<=0||
  !Number.isFinite(packing.addOffset)||!Number.isFinite(packing.validMin)||!Number.isFinite(packing.validMax)||
  packing.validMax<packing.validMin||!Number.isInteger(packing.fillValue))return {status:'unavailable',reason:'invalid-packing'};
 if(!Number.isInteger(raw)||raw===packing.fillValue||raw<packing.validMin||raw>packing.validMax)
  return {status:'unavailable',reason:raw===packing.fillValue?'fill-value':'invalid-value'};
 if(!Number.isInteger(cloudTypeFlag)||cloudTypeFlag<0||cloudTypeFlag>20)
  return {status:'unavailable',reason:'invalid-cloud-type'};
 return {status:'estimate',rainMmPerHour:raw*packing.scaleFactor+packing.addOffset,
  unit:'mm/h',cloudTypeFlag,cloudTypeQualityFlag:false,
  evidence:'satellite-retrieval',roadFloodConfirmed:false};
}
