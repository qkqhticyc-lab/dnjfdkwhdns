export const MARKETS = ['KOSPI', 'KOSDAQ', 'FUT'];
const num = value => { const n = Number(String(value).replaceAll(',', '')); return value != null && String(value).trim() !== '' && Number.isFinite(n) ? n : null; };
export function foreignNetAmount(code, row) {
  if(code==='FUT'){
    const buy=num(row?.buyPrice),sell=num(row?.sellPrice);
    // Naver futures transaction amounts are in million KRW: 100 million = 1 eok.
    return buy==null||sell==null?null:(buy-sell)/100;
  }
  const net=num(row?.diffValue);return net==null?null:net/1e8;
}
export async function collectMarket(fetcher = fetch) {
  const now = new Date().toISOString();
  const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10).replaceAll('-', '');
  async function get(url) { const r = await fetcher(url, { signal: AbortSignal.timeout(12000) }); if (!r.ok) throw Error(`Source HTTP ${r.status}`); return r.json(); }
  const markets = {};
  for (const code of MARKETS) {
    try {
      const [basic, chart] = await Promise.all([get(`https://m.stock.naver.com/api/index/${code}/basic`), get(`https://api.stock.naver.com/chart/domestic/index/${code}?periodType=day`)]);
      if (!Array.isArray(chart.priceInfos) || !/^\d{8}$/.test(chart.tradeBaseAt)) throw Error('Invalid index response');
      const records = [];
      for (let startIdx = 0; startIdx < 4; startIdx++) {
        const data = await get(`https://stock.naver.com/api/domestic/market/trend/time?tradeType=KRX&marketType=${code}&bizdate=${chart.tradeBaseAt || day}&startIdx=${startIdx}&pageSize=200`);
        if (!Array.isArray(data.content)) throw Error('Invalid investor response');
        records.push(...data.content); if (data.last || data.content.length < 200) break;
      }
      const allPoints = records.filter(r => r.bizdate === chart.tradeBaseAt && /^\d{6}$/.test(r.time)).map(r => {
        const foreign = r.netAmounts?.find(n => n.investorGubun === '9000');
        return { time: r.time.slice(0, 2) + ':' + r.time.slice(2, 4), foreignNet: foreignNetAmount(code,foreign) };
      }).filter(p => p.foreignNet != null).sort((a, b) => a.time.localeCompare(b.time));
      const prices = chart.priceInfos.filter(p => String(p.localDateTime).startsWith(chart.tradeBaseAt) && num(p.currentPrice) > 0).map(p => ({ time: p.localDateTime.slice(8, 10) + ':' + p.localDateTime.slice(10, 12), price: num(p.currentPrice) }));
      const points=allPoints.filter(p=>p.time>=prices[0]?.time&&p.time<=prices.at(-1)?.time);
      if (!points.length || !prices.length) throw Error('No same-session market points');
      markets[code] = { status: 'ok', code, name: basic.stockName, date: chart.tradeBaseAt.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'), unit: '억원', measure: 'netAmount',
        price: num(basic.closePrice), changePercent: num(basic.fluctuationsRatio), priceTime: basic.localTradedAt,
        marketStatus: basic.marketStatus, previousClose: num(chart.lastClosePrice), points, prices };
    } catch { markets[code] = { code, status: 'unavailable', message: '제공처에서 수급 자료를 확인하지 못했습니다.' }; }
  }
  return { schemaVersion: 1, collectedAt: now, source: '네이버페이 증권 투자자별 매매동향 · 지수 시세', markets,
    options: { status: 'unavailable', message: '콜·풋 옵션 수급은 확인 가능한 제공처를 추가 연결한 뒤 표시합니다.' } };
}
