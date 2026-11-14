import { comparisonItem, comparisonKey, comparisonItems, normalizeComparisonHistory, comparisonSeries, validComparisonDate } from "./chart-compare-core.mjs";
import { formatPrice } from "./price-display.mjs";
const $ = (id) => document.getElementById(id), el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}, colors = ["#287b66", "#9862c4", "#337ec1", "#d07f22", "#ce5a79", "#647a23", "#7b67bd", "#2494a0", "#8e6c51", "#596b89"], ns = "http://www.w3.org/2000/svg", pct = (n) => (n > 0 ? "+" : "") + n.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
async function initChartCompare(config) {
  const headers = { apikey: config.supabase.publishableKey, Authorization: "Bearer " + config.supabase.edgeAnonKey }, primary = [{ market: "KR", symbol: "000660", name: "SK하이닉스", currency: "KRW", exchange: "코스피" }, { market: "US", symbol: "MU", name: "마이크론테크놀로지", currency: "USD", exchange: "나스닥" }], extras = [], histories = /* @__PURE__ */ new Map(), states = /* @__PURE__ */ new Map(), pending = /* @__PURE__ */ new Map(), query = $("compare-query"), suggestions = $("compare-suggestions");
  let searchTimer, searchAbort, searchGeneration = 0, candidates = [], active = -1, searchBusy = false;
  const today = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }), start = /* @__PURE__ */ new Date(today + "T00:00:00Z");
  start.setUTCMonth(start.getUTCMonth() - 3);
  $("compare-start").value = start.toISOString().slice(0, 10);
  $("compare-start").max = today;
  const items = () => comparisonItems(primary, extras), sourceItem = (key) => items().find((p) => comparisonKey(p) === key);
  function panelMessage(event) {
    if (event.origin !== location.origin || event.data?.version !== 1 || !["chart-compare-selection", "chart-compare-ready"].includes(event.data.type)) return;
    const index = ["left", "right"].findIndex((side2) => event.source === $("compare-" + side2).contentWindow);
    if (index < 0) return;
    let item;
    try {
      item = comparisonItem(event.data.item);
    } catch {
      return;
    }
    const old = comparisonKey(primary[index]);
    primary[index] = item;
    const side = ["left", "right"][index];
    $("compare-" + side).title = (index ? "오른쪽" : "왼쪽") + " 종목 차트 · " + item.name;
    $("compare-" + side + "-link").href = "./charts.html?" + new URLSearchParams(item);
    if (event.data.type === "chart-compare-ready") {
      $("compare-" + side).closest("section").dataset.ready = "true";
      $("compare-" + side + "-loading").hidden = true;
    }
    if (old !== comparisonKey(item)) {
      cleanup();
      refresh();
    } else render();
  }
  window.addEventListener("message", panelMessage);
  for (const [i, side] of ["left", "right"].entries()) $("compare-" + side).src = "./charts.html?" + new URLSearchParams({ ...primary[i], embed: "compare" });
  function cleanup() {
    const keys = new Set(items().map(comparisonKey));
    for (const [key, job] of pending) if (!keys.has(key)) {
      job.abort();
      pending.delete(key);
    }
  }
  async function load(item) {
    const key = comparisonKey(item);
    if (pending.has(key) || !sourceItem(key)) return;
    const controller = new AbortController();
    pending.set(key, controller);
    if (!histories.has(key)) states.set(key, "loading");
    render();
    try {
      const u = new URL(config.supabase.url + "/functions/v1/stock-chart");
      for (const [k, v] of Object.entries({ ...item, range: "2y", frame: "daily", live: "1" })) if (["market", "symbol", "currency", "exchange", "range", "frame", "live"].includes(k)) u.searchParams.set(k, v);
      const r = await fetch(u, { headers, cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25e3)]) });
      if (!r.ok) throw Error();
      const next = normalizeComparisonHistory(item, await r.json()), old = histories.get(key);
      if (old && (next.points.at(-1).date < old.points.at(-1).date || Date.parse(next.collectedAt) < Date.parse(old.collectedAt))) throw Error();
      if (pending.get(key) !== controller || !sourceItem(key)) return;
      histories.set(key, next);
      states.set(key, next.status);
    } catch (e) {
      if (pending.get(key) !== controller || controller.signal.aborted) return;
      states.set(key, histories.has(key) ? "stale" : "unavailable");
    } finally {
      if (pending.get(key) === controller) pending.delete(key);
      render();
    }
  }
  async function refresh() {
    const current = items();
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(3, current.length) }, async () => {
      while (index < current.length) {
        const item = current[index++];
        if (!pending.has(comparisonKey(item))) await load(item);
      }
    }));
  }
  function render() {
    const selected = items(), date = $("compare-start").value, valid = validComparisonDate(date) && date <= today, rows = selected.map((item, index) => {
      const key = comparisonKey(item), history = histories.get(key), role = primary.map((p, i) => comparisonKey(p) === key ? i ? "오른쪽 차트" : "왼쪽 차트" : null).filter(Boolean).join(" · ");
      let series = null;
      if (history && valid) series = comparisonSeries(history, date);
      return { item, key, role, color: colors[index], state: states.get(key) || "loading", series };
    });
    const first = primary.map((p) => histories.get(comparisonKey(p))?.points[0]?.date).filter(Boolean);
    if (first.length === 2) $("compare-start").min = first.sort().at(-1);
    $("compare-legend").replaceChildren(...rows.map((row) => {
      const chip = el("div", null, "compare-series-chip");
      chip.style.setProperty("--series", row.color);
      chip.append(el("i"), el("b", row.item.name), el("small", row.role || "추가 비교"));
      if (!row.role) {
        const b = el("button", "×");
        b.setAttribute("aria-label", row.item.name + " 비교에서 제거");
        b.onclick = () => {
          const i = extras.findIndex((p) => comparisonKey(p) === row.key);
          if (i >= 0) extras.splice(i, 1);
          cleanup();
          render();
        };
        chip.append(b);
      }
      return chip;
    }));
    const shown = rows.filter((r) => r.series?.values.length), loading = rows.filter((r) => r.state === "loading").length, stale = rows.filter((r) => r.state === "stale").length;
    $("compare-status").textContent = !valid ? "올바른 기준 날짜를 선택하세요." : `기준일 ${date} · ${shown.length}/${rows.length}종목 비교${loading ? " · " + loading + "종목 조회 중" : ""}${stale ? " · " + stale + "종목 이전 조회 자료" : ""}`;
    drawGraph(shown);
    const body = $("compare-table-body");
    body.replaceChildren();
    for (const row of rows) {
      const tr = el("tr"), stock = el("td"), link = el("a", row.item.name);
      link.href = "./charts.html?" + new URLSearchParams(row.item);
      stock.append(link, el("small", row.item.symbol + " · " + row.item.currency + " · " + (row.role || "추가 비교")));
      tr.append(stock);
      if (!row.series?.values.length) {
        const td = el("td", !valid ? "기준 날짜를 확인하세요." : row.state === "loading" ? "일봉 자료 조회 중…" : row.series?.reason || "자료 연결 지연 · 다시 갱신해 주세요.", "compare-unavailable");
        td.colSpan = 4;
        tr.append(td);
      } else {
        const s = row.series;
        for (const [value, note] of [[formatPrice(s.base.price, row.item.currency) + " " + row.item.currency, s.base.date], [formatPrice(s.last.price, row.item.currency) + " " + row.item.currency, s.last.date + (s.last.provisional ? " · 진행 봉" : "") + (row.state === "stale" ? " · 이전 조회 자료" : "")], [(s.change > 0 ? "+" : "") + s.change.toLocaleString("ko-KR", { maximumFractionDigits: ["KRW", "JPY"].includes(row.item.currency) ? 0 : Math.abs(s.change) < 1 ? 4 : 2 }) + " " + row.item.currency, "기준 가격 대비"], [pct(s.percent), "주가 변화율"]]) {
          const td = el("td"), v = el("span", value);
          if (tr.children.length >= 3) v.className = s.percent > 0 ? "up" : s.percent < 0 ? "down" : "";
          if (tr.children.length === 4) v.classList.add("compare-return");
          td.append(v, el("small", note));
          tr.append(td);
        }
      }
      body.append(tr);
    }
    $("compare-refresh").disabled = pending.size > 0;
  }
  function drawGraph(rows) {
    const host = $("compare-performance-graph");
    host.replaceChildren();
    $("compare-readout").textContent = "";
    if (!rows.length) {
      host.append(el("p", "비교 가능한 가격 자료가 준비되면 그래프가 표시됩니다.", "compare-graph-empty"));
      return;
    }
    const width = Math.max(320, host.clientWidth), height = width < 600 ? 280 : 340, left = 54, right = 20, top = 20, bottom = 34, all = rows.flatMap((r) => r.series.values), dates = [...new Set(all.map((p) => p.date))].sort(), begin = Date.parse(dates[0]), end = Date.parse(dates.at(-1)), lo = Math.min(0, ...all.map((p) => p.percent)), hi = Math.max(0, ...all.map((p) => p.percent)), pad = Math.max((hi - lo) * 0.12, 1), min = lo - pad, max = hi + pad, x = (date) => end === begin ? left + (width - left - right) / 2 : left + (Date.parse(date) - begin) / (end - begin) * (width - left - right), y = (v) => height - bottom - (v - min) / (max - min) * (height - top - bottom), svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("aria-label", "기준 가격을 0%로 환산한 종목별 주가 변화율. 좌우 방향키로 날짜 조회.");
    function add(tag, attrs, text) {
      const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text != null) n.textContent = text;
      svg.append(n);
      return n;
    }
    for (let i = 0; i < 5; i++) {
      const v = min + (max - min) * i / 4;
      add("line", { x1: left, x2: width - right, y1: y(v), y2: y(v), stroke: "#e1e8e0" });
      add("text", { x: left - 8, y: y(v) + 4, "text-anchor": "end" }, v.toFixed(1) + "%");
    }
    add("line", { x1: left, x2: width - right, y1: y(0), y2: y(0), stroke: "#a2b8ab", "stroke-dasharray": "4 5" });
    const ticks = width < 600 ? 2 : 4;
    for (let i = 0; i <= ticks; i++) {
      const at = begin + (end - begin) * i / ticks;
      add("text", { x: left + (width - left - right) * i / ticks, y: height - 9, "text-anchor": i === 0 ? "start" : i === ticks ? "end" : "middle" }, new Date(at).toISOString().slice(0, 10));
    }
    for (const row of rows) {
      const points = row.series.values;
      add("path", { "data-comparison-series": row.key, d: points.map((p, i) => (i ? "L" : "M") + x(p.date).toFixed(2) + "," + y(p.percent).toFixed(2)).join(" "), fill: "none", stroke: row.color, "stroke-width": 2.3, "stroke-linejoin": "round" });
      add("circle", { cx: x(points.at(-1).date), cy: y(points.at(-1).percent), r: 3.5, fill: row.color });
    }
    const cursor = add("line", { "data-comparison-cursor": "", x1: left, x2: left, y1: top, y2: height - bottom, stroke: "#778d7e", "stroke-dasharray": "3 4", visibility: "hidden" });
    let selected = dates.length - 1;
    function choose(index) {
      selected = Math.max(0, Math.min(dates.length - 1, index));
      const date = dates[selected];
      cursor.setAttribute("x1", x(date));
      cursor.setAttribute("x2", x(date));
      cursor.setAttribute("visibility", "visible");
      $("compare-readout").textContent = date + " · " + rows.map((r) => {
        const p = r.series.values.find((p2) => p2.date === date);
        return r.item.name + " " + (p ? pct(p.percent) : "휴장·값 없음");
      }).join(" / ");
    }
    svg.onpointermove = (e) => {
      const rect = svg.getBoundingClientRect(), time = begin + Math.max(0, Math.min(1, ((e.clientX - rect.left) / rect.width * width - left) / (width - left - right))) * (end - begin);
      let index = 0;
      for (let i = 1; i < dates.length; i++) if (Math.abs(Date.parse(dates[i]) - time) < Math.abs(Date.parse(dates[index]) - time)) index = i;
      choose(index);
    };
    svg.onpointerleave = () => {
      cursor.setAttribute("visibility", "hidden");
      $("compare-readout").textContent = "";
    };
    svg.onkeydown = (e) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        choose(e.key === "Home" ? 0 : e.key === "End" ? dates.length - 1 : selected + (e.key === "ArrowLeft" ? -1 : 1));
      }
    };
    host.append(svg);
  }
  function closeSearch() {
    suggestions.hidden = true;
    query.setAttribute("aria-expanded", "false");
    query.removeAttribute("aria-activedescendant");
    active = -1;
  }
  async function search() {
    const q = query.value.trim(), own = ++searchGeneration;
    searchAbort?.abort();
    closeSearch();
    if (!q) return;
    searchAbort = new AbortController();
    searchBusy = true;
    $("compare-search-status").textContent = "종목을 찾고 있습니다…";
    try {
      const u = new URL(config.supabase.url + "/functions/v1/stock-search");
      u.searchParams.set("q", q);
      u.searchParams.set("market", $("compare-market").value);
      const r = await fetch(u, { headers, signal: searchAbort.signal });
      if (!r.ok) throw Error();
      const d = await r.json();
      if (own !== searchGeneration) return;
      candidates = (d.items || []).flatMap((p) => {
        try {
          return [comparisonItem(p)];
        } catch {
          return [];
        }
      });
      suggestions.replaceChildren();
      candidates.forEach((item, i) => {
        const b = el("button", item.name + " · " + item.symbol + " · " + item.market);
        b.type = "button";
        b.id = "compare-option-" + i;
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", "false");
        b.onpointerdown = (e) => e.preventDefault();
        b.onclick = () => {
          if (items().some((p) => comparisonKey(p) === comparisonKey(item))) {
            $("compare-search-status").textContent = "이미 비교 중인 종목입니다.";
            return;
          }
          if (items().length >= 10 || extras.length >= 8) {
            $("compare-search-status").textContent = "최대 10종목까지 비교할 수 있습니다.";
            return;
          }
          extras.push(item);
          query.value = "";
          closeSearch();
          $("compare-search-status").textContent = item.name + " 추가됨 · 아래 그래프와 표에서 비교합니다.";
          load(item);
        };
        suggestions.append(b);
      });
      suggestions.hidden = !candidates.length;
      query.setAttribute("aria-expanded", String(!!candidates.length));
      $("compare-search-status").textContent = candidates.length ? "추가할 종목을 선택하세요." : "일치하는 종목이 없습니다.";
    } catch (e) {
      if (e.name !== "AbortError" && own === searchGeneration) $("compare-search-status").textContent = "종목 검색 연결이 지연되고 있습니다.";
    } finally {
      if (own === searchGeneration) searchBusy = false;
    }
  }
  query.oninput = () => {
    clearTimeout(searchTimer);
    searchGeneration++;
    searchAbort?.abort();
    closeSearch();
    searchTimer = setTimeout(search, 300);
  };
  query.onkeydown = (e) => {
    if (e.key === "Escape") closeSearch();
    if (!suggestions.hidden && ["ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + candidates.length) % candidates.length;
      [...suggestions.children].forEach((b, i) => b.setAttribute("aria-selected", String(i === active)));
      query.setAttribute("aria-activedescendant", "compare-option-" + active);
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && !searchBusy) suggestions.children[active]?.click();
    }
  };
  $("compare-market").onchange = search;
  $("compare-add-form").onsubmit = (e) => e.preventDefault();
  $("compare-add-toggle").onclick = () => {
    const form = $("compare-add-form");
    form.hidden = !form.hidden;
    $("compare-add-toggle").setAttribute("aria-expanded", String(!form.hidden));
    if (!form.hidden) query.focus();
    else closeSearch();
  };
  $("compare-start").onchange = render;
  $("compare-refresh").onclick = refresh;
  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 100);
  }).observe($("compare-performance-graph"));
  render();
  await refresh();
  setInterval(() => {
    if (!document.hidden) refresh();
  }, 3e4);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
}
export {
  initChartCompare
};
