import {collectStockChart,chartSymbols,localDate} from './quotes-core.mjs';
import {aggregateFourHours,analyzeReversal} from './reversal-core.mjs';
import {analyzeStrategy} from './strategy-core.mjs';
import {wilderRange} from './technical-core.mjs';
const clock=(at,zone)=>new Intl.DateTimeFormat('en-GB',{timeZone:zone,hourCycle:'h23',hour:'2-digit',minute:'2-digit'}).format(new Date(at));
const hours={KR:['09:00','15:30'],US:['09:30','16:00'],HK:['09:30','16:00'],JP:['09:00','15:30']};
export function liveDailyRows(own,now=new Date()){
 const today=localDate(now.getTime()/1000,own.timezone),time=clock(now,own.timezone),end=hours[own.market][1],quote=own.quote;
 const rows=own.bars.filter(p=>p.date<=today).map(p=>({...p,asOf:p.date,provisional:p.date===today&&time<end,observedAt:own.collectedAt}));
 const last=rows.at(-1);
 // Only update an existing same-day regular-session candle; never manufacture OHLC/volume
 // or blend an extended-session quote into a regular-session bar.
 if(last&&quote?.status==='ok'&&localDate(Date.parse(quote.asOf)/1000,own.timezone)===last.date){
  const t=clock(quote.asOf,own.timezone),[start,finish]=hours[own.market];
  if(t>=start&&t<=finish&&Number.isFinite(quote.price)&&quote.price>0&&Number.isFinite(last.high)&&Number.isFinite(last.low)){
   last.close=quote.price;last.high=Math.max(last.high,quote.price);last.low=Math.min(last.low,quote.price);last.observedAt=quote.asOf;
  }
 }
 return rows;
}
export async function collectLiveChart(request,fetcher=fetch,now=new Date(),loader=collectStockChart){
 const own=await loader({...request,range:'2y',includeQuote:true},fetcher),daily=liveDailyRows(own,now);
 let rows=daily,sourceThrough=daily.at(-1)?.observedAt,source=own.source,sessionNote='정규장 일봉 · 당일 진행 봉 포함. 가격은 동일 거래일 정규장 시세로 보완하며 거래량은 일봉 제공값입니다.',status='ok',reason=null;
 if(request.frame==='fourHour'){
  rows=[];status='unavailable';reason='4시간봉 제공 연결 지연. 일봉으로 전환하거나 다시 불러와 주세요.';
  for(const symbol of chartSymbols(own.market,own.symbol,own.exchange))try{
   const u='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?'+new URLSearchParams({period1:String(Math.floor(now.getTime()/1000)-58*86400),period2:String(Math.floor(now.getTime()/1000)),interval:'30m',includePrePost:'false'});
   const r=await fetcher(u,{headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json'},signal:AbortSignal.timeout(6500)});if(!r.ok)throw Error();
   const merged=aggregateFourHours(await r.json(),{symbol,market:own.market,currency:own.currency,timezone:own.timezone},now,true);
   rows=merged.bars;sourceThrough=merged.sourceThrough;source='https://finance.yahoo.com/quote/'+encodeURIComponent(symbol)+'/chart/';status=rows.length?'ok':'unavailable';
   reason=rows.length?null:'완전한 분봉 구간이 없습니다. 누락된 봉을 임의로 채우지 않습니다.';
   sessionNote='Yahoo 정규장 30분봉을 세션 시작부터 4시간으로 집계 · 진행 봉 포함 · 장 끝은 단축봉. '+(own.market==='KR'?'국내 제공 구간은 통상 09:00~15:00이며 이후 30분은 미제공. ':'')+'현재가와 분봉 제공 시각은 다를 수 있습니다.';break;
  }catch{}
 }
 const guide=analyzeStrategy(rows),reversal=analyzeReversal(rows);
 return{...own,range:request.range||'6mo',frame:request.frame||'daily',liveVersion:2,guide,metrics:wilderRange(rows),frameInfo:{status,reason,timeframe:request.frame==='fourHour'?'4h':'1d',timezone:own.timezone,source,sourceThrough,sessionNote},reversal,bars:rows.map(p=>({...p,date:p.asOf})),asOf:rows.at(-1)?.asOf||null};
}
