import{analyzeOversold,OVERSOLD_RULE}from'./oversold-core.mjs';
import{analyzePatterns,PATTERN_RULES}from'./pattern-core.mjs';
import {analyzeGuide} from './chart-guide-core.mjs';
import {riskLevels} from './risk-levels.mjs';
// Independent, published rules. No claim to reproduce Lazy Alpha's private formula.
export const STRATEGY_RULES=[
 ['setup','셋업','EMA8 > EMA14 > EMA21, 종가 > EMA14.'],
 ['entry','진입','셋업에서 EMA21 상향 교차 또는 EMA14에 닿은 뒤 양봉으로 회복. 거래량 하한 없음.'],
 ['breakoutEntry','돌파 진입','셋업에서 직전 20봉 고가 위로 종가 돌파. 거래량 하한 없음.'],
 ['triangleEntry','삼각수렴 돌파',PATTERN_RULES.triangle],
 ['boxRetestEntry','박스권 재확인',PATTERN_RULES.boxRetest],
 ['oversoldBounceEntry','과매도 반등',OVERSOLD_RULE],
 ['patternExit','패턴 진입 이탈','추세 패턴은 추적 손절선 종가 이탈 또는 2봉 연속 EMA21 아래·EMA8<EMA14. 과매도 반등은 다음 봉부터 손절가 저가 접촉 또는 8봉 경과로 별도 종료.'],
 ['pyramid','추가 진입','보유 상태에서 EMA14 눌림 후 양봉 회복, 비교 거래량 1배 이상. 진입·추가 진입 후 3봉 간격, 최대 2회.'],
 ['tp1','TP1 도달','진입 봉 종가와 최근 5봉 저점으로 정한 0.75~1.5ATR 위험 거리의 1.5배. 다음 봉부터 고가로 도달 확인.'],
 ['tp2','TP2 도달','신호 당시 초기 위험 거리의 2.5배. 목표는 이후 가격으로 다시 늘리지 않습니다.'],
 ['profit','부분 익절 고려','보유 중 직전 10봉 고가를 종가로 갱신하고 진입가 위. 3봉 간격, 보유 구간마다 횟수 초기화.'],
 ['exit14','분할청산 · EMA14','보유 중 종가가 EMA14 아래로 하향 교차. 회복 뒤 재이탈은 다시 평가.'],
 ['exit21','분할청산 · EMA21','보유 중 종가가 EMA21 아래로 하향 교차.'],
 ['hold','분할 보류 · 횡보','분할청산 조건에서 EMA8·14·21 폭 < ATR의 0.3배이고 EMA21의 3봉 변화 < ATR의 0.15배.'],
 ['exit','최종 청산','보유 중 종가가 추적 손절선 아래 또는 2봉 연속 EMA21 아래이면서 EMA8 < EMA14. 다음 봉부터 재진입 평가.'],
 ['peg','PEG 발생','일봉 또는 정규장 첫 4시간봉 시가가 이전 봉 고가보다 1% 이상 높고 양봉, 비교 거래량 2배 이상.'],
 ['pegPullback','PEG 되돌림','발생 다음 봉부터 갭 발생봉 고가와 이전 봉 고가의 중간값에 저가가 닿고, 그 위로 양봉 마감. 한 구간 1회.'],
 ['pegBreakout','PEG 재돌파','갭 발생봉 다음 봉 이후, 직전 종가가 갭 발생봉 고가 이하이고 현재 종가가 이를 돌파. 거래량 1배 이상.'],
 ['pegInvalid','PEG 무효화','갭 발생 직전 봉의 고가 아래로 종가 마감.'],
 ['pegExpired','PEG 만료','발생 후 20봉 경과. 새 PEG 발생은 이전 기준을 대체.'],
 ['heat','과열 주의','RSI14 ≥ 70, EMA21 위로 2ATR 이상. 해당 연속 구간의 충족 봉 수 표시.'],
 ['contraction','변동성 수축','최근 10봉 고저폭/평균종가가 이전 10봉보다 20% 이상 축소, 거래량 감소, EMA21과 거리 ≤ 0.5ATR, 종가 > EMA55. 원본 VCP와 별도 규칙.']
].map(([key,label,rule])=>({key,label,rule,color:['exit','patternExit','exit14','exit21','pegInvalid'].includes(key)?'#f4a0aa':['entry','breakoutEntry','peg','pegBreakout'].includes(key)?'#72d8b1':['heat','profit','tp1','tp2'].includes(key)?'#f3c978':'#a5baff'}));
const valid=p=>p&&[p.open,p.high,p.low,p.close].every(Number.isFinite),mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
export function analyzeStrategy(rows){
 const base=analyzeGuide(rows),patterns=analyzePatterns(rows,base.frames),oversold=analyzeOversold(rows,base.frames),events=[],frames=[],patternTrades={triangle:null,boxRetest:null,oversoldBounce:null};let trade=null,peg=null,setupActive=false,heatCount=0,contractActive=false;
 for(let i=0;i<rows.length;i++){
  const p=rows[i],g=base.frames[i],prev=base.frames[i-1],prior=rows.slice(Math.max(0,i-10),i),signals=[];
  const emit=(key,reason,extra={})=>{signals.push(key);events.push({key,asOf:p.asOf,close:p.close,provisional:!!p.provisional,reason,...extra});};
  const setup=g.ema21!=null&&g.ema8>g.ema14&&g.ema14>g.ema21&&p.close>g.ema14;
  const cross14=prev?.ema14!=null&&prev.close>=prev.ema14&&p.close<g.ema14,cross21=prev?.ema21!=null&&prev.close>=prev.ema21&&p.close<g.ema21;
  const recovering=valid(p)&&p.low<=g.ema14&&p.close>g.ema14&&p.close>p.open;
  const sideways=g.atr>0&&i>=3&&Math.max(g.ema8,g.ema14,g.ema21)-Math.min(g.ema8,g.ema14,g.ema21)<g.atr*.3&&Math.abs(g.ema21-base.frames[i-3].ema21)<g.atr*.15;
  let exited=false;
  if(trade){
   // Intrabar order is unknowable. Report target touches independently from close exits; never simulated fills.
   for(const [key,target] of [['tp1',trade.tp1],['tp2',trade.tp2]])if(!trade[key+'Hit']&&valid(p)&&p.high>=target){trade[key+'Hit']=true;emit(key,`고가 ${p.high} ≥ 저장 목표 ${target}`,{level:target});}
   if(p.close<trade.stop||(prev?.close<prev?.ema21&&p.close<g.ema21&&g.ema8<g.ema14)){emit('exit',`종가 ${p.close}, 직전 추적 손절선 ${trade.stop}. 목표 도달과 같은 봉이면 체결 순서 미확인.`);trade=null;exited=true;}
   else{
    if(cross14||cross21){if(sideways)emit('hold','이평선 밀집과 EMA21 기울기 조건으로 분할청산 보류. 손절선 이탈은 보류하지 않음.');else{if(cross14)emit('exit14',`종가 ${p.close} < EMA14 ${g.ema14}`);if(cross21)emit('exit21',`종가 ${p.close} < EMA21 ${g.ema21}`);}}
    if(setup&&recovering&&g.volumeRatio>=1&&i-trade.lastAdd>=3&&trade.adds<2){trade.adds++;trade.lastAdd=i;emit('pyramid',`EMA14 회복 · 거래량 ${g.volumeRatio.toFixed(2)}배 · ${trade.adds}차`,{count:trade.adds});}
    if(prior.length===10&&prior.every(valid)&&p.close>Math.max(...prior.map(v=>v.high))&&p.close>trade.entry&&i-trade.lastProfit>=3){trade.profits++;trade.lastProfit=i;emit('profit',`직전 10봉 고가 갱신 · 보유 구간 ${trade.profits}회`,{count:trade.profits});}
    // Stop updates apply to the NEXT bar, never retroactively to this bar.
    if(g.ema21>trade.stop&&g.ema21<p.close)trade.stop=g.ema21;
   }
  }
  if(!trade&&!exited&&setup&&g.atr>0&&valid(p)){
   const breakout=g.high20!=null&&p.close>g.high20,entry=prev?.ema21!=null&&prev.close<=prev.ema21&&p.close>g.ema21||recovering;
   const levels=riskLevels(p.close,g.atr,rows.slice(Math.max(0,i-4),i+1).map(v=>v.low));
   if((breakout||entry)&&levels){const {stop,risk}=levels;
    trade={...levels,initialStop:stop,stop,risk,started:p.asOf,lastAdd:i,lastProfit:i,adds:0,profits:0,tp1Hit:false,tp2Hit:false};
    emit(breakout?'breakoutEntry':'entry',`신호 종가 ${p.close} · 초기 손절 ${stop} · TP1 ${trade.tp1} / TP2 ${trade.tp2}. 실제 체결가 아님.`);
   }else if(!setupActive)emit('setup','단기 이평선 정배열과 EMA14 위 종가. 진입 조건은 미충족.');
  }
  setupActive=setup;
  if(peg){
   if(p.close<peg.base){emit('pegInvalid',`종가 ${p.close} < 저장 갭 기준 ${peg.base}`);peg=null;}
   else if(i-peg.index>=20){emit('pegExpired','발생 후 20봉 경과');peg=null;}
   else if(i>peg.index){const mid=(peg.high+peg.base)/2;
    if(!peg.pulled&&valid(p)&&p.low<=mid&&p.close>=mid&&p.close>p.open){peg.pulled=true;emit('pegPullback',`되돌림 기준 ${mid} 회복`);}
    if(i>peg.index+1&&prev.close<=peg.high&&p.close>peg.high&&g.volumeRatio>=1)emit('pegBreakout',`갭 발생봉 고가 ${peg.high} 재돌파 · 거래량 ${g.volumeRatio.toFixed(2)}배`);
   }
  }
  if(valid(p)&&valid(rows[i-1])&&(p.bucket==null||p.bucket===0)&&p.open>=rows[i-1].high*1.01&&p.close>p.open&&g.volumeRatio>=2){peg={base:rows[i-1].high,high:p.high,index:i,started:p.asOf,pulled:false};emit('peg',`이전 봉 고가 ${peg.base} · 발생봉 고가 ${peg.high} · 거래량 ${g.volumeRatio.toFixed(2)}배`);}
  const heat=g.atr>0&&g.rsi>=70&&p.close-g.ema21>=2*g.atr;heatCount=heat?heatCount+1:0;if(heat)emit('heat',`RSI ${g.rsi.toFixed(1)} · 연속 충족 ${heatCount}봉`,{count:heatCount});
  const a=rows.slice(i-19,i-9),b=rows.slice(i-9,i+1),width=w=>(Math.max(...w.map(v=>v.high))-Math.min(...w.map(v=>v.low)))/mean(w.map(v=>v.close));
  const contraction=i>=19&&[...a,...b].every(v=>valid(v)&&Number.isFinite(v.volume))&&width(b)<=width(a)*.8&&mean(b.map(v=>v.volume))<mean(a.map(v=>v.volume))&&g.atr>0&&Math.abs(p.close-g.ema21)<=g.atr*.5&&p.close>g.ema55;
  if(contraction&&!contractActive)emit('contraction','가격 폭·거래량 감소, EMA21 밀착 및 EMA55 상회');contractActive=contraction;
  const pattern=patterns.frames[i];for(const[type,key,trigger]of[['boxRetest','boxRetestEntry',pattern.boxSignal],['triangle','triangleEntry',pattern.triangleSignal],['oversoldBounce','oversoldBounceEntry',oversold.frames[i].signal]]){let t=patternTrades[type],closed=false;
   if(t){for(const[target,level]of[['tp1',t.tp1],['tp2',t.tp2]])if(!t[target+'Hit']&&p.high>=level){t[target+'Hit']=true;emit(target,'고가 '+p.high+' ≥ 저장 목표 '+level,{entryAt:t.started,patternType:type,level});}if(type==='oversoldBounce'?(p.low<=t.stop||i-t.startedIndex>=8):(p.close<t.stop||(prev?.close<prev?.ema21&&p.close<g.ema21&&g.ema8<g.ema14))){emit('patternExit',type==='oversoldBounce'?(p.low<=t.stop?'저가 '+p.low+' ≤ 과매도 반등 손절 '+t.stop+' · 같은 봉 TP 접촉 시 체결 순서 미확인.':'과매도 반등 8봉 추적 기간 종료.'):'종가 '+p.close+' · 해당 패턴 추적 손절선 '+t.stop,{entryAt:t.started,patternType:type});t=null;closed=true;}else if(type==='oversoldBounce'){if(t.tp1Hit)t.stop=Math.max(t.stop,t.entry);}else if(g.ema21>t.stop&&g.ema21<p.close)t.stop=g.ema21;}
   if(trigger&&!t&&!closed&&valid(p)){const levels=type==='oversoldBounce'?oversold.frames[i].levels:riskLevels(p.close,g.atr,rows.slice(Math.max(0,i-4),i+1).map(p=>p.low));if(levels){t={...levels,initialStop:levels.stop,started:p.asOf,startedIndex:i,tp1Hit:false,tp2Hit:false};const detail=type==='oversoldBounce'?'20봉 고가 대비 낙폭 '+oversold.frames[i].dropPct.toFixed(1)+'% · RSI '+oversold.frames[i].minRsi.toFixed(1)+' → '+g.rsi.toFixed(1)+' · 전봉 고가 돌파 및 저점 지지 · 역추세 실험':type==='triangle'?'삼각수렴 상단선 '+(pattern.triangle.upper.m*i+pattern.triangle.upper.b)+' 종가 돌파':'박스 상단 '+pattern.box.top+' 재접촉 후 양봉 회복';emit(key,detail+' · 거래량 '+g.volumeRatio.toFixed(2)+'배 · 신호 종가 '+p.close+' · 초기 손절 '+t.stop+' · TP1 '+t.tp1+' / TP2 '+t.tp2,{patternType:type,levels:{...t}});}}patternTrades[type]=t;
  }
  frames.push({...g,start:p.start,provisional:!!p.provisional,observedAt:p.observedAt,signals,active:signals,trade:trade?{...trade}:null,peg:peg?{...peg}:null,heatCount,pattern,bounce:oversold.frames[i],patternTrades:Object.fromEntries(Object.entries(patternTrades).map(([k,v])=>[k,v?{...v}:null]))});
 }
 return{...base,version:3,patternRulesVersion:1,bounceRulesVersion:1,frames,events,rulesVersion:'independent-v3',asOf:rows.at(-1)?.asOf||null};
}
