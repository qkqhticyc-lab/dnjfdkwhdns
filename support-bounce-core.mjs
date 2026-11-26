export const SUPPORT_BOUNCE_VERSION=1;
export const SUPPORT_BOUNCE_RULE='최근 60봉 고가에서 8%·3ATR 이상 조정 후, 좌우 2봉으로 확인한 지지 저점을 재시험합니다. 최초 저점 이후 3봉 이상 경과·15봉 이내, 저점 재시험 거래량 감소 또는 앞선 매도 급증 뒤 거래량 감소, 저점 방어를 관찰합니다. 다음 봉 이후 전봉 고가를 회복하는 양봉·종가 상위 35%·거래량 1.2배, 지지에서 2ATR 이내·초기 위험 0.5~2.5ATR 및 8% 이내·가까운 저항까지 1.5R 이상일 때 지지 반등을 표시합니다. 지지 하단 종가 이탈 시 후보 무효, 진입 뒤 저가 손절 접촉 또는 12봉 경과 시 종료합니다. 승률이 검증된 매수 추천이 아닙니다.';
const f=Number.isFinite,valid=p=>p&&[p.open,p.high,p.low,p.close,p.volume].every(f)&&p.low>0&&p.volume>=0&&p.high>=Math.max(p.open,p.close,p.low)&&p.low<=Math.min(p.open,p.close),mean=a=>a.reduce((s,v)=>s+v,0)/a.length;

