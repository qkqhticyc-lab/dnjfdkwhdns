// Observation only: reuse the existing oversold watch, never manufacture an entry or target.
export const CANDIDATE_RULE='최근 20봉 고가 대비 15% 이상 낙폭·RSI14≤30·EMA21 아래 1.5ATR로 시작한 관찰 중, 현재 RSI≤40·종가<EMA21·구간 저점에서 2ATR 이내인 종목. 관찰 시작 후 최대 10봉이며 확인·만료된 구간은 제외합니다. 저점~저점+2ATR(EMA21 이내)은 관찰 범위이며 매수 권장 가격대나 반등 예측이 아닙니다.';
const finite=Number.isFinite;
export function reboundCandidate(frames){
 const last=frames.at(-1),b=last?.bounce;if(!last||b?.state!=='watch')return null;
 if(![last.close,last.rsi,last.atr,last.ema21,b.low,b.minRsi,b.dropPct].every(finite)||last.atr<=0||b.low<=0||b.minRsi>30||b.dropPct<15||last.rsi>40||last.close>=last.ema21)return null;
 const age=frames.length-1-b.index,upper=Math.min(b.low+2*last.atr,last.ema21);
 if(!Number.isInteger(age)||age<0||age>10||last.close<b.low||last.close>upper)return null;
 const recent=frames.slice(-20),peak=recent.length===20&&recent.every(p=>finite(p.high)&&p.high>0)?Math.max(...recent.map(p=>p.high)):null;
 return{state:'watch',provisional:!!last.provisional,asOf:b.asOf,age,expiresIn:10-age,referenceAt:last.asOf,referencePrice:last.close,lower:b.low,upper,
  lowAt:frames[b.lowIndex]?.asOf||null,newLow:b.lowIndex===frames.length-1,aboveLowPct:(last.close/b.low-1)*100,
  initialDropPct:b.dropPct,currentDropPct:peak>0?(1-last.close/peak)*100:null,minRsi:b.minRsi,rsi:last.rsi,
  blocked:(b.blocked||[]).map(s=>s.replace('RSI 30 회복 및 상승 확인','RSI 30 초과~50 이하에서 상승 확인'))};
}
