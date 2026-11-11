export const WATCH_KEY='investment-chart-watchlist-v1';
export function watchItem(value){
 if(!value||!['KR','US','HK','JP'].includes(value.market))throw Error('지원하지 않는 시장입니다.');
 const {market}=value,symbol=String(value.symbol||'').trim().toUpperCase();
 if(!(market==='KR'?/^\d{6}$/:market==='HK'?/^\d{4,5}$/:market==='JP'?/^\d{4}$/:/^[A-Z0-9][A-Z0-9.^=-]{0,19}$/).test(symbol))throw Error('종목코드를 확인해 주세요.');
 const name=String(value.name||symbol).trim(),exchange=String(value.exchange||'').trim(),currency={KR:'KRW',US:'USD',HK:'HKD',JP:'JPY'}[market];
 if(!name||name.length>120||exchange.length>80)throw Error('종목 이름이 너무 깁니다.');
 return {market,symbol,name,exchange,currency};
}
export const watchKey=item=>item.market+':'+item.symbol;
export function mergeWatchlist(current,incoming){
 if(!Array.isArray(incoming)||incoming.length>100)throw Error('관심종목은 최대 100개입니다.');
 const map=new Map(current.map(v=>{const i=watchItem(v);return[watchKey(i),i];}));
 for(const v of incoming){const i=watchItem(v);map.set(watchKey(i),i);}
 if(map.size>100)throw Error('관심종목은 최대 100개입니다.');return [...map.values()];
}
export function parseWatchlist(text){const v=JSON.parse(text);if(v.schemaVersion!==1||!Array.isArray(v.items))throw Error('관심종목 내보내기 파일을 선택해 주세요.');return mergeWatchlist([],v.items);}
