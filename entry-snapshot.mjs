import{entryTrigger,ENTRY_KEYS}from'./entry-types.mjs';
// Compare a signal's reference price with the displayed bar, never a user's fills.
export function entrySnapshot(guide, endAt) {
 const frames=guide.frames.filter(p=>p.asOf<=endAt),last=frames.at(-1);
 if(!last)return null;
 const events=guide.events.filter(e=>e.asOf<=last.asOf),entry=events.filter(e=>ENTRY_KEYS.includes(e.key)).at(-1);
 if(!entry||!Number.isFinite(entry.close)||entry.close<=0)return null;
 const patternType=entry.patternType,matches=e=>patternType?e.entryAt===entry.asOf&&e.patternType===patternType:!e.entryAt,exit=events.find(e=>e.key===(patternType?'patternExit':'exit')&&e.asOf>entry.asOf&&matches(e)),active=(patternType?last.patternTrades?.[patternType]:last.trade)?.started===entry.asOf;
 const index=frames.findIndex(p=>p.asOf===entry.asOf),initial=entry.levels||frames[index]?.trade,trigger=entryTrigger(frames,index,entry.key);
 return {asOf:entry.asOf,entry:entry.close,kind:entry.key,patternType:patternType||null,entryType:trigger.type,entryLabel:trigger.label,entryReason:trigger.reason,provisional:!!entry.provisional,
  tp1:initial?.tp1??null,tp2:initial?.tp2??null,initialStop:initial?.initialStop??null,
  tp1Hit:events.some(e=>e.key==='tp1'&&matches(e)&&e.asOf>entry.asOf&&(!exit||e.asOf<=exit.asOf)),tp2Hit:events.some(e=>e.key==='tp2'&&matches(e)&&e.asOf>entry.asOf&&(!exit||e.asOf<=exit.asOf)),
  status:exit?'closed':active?'active':'unknown',exitAt:exit?.asOf,exitProvisional:!!exit?.provisional,
  referenceAt:last.asOf,referencePrice:last.close,changePct:(last.close/entry.close-1)*100};
}
