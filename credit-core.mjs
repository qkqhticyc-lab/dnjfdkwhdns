export const CREDIT_SOURCE='https://stock.naver.com/market/stock/kr/deposit';
export const creditRatio=point=>point.credit/point.deposit*100;
const validDate=date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
export function normalizeCreditRow(row){
 const raw=String(row?.bizdate??'');if(!/^\d{8}$/.test(raw))return null;
 const date=raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8);
 const number=value=>typeof value==='number'?value:typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value.trim())?Number(value):NaN;
 const deposit=number(row.customerDeposit),credit=number(row.creditLoan);
 if(!validDate(date)||!Number.isFinite(deposit)||deposit<=0||!Number.isFinite(credit)||credit<0||deposit>=1e10||credit>=1e10)return null;
 return{date,deposit,credit}; // Source table labels both amounts in 억원; no KRW or million-KRW conversion here.
}
export function validateCreditData(data){
 return data?.schemaVersion===1&&data.unit==='억원'&&['ok','stale'].includes(data.status)&&Number.isFinite(Date.parse(data.collectedAt))&&Array.isArray(data.points)&&data.points.length>=2&&data.points.every((p,i)=>validDate(p.date)&&Number.isFinite(p.deposit)&&p.deposit>0&&Number.isFinite(p.credit)&&p.credit>=0&&(!i||data.points[i-1].date<p.date))&&data.asOf===data.points.at(-1).date;
}
export function creditWindow(points,months){
 if(!points.length)return[];const cutoff=new Date(points.at(-1).date+'T00:00:00Z'),day=cutoff.getUTCDate();cutoff.setUTCDate(1);cutoff.setUTCMonth(cutoff.getUTCMonth()-months);const last=new Date(Date.UTC(cutoff.getUTCFullYear(),cutoff.getUTCMonth()+1,0)).getUTCDate();cutoff.setUTCDate(Math.min(day,last));const start=cutoff.toISOString().slice(0,10);
 return points.filter(p=>p.date>=start);
}
export async function collectCredit(fetcher=fetch,now=new Date()){
 const pages=await Promise.all([0,1,2,3].map(async index=>{
  const response=await fetcher('https://stock.naver.com/api/domestic/market/trendDeposit?startIdx='+index+'&pageSize=200',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Credit source HTTP '+response.status);const page=await response.json();
  if(!Array.isArray(page.content)||Number(page.number)!==index)throw Error('Unexpected credit pagination');return page.content;
 }));
 const today=new Date(now.getTime()+9*3600000).toISOString().slice(0,10),unique=new Map();
 for(const row of pages.flat()){const point=normalizeCreditRow(row);if(point&&point.date<=today&&!unique.has(point.date))unique.set(point.date,point);}
 const points=creditWindow([...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)),36);
 const data={schemaVersion:1,status:'ok',unit:'억원',source:CREDIT_SOURCE,collectedAt:now.toISOString(),asOf:points.at(-1)?.date,points};
 if(!validateCreditData(data))throw Error('Insufficient credit history');return data;
}
export function retainCredit(previous,errorAt=new Date()){
 if(!validateCreditData(previous))throw Error('No valid credit history to retain');
 return{...previous,status:'stale',lastAttemptAt:errorAt.toISOString()}; // Retain actual collection time and basis date.
}
