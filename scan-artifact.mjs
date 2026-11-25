export function selectScanRun(runs,triggerId='') {
 if(triggerId!=='') {
  if(!/^\d+$/.test(String(triggerId))||!Number.isSafeInteger(Number(triggerId))||Number(triggerId)<=0)throw Error('Invalid triggering scan');
  return Number(triggerId);
 }
 return runs.filter(r=>r.status==='completed'&&r.conclusion==='success'&&Number.isSafeInteger(r.databaseId))
  .sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))[0]?.databaseId||null;
}
