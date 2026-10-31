import { collectMarket } from './market-core.mjs';
let cached: unknown, expires = 0;
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' };
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'GET') return new Response('{}', { status: 405, headers });
  if (!cached || Date.now() > expires) { cached = await collectMarket(); expires = Date.now() + 55000; }
  return new Response(JSON.stringify(cached), { headers });
});
