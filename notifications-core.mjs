import { watchItem, watchKey } from './watchlist-core.mjs';
import { ENTRY_LABELS } from './entry-types.mjs';
import { validNewsDate } from './stock-news-core.mjs';

export const NOTIFICATION_KEY = 'investment-notifications-v1';
export const NOTIFICATION_KINDS = { entry: '진입 신호', tp1: 'TP1 도달', tp2: 'TP2 도달', exit: '이탈·청산', earnings: '실적 발표 일정', macro: '주요 경제지표 예정' };
const DAY = 86400000;

export function emptyNotificationState() {
  return { schemaVersion: 1, watched: {}, items: [], settings: {
    entry: true, tp1: true, tp2: true, exit: true, earnings: true, macro: false,
  }, settingsAt: 0 };
}

export function parseNotificationState(raw) {
  const state = emptyNotificationState();
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (data?.schemaVersion !== 1) return state;
    for (const [key, since] of Object.entries(data.watched || {})) if (/^(KR|US|JP|HK):[A-Z0-9.^=-]{1,20}$/.test(key) && Number.isFinite(since) && since > 0) state.watched[key] = since;
    for (const kind of Object.keys(state.settings)) if (typeof data.settings?.[kind] === 'boolean') state.settings[kind] = data.settings[kind];
    state.settingsAt = Number.isFinite(data.settingsAt) ? data.settingsAt : 0;
    state.items = Array.isArray(data.items) ? data.items.filter(validNotification).slice(0, 200) : [];
  } catch { /* A malformed local record starts with clean preferences. */ }
  return state;
}

function validNotification(item) {
  return item && typeof item.id === 'string' && item.id.length <= 400 && typeof item.title === 'string'
    && item.title.length <= 300 && typeof item.body === 'string' && item.body.length <= 600
    && Object.hasOwn(NOTIFICATION_KINDS, item.kind) && Number.isFinite(Date.parse(item.occurredAt))
    && (!item.stock || validStock(item.stock)) && (item.readAt === 0 || Number.isFinite(item.readAt));
}

function validStock(stock) {
  try { watchItem(stock); return true; } catch { return false; }
}

export function mergeNotificationStates(current, incoming, now = Date.now()) {
  const merged = new Map();
  for (const item of [...current.items, ...incoming.items]) {
    if (!validNotification(item) || Date.parse(item.occurredAt) < now - 30 * DAY) continue;
    const known = merged.get(item.id);
    merged.set(item.id, { ...item, readAt: Math.max(known?.readAt || 0, item.readAt || 0) });
  }
  const preferences = incoming.settingsAt > current.settingsAt ? incoming : current;
  return {
    schemaVersion: 1, watched: { ...incoming.watched, ...current.watched },
    settings: { ...preferences.settings }, settingsAt: preferences.settingsAt,
    items: [...merged.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id)).slice(0, 200),
  };
}

export function syncNotificationWatchlist(state, watchlist, now = Date.now()) {
  const watched = {};
  for (const item of watchlist) {
    const key = watchKey(watchItem(item));
    watched[key] = state.watched[key] || now;
  }
  return { ...state, watched };
}

export function addSignalNotifications(state, stocks, now = Date.now()) {
  const additions = [];
  for (const stock of stocks) {
    if (!validStock(stock)) continue;
    const key = watchKey(stock), since = state.watched[key];
    if (!since) continue;
    for (const event of stock.events || []) {
      const timestamp = Date.parse(event.occurredAt);
      if (!state.settings[event.kind] || !['entry', 'tp1', 'tp2', 'exit'].includes(event.kind)
        || !validNewsDate(event.asOf) || !Number.isFinite(timestamp) || timestamp <= since
        || timestamp > now + 60000 || timestamp < now - 30 * DAY || typeof event.id !== 'string') continue;
      const kindLabel = event.kind === 'entry' ? ENTRY_LABELS[event.type] || '진입 신호' : NOTIFICATION_KINDS[event.kind];
      const sameBarExit = ['tp1', 'tp2', 'exit'].includes(event.kind) && stock.events.some(other =>
        other.asOf === event.asOf && other.entryAt === event.entryAt && other.type === event.type
        && (event.kind === 'exit' ? ['tp1', 'tp2'].includes(other.kind) : other.kind === 'exit'));
      additions.push({
        id: event.id, kind: event.kind, title: `${stock.name} · ${kindLabel}`,
        body: `${event.asOf} 일봉 확정 · ${stock.market} · ${stock.symbol}${sameBarExit ? ' · 동일 봉 목표·이탈 발생, 순서 미확인' : ''}`,
        stock: watchItem(stock), asOf: event.asOf, occurredAt: event.occurredAt, readAt: 0,
      });
    }
  }
  return mergeNotificationStates(state, { ...state, items: additions }, now);
}

export function addCalendarNotifications(state, earnings, economic, now = Date.now()) {
  const additions = [];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + DAY).toISOString().slice(0, 10);
  if (state.settings.earnings) for (const event of earnings || []) {
    if (typeof event.id !== 'string' || typeof event.title !== 'string' || !validStock(event.stock) || !state.watched[watchKey(event.stock)] || ![today, tomorrow].includes(event.date)) continue;
    additions.push({
      id: 'earnings:' + event.id, kind: 'earnings', title: `${event.stock.name} · ${event.date === today ? '오늘' : '내일'} 실적 발표 예정`,
      body: `${event.date} 한국시간 기준 · ${event.title} · 발표 시각 미제공`,
      stock: watchItem(event.stock), occurredAt: new Date(now).toISOString(), readAt: 0,
    });
  }
  if (state.settings.macro) for (const event of economic || []) {
    const at = Date.parse(event.scheduledAt);
    if (typeof event.id !== 'string' || typeof event.title !== 'string' || !event.major || event.actual !== null || !Number.isFinite(at) || at <= now || at > now + 3600000) continue;
    additions.push({
      id: 'macro:' + event.id, kind: 'macro', title: `${event.title} · 1시간 이내 발표 예정`,
      body: `${event.date} ${event.time} KST${event.forecast ? ' · 예측 ' + event.forecast : ''}`,
      occurredAt: new Date(now).toISOString(), readAt: 0,
    });
  }
  // Keep the first notification timestamp stable across repeated calendar checks.
  const known = new Map(state.items.map(item => [item.id, item]));
  const fresh = additions.filter(item => !known.has(item.id));
  return mergeNotificationStates(state, { ...state, items: fresh }, now);
}
