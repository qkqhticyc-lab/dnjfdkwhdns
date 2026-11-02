const numeric=v=>v!=null&&String(v).trim()!==''&&/^[+-]?[\d,]+(?:\.\d+)?$/.test(String(v))&&Number.isFinite(Number(String(v).replaceAll(',','')))?Number(String(v).replaceAll(',','')):null;
// Official quote comparisons can differ from historical adjusted daily closes.
export function normalizeChartQuote(raw,{market,symbol,providerSymbol,currency},now=new Date()){
 const nation={KR:'KOR',US:'USA',HK:'HKG',JP:'JPN'}[market];
 if(!nation||raw?.reutersCode!==providerSymbol||(market==='KR'?raw.itemCode:raw.symbolCode)!==symbol||raw.stockExchangeType?.nationCode!==nation)throw Error('Quote identity mismatch');
 const price=numeric(raw.closePrice),asOf=raw.localTradedAt;
 if(!(price>0)||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(asOf||'')||!Number.isFinite(Date.parse(asOf))||Date.parse(asOf)>now.getTime()+120000)throw Error('Invalid quote');
 let changePercent=numeric(raw.fluctuationsRatio);const direction=raw.compareToPreviousPrice?.code;
 if(changePercent!=null){if(['1','2'].includes(direction))changePercent=Math.abs(changePercent);if(['4','5'].includes(direction))changePercent=-Math.abs(changePercent);if(direction==='3'&&changePercent!==0)changePercent=null;}
 if(changePercent===0)changePercent=0;
 const delay=numeric(raw.delayTime??raw.stockExchangeType.delayTime);
 return{status:'ok',market,symbol,currency,price,changePercent,asOf,delayMinutes:delay!=null&&delay>=0?delay:null,collectedAt:now.toISOString()};
}
export function chartPriceSummary(data){
 const quote=data?.quote;
 if(['ok','stale'].includes(quote?.status)&&quote.market===data.market&&quote.symbol===data.symbol&&quote.currency===data.currency&&Number.isFinite(quote.price)&&quote.price>0){
  const percent=Number.isFinite(quote.changePercent)?quote.changePercent:null;
  return{price:quote.price,percent,direction:percent==null?'unknown':percent>0?'up':percent<0?'down':'flat',priceDate:quote.asOf,source:'quote',stale:quote.status==='stale'};
 }
 const last=data?.bars?.at(-1);
 if(!Number.isFinite(last?.close)||last.close<=0)return null;
 return{price:last.close,percent:null,direction:'unknown',priceDate:last.date,source:'daily',stale:false};
}
