const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function plain(value = '') {
  return String(value).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (all, name) => {
      if (name[0] !== '#') return entities[name] ?? all;
      const n = name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }).replace(/\s+/g, ' ').trim();
}
export function positive(value) {
  if (!/^\d[\d,]*(?:\.\d+)?$/.test(String(value))) return null;
  const n = Number(String(value).replaceAll(',', ''));
  return Number.isFinite(n) && n > 0 && n < 1e12 ? n : null;
}
export function targetChange(current, previous) {
  if (!current || !previous) return { direction: 'unknown', changePercent: null };
  return { direction: current > previous ? 'up' : current < previous ? 'down' : 'same',
    changePercent: Math.round((current / previous - 1) * 1000) / 10 };
}
export function normalizeDomestic(row) {
  if (!/^\d+$/.test(row.nid) || !/^[A-Z\d]{6}$/.test(row.itemCode) || !/^\d{4}-\d{2}-\d{2}$/.test(row.writeDate)) return null;
  const targetPrice = positive(row.goalPrice), previousTarget = positive(row.prevGoalPrice);
  return {
    id: `naver-${row.nid}`, date: row.writeDate, company: plain(row.itemName).slice(0, 80), symbol: row.itemCode,
    broker: plain(row.brokerName).slice(0, 60), brokerCode: String(row.brokerCode || ''),
    title: plain(row.title).slice(0, 240), opinion: plain(row.opinionText).slice(0, 30),
    targetPrice, previousTarget, ...targetChange(targetPrice, previousTarget),
    url: `https://stock.naver.com/research/company/${row.nid}`, source: '네이버페이 증권 리서치',
  };
}
export function earningsReview(row, normalized) {
  const title = plain(row.title), body = plain(row.content);
  if (/preview|프리뷰|전망|예상|추정|[1-4]Q\d{2}F/i.test(title)) return null;
  if (!/review|리뷰|실적|잠정|\d분기|\dQ\d{2}/i.test(title + ' ' + body.slice(0, 160))) return null;
  const match = (title + ' ' + body.slice(0, 250)).match(/([1-4])Q(\d{2})(?!F)|(?<!\d)(\d{2})(?:년|Q)?\s*([1-4])분기/i);
  const period = match ? `20${match[2] || match[3]}년 ${match[1] || match[4]}분기` : '';
  let profit = null;
  // Only a reported-result sentence; never infer actual earnings from a forecast.
  const parts = String(row.content || '').replace(/<\/(?:p|strong)>|<br\s*\/?>/gi, '\n').split(/\n|[.!?]\s+(?=[가-힣A-Z])/);
  // Restrict to the opening result statement; later paragraphs can describe subsidiaries.
  for (const text of parts.map(plain).filter(Boolean).slice(0, 2)) {
    if (!/기록|달성|발표/.test(text) || /전망|예상|추정|예정|연간|누적|내년|가이던스|[1-4]Q\d{2}F/i.test(text)) continue;
    const m = text.match(/영업이익(?:은|이|을)?\s*([\d,.]+)\s*(조원|억원|백만원|천만원)/);
    if (!m || !positive(m[1])) continue;
    const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 55);
    const yoy = tail.match(/^\s*\((?:[^)]{0,20}?\bYoY\s*([+-]?\d+(?:\.\d+)?)%|\s*([+-]?\d+(?:\.\d+)?)%\s*YoY)/i);
    profit = { amount: positive(m[1]), unit: m[2], yoyPercent: yoy ? Number(yoy[1] ?? yoy[2]) : null };
    break;
  }
  return { ...normalized, period, profit, kind: /잠정/.test(title) ? '잠정실적 리뷰' : '실적 리뷰' };
}
export function normalizeOverseas(row) {
  const date = String(row.writeDate || '').replaceAll('/', '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[a-zA-Z\d_-]+$/.test(row.secureId || '') || !/^\d+$/.test(row.rptId || '')) return null;
  const title = plain(row.title), company = title.match(/^\[([^\[\]]+?)\s*\(([A-Z]{2,5}):([A-Z\d.\-]+)\)\]\s*(.*)$/);
  return {
    id: `infomax-${row.rptId}`, date, company: company ? company[1].trim() : '', symbol: company?.[3] || '',
    exchange: company?.[2] || '', broker: plain(row.auth).slice(0, 60), author: plain(row.writer).slice(0, 80),
    title: (company?.[4] || title).slice(0, 240), category: company ? 'stock' : 'market',
    kind: /preview|프리뷰/i.test(title) ? '실적 프리뷰' : /review|리뷰|earnings flash/i.test(title) ? '실적 리뷰' : '',
    url: `https://rreport.einfomax.co.kr/report/${row.secureId}.pdf`, source: '연합인포맥스 · 국내 증권사',
  };
}
export function settleFeed(previous, rows, error, now) {
  if (!error && rows.length) return { status: 'ok', updatedAt: now, items: rows };
  return { status: previous?.items?.length ? 'stale' : 'unavailable', updatedAt: previous?.updatedAt || null,
    items: previous?.items || [], message: '제공처 연결이 지연되고 있습니다. 마지막 수집 자료를 표시합니다.' };
}
