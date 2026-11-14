const comparisonKey = (p) => p.market + ":" + p.symbol;
const validComparisonDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + "T00:00:00Z")) && (/* @__PURE__ */ new Date(s + "T00:00:00Z")).toISOString().slice(0, 10) === s;
function comparisonItem(p) {
  const currencies = { KR: ["KRW"], US: ["USD"], JP: ["JPY"], HK: ["HKD", "CNY", "USD"] };
  if (!p || !currencies[p.market]?.includes(p.currency) || typeof p.symbol !== "string" || !/^[A-Z0-9.-]{1,20}$/.test(p.symbol) || p.market === "KR" && !/^[A-Z0-9]{6}$/.test(p.symbol)) throw Error("Invalid comparison identity");
  return { market: p.market, symbol: p.symbol, currency: p.currency, name: String(p.name || p.symbol).slice(0, 120), exchange: String(p.exchange || "").slice(0, 80) };
}
function normalizeComparisonHistory(item, data) {
  comparisonItem(item);
  if (data?.market !== item.market || data?.symbol !== item.symbol || data?.currency !== item.currency || data?.frame !== "daily" || data?.liveVersion !== 2 || !Array.isArray(data.bars) || !data.bars.length || data.bars.length > 2e3 || !Number.isFinite(Date.parse(data.collectedAt))) throw Error("Invalid comparison history identity");
  const points = data.bars.map((p, i, a) => {
    const date = p.asOf || p.date;
    if (!validComparisonDate(date) || !Number.isFinite(p.close) || p.close <= 0 || i && (a[i - 1].asOf || a[i - 1].date) >= date) throw Error("Invalid daily comparison prices");
    return { date, price: p.close, provisional: !!p.provisional };
  });
  return { item: comparisonItem({ ...item, name: data.name || item.name }), points, collectedAt: data.collectedAt, status: data.status === "stale" || data.frameInfo?.status === "stale" ? "stale" : "ok" };
}
function comparisonSeries(history, start) {
  if (!validComparisonDate(start)) throw Error("Invalid comparison baseline date");
  const first = history.points[0];
  if (start < first.date) return { ...history, status: "no-history", reason: "선택한 기준일까지의 이력이 없습니다. 제공 시작 " + first.date, values: [] };
  const base = history.points.find((p) => p.date >= start);
  if (!base) return { ...history, status: "no-history", reason: "기준일 이후 거래 자료가 없습니다.", values: [] };
  if ((Date.parse(base.date) - Date.parse(start)) / 864e5 > 10) return { ...history, status: "no-history", reason: "기준일 주변 거래 자료가 없습니다. 다음 제공일 " + base.date, values: [] };
  const values = history.points.filter((p) => p.date >= base.date).map((p) => ({ ...p, percent: (p.price / base.price - 1) * 100 })), last = values.at(-1);
  return { ...history, base, values, last, change: last.price - base.price, percent: last.percent };
}
function comparisonItems(primary, extras) {
  const seen = /* @__PURE__ */ new Set();
  return [...primary, ...extras].map(comparisonItem).filter((p) => {
    const key = comparisonKey(p);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export {
  comparisonItem,
  comparisonItems,
  comparisonKey,
  comparisonSeries,
  normalizeComparisonHistory,
  validComparisonDate
};
