import {screenMarketDates} from './screener-freshness.mjs';

const active = run => ['queued','in_progress','waiting','pending','requested'].includes(run.status);
const timestamp = run => Date.parse(run.run_started_at || run.created_at || run.createdAt || '');
export function watchdogWindow(now = new Date()) {
 const local = zone => Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const kr=local('Asia/Seoul'),us=local('America/New_York'),weekday=p=>!['Sat','Sun'].includes(p.weekday),minutes=p=>+p.hour*60 + +p.minute;
 return weekday(kr)&&minutes(kr)>=930&&minutes(kr)<1170 || weekday(us)&&minutes(us)>=960&&minutes(us)<1200;
}
export function watchdogDecision(snapshot,references,scans=[],pages=[],now=new Date()) {
 const dates=screenMarketDates(snapshot.items||[],references),delayed=dates.filter(p=>p.delayed);
 if(!Object.keys(references).length)return {action:null,status:'references_unavailable',dates};
 if(!delayed.length)return {action:null,status:dates.every(p=>p.reference)?'current':'references_partial',dates};
 if(scans.some(active))return {action:null,status:'scan_running',dates};
 const successful=scans.filter(p=>p.conclusion==='success').sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at))[0];
 const sameArtifact=successful&&String(snapshot.scanRunId)===String(successful.id)&&Number(snapshot.scanAttempt||1)>=Number(successful.run_attempt||1);
 const unpublished=successful&&!sameArtifact&&(snapshot.scanRunId
  ? Date.parse(successful.updated_at)>Date.parse(snapshot.completedAt||snapshot.collectedAt)
  : Date.parse(successful.updated_at)>Date.parse(snapshot.completedAt||snapshot.collectedAt)+120000);
 if(unpublished)return {action:pages.some(active)?null:'publish',status:pages.some(active)?'publish_running':'publish_requested',dates};
 if(scans.some(p=>now.getTime()-timestamp(p)<30*60000))return {action:null,status:'waiting',dates};
 return {action:'scan',status:'scan_requested',dates};
}
// A new observation can advance a reference; a stale cache cannot move it backwards.
export function screenerReferences(saved=[],live) {
 const refs={};
 for(const row of [...saved,...(live?.dates||[])]) {
  const date=row.reference;
  if(['KR','US','JP'].includes(row.market)&&/^\d{4}-\d{2}-\d{2}$/.test(date||'')&&date>(refs[row.market]?.asOf||''))refs[row.market]={status:'ok',asOf:date};
 }
 return refs;
}
export function screenRefreshText(dates,live,saved,now=Date.now()) {
 const fresh=now-Date.parse(live?.checkedAt)<20*60000;
 if(dates.some(p=>p.delayed)) {
  if(fresh&&['scan_running','scan_requested'].includes(live.status))return '새 마감봉으로 전체 검색을 업데이트하고 있습니다. 완료 후 결과가 자동 반영됩니다.';
  if(fresh&&['publish_running','publish_requested'].includes(live.status))return '새 마감봉 검사를 마쳤습니다. 검색 결과를 게시하고 있습니다.';
  return '확인된 최근 마감 자료보다 검색 결과가 늦습니다. 업데이트가 완료되면 자동으로 반영됩니다.';
 }
 if(!fresh&&['requested','running','waiting'].includes(saved?.status))return '새 마감 자료 반영 여부를 확인하고 있습니다.';
 return '';
}
