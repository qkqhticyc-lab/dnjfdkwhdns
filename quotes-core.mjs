export const INDICATORS=[
 {id:'us10y',name:'미국 10년물 금리',symbol:'^TNX',kind:'yield',unit:'%',digits:3},
 {id:'kospi',name:'코스피',symbol:'^KS11',kind:'index',unit:'pt',digits:2},
 {id:'kosdaq',name:'코스닥',symbol:'^KQ11',kind:'index',unit:'pt',digits:2},
 {id:'nasdaq',name:'나스닥',symbol:'^IXIC',kind:'index',unit:'pt',digits:2},
 {id:'dow',name:'다우',symbol:'^DJI',kind:'index',unit:'pt',digits:2},
 {id:'sp500',name:'S&P 500',symbol:'^GSPC',kind:'index',unit:'pt',digits:2},
 {id:'vix',name:'VIX',symbol:'^VIX',kind:'index',unit:'pt',digits:2},
 {id:'wti',name:'WTI 원유',symbol:'CL=F',kind:'future',unit:'USD/배럴',digits:2},
 {id:'brent',name:'브렌트유',symbol:'BZ=F',kind:'future',unit:'USD/배럴',digits:2},
 {id:'gold',name:'골드',symbol:'GC=F',kind:'future',unit:'USD/트로이온스',digits:2},
 {id:'silver',name:'실버',symbol:'SI=F',kind:'future',unit:'USD/트로이온스',digits:3},
 {id:'copper',name:'구리',symbol:'HG=F',kind:'future',unit:'USD/파운드',digits:4}
];
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function localDate(time,timezone){return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time*1000));}
export function normalizeHistory(payload,expectedSymbol){
 const result=payload?.chart?.result?.[0],meta=result?.meta,q=result?.indicators?.quote?.[0];
 if(!meta||meta.symbol?.toUpperCase()!==expectedSymbol.toUpperCase()||!Array.isArray(result.timestamp)||!q||!meta.exchangeTimezoneName)throw Error('Invalid history identity');
 const unique=new Map();
 for(const[i,time]of result.timestamp.entries()){
  const close=q.close?.[i];if(!finite(time)||!finite(close)||close<=0)continue;
  const open=q.open?.[i],high=q.high?.[i],low=q.low?.[i],volume=q.volume?.[i],full=[open,high,low].every(v=>finite(v)&&v>0)&&high>=Math.max(open,close,low)&&low<=Math.min(open,close,high);
  const date=localDate(time,meta.exchangeTimezoneName);unique.set(date,{date,time,open:full?open:null,high:full?high:null,low:full?low:null,close,volume:finite(volume)&&volume>=0?volume:null});
 }
 const bars=[...unique.values()].sort((a,b)=>a.time-b.time);if(!bars.length)throw Error('No history');
 return{bars,currency:meta.currency,exchange:meta.fullExchangeName||meta.exchangeName,timezone:meta.exchangeTimezoneName,name:meta.longName||meta.shortName||meta.symbol,instrumentType:meta.instrumentType};
}
export async function fetchHistory(symbol,range,fetcher=fetch){
 const response=await fetcher('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?'+new URLSearchParams({range,interval:'1d',includePrePost:'false'}),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('History source HTTP '+response.status);return normalizeHistory(await response.json(),symbol);
}
function shifted(date,months=0,days=0){const d=new Date(date+'T00:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-months);d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10);}
export function indicatorFromHistory(def,history,now=new Date()){
 const bars=history.bars,last=bars.at(-1),previous=bars.at(-2),start=shifted(last.date,3),points=bars.filter(p=>p.date>=start).map(p=>({date:p.date,close:p.close}));
 const reference=cutoff=>bars.filter(p=>p.date<=cutoff).at(-1)?.close;
 const change=previous?last.close-previous.close:null,changePercent=previous?change/previous.close*100:null;
 const periods=[{label:'1주',ref:reference(shifted(last.date,0,7))},{label:'1개월',ref:reference(shifted(last.date,1))},{label:'3개월',ref:reference(start)}].map(p=>({label:p.label,percent:p.ref? (last.close/p.ref-1)*100:null,bp:def.kind==='yield'&&p.ref?(last.close-p.ref)*100:null}));
 return{...def,status:'ok',price:last.close,asOf:last.date,change,changePercent,bp:def.kind==='yield'&&change!=null?change*100:null,low:Math.min(...points.map(p=>p.close)),high:Math.max(...points.map(p=>p.close)),points,periods,collectedAt:now.toISOString(),source:'https://finance.yahoo.com/quote/'+encodeURIComponent(def.symbol)+'/'};
}
export async function collectIndicators(fetcher=fetch,now=new Date()){
 const items=Array(INDICATORS.length);let index=0;
 await Promise.all(Array.from({length:4},async()=>{while(index<INDICATORS.length){const i=index++,def=INDICATORS[i];try{items[i]=indicatorFromHistory(def,await fetchHistory(def.symbol,'6mo',fetcher),now);}catch{items[i]={...def,status:'unavailable'};}}}));
 return{schemaVersion:1,collectedAt:now.toISOString(),items};
}
export function chartSymbols(market,symbol,exchange=''){
 if(typeof symbol!=='string'||symbol.length>20)throw Error('Invalid symbol');
 if(market==='KR'&&/^\d{6}$/.test(symbol)){const suffix=/코스닥|KOSDAQ/i.test(exchange)?['KQ']:/코스피|KOSPI/i.test(exchange)?['KS']:['KS','KQ'];return suffix.map(s=>symbol+'.'+s);}
 if(market==='US'&&/^[A-Z][A-Z0-9.-]{0,19}$/.test(symbol))return[symbol.replaceAll('.','-')];
 if(market==='HK'&&/^\d{4,5}$/.test(symbol))return[symbol.replace(/^0+(?=\d{4})/,'')+'.HK'];
 if(market==='JP'&&/^[A-Z0-9]{4,5}$/.test(symbol))return[symbol+'.T'];
 throw Error('Invalid market or symbol');
}
export async function collectStockChart({market,symbol,range='6mo',exchange='',currency},fetcher=fetch){
 if(!['1mo','3mo','6mo','1y','2y'].includes(range))throw Error('Invalid range');
 const currencies={KR:['KRW'],US:['USD'],HK:['HKD','CNY','USD'],JP:['JPY']};if(currency&&!currencies[market]?.includes(currency))throw Error('Invalid currency');
 chartSymbols(market,symbol,exchange);
 const lookup=await fetcher('https://stock.naver.com/api/autocomplete/search/autoComplete?'+new URLSearchParams({query:symbol,target:'stock'}),{signal:AbortSignal.timeout(10000)});if(!lookup.ok)throw Error('Stock identity unavailable');const found=await lookup.json();
 const nation={KR:'KOR',US:'USA',HK:'HKG',JP:'JPN'}[market],item=found.result?.items?.find(p=>p.category==='stock'&&p.nationCode===nation&&p.code===symbol);if(!item)throw Error('No matching stock');
 const actualCurrency=market==='HK'&&/\(CNY\)/.test(item.name)?'CNY':market==='HK'&&/\(USD\)/.test(item.name)?'USD':{KR:'KRW',US:'USD',HK:'HKD',JP:'JPY'}[market];if(currency&&currency!==actualCurrency)throw Error('Currency mismatch');
 const providerSymbol=market==='KR'?symbol:item.reutersCode;if(typeof providerSymbol!=='string'||!/^[A-Za-z0-9.^-]{1,30}$/.test(providerSymbol))throw Error('Invalid provider identity');
 const timezone={KR:'Asia/Seoul',US:'America/New_York',HK:'Asia/Hong_Kong',JP:'Asia/Tokyo'}[market],today=localDate(Date.now()/1000,timezone),start=shifted(today,{ '1mo':1,'3mo':3,'6mo':6,'1y':12,'2y':24}[range]).replaceAll('-','')+'0000',end=today.replaceAll('-','')+'2359';
 const response=await fetcher('https://api.stock.naver.com/chart/'+(market==='KR'?'domestic':'foreign')+'/item/'+encodeURIComponent(providerSymbol)+'/day?'+new URLSearchParams({startDateTime:start,endDateTime:end}),{signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('Chart source unavailable');const rows=await response.json();if(!Array.isArray(rows)||rows.length>2000)throw Error('Invalid chart rows');
 const records=rows.filter(p=>/^\d{8}$/.test(p.localDate)),dates=records.map(p=>p.localDate.slice(0,4)+'-'+p.localDate.slice(4,6)+'-'+p.localDate.slice(6,8));
 // UTC-midnight values represent calendar-date anchors, not intraday quote timestamps.
 const h=normalizeHistory({chart:{result:[{meta:{symbol:providerSymbol,exchangeTimezoneName:'UTC'},timestamp:dates.map(d=>Date.parse(d+'T00:00:00Z')/1000),indicators:{quote:[{open:records.map(p=>p.openPrice),high:records.map(p=>p.highPrice),low:records.map(p=>p.lowPrice),close:records.map(p=>p.closePrice),volume:records.map(p=>p.accumulatedTradingVolume)}]}}]}},providerSymbol);
 return{schemaVersion:1,status:'ok',market,symbol,providerSymbol,range,currency:actualCurrency,exchange:item.typeName||item.typeCode,timezone,name:item.name,asOf:h.bars.at(-1).date,bars:h.bars,collectedAt:new Date().toISOString(),source:'https://stock.naver.com/'+(market==='KR'?'domestic':'worldstock')+'/stock/'+encodeURIComponent(providerSymbol)+'/price'};
}
