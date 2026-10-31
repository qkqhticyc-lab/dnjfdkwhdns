import { readFile } from 'node:fs/promises';

// Read-only deployment checks. Never accept or print a privileged key or session.
const siteArgument = process.argv[2];
let config;
if (siteArgument) {
  const site = new URL(siteArgument);
  if (site.protocol !== 'https:' || !site.pathname.endsWith('/')) {
    throw Error('Use the HTTPS site URL with a trailing slash.');
  }
  const response = await fetch(new URL('site.config.json', site), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error(`Site configuration HTTP ${response.status}`);
  config = await response.json();
} else {
  config = JSON.parse(await readFile(new URL('../site.config.json', import.meta.url), 'utf8'));
}
const { url, publishableKey: key, authProvider = 'github' } = config.supabase || {};
if (!url || !key) {
  console.error('NOT READY: Supabase URL and publishable key are not configured.');
  process.exit(1);
}
if (!key.startsWith('sb_publishable_')) {
  let role;
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch {}
  if (role !== 'anon') throw Error('Only publishable or legacy anon keys are allowed.');
}
const base = new URL(url);
if (base.protocol !== 'https:' || base.username || base.password) throw Error('Invalid Supabase URL.');
const headers = { apikey: key };
if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
let failed = false;
async function check(label, path, accepts) {
  try {
    const response = await fetch(new URL(path, base), { headers, signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => null);
    const ok = accepts(response, data);
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${label} (HTTP ${response.status})`);
    failed ||= !ok;
  } catch {
    console.error(`FAIL: ${label} (network or response error)`);
    failed = true;
  }
}
await check('Public comments readable', '/rest/v1/investment_comments?select=id&limit=1', (r, d) => r.ok && Array.isArray(d));
await check('Anonymous private journal access denied', '/rest/v1/investment_entries?select=id&limit=1', (r, d) => [401, 403].includes(r.status) && d?.code === '42501');
await check(`${authProvider} login provider enabled`, '/auth/v1/settings', (r, d) => r.ok && d?.external?.[authProvider] === true);
console.log('These checks do not verify OAuth redirects, signed-in persistence, or cross-member RLS.');
if (failed) process.exitCode = 1;
