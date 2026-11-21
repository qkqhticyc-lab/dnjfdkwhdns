import test from 'node:test';
import assert from 'node:assert/strict';
import {RULES,assess,parseCboe,parseYahoo,completed,nyClock,formatReport,deliveryKey,shouldDeliver,deliver,columnWidth} from '../telegram-risk/core.mjs';
const now=new Date('2026-11-21T03:00:00Z');
function fixture({vix=20,spread=3,long=2,short=-2,spx=100,move=80,previousMove=80}={}){
 const values={VIX:vix,VIX3M:vix+spread,VIX6M:vix+spread+long,VIX9D:vix+short,VVIX:100,SKEW:150,MOVE:move,DXY:101,SPX:spx};
 return Object.fromEntries(Object.entries(values).map(([id,close])=>[id,[{date:'2026-11-19',close:id==='MOVE'?previousMove:close,high:close+2,low:close-2},{date:'2026-11-20',close,high:close+2,low:close-2}]]));
}
test('four screenshot lights and stages constrain the reconstruction',()=>{
 const a=assess(fixture({vix:20.25,spread:.8,long:1.2,short:.4,move:94}),{now});
 assert.equal(a.stage,'tension');assert.deepEqual(a.lights,{curve:'red',long:'green',ratio:'yellow',short:'yellow'});
 const b=fixture({vix:17.35,spread:.3,long:1.2,short:0,spx:98,move:101});b.SPX[0].close=100;
 const c=assess(b,{now});assert.equal(c.stage,'fracture');assert.equal(c.lights.ratio,'red');assert.deepEqual(c.reasons,['NEAR_BW','SPX']);
 const d=assess(fixture({vix:37.6,spread:-6.7,long:-1.4,short:3.1,move:106,previousMove:95.75}),{now});
 assert.equal(d.stage,'trigger');assert.deepEqual(Object.values(d.lights),['red','red','red','red']);
 assert.equal(assess(fixture({spread:2.1}),{now}).stage,'stable');
});
test('MOVE and SPX are independent confirmation; curve votes are not summed',()=>{
 assert.equal(assess(fixture({spread:-3,move:101,previousMove:101}),{now}).stage,'fracture');
 assert.equal(assess(fixture({spread:3,move:106,previousMove:95}),{now}).stage,'tension');
 assert.equal(assess(fixture({spread:.8}),{now}).stage,'tension');
 const x=fixture();x.VVIX.at(-1).close=160;x.SKEW.at(-1).close=200;
 assert.equal(assess(x,{now}).stage,'stable');
});
test('mixed dates, missing series and stale data never produce a safe stage or delivery',()=>{
 const x=fixture();x.SPX.pop();const a=assess(x,{now});assert.equal(a.asOf,'2026-11-20');assert.equal(a.stage,'warning');assert.ok(a.missing.includes('SPX'));assert.equal(shouldDeliver(a),false);
 const y=fixture();y.MOVE=[];assert.equal(assess(y,{now}).stage,'warning');
 assert.equal(assess(fixture(),{now:new Date('2026-11-27T03:00:00Z')}).stage,'warning');
 const z=assess({},{now});assert.equal(z.structure,'UNKNOWN');assert.equal(z.stage,'warning');
});
test('NY cutoff follows DST and filters ongoing daily candles',()=>{
 assert.equal(nyClock(new Date('2026-07-01T21:30:00Z')).minutes,17*60+30);
 assert.equal(nyClock(new Date('2026-11-20T22:30:00Z')).minutes,17*60+30);
 const rows=fixture().SPX;
 assert.equal(completed(rows,new Date('2026-11-20T22:29:00Z')).at(-1).date,'2026-11-19');
 assert.equal(completed(rows,new Date('2026-11-20T22:30:00Z')).at(-1).date,'2026-11-20');
});
test('source parsers handle actual CSV layouts, reject bad data and use NY dates',()=>{
 assert.deepEqual(parseCboe('DATE,VVIX\n11/20/2026,138.03'),[{date:'2026-11-20',close:138.03}]);
 assert.equal(parseCboe('DATE,OPEN,HIGH,LOW,CLOSE\n11/20/2026,20,30,10,25')[0].close,25);
 assert.throws(()=>parseCboe('DATE,VVIX\n02/30/2026,100'));
 assert.throws(()=>parseCboe('DATE,VVIX\n11/20/2026,'));
 const j={chart:{result:[{timestamp:[Date.parse('2026-11-21T01:00:00Z')/1000],indicators:{quote:[{open:[1],high:[2],low:[1],close:[2]}]}}]}};
 assert.equal(parseYahoo(j)[0].date,'2026-11-20');
});
test('SPX structure is explicit, 30 weeks and ATR/ADX use only the as-of prefix',()=>{
 const x=fixture(),bars=[];for(let i=0;i<300;i++){const d=new Date('2025-10-01T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);if([0,6].includes(d.getUTCDay()))continue;const close=100+i/10;bars.push({date:d.toISOString().slice(0,10),close,high:close+1,low:close-1});}
 x.SPX=[...bars,...x.SPX];const a=assess(x,{now});assert.equal(a.technical.symbol,'SPX');assert.ok(a.technical.ma30>0);assert.ok(a.technical.atr>0);assert.ok(a.technical.adx>=0);
 x.SPX.push({date:'2026-11-23',close:10000,high:10000,low:10000});assert.deepEqual(assess(x,{now}).technical,a.technical);
});
test('ledger suppresses repeated reports; failed or dry-run delivery cannot mark sent',async()=>{
 const a=assess(fixture(),{now}),state={sent:[deliveryKey(a)]};assert.equal(shouldDeliver(a,state),false);assert.equal(shouldDeliver(a,{sent:[]}),true);
 const message=formatReport(a,{stage:'tension'});assert.match(message,/긴장 구간 → 안정 구간/);assert.ok(message.length<4096);
 let body;await deliver(message,{token:'fake-secret',chatId:'fake-chat',fetcher:async(url,options)=>{body=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true})};}});assert.equal(body.text,message);assert.equal(body.chat_id,'fake-chat');assert.equal(body.parse_mode,'HTML');
 await assert.rejects(deliver(message,{token:'fake-secret',chatId:'x',fetcher:async()=>{throw Error('url contains fake-secret');}}),e=>!e.message.includes('fake-secret'));
 await assert.rejects(deliver(message,{token:'x',chatId:'x',fetcher:async()=>({ok:false,status:403,json:async()=>({ok:false,error_code:403,description:'private token x'})})}),/HTTP 403/);
 assert.deepEqual(state.sent,[deliveryKey(a)]);
});
test('beginner report is mobile-sized, escaped HTML and specific to each stage',()=>{
 const reports=[assess(fixture(),{now}),assess(fixture({spread:.8}),{now}),assess(fixture({spread:-3}),{now}),assess(fixture({spread:-3,move:106,previousMove:95}),{now}),assess({},{now})];
 for(const report of reports){
  const message=formatReport(report);assert.ok(message.length<4096);assert.match(message,/<blockquote>/);assert.match(message,/용어를 쉽게 보면/);assert.match(message,/방향이 아닌 추세 강도/);
  for(const block of message.matchAll(/<pre>(.*?)<\/pre>/gs))for(const line of block[1].split('\n'))assert.ok(columnWidth(line)<=31,`${columnWidth(line)} columns: ${line}`);
 }
 assert.match(formatReport(reports[0]),/복합 위험 신호가 잡히지/);
 assert.match(formatReport(reports[3]),/주식시장 불안과 채권 변동성 급등/);
 assert.match(formatReport(reports[4]),/판단을 보류/);
 assert.doesNotMatch(formatReport({...reports[0],asOf:'<bad&date>'},{stage:'<fake>'}),/<bad|<fake>/);
 assert.equal(shouldDeliver(reports[0],{sent:[`1:${reports[0].asOf}:stable`]}),true);
});
