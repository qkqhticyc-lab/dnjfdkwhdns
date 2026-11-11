export const CREDIT_SOURCE='https://freesis.kofia.or.kr/stat/FreeSIS.do?parentDivId=MSIS10000000000000&serviceId=STATSCU0100000070';
export const DEPOSIT_SOURCE='https://freesis.kofia.or.kr/stat/FreeSIS.do?parentDivId=MSIS10000000000000&serviceId=STATSCU0100000060';
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
 return data?.schemaVersion===1&&data.unit==='억원'&&['ok','stale'].includes(data.status)&&Number.isFinite(Date.parse(data.collectedAt))&&Array.isArray(data.points)&&data.points.length>=2&&data.points.every((p,i)=>validDate(p.date)&&Number.isFinite(p.deposit)&&p.deposit>0&&Number.isFinite(p.credit)&&p.credit>=0&&(!i||data.points[i-1].date<p.date))&&data.asOf===data.points.at(-1).date&&(data.sourceProvider!=='KOFIA'||data.sourceUnit==='백만원'&&data.points.every(p=>Number.isFinite(p.creditKospi)&&p.creditKospi>=0&&Number.isFinite(p.creditKosdaq)&&p.creditKosdaq>=0&&Math.abs(p.credit-p.creditKospi-p.creditKosdaq)<=.02));
}
export function creditWindow(points,months){
 if(!points.length)return[];const cutoff=new Date(points.at(-1).date+'T00:00:00Z'),day=cutoff.getUTCDate();cutoff.setUTCDate(1);cutoff.setUTCMonth(cutoff.getUTCMonth()-months);const last=new Date(Date.UTC(cutoff.getUTCFullYear(),cutoff.getUTCMonth()+1,0)).getUTCDate();cutoff.setUTCDate(Math.min(day,last));const start=cutoff.toISOString().slice(0,10);
 return points.filter(p=>p.date>=start);
}
export async function collectCredit(fetcher=fetch,now=new Date()){
 const today=new Date(now.getTime()+9*3600000).toISOString().slice(0,10),from=new Date(today+'T00:00:00Z');from.setUTCFullYear(from.getUTCFullYear()-3);from.setUTCDate(from.getUTCDate()-5);
 async function get(service){
  // These are the same public daily queries used by FreeSIS. Request amounts in million KRW.
  const response=await fetcher('https://freesis.kofia.or.kr/meta/getMetaDataList.do',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',Referer:CREDIT_SOURCE},body:JSON.stringify({dmSearch:{tmpV40:'1000000',tmpV41:'1',tmpV1:'D',tmpV45:from.toISOString().slice(0,10).replaceAll('-',''),tmpV46:today.replaceAll('-',''),OBJ_NM:service+'BO'}}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Credit source HTTP '+response.status);const data=await response.json();if(!Array.isArray(data.ds1)||!data.ds1.length)throw Error('Unexpected KOFIA daily response');return data.ds1;
 }
 const [creditRows,depositRows]=await Promise.all([get('STATSCU0100000070'),get('STATSCU0100000060')]),credits=new Map(),deposits=new Map();
 for(const row of creditRows){const p=normalizeKofiaCreditRow(row);if(p&&p.date<=today&&!credits.has(p.date))credits.set(p.date,p);}
 for(const row of depositRows){const p=normalizeKofiaDepositRow(row);if(p&&p.date<=today&&!deposits.has(p.date))deposits.set(p.date,p);}
 const points=creditWindow([...credits.values()].filter(p=>deposits.has(p.date)).map(p=>({...p,deposit:deposits.get(p.date).deposit})).sort((a,b)=>a.date.localeCompare(b.date)),36);
 const data={schemaVersion:1,status:'ok',unit:'억원',sourceProvider:'KOFIA',sourceUnit:'백만원',source:CREDIT_SOURCE,depositSource:DEPOSIT_SOURCE,sourceDates:{credit:[...credits.keys()].sort().at(-1),deposit:[...deposits.keys()].sort().at(-1)},collectedAt:now.toISOString(),asOf:points.at(-1)?.date,points};
 if(!validateCreditData(data))throw Error('Insufficient credit history');return data;
}
function kofiaDate(row){const s=String(row?.TMPV1??'');if(!/^\d{8}$/.test(s))return null;const date=s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);return validDate(date)?date:null;}
const kofiaAmount=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<1e12?v/100:null;
export function normalizeKofiaCreditRow(row){const date=kofiaDate(row),credit=kofiaAmount(row?.TMPV2),creditKospi=kofiaAmount(row?.TMPV3),creditKosdaq=kofiaAmount(row?.TMPV4),collateralLoan=kofiaAmount(row?.TMPV9);if(!date||credit==null||creditKospi==null||creditKosdaq==null||Math.abs(credit-creditKospi-creditKosdaq)>.02)return null;return{date,credit,creditKospi,creditKosdaq,...(collateralLoan!=null?{collateralLoan}:{})};}
export function normalizeKofiaDepositRow(row){const date=kofiaDate(row),deposit=kofiaAmount(row?.TMPV2);return date&&deposit>0?{date,deposit}:null;}
export function retainCredit(previous,errorAt=new Date()){
 if(!validateCreditData(previous))throw Error('No valid credit history to retain');
 return{...previous,status:'stale',lastAttemptAt:errorAt.toISOString()}; // Retain actual collection time and basis date.
}
