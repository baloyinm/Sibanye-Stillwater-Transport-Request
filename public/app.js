const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let me = null, mode = 'demo', timer = null, cfg = { vehicleTypes: ['Sedan', 'Bakkie', 'Minibus', 'Truck'], placesMode: 'list', costCentre: 'off', rotables: 'off' };
const api = async (path, method = 'GET', body) => {
  const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, ...j };
};
const when = (s) => s ? new Date(s).toLocaleString('en-ZA', { hour12: false }) : '';
const LABEL = { endorse: 'Endorsed', accept: 'Accepted by driver', decline: 'Declined by driver', requested: 'Requested', approve: 'Approved', reject: 'Rejected', assign: 'Driver assigned', unassign: 'Driver removed', start: 'Trip started', complete: 'Trip completed', cancel: 'Cancelled' };
const BTN = { endorse: 'Endorse trip', accept: 'Accept this trip', decline: 'Decline this trip', approve: 'Approve trip', reject: 'Reject trip', assign: 'Assign a driver', unassign: 'Remove driver', start: 'Start the trip', complete: 'Mark trip complete', cancel: 'Cancel trip' };
const NEXT = { endorsed: { admin: 'Approve or reject this trip.', user: 'Endorsed. Waiting for the controller.', supervisor: 'Waiting for the controller.' }, offered: { driver: 'Accept or decline this trip.', user: 'Offered to a driver.', admin: 'Waiting for the driver to accept.' }, pending: { supervisor: 'Endorse or reject this trip.', admin: 'Approve or reject this trip.', user: 'Waiting for the controller to approve.' }, approved: { admin: 'Choose a driver for this trip.', user: 'Approved. Waiting for a driver.' }, assigned: { driver: 'Start the trip when you pick up.', user: 'A driver is assigned.', admin: 'Waiting for the driver to start.' }, in_progress: { driver: 'Mark complete when you arrive.', user: 'Your trip is on the way.', admin: 'Trip in progress.' } };
const chip = (r) => `<span class="chip ${r.status}">${esc(r.label)}</span>`;

