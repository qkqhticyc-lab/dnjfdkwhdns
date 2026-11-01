const markets={KR:{nation:'KOR',currency:'KRW'},US:{nation:'USA',currency:'USD'},HK:{nation:'HKG',currency:'HKD'},JP:{nation:'JPN',currency:'JPY'}};
export function validQuoteItem(item){return !!item&&!!markets[item.market]&&typeof item.symbol==='string'&&({KR:/^[0-9A-Z]{6}$/,US:/^[A-Z][A-Z0-9.-]{0,19}$/,HK:/^\d{4,5}$/,JP:/^[A-Z0-9]{4,5}$/}[item.market]).test(item.symbol)&&(!item.currency||({KR:['KRW'],US:['USD'],HK:['HKD','CNY','USD'],JP:['JPY']}[item.market]).includes(item.currency));}
export async function getJournalQuote(request,fetcher=fetch){
 if(!validQuoteItem(request))throw Error('Invalid quote request');
 const {market,symbol}=request,definition=markets[market];
 const r=await fetcher('https://stock.naver.com/api/autocomplete/search/autoComplete?'+new URLSearchParams({query:symbol,target:'stock'}),{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Identity unavailable');const result=await r.json(),item=result.result?.items?.find(p=>p.category==='stock'&&p.nationCode===definition.nation&&p.code===symbol);if(!item)throw Error('Identity mismatch');
 const currency=market==='HK'&&/\(CNY\)/.test(item.name)?'CNY':market==='HK'&&/\(USD\)/.test(item.name)?'USD':definition.currency;
 if(request.currency&&request.currency!==currency)throw Error('Currency mismatch');
 const code=market==='KR'?symbol:item.reutersCode;if(typeof code!=='string'||!/^[A-Za-z0-9.^-]{1,30}$/.test(code))throw Error('Invalid provider code');
 const response=await fetcher((market==='KR'?'https://m.stock.naver.com/api/stock/':'https://api.stock.naver.com/stock/')+encodeURIComponent(code)+'/basic',{signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('Quote unavailable');const d=await response.json();
 if(d.reutersCode!==code||(market==='KR'?d.itemCode:d.symbolCode)!==symbol||d.stockExchangeType?.nationCode!==definition.nation)throw Error('Quote identity mismatch');
 const raw=d.closePrice,price=typeof raw==='number'?raw:typeof raw==='string'&&/^[\d,]+(?:\.\d+)?$/.test(raw)?Number(raw.replaceAll(',','')):NaN;
 if(!Number.isFinite(price)||price<=0||price>=1e12||!Number.isFinite(Date.parse(d.localTradedAt)))throw Error('Invalid quote');
 return{market,symbol,currency,status:'ok',price,asOf:d.localTradedAt,delayMinutes:Number.isFinite(d.delayTime)?d.delayTime:Number.isFinite(d.stockExchangeType.delayTime)?d.stockExchangeType.delayTime:null,marketStatus:d.marketStatus||'UNKNOWN',collectedAt:new Date().toISOString()};
}
