import {watchKey} from './watchlist-core.mjs';
import {validQuoteItem} from './journal-quotes-core.mjs';

export function watchQuoteText(quote) {
  if (!Number.isFinite(quote?.changePercent)) return '—';
  const percent = Number(quote.changePercent.toFixed(2));
  return (percent > 0 ? '+' : '') + percent.toFixed(2) + '%';
}

export function initWatchlistQuotes(config, onChange) {
  const quotes = new Map();
  let items = [], signature = '', generation = 0, controller;

  function accept(item, quote) {
    const key = watchKey(item), old = quotes.get(key);
    if (!quote || quote.market !== item.market || quote.symbol !== item.symbol || quote.currency !== item.currency
      || !['ok', 'stale'].includes(quote.status) || !Number.isFinite(Date.parse(quote.asOf))) return false;
    if (old?.asOf && Date.parse(quote.asOf) < Date.parse(old.asOf)) return false;
    quotes.set(key, {...quote, changePercent: Number.isFinite(quote.changePercent) ? quote.changePercent : null});
    onChange(key, quotes.get(key));
    return true;
  }

  async function refresh() {
    if (!config?.supabase?.url) return;
    const token = ++generation, requested = items.filter(validQuoteItem);
    controller?.abort();
    const abort = new AbortController();
    controller = abort;
    for (let start = 0; start < requested.length; start += 20) {
      const batch = requested.slice(start, start + 20);
      try {
        const response = await fetch(config.supabase.url + '/functions/v1/journal-quotes', {
          method: 'POST', headers: {apikey: config.supabase.publishableKey,
            Authorization: 'Bearer ' + config.supabase.edgeAnonKey, 'Content-Type': 'application/json'},
          body: JSON.stringify({items: batch.map(({market, symbol, currency}) => ({market, symbol, currency}))}),
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]), cache: 'no-store',
        });
        if (token !== generation) return;
        if (!response.ok) throw Error('Watch quotes unavailable');
        const payload = await response.json();
        if (token !== generation) return;
        if (!Array.isArray(payload.items)) throw Error('Invalid watch quotes');
        for (const item of batch) {
          const quote = payload.items.find(value => value.market === item.market && value.symbol === item.symbol && value.currency === item.currency);
          if (!accept(item, quote)) {
            const key = watchKey(item), old = quotes.get(key);
            quotes.set(key, old ? {...old, status: 'stale'} : {status: 'unavailable'});
            onChange(key, quotes.get(key));
          }
        }
      } catch {
        if (token !== generation) return;
        for (const item of batch) {
          const key = watchKey(item), old = quotes.get(key);
          quotes.set(key, old ? {...old, status: 'stale'} : {status: 'unavailable'});
          onChange(key, quotes.get(key));
        }
      }
    }
  }

  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  return {
    get: item => quotes.get(watchKey(item)),
    setItems(next) {
      items = next;
      const nextSignature = JSON.stringify(items.map(item => [watchKey(item), item.currency]));
      if (nextSignature === signature) return;
      signature = nextSignature;
      const keys = new Set(items.map(watchKey));
      for (const key of quotes.keys()) if (!keys.has(key)) quotes.delete(key);
      refresh();
    },
    update(quote) {
      const item = items.find(item => item.market === quote?.market && item.symbol === quote?.symbol && item.currency === quote?.currency);
      if (item) accept(item, quote);
    },
  };
}
