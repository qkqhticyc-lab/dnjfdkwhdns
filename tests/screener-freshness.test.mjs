import test from 'node:test';
import assert from 'node:assert/strict';
import {screenMarketDates,screenMarketDateText} from '../screener-freshness.mjs';
import {screenRow,collectScreener} from '../screener-core.mjs';
import {readFile} from 'node:fs/promises';
import {screenRefreshDecision} from '../screener-refresh.mjs';

test('market dates count each market separately and exclude failed or stale quotes', () => {
  const items=[{market:'KR',status:'ok',asOf:'2026-11-17'},{market:'KR',status:'ok',asOf:'2026-11-16'},
    {market:'KR',status:'stale',asOf:'2026-11-18'},{market:'US',status:'ok',asOf:'2026-11-16'},
    {market:'JP',status:'unavailable',asOf:'2026-11-17'}];
  const dates=screenMarketDates(items,{US:{status:'ok',asOf:'2026-11-17'}});
  assert.equal(dates[0].latest,'2026-11-17');assert.equal(dates[0].current,1);assert.equal(dates[0].total,2);
  assert.equal(dates[1].latest,'2026-11-16');assert.equal(dates[1].delayed,true);
  assert.equal(dates[2].latest,null);
  assert.match(screenMarketDateText(dates),/한국 2026-11-17 \(1\/2종목\)/);
  assert.match(screenMarketDateText(dates),/확인된 마감일 2026-11-17 대비 갱신 지연/);
});

test('legacy snapshots work without benchmark references', () => {
  const dates=screenMarketDates([{market:'US',status:'ok',asOf:'2026-11-16'}]);
  assert.equal(dates[1].delayed,false);
  assert.equal(screenMarketDates([])[0].latest,null);
});
test('catch-up scan uses fresh closed references and avoids running or recently requested scans',()=>{
 const now=new Date('2026-11-19T08:00Z'),snapshot={items:[{market:'KR',status:'ok',asOf:'2026-11-18'},{market:'US',status:'ok',asOf:'2026-11-18'}]},refs={KR:{status:'ok',asOf:'2026-11-19'},US:{status:'ok',asOf:'2026-11-18'}};
 assert.equal(screenRefreshDecision(snapshot,refs,[],now).request,true);
 assert.equal(screenRefreshDecision(snapshot,refs,[{status:'in_progress'}],now).request,false);
 assert.equal(screenRefreshDecision(snapshot,refs,[{status:'queued'}],now).request,false);
 assert.equal(screenRefreshDecision(snapshot,refs,[{status:'completed',createdAt:'2026-11-19T07:45Z'}],now).request,false);
 assert.equal(screenRefreshDecision(snapshot,refs,[{status:'completed',createdAt:'2026-11-19T06:00Z'}],now).request,true);
 assert.equal(screenRefreshDecision(snapshot,{KR:{status:'unavailable'}},[],now).request,false);
 assert.equal(screenRefreshDecision({items:[...snapshot.items,{market:'KR',status:'ok',asOf:'2026-11-19'}]},refs,[],now).request,false);
});

function bars(through) {
  const end=Date.parse(through+'T00:00:00Z');
  return Array.from({length:80},(_,index)=>({date:new Date(end-(79-index)*86400000).toISOString().slice(0,10),
    open:100+index,high:102+index,low:99+index,close:101+index,volume:1000}));
}
test('Korean same-day closed bar is included after 15:30 and excluded before close', () => {
  const history=bars('2026-11-17'),item={market:'KR',symbol:'005930'};
  assert.equal(screenRow(item,history,new Date('2026-11-17T06:29:00Z')).asOf,'2026-11-16');
  assert.equal(screenRow(item,history,new Date('2026-11-17T06:31:00Z')).asOf,'2026-11-17');
});
test('US close respects standard time and daylight saving time', () => {
  const item={market:'US',symbol:'AMD'};
  assert.equal(screenRow(item,bars('2026-11-17'),new Date('2026-11-17T20:59:00Z')).asOf,'2026-11-16');
  assert.equal(screenRow(item,bars('2026-11-17'),new Date('2026-11-17T21:01:00Z')).asOf,'2026-11-17');
  assert.equal(screenRow(item,bars('2026-07-17'),new Date('2026-07-17T19:59:00Z')).asOf,'2026-07-16');
  assert.equal(screenRow(item,bars('2026-07-17'),new Date('2026-07-17T20:01:00Z')).asOf,'2026-07-17');
});
test('scheduled scans cover Asian close plus US summer and winter close retries', async () => {
  const workflow=await readFile('.github/workflows/screener.yml','utf8');
  assert.match(workflow,/cron: '35,55 6 \* \* 1-5'/);
  assert.match(workflow,/cron: '5,35 20,21 \* \* 1-5'/);
});

test('a scan crossing the close evaluates the fetched candle at response time, not universe start',async()=>{
 const item={market:'KR',symbol:'005930',providerSymbol:'005930'},history=bars('2026-11-24').map(p=>({localDate:p.date.replaceAll('-',''),openPrice:p.open,highPrice:p.high,lowPrice:p.low,closePrice:p.close,accumulatedTradingVolume:p.volume}));
 const universe={collectedAt:'2026-11-24T06:20:00Z',items:[item],coverage:[]},fetcher=async()=>Response.json(history);
 const r=await collectScreener(fetcher,new Date(universe.collectedAt),null,{universe,clock:()=>new Date('2026-11-24T06:31:00Z')});
 assert.equal(r.items[0].asOf,'2026-11-24');assert.equal(r.items[0].collectedAt,'2026-11-24T06:31:00.000Z');
 const before=await collectScreener(fetcher,new Date(universe.collectedAt),null,{universe,clock:()=>new Date('2026-11-24T06:29:00Z')});assert.equal(before.items[0].asOf,'2026-11-23');
});
