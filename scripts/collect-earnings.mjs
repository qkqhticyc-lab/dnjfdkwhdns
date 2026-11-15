import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {EARNINGS_METRICS, parseEarningsMarket, mergeEarningsMarkets, mergeEarningsHistory, parseEarningsDates, financeHistory, validEarnings} from '../earnings-core.mjs';

import {collectUsEarnings} from './us-earnings-source.mjs';

const CACHE = '.cache/earnings';
const SITE = 'https://qkqhticyc-lab.github.io/dnjfdkwhdns/';
const now = Date.now(), attemptedAt = new Date(now).toISOString();
await mkdir(CACHE, {recursive:true});
async function read(path, fallback) {
 try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}
async function request(url, json=true) {
 const response = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0', Accept:json?'application/json':'text/html'}, signal:AbortSignal.timeout(12000)});
 if (!response.ok) throw Error('Source HTTP '+response.status);
 return json ? response.json() : response.text();
}
let previous = await read(CACHE+'/publish.json', null);
try {
 const live = await request(SITE+'data/earnings.json');
 if (validEarnings(live) && (!validEarnings(previous) || live.attemptedAt>previous.attemptedAt)) previous=live;
} catch {}
// Retain the verified expanded snapshot when a new deployment has an older cache.
const seed=await read('data/us-earnings.json',null);
if(validEarnings(seed)) {
 const known=new Map((previous?.items||[]).filter(item=>item.market==='US').map(item=>[item.symbol,item]));
 for(const item of seed.items.filter(item=>item.market==='US')) {
  const old=known.get(item.symbol);
  if(!old||item.period>old.period||(item.period===old.period&&item.earningsFetchedAt>old.earningsFetchedAt))known.set(item.symbol,item);
 }
 previous={...(previous||seed),items:[...(previous?.items||[]).filter(item=>item.market!=='US'),...known.values()]};
}
const previousAll=previous;
previous=validEarnings(previousAll)?{...previousAll,...previousAll.markets?.KR,items:previousAll.items.filter(item=>(item.market||'KR')==='KR')}:null;
let screen=await read('data/screener.json',{});
try {
 const live=await request(SITE+'data/screener.json');
 if(live.schemaVersion===1&&Array.isArray(live.items)&&(!screen.collectedAt||live.collectedAt>screen.collectedAt))screen=live;
} catch {}
const companies = await read(CACHE+'/companies.json', {});

async function companyInfo(item) {
 const key = item.symbol+':'+item.basis;
 const cached = companies[key];
 if (cached?.dates?.some(date=>date.period===item.period && date.basis===item.basis) && now-Date.parse(cached.fetchedAt)<6*3600000) return cached;
 try {
  const html = await request('https://comp.wisereport.co.kr/company/c1010001.aspx?cmp_cd='+item.symbol, false);
  const dates = parseEarningsDates(html, item.symbol);
  const announced = dates.find(date=>date.period===item.period && date.basis===item.basis);
  const info = {dates, history:[], marketCap:null, disclosure:null, fetchedAt:attemptedAt};
  if (announced && now-Date.parse(announced.date)<60*86400000) {
   const results = await Promise.allSettled([
    request(`https://m.stock.naver.com/api/stock/${item.symbol}/finance/quarter`),
    request(`https://m.stock.naver.com/api/stock/${item.symbol}/integration`),
    request(`https://m.stock.naver.com/api/stock/${item.symbol}/disclosure?page=1&pageSize=20`)
   ]);
   if (results[0].status==='fulfilled') {
    try { info.history=financeHistory(results[0].value,item.symbol,item.basis); } catch {}
   }
   if (results[1].status==='fulfilled' && results[1].value.itemCode===item.symbol) info.marketCap=results[1].value.totalInfos?.find(row=>row.code==='marketValue')?.value?.slice(0,60)||null;
   if (results[2].status==='fulfilled' && Array.isArray(results[2].value)) {
    const expected = item.basis==='consolidated'?'연결재무제표기준영업':'영업';
    const candidates=results[2].value.filter(row=>row.itemCode===item.symbol && row.title?.includes(expected) && /\(잠정\)실적/.test(row.title) && String(row.datetime).slice(0,10)===announced.date);
    const selected=candidates[0];
    if (selected && Number.isInteger(selected.disclosureId) && selected.disclosureId>0) info.disclosure={title:selected.title.slice(0,240), id:selected.disclosureId};
   }
  }
  companies[key]=info;
  return info;
 } catch {
  if (cached) return {...cached, stale:true};
  throw Error('Company earnings dates unavailable');
 }
}

