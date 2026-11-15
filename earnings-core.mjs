import {rankScreenItem} from './screener-rank.mjs';

export const EARNINGS_THRESHOLD = 5;
export const EARNINGS_METRICS = [
 {key:'revenue', label:'매출액', account:0},
 {key:'operating', label:'영업이익', account:1},
 {key:'net', label:'순이익', account:2}
];

export function earningsNumber(value) {
 if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) < 1e14 ? value : null;
 const text = String(value ?? '').trim().replaceAll(',', '');
 return /^[+-]?\d+(?:\.\d+)?$/.test(text) ? earningsNumber(Number(text)) : null;
}

// Read a JSON literal embedded by the source without executing its JavaScript.
export function jsonLiteral(text, start) {
 const opening = text[start];
 if (!['[','{'].includes(opening)) throw Error('Missing source JSON');
 const stack = [];
 let quoted = false, escaped = false;
 for (let index=start; index<text.length; index++) {
  const char = text[index];
  if (quoted) {
   if (escaped) escaped = false;
   else if (char === '\\') escaped = true;
   else if (char === '"') quoted = false;
  } else if (char === '"') quoted = true;
  else if (char === '[' || char === '{') stack.push(char);
  else if (char === ']' || char === '}') {
   if (stack.pop() !== (char === ']' ? '[' : '{')) throw Error('Invalid source JSON');
   if (!stack.length) return JSON.parse(text.slice(start, index+1));
  }
 }
 throw Error('Incomplete source JSON');
}

export function parseEarningsMarket(html, metric) {
 const account = EARNINGS_METRICS.find(item=>item.key===metric)?.account;
 const selected = [...html.matchAll(/<td\b[^>]*\bid="td_sup([1-4])"[^>]*>/g)].filter(match=>/\bclass="[^"]*\bon\b[^"]*"/.test(match[0]));
 if (!Number.isInteger(account) || selected.length!==1 || Number(selected[0][1])!==account+1) throw Error('Earnings account mismatch');
 const periodsMatch = /var changeYYMM\s*=\s*(\[)/.exec(html);
 if (!periodsMatch || !html.includes('어닝서프라이즈')) throw Error('Earnings source changed');
 const periods = jsonLiteral(html, periodsMatch.index + periodsMatch[0].length - 1);
 const arrays = [...html.matchAll(/\bdest\s*:\s*\[/g)];
 if (periods.length !== 2 || arrays.length !== 2) throw Error('Invalid earnings groups');
 const records = [];
 for (const [side, match] of arrays.entries()) {
  const groups = jsonLiteral(html, match.index + match[0].length - 1);
  if (groups.length !== periods[side].length) throw Error('Earnings period mismatch');
  for (const [index, rows] of groups.entries()) {
   const period = periods[side][index];
   if (!/^20\d{2}\/[1-4]$/.test(period) || !Array.isArray(rows)) throw Error('Invalid quarter');
   for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 9 || !/^[A-Z0-9]{6}$/.test(row[0]) || !String(row[1]).startsWith(row[0]+'|')) throw Error('Invalid earnings identity');
    const actual = earningsNumber(row[5]), forecast = earningsNumber(row[6]);
    if (actual === null || forecast === null) continue;
    const basis = row[8] === '연결' ? 'consolidated' : ['개별','별도'].includes(row[8]) ? 'separate' : null;
    if (!basis) continue;
    records.push({symbol:row[0], name:row[1].slice(7), period, basis, metric, actual, forecast});
   }
  }
 }
 if (!records.length) throw Error('Empty earnings source');
 return records;
}

export function mergeEarningsMarkets(records) {
 const groups = new Map();
 for (const record of records) {
  const key = [record.symbol, record.period, record.basis].join(':');
  if (!groups.has(key)) groups.set(key, {symbol:record.symbol, name:record.name, period:record.period, basis:record.basis, metrics:{}});
  const group = groups.get(key);
  if (group.metrics[record.metric]) throw Error('Duplicate earnings metric');
  group.metrics[record.metric] = {actual:record.actual, forecast:record.forecast};
 }
 return [...groups.values()];
}

