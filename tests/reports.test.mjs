import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoStore, DEMO_PASSWORD } from '../src/demo-store.mjs';
import { createApp } from '../src/app.mjs';
import { summarise, toCsv, csvCell, inRange } from '../src/reports.mjs';
import { dueForAnonymising } from '../src/retention.mjs';

async function login(app, email) {
  let cookie = ''; const H = { host: 'x.test', origin: 'http://x.test' };
  const call = async (method, path, body, query) => { const r = await app({ method, path, query, body, headers: { ...H, cookie } }); if (r.setCookie) cookie = r.setCookie.split(';')[0]; return r; };
  await call('POST', '/api/login', { email, password: DEMO_PASSWORD }); return call;
}
test('summary counts match the demo trips and only the controller may read it', async () => {
  const app = createApp(await createDemoStore());
  const a = await login(app, 'admin@example.test'), u = await login(app, 'requester1@example.test');
  const r = await a('GET', '/api/reports/summary'); assert.equal(r.status, 200);
  assert.equal(r.body.summary.total, 2); assert.equal(r.body.summary.by_status.pending, 1); assert.equal(r.body.summary.by_status.approved, 1);
  assert.equal((await u('GET', '/api/reports/summary')).status, 403);
  assert.equal((await u('GET', '/api/reports/trips.csv')).status, 403);
  assert.equal((await a('GET', '/api/reports/summary', null, { from: 'nonsense' })).status, 422);
  assert.equal((await a('GET', '/api/reports/summary', null, { from: '2999-01-01' })).body.summary.total, 0);
});
test('csv: header, rows, quoting, and no formula injection', async () => {
  const app = createApp(await createDemoStore()); const a = await login(app, 'admin@example.test');
  const r = await a('GET', '/api/reports/trips.csv'); assert.match(r.csv, /^Trip,Requested,Status/); assert.equal(r.csv.trim().split('\r\n').length, 3);
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`); assert.equal(csvCell('a,b'), '"a,b"'); assert.equal(csvCell(null), '');
  assert.equal(toCsv([]).trim().split('\r\n').length, 1);
});
test('summarise averages and filters by date', () => {
  const rides = [{ status: 'completed', vehicle_type: 'Sedan', passenger_count: 2, distance_text: '3.5 km (straight line)', created_at: '2026-11-01T10:00:00Z', approved_at: '2026-11-01T10:30:00Z' }, { status: 'pending', vehicle_type: 'Sedan', created_at: '2026-12-01T10:00:00Z' }];
  const s = summarise(rides); assert.equal(s.completed_passengers, 2); assert.equal(s.completed_km_straight_line, 3.5); assert.equal(s.avg_minutes_to_approve, 30); assert.equal(s.by_vehicle.Sedan, 2);
  assert.equal(inRange(rides, '2026-11-15', null).length, 1);
});
test('places: controller adds, hides and edits; requesters see only active; others refused', async () => {
  const app = createApp(await createDemoStore());
  const a = await login(app, 'admin@example.test'), u = await login(app, 'requester1@example.test');
  assert.equal((await u('POST', '/api/places', { name: 'X', lat: 1, lng: 1 })).status, 403);
  const bad = await a('POST', '/api/places', { name: '', lat: 'abc', lng: 500 }); assert.equal(bad.status, 422); assert.ok(bad.body.errors.name && bad.body.errors.lat && bad.body.errors.lng);
  const add = await a('POST', '/api/places', { name: 'Demo Gate B', lat: -26.55, lng: 27.62 }); assert.equal(add.status, 201);
  assert.equal((await u('GET', '/api/places')).body.places.length, 5);
  const hide = await a('POST', `/api/places/${add.body.place.key}`, { name: 'Demo Gate B', lat: -26.55, lng: 27.62, active: false }); assert.equal(hide.status, 200);
  assert.equal((await u('GET', '/api/places')).body.places.length, 4);
  assert.equal((await u('GET', '/api/places', null, { all: '1' })).body.places.length, 4);   // requesters cannot see hidden ones
  assert.equal((await a('GET', '/api/places', null, { all: '1' })).body.places.length, 5);
  assert.equal((await a('POST', '/api/places/nope', { name: 'X', lat: 1, lng: 1 })).status, 404);
});
test('retention: only old finished trips are due, minimum 30 days, anonymise removes personal text', async () => {
  const store = await createDemoStore(); const now = Date.parse('2030-01-01T00:00:00Z');
  const base = { pickup_address: 'Home', destination_address: 'Work', purpose: 'p' };
  const rides = [{ id: 1, status: 'completed', completed_at: '2026-01-01T00:00:00Z', ...base }, { id: 2, status: 'pending', created_at: '2020-01-01T00:00:00Z', ...base }, { id: 3, status: 'completed', completed_at: '2029-12-30T00:00:00Z', ...base }, { id: 4, status: 'cancelled', cancelled_at: '2026-01-01T00:00:00Z', pickup_address: '[removed]' }];
  assert.deepEqual(dueForAnonymising(rides, 365, now).map((r) => r.id), [1]);
  assert.throws(() => dueForAnonymising(rides, 5, now), /at least 30/);
  const admin = { user_type: 'admin' }; const [first] = await store.listRides(admin);
  assert.equal(await store.anonymiseRides([first.id]), 1);
  const after = await store.getRide(first.id); assert.equal(after.pickup_address, '[removed]'); assert.equal(after.purpose, null);
});
