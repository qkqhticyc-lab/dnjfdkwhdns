const positive=n=>n!=null&&Number.isFinite(Number(n))&&Number(n)>0;
export function journalReturn(post,quote){
 if(post.side==='sell')return positive(post.entry_price)&&positive(post.trade_price)&&post.price_currency?{value:(Number(post.trade_price)/Number(post.entry_price)-1)*100,label:'매수 → 매도 수익률'}:{value:null,label:'매수가 미입력'};
 if(!positive(post.trade_price)||!post.price_currency)return{value:null,label:'매수가 미입력'};
 if(!quote||!['ok','stale'].includes(quote.status)||!positive(quote.price)||quote.currency!==post.price_currency||quote.market!==post.market||quote.symbol!==post.symbol)return{value:null,label:'시세 확인 후 계산'};
 return{value:(quote.price/Number(post.trade_price)-1)*100,label:quote.status==='stale'?'이전 시세 기준 수익률':'매수가 대비 수익률'};
}
export const quoteKey=p=>[p.market,p.symbol,p.price_currency||p.currency||''].join(':');
