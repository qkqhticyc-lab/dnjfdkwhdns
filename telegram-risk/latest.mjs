import {assess,completed,nyClock,parseYahoo,parseCboe,structure,formatReport} from './core.mjs';
export const LATEST_SYMBOLS={VIX:'^VIX',VIX3M:'^VIX3M',VIX6M:'^VIX6M',VIX9D:'^VIX9D',VVIX:'^VVIX',SKEW:'^SKEW',MOVE:'^MOVE',DXY:'DX-Y.NYB',SPX:'^GSPC'};
// Share provider backoff across requests in a warm isolate. Never retry a 429
// through alternate hosts or proxies. Delayed quotes use a separate provider.
let yahooBlockedUntil=0;
export function parseNaver(json,now=new Date()){
 const number=v=>Number(String(v??'').replace(/,/g,'')),value=number(json.closePrice),delta=number(json.compareToPreviousClosePrice),at=new Date(json.localTradedAt);
 if(!(value>0)||!Number.isFinite(at.getTime())||at>now.getTime()+60000)throw Error('Invalid Naver quote');
 const previous=value-delta;
 return {value,previous:previous>0?previous:null,at:at.toISOString(),date:nyClock(at).date,source:'Naver',delayMinutes:Number(json.delayTime)||0};
}
export function parseLatest(json,now=new Date()){
 const m=json.chart?.result?.[0]?.meta,at=m?.regularMarketTime*1000;
 if(!(m?.regularMarketPrice>0)||!Number.isFinite(at)||at>now.getTime()+60000)throw Error('Invalid quote');
 const previous=m.previousClose??m.chartPreviousClose;
 return {value:m.regularMarketPrice,previous:previous>0?previous:null,at:new Date(at).toISOString(),date:nyClock(new Date(at)).date};
}
export function assessLatest(quotes,closedSpx,{now=new Date()}={}){
 const series={};
 for(const [id,q] of Object.entries(quotes)){
  const d=new Date(q.date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);
  series[id]=[...(q.previous>0?[{date:d.toISOString().slice(0,10),close:q.previous}]:[]),{date:q.date,close:q.value}];
 }
 const bars=completed(closedSpx,now),technical=bars.length?structure(bars,bars.at(-1).date):null;
 const report=assess(series,{now,includeCurrent:true,technicalOverride:technical});
 const clock=nyClock(now),weekDay=new Date(clock.date+'T12:00:00Z').getUTCDay();
 const inSession=weekDay>0&&weekDay<6&&clock.minutes>=9*60+30&&clock.minutes<=16*60+15;
 // Slow SKEW and other daily-only readings must never masquerade as current data.
 const tooOld=inSession?Object.keys(LATEST_SYMBOLS).filter(id=>!quotes[id]||now-new Date(quotes[id].at)>30*60000):[];
 if(tooOld.length){report.stage='warning';report.missing=[...new Set([...report.missing,...tooOld.map(id=>id+' 시세 지연')])];}
 const noPrevious=Object.entries(quotes).filter(([,q])=>!(q.previous>0)).map(([id])=>id+' 전일 종가 미확인');
 if(noPrevious.length){report.stage='warning';report.missing=[...new Set([...report.missing,...noPrevious])];}
 return {...report,mode:'latest',quotes,inSession,technicalAsOf:technical?.date||null};
}
export async function collectLatest({fetcher=fetch,now=new Date(),archive=null,backoff=true}={}){
 const quotes={},displayQuotes={},sourceErrors=[];let spx=[];const deadline=Date.now()+18000;
 const yahoo=async url=>{
  if(backoff&&Date.now()<yahooBlockedUntil)throw Error('Provider cooldown after HTTP 429');
  const remaining=deadline-Date.now();if(remaining<=0)throw Error('Quote time budget exceeded');
  const r=await fetcher(url,{signal:AbortSignal.timeout(Math.min(8000,remaining))});
  if(r.status===429&&backoff){const retry=Number(r.headers?.get?.('retry-after'));yahooBlockedUntil=Date.now()+Math.max(600000,Number.isFinite(retry)?retry*1000:0);}
  if(!r.ok)throw Error('HTTP '+r.status);return r;
 };
 // Sequential quote requests stop immediately when this shared provider limits
 // us. Histories and fallback quotes are isolated from each other's failures.
 for(const [id,symbol] of Object.entries(LATEST_SYMBOLS)){
  try{const r=await yahoo('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range=1d&interval=5m');quotes[id]={...parseLatest(await r.json(),now),source:'Yahoo Finance'};}
  catch(e){sourceErrors.push({id,part:'quote',reason:String(e.message).slice(0,120)});}
 }
 await Promise.all(Object.entries(LATEST_SYMBOLS).map(async([id,symbol])=>{
  let history=[];
  try{
   const cboe=!['SPX','MOVE','DXY'].includes(id),url=cboe?`https://cdn.cboe.com/api/global/us_indices/daily_prices/${id}_History.csv`:'https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range=2y&interval=1d';
   const r=cboe?await fetcher(url,{signal:AbortSignal.timeout(8000)}):await yahoo(url);
   if(!r.ok)throw Error('HTTP '+r.status);history=cboe?parseCboe(await r.text()):parseYahoo(await r.json());
   if(id==='SPX')spx=history;
   if(quotes[id]){const previous=history.filter(p=>p.date<quotes[id].date).at(-1)?.close;if(previous>0)quotes[id].previous=previous;}
  }catch(e){sourceErrors.push({id,part:'history',reason:String(e.message).slice(0,120)});}
  if(!quotes[id]&&['VIX','SPX'].includes(id)){
   try{const r=await fetcher('https://api.stock.naver.com/index/'+(id==='VIX'?'.VIX':'.INX')+'/basic',{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('HTTP '+r.status);quotes[id]=parseNaver(await r.json(),now);}
   catch(e){sourceErrors.push({id,part:'fallback',reason:String(e.message).slice(0,120)});}
  }
  const last=completed(history,now).at(-1),previous=history.filter(p=>p.date<last?.date).at(-1);
  if(quotes[id])displayQuotes[id]=quotes[id];
  else if(last)displayQuotes[id]={value:last.close,previous:previous?.close,date:last.date,source:'Cboe daily CSV',basis:'close'};
  else if(archive?.values?.[id]?.value>0){const v=archive.values[id];displayQuotes[id]={value:v.value,previous:Number.isFinite(v.change)?v.value/(1+v.change/100):null,date:v.date,source:'Last verified close',basis:'close'};}
 }));
 const report=assessLatest(quotes,spx,{now});
 if(!spx.length&&archive?.technical)report.technicalAsOf=archive.technical.date;
 return {...report,displayQuotes,sourceErrors,archive,partial:report.stage==='warning'};
}
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const kst=at=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(at));
export function formatLatest(report){
 if(report.partial){
  const q=report.displayQuotes||report.quotes,rows=Object.keys(LATEST_SYMBOLS).map(id=>{const p=q[id];return `${id.padEnd(6)} ${p?p.value.toFixed(2).padStart(8):'미확인'.padStart(8)} ${p?.basis==='close'?(p.date.slice(5)+' 마감'):p?.at?kst(p.at):'미확인'}`;});
  const archive={...report.archive},stale=Date.parse(nyClock(new Date(report.collectedAt)).date)-Date.parse(archive.asOf)>4*86400000;
  if(stale){archive.stage='warning';archive.stale=true;}
  const prior=report.archive?formatReport(archive).replace('시장 리스크 보드 · 미국 마감','최근 정상 수집된 마감 판정'):'';
  return `<b>시장 리스크 보드 · 요청 조회</b>\n조회: ${esc(kst(report.collectedAt))} KST\n\n<b>⚠️ 현재 위험 단계는 판정 보류</b>\n일부 장중 시세를 받지 못했습니다. 아래 값은 지표별 최신 제공값이며 같은 시각의 값이 아닙니다.\n\n<pre>${esc(['지표         값  제공시각·KST',...rows].join('\n'))}</pre>\n‘마감’은 해당 미국 거래일의 종가입니다. 장중 시세도 제공처 지연이 있을 수 있습니다.\n\n${prior?'<b>아래 판정은 과거 마감 기준이며 현재 판정이 아닙니다.</b>\n'+prior:'최근 정상 마감 자료도 아직 없습니다. 자료 확보 후 다시 조회해주세요.'}`;
 }
 let message=formatReport(report).replace('시장 리스크 보드 · 미국 마감','시장 리스크 보드 · 요청 조회').replace('미국 거래일 · 종가 기준','미국 거래일 · 제공처 최신 시세');
 const times=Object.entries(LATEST_SYMBOLS).map(([id])=>`${id}: ${report.quotes[id]?kst(report.quotes[id].at):'미확인'}`).join('\n');
 const header=`조회: ${kst(report.collectedAt)} KST\n${report.inSession?'장중 잠정 판정입니다. 제공처 시세 지연이 있을 수 있습니다.':'정규장 시간 외입니다. 지표별 마지막 제공값을 표시합니다.'}\n구조 지표: ${report.technicalAsOf||'미확인'} 마감 기준\n`;
 message=message.replace('\n\n<b>', '\n'+esc(header)+'\n<b>');
 message=message.replace('<b>④ 실제 주가 흐름 · S&amp;P 500</b>','<b>④ 최근 마감봉 구조 · S&amp;P 500</b>');
 return message+'\n\n<b>각 시세의 제공 시각 · KST</b>\n'+esc(times);
}
