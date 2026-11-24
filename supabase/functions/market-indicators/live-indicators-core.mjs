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
const US_SYMBOLS={sp500:'^GSPC',nasdaq:'^IXIC',dow:'^DJI'};
const localStamp=at=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(at).map(p=>[p.type,p.value]));return parts.year+parts.month+parts.day+parts.hour+parts.minute+parts.second;};
function easternTime(stamp){
 const target=Date.UTC(+stamp.slice(0,4),+stamp.slice(4,6)-1,+stamp.slice(6,8),+stamp.slice(8,10),+stamp.slice(10,12),+stamp.slice(12,14));let guess=target;
 for(let i=0;i<3;i++){const local=localStamp(new Date(guess)),seen=Date.UTC(+local.slice(0,4),+local.slice(4,6)-1,+local.slice(6,8),+local.slice(8,10),+local.slice(10,12),+local.slice(12,14));guess+=target-seen;}return new Date(guess).toISOString();
}
export function normalizeNasdaqIndicator(def,payload,now=new Date()){
 const d=payload?.data,m=d?.timeAsOf?.match(/^([A-Za-z]{3}) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}) (AM|PM) ET$/),month=m?['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(m[1])+1:0;
 if(def.id!=='nasdaq'||d?.symbol!=='COMP'||!m||!month||!Array.isArray(d.chart))throw Error('Invalid Nasdaq chart identity');
 const day=m[3]+String(month).padStart(2,'0')+m[2].padStart(2,'0'),hour=(h,ampm)=>String(Number(h)%12+(ampm==='PM'?12:0)).padStart(2,'0'),stamp=day+hour(m[4],m[6])+m[5]+'00',quoteAt=easternTime(stamp),price=num(d.lastSalePrice),previous=num(d.previousClose);
 if(!(price>0)||!(previous>0)||Date.parse(quoteAt)>now.getTime()+120000)throw Error('Invalid Nasdaq quote');
 const points=d.chart.flatMap(p=>{const t=p.z?.dateTime?.match(/^(\d{1,2}):(\d{2}) (AM|PM) ET$/),at=t?day+hour(t[1],t[3])+t[2]+'00':null;return at&&at<=stamp&&at.slice(8,12)>='0930'&&at.slice(8,12)<='1600'&&Number.isFinite(p.y)&&p.y>0?[{at,price:p.y}]:[];});
 return {id:def.id,code:def.code,status:'ok',price,change:price-previous,changePercent:(price/previous-1)*100,quoteAt,timezone:'America/New_York',marketStatus:localStamp(now).slice(0,8)===day&&localStamp(now).slice(8,12)>='0930'&&localStamp(now).slice(8,12)<'1600'?'OPEN':'CLOSE',delayMinutes:1,delayLabel:'최소 1분 지연',points,chartDate:day,chartPreviousClose:previous,collectedAt:now.toISOString(),source:'https://www.nasdaq.com/market-activity/index/comp',provider:'Nasdaq',contract:null};
}
export function normalizeCNBCIndicator(def,html,now=new Date()){
 const marker='window.__s_data=',start=html.indexOf(marker)+marker.length;if(start<marker.length||html[start]!=='{')throw Error('CNBC state missing');
 let end=start,depth=0,quoted=false,escape=false;
 for(;end<html.length;end++){const c=html[end];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)break;}
 const symbol={sp500:'.SPX',nasdaq:'.IXIC',dow:'.DJI'}[def.id],q=JSON.parse(html.slice(start,end+1)).quote?.data?.find(p=>p.symbol===symbol),price=num(q?.last),previous=num(q?.previous_day_closing),at=Date.parse(q?.last_time);
 if(!symbol||q?.type!=='INDEX'||q.currencyCode!=='USD'||!(price>0)||!(previous>0)||!Number.isFinite(at)||at>now.getTime()+120000)throw Error('Invalid CNBC index quote');
 return {id:def.id,code:def.code,status:'ok',price,change:price-previous,changePercent:(price/previous-1)*100,quoteAt:new Date(at).toISOString(),timezone:'America/New_York',marketStatus:q.curmktstatus==='REG_MKT'?'OPEN':'CLOSE',delayMinutes:null,delayLabel:'원본 시세 시각 기준',points:[{at:localStamp(new Date(at)),price}],chartDate:localStamp(new Date(at)).slice(0,8),chartPreviousClose:previous,collectedAt:now.toISOString(),source:'https://www.cnbc.com/quotes/'+symbol,provider:'CNBC',chartSampled:true,contract:null};
}
export async function collectAlternateIndicator(def,fetcher=fetch,now=new Date()){
 if(!US_SYMBOLS[def.id])throw Error('Unsupported alternate index');
 if(def.id==='nasdaq')try{const r=await fetcher('https://api.nasdaq.com/api/quote/COMP/chart?assetclass=index',{signal:AbortSignal.timeout(6500)});if(r.ok)return normalizeNasdaqIndicator(def,await r.json(),now);}catch{/* CNBC is an independent public source when Nasdaq is unavailable. */}
 const symbol={sp500:'.SPX',nasdaq:'.IXIC',dow:'.DJI'}[def.id],r=await fetcher('https://www.cnbc.com/quotes/'+symbol,{signal:AbortSignal.timeout(6500)});
 if(!r.ok)throw Error('Alternate index unavailable');return normalizeCNBCIndicator(def,await r.text(),now);
}
export function indicatorChartLag(item){
 if(!US_SYMBOLS[item.id]||item.marketStatus!=='OPEN')return false;
 const quote=item.quoteAt&&Number.isFinite(Date.parse(item.quoteAt))?localStamp(new Date(item.quoteAt)):null,last=item.points?.at(-1)?.at;
 if(!quote||quote.slice(8,12)<'0933'||quote.slice(8,12)>'1600')return false;
 if(!last||last.slice(0,8)!==quote.slice(0,8))return true;
 const minutes=s=>Number(s.slice(8,10))*60+Number(s.slice(10,12));return minutes(quote)-minutes(last)>3;
}
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
  points=[...new Map(chart.priceInfos.filter(p=>/^\d{14}$/.test(p.localDateTime||'')&&p.localDateTime<=end&&num(p.currentPrice)>0&&(!chart.openTime||p.localDateTime>=chart.openTime)&&(def.category==='domestic'?p.localDateTime.slice(0,8)===chart.tradeBaseAt:!chart.closeTime||p.localDateTime<=chart.closeTime)).map(p=>[p.localDateTime,{at:p.localDateTime,price:num(p.currentPrice)}])).values()].sort((a,b)=>a.at.localeCompare(b.at));
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
 await Promise.all(Array.from({length:4},async()=>{while(cursor<LIVE_INDICATORS.length){const i=cursor++,def=LIVE_INDICATORS[i],urls=liveURLs(def);const [q,c]=await Promise.allSettled([get(urls.quote),get(urls.chart)]);try{if(q.status!=='fulfilled')throw Error();items[i]=normalizeLiveIndicator(def,q.value,c.status==='fulfilled'?c.value:null,now);}catch{items[i]={id:def.id,code:def.code,status:'unavailable'};}
  if(US_SYMBOLS[def.id]&&(items[i].status!=='ok'||indicatorChartLag(items[i]))){
   if(indicatorChartLag(items[i])||items[i].status!=='ok'){
    try{
     let alternate;
     alternate=await collectAlternateIndicator(def,fetcher,now);
     if(alternate.chartSampled)alternate.points=[...(items[i].points||[]).filter(p=>p.at.slice(0,8)===alternate.chartDate&&p.at<alternate.points[0].at),...alternate.points];
     const oldLast=items[i].points?.at(-1)?.at||'';
     if(alternate.points.at(-1)?.at>oldLast||items[i].status!=='ok')items[i]=alternate;
    }catch{/* An unavailable alternate must not erase the last actual observation. */}
   }
   if(indicatorChartLag(items[i])){const last=items[i].points?.at(-1);items[i]={...items[i],status:'stale',chartDelayed:true,quoteAt:last?easternTime(last.at):null,changePercent:last?items[i].changePercent:null,delayMinutes:null,delayLabel:'분봉 갱신 지연'};}
  }
 }}));
 return{schemaVersion:1,collectedAt:now.toISOString(),items};
}
export function retainLiveItems(next,previous){
 return{...next,items:next.items.map(n=>{const p=previous?.items?.find(p=>p.id===n.id&&p.code===n.code&&['ok','stale'].includes(p.status));if(p&&(n.status!=='ok'||Date.parse(n.quoteAt)<Date.parse(p.quoteAt)))return {...p,status:'stale'};
  if(n.chartSampled&&p?.chartSampled&&n.chartDate===p.chartDate)n={...n,points:[...new Map([...(p.points||[]),...(n.points||[])].map(p=>[p.at,p])).values()].sort((a,b)=>a.at.localeCompare(b.at))};return n;})};
}
