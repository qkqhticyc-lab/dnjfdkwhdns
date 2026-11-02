// Fixed, verified provider identities; callers cannot supply arbitrary upstream URLs.
export const LIVE_INDICATORS = [
 {id:'us10y',code:'US10YT=RR',category:'bond',type:'governmentBond'},
 {id:'kospi',code:'KOSPI',category:'domestic',type:'index'},
 {id:'kosdaq',code:'KOSDAQ',category:'domestic',type:'index'},
 {id:'nasdaq',code:'.IXIC',category:'index',type:'index'},
 {id:'dow',code:'.DJI',category:'index',type:'index'},
 {id:'sp500',code:'.INX',category:'index',type:'index'},
 {id:'vix',code:'.VIX',category:'index',type:'index'},
 {id:'wti',code:'CLcv1',category:'energy',type:'futures'},
 {id:'brent',code:'LCOcv1',category:'energy',type:'futures'},
 {id:'gold',code:'GCcv1',category:'metals',type:'futures'},
 {id:'silver',code:'SIcv1',category:'metals',type:'futures'},
 {id:'copper',code:'HGcv1',category:'metals',type:'futures'}
];
const num=v=>v!=null&&String(v).trim()!==''&&Number.isFinite(Number(String(v).replaceAll(',','')))?Number(String(v).replaceAll(',','')):null;
const tz=z=>({EST5EDT:'America/New_York',CST6CDT:'America/Chicago'}[z]||z);
export function liveURLs(def){
 const {code,category,type}=def,base='https://m.stock.naver.com';
 return {
  quote:category==='domestic'?`${base}/api/index/${code}/basic`:category==='index'?`https://api.stock.naver.com/index/${code}/basic`:`${base}/front-api/marketIndex/productDetail?`+new URLSearchParams({category,reutersCode:code}),
  chart:category==='domestic'?`https://api.stock.naver.com/chart/domestic/index/${code}?periodType=day`:category==='index'?`${base}/front-api/chart/foreign/stock/end?`+new URLSearchParams({code,chartInfoType:type,scriptChartType:'day'}):`${base}/front-api/chart/pricesByPeriod?`+new URLSearchParams({reutersCode:code,category,chartInfoType:type,scriptChartType:'day'}),
  source:category==='domestic'?`${base}/domestic/index/${code}/total`:category==='index'?`${base}/worldstock/index/${code}/total`:`${base}/marketindex/${category}/${code}`
 };
}
export function normalizeLiveIndicator(def,quotePayload,chartPayload,now=new Date()){
 const q=quotePayload?.result||quotePayload;
 if(quotePayload?.isSuccess===false||q?.reutersCode!==def.code||(def.category==='domestic'||def.category==='index'?q.stockEndType!=='index':q.categoryType!==def.category))throw Error('Quote identity mismatch');
 const price=num(q.closePrice),change=num(q.compareToPreviousClosePrice??q.fluctuations),changePercent=num(q.fluctuationsRatio),quoteAt=q.localTradedAt;
 if(!(price>0)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(quoteAt||'')||!Number.isFinite(Date.parse(quoteAt))||Date.parse(quoteAt)>now.getTime()+120000)throw Error('Invalid quote');
 const chart=chartPayload?.result||chartPayload,timezone=tz(chart?.zoneId||q.stockExchangeType?.zoneId||(def.category==='domestic'?'Asia/Seoul':def.category==='bond'?'America/New_York':null));
 let points=[],chartDate=null,chartPreviousClose=null;
 // A chart failure must not turn today's daily snapshot into an intraday chart.
 if(chartPayload?.isSuccess!==false&&chart?.code===def.code&&chart.infoType===def.type&&chart.periodType==='day'&&/^\d{8}$/.test(chart.tradeBaseAt||'')&&Array.isArray(chart.priceInfos)){
  const maxTime=chart.localDateTimeNow,quoteLocal=quoteAt.replace(/[-:T]/g,'').slice(0,14),end=maxTime&&/^\d{14}$/.test(maxTime)?[maxTime,quoteLocal].sort()[0]:quoteLocal;
  points=[...new Map(chart.priceInfos.filter(p=>/^\d{14}$/.test(p.localDateTime||'')&&p.localDateTime<=end&&num(p.currentPrice)>0&&(!chart.openTime||p.localDateTime>=chart.openTime)&&(!chart.closeTime||p.localDateTime<=chart.closeTime)).map(p=>[p.localDateTime,{at:p.localDateTime,price:num(p.currentPrice)}])).values()].sort((a,b)=>a.at.localeCompare(b.at));
  // Do not join a quote for a newer local date to a previous session chart.
  if(points.length&&points.at(-1).at.slice(0,8)!==quoteLocal.slice(0,8))points=[];
  chartDate=points.length?chart.tradeBaseAt:null;chartPreviousClose=num(chart.lastClosePrice);
 }
 const delay=num(q.delayTime),delayMinutes=delay!=null&&delay>=0?delay:null;
 return{id:def.id,code:def.code,status:'ok',price,change,changePercent,bp:def.category==='bond'&&change!=null?change*100:null,quoteAt,timezone,marketStatus:q.marketStatus||'UNKNOWN',delayMinutes,delayLabel:delayMinutes===0?'실시간':delayMinutes>0?`${delayMinutes}분 지연`:'지연 여부 미제공',points,chartDate,chartPreviousClose,collectedAt:now.toISOString(),source:liveURLs(def).source,contract:q.month||null};
}
export async function collectLiveIndicators(fetcher=fetch,now=new Date()){
 const items=Array(LIVE_INDICATORS.length);let cursor=0;
 const get=async u=>{const r=await fetcher(u,{signal:AbortSignal.timeout(6500)});if(!r.ok)throw Error('Source unavailable');return r.json();};
 await Promise.all(Array.from({length:4},async()=>{while(cursor<LIVE_INDICATORS.length){const i=cursor++,def=LIVE_INDICATORS[i],urls=liveURLs(def);const [q,c]=await Promise.allSettled([get(urls.quote),get(urls.chart)]);try{if(q.status!=='fulfilled')throw Error();items[i]=normalizeLiveIndicator(def,q.value,c.status==='fulfilled'?c.value:null,now);}catch{items[i]={id:def.id,code:def.code,status:'unavailable'};}}}));
 return{schemaVersion:1,collectedAt:now.toISOString(),items};
}
export function retainLiveItems(next,previous){
 return{...next,items:next.items.map(n=>{const p=previous?.items?.find(p=>p.id===n.id&&p.code===n.code&&['ok','stale'].includes(p.status));return p&&(n.status!=='ok'||Date.parse(n.quoteAt)<Date.parse(p.quoteAt))?{...p,status:'stale'}:n;})};
}
