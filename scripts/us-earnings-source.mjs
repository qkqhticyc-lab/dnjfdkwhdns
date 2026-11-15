import {selectUsEarningsStocks, parseUsEps, parseUsFinancials, buildUsEarnings, parseUsUpcoming} from '../us-earnings-core.mjs';
import {newsDay} from '../stock-news-core.mjs';

export async function collectUsEarnings({previous,charts,cache,request,now}) {
 const attemptedAt=new Date(now).toISOString();
 const known=new Map((previous?.items||[]).filter(item=>item.market==='US').map(item=>[item.symbol,item]));
 const sourceTime=previous?.markets?.US?.collectedAt||previous?.collectedAt||null;
 const items=[];
 const stocks=selectUsEarningsStocks(charts,previous?.items||[]),started=Date.now();
 let failed=0, financialFailed=0, upcomingFailed=0, cached=0;
 let blocked=now<Number(cache._nasdaqRetryAfter||0);
 async function sourceRequest(url) {
  if(!url.startsWith('https://api.nasdaq.com/'))return request(url);
  if(blocked)throw Error('Nasdaq retry interval');
  try{return await request(url);}catch(error){
   if(/HTTP (403|429)\b/.test(error.message)){blocked=true;cache._nasdaqRetryAfter=now+3600000;}
   throw error;
  }
 }
 for (let start=0; start<stocks.length; start+=6) {
  if(Date.now()-started>240000){
   for(const stock of stocks.slice(start)){failed++;const old=known.get(stock.symbol);if(old)items.push({...old,stale:true,chart:null});}
   break;
  }
  const results=await Promise.allSettled(stocks.slice(start,start+6).map(async stock=>{
   const old=known.get(stock.symbol);
   const today=newsDay(now,'US'),release=old?.upcoming?.announcedOn;
   const releaseDue=release&&release<=today&&Date.parse(today)-Date.parse(release)<=3*86400000;
   const reportAge=now-Date.parse(old?.earningsFetchedAt);
   const cachedItem=old&&reportAge>=0&&reportAge<(releaseDue?15*60000:6*3600000)?old:null;
   const epsRows=cachedItem?[{period:old.period,announcedOn:old.announcedOn,metrics:{eps:old.metrics.eps}}]:parseUsEps(await sourceRequest('https://api.nasdaq.com/api/company/'+stock.symbol+'/earnings-surprise'),stock.symbol,now);
   if(cachedItem)cached++;
   if (old && epsRows[0].period<old.period) throw Error('US earnings source moved backward');
   const chart=charts.find(row=>row.market==='US'&&row.symbol===stock.symbol);
   const provider=chart?.providerSymbol;
   let saved=cache[stock.symbol]?.provider===provider?cache[stock.symbol]:null;
   const priorNext=saved?.next||(old?.upcoming?{version:1,latestPeriod:old.period,fetchedAt:old.upcoming.fetchedAt,upcoming:old.upcoming,status:old.upcoming.status==='ok'?'ok':'partial'}:null);
   const nextFresh=priorNext?.version===1&&priorNext.upcoming&&priorNext.upcoming.status!=='stale'&&now-Date.parse(priorNext.fetchedAt)<6*3600000&&priorNext.latestPeriod===epsRows[0].period&&(!priorNext.upcoming.announcedOn||priorNext.upcoming.announcedOn>newsDay(now+86400000,'US'));
   const nextPromise=nextFresh?Promise.resolve(priorNext):Promise.allSettled([
    sourceRequest('https://api.nasdaq.com/api/analyst/'+stock.symbol+'/earnings-date'),
    sourceRequest('https://api.nasdaq.com/api/analyst/'+stock.symbol+'/earnings-forecast')
   ]).then(results=>{
    const date=results[0].status==='fulfilled'?results[0].value:null,forecast=results[1].status==='fulfilled'?results[1].value:null;
    let upcoming=null;
    try{upcoming=parseUsUpcoming(date,forecast,stock.symbol,epsRows[0].period,now);}catch{}
    const complete=upcoming?.status==='ok';
    if(!upcoming&&priorNext?.upcoming?.period>epsRows[0].period)upcoming={...priorNext.upcoming,status:'stale'};
    return {version:1,latestPeriod:epsRows[0].period,fetchedAt:new Date(now).toISOString(),upcoming,status:complete?'ok':'partial'};
   });
   const companyAge=now-Date.parse(cachedItem?.companyFetchedAt);
   const cachedMatch=(!!saved && saved.provider===provider && saved.financial?.rows?.some(row=>row.period===epsRows[0].period) && now-Date.parse(saved.info?.fetchedAt)<6*3600000)||(companyAge>=0&&companyAge<6*3600000);
   if (!cachedMatch && /^[A-Z0-9.-]{1,24}$/.test(provider||'')) {
    const supplemental=await Promise.allSettled([
     request('https://api.stock.naver.com/stock/'+encodeURIComponent(provider)+'/basic'),
     request('https://api.stock.naver.com/stock/'+encodeURIComponent(provider)+'/finance/quarter')
    ]);
    const basic=supplemental[0], finance=supplemental[1];
    if (basic.status==='fulfilled' && basic.value.reutersCode===provider && basic.value.symbolCode===stock.symbol && basic.value.currencyType?.code==='USD' && finance.status==='fulfilled') {
     try {
      saved={provider,financial:parseUsFinancials(finance.value),info:{name:basic.value.stockName,marketCap:basic.value.stockItemTotalInfos?.find(row=>row.code==='marketValue')?.value||null,fetchedAt:attemptedAt,financialSourceUrl:'https://m.stock.naver.com/worldstock/stock/'+encodeURIComponent(provider)+'/finance'}};
      cache[stock.symbol]=saved;
     } catch {}
    }
   }
   const next=await nextPromise;
   if(next.status!=='ok')upcomingFailed++;
   if(saved?.info)saved.info.financialSourceUrl='https://m.stock.naver.com/worldstock/stock/'+encodeURIComponent(provider)+'/finance';
   const item=cachedItem?{...cachedItem,stale:false}:buildUsEarnings(stock,epsRows,saved?.financial,saved?.info,now);
   item.upcoming=next.upcoming;
   item.upcomingSourceStatus=next.status;
   cache[stock.symbol]={...saved,provider,next};
   
   const financialTime=saved?.info?.fetchedAt||cachedItem?.companyFetchedAt;
   item.financialStale=!!financialTime&&now-Date.parse(financialTime)>=24*3600000;
   if(item.financialStatus!=='ok'||item.financialStale)financialFailed++;
   item.chart=chart?{market:chart.market,status:chart.status,symbol:chart.symbol,asOf:chart.asOf,price:chart.price,rankInputs:chart.rankInputs,liquidity:chart.liquidity,volumeRatio:chart.volumeRatio,trend:chart.trend,signal:chart.signal}:null;
   return item;
  }));
  for (const [index,result] of results.entries()) {
   if (result.status==='fulfilled') items.push(result.value);
   else {
    failed++;
    const symbol=stocks[start+index].symbol,old=known.get(symbol);
    if(failed<=10)console.log('US earnings '+symbol+': '+String(result.reason?.message||'Source unavailable'));
    if (old) items.push({...old,stale:true,chart:null});
   }
  }
 }
 const collected=stocks.length-failed;
 return {status:failed===stocks.length?(items.length?'stale':'unavailable'):failed||financialFailed||upcomingFailed?'partial':'ok',attemptedAt,collectedAt:collected?attemptedAt:sourceTime,scope:'us-liquid-200',coverage:{provided:stocks.length,collected,failed,cached,financialFailed,upcoming:items.filter(item=>item.upcoming).length,upcomingFailed},items};
}
