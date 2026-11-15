import { liveDailyRows } from '../live-chart-core.mjs';

const BENCHMARKS = { KR: '^KS11', US: '^GSPC', JP: '^N225' };
const ZONES = { KR: 'Asia/Seoul', US: 'America/New_York', JP: 'Asia/Tokyo' };

export function benchmarkRegimes(rows) {
  const result = {};
  for (let index = 59; index < rows.length; index++) {
    const recent = rows.slice(index - 19, index + 1);
    const medium = rows.slice(index - 59, index + 1);
    const fast = recent.reduce((sum, row) => sum + row.close, 0) / 20;
    const slow = medium.reduce((sum, row) => sum + row.close, 0) / 60;
    const close = rows[index].close;
    result[rows[index].asOf] = close > fast && fast > slow ? 'up' : close < fast && fast < slow ? 'down' : 'mixed';
  }
  return result;
}

export async function collectStudyMarkets(now = new Date(), fetcher = fetch) {
  const result = {};
  await Promise.all(Object.entries(BENCHMARKS).map(async ([market, symbol]) => {
    try {
      const response = await fetcher(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d&includePrePost=false`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw Error('Benchmark request failed');
      const data = (await response.json()).chart?.result?.[0];
      if (data?.meta?.symbol !== symbol || data.meta.dataGranularity !== '1d') throw Error('Wrong benchmark identity');
      const quote = data.indicators?.quote?.[0];
      if (!quote || !Array.isArray(data.timestamp)) throw Error('Invalid benchmark series');
      const format = new Intl.DateTimeFormat('en-CA', { timeZone: ZONES[market], year: 'numeric', month: '2-digit', day: '2-digit' });
      const bars = data.timestamp.map((timestamp, index) => ({
        date: format.format(new Date(timestamp * 1000)), open: quote.open[index], high: quote.high[index],
        low: quote.low[index], close: quote.close[index], volume: quote.volume?.[index] || 0,
      })).filter(row => [row.open, row.high, row.low, row.close].every(value => Number.isFinite(value) && value > 0));
      const rows = liveDailyRows({ market, timezone: ZONES[market], bars, collectedAt: now.toISOString() }, now).filter(row => !row.provisional);
      if (rows.length < 60) throw Error('Insufficient benchmark history');
      result[market] = { symbol, status: 'ok', regimes: benchmarkRegimes(rows) };
    } catch {
      result[market] = { symbol, status: 'unavailable', regimes: {} };
    }
  }));
  return result;
}
