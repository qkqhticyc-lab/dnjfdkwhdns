const markets = [{market: 'KR', label: '한국'}, {market: 'US', label: '미국'}, {market: 'JP', label: '일본'}];

export function screenMarketDates(items, references = {}) {
  return markets.map(({market, label}) => {
    const rows = items.filter(item => item.market === market && item.status === 'ok' && /^\d{4}-\d{2}-\d{2}$/.test(item.asOf || ''));
    const latest = rows.reduce((date, row) => row.asOf > date ? row.asOf : date, '');
    const referenceDate = references[market]?.status === 'ok' ? references[market].asOf : null;
    const reference = /^\d{4}-\d{2}-\d{2}$/.test(referenceDate || '') ? referenceDate : null;
    return {market, label, latest: latest || null, total: rows.length,
      current: rows.filter(row => row.asOf === latest).length,
      reference: reference || null, delayed: !!reference && (!latest || latest < reference)};
  });
}

export function screenMarketDateText(summaries) {
  return summaries.map(summary => summary.label + ' ' + (summary.latest || '자료 미제공')
    + (summary.total ? ' (' + summary.current.toLocaleString('ko-KR') + '/' + summary.total.toLocaleString('ko-KR') + '종목)' : '')
    + (summary.delayed ? ' · 기준 지수 ' + summary.reference + ' 대비 갱신 지연' : '')).join(' / ');
}
