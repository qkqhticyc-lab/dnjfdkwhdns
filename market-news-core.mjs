import { plainNews, validNewsDate } from './stock-news-core.mjs';

export const NEWS_TOPICS = ['증시', '금리·물가', '환율·원자재', '정책·지정학', '기업·실적'];
export const CALENDAR_COUNTRIES = { KOR: '한국', USA: '미국' };

export function koreaDay(at = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(at));
}

export function shiftDay(day, offset) {
  return new Date(Date.parse(day + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
}

export function safeNewsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (!['n.news.naver.com', 'stock.naver.com'].includes(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function headlineTopic(title) {
  if (/금리|연준|연방준비|FOMC|물가|인플레|CPI|PCE|고용|실업|GDP|중앙은행|통화정책|한국은행|Fed\b/i.test(title)) return '금리·물가';
  if (/환율|달러|엔화|원화|외환|유가|원유|국제금|금값|천연가스|구리|원자재/i.test(title)) return '환율·원자재';
  if (/관세|전쟁|휴전|제재|선거|정상회담|수출통제|규제|정책|미중|중동|우크라|트럼프/i.test(title)) return '정책·지정학';
  if (/실적|매출|영업이익|순이익|가이던스|합병|인수|자사주|배당|반도체|엔비디아|삼성|하이닉스|애플|테슬라|AI\b/i.test(title)) return '기업·실적';
  if (/증시|주식|주가|코스피|코스닥|나스닥|월가|뉴욕|닛케이|지수|S&P|다우|투자|시가총액|상장|금융시장|채권|국채/i.test(title)) return '증시';
  return null;
}

function articleTime(value) {
  let text = String(value || '');
  if (/^\d{14}$/.test(text)) {
    text = text.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3T$4:$5:$6+09:00');
  } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    text = text.replace(' ', 'T') + '+09:00';
  }
  // Refuse a source time without a known UTC offset.
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(text) || !Number.isFinite(Date.parse(text))) return null;
  return new Date(text).toISOString();
}

export function normalizeHeadline(raw, feed, now = Date.now()) {
  const title = plainNews(raw.title, 220);
  const topic = headlineTopic(title);
  const publishedAt = articleTime(raw.datetime || raw.date);
  const office = String(raw.officeId || raw.officeID || '');
  const article = String(raw.articleId || raw.articleID || '');
  if (!title || !topic || !publishedAt || Date.parse(publishedAt) > now + 300000) return null;
  if (!/^[\w-]{1,40}$/.test(office) || !/^\d{1,30}$/.test(article)) return null;
  const url = feed === 'global'
    ? `https://stock.naver.com/news/worldnews/${article}?officeId=${encodeURIComponent(office)}`
    : `https://n.news.naver.com/mnews/article/${office}/${article}`;
  return {
    id: `${office}-${article}`, title, topic, feed, publishedAt, url,
    source: plainNews(raw.officeHname || raw.officeHName || raw.officeName, 50) || 'Npay 증권',
  };
}

export function mergeHeadlines(items, now = Date.now()) {
  const cutoff = now - 7 * 86400000;
  const seenIds = new Set();
  const seenTitles = new Set();
  return items.filter(item => item && safeNewsUrl(item.url) && Date.parse(item.publishedAt) >= cutoff)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .filter(item => {
      const title = item.title.replace(/[\s\p{P}]/gu, '').toLowerCase();
      if (seenIds.has(item.id) || seenTitles.has(title)) return false;
      seenIds.add(item.id);
      seenTitles.add(title);
      return true;
    }).slice(0, 180);
}

function indicatorValue(value) {
  if (value === null || value === undefined) return null;
  const text = plainNews(String(value), 80);
  return !text || /^(?:-|—|N\/A|null)$/i.test(text) ? null : text;
}

export function normalizeCalendarEvent(raw, date) {
  if (raw.category !== 'economicIndicators' || !validNewsDate(date)) return null;
  const id = plainNews(raw.eventKey, 400);
  const title = plainNews(raw.title || raw.eventName, 160);
  const code = plainNews(raw.productKey?.itemCode, 60);
  if (!id || !title || !CALENDAR_COUNTRIES[raw.nationType]) return null;
  const subtitle = plainNews(raw.subtitle, 180);
  const time = subtitle.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/)?.[0] || null;
  const information = Array.isArray(raw.information) ? raw.information : [];
  const field = label => information.find(item => item.label === label);
  const actualField = field('발표');
  // A scheduled placeholder never becomes a published result just because its time passed.
  const actual = actualField?.badge === '예정' ? null : indicatorValue(actualField?.value);
  const sourceImpact = subtitle.split('시장 영향력 ')[1]?.trim() || null;
  const major = /CPI|PCE|GDP|소비자물가|생산자물가|금리|비농업|실업률|소매판매|구매관리자|PMI|소비자심리/i.test(title)
    || ['높음', '매우 높음'].includes(sourceImpact);
  return {
    id, code, title, date, time, country: raw.nationType, major, sourceImpact,
    scheduledAt: time ? new Date(`${date}T${time}:00+09:00`).toISOString() : null,
    actual,
    forecast: indicatorValue(field('예상')?.value ?? field('예측')?.value),
    previous: indicatorValue(field('이전')?.value),
    change: indicatorValue(field('이전 대비')?.change?.value),
    url: safeNewsUrl(raw.endUrl?.pc || raw.endUrl?.mobile) || 'https://stock.naver.com/',
  };
}

export function calendarStatus(event, now = Date.now()) {
  if (indicatorValue(event.actual) !== null) return 'released';
  if (event.scheduledAt && Date.parse(event.scheduledAt) <= now) return 'pending';
  if (!event.scheduledAt && event.date < koreaDay(now)) return 'pending';
  return 'upcoming';
}

export function settleNewsFeed(previous, result, attemptedAt) {
  if (result.status === 'fulfilled') {
    return { status: 'ok', fetchedAt: attemptedAt, ...result.value };
  }
  return {
    ...previous,
    status: previous?.items?.length ? 'stale' : 'unavailable',
    fetchedAt: previous?.fetchedAt || null,
    items: previous?.items || [],
  };
}

export function validateMarketNews(data) {
  if (data?.schemaVersion !== 1 || !Number.isFinite(Date.parse(data.attemptedAt))) return false;
  return ['domestic', 'global', 'calendar'].every(key => {
    const feed = data[key];
    if (!feed || !['ok', 'stale', 'unavailable'].includes(feed.status) || !Array.isArray(feed.items)) return false;
    if (feed.items.length && !Number.isFinite(Date.parse(feed.fetchedAt))) return false;
    return feed.items.every(item => {
      if (!item.id || typeof item.title !== 'string' || !safeNewsUrl(item.url)) return false;
      if (key !== 'calendar') return NEWS_TOPICS.includes(item.topic) && Number.isFinite(Date.parse(item.publishedAt));
      return validNewsDate(item.date) && !!CALENDAR_COUNTRIES[item.country]
        && (item.scheduledAt === null || Number.isFinite(Date.parse(item.scheduledAt)))
        && ['actual', 'forecast', 'previous', 'change'].every(field => item[field] === null || typeof item[field] === 'string');
    });
  });
}
