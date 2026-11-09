import {wilderRSI,wilderRange} from './technical-core.mjs';
export const GUIDE_LINES=[
 {key:'ema8',label:'EMA 8',period:8,type:'ema',color:'#cbd5e1'},
 {key:'ema14',label:'EMA 14',period:14,type:'ema',color:'#5294ff'},
 {key:'ema21',label:'EMA 21',period:21,type:'ema',color:'#ffad45'},
 {key:'ema55',label:'EMA 55',period:55,type:'ema',color:'#efdc45'},
 {key:'sma100',label:'SMA 100',period:100,type:'sma',color:'#b28bff'},
 {key:'sma200',label:'SMA 200',period:200,type:'sma',color:'#ff627d'}
];
export const GUIDE_RULES=[
 {key:'breakout',label:'거래량 돌파',color:'#65c9a5',rule:'종가가 직전 20봉 고가를 넘고 종가 > EMA21 > EMA55, 거래량이 비교 20봉 평균의 1.5배 이상.'},
 {key:'pullback',label:'눌림 회복',color:'#82b5ff',rule:'직전 종가가 EMA14 이하였고 현재 종가가 EMA14 위로 회복. 종가 > EMA21 > EMA55, 거래량 1배 이상.'},
 {key:'heat',label:'과열 주의',color:'#ff9b67',rule:'RSI(14) ≥ 70이고 종가가 EMA21보다 ATR(14)의 2배 이상 높음. 하락 확정 신호는 아닙니다.'},
 {key:'weakness',label:'추세 약화',color:'#e3a4d9',rule:'종가가 2봉 연속 EMA21 아래이고 EMA8 < EMA14.'},
 {key:'breakdown',label:'거래량 하방 이탈',color:'#7faaff',rule:'종가가 직전 20봉 저가를 밑돌고 종가 < EMA21 < EMA55, 거래량 1.5배 이상.'},
 {key:'contraction',label:'변동성 수축',color:'#e5cd91',rule:'최근 10봉씩 3개 구간의 고저폭/평균종가가 각각 20% 이상 줄고, 최근 10봉 평균 거래량이 직전 10봉보다 감소. VCP 확정을 뜻하지 않습니다.'}
];
const f=Number.isFinite,mean=a=>a.reduce((s,v)=>s+v,0)/a.length,ohlc=p=>[p.open,p.high,p.low,p.close].every(v=>f(v)&&v>0)&&p.high>=Math.max(p.open,p.close)&&p.low<=Math.min(p.open,p.close);
const n=v=>f(v)?v.toLocaleString('ko-KR',{maximumFractionDigits:2}):'미제공';
// Input is confirmed bars only. All rolling windows use the prefix available
// at each bar; no future pivots, retrospective labels or simulated fills.
export function analyzeGuide(rows){
 if(!Array.isArray(rows)||rows.some((p,i)=>!f(p.close)||p.close<=0||typeof p.asOf!=='string'||!Number.isFinite(Date.parse(p.asOf))||(i&&p.asOf<=rows[i-1].asOf)))throw Error('Invalid guide history');
 const frames=[],events=[],closes=[],sums=[0],ema={},active={};
 for(let i=0;i<rows.length;i++){
  const p=rows[i];closes.push(p.close);sums.push(sums.at(-1)+p.close);
  const averages={};for(const line of GUIDE_LINES){const k=line.period;if(i+1<k){averages[line.key]=null;continue;}const average=(sums[i+1]-sums[i+1-k])/k;averages[line.key]=line.type==='sma'?average:ema[line.key]=ema[line.key]==null?average:ema[line.key]+2/(k+1)*(p.close-ema[line.key]);}
  const prefix=rows.slice(0,i+1),rsi=wilderRSI(closes),atr=wilderRange(prefix).atr,previous=frames.at(-1),prior=rows.slice(Math.max(0,i-20),i),peers=rows.slice(0,i).filter(v=>p.durationMinutes==null||(p.durationMinutes===v.durationMinutes&&p.bucket===v.bucket)).slice(-20);
  const averageVolume=peers.length===20&&peers.every(v=>f(v.volume)&&v.volume>=0)?mean(peers.map(v=>v.volume)):null,volumeRatio=averageVolume>0&&f(p.volume)&&p.volume>=0?p.volume/averageVolume:null,high20=prior.length===20&&prior.every(ohlc)?Math.max(...prior.map(v=>v.high)):null,low20=prior.length===20&&prior.every(ohlc)?Math.min(...prior.map(v=>v.low)):null;
  const a=averages,trend=a.ema55==null?'insufficient':p.close>a.ema8&&a.ema8>a.ema14&&a.ema14>a.ema21&&a.ema21>a.ema55?'up':p.close<a.ema8&&a.ema8<a.ema14&&a.ema14<a.ema21&&a.ema21<a.ema55?'down':'mixed';
  const windows=[prefix.slice(-30,-20),prefix.slice(-20,-10),prefix.slice(-10)],widths=windows.map(w=>w.length===10&&w.every(ohlc)?(Math.max(...w.map(v=>v.high))-Math.min(...w.map(v=>v.low)))/mean(w.map(v=>v.close)):null),volumeWindows=windows.slice(1).map(w=>w.length===10&&w.every(v=>f(v.volume)&&v.volume>=0)?mean(w.map(v=>v.volume)):null);
  const up=a.ema55!=null&&p.close>a.ema21&&a.ema21>a.ema55,down=a.ema55!=null&&p.close<a.ema21&&a.ema21<a.ema55;
  const conditions={breakout:ohlc(p)&&high20!=null&&p.close>high20&&up&&volumeRatio>=1.5,pullback:ohlc(p)&&previous?.ema14!=null&&previous.close<=previous.ema14&&p.close>a.ema14&&up&&volumeRatio!=null&&volumeRatio>=1,heat:atr>0&&a.ema21!=null&&rsi>=70&&(p.close-a.ema21)/atr>=2,weakness:a.ema21!=null&&previous?.ema21!=null&&p.close<a.ema21&&previous.close<previous.ema21&&a.ema8<a.ema14,breakdown:ohlc(p)&&low20!=null&&p.close<low20&&down&&volumeRatio>=1.5,contraction:widths.every(v=>v!=null&&v>0)&&widths[1]<=widths[0]*.8&&widths[2]<=widths[1]*.8&&volumeWindows.every(v=>v!=null)&&volumeWindows[1]<volumeWindows[0]};
  const details={breakout:`종가 ${n(p.close)} > 직전 20봉 고가 ${n(high20)} · EMA21 ${n(a.ema21)} > EMA55 ${n(a.ema55)} · 거래량 ${n(volumeRatio)}배`,pullback:`EMA14 ${n(a.ema14)} 회복 · EMA21 ${n(a.ema21)} > EMA55 ${n(a.ema55)} · 거래량 ${n(volumeRatio)}배`,heat:`RSI ${n(rsi)} · EMA21 위 ${n(atr>0?(p.close-a.ema21)/atr:null)} ATR`,weakness:`2봉 연속 EMA21 하회 · EMA8 ${n(a.ema8)} < EMA14 ${n(a.ema14)}`,breakdown:`종가 ${n(p.close)} < 직전 20봉 저가 ${n(low20)} · EMA21 ${n(a.ema21)} < EMA55 ${n(a.ema55)} · 거래량 ${n(volumeRatio)}배`,contraction:`10봉씩 고저폭 비율 ${widths.map(v=>n(v==null?null:v*100)+'%').join(' → ')} · 평균 거래량 ${n(volumeWindows[0])} → ${n(volumeWindows[1])}`};
  const signals=[];for(const rule of GUIDE_RULES){if(conditions[rule.key]&&!active[rule.key]){signals.push(rule.key);events.push({key:rule.key,asOf:p.asOf,close:p.close,reason:details[rule.key]});}active[rule.key]=!!conditions[rule.key];}
  frames.push({asOf:p.asOf,open:f(p.open)?p.open:null,high:f(p.high)?p.high:null,low:f(p.low)?p.low:null,close:p.close,volume:f(p.volume)&&p.volume>=0?p.volume:null,...averages,rsi,atr,volumeRatio,high20,low20,trend,signals,active:GUIDE_RULES.filter(r=>conditions[r.key]).map(r=>r.key)});
 }
 return{version:1,status:rows.length>=55?'ok':'insufficient',observations:rows.length,asOf:rows.at(-1)?.asOf||null,frames,events,missingLines:GUIDE_LINES.filter(l=>rows.length<l.period).map(l=>l.label)};
}
