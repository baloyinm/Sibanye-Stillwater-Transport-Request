// Pure rules for a transport request: who may do what, and what comes next. No database here.
export const STATUSES = ['pending', 'endorsed', 'approved', 'rejected', 'offered', 'assigned', 'in_progress', 'completed', 'cancelled'];
export const LABELS = { pending: 'Waiting for approval', endorsed: 'Endorsed, waiting for the controller', approved: 'Approved, needs a driver', rejected: 'Rejected', offered: 'Offered to the driver', assigned: 'Driver assigned', in_progress: 'On the way', completed: 'Completed', cancelled: 'Cancelled' };
export const BUSY = ['offered', 'assigned', 'in_progress'];

const DEFAULTS = { approvalChain: 'single', driverAccept: 'auto', placesMode: 'list', costCentre: 'off', vehicleTypes: ['Sedan', 'Bakkie', 'Minibus', 'Truck'], rotables: 'off' };

/** action -> { from, to, who: ['admin'|'supervisor'|'owner'|'driver'], needs? }. The table depends on two settings (Q1 and Q4). */
export function buildActions(settings = DEFAULTS) {
  const two = settings.approvalChain === 'two'; const accept = settings.driverAccept === 'accept';
  const A = {};
  if (two) {
    A.endorse = { from: ['pending'], to: 'endorsed', who: ['supervisor'] };
    A.approve = { from: ['endorsed'], to: 'approved', who: ['admin'] };
    A.reject = { from: ['pending', 'endorsed'], to: 'rejected', who: ['supervisor', 'admin'], needs: 'reason' };
  } else {
    A.approve = { from: ['pending'], to: 'approved', who: ['admin'] };
    A.reject = { from: ['pending'], to: 'rejected', who: ['admin'], needs: 'reason' };
  }
  A.assign = { from: ['approved'], to: accept ? 'offered' : 'assigned', who: ['admin'], needs: 'driver_id' };
  if (accept) {
    A.accept = { from: ['offered'], to: 'assigned', who: ['driver'] };
    A.decline = { from: ['offered'], to: 'approved', who: ['driver'] };
  }
  A.unassign = { from: accept ? ['offered', 'assigned'] : ['assigned'], to: 'approved', who: ['admin'] };
  A.start = { from: ['assigned'], to: 'in_progress', who: ['driver'] };
  A.complete = { from: ['in_progress'], to: 'completed', who: ['driver'] };
  A.cancel = { from: ['pending', 'endorsed', 'approved', 'offered', 'assigned'], to: 'cancelled', who: ['admin', 'owner'] };
  return A;
}
export const ACTIONS = buildActions();

/** Which actions this person may take on this ride right now (used for the buttons and for the server check). */
export function allowedActions(user, ride, actions = ACTIONS) {
  const out = [];
  for (const [name, a] of Object.entries(actions)) {
    if (!a.from.includes(ride.status)) continue;
    const ok = a.who.some((w) => (w === 'admin' && user.user_type === 'admin') || (w === 'supervisor' && user.user_type === 'supervisor')
      || (w === 'owner' && ride.user_id === user.id && user.user_type === 'user')
      || (w === 'driver' && user.user_type === 'driver' && ride.driver_id === user.id));
    if (ok) out.push(name);
  }
  return out;
}

/** Check a new request body. Returns { value } or { errors: { field: 'what to do' } }. */
export function validateNewRide(b, now = Date.now(), settings = DEFAULTS) {
  const errors = {}; const v = {};
  const text = (k, max, req, label) => {
    const s = String(b[k] ?? '').trim();
    if (!s && req) errors[k] = `Enter ${label}.`;
    else if (s.length > max) errors[k] = `Keep ${label} under ${max} characters.`;
    v[k] = s || null;
  };
  v.kind = String(b.kind ?? 'people');
  if (!['people', 'parts'].includes(v.kind) || (v.kind === 'parts' && settings.rotables !== 'on')) errors.kind = 'Choose people or parts.';
  text('pickup_address', 300, true, 'where to pick up');
  text('destination_address', 300, true, 'where to go');
  text('purpose', 300, false, 'the reason for the trip');
  const free = settings.placesMode === 'free';
  const num = (k, lo, hi) => { if (b[k] === '' || b[k] == null) return null; const n = Number(b[k]); if (!Number.isFinite(n) || n < lo || n > hi) { errors[k] = 'Use a valid map position.'; return null; } return n; };
  v.pickup_latitude = num('pickup_latitude', -90, 90); v.pickup_longitude = num('pickup_longitude', -180, 180);
  v.destination_latitude = num('destination_latitude', -90, 90); v.destination_longitude = num('destination_longitude', -180, 180);
  if (!free && (v.pickup_latitude == null || v.pickup_longitude == null)) errors.pickup_latitude ??= 'Pick a pickup place from the list or enter its map position.';
  v.vehicle_type = String(b.vehicle_type ?? '').trim();
  if (!settings.vehicleTypes.includes(v.vehicle_type)) errors.vehicle_type = 'Choose a vehicle type.';
  if (v.kind === 'parts') {
    const lines = String(b.items ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
    if (!lines.length) errors.items = 'List the parts to move, one per line.';
    else if (lines.length > 20 || lines.some((l) => l.length > 100)) errors.items = 'List at most 20 parts, each under 100 characters.';
    v.items = lines.join('\n'); v.passenger_count = 0;
  } else {
    v.items = null; v.passenger_count = Number(b.passenger_count ?? 1);
    if (!Number.isInteger(v.passenger_count) || v.passenger_count < 1 || v.passenger_count > 60) errors.passenger_count = 'Enter 1 to 60 passengers.';
  }
  const cc = String(b.cost_centre ?? '').trim();
  if (settings.costCentre === 'off') v.cost_centre = null;
  else if (!cc && settings.costCentre === 'required') errors.cost_centre = 'Enter the cost centre this trip is charged to.';
  else if (cc.length > 50 || (cc && !/^[\w .\/-]+$/.test(cc))) errors.cost_centre = 'Use letters, numbers, spaces, dots, dashes or slashes (up to 50).';
  else v.cost_centre = cc || null;
  if (b.scheduled_at) {
    const t = Date.parse(b.scheduled_at);
    if (Number.isNaN(t)) errors.scheduled_at = 'Enter a valid date and time.';
    else if (t < now - 60000) errors.scheduled_at = 'Choose a time that has not passed.';
    else v.scheduled_at = new Date(t).toISOString();
  } else v.scheduled_at = null;
  return Object.keys(errors).length ? { errors } : { value: v };
}
