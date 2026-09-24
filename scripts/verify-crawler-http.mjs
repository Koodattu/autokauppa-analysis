import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const base = process.argv[2] ?? 'http://127.0.0.1:3109';
let server;
let output = '';
try {
if (!process.argv[2]) {
  server = spawn(process.execPath, [fileURLToPath(new URL('../apps/web/node_modules/next/dist/bin/next', import.meta.url)), 'start', '--hostname', '127.0.0.1', '--port', '3109'], {
    cwd: fileURLToPath(new URL('../apps/web', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  server.stdout.on('data', (data) => { output += data; });
  server.stderr.on('data', (data) => { output += data; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(server.exitCode, null, output);
    // Wait for this process to bind, not an unrelated service on the same port.
    if (output.includes('Ready in')) {
      const health = await fetch(base+'/health', { signal: AbortSignal.timeout(5000) }).catch(() => null);
      if (health?.ok) { await health.text(); ready = true; break; }
    }
    await delay(100);
  }
  assert.ok(ready, output);
}
const get = (path, agent, extra={}) => fetch(base+path, { headers: { 'user-agent': agent, ...extra }, redirect:'manual', signal: AbortSignal.timeout(15_000) });
for (const agent of ['GPTBot/1.4', 'Mozilla/5.0']) {
  const response = await get('/robots.txt', agent);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /User-Agent: GPTBot\s+Disallow: \//i);
  assert.match(body, /Disallow: \/\*\?/);
}
for (const path of ['/listings', '/analyze?make=Volvo', '/api/listings']) {
  const response = await get(path, 'GPTBot/1.4');
  assert.equal(response.status, 403, path);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.ok(response.headers.get('x-request-id'));
  await response.text();
}
const variant = await get('/listings?_rsc=abc', 'OAI-SearchBot/1.0');
assert.equal(variant.status,403);
await variant.text();
for (let i=0;i<20;i++) {
  const response = await get('/methodology', 'OAI-SearchBot/1.0');
  assert.equal(response.status,200, `crawler request ${i+1}`);
  await response.text();
}
const limited = await get('/methodology', 'OAI-SearchBot/1.0');
assert.equal(limited.status,429);
assert.ok(Number(limited.headers.get('retry-after'))>0);
assert.match(limited.headers.get('cache-control'),/no-store/);
await limited.text();
const human = await get('/methodology', 'Mozilla/5.0', {'x-request-id':'untrusted'});
assert.equal(human.status,200);
assert.notEqual(human.headers.get('x-request-id'),'untrusted');
await human.text();
let rsc = await get('/methodology?_rsc=test', 'Mozilla/5.0', {rsc:'1'});
// Next validates the RSC hash and redirects an invented probe hash once.
if (rsc.status === 307) {
  const target = new URL(rsc.headers.get('location'), base);
  assert.equal(target.origin, new URL(base).origin);
  assert.equal(target.pathname, '/methodology');
  assert.ok(target.searchParams.has('_rsc'));
  await rsc.text();
  rsc = await get(target.pathname+target.search, 'Mozilla/5.0', {rsc:'1'});
}
assert.equal(rsc.status,200);
assert.match(rsc.headers.get('content-type'),/text\/x-component/);
await rsc.text();
console.log(JSON.stringify({base,robots:200,gptbot:403,crawlerVariant:403,crawlerBudget:429,retryAfter:limited.headers.get('retry-after'),browser:200,browserRsc:200}));
} finally {
  if (server && server.exitCode === null) server.kill();
}
