import{readFile,writeFile,mkdir}from'node:fs/promises';
import{gunzipSync}from'node:zlib';
import{constituentSymbols,priceRows,aggregateBreadth,nyseCounts,zweig,validateBreadth,breadthCutoff}from'../market-breadth-core.mjs';
const now=new Date();let cutoff=breadthCutoff(now);
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error('Source HTTP '+r.status);return r;}
async function history(symbol){return priceRows(await(await get('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range=5y&interval=1d')).json(),symbol,cutoff);}
async function updateNYSE(old,asOf){let raw=old||[],nyseError=false;try{const payload=await(await get('https://charts.allofthesewords.com/zweig-breadth-thrust-data.json')).json(),fresh=nyseCounts(payload,asOf),map=new Map(raw.map(p=>[p.date,p]));for(const p of fresh)map.set(p.date,p);raw=[...map.values()].filter(p=>p.date<=asOf).sort((a,b)=>a.date.localeCompare(b.date));}catch{nyseError=true;}return{raw,nyseError};}
let previous;for(const source of['data/market-breadth.seed.json.gz','data/market-breadth.json','published'])try{const d=source==='published'?await(await get('https://qkqhticyc-lab.github.io/dnjfdkwhdns/data/market-breadth.json')).json():source.endsWith('.gz')?JSON.parse(gunzipSync(await readFile(source)).toString('utf8')):JSON.parse(await readFile(source,'utf8'));if(validateBreadth(d)&&(!previous||d.asOf>previous.asOf||d.asOf===previous.asOf&&d.collectedAt>previous.collectedAt))previous=d;}catch{}
await mkdir('data',{recursive:true});
try{
 const spyRaw=await(await get('https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=5y&interval=1d')).json();cutoff=breadthCutoff(now,spyRaw.chart?.result?.[0]?.meta);
 const [spy,rsp]=[priceRows(spyRaw,'SPY',cutoff),await history('RSP')],rspMap=new Map(rsp.map(p=>[p.date,p.close]));
 const prices=spy.filter(p=>rspMap.has(p.date)).map(p=>({date:p.date,SPY:p.close,RSP:rspMap.get(p.date)})),asOf=prices.at(-1)?.date;if(!asOf)throw Error('No ETF history');
 if(previous?.asOf>asOf)throw Error('Price provider returned an older session');
 const nyse=await updateNYSE(previous?.nyseRaw,asOf);
 if(previous?.asOf===asOf&&previous.coverage?.ratio>=.98){const result={...previous,nyseRaw:nyse.raw,zbt:zweig(nyse.raw,spy.map(p=>p.date)),nyseError:nyse.nyseError,refreshError:false};if(!validateBreadth(result))throw Error('Invalid refreshed NYSE history');await writeFile('data/market-breadth.json',JSON.stringify(result));console.log('Market breadth already current; NYSE checked:',asOf);process.exit(0);}
 const symbols=constituentSymbols(await(await get('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies')).text()),histories=[];let next=0,failed=0;
 await Promise.all(Array.from({length:8},async()=>{while(next<symbols.length){const symbol=symbols[next++];try{histories.push(await history(symbol));}catch{failed++;}if((histories.length+failed)%100===0)console.log('Breadth histories',histories.length,'failed',failed);}}));
 if(histories.length/symbols.length<.95)throw Error('Insufficient constituent coverage');
 const calendar=spy.map(p=>p.date),breadth=aggregateBreadth(histories,calendar,symbols.length);if(breadth.at(-1)?.ma200.value==null)throw Error('Insufficient current breadth coverage');
 const {raw,nyseError}=nyse;
 const result={schemaVersion:1,asOf,collectedAt:now.toISOString(),coverage:{total:symbols.length,loaded:histories.length,failed,ratio:histories.length/symbols.length},universeAsOf:asOf,prices,breadth,zbt:zweig(raw,calendar),nyseRaw:raw,nyseError,sources:{prices:'Yahoo Finance SPY/RSP daily close',breadth:'Current S&P 500 constituents (Wikipedia), Yahoo adjusted daily closes; own calculation',nyse:'WSJ/Dow Jones NYSE count archive via charts.allofthesewords.com; own EMA(10) calculation'}};
 if(!validateBreadth(result))throw Error('Invalid breadth output');await writeFile('data/market-breadth.json',JSON.stringify(result));console.log('Market breadth collected',asOf,result.coverage,'NYSE since',raw[0]?.date,'to',raw.at(-1)?.date);
}catch(e){if(!previous)throw e;await writeFile('data/market-breadth.json',JSON.stringify({...previous,refreshError:true,attemptedAt:now.toISOString()}));console.log('Market breadth source unavailable; preserving snapshot date',previous.asOf,'reason:',e.message);}
