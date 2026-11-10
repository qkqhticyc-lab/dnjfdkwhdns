import{analyzeGuide}from'./chart-guide-core.mjs';
import{closedBars,wilderRSI}from'./technical-core.mjs';
import{chartSymbols,localDate}from'./quotes-core.mjs';
const finite=Number.isFinite,minute=(t,zone)=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hourCycle:'h23',hour:'2-digit',minute:'2-digit'}).format(new Date(t*1000));return +p.slice(0,2)*60+(+p.slice(3,5));};
const labels={up_attempt:'상승 전환 시도',up_reversal:'상승 추세 전환',up_trend:'상승 추세 유지',down_attempt:'하락 전환 시도',down_reversal:'하락 추세 전환',down_trend:'하락 추세 유지',mixed:'중립 · 방향 탐색',insufficient:'자료 부족'};
const direction=state=>state.startsWith('up_')?'up':state.startsWith('down_')?'down':'mixed';
export function analyzeReversal(rows){
 if(!Array.isArray(rows)||rows.some((p,i)=>!finite(p.close)||p.close<=0||typeof p.asOf!=='string'||(i&&p.asOf<=rows[i-1].asOf)))throw Error('Invalid reversal history');
 const n=rows.length,last=rows.at(-1);if(n<65)return{status:'insufficient',state:'insufficient',label:labels.insufficient,direction:'mixed',observations:n,required:65,asOf:last?.asOf||null,reason:'20·60봉 이동평균과 5봉 기울기를 비교할 마감봉이 최소 65개 필요합니다.',chart:[]};
 const closes=rows.map(p=>p.close),sums=[0];for(const v of closes)sums.push(sums.at(-1)+v);const ma=(i,p)=>i>=p-1?(sums[i+1]-sums[i+1-p])/p:null;
 const frames=rows.map((p,i)=>{const fast=ma(i,20),slow=ma(i,60),oldFast=ma(i-5,20),oldSlow=ma(i-5,60),slopeFast=oldFast>0?(fast/oldFast-1)*100:null,slopeSlow=oldSlow>0?(slow/oldSlow-1)*100:null,regime=slopeSlow==null?null:p.close>fast&&fast>slow&&slopeFast>0&&slopeSlow>0?'up':p.close<fast&&fast<slow&&slopeFast<0&&slopeSlow<0?'down':'mixed';return{fast,slow,slopeFast,slopeSlow,regime};});
 let bias=null,lastSignal=null;
 for(let i=65;i<n;i++){const dir=frames[i].regime;if(!['up','down'].includes(dir)||frames[i-1].regime!==dir)continue;
  const recentCross=frames.slice(Math.max(60,i-10),i+1).some((f,j,a)=>j>0&&(dir==='up'?a[j-1].fast<=a[j-1].slow&&f.fast>f.slow:a[j-1].fast>=a[j-1].slow&&f.fast<f.slow));
  if((bias&&bias!==dir)||(!bias&&recentCross))lastSignal={direction:dir,asOf:rows[i].asOf,index:i};bias=dir;
 }
 const f=frames.at(-1),rsi=wilderRSI(closes),upConfirmed=f.regime==='up'&&frames.at(-2).regime==='up',downConfirmed=f.regime==='down'&&frames.at(-2).regime==='down';let state='mixed';
 if(upConfirmed)state=lastSignal?.direction==='up'&&lastSignal.index>=n-5?'up_reversal':'up_trend';
 else if(downConfirmed)state=lastSignal?.direction==='down'&&lastSignal.index>=n-5?'down_reversal':'down_trend';
 else if(last.close>f.fast&&f.slopeFast>0&&rsi>=50)state='up_attempt';
 else if(last.close<f.fast&&f.slopeFast<0&&rsi<50)state='down_attempt';
 const prior=rows.slice(-21,-1),volumePeers=rows.slice(0,-1).filter(p=>last.durationMinutes==null||(p.durationMinutes===last.durationMinutes&&p.bucket===last.bucket)).slice(-20),averageVolume=volumePeers.length===20&&volumePeers.every(p=>finite(p.volume)&&p.volume>=0)?volumePeers.reduce((s,p)=>s+p.volume,0)/20:null;
 return{status:'ok',state,label:labels[state],direction:direction(state),asOf:last.asOf,observations:n,close:last.close,sma20:f.fast,sma60:f.slow,slope20:f.slopeFast,slope60:f.slopeSlow,rsi,confirmation:upConfirmed||downConfirmed?2:['up','down'].includes(f.regime)?1:0,lastSignal:lastSignal&&{direction:lastSignal.direction,asOf:lastSignal.asOf},volumeRatio:averageVolume>0&&finite(last.volume)&&last.volume>=0?last.volume/averageVolume:null,breakout20:last.close>Math.max(...prior.map(p=>p.close))?'up':last.close<Math.min(...prior.map(p=>p.close))?'down':'none',chart:rows.slice(-40).map((r,i)=>({asOf:r.asOf,close:r.close,sma20:frames[n-Math.min(n,40)+i].fast,sma60:frames[n-Math.min(n,40)+i].slow})),conditions:[{label:'종가 > 20봉선',met:last.close>f.fast,downLabel:'종가 < 20봉선',downMet:last.close<f.fast},{label:'20봉선 > 60봉선',met:f.fast>f.slow,downLabel:'20봉선 < 60봉선',downMet:f.fast<f.slow},{label:'20봉선 5봉 기울기 > 0',met:f.slopeFast>0,downLabel:'20봉선 5봉 기울기 < 0',downMet:f.slopeFast<0},{label:'60봉선 5봉 기울기 > 0',met:f.slopeSlow>0,downLabel:'60봉선 5봉 기울기 < 0',downMet:f.slopeSlow<0},{label:'RSI(14) ≥ 50',met:rsi>=50,downLabel:'RSI(14) < 50',downMet:rsi<50}]};
}
const lunch=(market,t,zone)=>{const m=minute(t,zone);return market==='HK'?m>=720&&m<780:market==='JP'?m>=690&&m<750:false;};
export function aggregateFourHours(payload,{symbol,market,currency,timezone},now=new Date(),includeLive=false){
 const r=payload?.chart?.result?.[0],meta=r?.meta,q=r?.indicators?.quote?.[0];
 if(payload?.chart?.error||meta?.symbol?.toUpperCase()!==symbol.toUpperCase()||meta.currency!==currency||meta.exchangeTimezoneName!==timezone||meta.dataGranularity!=='30m'||!Array.isArray(r.timestamp)||r.timestamp.length>6000||!q)throw Error('Invalid intraday identity or interval');
 const raw=Array.isArray(meta.tradingPeriods)?meta.tradingPeriods:meta.tradingPeriods?.regular;
 if(!Array.isArray(raw)||!finite(meta.regularMarketTime))throw Error('Session metadata unavailable');
 const sessions=[...new Map(raw.flat(3).filter(p=>p&&finite(p.start)&&finite(p.end)&&p.end>p.start&&p.end-p.start<86400).map(p=>[p.start,p])).values()].sort((a,b)=>a.start-b.start);
 if(!sessions.length)throw Error('No trading sessions');
 const cutoff=Math.min(now.getTime()/1000,meta.regularMarketTime),bars=new Map();
 for(const[i,time]of r.timestamp.entries()){if(!finite(time)||time>cutoff)continue;const open=q.open?.[i],high=q.high?.[i],low=q.low?.[i],close=q.close?.[i],volume=q.volume?.[i];if(![open,high,low,close].every(v=>finite(v)&&v>0)||high<Math.max(open,close,low)||low>Math.min(open,close,high))continue;bars.set(time,{open,high,low,close,volume:finite(volume)&&volume>=0?volume:null});}
 const all=[];let continuous=[],incomplete=0,inProgress=0;
 for(const session of sessions){for(let start=session.start;start<session.end;start+=14400){const end=Math.min(start+14400,session.end),provisional=end>cutoff;if(provisional){if(start<cutoff)inProgress++;if(!includeLive||start>=cutoff)continue;}const slots=[];for(let t=start;t<end&&(!provisional||t<=cutoff);t+=1800)if(!lunch(market,t,timezone))slots.push(t);if(!slots.length)continue;
   if(slots.some(t=>!bars.has(t))){incomplete++;continuous=[];continue;}
   const values=slots.map(t=>bars.get(t)),last=values.at(-1),row={asOf:new Date(end*1000).toISOString(),start:new Date(start*1000).toISOString(),open:values[0].open,high:Math.max(...values.map(p=>p.high)),low:Math.min(...values.map(p=>p.low)),close:last.close,volume:values.every(p=>p.volume!=null)?values.reduce((s,p)=>s+p.volume,0):null,durationMinutes:(end-start)/60,bucket:Math.floor((start-session.start)/14400),shortened:end-start<14400};
   if(includeLive)Object.assign(row,{provisional,observedAt:new Date(Math.min(end,cutoff)*1000).toISOString()});all.push(row);continuous.push(row);
  }}
 return{bars:continuous,validBars:all.length,incomplete,inProgress,sessionStart:sessions.at(-1).start,sessionEnd:sessions.at(-1).end,sourceThrough:new Date(cutoff*1000).toISOString()};
}
export async function collectReversals(own,fetcher=fetch,now=new Date()){
 const today=localDate(now.getTime()/1000,own.timezone),daily={...analyzeReversal(closedBars(own.bars,today).map(p=>({...p,asOf:p.date}))),guide:analyzeGuide(closedBars(own.bars,today).map(p=>({...p,asOf:p.date}))),timeframe:'1d',timezone:own.timezone,source:own.source,sourceName:'네이버페이 증권 일봉',collectedAt:now.toISOString()};let fourHour={status:'unavailable',timeframe:'4h',reason:'이 종목의 4시간봉 자료를 확인하지 못했습니다.',collectedAt:now.toISOString()};
 for(const symbol of chartSymbols(own.market,own.symbol,own.exchange)){
  try{const u='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?'+new URLSearchParams({period1:String(Math.floor(now.getTime()/1000)-58*86400),period2:String(Math.floor(now.getTime()/1000)),interval:'30m',includePrePost:'false'});const r=await fetcher(u,{headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json'},signal:AbortSignal.timeout(6500)});if(!r.ok)throw Error('Intraday HTTP '+r.status);const raw=await r.json(),merged=aggregateFourHours(raw,{symbol,market:own.market,currency:own.currency,timezone:own.timezone},now),last=merged.bars.at(-1);
   fourHour={...analyzeReversal(merged.bars),guide:analyzeGuide(merged.bars),timeframe:'4h',timezone:own.timezone,source:'https://finance.yahoo.com/quote/'+encodeURIComponent(symbol)+'/chart/',sourceName:'Yahoo Finance 30분봉 재집계',collectedAt:now.toISOString(),sourceThrough:merged.sourceThrough,incomplete:merged.incomplete,inProgress:merged.inProgress,validBars:merged.validBars,lastStart:last?.start||null,lastDurationMinutes:last?.durationMinutes??null,sessionNote:own.market==='KR'?'국내 Yahoo 분봉은 제공처 세션(통상 09:00~15:00)까지만 집계합니다. 15:00 이후 정규장 자료는 포함하지 않습니다.':'제공처 정규장 시작부터 4시간 간격으로 묶습니다. 점심 휴장과 장외 거래는 제외합니다.',method:'session-anchored-4h',shortened:!!last?.shortened};break;
  }catch(error){console.warn('Reversal intraday unavailable',symbol,error?.message||'Unknown error');}
 }
 return{daily,fourHour};
}
