import test from 'node:test';
import assert from 'node:assert/strict';
import {watchdogWindow,watchdogDecision,screenerReferences,screenRefreshText} from '../scan-watchdog-core.mjs';
import {signWatchdog,verifyWatchdog} from '../scan-watchdog-auth.mjs';
const now=new Date('2026-11-24T23:00:00Z'),snapshot={schemaVersion:1,collectedAt:'2026-11-24T14:10:00Z',completedAt:'2026-11-24T14:21:00Z',items:[{market:'US',status:'ok',asOf:'2026-11-23'}]},refs={US:{status:'ok',asOf:'2026-11-24'}};
test('scheduler signatures expire, bind manual mode and reject missing or altered authentication',async()=>{
 const secret='test-only-private-key',at=String(now.getTime()/1000),signature=await signWatchdog(secret,at);
 assert.equal(await verifyWatchdog(secret,signature,at,false,now.getTime()),true);
 assert.equal(await verifyWatchdog(secret,signature,at,true,now.getTime()),false);
 assert.equal(await verifyWatchdog(secret,signature,at,false,now.getTime()+121000),false);
 assert.equal(await verifyWatchdog('wrong-key',signature,at,false,now.getTime()),false);
 assert.equal(await verifyWatchdog(secret,'',at,false,now.getTime()),false);
});
test('independent check requests a scan when the post-close scheduled runs never started',()=>{
 const d=watchdogDecision(snapshot,refs,[],[],now);assert.equal(d.action,'scan');assert.equal(d.dates[1].delayed,true);
 assert.equal(watchdogDecision(snapshot,refs,[{status:'queued'}],[],now).status,'scan_running');
 assert.equal(watchdogDecision(snapshot,refs,[{status:'completed',created_at:'2026-11-24T22:45Z'}],[],now).status,'waiting');
});
test('a rerun of an older workflow publishes its new attempt once, then does not loop',()=>{
 const run={id:123,run_attempt:2,status:'completed',conclusion:'success',created_at:'2026-11-23T20:05Z',run_started_at:'2026-11-24T22:10Z',updated_at:'2026-11-24T22:23Z'};
 assert.equal(watchdogDecision(snapshot,refs,[run],[],now).action,'publish');
 assert.equal(watchdogDecision(snapshot,refs,[run],[{status:'in_progress'}],now).status,'publish_running');
 const published={...snapshot,scanRunId:123,scanAttempt:2,collectedAt:'2026-11-24T22:10Z',completedAt:'2026-11-24T22:22Z'};
 assert.equal(watchdogDecision(published,refs,[run],[],now).action,'scan');
 assert.equal(watchdogDecision({...published,scanAttempt:1},refs,[run],[],now).action,'publish');
});
test('no verified reference means unknown, never a fake current result',()=>{
 assert.equal(watchdogDecision(snapshot,{},[],[],now).status,'references_unavailable');
 assert.equal(watchdogDecision(snapshot,{US:{status:'ok',asOf:'2026-11-23'}},[],[],now).status,'references_partial');
 assert.equal(watchdogDecision({...snapshot,items:[{market:'US',status:'ok',asOf:'2026-11-24'}]},refs,[],[],now).action,null);
});
test('independent windows follow DST, Asian close, weekends and Friday US close on Saturday KST',()=>{
 assert.equal(watchdogWindow(now),true);
 assert.equal(watchdogWindow(new Date('2026-11-24T17:59Z')),false);
 assert.equal(watchdogWindow(new Date('2026-11-27T18:10Z')),true);
 assert.equal(watchdogWindow(new Date('2026-07-24T20:05Z')),true);
 assert.equal(watchdogWindow(new Date('2026-11-27T23:00Z')),true);
 assert.equal(watchdogWindow(new Date('2026-11-28T23:00Z')),false);
 assert.equal(watchdogWindow(new Date('2026-11-25T06:30Z')),true);
});
test('small published manifest gives the same decision and preserves full-universe counts',()=>{
 const manifest={...snapshot,items:undefined,marketDates:[{market:'US',latest:'2026-11-23',total:6913,current:6805}]};
 const result=watchdogDecision(manifest,refs,[],[],now);assert.equal(result.action,'scan');assert.equal(result.dates[1].total,6913);assert.equal(result.dates[1].current,6805);assert.equal(result.dates[1].reference,'2026-11-24');
});
test('live references expose stale static data, never regress or falsely report an old job as running',()=>{
 const saved=[{market:'US',reference:'2026-11-23'}],live={checkedAt:now.toISOString(),dates:[{market:'US',reference:'2026-11-24'}],status:'scan_running'};
 assert.equal(screenerReferences(saved,live).US.asOf,'2026-11-24');
 assert.equal(screenerReferences(live.dates,{dates:saved}).US.asOf,'2026-11-24');
 const dates=watchdogDecision(snapshot,refs).dates;
 assert.match(screenRefreshText(dates,live,{},now.getTime()),/업데이트하고/);
 assert.match(screenRefreshText(dates,{...live,checkedAt:'2026-11-24T18:00Z'},null,now.getTime()),/늦습니다/);
 assert.doesNotMatch(screenRefreshText(dates,null,{status:'current'},now.getTime()),/최신/);
 assert.match(screenRefreshText([],{status:'check_failed'},null,now.getTime()),/확인하지 못했습니다/);
});
