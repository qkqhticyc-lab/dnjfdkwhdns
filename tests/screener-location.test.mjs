import test from 'node:test';
import assert from 'node:assert/strict';
import { entryLocation, locationInputs, matchesLocation } from '../screener-location.mjs';
import { analyzeStrategy } from '../strategy-core.mjs';
import { entrySnapshot } from '../entry-snapshot.mjs';
import { screenRow } from '../screener-core.mjs';

const fixture = () => ({status:'ok',asOf:'2026-11-19',price:101,rsi:60,
 signal:{status:'active',kind:'breakoutEntry',entryType:'breakout',asOf:'2026-11-17',referenceAt:'2026-11-19',age:2,entry:100,initialStop:94,tp1:110,tp2:120,tp1Hit:false,tp2Hit:false},
 locationInputs:{version:1,asOf:'2026-11-19',signalAt:'2026-11-17',kind:'breakoutEntry',atr:4,open:100,low:99,ema21:97,support:98,supportLabel:'신호 당시 20봉 고가',fixedSupport:true,previousHigh:102,stop:95}});
const locate = (item, price) => entryLocation({...item,price});

test('near and chase boundaries scale by ATR and cap by percentage in every currency',()=>{
 for(const scale of [.08,1,300,1000]){
  const p=fixture();p.price*=scale;
  for(const key of ['entry','initialStop','tp1','tp2'])p.signal[key]*=scale;
  for(const key of ['atr','open','low','ema21','support','previousHigh','stop'])p.locationInputs[key]*=scale;
  assert.equal(entryLocation(p).code,'near');
  assert.equal(locate(p,102*scale).code,'near');
  assert.equal(locate(p,103*scale).code,'waiting');
  assert.equal(locate(p,104.01*scale).code,'chase');
 }
 const p=fixture();p.locationInputs.atr=20;assert.equal(locate(p,103.01).code,'waiting');assert.equal(locate(p,105.01).code,'chase');
});
test('retest requires a later bar, prior extension, real touch and recovery; no deep washout',()=>{
 const p=fixture();p.price=99;p.locationInputs={...p.locationInputs,open:98.5,low:97.5};
 assert.equal(entryLocation(p).code,'retest');
 assert.equal(entryLocation({...p,signal:{...p.signal,age:0}}).code,'near');
 for(const change of [{previousHigh:99},{low:99.5},{low:95},{open:100}])assert.notEqual(entryLocation({...p,locationInputs:{...p.locationInputs,...change}}).code,'retest');
 p.price=97.5;assert.equal(entryLocation(p).code,'waiting');
 p.price=95.9;assert.equal(entryLocation(p).code,'damaged');
});
test('damaged precedes historical targets; targets do not reset on a pullback',()=>{
 const p=fixture();p.signal.tp1Hit=true;assert.equal(entryLocation(p).code,'target');
 assert.equal(entryLocation({...p,signal:{...p.signal,status:'closed'}}).code,'damaged');
 assert.equal(entryLocation({...p,signal:{...p.signal,status:'closed'}}).targetBeforeExit,true);
 assert.equal(locate(p,94).code,'damaged');
 assert.equal(locate(p,95.9).code,'damaged');
 assert.equal(locate(p,106).code,'target');
 p.signal.tp1Hit=false;assert.equal(locate(p,110).code,'target');
});
test('unknown and waiting do not pretend missing or expired information is a valid entry',()=>{
 const p=fixture();
 for(const change of [{status:'stale'},{locationInputs:null},{price:NaN},{signal:{...p.signal,provisional:true}},{locationInputs:{...p.locationInputs,asOf:'2026-11-18'}},{locationInputs:{...p.locationInputs,signalAt:'2026-11-16'}},{locationInputs:{...p.locationInputs,atr:null}},{locationInputs:{...p.locationInputs,stop:null}}])assert.equal(entryLocation({...p,...change}).code,'unknown');
 assert.equal(entryLocation(p,{latestDate:'2026-11-20'}).code,'unknown');
 assert.equal(entryLocation({...p,signal:null}).code,'waiting');
 assert.equal(entryLocation({...p,signal:{...p.signal,status:'closed'},locationInputs:{...p.locationInputs,timedOut:true}}).code,'waiting');
 for(const code of ['near','retest'])assert.equal(matchesLocation({code},'nearby'),true);
 for(const code of ['chase','target','damaged','waiting','unknown'])assert.equal(matchesLocation({code},'nearby'),false);
});
test('input builder freezes breakout geometry and ignores future bars and unrelated trades',()=>{
 const signal=fixture().signal;
 const frames=[{asOf:'2026-11-17',high20:98,high:104},{asOf:'2026-11-18',high:107},{asOf:'2026-11-19',high:109,low:99,open:100,atr:4,ema14:99,ema21:97,trade:{started:'2026-11-17',stop:96}},{asOf:'2026-11-20',high:200,atr:99}];
 let input=locationInputs({frames,events:[]},signal);assert.equal(input.previousHigh,107);assert.equal(input.stop,96);assert.equal(input.support,98);assert.equal(input.atr,4);
 frames[2].trade.started='2026-11-18';assert.equal(locationInputs({frames,events:[]},signal).stop,null);
 frames[0].pattern={triangle:{upper:{m:-2,b:103}},box:{top:102}};
 assert.equal(locationInputs({frames,events:[]},{...signal,entryType:'triangle'}).support,103);
 assert.equal(locationInputs({frames,events:[]},{...signal,entryType:'boxRetest'}).support,102);
 assert.equal(locationInputs({frames,events:[]},{...signal,entryType:'pullback'}).support,99);
});
test('published screen rows use actual strategy levels from the same closed-bar prefix',()=>{
 const rows=Array.from({length:100},(_,i)=>({asOf:new Date(Date.UTC(2026,7,i+1)).toISOString().slice(0,10),date:new Date(Date.UTC(2026,7,i+1)).toISOString().slice(0,10),open:100+i,close:101.5+i,high:102+i,low:99+i,volume:1e7}));
 const guide=analyzeStrategy(rows),signal=entrySnapshot(guide,rows.at(-1).asOf);
 assert.ok(signal);
 const p=screenRow({market:'US',symbol:'TEST'},rows,new Date('2026-11-19T12:00:00Z'));
 assert.deepEqual(p.locationInputs,locationInputs(guide,signal));
 assert.equal(p.locationInputs.signalAt,p.signal.asOf);assert.notEqual(entryLocation(p).code,'unknown');
});
