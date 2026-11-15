import { ENTRY_KEYS, entryTrigger } from './entry-types.mjs';
import { zonedTime } from './stock-news-core.mjs';

export const SIGNAL_EVENT_KINDS = ['entry', 'tp1', 'tp2', 'exit'];
const MARKETS = {
  KR: ['Asia/Seoul', '15:30'], US: ['America/New_York', '16:00'], JP: ['Asia/Tokyo', '15:30'],
};

export function eventShard(key, count = 32) {
  let hash = 0;
  for (const character of key) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return hash % count;
}

export function signalEventHistory(item, guide) {
  const zone = MARKETS[item.market];
  if (!zone) return [];
  const cutoff = Date.parse(guide.asOf + 'T00:00:00Z') - 45 * 86400000;
  const frames = new Map(guide.frames.map((frame, index) => [frame.asOf, index]));
  const active = new Map(), result = [];
  for (const event of guide.events) {
    if (event.provisional) continue;
    const slot = event.patternType || 'main';
    if (ENTRY_KEYS.includes(event.key)) {
      const type = entryTrigger(guide.frames, frames.get(event.asOf), event.key).type;
      active.set(slot, { date: event.asOf, type });
    }
    const entry = active.get(slot);
    const kind = ENTRY_KEYS.includes(event.key) ? 'entry' : ['exit', 'patternExit'].includes(event.key) ? 'exit' : ['tp1', 'tp2'].includes(event.key) ? event.key : null;
    if (kind && entry && Date.parse(event.asOf + 'T00:00:00Z') >= cutoff) result.push({
      id: `${item.market}:${item.symbol}:${entry.date}:${entry.type}:${event.asOf}:${kind}`,
      kind, type: entry.type, asOf: event.asOf, entryAt: entry.date,
      occurredAt: new Date(zonedTime(event.asOf, zone[1], zone[0])).toISOString(),
      level: event.level ?? event.close,
    });
    if (kind === 'exit') active.delete(slot);
  }
  return result;
}
