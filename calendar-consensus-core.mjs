import { plainNews } from './stock-news-core.mjs';

// Exact provider names keep different releases and percentage bases separate.
export const CONSENSUS_NAMES = {
  'USCPI=ECIX': ['CPI'],
  'USCPNY=ECIX': ['CPI'],
  'USCPF=ECIX': ['Core CPI'],
  'USCPFY=ECIX': ['Core CPI'],
  'USCPN=ECIX': ['CPI Index, n.s.a.'],
  'USPPFD=ECIX': ['PPI'],
  'USJOB=ECIX': ['Initial Jobless Claims'],
  'USNFAR=ECIX': ['Nonfarm Payrolls'],
  'USUNR=ECIX': ['Unemployment Rate'],
  'USPMI=ECIX': ['ISM Manufacturing PMI'],
  'USNPMI=ECIX': ['ISM Non-Manufacturing PMI'],
  'USUMSP=ECIX': ['Michigan Consumer Sentiment'],
  'USUM1F=ECIX': ['Michigan 1-Year Inflation Expectations'],
  'USCONC=ECIX': ['CB Consumer Confidence'],
  'USPFDB=ECIX': ['Philadelphia Fed Manufacturing Index'],
  'USRSL=ECIX': ['Retail Sales'],
  'USIP=ECIX': ['Industrial Production'],
  'USIPI=ECIX': ['Import Price Index'],
  'USHST=ECIX': ['Housing Starts'],
  'USEHS=ECIX': ['Existing Home Sales'],
  'USHNS=ECIX': ['New Home Sales'],
  'USTBAL=ECIX': ['Trade Balance'],
  'USDGN=ECIX': ['Durable Goods Orders'],
  'USGDPP=ECIX': ['GDP'],
  'USGPCS=ECIX': ['Personal Spending'],
  'USPCEM=ECIX': ['Core PCE Price Index'],
  'KRCPIY=ECIX': ['CPI'],
  'KRUNR=ECIX': ['Unemployment Rate'],
  'KREXP=ECIX': ['Exports'],
  'KRIMP=ECIX': ['Imports'],
  'KREXPR=ECIX': ['Exports'],
  'KRIMPR=ECIX': ['Imports'],
  'KRTBLR=ECIX': ['Trade Balance'],
  'KROCRT=ECIX': ['Interest Rate Decision'],
  'KRIO=ECIX': ['Industrial Production'],
  'KRCONS=ECIX': ['Consumer Confidence'],
};

export function parseIndicatorNumber(value) {
  if (value === null || value === undefined) return null;
  const text = plainNews(String(value), 80).replaceAll('−', '-').replaceAll(',', '').replaceAll(' ', '');
  const match = text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([KMBT])?(%)?$/i);
  if (!match || (match[2] && match[3])) return null;
  const multiplier = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[match[2]?.toUpperCase()] || 1;
  const number = Number(match[1]) * multiplier;
  const decimals = match[1].split('.')[1]?.length || 0;
  return Number.isFinite(number) ? {
    value: number, unit: match[3] ? 'percent' : 'number', precision: multiplier * 10 ** -decimals,
  } : null;
}

export function compareIndicatorForecast(actual, forecast) {
  const a = parseIndicatorNumber(actual);
  const f = parseIndicatorNumber(forecast);
  if (!a || !f || a.unit !== f.unit) return null;
  const difference = a.value - f.value;
  const tolerance = Math.max(Math.abs(a.value), Math.abs(f.value), 1) * 1e-10;
  if (Math.abs(difference) <= tolerance) return 'equal';
  return difference > 0 ? 'above' : 'below';
}

export function matchCalendarConsensus(event, rows) {
  const names = CONSENSUS_NAMES[event.code];
  if (!names || !event.scheduledAt) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(event.scheduledAt)).map(part => [part.type, part.value]));
  const country = event.country === 'KOR' ? 'South Korea' : 'United States';
  const clock = `${parts.hour}:${parts.minute}`;
  const candidates = rows.filter(row => typeof row.eventName === 'string' && names.includes(row.eventName.trim()) && row.country === country && row.gmt === clock);
  // A matching actual (or the same prior before release) disambiguates YoY/MoM rows.
  const confirmed = candidates.filter(row => {
    const basis = event.actual !== null ? event.actual : event.previous;
    const sourceBasis = event.actual !== null ? row.actual : row.previous;
    const reference = parseIndicatorNumber(basis);
    const source = parseIndicatorNumber(sourceBasis);
    if (!reference || !source || reference.unit !== source.unit) return false;
    if (compareIndicatorForecast(basis, sourceBasis) === 'equal') return true;
    // A displayed 1.22M prior may represent the provider's more precise 1.221M.
    return Math.abs(reference.value - source.value) < reference.precision / 2 - 1e-10;
  });
  if (confirmed.length !== 1) return null;
  const row = confirmed[0];
  const forecast = plainNews(String(row.consensus ?? ''), 80);
  const basis = event.actual ?? event.previous;
  if (!forecast || compareIndicatorForecast(basis, forecast) === null) return null;
  return { forecast, previous: parseIndicatorNumber(row.previous) ? plainNews(String(row.previous), 80) : null };
}
