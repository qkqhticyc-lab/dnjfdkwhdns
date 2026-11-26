export const PYRAMID_VERSION=2;
export const PYRAMID_RULE='수익이 초기 위험의 0.5R 이상인 활성 신호에서만 추가 진입 후보를 평가합니다. EMA21>EMA55·EMA21 상승, 저점 또는 EMA14 재시험 후 양봉 회복과 거래량 1배, 또는 좁은 5봉 횡보 상단 돌파와 거래량 1.2배를 확인합니다. EMA21 위 2ATR 이내·가까운 저항까지 1.5R, 새 손절선을 최초 진입가 이상으로 둘 수 있을 때만 표시합니다. 최소 3봉 간격·최대 2회, 최초 수량 1에 대해 추가 0.5/0.25 가정의 총 계획손실이 최초 1R을 넘으면 제외합니다. 실제 보유·체결·갭 손실을 보장하지 않습니다.';
const f=Number.isFinite;
export function pyramidCandidate(rows,metrics,index,trade){
 const p=rows[index],g=metrics[index],prev=metrics[index-1],prior=rows.slice(Math.max(0,index-5),index),risk=trade.risk;
 if(!p||!g||!prev||![trade.entry,risk,g.atr,g.ema14,g.ema21,g.ema55,g.volumeRatio,p.open,p.high,p.low,p.close].every(f)||risk<=0||g.atr<=0||p.provisional)return null;
 const count=trade.adds||0;if(count>=2||index-(trade.lastAdd??trade.startedIndex??index)<3||p.close<trade.entry+.5*risk||!(g.ema21>g.ema55&&g.ema21>prev.ema21&&p.close>g.ema21)||p.close-g.ema21>2*g.atr)return null;
 const pullback=p.low<=g.ema14&&p.close>g.ema14&&p.close>p.open&&g.volumeRatio>=1;
 const tight=prior.length===5&&prior.every(v=>[v.high,v.low].every(f))&&Math.max(...prior.map(v=>v.high))-Math.min(...prior.map(v=>v.low))<=2*g.atr&&p.close>Math.max(...prior.map(v=>v.high))&&p.close>p.open&&g.volumeRatio>=1.2;
 if(!pullback&&!tight)return null;
 const support=Math.min(p.low,...prior.slice(-2).map(v=>v.low)),stop=Math.max(trade.entry,trade.stop||0,...(trade.addEntries||[]).map(a=>a.stop),support-.2*g.atr),newRisk=p.close-stop;
 if(!(stop<p.close&&newRisk>=.4*g.atr&&newRisk<=1.5*g.atr&&newRisk/p.close<=.08))return null;
 const high20=metrics[index].high20,resistance=f(high20)&&high20>p.close?high20:null;if(resistance&&(resistance-p.close)/newRisk<1.5)return null;
 const priorAdds=trade.addEntries||[],units=count===0?.5:.25,totalUnits=1+priorAdds.reduce((sum,a)=>sum+a.units,0)+units,totalCost=trade.entry+priorAdds.reduce((sum,a)=>sum+a.price*a.units,0)+p.close*units,plannedLoss=Math.max(0,totalCost-stop*totalUnits);
 if(plannedLoss>risk)return null;
 return{index:index,asOf:p.asOf,price:p.close,stop,units,count:count+1,type:tight?'횡보 상단 돌파':'눌림 회복',gainR:(p.close-trade.entry)/risk,plannedRiskR:plannedLoss/risk,tp1:p.close+1.5*newRisk,tp2:p.close+2.5*newRisk,volumeRatio:g.volumeRatio};
}
