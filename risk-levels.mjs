// Explicit volatility-based trade budget; not a claimed structural support level.
export function riskLevels(entry,atr,lows=[]){
 if(!Number.isFinite(entry)||entry<=0||!Number.isFinite(atr)||atr<=0)return null;
 const valid=lows.filter(v=>Number.isFinite(v)&&v>0&&v<entry);
 const structural=valid.length?Math.min(...valid)-.2*atr:entry-atr;
 const stop=Math.max(entry-1.5*atr,Math.min(entry-.75*atr,structural));
 if(stop<=0)return null;
 const risk=entry-stop;
 return{entry,stop,risk,tp1:entry+1.5*risk,tp2:entry+2.5*risk,stopKind:stop>structural?'1.5ATR 변동성 한도':'최근 5봉 저점 + 변동성 여유'};
}
