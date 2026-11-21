import {assess,completed,nyClock,parseYahoo,parseCboe,structure,formatReport} from './core.mjs';
export const LATEST_SYMBOLS={VIX:'^VIX',VIX3M:'^VIX3M',VIX6M:'^VIX6M',VIX9D:'^VIX9D',VVIX:'^VVIX',SKEW:'^SKEW',MOVE:'^MOVE',DXY:'DX-Y.NYB',SPX:'^GSPC'};
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
export async function collectLatest({fetcher=fetch,now=new Date()}={}){
 const quotes={};let spx=[];
 await Promise.all(Object.entries(LATEST_SYMBOLS).map(async([id,symbol])=>{
  try{
   const cboe=!['SPX','MOVE','DXY'].includes(id);
   const historyURL=cboe?`https://cdn.cboe.com/api/global/us_indices/daily_prices/${id}_History.csv`:'https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range=2y&interval=1d';
   const [r,h]=await Promise.all([fetcher('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range=1d&interval=5m',{signal:AbortSignal.timeout(12000)}),fetcher(historyURL,{signal:AbortSignal.timeout(12000)})]);
   if(!r.ok)throw Error('Quote unavailable');const quote=parseLatest(await r.json(),now);
   const history=h.ok?(cboe?parseCboe(await h.text()):parseYahoo(await h.json())):[];
   // Provider meta previousClose can refer to a different baseline. Use the
   // same canonical preceding daily close as the scheduled report instead.
   quote.previous=history.filter(p=>p.date<quote.date).at(-1)?.close??null;
   quotes[id]=quote;if(id==='SPX')spx=history;
  }catch{}
 }));
 return assessLatest(quotes,spx,{now});
}
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const kst=at=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(at));
export function formatLatest(report){
 let message=formatReport(report).replace('시장 리스크 보드 · 미국 마감','시장 리스크 보드 · 요청 조회').replace('미국 거래일 · 종가 기준','미국 거래일 · 제공처 최신 시세');
 const times=Object.entries(LATEST_SYMBOLS).map(([id])=>`${id}: ${report.quotes[id]?kst(report.quotes[id].at):'미확인'}`).join('\n');
 const header=`조회: ${kst(report.collectedAt)} KST\n${report.inSession?'장중 잠정 판정입니다. 제공처 시세 지연이 있을 수 있습니다.':'정규장 시간 외입니다. 지표별 마지막 제공값을 표시합니다.'}\n구조 지표: ${report.technicalAsOf||'미확인'} 마감 기준\n`;
 message=message.replace('\n\n<b>', '\n'+esc(header)+'\n<b>');
 message=message.replace('<b>④ 실제 주가 흐름 · S&amp;P 500</b>','<b>④ 최근 마감봉 구조 · S&amp;P 500</b>');
 return message+'\n\n<b>각 시세의 제공 시각 · KST</b>\n'+esc(times);
}
