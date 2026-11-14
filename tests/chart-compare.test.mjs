import test from "node:test";
import assert from "node:assert/strict";
import { comparisonItem, comparisonItems, normalizeComparisonHistory, comparisonSeries, validComparisonDate } from "../chart-compare-core.mjs";
const kr = { market: "KR", symbol: "000660", name: "SK하이닉스", currency: "KRW" }, us = { market: "US", symbol: "MU", name: "마이크론", currency: "USD" };
const data = (item, prices) => ({ market: item.market, symbol: item.symbol, currency: item.currency, frame: "daily", liveVersion: 2, collectedAt: "2026-11-14T00:00:00Z", bars: prices.map(([date, close]) => ({ date, close })) });
test("local-currency price returns use each own baseline, not nominal-price or FX comparisons", () => {
  const a = comparisonSeries(normalizeComparisonHistory(kr, data(kr, [["2026-11-02", 1e5], ["2026-11-03", 11e4]])), "2026-11-02"), b = comparisonSeries(normalizeComparisonHistory(us, data(us, [["2026-11-02", 80], ["2026-11-03", 88]])), "2026-11-02");
  assert.ok(Math.abs(a.percent - 10) < 1e-9);
  assert.equal(a.percent, b.percent);
  assert.equal(a.values[0].percent, 0);
  assert.equal(b.change, 8);
});
test("holiday starts select the next available day, and missing foreign sessions are not filled", () => {
  const h = normalizeComparisonHistory(us, data(us, [["2026-10-30", 100], ["2026-11-02", 105], ["2026-11-04", 115.5]])), s = comparisonSeries(h, "2026-11-01");
  assert.equal(s.base.date, "2026-11-02");
  assert.equal(s.base.price, 105);
  assert.deepEqual(s.values.map((p) => p.date), ["2026-11-02", "2026-11-04"]);
  assert.ok(Math.abs(s.percent - 10) < 1e-9);
});
test("before listing/history, after last bar, and suspended baseline gaps cannot fabricate comparable returns", () => {
  const h = normalizeComparisonHistory(us, data(us, [["2026-10-01", 100], ["2026-11-02", 110]]));
  assert.equal(comparisonSeries(h, "2026-09-01").status, "no-history");
  assert.equal(comparisonSeries(h, "2026-11-03").status, "no-history");
  assert.equal(comparisonSeries(h, "2026-10-05").status, "no-history");
  assert.throws(() => comparisonSeries(h, "2026-02-30"), /baseline/);
});
test("same-symbol panels deduplicate performance without conflating different markets", () => {
  assert.equal(comparisonItems([us, us], [us]).length, 1);
  assert.equal(comparisonItems([us], [{ ...us, market: "HK", currency: "HKD" }]).length, 2);
  assert.throws(() => comparisonItem({ ...kr, currency: "USD" }), /identity/);
  assert.throws(() => comparisonItem({ ...us, symbol: "../../etc" }), /identity/);
  assert.equal(validComparisonDate("2026-02-30"), false);
});
test("history rejects wrong identity, currency, non-daily frames, duplicates and invalid prices", () => {
  const d = data(us, [["2026-11-02", 80], ["2026-11-03", 88]]);
  assert.throws(() => normalizeComparisonHistory(kr, d), /identity/);
  assert.throws(() => normalizeComparisonHistory(us, { ...d, currency: "JPY" }), /identity/);
  assert.throws(() => normalizeComparisonHistory(us, { ...d, frame: "fourHour" }), /identity/);
  for (const prices of [[["2026-11-02", 0]], [["2026-11-02", NaN]], [["2026-11-03", 80], ["2026-11-02", 90]], [["2026-11-02", 80], ["2026-11-02", 90]]]) assert.throws(() => normalizeComparisonHistory(us, data(us, prices)), /prices/);
});
test("ongoing last daily bar updates returns and retains the provisional/source status", () => {
  const d = data(us, [["2026-11-02", 80], ["2026-11-03", 84]]);
  d.bars[1].provisional = true;
  d.status = "stale";
  const s = comparisonSeries(normalizeComparisonHistory(us, d), "2026-11-02");
  assert.equal(s.last.provisional, true);
  assert.equal(s.status, "stale");
  assert.equal(s.collectedAt, d.collectedAt);
  assert.ok(Math.abs(s.percent - 5) < 1e-9);
  d.bars[1].close = 88;
  assert.ok(Math.abs(comparisonSeries(normalizeComparisonHistory(us, d), "2026-11-02").percent - 10) < 1e-9);
});
