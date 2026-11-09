import test from'node:test';import assert from'node:assert/strict';
import{analyzeGuide}from'../chart-guide-core.mjs';
const bars=(count=230)=>Array.from({length:count},(_,i)=>({asOf:new Date(Date.UTC(2025,0,i+1)).toISOString(),open:100+i*.2,high:101+i*.2,low:99+i*.2,close:100+i*.2,volume:100}));
test('EMA seeded with SMA, all six averages warm up independently, flat RSI/ATR and insufficient history are explicit',()=>{
 const rows=bars(),d=analyzeGuide(rows);assert.equal(d.frames[6].ema8,null);assert.equal(d.frames[7].ema8,100.7);assert.ok(Math.abs(d.frames[8].ema8-(100.7+2/9*(101.6-100.7)))<1e-9);assert.equal(d.frames[98].sma100,null);assert.ok(Math.abs(d.frames[99].sma100-109.9)<1e-9);assert.equal(d.frames[198].sma200,null);assert.ok(Math.abs(d.frames[199].sma200-119.9)<1e-9);
 assert.deepEqual(analyzeGuide(rows.slice(0,70)).missingLines,['SMA 100','SMA 200']);assert.equal(analyzeGuide(rows.slice(0,20)).status,'insufficient');assert.equal(analyzeGuide(rows.map(r=>({...r,open:100,high:100,low:100,close:100}))).frames.at(-1).rsi,50);
});
test('future bars cannot alter old averages or retroactively create signals',()=>{
 const rows=bars(240);rows[210]={...rows[210],open:145,low:144,high:155,close:154,volume:500};const all=analyzeGuide(rows),prefix=analyzeGuide(rows.slice(0,211));assert.deepEqual(all.frames.slice(0,211),prefix.frames);assert.deepEqual(all.events.filter(e=>e.asOf<=rows[210].asOf),prefix.events);
 const changed=rows.map(r=>({...r}));changed.at(-1).close=1000;changed.at(-1).high=1001;assert.deepEqual(analyzeGuide(changed).frames.slice(0,-1),all.frames.slice(0,-1));
});
test('breakout requires prior high, trend and independent prior volume; missing volume never produces a signal',()=>{
 const rows=bars(80),last=rows.at(-1);Object.assign(last,{open:120,high:126,low:119,close:125,volume:200});let d=analyzeGuide(rows);assert.ok(d.frames.at(-1).signals.includes('breakout'));assert.equal(d.frames.at(-1).high20,116.6);assert.equal(d.frames.at(-1).volumeRatio,2);
 last.volume=null;d=analyzeGuide(rows);assert.equal(d.frames.at(-1).volumeRatio,null);assert.ok(!d.frames.at(-1).signals.includes('breakout'));last.volume=100;assert.ok(!analyzeGuide(rows).frames.at(-1).signals.includes('breakout'));
});
test('same session slot and duration are used for 4h relative volume',()=>{
 const rows=bars(80).map((r,i)=>({...r,bucket:i%2,durationMinutes:i%2?150:240,volume:i%2?100:1000}));rows.at(-1).volume=200;assert.equal(analyzeGuide(rows).frames.at(-1).volumeRatio,2);rows.at(-3).volume=null;assert.equal(analyzeGuide(rows).frames.at(-1).volumeRatio,null);
});
test('persistent heat is labelled once, not repeatedly repainted as repeated trade exits',()=>{
 const rows=bars(80);for(let i=60;i<80;i++)Object.assign(rows[i],{open:150+(i-60)*5,close:154+(i-60)*5,high:155+(i-60)*5,low:149+(i-60)*5,volume:200});const d=analyzeGuide(rows),heat=d.events.filter(e=>e.key==='heat');assert.equal(heat.length,1);assert.ok(d.frames.at(-1).active.includes('heat'));assert.ok(!d.frames.at(-1).signals.includes('heat'));assert.equal(d.events.some(e=>'profit'in e||'winRate'in e),false);
});
test('invalid identity/time order is rejected and missing OHLC does not fabricate breakout levels',()=>{
 assert.throws(()=>analyzeGuide([...bars(2)].reverse()),/Invalid/);assert.throws(()=>analyzeGuide([{asOf:'not-date',close:100}]),/Invalid/);const d=analyzeGuide(bars(80).map(r=>({...r,high:null})));assert.equal(d.frames.at(-1).high20,null);assert.equal(d.frames.at(-1).atr,null);assert.ok(!d.events.some(e=>['breakout','breakdown','heat','contraction'].includes(e.key)));
});
test('recovery, two-bar weakness, downside breakout and contraction have distinct evidence',()=>{
 const recovery=bars(100);Object.assign(recovery.at(-2),{open:119,close:117.8,high:120,low:117});Object.assign(recovery.at(-1),{open:119,close:121,high:122,low:118,volume:100});assert.ok(analyzeGuide(recovery).frames.at(-1).signals.includes('pullback'));
 const falling=bars(100).map((p,i)=>({...p,open:200-i*.2,high:201-i*.2,low:199-i*.2,close:200-i*.2}));Object.assign(falling.at(-1),{open:175,close:170,high:176,low:169,volume:200});const d=analyzeGuide(falling);assert.ok(d.frames.at(-1).signals.includes('breakdown'));assert.ok(d.events.some(e=>e.key==='weakness'));
 const contraction=bars(90).map((p,i)=>({...p,open:100,close:100,high:100+(i<70?10:i<80?5:2),low:100-(i<70?10:i<80?5:2),volume:i<80?100:50}));const a=analyzeGuide(contraction);assert.ok(a.frames.at(-1).active.includes('contraction'));assert.ok(a.events.some(e=>e.key==='contraction'));assert.ok(!a.frames.at(-1).active.includes('breakout'));
});
