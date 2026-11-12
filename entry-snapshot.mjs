// Compare a signal's reference price with the displayed bar, never a user's fills.
export function entrySnapshot(guide, endAt) {
 const frames=guide.frames.filter(p=>p.asOf<=endAt),last=frames.at(-1);
 if(!last)return null;
 const events=guide.events.filter(e=>e.asOf<=last.asOf),entry=events.filter(e=>['entry','breakoutEntry'].includes(e.key)).at(-1);
 if(!entry||!Number.isFinite(entry.close)||entry.close<=0)return null;
 const exit=events.find(e=>e.key==='exit'&&e.asOf>entry.asOf),active=last.trade?.started===entry.asOf;
 const initial=frames.find(p=>p.asOf===entry.asOf)?.trade;
 return {asOf:entry.asOf,entry:entry.close,kind:entry.key,provisional:!!entry.provisional,
  tp1:initial?.tp1??null,tp2:initial?.tp2??null,initialStop:initial?.initialStop??null,
  tp1Hit:events.some(e=>e.key==='tp1'&&e.asOf>entry.asOf&&(!exit||e.asOf<=exit.asOf)),tp2Hit:events.some(e=>e.key==='tp2'&&e.asOf>entry.asOf&&(!exit||e.asOf<=exit.asOf)),
  status:exit?'closed':active?'active':'unknown',exitAt:exit?.asOf,exitProvisional:!!exit?.provisional,
  referenceAt:last.asOf,referencePrice:last.close,changePct:(last.close/entry.close-1)*100};
}
