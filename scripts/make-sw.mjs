// Makes sw.js for a static site: the saved files are listed in, and the cache name carries a hash of their bytes,
// so a deploy that changes any file replaces the saved copy and one that changes nothing does not.
//   node make-sw.mjs --root web --out web/sw.js --prefix myapp --shell index.html --files index.html,app.js,style.css
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const TEMPLATE = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8');

export function makeServiceWorker({ root, files, prefix = 'app', shell = 'index.html', navTimeoutMs = 4000, push = false, pushTitle = 'Notification', pushIcon = '' }) {
  if (!root) throw new Error('root is required');
  if (!Array.isArray(files) || !files.length) throw new Error('files must list at least one file');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(prefix)) throw new Error('prefix must be lower-case words joined with hyphens');
  if (!files.includes(shell)) throw new Error('shell (' + shell + ') must be one of the files');
  if (!(navTimeoutMs >= 500 && navTimeoutMs <= 30000)) throw new Error('navTimeoutMs must be between 500 and 30000');
  if (typeof push !== 'boolean') throw new Error('push must be true or false');
  if (typeof pushTitle !== 'string' || !pushTitle.trim()) throw new Error('pushTitle must be text');
  if (typeof pushIcon !== 'string' || /^[a-z]+:|^\/\/|\.\./.test(pushIcon)) throw new Error('pushIcon must be a path inside root');
  const list = [...new Set(files)].sort();
  const hash = createHash('sha256');
  for (const f of list) {
    if (/^[a-z]+:|^\/\/|\.\./.test(f)) throw new Error('files must be paths inside root: ' + f);
    hash.update(f + '\0').update(readFileSync(join(root, f))).update('\0');
  }
  const version = hash.digest('hex').slice(0, 10);
  const src = TEMPLATE
    .replace('__PREFIX__', JSON.stringify(prefix))
    .replace('__CACHE__', JSON.stringify(prefix + '-' + version))
    .replace('__PRECACHE__', JSON.stringify(list))
    .replace('__SHELL__', JSON.stringify(shell))
    .replace('__NAV_TIMEOUT__', String(Math.round(navTimeoutMs)))
    .replace('__PUSH__', String(push))
    .replace('__PUSH_TITLE__', JSON.stringify(pushTitle))
    .replace('__PUSH_ICON__', JSON.stringify(pushIcon));
  return { src, version, cache: prefix + '-' + version, files: list };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const a = Object.fromEntries(process.argv.slice(2).reduce((o, v, i, all) => (v.startsWith('--') ? [...o, [v.slice(2), all[i + 1]]] : o), []));
  if (!a.root || !a.out || !a.files) { console.error('usage: node make-sw.mjs --root DIR --out FILE --files a,b,c [--prefix NAME] [--shell index.html] [--nav-timeout-ms 4000] [--push true --push-title Name --push-icon icon-192.png]'); process.exit(2); }
  const r = makeServiceWorker({ root: a.root, files: a.files.split(',').map((s) => s.trim()).filter(Boolean), prefix: a.prefix, shell: a.shell, navTimeoutMs: a['nav-timeout-ms'] ? Number(a['nav-timeout-ms']) : undefined, push: a.push === 'true', pushTitle: a['push-title'], pushIcon: a['push-icon'] });
  writeFileSync(a.out, r.src);
  console.log(a.out + ' written: cache ' + r.cache + ', ' + r.files.length + ' files');
}