export function parseEarningsDates(html, symbol) {
 if (!html.includes('cmp_cd='+symbol)) throw Error('Company identity mismatch');
 const start = html.indexOf('var EarnigList');
 const match = /var res\s*=\s*\{/.exec(html.slice(start));
 if (start < 0 || !match) throw Error('Company earnings unavailable');
 const data = jsonLiteral(html, start + match.index + match[0].length - 1);
 if (!Array.isArray(data.yymm) || data.yymm.length !== data.yymmdd?.length) throw Error('Invalid announcement dates');
 return data.yymm.map((month, index) => {
  const date = /^(20\d{2})\/(\d{2})\/(\d{2})\((연결|별도|개별)\)$/.exec(data.yymmdd[index] || '');
  if (!/^20\d{2}(03|06|09|12)$/.test(month) || !date) return null;
  return {period:month.slice(0,4)+'/'+Number(month.slice(4))/3, date:date.slice(1,4).join('-'), basis:date[4]==='연결'?'consolidated':'separate'};
 }).filter(Boolean);
}

export function financeHistory(data, symbol, basis) {
 if (data.itemCode !== symbol || data.financePeriodType !== 'quarter' || data.financeInfo?.itemCode !== symbol) throw Error('Invalid quarterly history');
 const info = data.financeInfo;
 const names = {revenue:'매출액', operating:'영업이익', net:basis==='consolidated'?'지배주주순이익':'당기순이익'};
 return (info.trTitleList || []).filter(column => column.isConsensus === 'N' && /^20\d{2}(03|06|09|12)$/.test(column.key)).map(column => ({
  period:column.key.slice(0,4)+'/'+Number(column.key.slice(4))/3,
  metrics:Object.fromEntries(Object.entries(names).map(([key, title]) => [key, {actual:earningsNumber(info.rowList?.find(row=>row.title===title)?.columns?.[column.key]?.value), forecast:null}])),
  basis
 }));
}

export function mergeEarningsHistory(item, markets, financial) {
 const history = new Map(markets.filter(row=>row.symbol===item.symbol && row.basis===item.basis && row.period<=item.period).map(row=>[row.period,{period:row.period,metrics:row.metrics,basis:row.basis,source:'잠정 집계'}]));
 const overlap = [...financial].sort((a,b)=>b.period.localeCompare(a.period)).find(row=>row.period<item.period && history.has(row.period));
 const shared = overlap ? EARNINGS_METRICS.map(({key})=>[overlap.metrics[key]?.actual,history.get(overlap.period).metrics[key]?.actual]).filter(pair=>pair.every(Number.isFinite)) : [];
 // Join the second provider only after its latest shared quarter agrees within rounding.
 if (shared.length>=2 && shared.every(([a,b])=>Math.abs(a-b)<=1)) {
  for (const row of financial.filter(row=>row.basis===item.basis && row.period<item.period)) history.set(row.period,{...row,source:'확정 실적 집계'});
 }
 return [...history.values()].sort((a,b)=>b.period.localeCompare(a.period)).slice(0,4);
}

export function surprise(actual, forecast) {
 if (!Number.isFinite(actual) || !Number.isFinite(forecast)) return {kind:'unknown', label:'예상치 미제공', percent:null};
 if (forecast === 0) return {kind:actual>0?'above':actual<0?'below':'equal', label:actual>0?'흑자 달성':actual<0?'적자 발생':'부합', percent:null};
 const percent = (actual-forecast)/Math.abs(forecast)*100;
 const kind = Math.abs(percent)<1e-8 ? 'equal' : percent>0 ? 'above' : 'below';
 let label = kind==='equal'?'부합':kind==='above'?'상회':'하회';
 if (forecast<0 && actual>=0) label='흑자 전환';
 else if (forecast>=0 && actual<0) label='적자 전환';
 else if (forecast<0 && actual<0 && kind!=='equal') label=actual>forecast?'적자 축소':'적자 확대';
 return {kind, label, percent};
}

export function earningsVerdict(item) {
 const values = EARNINGS_METRICS.map(metric=>surprise(item.metrics?.[metric.key]?.actual, item.metrics?.[metric.key]?.forecast));
 const positive = values.some(value=>value.percent>=EARNINGS_THRESHOLD || ['흑자 전환','흑자 달성'].includes(value.label));
 const negative = values.some(value=>value.percent<=-EARNINGS_THRESHOLD || ['적자 전환','적자 발생'].includes(value.label));
 if (positive && negative) return {kind:'mixed', label:'실적 혼재'};
 if (negative) return {kind:'shock', label:'어닝 쇼크'};
 if (positive) return {kind:'surprise', label:'어닝 서프라이즈'};
 return values.every(value=>value.kind==='unknown') ? {kind:'unknown', label:'비교 자료 부족'} : {kind:'inline', label:'예상 범위'};
}

export function earningsDecision(item, now=Date.now()) {
 if (item.stale) return {kind:'unavailable',label:'실적 자료 갱신 대기',reasons:['마지막 확인 자료를 표시하고 있습니다. 새 자료를 확인한 뒤 매수 조건을 비교합니다.']};
 const verdict = earningsVerdict(item), reasons = [];
 const operating = item.metrics?.operating, net = item.metrics?.net, revenue = item.metrics?.revenue;
 const opChange = surprise(operating?.actual, operating?.forecast).percent;
 if (verdict.kind==='mixed' || verdict.kind==='shock') return {kind:'wait', label:verdict.kind==='mixed'?'실적 혼재 · 매수 대기':'실적 부진 · 매수 대기', reasons:['예상치 대비 크게 부진한 실적 항목이 있습니다.']};
 if (![revenue?.actual, operating?.actual, net?.actual].every(value=>Number.isFinite(value)&&value>0)) return {kind:'wait',label:'실적 확인 대기',reasons:['매출·영업이익·순이익의 흑자와 비교 수치를 확인합니다.']};
 if (!(opChange>=EARNINGS_THRESHOLD) || surprise(revenue.actual,revenue.forecast).percent===null || revenue.actual<revenue.forecast || surprise(net.actual,net.forecast).percent===null || net.actual<net.forecast) return {kind:'wait',label:'실적 개선 관찰',reasons:['영업이익 5% 이상 상회와 매출·순이익의 예상치 충족을 함께 확인합니다.']};
 const chart = item.chart, signal = chart?.signal;
 const fresh = chart?.asOf && now-Date.parse(chart.asOf+'T15:30:00+09:00')<=5*86400000 && Date.parse(chart.asOf+'T15:30:00+09:00')<=now;
 if (!fresh || chart?.status!=='ok' || chart.market!=='KR' || chart.symbol!==item.symbol || chart.asOf<item.announcedOn) return {kind:'unavailable',label:'최신 차트 확인 대기',reasons:['최근 마감봉 자료를 확인한 뒤 매수 조건을 비교합니다.']};
 if (signal?.status!=='active' || signal.provisional || !['breakout','pullback','triangle','boxRetest'].includes(signal.entryType) || signal.asOf<=item.announcedOn || !Number.isFinite(signal.age) || signal.age>5) return {kind:'wait',label:'실적 양호 · 진입 대기',reasons:['발표 다음 거래일부터 발생한 최근 5봉의 돌파·눌림·패턴 진입 신호를 기다립니다.']};
 const rank = rankScreenItem(chart), price = chart.price;
 const risk = price-signal.initialStop, reward = signal.tp1-price;
 const riskPercent = risk/price*100, rewardRisk = risk>0?reward/risk:null;
 if (!rank || rank.score<70 || Math.abs(rank.gapPct)>5 || chart.rankInputs?.shortAligned!==true || chart.rankInputs?.mediumAligned!==true) reasons.push('우선순위 70점·진입가 이격 ±5%·단기와 중기 정렬을 함께 확인합니다.');
 if (!(chart.liquidity?.average>=1e10) || !(chart.liquidity?.median>=5e9) || !(chart.liquidity?.activeDays>=15) || /스팩|SPAC|양지사/i.test(item.name)) reasons.push('20봉 평균 거래대금 100억원·중앙값 50억원·거래 발생 15일을 확인합니다.');
 if (!Number.isFinite(rewardRisk) || rewardRisk<1.2 || !(riskPercent>0&&riskPercent<=8)) reasons.push('현재가 기준 TP1 손익비 1.2 이상·초기 손절까지 8% 이내를 확인합니다.');
 if (reasons.length) return {kind:'wait',label:'진입 가격 대기',reasons};
 return {kind:'buy',label:'매수 검토',reasons:['매출·순이익 예상치 충족, 영업이익 5% 이상 상회',`${signal.entryLabel} · 우선순위 ${rank.score}점 · TP1 손익비 ${rewardRisk.toFixed(2)}`]};
}

export function validEarnings(data) {
 const validMetrics = metrics => metrics && EARNINGS_METRICS.every(({key})=>!metrics[key]||[metrics[key].actual,metrics[key].forecast].every(value=>value===null||Number.isFinite(value)));
 return data?.schemaVersion===1 && ['ok','partial','stale','unavailable'].includes(data.status) && Array.isArray(data.items) && data.items.every(item=>
  /^[A-Z0-9]{6}$/.test(item.symbol) && /^20\d{2}\/[1-4]$/.test(item.period) && typeof item.name==='string' && item.name.length>0 && item.name.length<=120 &&
  ['consolidated','separate'].includes(item.basis) && /^20\d{2}-\d{2}-\d{2}$/.test(item.announcedOn) && validMetrics(item.metrics) &&
  Array.isArray(item.history||[]) && (item.history||[]).every(point=>/^20\d{2}\/[1-4]$/.test(point.period)&&point.basis===item.basis&&validMetrics(point.metrics))
 );
}