let output;
try {
 const results = await Promise.all(EARNINGS_METRICS.map(async metric=>parseEarningsMarket(await request('https://comp.wisereport.co.kr/earnings/e1040001.aspx?acc_typ='+metric.account,false),metric.key)));
 const markets = mergeEarningsMarkets(results.flat());
 const period = markets.map(row=>row.period).sort().at(-1);
 const latest = markets.filter(row=>row.period===period);
 const chartRows = new Map((screen.items||[]).filter(row=>row.market==='KR').map(row=>[row.symbol,row]));
 const items = [];
 let failed=0, outside=0;
 for (let start=0; start<latest.length; start+=3) {
  if (Date.now()-now>240000) {failed+=latest.length-start;break;}
  const group = await Promise.allSettled(latest.slice(start,start+3).map(async item=>{
   const info = await companyInfo(item);
   const date = info.dates.find(date=>date.period===item.period && date.basis===item.basis);
   if (!date || Date.parse(date.date)>now || now-Date.parse(date.date)>60*86400000) {outside++;return null;}
   const chart=chartRows.get(item.symbol);
   return {...item, market:'KR', id:[item.symbol,item.period,item.basis].join(':'), announcedOn:date.date,
    marketCap:info.marketCap, companyFetchedAt:info.fetchedAt, stale:!!info.stale,
    reportTitle:info.disclosure?.title||'분기 잠정실적 · FnGuide 집계',
    disclosureUrl:info.disclosure?`https://m.stock.naver.com/domestic/stock/${item.symbol}/notice/${info.disclosure.id}`:null,
    sourceUrl:'https://comp.wisereport.co.kr/company/c1050001.aspx?cmp_cd='+item.symbol,
    history:mergeEarningsHistory(item,markets,info.history),
    chart:chart?{market:chart.market,status:chart.status,symbol:chart.symbol,asOf:chart.asOf,price:chart.price,rankInputs:chart.rankInputs,liquidity:chart.liquidity,volumeRatio:chart.volumeRatio,trend:chart.trend,signal:chart.signal}:null};
  }));
  for (const result of group) {
   if (result.status==='fulfilled' && result.value) items.push(result.value);
   else if (result.status==='rejected') failed++;
  }
 }
 items.sort((a,b)=>b.announcedOn.localeCompare(a.announcedOn)||a.name.localeCompare(b.name,'ko'));
 if (!items.length) throw Error('No verified quarterly announcements');
 output={schemaVersion:1,status:failed||items.some(item=>item.stale)?'partial':'ok',attemptedAt,collectedAt:attemptedAt,period,scope:'domestic-consensus',coverage:{provided:latest.length,collected:items.length,failed,outside},chartCollectedAt:screen.collectedAt||null,items};
 if (validEarnings(previous)) {
  for (const old of previous.items) if (!items.some(item=>item.id===old.id) && now-Date.parse(old.announcedOn)<60*86400000 && latest.some(item=>item.symbol===old.symbol && item.basis===old.basis)) output.items.push({...old,stale:true,chart:null});
 }
} catch (error) {
 console.log('Earnings source unavailable; retaining previous snapshot ('+error.message+').');
 output=validEarnings(previous)?{...previous,status:'stale',attemptedAt,items:previous.items.map(item=>({...item,stale:true,chart:null}))}:{schemaVersion:1,status:'unavailable',attemptedAt,collectedAt:null,items:[]};
}
const usCache=await read(CACHE+'/us-companies.json',{});
const us=await collectUsEarnings({previous:previousAll,charts:screen.items||[],cache:usCache,request,now});
const kr=output;
const metadata=feed=>({status:feed.status,collectedAt:feed.collectedAt,attemptedAt:feed.attemptedAt,period:feed.period,scope:feed.scope,coverage:feed.coverage});
const anyFresh=[kr,us].some(feed=>['ok','partial'].includes(feed.status));
output={schemaVersion:1,status:[kr,us].every(feed=>feed.status==='ok')?'ok':anyFresh?'partial':kr.items.length||us.items.length?'stale':'unavailable',
 attemptedAt,collectedAt:anyFresh?attemptedAt:previousAll?.collectedAt||null,scope:'kr-consensus-us-representative',chartCollectedAt:screen.collectedAt||null,
 markets:{KR:metadata(kr),US:metadata(us)},
 coverage:{provided:(kr.coverage?.provided||0)+us.coverage.provided,collected:(kr.coverage?.collected||0)+us.coverage.collected,failed:(kr.coverage?.failed||0)+us.coverage.failed},
 items:[...kr.items,...us.items]};
if (!validEarnings(output)) throw Error('Invalid earnings publication');
await writeFile(CACHE+'/us-companies.json',JSON.stringify(usCache));
await writeFile(CACHE+'/publish.json.tmp',JSON.stringify(output));
await rename(CACHE+'/publish.json.tmp',CACHE+'/publish.json');
await writeFile(CACHE+'/companies.json',JSON.stringify(companies));
console.log(JSON.stringify({status:output.status,period:output.period,count:output.items.length,coverage:output.coverage}));
