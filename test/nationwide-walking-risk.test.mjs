import {test} from 'node:test';
import assert from 'node:assert/strict';
import {legalDistrictFromKakao,fetchRoutePedestrianHistory} from '../lib/pedestrian-route-context.mjs';
import {buildPedestrianHistoryHazards,routeHistoryQueryPoints} from '../public/pedestrian-history-risk.mjs';
import {assessRouteHazard} from '../public/risk-engine.mjs';
import {buildRouteHazards} from '../public/route-hazards.mjs';
const departure='2026-11-10T01:00:00Z';
const route={
 travelMode:'walking',departure,duration:700,distance:800,
 rainPath:[{lat:35.1509,lng:129.0501,seconds:0},{lat:35.153,lng:129.0519,seconds:700}],
 samples:[{lat:35.1515,lng:129.0505,seconds:120},{lat:35.152,lng:129.051,seconds:420}]
};
const zone={lat:35.151,lng:129.051,name:'부산진구 역사고 집중구역',accidentCount:8,year:'2024',
 source:'한국도로교통공단 TAAS',historic:true,live:false};
test('national legal-dong geocoder validates regions instead of hardcoded Seoul-only',()=>{
 const point={lat:35.151,lng:129.051};
 assert.deepEqual(legalDistrictFromKakao({documents:[{region_type:'B',code:'2623010100',
 region_1depth_name:'부산광역시',region_2depth_name:'부산진구'}]},point),
 {siDo:'26',guGun:'230',year:'2024',region:'부산광역시 부산진구'});
 assert.equal(legalDistrictFromKakao({documents:[{region_type:'B',code:'invalid'}]},point),null);
});
test('KOROAD route-scoped API does not leak credentials and only counts verified history',async()=>{
 let koroadCalls=0;
 const data=await fetchRoutePedestrianHistory({
  points:routeHistoryQueryPoints(route),koroadKey:'SECRET_KOROAD',kakaoKey:'SECRET_KAKAO',
  fetcher:async(url,options)=>{
   if(url.startsWith('https://dapi.kakao.com/')){
    assert.equal(options.headers.Authorization,'KakaoAK SECRET_KAKAO');
    return Response.json({documents:[{region_type:'B',code:'2623010100',
     region_1depth_name:'부산광역시',region_2depth_name:'부산진구'}]});
   }
   if(url.startsWith('https://opendata.koroad.or.kr/')){
    koroadCalls++;const params=new URL(url).searchParams;
    assert.equal(params.get('siDo'),'26');assert.equal(params.get('guGun'),'230');
    assert.equal(params.get('authKey'),'SECRET_KOROAD');
    return Response.json({resultCode:'00',items:{item:[
     {bjd_cd:'2623010100',spot_nm:'부산진구 사고 집중구역',lo_crd:'129.051',la_crd:'35.151',occrrnc_cnt:8,caslt_cnt:11},
     {bjd_cd:'1114010100',spot_nm:'서울 지역 오입력',lo_crd:'126.97',la_crd:'37.55',occrrnc_cnt:9}
    ]}});
   }
   throw Error('unexpected url');
  }
 });
 assert.equal(data.status,'received');
 assert.equal(data.items.length,1);
 assert.equal(koroadCalls,1);
 assert.ok(!JSON.stringify(data).includes('SECRET_'));
 const hazards=buildPedestrianHistoryHazards(route,data);
 assert.equal(hazards.length,1);assert.equal(hazards[0].kind,'pedestrian-hotspot');
 assert.equal(assessRouteHazard(hazards[0]).level,'notice');
 assert.match(assessRouteHazard(hazards[0]).caution,/현재 사고/);
 assert.equal(buildPedestrianHistoryHazards({...route,demo:true},data).length,0);
 assert.equal(buildPedestrianHistoryHazards(route,{...data,items:[{...zone,live:true}]}).length,0);
});
test('KMA time-aligned high temperature, low temperature and wind generate cautious evidence',()=>{
 const sample=(temperature,windSpeed)=>({status:'forecast',seconds:100,
  lat:35.15,lng:129.05,eta:departure,forecast:{provider:'kma',time:departure,
  precipitationType:0,temperature,windSpeed}});
 const hot=buildRouteHazards([sample(34,16)]);
 assert.deepEqual(hot.map(h=>h.kind).sort(),['heat','wind']);
 assert.ok(hot.every(h=>h.assessment.level==='caution'));
 const cold=buildRouteHazards([sample(-13,2)]);
 assert.equal(cold[0].kind,'cold');
 assert.equal(cold[0].assessment.level,'caution');
 const bad={...sample(34,0),forecast:{...sample(34,0).forecast,time:'2026-11-11T01:00:00Z'}};
 assert.equal(buildRouteHazards([bad])[0].assessment.level,'unknown');
});
