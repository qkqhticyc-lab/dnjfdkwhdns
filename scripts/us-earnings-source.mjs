import {US_EARNINGS_STOCKS, parseUsEps, parseUsFinancials, buildUsEarnings} from '../us-earnings-core.mjs';

export async function collectUsEarnings({previous,charts,cache,request,now}) {
 const attemptedAt=new Date(now).toISOString();
 const known=new Map((previous?.items||[]).filter(item=>item.market==='US').map(item=>[item.symbol,item]));
 const sourceTime=previous?.markets?.US?.collectedAt||previous?.collectedAt||null;
 const items=[];
 let failed=0, financialFailed=0;
 for (let start=0; start<US_EARNINGS_STOCKS.length; start+=3) {
  const results=await Promise.allSettled(US_EARNINGS_STOCKS.slice(start,start+3).map(async stock=>{
   const epsRows=parseUsEps(await request('https://api.nasdaq.com/api/company/'+stock.symbol+'/earnings-surprise'),stock.symbol,now);
   const old=known.get(stock.symbol);
   if (old && epsRows[0].period<old.period) throw Error('US earnings source moved backward');
   const chart=charts.find(row=>row.market==='US'&&row.symbol===stock.symbol);
   const provider=chart?.providerSymbol;
   let saved=cache[stock.symbol]?.provider===provider?cache[stock.symbol]:null;
   const cachedMatch=saved?.provider===provider && saved.financial?.rows?.some(row=>row.period===epsRows[0].period) && now-Date.parse(saved.info?.fetchedAt)<6*3600000;
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
   if(saved)saved.info.financialSourceUrl='https://m.stock.naver.com/worldstock/stock/'+encodeURIComponent(provider)+'/finance';
   const item=buildUsEarnings(stock,epsRows,saved?.financial,saved?.info,now);
   
   const sourceFresh=saved && now-Date.parse(saved.info?.fetchedAt)<24*3600000;
   item.financialStale=!!saved&&!sourceFresh;
   if(item.financialStatus!=='ok'||item.financialStale)financialFailed++;
   item.chart=chart?{market:chart.market,status:chart.status,symbol:chart.symbol,asOf:chart.asOf,price:chart.price,rankInputs:chart.rankInputs,liquidity:chart.liquidity,volumeRatio:chart.volumeRatio,trend:chart.trend,signal:chart.signal}:null;
   return item;
  }));
  for (const [index,result] of results.entries()) {
   if (result.status==='fulfilled') items.push(result.value);
   else {
    failed++;
    const symbol=US_EARNINGS_STOCKS[start+index].symbol,old=known.get(symbol);
    if (old) items.push({...old,stale:true,chart:null});
   }
  }
 }
 const collected=US_EARNINGS_STOCKS.length-failed;
 return {status:failed===US_EARNINGS_STOCKS.length?(items.length?'stale':'unavailable'):failed||financialFailed?'partial':'ok',attemptedAt,collectedAt:collected?attemptedAt:sourceTime,scope:'us-representative',coverage:{provided:US_EARNINGS_STOCKS.length,collected,failed,financialFailed},items};
}
