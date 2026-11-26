import {supportBounceCandidate,SUPPORT_BOUNCE_RULE} from './support-bounce-core.mjs';
export const CANDIDATE_RULE=SUPPORT_BOUNCE_RULE;
export const reboundCandidate=frames=>supportBounceCandidate(frames);
const finite=Number.isFinite;
// Retain the former oversold observation for reproducibility, separate from the new support method.
export function oversoldCandidate(frames){
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
