// Common advisory policy for validated live and synthetic engine profiles.
// It recommends an action; map geometry and user choice must still be checked.
export const ROUTE_ACTION_POLICY='route-advisory-v1';
export function decideRouteAction(profile){
 const result=(type,reason)=>({policy:ROUTE_ACTION_POLICY,type,reason});
 if(profile?.state!=='evaluated'||profile.coverage<80)return result('abstain','자료 범위 또는 유효성 부족');
 const signals=profile.signals||[];
 const rain=signals.some(h=>h.kind==='rain'&&Number(h.rainMm)>=30&&h.assessment?.score>0);
 const flood=signals.some(h=>h.kind==='warning'&&h.impact==='flood'&&h.affectedRadiusMeters>0&&h.assessment?.score>0);
 if(rain&&flood&&profile.signalIndex>=30)return result('reroute','강한 강수와 경로에 정합된 침수 영향자료');
 if(signals.some(h=>h.kind==='heat'&&h.assessment?.level==='caution'))return result('heat-advisory','고온 주의 기준 초과');
 return result(signals.length?'advisory':'continue',signals.length?'확인된 위험 신호 안내':'조회 지점의 추가 위험 신호 없음');
}
