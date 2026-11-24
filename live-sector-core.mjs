import {SECTORS,foreignSector,koreanSector} from './sector-core.mjs';
export const SECTOR_ETFS={technology:'XLK',consumer:'XLY',healthcare:'XLV',communication:'XLC',financials:'XLF',industrials:'XLI',staples:'XLP',energy:'XLE',utilities:'XLU',materials:'XLB',realestate:'XLRE'};
const etfProvider=symbol=>symbol==='XLRE'?'XLRE.K':symbol;
export const sectorNumber=v=>v!=null&&String(v).trim()!==''&&Number.isFinite(Number(String(v).replaceAll(',','')))?Number(String(v).replaceAll(',','')):null;
const day=(at,zone)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
const num=sectorNumber;
async function get(fetcher,url){const r=await fetcher(url,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Sector source HTTP '+r.status);return r.json();}
async function pool(tasks,limit=6){const out=Array(tasks.length);let cursor=0;await Promise.all(Array.from({length:Math.min(limit,tasks.length)},async()=>{while(cursor<tasks.length){const i=cursor++;try{out[i]={ok:true,value:await tasks[i]()};}catch{out[i]={ok:false};}}}));return out;}
export function sectorETFQuote(id,symbol,q,now=new Date()){
 const price=num(q.closePriceRaw??q.closePrice),changePercent=num(q.fluctuationsRatioRaw??q.fluctuationsRatio),turnover=num(q.accumulatedTradingValueRaw),at=Date.parse(q.localTradedAt);
 if(q.reutersCode!==etfProvider(symbol)||q.stockEndType!=='etf'||q.currencyType?.code!=='USD'||!(price>0)||changePercent==null||!Number.isFinite(at)||at>now.getTime()+120000)throw Error('Invalid sector ETF quote');
 return {id,name:SECTORS[id]||symbol,symbol,status:'ok',price,changePercent,turnover:turnover>=0?turnover:null,quoteAt:new Date(at).toISOString(),sessionDate:day(at,'America/New_York'),marketStatus:q.marketStatus||'UNKNOWN',delayMinutes:num(q.delayTime),currency:'USD'};
}
export async function collectSectorSummary(market,fetcher=fetch,now=new Date()){
 if(!['US','KR'].includes(market))throw Error('Invalid sector market');
 if(market==='US'){
  const definitions=[...Object.entries(SECTOR_ETFS),['benchmark','SPY']],results=await pool(definitions.map(([id,symbol])=>async()=>sectorETFQuote(id,symbol,await get(fetcher,'https://api.stock.naver.com/stock/'+etfProvider(symbol)+'/basic'),now)),4);
  const benchmark=results.at(-1).ok?results.at(-1).value:null,quotes=results.slice(0,-1).map((r,i)=>r.ok?r.value:{id:definitions[i][0],name:SECTORS[definitions[i][0]],symbol:definitions[i][1],status:'unavailable'});
  const sessionDate=benchmark?.sessionDate||quotes.filter(q=>q.status==='ok').map(q=>q.sessionDate).sort().at(-1)||null;
  for(const q of quotes)if(q.status==='ok'&&q.sessionDate!==sessionDate)q.status='stale';
  if(!quotes.some(q=>q.status==='ok'))throw Error('Sector quotes unavailable');
  return {schemaVersion:1,market,collectedAt:now.toISOString(),sessionDate,marketStatus:benchmark?.marketStatus||quotes.find(q=>q.status==='ok')?.marketStatus||'UNKNOWN',basis:'sector-etf',sizeBasis:'turnover',benchmark,sectors:quotes};
 }
 const [groups,quote]=await Promise.allSettled([get(fetcher,'https://m.stock.naver.com/api/stocks/industry?page=1&pageSize=100'),get(fetcher,'https://m.stock.naver.com/api/index/KOSPI/basic')]);
 if(groups.status!=='fulfilled'||!Array.isArray(groups.value.groups)||groups.value.totalCount>groups.value.groups.length)throw Error('Industry summary unavailable');
 const sectors=new Map();
 for(const g of groups.value.groups){const id=koreanSector(g.no,g.name).id,change=num(g.changeRate),count=num(g.totalCount);if(!Number.isInteger(g.no)||g.no<1||g.no>10000||change==null||!(count>0)||id==='unknown')continue;const row=sectors.get(id)||{id,name:SECTORS[id],status:'ok',count:0,weighted:0,groups:[]};row.count+=count;row.weighted+=change*count;row.groups.push({no:g.no,name:g.name});sectors.set(id,row);}
 const q=quote.status==='fulfilled'?quote.value:null,at=Date.parse(q?.localTradedAt);
 if(!sectors.size)throw Error('No classified industry groups');
 return {schemaVersion:1,market,collectedAt:now.toISOString(),sessionDate:Number.isFinite(at)?day(at,'Asia/Seoul'):null,marketStatus:q?.marketStatus||'UNKNOWN',basis:'industry-count-weighted',sizeBasis:'count',benchmark:q?.reutersCode==='KOSPI'&&num(q.fluctuationsRatio)!=null?{symbol:'KOSPI',changePercent:num(q.fluctuationsRatio),quoteAt:q.localTradedAt}:null,sectors:[...sectors.values()].map(({weighted,...s})=>({...s,changePercent:weighted/s.count}))};
}
export function normalizeSectorStock(q,market,sector,now=new Date()){
 const symbol=market==='KR'?q.itemCode:q.symbolCode,providerSymbol=q.reutersCode,price=num(q.closePriceRaw??q.closePrice),changePercent=num(q.fluctuationsRatioRaw??q.fluctuationsRatio),turnover=num(q.accumulatedTradingValueRaw),at=Date.parse(q.localTradedAt);
 if(q.stockEndType!=='stock'||q.isEtf===true||typeof symbol!=='string'||!/^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(symbol)||typeof providerSymbol!=='string'||!(price>0)||changePercent==null||!Number.isFinite(at)||at>now.getTime()+120000||sector.id==='unknown')return null;
 return {market,symbol,providerSymbol,name:q.stockName||symbol,sector:sector.id,industry:sector.industry,currency:market==='KR'?'KRW':'USD',exchange:q.stockExchangeType?.name||'',price,changePercent,turnover:turnover>=0?turnover:null,quoteAt:new Date(at).toISOString(),sessionDate:day(at,market==='KR'?'Asia/Seoul':'America/New_York'),marketStatus:q.marketStatus||'UNKNOWN',delayMinutes:num(q.delayTime??q.stockExchangeType?.delayTime)};
}
async function listStocks(base,fetcher,accept){
 const first=await get(fetcher,base+'?page=1&pageSize=100');
 if(!Array.isArray(first.stocks)||!Number.isInteger(first.totalCount)||first.totalCount<0||first.totalCount>25000)throw Error('Invalid live stock list');
 const pages=Math.ceil(first.totalCount/100),rest=await pool(Array.from({length:Math.max(0,pages-1)},(_,i)=>async()=>{const d=await get(fetcher,base+'?page='+(i+2)+'&pageSize=100');if(!Array.isArray(d.stocks)||Number(d.page)!==i+2)throw Error('Invalid list page');return d.stocks;}),2);
 const map=new Map();for(const q of [first.stocks,...rest.filter(p=>p.ok).map(p=>p.value)].flat()){const p=accept(q);if(p)map.set(p.market+':'+p.symbol,p);}
 return {items:[...map.values()],expectedPages:Math.max(1,pages),loadedPages:1+rest.filter(p=>p.ok).length};
}
export async function collectSectorStocks(market,sector,fetcher=fetch,now=new Date(),summary){
 let results;
 if(market==='US'){
  results=await pool(['NASDAQ','NYSE','AMEX'].map(exchange=>()=>listStocks('https://api.stock.naver.com/stock/exchange/'+exchange+'/marketValue',fetcher,q=>normalizeSectorStock(q,'US',foreignSector(q.industryCodeType)))),3);
 }else if(market==='KR'){
  const s=summary||await collectSectorSummary('KR',fetcher,now),groups=s.sectors.find(p=>p.id===sector)?.groups||[];
  results=await pool(groups.map(g=>()=>listStocks('https://m.stock.naver.com/api/stocks/industry/'+g.no,fetcher,q=>normalizeSectorStock(q,'KR',koreanSector(g.no,g.name)))),3);
 }else throw Error('Invalid stock market');
 const map=new Map(),coverage=[];
 for(const r of results){if(r.ok){coverage.push({expectedPages:r.value.expectedPages,loadedPages:r.value.loadedPages});for(const p of r.value.items){const key=p.market+':'+p.symbol,old=map.get(key);if(!old||p.quoteAt>old.quoteAt)map.set(key,p);}}else coverage.push({expectedPages:null,loadedPages:0});}
 const items=[...map.values()],partial=coverage.some(p=>p.expectedPages==null||p.loadedPages<p.expectedPages);
 if(!items.length)throw Error('Live sector stocks unavailable');
 return {schemaVersion:1,market,collectedAt:now.toISOString(),items,partial,coverage};
}
export function retainSectorSummary(next,old){
 if(!old||old.market!==next.market)return next;
 return {...next,sectors:next.sectors.map(n=>{const p=old.sectors.find(p=>p.id===n.id);return p?.status==='ok'&&(n.status!=='ok'||n.quoteAt&&p.quoteAt&&n.quoteAt<p.quoteAt)?{...p,status:'stale'}:n;})};
}
export function currentSectorStocks(items,sector,sessionDate){
 const rows=items.filter(p=>p.sector===sector),current=rows.filter(p=>!sessionDate||p.sessionDate===sessionDate);
 return {items:current.map(p=>({...p,status:'ok'})),excludedOlderCount:rows.length-current.length};
}
// Deterministic balanced rectangles, each area proportional to its verified weight.
export function sectorRectangles(rows,width=1000,height=500){
 const sorted=rows.filter(p=>p.weight>0&&Number.isFinite(p.weight)).sort((a,b)=>b.weight-a.weight),out=[];
 function split(list,x,y,w,h){if(!list.length)return;if(list.length===1){out.push({...list[0],x,y,w,h});return;}const total=list.reduce((s,p)=>s+p.weight,0);let sum=0,cut=1,best=Infinity;for(let i=1;i<list.length;i++){sum+=list[i-1].weight;const distance=Math.abs(total/2-sum);if(distance<best){best=distance;cut=i;}}const first=list.slice(0,cut),ratio=first.reduce((s,p)=>s+p.weight,0)/total;if(w>=h){split(first,x,y,w*ratio,h);split(list.slice(cut),x+w*ratio,y,w*(1-ratio),h);}else{split(first,x,y,w,h*ratio);split(list.slice(cut),x,y+h*ratio,w,h*(1-ratio));}}
 split(sorted,0,0,width,height);return out;
}
