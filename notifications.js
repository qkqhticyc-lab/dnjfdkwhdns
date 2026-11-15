import { WATCH_KEY, parseWatchlist, watchKey } from './watchlist-core.mjs';
import { eventShard } from './signal-events.mjs';
import { validSignalManifest } from './signal-tools-publish.mjs';
import {
  NOTIFICATION_KEY, NOTIFICATION_KINDS, parseNotificationState, mergeNotificationStates,
  syncNotificationWatchlist, addSignalNotifications, addCalendarNotifications,
} from './notifications-core.mjs';

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

export function initNotifications() {
  const account = document.querySelector('.header-account');
  if (!account) return;
  const readStorage = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const readWatchlist = () => { try { return parseWatchlist(readStorage(WATCH_KEY) || '{"schemaVersion":1,"items":[]}'); } catch { return []; } };
  let watchlist = readWatchlist();
  let state = syncNotificationWatchlist(parseNotificationState(readStorage(NOTIFICATION_KEY)), watchlist);
  let busy = false, generation = 0, visibleLimit = 30, previousFocus;
  let latestSource = null, storageFailed = false;
  const bell = node('button', undefined, 'notification-button');
  bell.type = 'button'; bell.id = 'notification-button';
  bell.setAttribute('aria-label', '알림'); bell.setAttribute('aria-expanded', 'false'); bell.setAttribute('aria-controls', 'notification-panel');
  bell.append(node('span', '🔔', 'notification-icon'));
  const badge = node('span', '', 'notification-badge'); badge.hidden = true; badge.setAttribute('aria-hidden', 'true'); bell.append(badge);
  account.prepend(bell);

  const panel = node('section', undefined, 'notification-panel');
  panel.id = 'notification-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'notification-title');
  const heading = node('div', undefined, 'notification-heading');
  const title = node('h2', '알림'); title.id = 'notification-title';
  const closeButton = node('button', '×'); closeButton.type = 'button'; closeButton.setAttribute('aria-label', '알림 닫기');
  heading.append(title, closeButton);
  const toolbar = node('div', undefined, 'notification-toolbar');
  const markAll = node('button', '모두 읽음'); markAll.type = 'button';
  const unreadLabel = node('label'); const unreadOnly = node('input'); unreadOnly.type = 'checkbox'; unreadLabel.append(unreadOnly, document.createTextNode('읽지 않은 알림'));
  toolbar.append(unreadLabel, markAll);
  const status = node('p', '관심종목의 알림 추적을 시작한 시점 이후 새 일봉 신호를 확인합니다.', 'notification-status'); status.setAttribute('role', 'status');
  const list = node('div', undefined, 'notification-list');
  const more = node('button', '알림 더 보기'); more.type = 'button'; more.className = 'notification-more';
  const settings = node('details', undefined, 'notification-settings'); settings.append(node('summary', '알림 설정'));
  const settingsInputs = new Map();
  for (const [kind, label] of Object.entries(NOTIFICATION_KINDS)) {
    const field = node('label'); const input = node('input'); input.type = 'checkbox'; input.checked = state.settings[kind]; input.dataset.notificationKind = kind;
    field.append(input, document.createTextNode(label)); settings.append(field); settingsInputs.set(kind, input);
    input.onchange = () => { state.settings[kind] = input.checked; state.settingsAt = Date.now(); persist(); render(); refresh(); };
  }
  const note = node('p', '관심종목·알림·읽음 상태는 이 브라우저에 저장합니다. 일봉 확정 신호는 하루 2회 전체 검사로 확인하며, 페이지를 여는 동안 2분마다 새 배포를 조회합니다. 최근 30일 최대 200건을 보관합니다.', 'notification-note');
  const link = node('a', '관심종목 관리 →'); link.href = './charts.html'; link.className = 'notification-watch-link';
  panel.append(heading, toolbar, status, list, more, settings, note, link); document.body.append(panel);

  function persist() {
    const stored = parseNotificationState(readStorage(NOTIFICATION_KEY));
    state = syncNotificationWatchlist(mergeNotificationStates(state, stored), watchlist);
    try { localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(state)); storageFailed = false; } catch { storageFailed = true; }
  }

  function render() {
    const unread = state.items.filter(item => !item.readAt).length;
    badge.textContent = unread > 99 ? '99+' : String(unread); badge.hidden = unread === 0;
    bell.setAttribute('aria-label', unread ? `알림 · 읽지 않은 알림 ${unread}개` : '알림');
    for (const [kind, input] of settingsInputs) input.checked = state.settings[kind];
    const items = state.items.filter(item => !unreadOnly.checked || !item.readAt);
    list.replaceChildren();
    for (const item of items.slice(0, visibleLimit)) {
      const row = node('a', undefined, 'notification-item' + (item.readAt ? ' is-read' : ''));
      row.href = item.stock ? './charts.html?' + new URLSearchParams(item.stock) : './news.html#economic-calendar';
      row.dataset.notificationId = item.id;
      const time = node('time', new Date(item.occurredAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }));
      time.dateTime = item.occurredAt;
      row.append(node('strong', item.title), node('span', item.body), time);
      row.onclick = () => { state.items = state.items.map(value => value.id === item.id ? { ...value, readAt: Date.now() } : value); persist(); render(); };
      list.append(row);
    }
    if (!items.length) list.append(node('p', watchlist.length ? '새 알림이 없습니다. 관심종목의 다음 신호부터 표시합니다.' : '차트에서 ☆를 눌러 관심종목을 등록하면 알림을 받을 수 있습니다.', 'notification-empty'));
    more.hidden = items.length <= visibleLimit; markAll.disabled = unread === 0;
    if (storageFailed) status.textContent = '브라우저 저장이 차단되어 이 창에서 알림을 유지하고 있습니다.';
  }

  function position() {
    const rect = bell.getBoundingClientRect();
    panel.style.top = Math.min(rect.bottom + 10, innerHeight - 180) + 'px';
    panel.style.maxHeight = Math.max(160, innerHeight - rect.bottom - 24) + 'px';
  }
  function close() {
    panel.hidden = true; bell.setAttribute('aria-expanded', 'false');
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  bell.onclick = () => {
    if (!panel.hidden) { close(); return; }
    previousFocus = document.activeElement; panel.hidden = false; bell.setAttribute('aria-expanded', 'true'); position(); closeButton.focus(); refresh();
  };
  closeButton.onclick = close;
  document.addEventListener('click', event => { if (!panel.hidden && !panel.contains(event.target) && !bell.contains(event.target)) { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', event => {
    if (panel.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const focusable = [...panel.querySelectorAll('button,a[href],input,summary')].filter(element => !element.disabled && element.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  window.addEventListener('resize', () => { if (!panel.hidden) position(); });
  window.addEventListener('scroll', () => { if (!panel.hidden) position(); }, { passive: true });
  markAll.onclick = () => { const now = Date.now(); state.items = state.items.map(item => ({ ...item, readAt: item.readAt || now })); persist(); render(); };
  unreadOnly.onchange = render;
  more.onclick = () => { visibleLimit += 30; render(); };

  async function json(path) {
    const response = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Notification source unavailable');
    return response.json();
  }
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true; const version = generation;
    try {
      if (watchlist.length) {
        const manifest = await json('./data/signal-tools.json');
        if (!validSignalManifest(manifest) || manifest.status !== 'ok') throw Error('Signal scan pending');
        if (latestSource && manifest.collectedAt < latestSource) throw Error('Older alert source');
        const numbers = [...new Set(watchlist.map(item => eventShard(watchKey(item))))];
        const stocks = [];
        for (let index = 0; index < numbers.length; index += 3) {
          const parts = await Promise.all(numbers.slice(index, index + 3).map(number => json(`./data/alerts-${String(number).padStart(2, '0')}.json`)));
          for (const part of parts) {
            if (part.collectedAt !== manifest.collectedAt || !part.stocks || Array.isArray(part.stocks)) throw Error('Mixed alert generations');
            for (const item of watchlist) if (part.stocks[watchKey(item)]) stocks.push(part.stocks[watchKey(item)]);
          }
        }
        if (version !== generation) return;
        state = addSignalNotifications(state, stocks); latestSource = manifest.collectedAt;
        const late = Date.now() - Date.parse(latestSource) > 30 * 3600000;
        status.textContent = `신호 수집 ${new Date(latestSource).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })} KST${late ? ' · 갱신 지연' : ''}`;
      } else status.textContent = '관심종목을 추가하면 새 마감봉 신호를 확인합니다.';
      const calendars = await Promise.allSettled([
        state.settings.earnings && watchlist.length ? json('./data/alert-calendar.json') : Promise.resolve(null),
        state.settings.macro ? json('./data/news.json') : Promise.resolve(null),
      ]);
      if (version !== generation) return;
      const earnings = calendars[0].status === 'fulfilled' ? calendars[0].value?.items : [];
      const economic = calendars[1].status === 'fulfilled' ? calendars[1].value?.calendar?.items : [];
      state = addCalendarNotifications(state, earnings, economic);
      if (calendars.some(result => result.status === 'rejected')) status.textContent += ' · 일정 조회 지연';
      if (calendars[0].status === 'fulfilled' && ['stale','unavailable'].includes(calendars[0].value?.status)) status.textContent += ' · 실적 일정 갱신 지연';
      persist(); render();
    } catch {
      status.textContent = '새 알림 조회가 지연되어 저장된 알림을 표시합니다.';
      render();
    } finally {
      busy = false;
      if (version !== generation) refresh();
    }
  }
  function watchChanged(items = readWatchlist()) {
    generation++; watchlist = items; state = syncNotificationWatchlist(state, watchlist); persist(); render(); refresh();
  }
  window.addEventListener('investment-watchlist-change', event => watchChanged(event.detail?.items || readWatchlist()));
  window.addEventListener('storage', event => {
    if (event.key === WATCH_KEY) watchChanged();
    if (event.key === NOTIFICATION_KEY) {
      state = syncNotificationWatchlist(mergeNotificationStates(state, parseNotificationState(event.newValue)), watchlist); render();
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  persist(); render(); refresh();
  setInterval(refresh, 120000);
}
