import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { buildSignalTools, validSignalManifest, ALERT_SHARDS } from '../signal-tools-publish.mjs';

const ROOT = '.cache/signal-tools';
const SITE = 'https://qkqhticyc-lab.github.io/dnjfdkwhdns/data/';
await mkdir(ROOT, { recursive: true });
async function local(name) {
  try { return JSON.parse(await readFile(ROOT + '/' + name, 'utf8')); } catch { return null; }
}
async function remote(name) {
  const response = await fetch(SITE + name, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw Error('Published signal tools unavailable');
  return response.json();
}
const files = ['signal-study.json', ...Array.from({ length: ALERT_SHARDS }, (_, index) => `alerts-${String(index).padStart(2, '0')}.json`)];
let previous = await local('signal-tools.json');
if (!validSignalManifest(previous)) previous = null;
if (previous?.status === 'ok') {
  for (const name of files) {
    const part = await local(name);
    if (part?.collectedAt !== previous.collectedAt) { previous = null; break; }
  }
}
try {
  const published = await remote('signal-tools.json');
  if (validSignalManifest(published) && published.status === 'ok' && (!previous || published.collectedAt > previous.collectedAt)) {
    // Keep one complete generation. A partial deployment never replaces the cache.
    const downloaded = [];
    for (let index = 0; index < files.length; index += 4) {
      downloaded.push(...await Promise.all(files.slice(index, index + 4).map(async name => ({ name, data: await remote(name) }))));
    }
    if (downloaded.some(file => file.data.collectedAt !== published.collectedAt)) throw Error('Mixed published generations');
    for (const file of downloaded) await writeFile(ROOT + '/' + file.name, JSON.stringify(file.data));
    await writeFile(ROOT + '/signal-tools.json', JSON.stringify(published));
    previous = published;
  }
} catch { /* Initial deployment or source snapshot recovery. */ }

try {
  const path = process.env.SIGNAL_TOOLS_INPUT || '.cache/screener-full/screener.json';
  const scan = JSON.parse(await readFile(path, 'utf8'));
  if (previous?.status === 'ok' && scan.collectedAt < previous.collectedAt) throw Error('Older scan ignored');
  let sectors;
  try { sectors = JSON.parse(await readFile('.cache/sectors/publish/sectors.json', 'utf8')); } catch { /* Unknown sector remains searchable. */ }
  const output = buildSignalTools(scan, sectors);
  await writeFile(ROOT + '/signal-study.json', JSON.stringify(output.study));
  for (const [index, shard] of output.shards.entries()) await writeFile(ROOT + `/alerts-${String(index).padStart(2, '0')}.json`, JSON.stringify(shard));
  await writeFile(ROOT + '/signal-tools.json', JSON.stringify(output.manifest));
  console.log(JSON.stringify(output.manifest));
} catch (error) {
  console.log('Signal tools retaining prior snapshot: ' + error.message);
  if (!previous) {
    const empty = { schemaVersion: 1, studyVersion: 1, status: 'unavailable', collectedAt: null, notificationShards: ALERT_SHARDS, groups: [], stocks: {} };
    await writeFile(ROOT + '/signal-tools.json', JSON.stringify(empty));
    for (const name of files) await writeFile(ROOT + '/' + name, JSON.stringify(empty));
  }
}
