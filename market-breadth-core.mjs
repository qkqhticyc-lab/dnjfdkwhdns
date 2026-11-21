const finite=Number.isFinite;
const nyDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
export const BREADTH_PERIODS=[20,50,200];
export const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&finite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
export function constituentSymbols(html){
 const table=html.split('id="constituents"')[1]?.split('</table>')[0];if(!table)throw Error('Constituent table missing');
 const symbols=[...table.matchAll(/<tr[^>]*>([^]*?)<\/tr>/g)].slice(1).map(r=>r[1].match(/<td[^>]*>([^]*?)<\/td>/)?.[1].replace(/<[^>]*>/g,'').trim().replaceAll('.','-'));
 if(symbols.length<480||symbols.length>530||new Set(symbols).size!==symbols.length||symbols.some(s=>!s||!(/^[A-Z][A-Z0-9-]{0,12}$/).test(s)))throw Error('Invalid constituent list');return symbols;
}
export function priceRows(json,symbol,cutoff){
 const r=json.chart?.result?.[0],q=r?.indicators?.quote?.[0];if(r?.meta?.symbol?.toUpperCase()!==symbol.toUpperCase()||!q||!Array.isArray(r.timestamp))throw Error('Invalid price identity');
 const adjusted=r.indicators.adjclose?.[0]?.adjclose,rows=new Map();
 for(let i=0;i<r.timestamp.length;i++){
  const date=nyDate.format(new Date(r.timestamp[i]*1000));
  if(date>cutoff)continue;const close=q.close[i],adj=adjusted?.[i];
  if(finite(close)&&close>0)rows.set(date,{date,close,adjusted:finite(adj)&&adj>0?adj:null});
 }return [...rows.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function aggregateBreadth(histories,calendar,total,{minCoverage=.95}={}){
 const counters=new Map(calendar.map(date=>[date,Object.fromEntries(BREADTH_PERIODS.map(n=>[n,{above:0,eligible:0}]))]));
 for(const rows of histories){
  const byDate=new Map(rows.map(p=>[p.date,p.adjusted])),window=[];
  for(const date of calendar){
   const value=byDate.get(date);if(!finite(value)||value<=0){window.length=0;continue;}
   window.push(value);if(window.length>200)window.shift();
   for(const n of BREADTH_PERIODS)if(window.length>=n){const bucket=counters.get(date)[n],average=window.slice(-n).reduce((a,b)=>a+b,0)/n;bucket.eligible++;if(value>average)bucket.above++;}
  }
 }
 return calendar.map(date=>({date,...Object.fromEntries(BREADTH_PERIODS.map(n=>{const b=counters.get(date)[n];return ['ma'+n,{...b,total,value:b.eligible>=Math.ceil(total*minCoverage)?b.above/b.eligible*100:null}];}))}));
}
export function nyseCounts(payload,cutoff){
 const x=payload?.nyse;if(!x||![x.dates,x.adv,x.dec].every(Array.isArray)||x.adv.length!==x.dates.length||x.dec.length!==x.dates.length)throw Error('Invalid NYSE count history');
 const rows=x.dates.map((date,i)=>({date,adv:x.adv[i],dec:x.dec[i]}));
 if(rows.some((p,i)=>!validDay(p.date)||!Number.isInteger(p.adv)||!Number.isInteger(p.dec)||p.adv<0||p.dec<0||p.adv+p.dec<=0||p.adv+p.dec>20000||(i&&p.date<=rows[i-1].date)))throw Error('Invalid NYSE observations');
 return rows.filter(p=>p.date<=cutoff);
}
export function zweig(rows,calendar){
 const map=new Map(rows.map(p=>[p.date,p])),result=[];let seed=[],ema=null,sessions=0,setup=-1;
 for(let i=0;i<calendar.length;i++){
  const date=calendar[i],p=map.get(date);
  if(!p){seed=[];ema=null;sessions=0;setup=-1;result.push({date,value:null,sessions:0,signal:false});continue;}
  const ratio=p.adv/(p.adv+p.dec);sessions++;
  if(ema==null){seed.push(ratio);if(seed.length===10)ema=seed.reduce((a,b)=>a+b,0)/10;}else ema+=2/11*(ratio-ema);
  let signal=false;if(ema!=null){if(ema<.4)setup=i;else if(ema>.615&&setup>=0&&i-setup<=10){signal=sessions>=30;setup=-1;}else if(setup>=0&&i-setup>10)setup=-1;}
  result.push({date,value:ema,sessions,approximate:sessions<30,signal});
 }return result;
}
export function validateBreadth(d){
 if(d?.schemaVersion!==1||!validDay(d.asOf)||!Array.isArray(d.prices)||!Array.isArray(d.breadth)||!Array.isArray(d.zbt)||!Array.isArray(d.nyseRaw))return false;
 for(const key of ['prices','breadth','zbt','nyseRaw'])if(d[key].some((p,i)=>!validDay(p.date)||p.date>d.asOf||(i&&p.date<=d[key][i-1].date)))return false;
 return d.prices.length>0&&d.prices.every(p=>finite(p.SPY)&&p.SPY>0&&finite(p.RSP)&&p.RSP>0)&&d.breadth.every(p=>BREADTH_PERIODS.every(n=>{const b=p['ma'+n];return b&&Number.isInteger(b.eligible)&&Number.isInteger(b.above)&&b.above>=0&&b.above<=b.eligible&&(b.value===null||finite(b.value)&&b.value>=0&&b.value<=100);}))&&d.zbt.every(p=>p.value===null||finite(p.value)&&p.value>=0&&p.value<=1);
}
export function normalizedPrices(rows){
 const first=rows.find(p=>p.SPY>0&&p.RSP>0);return first?rows.map(p=>({...p,SPY:p.SPY/first.SPY*100,RSP:p.RSP/first.RSP*100})):[];
}
