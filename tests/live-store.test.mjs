// Runs the whole flow against a real (throwaway) MariaDB. Skipped unless LIVE_TEST_SOCKET or LIVE_TEST_HOST is set.
// Setup: create an EMPTY database, set LIVE_TEST_DB, LIVE_TEST_USER and (socket or host). The test loads the schema files itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mariadb from 'mariadb';
import { createLiveStore } from '../src/live-store.mjs';
import { createApp } from '../src/app.mjs';
import { loadSettings } from '../src/settings.mjs';
import { dueForAnonymising } from '../src/retention.mjs';
import { hashPassword } from '../lib/auth_guard.mjs';

const E = process.env; const run = E.LIVE_TEST_DB && (E.LIVE_TEST_SOCKET || E.LIVE_TEST_HOST);
const T = { skip: run ? false : 'set LIVE_TEST_DB and LIVE_TEST_SOCKET or LIVE_TEST_HOST to run' };
const conn = () => mariadb.createConnection({ socketPath: E.LIVE_TEST_SOCKET, host: E.LIVE_TEST_HOST, database: E.LIVE_TEST_DB, user: E.LIVE_TEST_USER ?? 'root', password: E.LIVE_TEST_PASSWORD, multipleStatements: true });

test('live store: full flow on MariaDB', T, async () => {
  const c = await conn();
  await c.query('SET FOREIGN_KEY_CHECKS=0'); for (const t of ['ride_events', 'rides', 'drivers', 'profiles', 'users', 'places', 'auth_rate_limits', 'notices']) await c.query(`DROP TABLE IF EXISTS ${t}`); await c.query('SET FOREIGN_KEY_CHECKS=1');
  for (const f of ['schema.mariadb.sql', '002_request_workflow.sql', '003_settings.sql', '004_contact_phone.sql']) await c.query(readFileSync(new URL(`../database/${f}`, import.meta.url), 'utf8'));
  const h = await hashPassword('test-password-001');
  for (const [id, email, type] of [['u1', 'u1@example.test', 'user'], ['u2', 'u2@example.test', 'user'], ['a1', 'a1@example.test', 'admin'], ['d1', 'd1@example.test', 'driver'], ['d2', 'd2@example.test', 'driver'], ['s1', 's1@example.test', 'supervisor']]) await c.query('INSERT INTO users (id,email,password_hash,user_type) VALUES (?,?,?,?)', [id, email, h, type]);
  await c.query("INSERT INTO profiles (id,name,surname,role) VALUES ('u1','Test','One','user'),('u2','Test','Two','user'),('a1','Test','Admin','admin'),('s1','Test','Super','supervisor')");
  await c.query("INSERT INTO drivers (id,name,surname,car_type,registration_number,is_available,current_latitude,current_longitude) VALUES ('d1','Test','DriverOne','Sedan','T1',TRUE,-26.515,27.605),('d2','Test','DriverTwo','Sedan','T2',TRUE,-26.6,27.9)");
  await c.query("INSERT INTO places (id,name,latitude,longitude) VALUES ('p1','Place One',-26.52,27.61),('p2','Place Two',-26.5,27.65)");
  await c.end();

  const store = createLiveStore({ host: E.LIVE_TEST_HOST, port: Number(E.LIVE_TEST_PORT || 3306), socketPath: E.LIVE_TEST_SOCKET, database: E.LIVE_TEST_DB, user: E.LIVE_TEST_USER ?? 'root', password: E.LIVE_TEST_PASSWORD });
  try {
    const app = createApp(store); const H = { host: 'x.test', origin: 'http://x.test' };
    const as = async (email) => { let cookie = ''; const call = async (method, path, body, query) => { const r = await app({ method, path, query, body, headers: { ...H, cookie } }); if (r.setCookie) cookie = r.setCookie.split(';')[0]; return r; }; const l = await call('POST', '/api/login', { email, password: 'test-password-001' }); assert.equal(l.status, 200, email); return call; };
    const u = await as('u1@example.test'), u2 = await as('u2@example.test'), a = await as('a1@example.test'), d = await as('d1@example.test');
    assert.equal((await u('GET', '/api/places')).body.places.length, 2);
    const trip = { pickup_address: 'Place One', pickup_latitude: -26.52, pickup_longitude: 27.61, destination_address: 'Place Two', destination_latitude: -26.5, destination_longitude: 27.65, vehicle_type: 'Sedan', passenger_count: 2, scheduled_at: new Date(Date.now() + 3600e3).toISOString() };
    const made = await u('POST', '/api/rides', trip); assert.equal(made.status, 201); const id = made.body.ride.id; assert.equal(made.body.ride.requester, 'Test One');
    assert.equal((await u('POST', `/api/rides/${id}/approve`)).status, 403);
    assert.equal((await u2('GET', `/api/rides/${id}`)).status, 404);
    assert.equal((await a('POST', `/api/rides/${id}/approve`)).body.ride.status, 'approved');
    assert.equal((await a('POST', `/api/rides/${id}/approve`)).status, 409);
    const drivers = (await a('GET', '/api/drivers', null, { ride: id })).body.drivers; assert.equal(drivers[0].id, 'd1');
    assert.equal((await a('POST', `/api/rides/${id}/assign`, { driver_id: 'd1' })).body.ride.status, 'assigned');
    assert.equal((await d('POST', '/api/driver/location', { latitude: -26.519, longitude: 27.609 })).status, 200);
    assert.ok((await u('GET', `/api/rides/${id}`)).body.track.km_to_pickup < 1);
    const id2 = (await u('POST', '/api/rides', trip)).body.ride.id; await a('POST', `/api/rides/${id2}/approve`);
    assert.equal((await a('POST', `/api/rides/${id2}/assign`, { driver_id: 'd1' })).status, 409);   // busy driver
    assert.equal((await d('POST', `/api/rides/${id}/start`)).body.ride.status, 'in_progress');
    assert.equal((await d('POST', `/api/rides/${id}/complete`)).body.ride.status, 'completed');
    assert.equal((await a('POST', `/api/rides/${id2}/reject`, { reason: 'No car' })).status, 409);   // already approved: not rejectable
    assert.equal((await a('POST', `/api/rides/${id2}/cancel`)).body.ride.status, 'cancelled');
    const ev = (await u('GET', `/api/rides/${id}`)).body.events.map((e) => e.type); assert.deepEqual(ev, ['requested', 'approve', 'assign', 'start', 'complete']);
    assert.equal((await u('GET', '/api/rides')).body.rides.length, 2);

    // --- round 2: places, reports, retention, settings paths on real MariaDB ---
    const add = await a('POST', '/api/places', { name: 'Place Three', lat: -26.55, lng: 27.62 }); assert.equal(add.status, 201);
    assert.equal((await u('GET', '/api/places')).body.places.length, 3);
    assert.equal((await a('POST', `/api/places/${add.body.place.key}`, { name: 'Place Three', lat: -26.55, lng: 27.62, active: false })).status, 200);
    assert.equal((await u('GET', '/api/places')).body.places.length, 2);
    assert.equal((await a('POST', '/api/places/nope', { name: 'X', lat: 1, lng: 1 })).status, 404);
    const sum = (await a('GET', '/api/reports/summary')).body.summary; assert.equal(sum.total, 2); assert.equal(sum.by_status.completed, 1); assert.equal(sum.by_status.cancelled, 1);
    assert.match((await a('GET', '/api/reports/trips.csv')).csv, /^Trip,Requested/);
    // two-step approval, driver accept, parts, cost centre, free places, notices
    const app2 = createApp(store, { settings: loadSettings({ APPROVAL_CHAIN: 'two', DRIVER_ACCEPT: 'accept', ROTABLES: 'on', COST_CENTRE: 'required', PLACES_MODE: 'free', NOTIFY: 'inapp' }) });
    const as2 = async (email) => { let cookie = ''; const call = async (method, path, body, query) => { const r = await app2({ method, path, query, body, headers: { ...H, cookie } }); if (r.setCookie) cookie = r.setCookie.split(';')[0]; return r; }; await call('POST', '/api/login', { email, password: 'test-password-001' }); return call; };
    const u3 = await as2('u1@example.test'), s3 = await as2('s1@example.test'), a3 = await as2('a1@example.test'), d3 = await as2('d1@example.test');
    const parts = await u3('POST', '/api/rides', { pickup_address: 'Store', destination_address: 'Shaft', vehicle_type: 'Sedan', kind: 'parts', items: 'Pump\nSeal kit', cost_centre: 'CC-9' }); assert.equal(parts.status, 201);
    const pid = parts.body.ride.id; assert.equal(parts.body.ride.kind, 'parts'); assert.equal(parts.body.ride.cost_centre, 'CC-9'); assert.equal(parts.body.ride.pickup_latitude, null);
    assert.equal((await a3('POST', `/api/rides/${pid}/approve`)).status, 409);
    assert.equal((await s3('POST', `/api/rides/${pid}/endorse`)).body.ride.status, 'endorsed');
    assert.equal((await a3('POST', `/api/rides/${pid}/approve`)).body.ride.status, 'approved');
    assert.equal((await a3('POST', `/api/rides/${pid}/assign`, { driver_id: 'd1' })).body.ride.status, 'offered');
    assert.equal((await d3('POST', `/api/rides/${pid}/decline`)).body.ride.status, 'approved');
    assert.equal((await a3('POST', `/api/rides/${pid}/assign`, { driver_id: 'd1' })).body.ride.status, 'offered');
    assert.equal((await d3('POST', `/api/rides/${pid}/accept`)).body.ride.status, 'assigned');
    assert.ok((await u3('GET', '/api/notices')).body.notices.length >= 3);
    await store.pool.query("UPDATE rides SET status='cancelled', cancelled_at='2020-01-01' WHERE id = ?", [pid]);
    // retention on real rows
    const all = await store.listRides({ user_type: 'admin' }); const due = dueForAnonymising(all, 365);
    assert.ok(due.some((r) => r.id === pid)); assert.equal(await store.anonymiseRides(due.map((r) => r.id)), due.length);
    const gone = await store.getRide(pid); assert.equal(gone.pickup_address, '[removed]'); assert.equal(gone.items, null);
    assert.equal(dueForAnonymising(await store.listRides({ user_type: 'admin' }), 365).length, 0);
    const cn = await store.contactOf('u1'); assert.deepEqual(cn, { name: 'Test One', email: 'u1@example.test', phone: null }); // 004 phone column exists
  } finally { await store.close(); }
});
