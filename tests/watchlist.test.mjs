import test from'node:test';import assert from'node:assert/strict';import{mergeWatchlist,parseWatchlist}from'../watchlist-core.mjs';
const item={market:'KR',symbol:'005930',name:'삼성전자',exchange:'코스피',currency:'KRW'};
test('watchlist round-trip keeps identity, merges duplicates, strips extra fields',()=>{const a=mergeWatchlist([],[{...item,token:'never-export'}]);assert.equal(a[0].token,undefined);assert.deepEqual(parseWatchlist(JSON.stringify({schemaVersion:1,items:a})),[item]);assert.equal(mergeWatchlist(a,[item]).length,1);});
test('malformed import or unsupported symbol cannot replace an existing list',()=>{const a=[item];assert.throws(()=>parseWatchlist('{'));assert.throws(()=>parseWatchlist('{"items":[]}'));assert.throws(()=>mergeWatchlist(a,[{...item,symbol:'<script>'}]));assert.deepEqual(a,[item]);});
test('100-item limit is enforced before merge',()=>{assert.throws(()=>mergeWatchlist([],Array.from({length:101},(_,i)=>({...item,symbol:String(i).padStart(6,'0')}))));});
