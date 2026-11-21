import test from 'node:test';import assert from 'node:assert/strict';
import {parseLatest,assessLatest,formatLatest,collectLatest} from '../telegram-risk/latest.mjs';
import {makeWebhook,webhookSecret,command} from '../telegram-risk/webhook.mjs';
const now=new Date('2026-11-20T16:00:00Z');
function quotes(){return Object.fromEntries(Object.entries({VIX:20,VIX3M:23,VIX6M:25,VIX9D:18,VVIX:100,SKEW:150,MOVE:80,DXY:101,SPX:6900}).map(([id,value])=>[id,{value,previous:value,at:'2026-11-20T15:55:00Z',date:'2026-11-20'}]));}
test('latest quote validation and exact timestamps, no future quotes',()=>{
 const payload={chart:{result:[{meta:{regularMarketPrice:20,regularMarketTime:Date.parse('2026-11-20T15:55:00Z')/1000,chartPreviousClose:19}}]}};
 assert.equal(parseLatest(payload,now).previous,19);
 assert.throws(()=>parseLatest(payload,new Date('2026-11-19T16:00:00Z')));
 const a=assessLatest(quotes(),[],{now});assert.equal(a.asOf,'2026-11-20');assert.equal(a.stage,'stable');assert.equal(a.technical,null);assert.equal(a.mode,'latest');
 const msg=formatLatest(a);assert.match(msg,/提供|제공처 최신 시세/);assert.match(msg,/장중 잠정/);assert.match(msg,/각 시세의 제공 시각/);assert.ok(msg.length<4096);
});
test('stale, mixed-date, missing quotes cannot be treated as current',()=>{
 const x=quotes();x.SKEW={...x.SKEW,date:'2026-11-19',at:'2026-11-19T21:00:00Z'};
 const a=assessLatest(x,[],{now});assert.equal(a.stage,'warning');assert.ok(a.missing.some(s=>s.includes('SKEW')));
 const y=quotes();y.VIX.at='2026-11-20T14:00:00Z';assert.equal(assessLatest(y,[],{now}).stage,'warning');
 delete y.MOVE;assert.equal(assessLatest(y,[],{now}).stage,'warning');
 const msg=formatLatest(assessLatest(quotes(),[],{now:new Date('2026-11-21T08:00:00Z')}));assert.match(msg,/정규장 시간 외/);
});
test('latest changes use canonical preceding daily close, not a different provider meta baseline',async()=>{
 const stamp=Date.parse('2026-11-20T15:55:00Z')/1000;
 const fetcher=async url=>{
  if(url.includes('.csv'))return {ok:true,text:async()=> 'DATE,CLOSE\n11/19/2026,100\n11/20/2026,110'};
  if(url.includes('interval=5m'))return {ok:true,json:async()=>({chart:{result:[{meta:{regularMarketPrice:110,regularMarketTime:stamp,chartPreviousClose:105}}]}})};
  return {ok:true,json:async()=>({chart:{result:[{timestamp:[Date.parse('2026-11-19T15:00:00Z')/1000,stamp],indicators:{quote:[{close:[100,110],high:[101,111],low:[99,109]}]}}]}})};
 };
 const r=await collectLatest({fetcher,now});assert.equal(r.quotes.MOVE.previous,100);assert.ok(Math.abs(r.values.MOVE.change-10)<1e-10);assert.equal(r.quotes.VIX.previous,100);
});
test('Korean commands and English menu commands',()=>{
 for(const s of ['위험','[위험]','/risk','/risk@market_bot'])assert.equal(command(s),'latest');
 assert.equal(command('마감'),'close');assert.equal(command('/close'),'close');assert.equal(command('/help'),'help');assert.equal(command('주문해줘'),null);
});
test('webhook authenticates Telegram secret and private chat before reading market data',async()=>{
 let calls=0;const handler=makeWebhook({token:'test-token',chatId:'123',getLatest:async()=>{calls++;return assessLatest(quotes(),[],{now});}});
 const post=(body,secret)=>new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json',...(secret?{'x-telegram-bot-api-secret-token':secret}:{})},body:JSON.stringify(body)});
 const update={update_id:1,message:{message_id:2,text:'위험',chat:{id:123,type:'private'}}};
 assert.equal((await handler(post(update))).status,401);assert.equal(calls,0);
 const secret=await webhookSecret('test-token');
 await handler(post({...update,message:{...update.message,chat:{id:456,type:'private'}}},secret));assert.equal(calls,0);
 const r=await handler(post(update,secret)),j=await r.json();assert.equal(j.method,'sendMessage');assert.equal(j.chat_id,123);assert.equal(j.parse_mode,'HTML');assert.match(j.text,/요청 조회/);assert.equal(calls,1);
 await handler(post(update,secret));assert.equal(calls,1);
 const second=await handler(post({...update,update_id:2},secret));assert.equal((await second.json()).method,'sendMessage');assert.equal(calls,1);
 assert.equal((await (await handler(post({type:'setup_check',chat_id:123},secret))).json()).ok,true);
 assert.equal((await (await handler(post({type:'setup_check',chat_id:456},secret))).json()).ok,false);
});
test('close request and outages return useful replies without disclosing credentials',async()=>{
 const secret=await webhookSecret('fake-token');
 const req=text=>new Request('https://example.test',{method:'POST',headers:{'x-telegram-bot-api-secret-token':secret},body:JSON.stringify({update_id:Math.floor(Math.random()*1e9),message:{message_id:1,text,chat:{id:123,type:'private'}}})});
 const handler=makeWebhook({token:'fake-token',chatId:'123',getClose:async()=>{throw Error('fake-token');}});
 const j=await (await handler(req('마감'))).json();assert.match(j.text,/조회에 실패/);assert.doesNotMatch(j.text,/fake-token/);
 const h=await(await handler(req('/help'))).json();assert.match(h.text,/\/risk/);
 const off=makeWebhook({});assert.equal((await off(req('위험'))).status,503);
});