export function analyzeSupportBounce(rows,metrics){
 const frames=[],pivots=[];let watch=null,cooldown=-1;
 for(let i=0;i<rows.length;i++){
  const p=rows[i],g=metrics[i]||{},prev=rows[i-1];
  // A pivot becomes available only after its two right-hand candles close.
  const at=i-2;if(at>=2&&rows.slice(at-2,at+3).every(valid)&&rows[at].low<=Math.min(...rows.slice(at-2,at+3).map(v=>v.low))&&rows[at].low<Math.max(rows[at-1].low,rows[at+1].low))pivots.push({index:at,low:rows[at].low,volume:rows[at].volume,asOf:rows[at].asOf});
  const usable=valid(p)&&g.atr>0&&f(g.rsi),recent=rows.slice(Math.max(0,i-59),i+1),peak=recent.length>=20?Math.max(...recent.map(v=>v.high)):null,drop=peak>0?(1-p.close/peak)*100:null;
  let state='none',signal=false,levels=null,blocked=[],checks=[],snapshot=null;
  if(!usable){frames.push({state,signal,blocked,checks});continue;}
  if(watch&&(i-watch.index>15||p.close<watch.floor)){state=i-watch.index>15?'expired':'invalidated';snapshot=watch;watch=null;cooldown=i+5;}
  if(!watch&&i>cooldown&&f(drop)&&drop>=8&&peak-p.close>=3*g.atr){
   const pivot=pivots.filter(v=>i-v.index>=3&&i-v.index<=60&&p.low>=v.low-.6*g.atr&&p.low<=v.low+1.2*g.atr).at(-1);
   if(pivot){watch={index:i,asOf:p.asOf,anchorAt:pivot.asOf,anchorIndex:pivot.index,anchor:pivot.low,anchorVolume:pivot.volume,floor:pivot.low-.6*g.atr,low:Math.min(pivot.low,p.low),lowIndex:p.low<pivot.low?i:pivot.index,dropPct:drop};state='watch';}
  }
  if(watch){
   if(p.low<watch.low){watch.low=p.low;watch.lowIndex=i;}
   const reclaim=valid(prev)&&p.close>prev.high&&p.close>p.open&&(p.close-p.low)/(p.high-p.low||1)>=.65;
   // A strong recovery candle is demand; do not count its increased volume as renewed selling.
   const tested=rows.slice(Math.max(watch.anchorIndex+3,i-5),reclaim?i:i+1).filter(v=>valid(v)&&v.low<=watch.anchor+.75*g.atr),testVolume=tested.length?mean(tested.map(v=>v.volume)):null;
   const previous=rows.slice(Math.max(0,i-8),i),climax=previous.find((v,j)=>{const k=Math.max(0,i-8)+j,prior=rows.slice(Math.max(0,k-20),k);return valid(v)&&prior.length===20&&prior.every(valid)&&v.volume>=1.8*mean(prior.map(x=>x.volume))&&v.low<=watch.anchor+g.atr&&(v.close-v.low)/(v.high-v.low||1)>=.5;});
   const dry=testVolume!=null&&(testVolume<=watch.anchorVolume*.8||climax&&testVolume<=climax.volume*.7);
   const stable=i>watch.lowIndex&&valid(prev)&&p.low>=prev.low&&p.close>=watch.anchor;
   const stop=watch.low-.2*g.atr,risk=p.close-stop;
   const highs=rows.slice(Math.max(0,i-60),i-2).filter((v,j,a)=>j>=2&&j<a.length-2&&v.high>=Math.max(...a.slice(j-2,j+3).map(x=>x.high))).map(v=>v.high).filter(v=>v>p.close+.1*g.atr);
   const resistance=Math.min(...highs,...[g.ema21,g.ema55].filter(v=>f(v)&&v>p.close+.1*g.atr));
   const riskOkay=stop>0&&risk>=.5*g.atr&&risk<=2.5*g.atr&&risk/p.close<=.08&&p.close-watch.low<=2*g.atr;
   const room=f(resistance)?(resistance-p.close)/risk:null;
   checks=[{key:'support',label:'확인한 지지 재시험',met:tested.length>0},{key:'dry',label:'매도 거래량 감소',met:!!dry},{key:'hold',label:'저점 방어',met:stable},{key:'reclaim',label:'전봉 고가·강한 종가 회복',met:reclaim},{key:'volume',label:'회복 거래량 1.2배',met:f(g.volumeRatio)&&g.volumeRatio>=1.2},{key:'risk',label:'손절 거리·저항까지 1.5R',met:riskOkay&&room>=1.5}];
   blocked=checks.filter(c=>!c.met).map(c=>c.label+' 확인 대기');
   signal=!blocked.length&&!p.provisional;state=signal?'confirmed':'watch';
   if(signal)levels={entry:p.close,stop,initialStop:stop,risk,tp1:p.close+1.5*risk,tp2:p.close+2.5*risk,stopKind:'재시험 지지 저점−0.2ATR'};
   snapshot={...watch,resistance:f(resistance)?resistance:null,roomR:room,checks,blocked,pattern:climax?'매도 흡수 후 회복':'지지 재시험',upper:Math.min(watch.low+2*g.atr,f(resistance)?resistance:Infinity)};
   if(signal){watch=null;cooldown=i+5;}
  }
  frames.push({state,signal,...snapshot,checks,blocked,levels,dropPct:drop});
 }
 return{version:SUPPORT_BOUNCE_VERSION,frames};
}

export function supportBounceCandidate(frames){
 const last=frames.at(-1),b=last?.supportBounce;if(!b||b.state!=='watch'||!b.checks?.find(c=>c.key==='support')?.met||!b.checks?.find(c=>c.key==='dry')?.met||last.close<b.floor||last.close>b.upper)return null;
 return{state:'watch',method:'support',pattern:b.pattern,provisional:!!last.provisional,asOf:b.asOf,age:frames.length-1-b.index,expiresIn:Math.max(0,15-(frames.length-1-b.index)),referenceAt:last.asOf,referencePrice:last.close,lower:b.low,upper:b.upper,stop:b.low-.2*last.atr,resistance:b.resistance,roomR:b.roomR,lowAt:frames[b.lowIndex]?.asOf||b.anchorAt,newLow:b.lowIndex===frames.length-1,aboveLowPct:(last.close/b.low-1)*100,initialDropPct:b.dropPct,currentDropPct:b.dropPct,minRsi:null,rsi:last.rsi,checks:b.checks,blocked:b.blocked};
}
