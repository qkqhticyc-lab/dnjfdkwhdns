import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseNyseCalendar,parseFomcCalendar,economicCalendarItems,earningsCalendarItems,mergeUsCalendarItems,validUsMarketCalendar,calendarParts} from '../us-market-calendar-core.mjs';
import {shiftDay} from '../market-news-core.mjs';
const ROOT='.cache/us-calendar',SITE='https://qkqhticyc-lab.github.io/dnjfdkwhdns/',now=Date.now(),stamp=new Date(now).toISOString();
await mkdir(ROOT,{recursive:true});
async function read(file){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Calendar source HTTP '+r.status);return r.json();}
const seed=await read('data/us-calendar-official.json');let previous=await read(ROOT+'/publish.json');
try{const live=await json(SITE+'data/us-market-calendar.json');if(validUsMarketCalendar(live)&&(!previous||live.collectedAt>previous.collectedAt))previous=live;}catch{}
const [news,earnings]=await Promise.all([['.cache/news/publish.json','data/news.json'],['.cache/earnings/publish.json','data/earnings.json']].map(async([file,path])=>{const local=await read(file),at=d=>Date.parse(d?.attemptedAt||d?.collectedAt)||0;if(local&&now-at(local)<3600000)return local;const remote=await json(SITE+path).catch(()=>null);return at(remote)>at(local)?remote:local;}));
const sources=[],official=[];
await Promise.all([{id:'nyse',url:'https://www.nyse.com/markets/hours-calendars',parse:parseNyseCalendar,kinds:['holiday','earlyClose']},{id:'fed',url:'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',parse:parseFomcCalendar,kinds:['policy']}].map(async spec=>{
 const oldSource=(previous?.sources||seed?.sources||[]).find(s=>s.id===spec.id),oldItems=(previous?.items?.length?previous.items:seed?.items||[]).filter(p=>spec.kinds.includes(p.kind)&&(spec.id!=='fed'||p.source==='Federal Reserve'));
 if(oldItems.length&&now-Date.parse(oldSource?.fetchedAt)<6*3600000){sources.push({...oldSource,status:'ok'});official.push(...oldItems);return;}
 try{const r=await fetch(spec.url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);official.push(...spec.parse(await r.text()));sources.push({id:spec.id,status:'ok',fetchedAt:stamp,url:spec.url});}
 catch{official.push(...oldItems.map(p=>({...p,stale:true})));sources.push({id:spec.id,status:oldItems.length?'stale':'unavailable',fetchedAt:oldSource?.fetchedAt||null,url:spec.url});}
}));
const policy=(seed?.items||[]).filter(e=>e.source==='미 의회');sources.push(...(seed?.sources||[]).filter(s=>s.id==='policy'));
for(const[id,feed]of [['economic',news?.calendar],['earnings',earnings]])sources.push({id,status:feed?.status||'unavailable',fetchedAt:feed?.fetchedAt||feed?.collectedAt||null});
const date=calendarParts(now).date,from=shiftDay(date,-14),to=shiftDay(date,45),items=mergeUsCalendarItems([...official,...policy,...economicCalendarItems(news?.calendar),...earningsCalendarItems(earnings)]).filter(e=>e.date>=from&&e.date<=to);
const output={schemaVersion:1,collectedAt:stamp,from,to,sources,items};
if(!validUsMarketCalendar(output)||!items.length)throw Error('No usable US market calendar');
await writeFile(ROOT+'/publish.json',JSON.stringify(output));console.log('US calendar: '+items.length+' events, '+sources.map(s=>s.id+' '+s.status).join(', '));
