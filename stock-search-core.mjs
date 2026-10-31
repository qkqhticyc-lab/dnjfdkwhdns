export const marketLabels={KR:'한국',US:'미국',HK:'홍콩',JP:'일본'};
export const defaultCurrencies={KR:'KRW',US:'USD',HK:'HKD',JP:'JPY'};
export function normalizeStock(item){
 const market={KOR:'KR',USA:'US',HKG:'HK',JPN:'JP'}[item?.nationCode];
 if(item?.category!=='stock'||!market||typeof item.code!=='string'||!/^[A-Z0-9.\-]{1,20}$/.test(item.code)||typeof item.name!=='string'||!item.name.trim())return null;
 // The provider explicitly marks non-HKD Hong Kong currency counters in their name.
 const currency=market==='HK'&&/\(CNY\)/.test(item.name)?'CNY':market==='HK'&&/\(USD\)/.test(item.name)?'USD':defaultCurrencies[market];
 return {name:item.name.trim().slice(0,80),symbol:item.code,market,exchange:String(item.typeName||item.typeCode||'').slice(0,60),currency};
}
export async function searchStocks(query,market,fetcher=fetch){
 const q=String(query||'').trim();if(!q||q.length>80)return [];
 const url='https://stock.naver.com/api/autocomplete/search/autoComplete?'+new URLSearchParams({query:q,target:'stock'});
 const r=await fetcher(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Stock search unavailable');
 const d=await r.json();if(!Array.isArray(d.result?.items))throw Error('Invalid stock search response');
 const seen=new Set();return d.result.items.map(normalizeStock).filter(item=>{if(!item)return false;const key=item.market+':'+item.symbol;if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>(a.market===market?0:1)-(b.market===market?0:1)).slice(0,12);
}
export function formatTradePrice(price,currency){
 const n=Number(price);if(price==null||!Number.isFinite(n)||n<=0)return '가격 미입력';
 return new Intl.NumberFormat('ko-KR',{maximumFractionDigits:8}).format(n)+(currency==='KRW'?'원':' '+currency);
}
