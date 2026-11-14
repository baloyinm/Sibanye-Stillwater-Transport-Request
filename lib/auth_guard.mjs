// data/php-session-auth-guard v1.1.0 - Node.js port: sessions, roles, throttling, password upgrade.
// Node 22 standard library only. Same settings.json keys as the PHP file; functions are camelCase.
// Clock (deps.now, seconds) and randomness (deps.randomBytes) are injectable. The database is an adapter you supply.
import { scrypt as scryptCb, randomBytes as cryptoRandom, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

export const DEFAULTS = {
  users_table: 'users', id_col: 'id', login_col: 'email', password_col: 'password',
  role_col: 'role', status_col: 'status',      // status_col '' skips the status check
  allowed_status: ['active', 'approved'],
  max_attempts: 5, window_sec: 900, session_name: 'APPSESSID', session_ttl: 28800,
  allowed_origins: [],                         // empty = same host only
  public_fields: ['id', 'name', 'email', 'role', 'status'],
};

/** Read settings.json (one folder up) over the defaults; `overrides` win. */
export function loadSettings(overrides = {}, path = new URL('../settings.json', import.meta.url)) {
  let file = {};
  try { file = JSON.parse(readFileSync(path, 'utf8')); } catch { /* defaults */ }
  return { ...DEFAULTS, ...file, ...overrides };
}
const opts = (o = {}) => ({ ...DEFAULTS, ...o });
const nowOf = (deps) => (deps?.now ? deps.now() : Math.floor(Date.now() / 1000));
const rndOf = (deps) => (deps?.randomBytes ?? cryptoRandom);

// ---- passwords: scrypt$N$r$p$salt(b64)$hash(b64) ----
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

async function derive(plain, salt, N, r, p, keylen) {
  return scrypt(plain.normalize('NFKC'), salt, keylen, { N, r, p, maxmem: 128 * N * r * 2 });
}

/** Make a scrypt hash string. */
export async function hashPassword(plain, deps = {}) {
  const salt = Buffer.from(rndOf(deps)(16));
  const { N, r, p, keylen } = SCRYPT;
  const h = await derive(plain, salt, N, r, p, keylen);
  return ['scrypt', N, r, p, salt.toString('base64'), h.toString('base64')].join('$');
}

const sha = (s) => createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => timingSafeEqual(sha(a), sha(b));   // equal length by construction

/**
 * Check a password against what is stored: a scrypt hash, or legacy plain text.
 * Returns { ok, newHash }: newHash is set when the stored value should be replaced.
 */
export async function verifyPassword(plain, stored, deps = {}) {
  if (typeof stored !== 'string' || stored === '' || typeof plain !== 'string') return { ok: false, newHash: null };
  if (stored.startsWith('scrypt$')) {
    const [, N, r, p, saltB, hashB] = stored.split('$');
    const salt = Buffer.from(saltB ?? '', 'base64'); const want = Buffer.from(hashB ?? '', 'base64');
    const n = Number(N), rr = Number(r), pp = Number(p);
    if (!want.length || !salt.length || !Number.isInteger(n) || n < 2 || n > 2 ** 20 || !(rr > 0) || !(pp > 0)) {
      return { ok: false, newHash: null };
    }
    const got = await derive(plain, salt, n, rr, pp, want.length);
    if (!timingSafeEqual(got, want)) return { ok: false, newHash: null };
    const stale = n !== SCRYPT.N || rr !== SCRYPT.r || pp !== SCRYPT.p;
    return { ok: true, newHash: stale ? await hashPassword(plain, deps) : null };
  }
  if (!safeEqual(stored, plain)) return { ok: false, newHash: null };   // legacy plain text
  return { ok: true, newHash: await hashPassword(plain, deps) };
}

// ---- stores and adapters ----
/** Default session store: get/set/delete over a Map. Swap for Redis etc. with the same three methods. */
export function memorySessionStore() {
  const m = new Map();
  return { get: (id) => m.get(id), set: (id, v) => { m.set(id, v); }, delete: (id) => { m.delete(id); }, size: () => m.size };
}

/**
 * In-memory DB adapter for tests. Real adapters supply the same methods:
 * findUserByLogin(login), findUserById(id), updatePasswordHash(id, hash),
 * countAttempts(key, sinceSec), recordAttempt(key, nowSec); optional clearAttempts(key), purgeAttempts(beforeSec).
 */
export function memoryDbAdapter(users = [], o = {}) {
  const s = opts(o); const rows = users.map((u) => ({ ...u })); const attempts = [];
  return {
    users: rows, attempts,
    async findUserByLogin(login) { return rows.find((u) => String(u[s.login_col]).toLowerCase() === login) ?? null; },
    async findUserById(id) { return rows.find((u) => String(u[s.id_col]) === String(id)) ?? null; },
    async updatePasswordHash(id, hash) { const u = rows.find((x) => String(x[s.id_col]) === String(id)); if (u) u[s.password_col] = hash; },
    async countAttempts(key, sinceSec) { return attempts.filter((a) => a.key === key && a.at >= sinceSec).length; },
    async recordAttempt(key, nowSec) { attempts.push({ key, at: nowSec }); },
    async clearAttempts(key) { for (let i = attempts.length - 1; i >= 0; i--) if (attempts[i].key === key) attempts.splice(i, 1); },
    async purgeAttempts(beforeSec) { for (let i = attempts.length - 1; i >= 0; i--) if (attempts[i].at < beforeSec) attempts.splice(i, 1); },
  };
}

// ---- sessions ----
function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
const newId = (deps) => Buffer.from(rndOf(deps)(32)).toString('hex');

function cookieHeader(session, o) {
  return `${o.session_name}=${session.id}; Path=/; HttpOnly; SameSite=Lax` + (session.https ? '; Secure' : '');
}

/**
 * Start (or resume) a session. req: { headers: { cookie }, https }. deps: { store, now, randomBytes }.
 * Strict mode: an unknown id is never adopted. Idle longer than session_ttl starts a fresh, signed-out session.
 * Send `session.setCookie` as the Set-Cookie header.
 */
export async function startSession(req = {}, o = {}, deps = {}) {
  o = opts(o); const store = deps.store; const now = nowOf(deps);
  const sent = parseCookies(req.headers?.cookie ?? req.headers?.Cookie)[o.session_name];
  let id = null; let data = null;
  if (sent && /^[0-9a-f]{64}$/.test(sent)) {
    const rec = await store.get(sent);
    if (rec && now - rec.seen <= o.session_ttl) { id = sent; data = rec; }
    else if (rec) await store.delete(sent);          // idle timeout
  }
  const session = { id: id ?? newId(deps), uid: data?.uid ?? null, https: !!req.https, isNew: id === null, setCookie: '' };
  await store.set(session.id, { uid: session.uid, seen: now });
  session.setCookie = cookieHeader(session, o);
  return session;
}

/** Drop the session from the store; the cookie is expired. */
export async function logout(session, o = {}, deps = {}) {
  o = opts(o);
  await deps.store.delete(session.id);
  session.uid = null;
  session.setCookie = `${o.session_name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` + (session.https ? '; Secure' : '');
}

// ---- throttle ----
/** Count one attempt for `key`; false when over the limit in the window. */
export async function throttle(db, key, o = {}, deps = {}) {
  o = opts(o); const now = nowOf(deps); key = String(key).slice(0, 190);
  if (db.purgeAttempts) await db.purgeAttempts(now - o.window_sec);
  if ((await db.countAttempts(key, now - o.window_sec)) >= o.max_attempts) return false;
  await db.recordAttempt(key, now);
  return true;
}
export async function throttleClear(db, key) {
  if (db.clearAttempts) await db.clearAttempts(String(key).slice(0, 190));
}

// ---- login and users ----
/** Fields safe to send back; the password column is never included. */
export function publicUser(u, o = {}) {
  o = opts(o); const out = {};
  for (const f of o.public_fields) {
    if (f !== o.password_col && Object.hasOwn(u, f)) out[f] = u[f];
  }
  return out;
}

let dummyHash;   // spent on unknown users so they cost the same time as wrong passwords

/**
 * Sign in. Returns { user } or { error: 'throttled' | 'invalid' | 'inactive' }.
 * Same 'invalid' for unknown user and wrong password. New session id on success; only the user id is stored.
 */
export async function login(session, db, loginName, password, o = {}, deps = {}, ip = '') {
  o = opts(o); const now = nowOf(deps);
  const name = String(loginName ?? '').trim().toLowerCase();
  const keyA = `login:${name}`; const keyB = `ip:${ip}`;
  if (!(await throttle(db, keyA, o, deps))
    || (ip !== '' && !(await throttle(db, keyB, { ...o, max_attempts: o.max_attempts * 4 }, deps)))) {
    return { error: 'throttled' };
  }
  const u = await db.findUserByLogin(name);
  if (!u) { dummyHash ??= await hashPassword('x', deps); await verifyPassword(String(password ?? ''), dummyHash, deps); return { error: 'invalid' }; }
  const { ok, newHash } = await verifyPassword(String(password ?? ''), u[o.password_col], deps);
  if (!ok) return { error: 'invalid' };
  if (o.status_col !== '' && !o.allowed_status.includes(u[o.status_col] ?? '')) return { error: 'inactive' };
  if (newHash !== null) await db.updatePasswordHash(u[o.id_col], newHash);
  await throttleClear(db, keyA);
  await deps.store.delete(session.id);               // session fixation: never keep the old id
  session.id = newId(deps); session.uid = u[o.id_col]; session.isNew = true;
  await deps.store.set(session.id, { uid: session.uid, seen: now });
  session.setCookie = cookieHeader(session, o);
  return { user: publicUser(u, o) };
}

/** The signed-in user, read fresh so a disabled account or role change applies at once; or null. */
export async function user(session, db, o = {}) {
  o = opts(o);
  if (session?.uid === null || session?.uid === undefined || session.uid === '') return null;
  const u = await db.findUserById(session.uid);
  if (!u) return null;
  if (o.status_col !== '' && !o.allowed_status.includes(u[o.status_col] ?? '')) return null;
  return u;
}

/** Decide only; the caller sends the answer. 200, 401 (not signed in) or 403 (wrong role). */
export function roleStatus(u, roles, o = {}) {
  o = opts(o);
  if (!u) return 401;
  if (!roles || roles.length === 0) return 200;
  return roles.includes(u[o.role_col] ?? '') ? 200 : 403;
}

/** True when the user may touch a row: owner by column, or one of the staff roles. */
export function owns(u, row, ownerCol, staffRoles = [], o = {}) {
  o = opts(o);
  if (staffRoles.includes(u[o.role_col] ?? '')) return true;
  return row[ownerCol] !== undefined && row[ownerCol] !== null && String(row[ownerCol]) === String(u[o.id_col]);
}

/** Refuse cross-site writes. GET/HEAD/OPTIONS pass. req: { method, headers }. */
export function originOk(req = {}, o = {}) {
  o = opts(o);
  const method = String(req.method ?? 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  const h = {}; for (const [k, v] of Object.entries(req.headers ?? {})) h[k.toLowerCase()] = v;
  let origin = h.origin ?? '';
  if (origin === '') {                                // fall back to Referer
    if (!h.referer) return false;
    try { origin = new URL(h.referer).origin; } catch { return false; }
  }
  if (o.allowed_origins.length) return o.allowed_origins.includes(origin);
  let host; try { host = new URL(origin).host; } catch { return false; }
  return !!h.host && h.host.toLowerCase() === host.toLowerCase();
}
