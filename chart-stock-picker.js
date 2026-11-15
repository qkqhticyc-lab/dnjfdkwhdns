import {watchItem, watchKey} from './watchlist-core.mjs';

const RECENT_KEY = 'investment-chart-recent-v1';

export function initChartStockPicker({form, title, select}) {
 const query = form.querySelector('#chart-query');
 const marketLabel = form.querySelector('label[for="chart-market"]');
 const status = form.querySelector('#chart-search-status');
 const suggestions = form.querySelector('#chart-suggestions');
 const dialog = document.createElement('dialog');
 dialog.id = 'chart-stock-search';
 dialog.className = 'chart-search-dialog';
 dialog.setAttribute('aria-label', '종목 검색');

 const searchRow = document.createElement('div');
 searchRow.className = 'chart-search-row';
 const queryLabel = document.createElement('label');
 queryLabel.htmlFor = query.id;
 queryLabel.className = 'chart-search-label';
 queryLabel.textContent = '종목 검색';
 query.placeholder = '종목 검색 (이름·코드·티커)';
 const cancel = document.createElement('button');
 cancel.type = 'button';
 cancel.className = 'chart-search-cancel';
 cancel.textContent = '취소';
 cancel.onclick = () => dialog.close();
 searchRow.append(queryLabel, query, cancel);
 form.replaceChildren(searchRow, marketLabel, status, suggestions);

 const recent = document.createElement('section');
 recent.className = 'chart-recent-stocks';
 const heading = document.createElement('h2');
 heading.textContent = '최근 본 종목';
 const recentList = document.createElement('div');
 recentList.className = 'chart-recent-list';
 recent.append(heading, recentList);
 dialog.append(form, recent);
 document.body.append(dialog);

 let items = readRecent();
 function readRecent() {
  try {
   const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
   if (!Array.isArray(saved)) return [];
   const unique = new Map();
   for (const value of saved.slice(0, 10)) {
    try {
     const item = watchItem(value);
     if (!unique.has(watchKey(item))) unique.set(watchKey(item), item);
    } catch {}
   }
   return [...unique.values()];
  } catch {
   return [];
  }
 }
 function renderRecent() {
  recent.hidden = !!query.value.trim() || !items.length;
  recentList.replaceChildren();
  for (const item of items) {
   const button = document.createElement('button');
   button.type = 'button';
   button.textContent = item.name;
   button.title = item.symbol + ' · ' + item.market;
   button.dataset.recentStock = watchKey(item);
   button.onclick = () => select(item);
   recentList.append(button);
  }
 }
 function remember(value) {
  const item = watchItem(value);
  items = [item, ...items.filter(saved => watchKey(saved) !== watchKey(item))].slice(0, 10);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(items)); } catch {}
  renderRecent();
 }
 function close() {
  if (dialog.open) dialog.close();
 }
 title.setAttribute('aria-haspopup', 'dialog');
 title.setAttribute('aria-controls', dialog.id);
 title.setAttribute('aria-expanded', 'false');
 title.title = '종목 검색';
 title.addEventListener('click', () => {
  if (dialog.open) return;
  items = readRecent();
  query.value = '';
  query.dispatchEvent(new Event('input', {bubbles:true}));
  status.textContent = '국가와 거래소를 확인하고 검색 후보를 선택하세요.';
  renderRecent();
  dialog.showModal();
  title.setAttribute('aria-expanded', 'true');
  query.focus({preventScroll:true});
 });
 query.addEventListener('input', renderRecent);
 dialog.addEventListener('close', () => {
  title.setAttribute('aria-expanded', 'false');
  form.dispatchEvent(new Event('chart-search-close'));
  title.focus({preventScroll:true});
 });
 dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
 });
 return {remember, close};
}
