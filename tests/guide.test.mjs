import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemoStore } from '../src/demo-store.mjs';
import { createApp } from '../src/app.mjs';
import { loadSettings } from '../src/settings.mjs';
import { listGuide, guideFile } from '../src/guide.mjs';

const dir = mkdtempSync(join(tmpdir(), 'guide-'));
writeFileSync(join(dir, '05-user-test-guide.pdf'), '%PDF-1.4 demo'); writeFileSync(join(dir, '07-quick-start.docx'), 'PK demo'); writeFileSync(join(dir, 'notes.txt'), 'x'); writeFileSync(join(dir, '.secret.pdf'), 'x');
test('guide lists only pdf and docx files and refuses anything that is not a plain listed name', () => {
  assert.deepEqual(listGuide(dir).map((f) => f.name), ['05-user-test-guide.pdf', '07-quick-start.docx']);
  assert.equal(guideFile(dir, '05-user-test-guide.pdf').type, 'application/pdf');
  for (const bad of ['../package.json', '..%2Fx.pdf', 'notes.txt', '.secret.pdf', 'missing.pdf', '']) assert.equal(guideFile(dir, bad), null, bad);
  assert.deepEqual(listGuide(join(dir, 'nope')), []);
});
test('guide needs sign-in and is served to any signed-in role', async () => {
  const store = await createDemoStore(); const app = createApp(store, { settings: loadSettings({}), guideDir: dir });
  const H = { host: 'x.test', origin: 'http://x.test' };
  assert.equal((await app({ method: 'GET', path: '/api/guide', headers: H })).status, 401);
  let cookie = ''; const login = await app({ method: 'POST', path: '/api/login', body: { email: 'driver1@example.test', password: 'demo-password-001' }, headers: H }); cookie = login.setCookie.split(';')[0];
  const l = await app({ method: 'GET', path: '/api/guide', headers: { ...H, cookie } }); assert.equal(l.body.files.length, 2);
  const f = await app({ method: 'GET', path: '/api/guide/07-quick-start.docx', headers: { ...H, cookie } }); assert.equal(f.status, 200); assert.equal(f.file.name, '07-quick-start.docx');
  assert.equal((await app({ method: 'GET', path: '/api/guide/notes.txt', headers: { ...H, cookie } })).status, 404);
});
