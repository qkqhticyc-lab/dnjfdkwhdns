import {earningsNumber} from './earnings-core.mjs';
import {validNewsDate, newsDay} from './stock-news-core.mjs';

// Representative US-listed companies across technology, finance and consumer sectors.
export const US_EARNINGS_STOCKS = [
 ['AAPL','애플'],['MSFT','마이크로소프트'],['GOOGL','알파벳'],['AMZN','아마존'],['META','메타'],['NVDA','엔비디아'],['TSLA','테슬라'],
 ['AMD','AMD'],['AVGO','브로드컴'],['MU','마이크론'],['INTC','인텔'],['TSM','TSMC'],['ASML','ASML'],['ARM','ARM'],['QCOM','퀄컴'],['AMAT','어플라이드 머티어리얼즈'],['LRCX','램리서치'],
 ['ORCL','오라클'],['PLTR','팔란티어'],['NFLX','넷플릭스'],['CRM','세일즈포스'],['ADBE','어도비'],
 ['JPM','JP모건'],['V','비자'],['MA','마스터카드'],['WMT','월마트'],['COST','코스트코'],['XOM','엑슨모빌'],['LLY','일라이릴리'],['UNH','유나이티드헬스']
].map(([symbol,name])=>({symbol,name}));

export function usEarningsNumber(value) {
 if (typeof value==='number') return earningsNumber(value);
 const text=String(value??'').trim().replace(/^\$/, '').replaceAll(',','');
 const normalized=/^\([\d.]+\)$/.test(text)?'-'+text.slice(1,-1):text;
 if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
 return earningsNumber(Number(normalized));
}

export function parseUsEps(data, symbol, now=Date.now()) {
 if (String(data?.data?.symbol).toUpperCase()!==symbol || data.status?.rCode!==200 || !Array.isArray(data.data.earningsSurpriseTable?.rows)) throw Error('US earnings identity mismatch');
 const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 const rows=[];
 for (const raw of data.data.earningsSurpriseTable.rows) {
  const fiscal=/^([A-Za-z]{3}) (20\d{2})$/.exec(raw.fiscalQtrEnd||'');
  const date=/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/.exec(raw.dateReported||'');
  const month=fiscal?months.indexOf(fiscal[1])+1:0;
  if (!month || !date) continue;
  const period=fiscal[2]+'-'+String(month).padStart(2,'0');
  const announcedOn=date[3]+'-'+date[1].padStart(2,'0')+'-'+date[2].padStart(2,'0');
  const actual=usEarningsNumber(raw.eps), forecast=usEarningsNumber(raw.consensusForecast);
  if (!validNewsDate(announcedOn) || announcedOn>newsDay(now,'US') || period>announcedOn.slice(0,7) || actual===null) continue;
  if (rows.some(row=>row.period===period)) throw Error('Duplicate US earnings quarter');
  rows.push({period,announcedOn,metrics:{eps:{actual,forecast}}});
 }
 rows.sort((a,b)=>b.announcedOn.localeCompare(a.announcedOn));
 if (!rows.length) throw Error('Reported US EPS unavailable');
 return rows.slice(0,4);
}

export function parseUsFinancials(data) {
 const currency=/^(USD|EUR|TWD|JPY|GBP|CAD|CHF)\(백만\)/.exec(data?.unit||'')?.[1];
 if (!currency || data.isKrw!==false || !Array.isArray(data.trTitleList) || !Array.isArray(data.rowList)) throw Error('US financial currency or schema mismatch');
 const accounts={revenue:'매출액',operating:'EBIT',net:'당기순이익'};
 const groups=new Map();
 for (const column of data.trTitleList) {
  const date=String(column.key).replaceAll('.','-');
  if (column.isConsensus!=='N' || !validNewsDate(date)) continue;
  const period=date.slice(0,7);
  if (!groups.has(period)) groups.set(period,[]);
  groups.get(period).push({period,periodEnd:date,metrics:Object.fromEntries(Object.entries(accounts).map(([key,title])=>[key,{actual:usEarningsNumber(data.rowList.find(row=>row.title===title)?.columns?.[column.key]?.value),forecast:null}]))});
 }
 // Matching uses a unique fiscal closing month, with the source's exact date retained.
 return {currency,rows:[...groups.values()].filter(rows=>rows.length===1).flat()};
}

export function buildUsEarnings(stock, epsRows, financial, info, now=Date.now()) {
 const latest=epsRows[0], byPeriod=new Map((financial?.rows||[]).map(row=>[row.period,row]));
 const match=byPeriod.get(latest.period);
 const verified=match && match.periodEnd<=latest.announcedOn;
 const metrics={...latest.metrics};
 if (verified) Object.assign(metrics,match.metrics);
 const prior=byPeriod.get((Number(latest.period.slice(0,4))-1)+latest.period.slice(4));
 const revenue=metrics.revenue?.actual, previous=prior?.metrics.revenue?.actual;
 const revenueGrowthYoY=Number.isFinite(revenue)&&Number.isFinite(previous)&&previous>0?(revenue/previous-1)*100:null;
 return {
  market:'US',symbol:stock.symbol,name:info?.name||stock.name,id:'US:'+stock.symbol+':'+latest.period,
  period:latest.period,periodEnd:verified?match.periodEnd:null,announcedOn:latest.announcedOn,basis:'reported',currency:'USD',financialCurrency:financial?.currency||null,
  metrics,revenueGrowthYoY,marketCap:info?.marketCap||null,companyFetchedAt:info?.fetchedAt||null,earningsFetchedAt:new Date(now).toISOString(),
  financialStatus:verified&&['revenue','operating','net'].every(key=>Number.isFinite(metrics[key]?.actual))?'ok':'unavailable',reportTitle:'분기 실적 · Nasdaq EPS 비교 기준',
  sourceUrl:'https://www.nasdaq.com/market-activity/stocks/'+stock.symbol.toLowerCase()+'/earnings',financialSourceUrl:info?.financialSourceUrl||null,
  history:epsRows.map(row=>{
   const point=byPeriod.get(row.period);
   const matched=point && point.periodEnd<=row.announcedOn;
   return {period:row.period,periodEnd:matched?point.periodEnd:null,basis:'reported',source:'Nasdaq EPS · Npay 재무실적',metrics:{...row.metrics,...(matched?point.metrics:{})}};
  })
 };
}
