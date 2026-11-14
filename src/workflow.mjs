// Pure rules for a transport request: who may do what, and what comes next. No database here.
export const STATUSES = ['pending', 'approved', 'rejected', 'assigned', 'in_progress', 'completed', 'cancelled'];
export const LABELS = { pending: 'Waiting for approval', approved: 'Approved, needs a driver', rejected: 'Rejected', assigned: 'Driver assigned', in_progress: 'On the way', completed: 'Completed', cancelled: 'Cancelled' };

// action -> { from: [statuses], to, who: 'admin' | 'owner' | 'driver' (the assigned driver) }
export const ACTIONS = {
  approve: { from: ['pending'], to: 'approved', who: ['admin'] },
  reject: { from: ['pending'], to: 'rejected', who: ['admin'], needs: 'reason' },
  assign: { from: ['approved'], to: 'assigned', who: ['admin'], needs: 'driver_id' },
  unassign: { from: ['assigned'], to: 'approved', who: ['admin'] },
  start: { from: ['assigned'], to: 'in_progress', who: ['driver'] },
  complete: { from: ['in_progress'], to: 'completed', who: ['driver'] },
  cancel: { from: ['pending', 'approved', 'assigned'], to: 'cancelled', who: ['admin', 'owner'] },
};

/** Which actions this person may take on this ride right now (used for the buttons and for the server check). */
export function allowedActions(user, ride) {
  const out = [];
  for (const [name, a] of Object.entries(ACTIONS)) {
    if (!a.from.includes(ride.status)) continue;
    const ok = a.who.some((w) => (w === 'admin' && user.user_type === 'admin')
      || (w === 'owner' && ride.user_id === user.id && user.user_type === 'user')
      || (w === 'driver' && user.user_type === 'driver' && ride.driver_id === user.id));
    if (ok) out.push(name);
  }
  return out;
}

/** Check a new request body. Returns { value } or { errors: { field: 'what to do' } }. */
export function validateNewRide(b, now = Date.now()) {
  const errors = {}; const v = {};
  const text = (k, max, req, label) => {
    const s = String(b[k] ?? '').trim();
    if (!s && req) errors[k] = `Enter ${label}.`;
    else if (s.length > max) errors[k] = `Keep ${label} under ${max} characters.`;
    v[k] = s || null;
  };
  text('pickup_address', 300, true, 'where to pick up');
  text('destination_address', 300, true, 'where to go');
  text('purpose', 300, false, 'the reason for the trip');
  const num = (k, lo, hi) => { if (b[k] === '' || b[k] == null) return null; const n = Number(b[k]); if (!Number.isFinite(n) || n < lo || n > hi) { errors[k] = 'Use a valid map position.'; return null; } return n; };
  v.pickup_latitude = num('pickup_latitude', -90, 90); v.pickup_longitude = num('pickup_longitude', -180, 180);
  v.destination_latitude = num('destination_latitude', -90, 90); v.destination_longitude = num('destination_longitude', -180, 180);
  if (v.pickup_latitude == null || v.pickup_longitude == null) errors.pickup_latitude ??= 'Pick a pickup place from the list or enter its map position.';
  v.vehicle_type = String(b.vehicle_type ?? '').trim();
  if (!['Sedan', 'Bakkie', 'Minibus', 'Truck'].includes(v.vehicle_type)) errors.vehicle_type = 'Choose a vehicle type.';
  v.passenger_count = Number(b.passenger_count ?? 1);
  if (!Number.isInteger(v.passenger_count) || v.passenger_count < 1 || v.passenger_count > 60) errors.passenger_count = 'Enter 1 to 60 passengers.';
  if (b.scheduled_at) {
    const t = Date.parse(b.scheduled_at);
    if (Number.isNaN(t)) errors.scheduled_at = 'Enter a valid date and time.';
    else if (t < now - 60000) errors.scheduled_at = 'Choose a time that has not passed.';
    else v.scheduled_at = new Date(t).toISOString();
  } else v.scheduled_at = null;
  return Object.keys(errors).length ? { errors } : { value: v };
}
