import test from 'node:test';import assert from 'node:assert/strict';
import {parseLatest,assessLatest,formatLatest,collectLatest} from '../telegram-risk/latest.mjs';
import {makeWebhook,webhookSecret,command} from '../telegram-risk/webhook.mjs';
import {validClose} from '../telegram-risk/cache.mjs';
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

test('history failure preserves valid current quotes and their provider baseline',async()=>{
 const fetcher=async url=>{
  if(url.includes('interval=5m'))return Response.json({chart:{result:[{meta:{regularMarketPrice:110,regularMarketTime:now.getTime()/1000,previousClose:100}}]}});
  throw Error('history unavailable');
 };
 const r=await collectLatest({fetcher,now,backoff:false});
 assert.equal(Object.keys(r.quotes).length,9);assert.equal(r.quotes.VIX.previous,100);assert.equal(r.quotes.SPX.value,110);
 assert.equal(r.sourceErrors.filter(e=>e.part==='history').length,9);
});

test('provider 429 backs off, delayed fallback survives and old closes never become live curves',async()=>{
 const old=assessLatest(quotes(),[],{now});const archive={...old,mode:'close'};
 let yahooCalls=0;
 const fetcher=async url=>{
  if(url.includes('yahoo.com')){yahooCalls++;return new Response('',{status:429});}
  if(url.includes('.csv'))return new Response('DATE,CLOSE\n11/19/2026,19\n11/20/2026,20');
  return Response.json({closePrice:'21',compareToPreviousClosePrice:'1',localTradedAt:'2026-11-20T10:55:00-05:00',delayTime:15});
 };
 const r=await collectLatest({fetcher,now,archive});
 assert.equal(yahooCalls,1);assert.equal(Object.keys(r.quotes).length,2);assert.equal(Object.keys(r.displayQuotes).length,9);
 assert.equal(r.quotes.VIX.value,21);assert.equal(r.displayQuotes.VIX3M.basis,'close');assert.equal(r.displayQuotes.MOVE.source,'Last verified close');
 assert.equal(r.curve,null);assert.equal(r.stage,'warning');
 const text=formatLatest(r);assert.match(text,/현재 판정이 아닙니다/);assert.match(text,/11-19 마감/);assert.match(text,/Naver|같은 시각/);assert.ok(text.length<4096);
 const again=await collectLatest({fetcher,now,archive});assert.equal(yahooCalls,1);assert.equal(again.quotes.SPX.value,21);
});

test('close cache accepts only complete dated closes, protects writes and passes archive to queries',async()=>{
 const archive={...assessLatest(quotes(),[],{now}),mode:'close'};
 assert.equal(validClose(archive),true);assert.equal(validClose({...archive,mode:'latest'}),false);
 assert.equal(validClose({...archive,values:{}}),false);assert.equal(validClose({...archive,asOf:'2099-01-01'}),false);
 let saved=0,received;
 const secret=await webhookSecret('fake-token');
 const h=makeWebhook({token:'fake-token',chatId:'123',archiveStore:{load:async()=>archive,save:async()=>{saved++;}},getLatest:async options=>{received=options.archive;return assessLatest(quotes(),[],{now});}});
 const post=(body,auth=secret)=>new Request('https://example.test',{method:'POST',headers:{'x-telegram-bot-api-secret-token':auth},body:JSON.stringify(body)});
 assert.equal((await h(post({type:'publish_close',chat_id:123,report:archive},'wrong'))).status,401);
 await h(post({type:'publish_close',chat_id:456,report:archive}));assert.equal(saved,0);
 assert.equal((await h(post({type:'publish_close',chat_id:123,report:{...archive,values:{}}}))).status,400);
 assert.equal((await h(post({type:'publish_close',chat_id:123,report:archive}))).status,200);assert.equal(saved,1);
 await h(post({type:'diagnostics',chat_id:123}));assert.deepEqual(received,archive);
});
