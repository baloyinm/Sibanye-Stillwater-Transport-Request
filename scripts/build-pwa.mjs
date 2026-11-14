// Writes public/manifest.webmanifest and public/sw.js. Run after any change to a file in public/ (npm run build).
// Only these static files are saved for offline. API answers are never saved (the worker only keeps files listed here).
import { writeFileSync } from 'node:fs';
import { makeServiceWorker } from './make-sw.mjs';
import { makeManifest } from './make-manifest.mjs';
export const FILES = ['index.html', 'app.js', 'app.css', 'pwa.js', 'pwa-config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon-180.png'];
const m = makeManifest({ name: 'Transport Hub', shortName: 'Transport', themeColor: '#0b5cad', backgroundColor: '#f6f7f9', description: 'Request, approve, dispatch and track trips.',
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] });
writeFileSync('public/manifest.webmanifest', typeof m === 'string' ? m : JSON.stringify(m, null, 2));
const sw = makeServiceWorker({ root: 'public', files: FILES, prefix: 'transport-hub', shell: 'index.html' });
writeFileSync('public/sw.js', typeof sw === 'string' ? sw : sw.src);
console.log('PWA files written.');
