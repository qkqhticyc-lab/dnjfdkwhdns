export const SHORT_SOURCE='https://data.krx.co.kr/comm/srt/srtLoader/index.cmd?screenId=MDCSTAT305';
export const OPTIONS_SOURCE='https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/volume-query';
export const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const finite=Number.isFinite,num=s=>typeof s==='number'?s:typeof s==='string'&&/^\d+(?:\.\d+)?$/.test(s.replaceAll(',','').trim())?Number(s.replaceAll(',','')):null;
export function parseShortRows(payload,date,market){
 if(!dateOK(date)||!['KOSPI','KOSDAQ'].includes(market)||!Array.isArray(payload?.OutBlock_1))throw Error('Invalid short-balance source');
 const rows=[],seen=new Set();let missing=0,invalid=0;
 for(const p of payload.OutBlock_1){const symbol=String(p.ISU_CD||''),quantity=num(p.BAL_QTY),amount=num(p.BAL_AMT),listed=num(p.LIST_SHRS),ratio=num(p.BAL_RTO);
  if(quantity==null||amount==null){missing++;continue;}
  if(!/^[A-Z0-9]{6}$/.test(symbol)||typeof p.ISU_ABBRV!=='string'||!p.ISU_ABBRV.trim()||![quantity,amount,listed,ratio].every(finite)||quantity<0||amount<0||listed<=0||ratio<0||Math.abs(quantity/listed*100-ratio)>.021){invalid++;continue;}
  if(seen.has(symbol))throw Error('Duplicate short-balance identity');seen.add(symbol);rows.push({symbol,name:p.ISU_ABBRV.trim().slice(0,100),market,quantity,amount,listed,ratio});
 }
 if(invalid>Math.max(2,payload.OutBlock_1.length*.05))throw Error('Short-balance data quality failure');
 return{date,market,rows,missing,invalid,total:payload.OutBlock_1.length};
}
export function mergeShortDay(date,markets){if(markets.length!==2||new Set(markets.map(p=>p.market)).size!==2||markets.some(p=>p.date!==date||p.rows.length<100))throw Error('Incomplete market-wide short snapshot');const rows=markets.flatMap(p=>p.rows);return{date,rows,totals:Object.fromEntries(markets.map(p=>[p.market,p.rows.reduce((sum,r)=>sum+r.amount,0)])),coverage:markets.map(({rows,...p})=>({...p,valid:rows.length}))};}
function csvLine(line){const out=[];let s='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){s+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(s);s='';}else s+=c;}out.push(s);if(q)throw Error('Malformed OCC CSV');return out;}
export function parseOccVolume(text,date){
 if(!dateOK(date))throw Error('Invalid OCC date');const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);if(lines.shift()!=='quantity,underlying,symbol,actype,porc,exchange,actdate')throw Error('Unexpected OCC report format');
 const rows=new Map(),seen=new Map();let records=0;
 for(const line of lines){if(!line.trim())continue;const fields=csvLine(line);if(fields.length===8&&fields[7]==='')fields.pop();if(fields.length!==7)throw Error('Unexpected OCC columns');const[q,underlying,symbol,type,side,exchange,rawDate]=fields,match=rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/),asOf=match?match[3]+'-'+match[1].padStart(2,'0')+'-'+match[2].padStart(2,'0'):null,quantity=num(q);
  if(asOf!==date||!finite(quantity)||!Number.isSafeInteger(quantity)||quantity<0||!underlying||underlying.length>30||!symbol||!['C','F','M'].includes(type)||!['C','P'].includes(side)||!exchange)throw Error('Invalid OCC row or requested date mismatch');
  const key=JSON.stringify([underlying,symbol,type,side,exchange]);if(seen.has(key)){if(seen.get(key)!==quantity)throw Error('Conflicting duplicate OCC row');continue;}seen.set(key,quantity);records++;
  const p=rows.get(underlying)||{symbol:underlying,callSides:0,putSides:0};p[side==='C'?'callSides':'putSides']+=quantity;rows.set(underlying,p);
 }
 // OCC reports contract sides across C/F/M accounts. One executed contract has two sides.
 const values=[...rows.values()].map(p=>{if(p.callSides%2||p.putSides%2)throw Error('Incomplete two-sided OCC report');return{symbol:p.symbol,call:p.callSides/2,put:p.putSides/2};});
 return{date,rows:values,records,totalCall:values.reduce((n,p)=>n+p.call,0),totalPut:values.reduce((n,p)=>n+p.put,0)};
}
export function buildShortMonitor(days,now=new Date()){
 days=[...days].sort((a,b)=>a.date.localeCompare(b.date));if(days.length<2)throw Error('Insufficient short-balance comparison history');const last=days.at(-1),previous=days.at(-2),five=days.at(-6),before=new Map(previous.rows.map(p=>[p.symbol,p])),week=new Map((five?.rows||[]).map(p=>[p.symbol,p]));
 const rows=last.rows.map(p=>{const prev=before.get(p.symbol),f=week.get(p.symbol),comparable=!!prev,shareChange=prev?Math.abs(p.listed/prev.listed-1)>.01:false,delta=comparable?p.quantity-prev.quantity:null,percent=comparable&&prev.quantity>0?delta/prev.quantity*100:null;return{...p,previous:prev?.quantity??null,delta,percent,ratioChange:prev?p.ratio-prev.ratio:null,fiveDelta:f?p.quantity-f.quantity:null,fivePercent:f?.quantity>0?(p.quantity/f.quantity-1)*100:null,shareChange,fiveShareChange:f?Math.abs(p.listed/f.listed-1)>.01:false,compared:comparable,newBalance:comparable&&prev.quantity===0&&p.quantity>0};});
 return{status:'ok',asOf:last.date,previousDate:previous.date,fiveDate:five?.date||null,collectedAt:now.toISOString(),source:SHORT_SOURCE,scope:'KOSPI·KOSDAQ 공개 순보유잔고 전종목',totals:last.totals,previousTotals:previous.totals,coverage:last.coverage,rows,points:days.map(d=>({date:d.date,...d.totals}))};
}
export function filterShortRows(rows,{query='',market='ALL',surgeOnly=true,minAmount=1e9,minPercent=20,minDelta=10000,period='1'}={}){return rows.filter(p=>(market==='ALL'||p.market===market)&&(!query||[p.symbol,p.name].some(s=>s.toLowerCase().includes(query.toLowerCase())))&&p.amount>=minAmount&&(!surgeOnly||!(period==='5'?p.fiveShareChange:p.shareChange)&&p.compared&&(period==='5'?(p.fivePercent>=minPercent&&p.fiveDelta>=minDelta):(p.newBalance||p.percent>=minPercent)&&p.delta>=minDelta)));}
export function buildOptionsMonitor(days,catalog=[],now=new Date()){
 days=[...days].sort((a,b)=>a.date.localeCompare(b.date));if(!days.length)throw Error('No OCC daily data');const last=days.at(-1),prior=days.slice(-21,-1),maps=prior.map(p=>new Map(p.rows.map(r=>[r.symbol,r]))),names=new Map(catalog.filter(p=>p.market==='US').map(p=>[p.symbol,p]));
 const rows=last.rows.map(p=>{const previous=maps.map(m=>m.get(p.symbol)),available=previous.filter(Boolean),n=available.length,complete=n===20&&prior.length===20,averageCall=complete?available.reduce((n,p)=>n+p.call,0)/20:null,averagePut=complete?available.reduce((n,p)=>n+p.put,0)/20:null,info=names.get(p.symbol);return{...p,name:info?.name||p.symbol,exchange:info?.exchange||null,total:p.call+p.put,putCall:p.call>0?p.put/p.call:null,historyDays:n,averageCall,averagePut,callMultiple:averageCall>0?p.call/averageCall:null,putMultiple:averagePut>0?p.put/averagePut:null};});
 return{status:'ok',asOf:last.date,collectedAt:now.toISOString(),source:OPTIONS_SOURCE,scope:'OCC 주식·ETF 옵션 전체 기초자산 · 전체 계정(C/F/M)',unit:'계약 (OCC 사이드 합계 ÷ 2)',baselineDates:prior.map(p=>p.date),rows,totalCall:last.totalCall,totalPut:last.totalPut,records:last.records,points:days.map(d=>({date:d.date,call:d.totalCall,put:d.totalPut}))};
}
export function optionSideSurge(p,side,multiple=2,minSide=5000){const avg=p[side==='call'?'averageCall':'averagePut'],ratio=p[side==='call'?'callMultiple':'putMultiple'];return p.historyDays===20&&avg>=500&&p[side]>=minSide&&ratio>=multiple;}
export function filterOptionsRows(rows,{query='',side='ALL',surgeOnly=true,minTotal=10000,multiple=2}={}){return rows.filter(p=>(!query||[p.symbol,p.name].some(s=>s.toLowerCase().includes(query.toLowerCase())))&&p.total>=minTotal&&(!surgeOnly||(side==='call'?optionSideSurge(p,'call',multiple):side==='put'?optionSideSurge(p,'put',multiple):optionSideSurge(p,'call',multiple)||optionSideSurge(p,'put',multiple))));}
export function validMonitorPart(p,kind){
 if(!p||!['ok','stale','unavailable'].includes(p.status))return false;if(p.status==='unavailable')return Array.isArray(p.rows)&&!p.rows.length;
 if(!dateOK(p.asOf)||!finite(Date.parse(p.collectedAt))||!Array.isArray(p.rows)||!p.rows.length||!Array.isArray(p.points)||!p.points.length||p.points.at(-1).date!==p.asOf||!p.points.every((p,i,a)=>dateOK(p.date)&&(!i||a[i-1].date<p.date))||new Set(p.rows.map(r=>r.symbol)).size!==p.rows.length)return false;
 const nonnegative=v=>finite(v)&&v>=0,nullable=v=>v===null||finite(v);
 if(kind==='kr')return dateOK(p.previousDate)&&p.previousDate<p.asOf&&(p.fiveDate===null||dateOK(p.fiveDate)&&p.fiveDate<p.previousDate)&&['KOSPI','KOSDAQ'].every(k=>nonnegative(p.totals?.[k]))&&p.points.every(r=>['KOSPI','KOSDAQ'].every(k=>nonnegative(r[k])))&&p.rows.every(r=>/^[A-Z0-9]{6}$/.test(r.symbol)&&typeof r.name==='string'&&['KOSPI','KOSDAQ'].includes(r.market)&&[r.quantity,r.amount,r.ratio].every(nonnegative)&&r.listed>0&&['previous','delta','percent','fiveDelta','fivePercent'].every(k=>nullable(r[k])));
 return ['totalCall','totalPut'].every(k=>nonnegative(p[k]))&&Array.isArray(p.baselineDates)&&p.baselineDates.length<=20&&p.baselineDates.every((d,i,a)=>dateOK(d)&&d<p.asOf&&(!i||a[i-1]<d))&&p.points.every(r=>nonnegative(r.call)&&nonnegative(r.put))&&p.rows.every(r=>typeof r.symbol==='string'&&typeof r.name==='string'&&[r.call,r.put,r.total].every(nonnegative)&&r.total===r.call+r.put&&Number.isInteger(r.historyDays)&&r.historyDays>=0&&r.historyDays<=20&&['averageCall','averagePut','callMultiple','putMultiple','putCall'].every(k=>r[k]===null||nonnegative(r[k])));
}
export function validatePositionMonitor(d){return d?.schemaVersion===1&&validMonitorPart(d.kr,'kr')&&validMonitorPart(d.us,'us');}
export function retainMonitorPart(previous,now=new Date()){return{...previous,status:previous.status==='unavailable'?'unavailable':'stale',lastAttemptAt:now.toISOString()};}
