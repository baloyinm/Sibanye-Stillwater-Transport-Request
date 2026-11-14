// Request handling: pure functions of (store, request). server.mjs only wires them to HTTP.
import * as guard from '../lib/auth_guard.mjs';
import { distanceKm } from '../lib/geo_distance.mjs';
import { ACTIONS, LABELS, allowedActions, validateNewRide } from './workflow.mjs';

const AUTH = { login_col: 'email', password_col: 'password_hash', role_col: 'user_type', status_col: '', public_fields: ['id', 'email', 'user_type'] };
const json = (status, body, extra = {}) => ({ status, body, ...extra });
const view = (store, user, ride) => ({ ...ride, label: LABELS[ride.status], actions: allowedActions(user, ride) });

export function createApp(store, cfg = {}) {
  const sessions = guard.memorySessionStore();
  const auth = { ...AUTH, allowed_origins: cfg.allowedOrigins ?? [] };
  const deps = { store: sessions };

  return async function handle(req) { // req: { method, path, query, headers, body, https, ip }
    const session = await guard.startSession(req, auth, deps);
    const cookie = () => session.setCookie;
    const reply = (status, body) => ({ status, body, setCookie: cookie() });
    if (!guard.originOk(req, auth)) return reply(403, { error: 'This request came from another site and was refused.' });
    const { method, path } = req; const b = req.body ?? {};

    if (method === 'POST' && path === '/api/login') {
      const r = await guard.login(session, store, b.email, b.password, auth, deps, req.ip ?? '');
      if (r.error === 'throttled') return reply(429, { error: 'Too many tries. Wait 15 minutes and try again.' });
      if (r.error) return reply(401, { error: 'That email or password is not right.' });
      return reply(200, { user: { ...r.user, name: await store.nameOf(r.user.id) }, mode: store.mode });
    }
    if (method === 'GET' && path === '/api/mode') return reply(200, { mode: store.mode, demoAccounts: store.mode === 'demo' ? store.demoAccounts() : undefined, demoPassword: store.mode === 'demo' ? store.demoPassword : undefined });
    if (method === 'POST' && path === '/api/logout') { await guard.logout(session, auth, deps); return reply(200, { ok: true }); }

    const user = await guard.user(session, store, auth);
    if (!user) return reply(401, { error: 'Sign in to continue.' });
    const roleIs = (...r) => guard.roleStatus(user, r, auth) === 200;
    const me = { id: user.id, email: user.email, user_type: user.user_type, name: await store.nameOf(user.id) };

    if (method === 'GET' && path === '/api/me') return reply(200, { user: me, mode: store.mode });
    if (method === 'GET' && path === '/api/places') return reply(200, { places: store.listPlaces ? await store.listPlaces() : store.places });

    if (method === 'GET' && path === '/api/rides') {
      const rides = await store.listRides(user);
      return reply(200, { rides: rides.map((r) => view(store, user, r)) });
    }
    if (method === 'POST' && path === '/api/rides') {
      if (!roleIs('user')) return reply(403, { error: 'Only a requester can ask for a trip.' });
      const v = validateNewRide(b);
      if (v.errors) return reply(422, { errors: v.errors });
      const ride = await store.createRide(user, v.value);
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
    m = path.match(/^\/api\/rides\/([\w-]+)\/(\w+)$/);
    if (method === 'POST' && m && ACTIONS[m[2]]) {
      const ride = await store.getRide(m[1]); const action = m[2]; const a = ACTIONS[action];
      if (!ride || !canSee(user, ride)) return reply(404, { error: 'That trip was not found.' });
      if (!a.from.includes(ride.status)) return reply(409, { error: `This trip is "${LABELS[ride.status]}", so that step is not available.` });
      if (!allowedActions(user, ride).includes(action)) return reply(403, { error: 'You do not have permission for that step on this trip.' });
      const extra = {};
      if (a.needs === 'reason') { extra.reason = String(b.reason ?? '').trim(); if (!extra.reason) return reply(422, { errors: { reason: 'Say why it is rejected so the requester knows.' } }); if (extra.reason.length > 300) return reply(422, { errors: { reason: 'Keep the reason under 300 characters.' } }); }
      if (a.needs === 'driver_id') {
        const d = await store.getDriver(String(b.driver_id ?? ''));
        if (!d) return reply(422, { errors: { driver_id: 'Choose a driver.' } });
        if (!d.is_available || await store.driverBusy(d.id)) return reply(409, { error: 'That driver is not free. Choose another.' });
        extra.driver_id = d.id;
      }
      let updated; try { updated = await store.transition(ride, user, action, a.to, extra); } catch (e) { if (e.code === 'CONFLICT') return reply(409, { error: e.message + ' Refresh and try again.' }); throw e; }
      return reply(200, { ride: view(store, user, updated) });
    }
    return reply(404, { error: 'Not found.' });
  };
}
function canSee(user, ride) {
  return user.user_type === 'admin' || (user.user_type === 'user' && ride.user_id === user.id) || (user.user_type === 'driver' && ride.driver_id === user.id);
}
