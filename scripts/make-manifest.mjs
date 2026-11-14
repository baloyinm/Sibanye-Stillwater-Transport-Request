// Writes a valid web app manifest from a few settings, so every app installs the same way.
// Library component: ui/offline-pwa-shell-template (1.2.0). No names, colours or paths are built in.
//
// Library use:   import { makeManifest } from './make-manifest.mjs';  const m = makeManifest({ name: 'My App' });
// Command line:  node make-manifest.mjs --name "My App" --short-name App --theme "#0b3d5c" --out web/manifest.webmanifest
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DISPLAYS = ['standalone', 'fullscreen', 'minimal-ui', 'browser'];
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const DEFAULT_ICONS = [
  { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

function fail(msg) { throw new Error('make-manifest: ' + msg); }

export function makeManifest(opts = {}) {
  const name = String(opts.name ?? '').trim();
  if (!name) fail('name is required');
  if (name.length > 45) fail('name is longer than 45 characters (phones cut it off)');
  const shortName = String(opts.shortName ?? name.slice(0, 12)).trim();
  if (shortName.length > 12) fail('shortName is longer than 12 characters (it sits under the home-screen icon)');
  const display = opts.display ?? 'standalone';
  if (!DISPLAYS.includes(display)) fail('display must be one of ' + DISPLAYS.join(', '));
  const themeColor = opts.themeColor ?? '#111111';
  const backgroundColor = opts.backgroundColor ?? '#ffffff';
  for (const [k, v] of [['themeColor', themeColor], ['backgroundColor', backgroundColor]]) {
    if (!HEX.test(v)) fail(k + ' must be a hex colour such as #0b3d5c');
  }
  const icons = opts.icons ?? DEFAULT_ICONS;
  const has = (size, purpose) => icons.some(i => i.sizes === size && String(i.purpose ?? 'any').split(/\s+/).includes(purpose));
  if (!has('192x192', 'any')) fail('icons need a 192x192 icon');
  if (!has('512x512', 'any')) fail('icons need a 512x512 icon');
  if (!has('512x512', 'maskable')) fail('icons need a maskable 512x512 icon (Android crops icons without one)');
  const m = {
    id: opts.id ?? './',
    name,
    short_name: shortName,
    description: opts.description ?? '',
    start_url: opts.startUrl ?? './',
    scope: opts.scope ?? './',
    display,
    orientation: opts.orientation ?? 'any',
    theme_color: themeColor,
    background_color: backgroundColor,
    lang: opts.lang ?? 'en-ZA',
    icons,
  };
  if (!m.description) delete m.description;
  if (opts.shortcuts) m.shortcuts = opts.shortcuts;
  return m;
}

export function writeManifest(path, opts) {
  writeFileSync(path, JSON.stringify(makeManifest(opts), null, 2) + '\n');
}

// Command line
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), get = k => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : undefined; };
  try {
    const out = get('out') ?? 'manifest.webmanifest';
    writeManifest(out, {
      name: get('name'), shortName: get('short-name'), description: get('description'),
      themeColor: get('theme'), backgroundColor: get('background'), display: get('display'),
      startUrl: get('start-url'), scope: get('scope'), id: get('id'), lang: get('lang'),
    });
    console.log('wrote ' + out);
  } catch (e) { console.error(e.message); process.exit(1); }
}
