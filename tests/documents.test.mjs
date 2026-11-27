import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoStore } from '../src/demo-store.mjs';
import { createApp } from '../src/app.mjs';
import { loadSettings } from '../src/settings.mjs';
import { tripSheetHtml } from '../src/documents.mjs';
import { loadOrg } from '../src/org.mjs';

const trip = { pickup_address: 'Demo Gate A', pickup_latitude: -26.52, pickup_longitude: 27.61, destination_address: 'Demo Shaft 1', destination_latitude: -26.5, destination_longitude: 27.65, vehicle_type: 'Sedan', passenger_count: 2, scheduled_at: new Date(Date.now() + 3600e3).toISOString() };
const setup = async () => {
  const store = await createDemoStore(); const app = createApp(store, { settings: loadSettings({}) });
  const as = async (email) => { let cookie = ''; const call = async (m, p, b) => { const r = await app({ method: m, path: p, body: b, headers: { host: 'x.test', origin: 'http://x.test', cookie } }); if (r.setCookie) cookie = r.setCookie.split(';')[0]; return r; }; await call('POST', '/api/login', { email, password: 'demo-password-001' }); return call; };
  return { store, as };
};
test('trip sheet: only people who can see the trip get it; real text and tables; no placeholders', async () => {
  const { as } = await setup(); const u = await as('requester1@example.test'), other = await as('requester2@example.test'), d = await as('driver1@example.test'), a = await as('admin@example.test');
  const id = (await u('POST', '/api/rides', trip)).body.ride.id;
  assert.equal((await other('GET', `/api/rides/${id}/sheet`)).status, 404);
  assert.equal((await d('GET', `/api/rides/${id}/sheet`)).status, 404, 'a driver not on the trip cannot see it');
  const r = await u('GET', `/api/rides/${id}/sheet`); assert.equal(r.status, 200);
  assert.match(r.html, /<html lang="en-ZA"/); assert.match(r.html, /<h1/); assert.match(r.html, /<th scope=/); assert.match(r.html, /Demo Gate A/); assert.match(r.html, /Trip sheet/);
  assert.ok(!/\{\{|undefined|TO FILL|<img[^>]*src="https?:/.test(r.html), 'no placeholders or remote images');
  await a('POST', `/api/rides/${id}/approve`); await a('POST', `/api/rides/${id}/assign`, { driver_id: 'd-1' });
  assert.equal((await d('GET', `/api/rides/${id}/sheet`)).status, 200); assert.match((await d('GET', `/api/rides/${id}/sheet`)).html, /Demo Driver One/);
});
test('parts trip prints as a parts transport sheet and escapes markup in items', async () => {
  const { store } = await setup(); const u = { user_type: 'admin', id: 'a-1' };
  const ride = { ...(await store.listRides(u))[0], kind: 'parts', items: '<script>x</script>\nSeal kit' };
  const h = tripSheetHtml(ride, [], loadOrg({}));
  assert.match(h, /Parts transport sheet/); assert.ok(!h.includes('<script>x'), 'markup is escaped'); assert.match(h, /Seal kit/);
});
test('document standard checker (library) finds no PROBLEM on the trip sheet', { skip: process.env.LIBRARY ? false : 'set LIBRARY to the Re-usable-Component clone' }, async () => {
  const { spawnSync } = await import('node:child_process'); const { writeFileSync, mkdtempSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const { store } = await setup(); const ride = (await store.listRides({ user_type: 'admin', id: 'a-1' }))[0];
  const f = join(mkdtempSync(join(tmpdir(), 'sheet-')), 'sheet.html'); writeFileSync(f, tripSheetHtml(ride, await store.rideEvents(ride.id), loadOrg({})));
  const r = spawnSync('node', [join(process.env.LIBRARY, 'email/document-standard-checker/check.mjs'), '--strict', '--type', 'JOB', '--no-verification', f], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout); assert.match(r.stdout, /0 PROBLEM/);
});
