import test from'node:test';import assert from'node:assert/strict';import{mergeWatchlist,parseWatchlist,reorderWatchlist,watchKey}from'../watchlist-core.mjs';
const item={market:'KR',symbol:'005930',name:'삼성전자',exchange:'코스피',currency:'KRW'};
test('watchlist round-trip keeps identity, merges duplicates, strips extra fields',()=>{const a=mergeWatchlist([],[{...item,token:'never-export'}]);assert.equal(a[0].token,undefined);assert.deepEqual(parseWatchlist(JSON.stringify({schemaVersion:1,items:a})),[item]);assert.equal(mergeWatchlist(a,[item]).length,1);});
test('malformed import or unsupported symbol cannot replace an existing list',()=>{const a=[item];assert.throws(()=>parseWatchlist('{'));assert.throws(()=>parseWatchlist('{"items":[]}'));assert.throws(()=>mergeWatchlist(a,[{...item,symbol:'<script>'}]));assert.deepEqual(a,[item]);});
test('100-item limit is enforced before merge',()=>{assert.throws(()=>mergeWatchlist([],Array.from({length:101},(_,i)=>({...item,symbol:String(i).padStart(6,'0')}))));});
test('reordering moves both directions, preserves identity and round-trips in the chosen order',()=>{
 const values=[item,{market:'US',symbol:'AMD',name:'AMD'},{market:'JP',symbol:'7203',name:'Toyota'}],keys=values.map(watchKey);
 const last=reorderWatchlist(values,keys[0]);assert.deepEqual(last.map(watchKey),[keys[1],keys[2],keys[0]]);assert.equal(last[2],item);assert.deepEqual(values.map(watchKey),keys);
 const first=reorderWatchlist(last,keys[0],keys[1]);assert.deepEqual(first,values);
 const middle=reorderWatchlist(values,keys[2],keys[1]);assert.deepEqual(middle.map(watchKey),[keys[0],keys[2],keys[1]]);
 assert.deepEqual(parseWatchlist(JSON.stringify({schemaVersion:1,items:middle})).map(watchKey),middle.map(watchKey));
});
test('invalid or unchanged reorder requests preserve the original list',()=>{
 const values=[item,{market:'US',symbol:'AMD',name:'AMD'}];
 for(const[key,before]of[['missing',null],['KR:005930','missing'],['KR:005930','KR:005930'],['KR:005930','US:AMD'],['US:AMD',null]])assert.equal(reorderWatchlist(values,key,before),values);
 assert.deepEqual(reorderWatchlist([],'missing'),[]);
});
