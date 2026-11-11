// A fresh planning snapshot, not a simulated fill or the legacy signal trade.
// Every input must belong to the displayed prefix. Parameters are our own rules.
import {wilderRange} from './technical-core.mjs';
export const PLAN_RULES = '선택 주기의 EMA8·21·55 배열과 EMA21의 5봉 기울기, ADX(14)·DI 방향, RSI(14)와 3봉 변화, 거래량을 함께 검토합니다. 강한 상승은 상승 배열·기울기·ADX≥25·+DI>−DI, RSI 50~70 미만, 최근 마감봉 거래량≥1배일 때입니다. 목표 범위는 강한 상승 1.5/3ATR, 상승 1.25/2ATR, 그 외 또는 RSI≥70·<45 또는 RSI 3봉간 5 이상 하락 시 0.75/1.5ATR입니다. 가까운 저항이 먼저 있으면 저항 직전(최대 0.1ATR, 남은 거리의 절반 이내)으로 제한하며 2차는 그 저항 돌파 후 재검토합니다. 저항이 없으면 변동성 시나리오로만 표시합니다. 최근 60봉의 좌우 2개 마감봉으로 확정한 지지 아래에 상승 국면 0.5ATR(최소 거리 1ATR), 그 외 0.35ATR(최소 0.75ATR) 여유를 둡니다. 지지가 없으면 EMA21 참고선입니다. 손절폭 한도 초과·1차 손익비<1.5·약세·RSI<45·RSI≥75·RSI≥70이며 하락·EMA21 위 2ATR 초과 등은 대기입니다. 진행 봉 거래량은 판단에서 제외하고 최근 마감봉을 사용합니다. 이 수치들은 자체 실험 규칙이며 가격 예측·도달 확률 또는 수익성이 검증된 값이 아닙니다.';
const finite = Number.isFinite;
export function planContext(frames){
 const p=frames.at(-1),old=frames.at(-6),rsiOld=frames.at(-4),range=wilderRange(frames);
 const ready=[p?.ema8,p?.ema21,p?.ema55,old?.ema21,p?.rsi,range.adx].every(finite);
 const slope=finite(old?.ema21)&&old.ema21>0?(p.ema21/old.ema21-1)*100:null;
 const up=ready&&p.close>p.ema21&&p.ema8>p.ema21&&p.ema21>p.ema55&&slope>0;
 const down=ready&&(p.close<p.ema21&&p.ema8<p.ema21&&slope<0);
 const rsi=finite(p?.rsi)?p.rsi:null,rsiChange=finite(rsi)&&finite(rsiOld?.rsi)?rsi-rsiOld.rsi:null;
 const volumeBar=frames.findLast(v=>!v.provisional),volumeRatio=finite(volumeBar?.volumeRatio)?volumeBar.volumeRatio:null;
 const strong=up&&range.adx>=25&&range.plusDI>range.minusDI&&rsi>=50&&rsi<70&&volumeRatio>=1;
 const defensive=!up||rsi>=70||rsi<45||(finite(rsiChange)&&rsiChange<=-5);
 const multipliers=defensive?[.75,1.5]:strong?[1.5,3]:[1.25,2];
 return{ready,regime:!ready?'unknown':strong?'strongUp':up?'up':down?'down':'range',label:!ready?'추세 자료 부족':strong?'강한 상승':up?'상승':down?'하락':'횡보·혼조',slope,rsi,rsiChange,...range,volumeRatio,volumeAsOf:volumeBar?.asOf,defensive,multipliers,buffer:up?.5:.35,minDistance:up?1:.75};
}
export function buildTradePlan(frames, {maxRiskPct=8}={}) {
 const p=frames.at(-1),entry=p?.close,atr=p?.atr;
 const empty={status:'unavailable',label:'자료 부족',asOf:p?.asOf,entry,stop:null,tp1:null,tp2:null,reasons:['가격·ATR 및 충분한 마감봉이 필요합니다.']};
 if(!finite(entry)||entry<=0||!finite(atr)||atr<=0||frames.length<22)return empty;
 maxRiskPct=[5,8,12].includes(maxRiskPct)?maxRiskPct:8;
 const closed=frames.filter(v=>!v.provisional),peaks=[],troughs=[];
 for(let i=Math.max(2,closed.length-60);i<closed.length-2;i++) {
  const b=closed[i],neighbors=[closed[i-2],closed[i-1],closed[i+1],closed[i+2]];
  if(![b,...neighbors].every(v=>finite(v.high)&&finite(v.low)))continue;
  if(neighbors.every(v=>b.high>=v.high)&&neighbors.some(v=>b.high>v.high))peaks.push({value:b.high,asOf:b.asOf,index:i});
  if(neighbors.every(v=>b.low<=v.low)&&neighbors.some(v=>b.low<v.low))troughs.push({value:b.low,asOf:b.asOf,index:i});
 }
 const supports=[];
 for(const h of peaks)if(h.value<entry&&frames.slice(-5).some((b,j,a)=>{
  const prev=j?a[j-1]:frames.at(-6);return prev&&prev.asOf>h.asOf&&prev.close<=h.value&&b.close>h.value;
 }))supports.push({...h,kind:'최근 돌파 고점'});
 for(const l of troughs)if(l.value<entry&&closed.slice(l.index+2).every(b=>b.close>=l.value-atr*.25))supports.push({...l,kind:'확인된 눌림 저점'});
 // Recent 20-bar resistance is also useful before a 2-right-bar pivot exists.
 const recent=frames.slice(-21,-1).filter(v=>!v.provisional&&finite(v.high));
 if(recent.length===20){const high=Math.max(...recent.map(v=>v.high));if(entry>high)supports.push({value:high,asOf:recent.find(v=>v.high===high).asOf,kind:'직전 20봉 돌파선'});}
 supports.sort((a,b)=>b.value-a.value);
 const support=supports[0]||(finite(p.ema21)&&p.ema21<entry?{value:p.ema21,asOf:p.asOf,kind:'EMA21 참고선'}:null);
 if(!support)return {...empty,reasons:['현재가 아래에서 사용할 지지 기준을 확인하지 못했습니다.']};
 const context=planContext(frames);
 const stop=Math.min(support.value-atr*context.buffer,entry-atr*context.minDistance);
 if(stop<=0)return {...empty,reasons:['변동성이 가격에 비해 너무 커 유효한 손절 후보를 계산할 수 없습니다.']};
 const risk=entry-stop,riskPct=risk/entry*100,targets=[];
 for(const h of peaks.filter(h=>h.value>entry).sort((a,b)=>a.value-b.value))if(!targets.some(t=>Math.abs(t.value-h.value)<atr*.25))targets.push({...h,kind:'확인 고점 저항'});
 // Never skip a nearby resistance merely to manufacture a better reward/risk.
 const makeTarget=(multiple,resistance)=>{
  const cap=entry+multiple*atr,obstacle=resistance?.value;
  const before=finite(obstacle)?obstacle-Math.min(atr*.1,(obstacle-entry)*.5):Infinity;
  return{value:Math.min(cap,before),kind:before<=cap?'저항 직전 · '+context.label:(!resistance?'저항 미확인 · ':'')+multiple+'ATR 시나리오',multiple,resistance:obstacle??null,scenario:!resistance};
 };
 const first=makeTarget(context.multipliers[0],targets[0]);
 // A second target is conditional on clearing the first obstacle, not permission to skip it.
 let second=targets.length===1?null:makeTarget(context.multipliers[1],targets[1]);
 if(second&&second.value<=first.value)second=null;
 const rr=(first.value-entry)/risk,extended=finite(p.ema21)&&entry-p.ema21>2*atr,reasons=[];
 if(riskPct>maxRiskPct)reasons.push(`손절폭 ${riskPct.toFixed(1)}%가 선택 한도 ${maxRiskPct}%를 넘습니다.`);
 if(rr<1.5)reasons.push(`1차 후보까지 손익비 ${rr.toFixed(2)}로 기준 1.5에 못 미칩니다.`);
 if(extended)reasons.push('EMA21에서 2ATR 이상 벌어져 있습니다.');
 if(!targets.length)reasons.push('위쪽 저항이 확인되지 않아 목표는 변동성 시나리오입니다.');
 if(p.ema8<p.ema21)reasons.push('단기 추세가 EMA21 아래에 있습니다.');
 if(!context.ready)reasons.push('추세·RSI·ADX 자료가 부족하여 종합 판단을 보류합니다.');
 if(context.regime==='down')reasons.push('하락 추세여서 반등 목표를 신규 진입 근거로 사용하지 않습니다.');
 if(finite(context.rsi)&&context.rsi<45)reasons.push('RSI 45 미만으로 상승 모멘텀 회복을 기다립니다.');
 if(context.rsi>=75||(context.rsi>=70&&context.rsiChange<0))reasons.push('RSI 과열 또는 과열 후 약화로 추격 진입을 기다립니다.');
 if(context.volumeRatio==null)reasons.push('마감봉 거래량 비교 자료가 부족합니다.');
 else if(context.volumeRatio<.8&&support.kind.includes('돌파'))reasons.push('최근 마감봉 거래량이 평균의 0.8배 미만으로 돌파 확인이 약합니다.');
 if(support.kind==='EMA21 참고선')reasons.push('확정된 가격 지지 없이 이동평균만 있어 지지 확인을 기다립니다.');
 const pullback={low:support.value-atr*.25,high:support.value+atr*.25,stop:support.value-atr*.75};
 if(pullback.high>=entry||pullback.stop<=0)Object.assign(pullback,{low:null,high:null,stop:null});
 const status=reasons.length?'wait':'review';
 return {status,label:status==='wait'?'신규 진입 대기':'진입 조건 검토',asOf:p.asOf,provisional:!!p.provisional,entry,atr,support,stop,riskPct,maxRiskPct,tp1:first.value,tp2:second?.value??null,first,second,rr,extended,pullback,context,stopNote:`지지 아래 ${context.buffer}ATR · 최소 ${context.minDistance}ATR 여유`,reasons:reasons.length?reasons:['종합 조건 충족 · 목표 도달을 보장하지 않으며 시장·업종 상황은 별도로 확인하세요.']};
}
