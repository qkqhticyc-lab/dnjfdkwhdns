import{analyzeStrategy}from'./strategy-core.mjs';
import{liveDailyRows}from'./live-chart-core.mjs';
import{entrySnapshot}from'./entry-snapshot.mjs';
export const SCREEN_GROUPS=[{market:'KR',exchange:'KOSPI',label:'코스피'},{market:'KR',exchange:'KOSDAQ',label:'코스닥'},{market:'US',exchange:'NASDAQ',label:'나스닥'},{market:'US',exchange:'NYSE',label:'뉴욕'},{market:'US',exchange:'AMEX',label:'아멕스'},{market:'JP',exchange:'TOKYO',label:'도쿄'}];
const currency={KR:'KRW',US:'USD',JP:'JPY'},zones={KR:'Asia/Seoul',US:'America/New_York',JP:'Asia/Tokyo'};
export function screenRow(item,bars,now=new Date()){
 const rows=liveDailyRows({...item,timezone:zones[item.market],bars,collectedAt:now.toISOString()},now).filter(p=>!p.provisional);
 if(rows.length<60)throw Error('Insufficient closed history');const guide=analyzeStrategy(rows),last=guide.frames.at(-1),signal=entrySnapshot(guide,last.asOf),index=signal?guide.frames.findIndex(p=>p.asOf===signal.asOf):-1;
 return{...item,status:'ok',asOf:last.asOf,collectedAt:now.toISOString(),price:last.close,changePercent:(last.close/rows.at(-2).close-1)*100,rsi:last.rsi,volumeRatio:last.volumeRatio,trend:last.trend,signal:signal?{...signal,age:guide.frames.length-1-index}:null,state:signal?.status==='active'?'active':last.ema8>last.ema14&&last.ema14>last.ema21&&last.close>last.ema14?'setup':signal?.status==='closed'?'closed':'none'};
}
export function filterScreen(items,{market='ALL',query='',age=3,state='active',trend='ALL',volume=0}={}){
 return items.filter(p=>p.status==='ok'&&(market==='ALL'||p.market===market)&&(!query||[p.name,p.symbol].some(v=>v.toLowerCase().includes(query.toLowerCase())))&&(age==='all'||p.signal&&p.signal.age<(Number(age)===0?1:Number(age)))&&(state==='all'||p.state===state)&&(trend==='ALL'||p.trend===trend)&&(!volume||Number.isFinite(p.volumeRatio)&&p.volumeRatio>=volume));
}
export const screenKey=p=>p.market+':'+p.symbol;
export function shardFor(p,count){let h=0;for(const c of screenKey(p))h=(Math.imul(h,31)+c.charCodeAt(0))>>>0;return h%count;}
async function sourceJSON(fetcher,url){let error;for(let attempt=0;attempt<3;attempt++){try{const r=await fetcher(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Source HTTP '+r.status);return await r.json();}catch(e){error=e;if(attempt<2)await new Promise(r=>setTimeout(r,500*(attempt+1)));}}throw error;}
export async function listScreenUniverse(fetcher=fetch,now=new Date(),previous){
 const items=new Map(),coverage=[];
 for(const g of SCREEN_GROUPS){const base=g.market==='KR'?`https://m.stock.naver.com/api/stocks/marketValue/${g.exchange}`:`https://api.stock.naver.com/stock/exchange/${g.exchange}/marketValue`;
  try{let page=1,total=Infinity,seen=new Set(),found=new Map(),excluded=0;
   while((page-1)*100<total){
    const d=await sourceJSON(fetcher,base+`?page=${page}&pageSize=100`);
    if(!Array.isArray(d.stocks)||!Number.isInteger(d.totalCount)||d.totalCount<1||d.totalCount>100000||Number(d.page)!==page||Number(d.pageSize)!==100)throw Error('Invalid list metadata');
    total=Math.max(Number.isFinite(total)?total:0,d.totalCount);
    if(!d.stocks.length)throw Error('Unexpected empty page');
    let added=0;
    for(const stock of d.stocks){const providerSymbol=stock.reutersCode;if(typeof providerSymbol!=='string')throw Error('Missing listing identity');if(seen.has(providerSymbol))continue;seen.add(providerSymbol);added++;
     if(stock.stockEndType!=='stock'){excluded++;continue;}
     const symbol=stock.symbolCode||stock.itemCode;
     if(typeof symbol!=='string'||typeof stock.stockName!=='string'||!/^[A-Za-z0-9._^=-]{1,30}$/.test(providerSymbol))throw Error('Invalid stock identity');
     const item={market:g.market,exchange:g.label,group:g.exchange,symbol,providerSymbol,name:stock.stockName,currency:currency[g.market]};found.set(screenKey(item),item);
    }
    if(!added)throw Error('Repeated listing page');page++;
   }
   // A rank reshuffle must not silently turn a partial list into a full-universe claim.
   if(seen.size<total)throw Error('Listing changed during pagination; retry next scan');
   for(const [key,item]of found)items.set(key,item);
   coverage.push({...g,status:'ok',requested:found.size,listed:seen.size,excluded,pages:page-1,source:base,asOf:now.toISOString()});
  }catch(e){const old=previous?.items?.filter(p=>p.group===g.exchange)||[];for(const p of old)items.set(screenKey(p),{...p,status:'stale'});coverage.push({...g,status:'unavailable',requested:old.length,source:base,error:String(e.message).slice(0,120)});}
 }
 return{schemaVersion:1,universeScope:'all-provider-listed',collectedAt:now.toISOString(),coverage,items:[...items.values()].sort((a,b)=>screenKey(a).localeCompare(screenKey(b)))};
}
export async function collectScreener(fetcher=fetch,now=new Date(),previous,options={}){
 const universe=options.universe||await listScreenUniverse(fetcher,now,previous),shard=options.shard??0,shards=options.shards??1;
 if(!Number.isInteger(shards)||shards<1||!Number.isInteger(shard)||shard<0||shard>=shards)throw Error('Invalid shard');
 const items=universe.items.filter(p=>shardFor(p,shards)===shard),old=new Map((previous?.items||[]).map(p=>[screenKey(p),p]));let cursor=0,done=0;const results=Array(items.length);
 await Promise.all(Array.from({length:3},async()=>{while(cursor<items.length){const i=cursor++,s=items[i];if(s.status==='stale'){results[i]=s;continue;}
  try{const end=now.toISOString().slice(0,10).replaceAll('-','')+'2359',start=new Date(now.getTime()-730*86400000).toISOString().slice(0,10).replaceAll('-','')+'0000';
   const raw=await sourceJSON(fetcher,`https://api.stock.naver.com/chart/${s.market==='KR'?'domestic':'foreign'}/item/${encodeURIComponent(s.providerSymbol)}/day?startDateTime=${start}&endDateTime=${end}`);if(!Array.isArray(raw))throw Error('Missing daily history');
   const bars=raw.filter(p=>/^\d{8}$/.test(p.localDate)&&[p.openPrice,p.highPrice,p.lowPrice,p.closePrice].every(v=>Number.isFinite(v)&&v>0)).map(p=>({date:p.localDate.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'),open:p.openPrice,high:p.highPrice,low:p.lowPrice,close:p.closePrice,volume:p.accumulatedTradingVolume}));results[i]=screenRow(s,bars,now);
  }catch(e){const prior=old.get(screenKey(s));results[i]=prior?{...prior,...s,status:'stale',error:String(e.message).slice(0,120)}:{...s,status:'unavailable',error:String(e.message).slice(0,120)};}
  done++;if(done%100===0)options.onProgress?.({shard,done,total:items.length});
 }}));
 return{schemaVersion:1,rulesVersion:'independent-v3',universeScope:universe.universeScope,universeCollectedAt:universe.collectedAt,collectedAt:now.toISOString(),timeframe:'daily',coverage:universe.coverage,shard,shards,items:results};
}
export function mergeScreenShards(universe,parts,count){
 if(parts.length!==count||new Set(parts.map(p=>p.shard)).size!==count)throw Error('Incomplete shards');const merged=new Map();
 for(const part of parts){if(part.rulesVersion!=='independent-v3'||part.universeCollectedAt!==universe.collectedAt||part.shards!==count||part.shard<0||part.shard>=count)throw Error('Mismatched scan');for(const p of part.items){const key=screenKey(p);if(merged.has(key)||shardFor(p,count)!==part.shard)throw Error('Duplicate or wrong-shard stock');merged.set(key,p);}}
 if(merged.size!==universe.items.length||universe.items.some(p=>!merged.has(screenKey(p))))throw Error('Incomplete universe');
 return{schemaVersion:1,rulesVersion:'independent-v3',universeScope:universe.universeScope,collectedAt:universe.collectedAt,completedAt:new Date().toISOString(),timeframe:'daily',coverage:universe.coverage,items:universe.items.map(p=>merged.get(screenKey(p)))};
}
