import {ENTRY_KEYS,ENTRY_LABELS,entryTrigger} from './entry-types.mjs';
import {evaluateStudyPath} from './signal-study-core.mjs';
export const METHOD_FORWARD_FROM='2026-11-26';
// A retrospective period split is descriptive. New rules are prospectively tracked from their release date.
export function validateEntryMethods(rows,guide,{horizon=20}={}){
 const index=new Map(rows.map((p,i)=>[p.asOf,i])),groups=new Map();
 for(const event of guide.events){
  if(event.provisional||!ENTRY_KEYS.includes(event.key)&&event.key!=='pyramid')continue;
  const i=index.get(event.asOf);if(i==null)continue;
  const type=event.key==='pyramid'?'pyramid':entryTrigger(guide.frames,i,event.key).type;if(type==='unknown')continue;
  const phase=event.asOf.slice(0,10)>=METHOD_FORWARD_FROM?'forward':'history',key=type+'|'+phase;
  if(!groups.has(key))groups.set(key,{type,label:type==='pyramid'?'피라미딩 후보':ENTRY_LABELS[type],phase,signals:0,count:0,pending:0,excluded:0,tp1:0,tp2:0,stop:0,stopAfterTp1:0,ambiguous:0});const g=groups.get(key);g.signals++;
  const levels=event.key==='pyramid'?event.add:event.levels||guide.frames[i]?.trade,stop=levels?.initialStop??levels?.stop;
  if(![stop,levels?.tp1,levels?.tp2].every(Number.isFinite)){g.excluded++;continue;}
  const future=rows.slice(i+1,i+1+horizon),holding=type==='oversoldBounce'?8:type==='supportBounce'?12:horizon;
  if(future.length<horizon||future.some(p=>p.provisional)){g.pending++;continue;}
  if(future.slice(0,holding).some(p=>p.gapBefore)||future[0].open<=stop||future[0].open>=levels.tp1){g.excluded++;continue;}
  const result=evaluateStudyPath(future,{stop,tp1:levels.tp1,tp2:levels.tp2},horizon,holding);if(!result){g.excluded++;continue;}
  g.count++;g.tp1+=Number(result.tp1);g.tp2+=Number(result.tp2);g.stop+=Number(result.stopBeforeTp1);g.stopAfterTp1+=Number(result.stopAfterTp1);g.ambiguous+=Number(result.ambiguous);
 }
 return{horizon,forwardFrom:METHOD_FORWARD_FROM,from:rows[0]?.asOf,through:rows.at(-1)?.asOf,groups:[...groups.values()].map(g=>({...g,tp1Rate:g.count?g.tp1/g.count*100:null,tp2Rate:g.count?g.tp2/g.count*100:null,stopRate:g.count?g.stop/g.count*100:null}))};
}
