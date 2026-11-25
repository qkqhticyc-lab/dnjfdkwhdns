import test from 'node:test';
import assert from 'node:assert/strict';
import {selectScanRun} from '../scan-artifact.mjs';
const old={databaseId:100,status:'completed',conclusion:'success',updatedAt:'2026-11-25T05:04Z'};
test('completion event pins the exact scan even when the success list still shows its predecessor',()=>{
 assert.equal(selectScanRun([old],'200'),200);
 assert.throws(()=>selectScanRun([], '200;anything'));
});
test('manual publication chooses newest completed attempt, ignoring queued or failed newer runs',()=>{
 const rerun={...old,databaseId:50,updatedAt:'2026-11-25T12:00Z'};
 assert.equal(selectScanRun([old,{...old,databaseId:300,status:'queued',updatedAt:'2026-11-25T13:00Z'},rerun,{...old,databaseId:400,conclusion:'failure',updatedAt:'2026-11-25T14:00Z'}]),50);
 assert.equal(selectScanRun([]),null);
});
