// Business settings. Each answers one open question in PLAN.md; the default is the safe, simple choice.
// To change an answer, set one environment variable (see .env.example). Nothing here needs a code change.
const pick = (env, key, allowed, dflt) => {
  const v = String(env[key] ?? dflt).trim().toLowerCase();
  if (!allowed.includes(v)) throw new Error(`${key} must be one of: ${allowed.join(', ')}.`);
  return v;
};
export function loadSettings(env = process.env) {
  const s = {
    approvalChain: pick(env, 'APPROVAL_CHAIN', ['single', 'two'], 'single'),        // Q1 single = controller approves; two = supervisor endorses, then controller approves
    placesMode: pick(env, 'PLACES_MODE', ['list', 'free'], 'list'),                  // Q2 list = pick from places; free = type any address
    costCentre: pick(env, 'COST_CENTRE', ['off', 'optional', 'required'], 'off'),    // Q3
    vehicleTypes: String(env.VEHICLE_TYPES || 'Sedan,Bakkie,Minibus,Truck').split(',').map((x) => x.trim()).filter(Boolean), // Q3
    driverAccept: pick(env, 'DRIVER_ACCEPT', ['auto', 'accept'], 'auto'),            // Q4 auto = assigned at once; accept = driver must accept or decline
    notify: pick(env, 'NOTIFY', ['off', 'inapp'], 'off'),                            // Q5 inapp = messages inside the app only. SMS and email are never sent from this app.
    routing: pick(env, 'ROUTING', ['straight', 'road'], 'straight'),                 // Q6 road needs ROUTING_URL (an OSRM-compatible service)
    routingUrl: env.ROUTING_URL || '',
    tracking: pick(env, 'TRACKING', ['phone', 'tracker'], 'phone'),                  // Q7 tracker = vehicle trackers post positions with TRACKER_TOKEN
    trackerToken: env.TRACKER_TOKEN || '',
    rotables: pick(env, 'ROTABLES', ['off', 'on'], 'off'),                           // Q9 on = a requester can also ask for parts to be moved
    retentionDays: env.RETENTION_DAYS ? Number(env.RETENTION_DAYS) : 730,           // Q10 default 2 years until legal review says otherwise
  };
  if (!s.vehicleTypes.length) throw new Error('VEHICLE_TYPES needs at least one type.');
  if (s.routing === 'road' && !/^https?:\/\//.test(s.routingUrl)) throw new Error('ROUTING=road needs ROUTING_URL (http or https).');
  if (s.tracking === 'tracker' && s.trackerToken.length < 16) throw new Error('TRACKING=tracker needs TRACKER_TOKEN of at least 16 characters.');
  if (!Number.isFinite(s.retentionDays) || s.retentionDays < 30) throw new Error('RETENTION_DAYS must be at least 30.');
  return s;
}
/** The part of the settings the browser needs. Never includes tokens or URLs. */
export const publicSettings = (s) => ({ approvalChain: s.approvalChain, placesMode: s.placesMode, costCentre: s.costCentre, vehicleTypes: s.vehicleTypes, driverAccept: s.driverAccept, notify: s.notify, rotables: s.rotables });