async function boot() {
  const m = await api('/api/mode'); mode = m.mode; cfg = m.settings ?? cfg; $('#demo-banner').hidden = mode !== 'demo';
  const r = await api('/api/me');
  if (!r.ok) return signIn(m); me = r.user; draw(...parseHash());
}
function signIn(m, error = '') {
  $('#who').innerHTML = '';
  $('#app').innerHTML = `<div class="card"><h2>Sign in</h2>${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
  <form id="f"><label for="e">Email</label><input id="e" type="email" autocomplete="username" required>
  <label for="p">Password</label><input id="p" type="password" autocomplete="current-password" required>
  <p><button class="primary">Sign in</button></p></form></div>
  ${m.demoAccounts ? `<div class="card"><h2>Demo sign-in (demo only)</h2><p class="mut">Made-up accounts. One tap fills the form. Shared demo password.</p><ul class="plain">${m.demoAccounts.map((a) => `<li><button class="link" data-e="${esc(a.email)}">${esc(a.name)} (${esc({ user: 'requester', admin: 'controller', driver: 'driver', supervisor: 'supervisor' }[a.role])})</button></li>`).join('')}</ul></div>` : ''}`;
  document.querySelectorAll('[data-e]').forEach((b) => b.onclick = () => { $('#e').value = b.dataset.e; $('#p').value = m.demoPassword; $('#f').requestSubmit(); });
  $('#f').onsubmit = async (ev) => { ev.preventDefault(); const r = await api('/api/login', 'POST', { email: $('#e').value, password: $('#p').value }); if (!r.ok) return signIn(m, r.error); me = r.user; draw(...parseHash()); };
}
function parseHash() { const m = location.hash.match(/^#\/(new|trip|reports|places)(?:\/([\w-]+))?$/); return m ? [m[1], m[2]] : ['list']; }
window.addEventListener('hashchange', () => { if (me) draw(...parseHash()); });
function render(view = 'list', id) {
  const h = ['new', 'reports', 'places'].includes(view) ? '#/' + view : view === 'trip' ? '#/trip/' + id : '#/';
  if (location.hash === h || (h === '#/' && location.hash === '')) draw(view, id); else location.hash = h;
}
function draw(view = 'list', id) {
  clearInterval(timer);
  const role = { user: 'Requester', admin: 'Controller', driver: 'Driver', supervisor: 'Supervisor' }[me.user_type];
  $('#who').innerHTML = `${esc(me.name)} (${role}) <button class="link" id="out">Sign out</button>`;
  $('#out').onclick = async () => { await api('/api/logout', 'POST'); boot(); };
  if (view === 'reports' && me.user_type === 'admin') return reportsPage(); if (view === 'places' && me.user_type === 'admin') return placesPage(); if (view === 'new') return newTrip(); if (view === 'trip') return tripPage(id); return list();
}
async function list() {
  const r = await api('/api/rides'); const rides = r.rides ?? [];
  const title = { user: 'My trips', admin: 'All trips', supervisor: 'All trips', driver: 'My assigned trips' }[me.user_type];
  const nt = (await api('/api/notices')).notices ?? [];
  $('#app').innerHTML = `<h2>${title}</h2>${me.user_type === 'user' ? '<p><button class="primary" id="new">Request a trip</button></p>' : ''}
  ${me.user_type === 'admin' ? '<p class="row"><button id="rep">Reports</button><button id="plc">Places</button></p>' : ''}
  ${me.user_type === 'driver' ? driverPanel() : ''}
  ${nt.length ? `<div class="card"><h2>Messages</h2><ul class="plain">${nt.slice(0, 5).map((n) => `<li>${n.read_at ? '' : '<strong>New: </strong>'}${esc(n.text)}</li>`).join('')}</ul>${nt.some((n) => !n.read_at) ? '<p><button id="nr">Mark messages as read</button></p>' : ''}</div>` : ''}
  ${rides.length ? rides.map((x) => `<div class="card"><div class="row" style="justify-content:space-between"><strong>${esc(x.pickup_address)} to ${esc(x.destination_address)}</strong>${chip(x)}</div>
    <div class="mut">${esc(x.requester)} · ${esc(x.vehicle_type)} · ${x.kind === 'parts' ? 'parts' : x.passenger_count + ' passenger(s)'}${x.scheduled_at ? ' · ' + when(x.scheduled_at) : ''}</div>
    <p><button data-id="${esc(x.id)}">Open trip</button></p></div>`).join('') : `<div class="card"><p>No trips yet.</p><p class="mut">${me.user_type === 'user' ? 'Choose "Request a trip" to ask for one.' : me.user_type === 'admin' ? 'New requests will appear here.' : 'Trips assigned to you will appear here.'}</p></div>`}`;
  $('#nr')?.addEventListener('click', async () => { await api('/api/notices/read', 'POST'); list(); });
  $('#new')?.addEventListener('click', () => render('new'));
  $('#rep')?.addEventListener('click', () => render('reports')); $('#plc')?.addEventListener('click', () => render('places'));
  document.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => render('trip', b.dataset.id));
  bindDriver(); if (me.user_type !== 'user' || rides.length) timer = setInterval(() => document.hidden || list(), 15000);
}
function driverPanel() { return `<div class="card"><h2>My status</h2><div class="row"><button id="avail-on">I am available</button><button id="avail-off">I am off duty</button><button id="loc">Share my position</button></div><p id="drv-msg" class="mut"></p></div>`; }
function bindDriver() {
  if (me.user_type !== 'driver') return; const say = (t) => $('#drv-msg').textContent = t;
  $('#avail-on').onclick = async () => { await api('/api/driver/available', 'POST', { available: true }); say('Marked available.'); };
  $('#avail-off').onclick = async () => { await api('/api/driver/available', 'POST', { available: false }); say('Marked off duty.'); };
  $('#loc').onclick = () => { if (!navigator.geolocation) return say('This device cannot share a position.'); navigator.geolocation.getCurrentPosition(async (p) => { const r = await api('/api/driver/location', 'POST', { latitude: p.coords.latitude, longitude: p.coords.longitude }); say(r.ok ? 'Position shared.' : r.error); }, () => say('Allow location access in your browser, then try again.')); };
}
async function newTrip(errors = {}, v = {}) {
  const pl = (await api('/api/places')).places ?? [];
  const free = cfg.placesMode === 'free';
  const opt = (sel) => pl.map((p) => `<option value="${esc(p.key)}" ${sel === p.key ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const e = (k) => errors[k] ? `<div class="err" id="e-${k}">${esc(errors[k])}</div>` : '';
  const parts = v.kind === 'parts';
  $('#app').innerHTML = `<h2>Request a trip</h2><p class="mut">Step 1 of 2: tell us the trip. Step 2: ${cfg.approvalChain === 'two' ? 'the supervisor and then the controller approve it' : 'the controller approves it'}.</p>
  ${Object.keys(errors).length ? `<div class="err-sum" role="alert"><strong>Fix these to continue:</strong><ul>${Object.values(errors).map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}
  <form id="f" class="card">
  ${cfg.rotables === 'on' ? `<label for="kd">What is moving</label><select id="kd"><option value="people" ${parts ? '' : 'selected'}>People</option><option value="parts" ${parts ? 'selected' : ''}>Parts</option></select>${e('kind')}` : ''}
  <label for="pk">Pick up from</label>${free ? `<input id="pk" value="${esc(v.pk ?? '')}" maxlength="300" autocomplete="off">` : `<select id="pk">${opt(v.pk)}</select>`}${e('pickup_latitude')}${e('pickup_address')}
  <label for="ds">Going to</label>${free ? `<input id="ds" value="${esc(v.ds ?? '')}" maxlength="300" autocomplete="off">` : `<select id="ds">${opt(v.ds ?? pl[1]?.key)}</select>`}${e('destination_address')}
  <label for="vt">Vehicle needed</label><select id="vt">${cfg.vehicleTypes.map((t) => `<option ${v.vt === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>${e('vehicle_type')}
  ${parts ? `<label for="it">Parts to move (one per line)</label><textarea id="it" rows="4" maxlength="2200">${esc(v.it ?? '')}</textarea>${e('items')}`
    : `<label for="pc">Number of passengers</label><input id="pc" type="number" min="1" max="60" value="${esc(v.pc ?? 1)}" inputmode="numeric">${e('passenger_count')}`}
  ${cfg.costCentre !== 'off' ? `<label for="cc">Cost centre${cfg.costCentre === 'optional' ? ' (optional)' : ''}</label><input id="cc" value="${esc(v.cc ?? '')}" maxlength="50">${e('cost_centre')}` : ''}
  <label for="sa">When (leave empty for as soon as possible)</label><input id="sa" type="datetime-local" value="${esc(v.sa ?? '')}">${e('scheduled_at')}
  <label for="pu">Reason for the trip (optional)</label><input id="pu" value="${esc(v.pu ?? '')}" maxlength="300">
  <p class="row"><button class="primary">Send request</button><button type="button" id="back">Back to my trips</button></p></form>`;
  $('#back').onclick = () => render();
  $('#kd')?.addEventListener('change', () => newTrip({}, { ...grab(), kind: $('#kd').value }));
  const grab = () => ({ kind: $('#kd')?.value ?? 'people', pk: $('#pk').value, ds: $('#ds').value, vt: $('#vt').value, pc: $('#pc')?.value, it: $('#it')?.value, cc: $('#cc')?.value, sa: $('#sa').value, pu: $('#pu').value });
  $('#f').onsubmit = async (ev) => {
    ev.preventDefault(); const form = grab(); const a = pl.find((p) => p.key === form.pk), d = pl.find((p) => p.key === form.ds);
    const body = { kind: form.kind, vehicle_type: form.vt, passenger_count: form.pc, items: form.it, cost_centre: form.cc, scheduled_at: form.sa ? new Date(form.sa).toISOString() : '', purpose: form.pu };
    Object.assign(body, free ? { pickup_address: form.pk, destination_address: form.ds } : { pickup_address: a?.name, pickup_latitude: a?.lat, pickup_longitude: a?.lng, destination_address: d?.name, destination_latitude: d?.lat, destination_longitude: d?.lng });
    const r = await api('/api/rides', 'POST', body);
    if (!r.ok) return newTrip(r.errors ?? { vehicle_type: r.error }, form); render('trip', r.ride.id);
  };
}
async function tripPage(id, msg = '', errors = {}) {
  const r = await api('/api/rides/' + id); if (!r.ok) { $('#app').innerHTML = `<p class="err">${esc(r.error)}</p><button id="b">Back</button>`; $('#b').onclick = () => render(); return; }
  const x = r.ride, tr = r.track; const next = NEXT[x.status]?.[me.user_type];
  let drivers = [];
  if (x.actions.includes('assign')) drivers = (await api('/api/drivers?ride=' + id)).drivers ?? [];
  $('#app').innerHTML = `<p><button class="link" id="b">Back to trips</button></p>
  <div class="card"><h2>${esc(x.pickup_address)} to ${esc(x.destination_address)}</h2><p>${chip(x)}</p>
  ${next ? `<div class="next"><strong>Next step:</strong> ${esc(next)}</div>` : ''}
  ${msg ? `<p class="ok" role="status">${esc(msg)}</p>` : ''}${errors.error ? `<p class="err" role="alert">${esc(errors.error)}</p>` : ''}
  <dl><dt>Requested by</dt><dd>${esc(x.requester)}</dd><dt>Vehicle</dt><dd>${esc(x.vehicle_type)}${x.kind === 'parts' ? ', parts' : ', ' + x.passenger_count + ' passenger(s)'}</dd>${x.items ? `<dt>Parts</dt><dd>${esc(x.items).replace(/\n/g, '<br>')}</dd>` : ''}${x.cost_centre ? `<dt>Cost centre</dt><dd>${esc(x.cost_centre)}</dd>` : ''}
  ${x.scheduled_at ? `<dt>When</dt><dd>${when(x.scheduled_at)}</dd>` : ''}${x.purpose ? `<dt>Reason</dt><dd>${esc(x.purpose)}</dd>` : ''}${x.distance_text ? `<dt>Distance</dt><dd>${esc(x.distance_text)}${x.duration_text ? ', about ' + esc(x.duration_text) : ''}</dd>` : ''}
  ${x.driver_name ? `<dt>Driver</dt><dd>${esc(x.driver_name)}</dd>` : ''}${x.rejection_reason ? `<dt>Rejected because</dt><dd>${esc(x.rejection_reason)}</dd>` : ''}</dl>
  ${tr ? `<div class="card"><h2>Live position</h2><p>${tr.km_to_pickup != null ? `Driver is ${tr.km_to_pickup} km from pickup, ${tr.km_to_destination} km from the destination (straight line).` : 'Waiting for the driver to share a position.'}</p><p class="mut">${esc(tr.vehicle)}${tr.updated_at ? ' · updated ' + when(tr.updated_at) : ''}</p></div>` : ''}
  ${x.actions.includes('reject') ? `<label for="rs">Reason for rejecting</label><input id="rs" maxlength="300">${errors.reason ? `<div class="err">${esc(errors.reason)}</div>` : ''}` : ''}
  ${x.actions.includes('assign') ? `<label for="dv">Driver (nearest free first)</label><select id="dv">${drivers.map((d) => `<option value="${esc(d.id)}" ${d.is_available ? '' : 'disabled'}>${esc(d.name)} · ${esc(d.car_type)}${d.km_to_pickup != null ? ' · ' + d.km_to_pickup + ' km away' : ''}${d.is_available ? '' : d.busy ? ' (on a trip)' : ' (off duty)'}</option>`).join('')}</select>` : ''}
  <p class="row">${x.actions.map((a) => `<button data-a="${a}" class="${['approve', 'endorse', 'accept', 'assign', 'start', 'complete'].includes(a) ? 'primary' : ''}">${BTN[a]}</button>`).join('')}</p></div>
  <div class="card"><h2>History</h2><p><a class="btn" href="/api/rides/${esc(id)}/sheet" target="_blank" rel="noopener">Print trip sheet</a></p><ol class="tl">${r.events.map((e) => `<li>${esc(LABEL[e.type] ?? e.type)} by ${esc(e.actor)}${e.note ? ' (' + esc(e.note) + ')' : ''} <span class="mut">${when(e.at)}</span></li>`).join('')}</ol></div>`;
  $('#b').onclick = () => render();
  document.querySelectorAll('[data-a]').forEach((b) => b.onclick = async () => {
    const a = b.dataset.a; const body = a === 'reject' ? { reason: $('#rs').value } : a === 'assign' ? { driver_id: $('#dv').value } : {};
    if (a === 'cancel' && !confirm('Cancel this trip? This cannot be undone.')) return;
    const res = await api(`/api/rides/${id}/${a}`, 'POST', body);
    tripPage(id, res.ok ? 'Done.' : '', res.ok ? {} : { ...(res.errors ?? {}), error: res.error });
  });
  if (['assigned', 'in_progress'].includes(x.status)) timer = setInterval(() => document.hidden || tripPage(id, msg), 10000);
}
async function reportsPage(from = '', to = '') {
  const qs = new URLSearchParams(); if (from) qs.set('from', from); if (to) qs.set('to', to);
  const r = await api('/api/reports/summary?' + qs); const s = r.summary; const ob = await api('/api/outbox');
  const rows = (o) => Object.entries(o).filter(([, n]) => n).map(([k, n]) => `<tr><th scope="row">${esc(LABELS_S[k] ?? k)}</th><td>${n}</td></tr>`).join('') || '<tr><td colspan="2">None in this period.</td></tr>';
  $('#app').innerHTML = `<p><button id="b">Back to trips</button></p><h2>Reports</h2>
  ${r.ok ? '' : `<p class="err" role="alert">${esc(r.error ?? 'Check the dates.')}</p>`}
  <form id="rf" class="card"><label for="rfrom">From</label><input id="rfrom" type="date" value="${esc(from)}"><label for="rto">To</label><input id="rto" type="date" value="${esc(to)}">
  <p class="row"><button class="primary">Show report</button><a class="btn" id="csv" href="/api/reports/trips.csv?${qs}" download>Download trips (CSV)</a></p></form>
  ${s ? `<div class="card"><h2>${s.total} trip(s)</h2><table><caption class="mut">By status</caption><tbody>${rows(s.by_status)}</tbody></table>
  <table><caption class="mut">By vehicle type</caption><tbody>${rows(s.by_vehicle)}</tbody></table>
  <p>Completed: ${s.completed_passengers} passenger(s), ${s.completed_km_straight_line} km (straight line).</p>
  <p>Average time to approve: ${s.avg_minutes_to_approve == null ? 'no approved trips yet' : s.avg_minutes_to_approve + ' minute(s)'}.</p></div>` : ''}
  <div class="card"><h2>Messages sent</h2>${ob.enabled ? `<p class="mut">${esc(ob.line)}. In redirect mode a message goes only to the test inbox, never to the real person.</p>${ob.entries.length ? `<table><caption class="mut">Latest messages</caption><thead><tr><th scope="col">When</th><th scope="col">Channel</th><th scope="col">What happened</th></tr></thead><tbody>${ob.entries.slice(0, 10).map((e) => `<tr><td>${when(e.at)}</td><td>${esc(e.channel)}</td><td>${esc(e.action === 'block' ? 'Not sent: ' + e.reason : e.redirected ? 'Sent to the test inbox only' : 'Sent')}</td></tr>`).join('')}</tbody></table>` : '<p>No messages yet.</p>'}` : '<p>Email and SMS messages are switched off (setting NOTIFY).</p>'}</div>`;
  $('#b').onclick = () => render();
  $('#rf').onsubmit = (ev) => { ev.preventDefault(); reportsPage($('#rfrom').value ? $('#rfrom').value + 'T00:00:00+02:00' : '', $('#rto').value ? $('#rto').value + 'T23:59:59+02:00' : ''); };
}
const LABELS_S = { pending: 'Waiting for approval', approved: 'Approved, needs a driver', rejected: 'Rejected', assigned: 'Driver assigned', in_progress: 'On the way', completed: 'Completed', cancelled: 'Cancelled' };
async function placesPage(msg = '', errors = {}) {
  const pl = (await api('/api/places?all=1')).places ?? [];
  const e = (k) => errors[k] ? `<div class="err">${esc(errors[k])}</div>` : '';
  $('#app').innerHTML = `<p><button id="b">Back to trips</button></p><h2>Places</h2><p class="mut">Places people can pick for pickup and destination.</p>
  ${msg ? `<p class="ok" role="status">${esc(msg)}</p>` : ''}
  <form id="pf" class="card"><h2>Add a place</h2><label for="pn">Name</label><input id="pn" required>${e('name')}
  <label for="pla">Latitude</label><input id="pla" inputmode="decimal" required>${e('lat')}<label for="plo">Longitude</label><input id="plo" inputmode="decimal" required>${e('lng')}
  <p><button class="primary">Add place</button></p></form>
  ${pl.length ? pl.map((p) => `<div class="card"><strong>${esc(p.name)}</strong> ${p.active ? '' : '<span class="chip cancelled">Hidden</span>'}<div class="mut">${p.lat}, ${p.lng}</div><p><button data-p="${esc(p.key)}" data-on="${p.active ? 0 : 1}">${p.active ? 'Hide this place' : 'Show this place'}</button></p></div>`).join('') : '<div class="card"><p>No places yet. Add the first one above.</p></div>'}`;
  $('#b').onclick = () => render();
  $('#pf').onsubmit = async (ev) => { ev.preventDefault(); const r = await api('/api/places', 'POST', { name: $('#pn').value, lat: $('#pla').value, lng: $('#plo').value }); placesPage(r.ok ? 'Place added.' : '', r.errors ?? {}); };
  document.querySelectorAll('[data-p]').forEach((b) => b.onclick = async () => { const p = pl.find((x) => x.key === b.dataset.p); const r = await api('/api/places/' + p.key, 'POST', { name: p.name, lat: p.lat, lng: p.lng, active: b.dataset.on === '1' }); placesPage(r.ok ? 'Saved.' : r.error ?? ''); });
}
boot();
