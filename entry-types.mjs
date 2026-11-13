// Classify the trigger using only the entry candle and its preceding candle.
export const ENTRY_KEYS=['triangleEntry','boxRetestEntry','breakoutEntry','entry'];
export const ENTRY_LABELS={triangle:'삼각수렴 돌파',boxRetest:'박스권 재확인',breakout:'돌파 진입',pullback:'눌림 진입',reclaim:'이평선 회복',unknown:'유형 확인 중'};
export function entryTrigger(frames,index,key){
 const p=frames[index],prev=frames[index-1];if(!p)return{type:'unknown',label:ENTRY_LABELS.unknown,reason:'신호 봉 자료가 부족합니다.'};
 if(key==='triangleEntry')return{type:'triangle',label:ENTRY_LABELS.triangle,reason:'좌우 2봉 확인 고점·저점으로 만든 수렴 경계선을 종가와 거래량으로 돌파했습니다.'};
 if(key==='boxRetestEntry')return{type:'boxRetest',label:ENTRY_LABELS.boxRetest,reason:'앞선 봉에서 박스 상단을 돌파한 뒤 15봉 이내에 해당 가격을 재확인하고 양봉으로 회복했습니다.'};
 if(key==='breakoutEntry')return{type:'breakout',label:ENTRY_LABELS.breakout,reason:'직전 20봉 고가 '+p.high20+' 위로 종가 '+p.close+' 돌파. EMA8 > EMA14 > EMA21, 종가 > EMA14.'};
 const pullback=[p.open,p.low,p.close,p.ema14,prev?.close,prev?.ema21,prev?.ema55].every(Number.isFinite)&&prev.close>prev.ema21&&prev.ema21>prev.ema55&&p.low<=p.ema14&&p.close>p.ema14&&p.close>p.open;
 if(pullback)return{type:'pullback',label:ENTRY_LABELS.pullback,reason:'직전 봉에서 종가 > EMA21 > EMA55인 상승 흐름 유지. 현재 저가 '+p.low+'가 EMA14 '+p.ema14+'에 닿은 뒤 양봉으로 종가 '+p.close+' 회복.'};
 if(key==='entry'&&![p.open,p.low,p.ema14,prev?.close,prev?.ema21,prev?.ema55].every(Number.isFinite))return{type:'unknown',label:ENTRY_LABELS.unknown,reason:'눌림·회복 구분에 필요한 과거 봉 자료가 부족합니다.'};
 if(key==='entry')return{type:'reclaim',label:ENTRY_LABELS.reclaim,reason:'단기 정배열에서 EMA21 또는 EMA14를 회복한 신호. 직전 상승 흐름의 눌림 조건은 충족하지 않아 회복 관찰로 구분합니다.'};
 return{type:'unknown',label:ENTRY_LABELS.unknown,reason:'진입 유형을 확인할 수 없습니다.'};
}
export function screenEntryType(signal){return signal?.entryType|| (signal?.kind==='breakoutEntry'?'breakout':'unknown');}
