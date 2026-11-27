// Request handling: pure functions of (store, request). server.mjs only wires them to HTTP.
import * as guard from '../lib/auth_guard.mjs';
import { distanceKm } from '../lib/geo_distance.mjs';
import { inRange, summarise, toCsv } from './reports.mjs';
import { LABELS, allowedActions, validateNewRide, buildActions } from './workflow.mjs';
import { loadSettings, publicSettings } from './settings.mjs';
import { roadRoute } from '../lib/routing.mjs';
import { timingSafeEqual } from 'node:crypto';
import { createMessenger } from './messaging.mjs';
import { loadOrg } from './org.mjs';
import { tripSheetHtml } from './documents.mjs';
import { listGuide, guideFile } from './guide.mjs';

const AUTH = { login_col: 'email', password_col: 'password_hash', role_col: 'user_type', status_col: '', public_fields: ['id', 'email', 'user_type'] };
const json = (status, body, extra = {}) => ({ status, body, ...extra });

export function createApp(store, cfg = {}, fetchFn = fetch) {
  const settings = cfg.settings ?? loadSettings({});
  const ACTIONS = buildActions(settings);
  const view = (store, user, ride) => ({ ...ride, label: LABELS[ride.status], actions: allowedActions(user, ride, ACTIONS) });
  const org = cfg.org ?? loadOrg(cfg.env ?? process.env);
  const messenger = settings.notify === 'messages' ? (cfg.messenger ?? createMessenger({ org, env: cfg.env ?? process.env })) : null;
  const notify = async (userId, rideId, text) => {
    if (!userId || settings.notify === 'off') return;
    await store.addNotice(userId, rideId, text);
    if (messenger) { try { const c = await store.contactOf(userId); if (c) await messenger.send(c, { title: 'Transport trip update', text, reference: rideId }); } catch (e) { console.warn('message not sent:', e.message); } }
  };
  const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
  const sessions = guard.memorySessionStore();
  const auth = { ...AUTH, allowed_origins: cfg.allowedOrigins ?? [] };
  const deps = { store: sessions };

  return async function handle(req) { // req: { method, path, query, headers, body, https, ip }
    if (req.method === 'POST' && req.path === '/api/tracker/position') { // vehicle trackers: no session, a shared token instead (Q7)
      if (settings.tracking !== 'tracker') return { status: 404, body: { error: 'Not found.' } };
      const tok = (req.headers ?? {})['x-tracker-token'];
      if (!tok || !safeEq(tok, settings.trackerToken)) return { status: 401, body: { error: 'Tracker token not accepted.' } };
      const t = req.body ?? {}; const d = await store.findDriverByReg(String(t.registration_number ?? ''));
      if (!d) return { status: 404, body: { error: 'No vehicle with that registration.' } };
      if (distanceKm(Number(t.latitude), Number(t.longitude), 0, 0) === null) return { status: 422, body: { error: 'That map position is not valid.' } };
      await store.setDriverLocation(d.id, Number(t.latitude), Number(t.longitude)); return { status: 200, body: { ok: true } };
    }
    const session = await guard.startSession(req, auth, deps);
    const cookie = () => session.setCookie;
    const reply = (status, body) => ({ status, body, setCookie: cookie() });
    if (!guard.originOk(req, auth)) return reply(403, { error: 'This request came from another site and was refused.' });
    const { method, path } = req; const b = req.body ?? {};

    if (method === 'POST' && path === '/api/login') {
      const r = await guard.login(session, store, b.email, b.password, auth, deps, req.ip ?? '');
      if (r.error === 'throttled') return reply(429, { error: 'Too many tries. Wait 15 minutes and try again.' });
      if (r.error) return reply(401, { error: 'That email or password is not right.' });
      return reply(200, { user: { ...r.user, name: await store.nameOf(r.user.id) }, mode: store.mode, settings: publicSettings(settings) });
    }
    if (method === 'GET' && path === '/api/mode') return reply(200, { mode: store.mode, settings: publicSettings(settings), demoAccounts: store.mode === 'demo' ? store.demoAccounts() : undefined, demoPassword: store.mode === 'demo' ? store.demoPassword : undefined });
    if (method === 'POST' && path === '/api/logout') { await guard.logout(session, auth, deps); return reply(200, { ok: true }); }

    const user = await guard.user(session, store, auth);
    if (!user) return reply(401, { error: 'Sign in to continue.' });
    const roleIs = (...r) => guard.roleStatus(user, r, auth) === 200;
    const me = { id: user.id, email: user.email, user_type: user.user_type, name: await store.nameOf(user.id) };

    if (method === 'GET' && path === '/api/notices') return reply(200, { notices: settings.notify !== 'off' ? await store.listNotices(user.id) : [] });
    if (method === 'POST' && path === '/api/notices/read') { await store.markNoticesRead(user.id); return reply(200, { ok: true }); }
    if (method === 'GET' && path === '/api/guide') return reply(200, { files: listGuide(cfg.guideDir) });
    if (method === 'GET' && /^\/api\/guide\/\w[\w.-]*$/.test(path)) { const f = guideFile(cfg.guideDir, path.split('/')[3]); return f ? { status: 200, file: f, setCookie: cookie() } : reply(404, { error: 'That document was not found.' }); }
    if (method === 'GET' && path === '/api/outbox') {
      if (!roleIs('admin')) return reply(403, { error: 'Only the controller can see the message log.' });
      return reply(200, { enabled: !!messenger, line: messenger?.startupLine() ?? null, entries: (messenger?.outbox ?? []).slice(-50).reverse().map((e) => ({ at: e.at, channel: e.channel, mode: e.mode, action: e.action, outcome: e.outcome, reason: e.reason, redirected: e.redirectedTo.length > 0 })) });
    }
    if (method === 'GET' && path === '/api/me') return reply(200, { user: me, mode: store.mode });
    if (method === 'GET' && path === '/api/places') return reply(200, { places: await store.listPlaces(roleIs('admin') && req.query?.all === '1') });
    if (method === 'POST' && (path === '/api/places' || /^\/api\/places\/[\w-]+$/.test(path))) {
      if (!roleIs('admin')) return reply(403, { error: 'Only the controller can change places.' });
      const errors = {}; const name = String(b.name ?? '').trim(); const lat = Number(b.lat), lng = Number(b.lng);
      if (!name) errors.name = 'Enter the place name.'; else if (name.length > 120) errors.name = 'Keep the name under 120 characters.';
      if (b.lat === '' || b.lat == null || !Number.isFinite(lat) || lat < -90 || lat > 90) errors.lat = 'Enter a latitude between -90 and 90.';
      if (b.lng === '' || b.lng == null || !Number.isFinite(lng) || lng < -180 || lng > 180) errors.lng = 'Enter a longitude between -180 and 180.';
      if (Object.keys(errors).length) return reply(422, { errors });
      const saved = await store.savePlace(path === '/api/places' ? null : path.split('/')[3], { name, lat, lng, active: b.active !== false });
      return saved ? reply(path === '/api/places' ? 201 : 200, { place: saved }) : reply(404, { error: 'That place was not found.' });
    }
    if (method === 'GET' && (path === '/api/reports/summary' || path === '/api/reports/trips.csv')) {
      if (!roleIs('admin')) return reply(403, { error: 'Only the controller can see reports.' });
      for (const k of ['from', 'to']) if (req.query?.[k] && Number.isNaN(Date.parse(req.query[k]))) return reply(422, { errors: { [k]: 'Enter a valid date.' } });
      const rides = inRange(await store.listRides(user), req.query?.from, req.query?.to);
      return path.endsWith('.csv') ? { status: 200, csv: toCsv(rides), setCookie: cookie() } : reply(200, { summary: summarise(rides) });
    }

    if (method === 'GET' && path === '/api/rides') {
      const rides = await store.listRides(user);
      return reply(200, { rides: rides.map((r) => view(store, user, r)) });
    }
    if (method === 'POST' && path === '/api/rides') {
      if (!roleIs('user')) return reply(403, { error: 'Only a requester can ask for a trip.' });
      const v = validateNewRide(b, Date.now(), settings);
      if (v.errors) return reply(422, { errors: v.errors });
      if (settings.routing === 'road' && v.value.pickup_latitude != null && v.value.destination_latitude != null) {
        const rr = await roadRoute(settings.routingUrl, { lat: v.value.pickup_latitude, lng: v.value.pickup_longitude }, { lat: v.value.destination_latitude, lng: v.value.destination_longitude }, fetchFn);
        if (rr) { v.value.distance_text = `${rr.km} km (by road)`; v.value.duration_text = `${rr.minutes} min`; }
      }
      const ride = await store.createRide(user, v.value);
      await notify(user.id, ride.id, 'Your trip request was sent. You will be told when it is decided.');
      return reply(201, { ride: view(store, user, ride) });
    }
    if (method === 'GET' && path === '/api/drivers') {
      if (!roleIs('admin')) return reply(403, { error: 'Only the controller can see all drivers.' });
      let ride = null; if (req.query?.ride) ride = await store.getRide(req.query.ride);
      const list = [];
      for (const d of await store.listDrivers()) {
        const busy = await store.driverBusy(d.id);
        const km = ride ? distanceKm(d.current_latitude, d.current_longitude, ride.pickup_latitude, ride.pickup_longitude) : null;
        list.push({ id: d.id, name: await store.nameOf(d.id), car_type: d.car_type, registration_number: d.registration_number, is_available: d.is_available && !busy, busy, km_to_pickup: km });
      }
      list.sort((a, c) => (c.is_available - a.is_available) || ((a.km_to_pickup ?? 1e9) - (c.km_to_pickup ?? 1e9)));
      return reply(200, { drivers: list });
    }
    if (method === 'POST' && path === '/api/driver/location') {
      if (!roleIs('driver')) return reply(403, { error: 'Only drivers share a position.' });
      const lat = Number(b.latitude), lng = Number(b.longitude);
      if (distanceKm(lat, lng, 0, 0) === null) return reply(422, { error: 'That map position is not valid.' });
      await store.setDriverLocation(user.id, lat, lng); return reply(200, { ok: true });
    }
    if (method === 'POST' && path === '/api/driver/available') {
      if (!roleIs('driver')) return reply(403, { error: 'Only drivers set availability.' });
      await store.setDriverAvailable(user.id, !!b.available); return reply(200, { ok: true });
    }

    let m = path.match(/^\/api\/rides\/([\w-]+)$/);
    if (method === 'GET' && m) {
      const ride = await store.getRide(m[1]);
      if (!ride || !canSee(user, ride)) return reply(404, { error: 'That trip was not found.' });
      const d = ride.driver_id ? await store.getDriver(ride.driver_id) : null;
      const track = d && ['assigned', 'in_progress'].includes(ride.status) ? {
        driver_latitude: d.current_latitude, driver_longitude: d.current_longitude, updated_at: d.location_at ?? null,
        km_to_pickup: distanceKm(d.current_latitude, d.current_longitude, ride.pickup_latitude, ride.pickup_longitude),
        km_to_destination: distanceKm(d.current_latitude, d.current_longitude, ride.destination_latitude, ride.destination_longitude),
        vehicle: `${d.car_type ?? ''} ${d.registration_number ?? ''}`.trim() } : null;
      return reply(200, { ride: view(store, user, ride), events: await store.rideEvents(ride.id), track });
    }
    m = path.match(/^\/api\/rides\/([\w-]+)\/sheet$/);
    if (method === 'GET' && m) {
      const ride = await store.getRide(m[1]);
      if (!ride || !canSee(user, ride)) return reply(404, { error: 'That trip was not found.' });
      return { status: 200, html: tripSheetHtml(ride, await store.rideEvents(ride.id), org), setCookie: cookie() };
    }
    m = path.match(/^\/api\/rides\/([\w-]+)\/(\w+)$/);
    if (method === 'POST' && m && ACTIONS[m[2]]) {
      const ride = await store.getRide(m[1]); const action = m[2]; const a = ACTIONS[action];
      if (!ride || !canSee(user, ride)) return reply(404, { error: 'That trip was not found.' });
      if (!a.from.includes(ride.status)) return reply(409, { error: `This trip is "${LABELS[ride.status]}", so that step is not available.` });
      if (!allowedActions(user, ride, ACTIONS).includes(action)) return reply(403, { error: 'You do not have permission for that step on this trip.' });
      const extra = {};
      if (a.needs === 'reason') { extra.reason = String(b.reason ?? '').trim(); if (!extra.reason) return reply(422, { errors: { reason: 'Say why it is rejected so the requester knows.' } }); if (extra.reason.length > 300) return reply(422, { errors: { reason: 'Keep the reason under 300 characters.' } }); }
      if (a.needs === 'driver_id') {
        const d = await store.getDriver(String(b.driver_id ?? ''));
        if (!d) return reply(422, { errors: { driver_id: 'Choose a driver.' } });
        if (!d.is_available || await store.driverBusy(d.id)) return reply(409, { error: 'That driver is not free. Choose another.' });
        extra.driver_id = d.id;
      }
      let updated; try { updated = await store.transition(ride, user, action, a.to, extra); } catch (e) { if (e.code === 'CONFLICT') return reply(409, { error: e.message + ' Refresh and try again.' }); throw e; }
      const NOTE = { endorse: 'was endorsed by the supervisor and waits for the controller', approve: 'was approved', reject: `was rejected: ${extra.reason ?? ''}`, assign: settings.driverAccept === 'accept' ? 'was offered to a driver' : 'has a driver', accept: 'was accepted by the driver', decline: 'was declined by the driver, so it needs another driver', unassign: 'lost its driver and needs another', start: 'is on the way', complete: 'is complete', cancel: 'was cancelled' };
      const what = `Your trip from ${ride.pickup_address} to ${ride.destination_address}`;
      if (NOTE[action] && ride.user_id !== user.id) await notify(ride.user_id, ride.id, `${what} ${NOTE[action]}.`);
      if (['assign', 'unassign', 'cancel'].includes(action) && (extra.driver_id || ride.driver_id) && (extra.driver_id ?? ride.driver_id) !== user.id) await notify(extra.driver_id ?? ride.driver_id, ride.id, `Trip ${ride.pickup_address} to ${ride.destination_address}: ${action === 'assign' ? (settings.driverAccept === 'accept' ? 'please accept or decline it' : 'you are assigned') : 'you are no longer assigned'}.`);
      return reply(200, { ride: view(store, user, updated) });
    }
    return reply(404, { error: 'Not found.' });
  };
}
function canSee(user, ride) {
  return ['admin', 'supervisor'].includes(user.user_type) || (user.user_type === 'user' && ride.user_id === user.id) || (user.user_type === 'driver' && ride.driver_id === user.id);
}
