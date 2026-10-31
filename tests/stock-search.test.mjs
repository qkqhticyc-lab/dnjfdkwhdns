import assert from 'node:assert/strict';import test from 'node:test';
import {normalizeStock,searchStocks,formatTradePrice} from '../stock-search-core.mjs';
const stock=(nationCode,code,name,typeCode='TEST')=>({nationCode,code,name,typeCode,category:'stock'});
test('stock codes preserve Korean and Hong Kong leading zeros and Japanese alphanumeric symbols',()=>{
 assert.equal(normalizeStock(stock('KOR','005930','삼성전자')).symbol,'005930');
 assert.equal(normalizeStock(stock('USA','BRK.B','버크셔')).symbol,'BRK.B');
 assert.deepEqual([normalizeStock(stock('HKG','00700','텐센트')).market,normalizeStock(stock('HKG','00700','텐센트')).currency],['HK','HKD']);
 assert.equal(normalizeStock(stock('JPN','164A','애플파크')).currency,'JPY');
 assert.equal(normalizeStock(stock('HKG','80700','텐센트 (CNY)')).currency,'CNY');
 assert.equal(normalizeStock({...stock('USA','BTC','코인'),category:'coin'}),null);
 assert.equal(normalizeStock(stock('CHN','600000','중국 A주')),null);
});
test('search prioritizes selected market while keeping foreign listings distinguishable',async()=>{
 const data={result:{items:[stock('USA','TM','토요타 ADR','NYSE'),stock('JPN','7203','토요타','TOKYO'),stock('JPN','7203','토요타','TOKYO')]}};
 const result=await searchStocks('토요타','JP',async url=>{assert.ok(url.includes('target=stock'));return{ok:true,json:async()=>data};});
 assert.deepEqual(result.map(r=>r.symbol),['7203','TM']);
 assert.equal(result[0].exchange,'TOKYO');assert.equal(result[1].currency,'USD');
});
test('price formatting preserves fractional prices and does not invent a price for legacy posts',()=>{
 assert.equal(formatTradePrice(null,null),'가격 미입력');assert.equal(formatTradePrice('0.12345678','USD'),'0.12345678 USD');assert.equal(formatTradePrice(70000,'KRW'),'70,000원');
});
