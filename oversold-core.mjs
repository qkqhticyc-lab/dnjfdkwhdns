// Independent experimental mean-reversion rule; thresholds are not a fitted win probability.
export const OVERSOLD_RULE='관찰: 최근 20봉 고가 대비 종가 낙폭 15% 이상·RSI14≤30·EMA21 아래 1.5ATR 이상. 최초 관찰 후 10봉 안에 저점 봉 다음부터 RSI 30 초과~50 이하로 상승, 전봉 고가 돌파 양봉·종가 위치 상위 35%·거래량 1.2배 이상. 저점에서 2ATR 이내, 저점−0.2ATR 손절의 위험 0.75~2ATR·8% 이내, EMA21까지 1.5R 이상 여유가 있을 때만 반등 확인. TP1 1.5R·TP2 2.5R 고정. 다음 봉부터 손절가 저가 접촉 또는 8봉 경과 시 종료. TP1 접촉 후 다음 봉부터 손절선은 진입가 이상으로 올림. 추세전환 확정·추천 수익률이 아닌 역추세 실험 신호.';
const finite=Number.isFinite,valid=p=>p&&[p.open,p.high,p.low,p.close].every(v=>finite(v)&&v>0)&&p.high>=Math.max(p.open,p.close)&&p.low<=Math.min(p.open,p.close);
export function analyzeOversold(rows,metrics){
 const frames=[];let watch=null,latched=false;
 for(let i=0;i<rows.length;i++){
  const p=rows[i],g=metrics[i]||{},prev=rows[i-1],prior=metrics[i-1],recent=rows.slice(Math.max(0,i-19),i+1),usable=valid(p)&&finite(g.rsi)&&finite(g.ema21)&&g.atr>0;
  let state='none',signal=false,levels=null,blocked=[],snapshot=null;
  if(usable&&g.rsi>=40)latched=false;
  if(watch&&i>watch.index+10){state='expired';snapshot={...watch};watch=null;}
  const peak=recent.length===20&&recent.every(valid)?Math.max(...recent.map(p=>p.high)):null,drop=peak>0?(peak-p.close)/peak*100:null;
  if(!watch&&!latched&&usable&&finite(drop)&&drop>=15&&g.rsi<=30&&g.ema21-p.close>=1.5*g.atr){watch={index:i,asOf:p.asOf,low:p.low,lowIndex:i,minRsi:g.rsi,dropPct:drop};latched=true;}
  if(watch&&usable){
   if(p.low<watch.low){watch={...watch,low:p.low,lowIndex:i};}
   watch={...watch,minRsi:Math.min(watch.minRsi,g.rsi)};state='watch';
   const stop=watch.low-.2*g.atr,risk=p.close-stop,room=g.ema21-p.close;
   if(i<=watch.lowIndex)blocked.push('저점 형성 봉 다음 봉부터 확인');
   if(!(g.rsi>30&&g.rsi<=50&&finite(prior?.rsi)&&g.rsi>prior.rsi))blocked.push('RSI 30 회복 및 상승 확인');
   if(!(valid(prev)&&p.close>prev.high&&p.close>p.open&&(p.close-p.low)/(p.high-p.low||1)>=.65))blocked.push('전봉 고가 돌파·강한 양봉 마감 확인');
   if(!(finite(g.volumeRatio)&&g.volumeRatio>=1.2))blocked.push('비교 거래량 1.2배 확인');
   if(p.close-watch.low>2*g.atr)blocked.push('저점 대비 2ATR 초과·추격 제외');
   if(!(stop>0&&risk>=.75*g.atr&&risk<=2*g.atr&&risk/p.close<=.08))blocked.push('저점 기준 위험 0.75~2ATR·8% 이내 확인');
   if(!(room>=1.5*risk))blocked.push('EMA21까지 최소 1.5R 여유 확인');
   if(!blocked.length){signal=true;state='confirmed';levels={entry:p.close,stop,initialStop:stop,risk,tp1:p.close+1.5*risk,tp2:p.close+2.5*risk,stopKind:'과매도 구간 저점−0.2ATR'};}
   snapshot={...watch};if(signal)watch=null;
  }
  frames.push({state,signal,...(snapshot?{...snapshot}:{}),blocked,levels});
 }return{frames};
}
