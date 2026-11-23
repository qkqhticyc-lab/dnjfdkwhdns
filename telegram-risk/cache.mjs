import {LATEST_SYMBOLS} from './latest.mjs';
import {nyClock} from './core.mjs';
export function validClose(report,now=new Date()){
 return report?.schemaVersion===1&&report.mode==='close'&&['stable','tension','fracture','trigger'].includes(report.stage)&&
  /^\d{4}-\d{2}-\d{2}$/.test(report.asOf)&&report.asOf<=nyClock(now).date&&
  Object.keys(LATEST_SYMBOLS).every(id=>report.values?.[id]?.value>0&&Number.isFinite(report.values[id].value)&&report.values[id].date===report.asOf);
}
export function closeCache({url,key,fetcher=fetch}={}){
 const headers={apikey:key,Authorization:'Bearer '+key,'content-type':'application/json'};
 return {
  async load(){
   if(!url||!key)return null;
   const r=await fetcher(url+'/rest/v1/telegram_risk_close_cache?id=eq.close&select=report',{headers,signal:AbortSignal.timeout(5000)});
   if(!r.ok)throw Error('Close cache read failed');
   return (await r.json())?.[0]?.report||null;
  },
  async save(report){
   if(!validClose(report))throw Error('Invalid close report');
   const r=await fetcher(url+'/rest/v1/rpc/save_telegram_risk_close',{method:'POST',headers,body:JSON.stringify({p_report:report}),signal:AbortSignal.timeout(5000)});
   if(!r.ok)throw Error('Close cache write failed');
  }
 };
}
