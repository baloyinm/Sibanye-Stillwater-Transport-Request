/* Phone-app helper for a plain web page (ui/offline-pwa-shell-template). No dependencies, no build step.
   Registers the service worker and shows four small messages at the bottom of the screen:
   offline, new version ready (Reload / Later), install this app (Install / Not now), and on iPhone how to add to the Home Screen.
   Settings: set window.PWA_CONFIG before this script loads (all optional). */
(function () {
  'use strict';
  var D = {
    sw: 'sw.js', scope: './', appName: 'this app', dismissDays: 14, iosDelayMs: 4000, updateEveryMs: 3600000,
    colors: { bg: '#0A1822', ink: '#E6F4F8', line: '#1FA3B8', accent: '#4FD8EC', warn: '#F2B441' },
    texts: {
      offline: 'Offline. Showing what was saved on this device.',
      update: 'A new version is ready.', reload: 'Reload', later: 'Later',
      install: 'Install {app} on this phone to open it full screen.', installBtn: 'Install', notNow: 'Not now',
      ios: 'To install {app}: tap Share, then Add to Home Screen.', gotIt: 'Got it',
      installing: '{app} is installing. Look for it on your home screen or in your apps.',
      installHint: 'Not installed yet. To install: open the browser menu, then choose Install app (on iPhone: Share, then Add to Home Screen).'
    }
  };
  var C = window.PWA_CONFIG || {};
  var cfg = { sw: C.sw || D.sw, scope: C.scope || D.scope, appName: C.appName || D.appName, dismissDays: C.dismissDays || D.dismissDays, iosDelayMs: C.iosDelayMs == null ? D.iosDelayMs : C.iosDelayMs, updateEveryMs: C.updateEveryMs || D.updateEveryMs,
    colors: Object.assign({}, D.colors, C.colors), texts: Object.assign({}, D.texts, C.texts) };
  function t(k) { return String(cfg.texts[k]).replace('{app}', cfg.appName); }
  function noop() {}

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: the message just comes back next visit */ } }
  function dismissed(name) { var at = Number(get('pwa.dismissed.' + name)); return !!at && Date.now() - at < cfg.dismissDays * 86400000; }
  function dismiss(name) { set('pwa.dismissed.' + name, String(Date.now())); }
  function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }

  var bar = null;
  function ensureBar() {
    if (bar && bar.isConnected) return bar;
    bar = document.createElement('div');
    bar.id = 'pwa-bar';
    var s = bar.style;
    s.position = 'fixed'; s.left = '12px'; s.right = '12px'; s.bottom = 'calc(12px + env(safe-area-inset-bottom, 0px))';
    s.display = 'flex'; s.flexDirection = 'column'; s.alignItems = 'center'; s.gap = '8px'; s.zIndex = '2147483000'; s.pointerEvents = 'none';
    (document.body || document.documentElement).appendChild(bar);
    return bar;
  }
  function button(label, onClick, primary) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = label;
    var s = b.style;
    s.font = 'inherit'; s.fontSize = '14px'; s.fontWeight = '600'; s.cursor = 'pointer'; s.padding = '8px 14px'; s.minHeight = '40px'; s.borderRadius = '8px';
    s.border = '1px solid ' + cfg.colors.line; s.background = primary ? cfg.colors.accent : 'transparent'; s.color = primary ? cfg.colors.bg : cfg.colors.ink;
    b.addEventListener('click', onClick);
    return b;
  }
  function remove(id) { var el = document.getElementById('pwa-' + id); if (el) el.remove(); }
  function card(id, text, buttons, tone) {
    remove(id);
    var el = document.createElement('div');
    el.id = 'pwa-' + id;
    el.setAttribute('role', id === 'install' || id === 'ios' ? 'group' : 'status');
    el.setAttribute('aria-label', text);
    var s = el.style;
    s.pointerEvents = 'auto'; s.boxSizing = 'border-box'; s.maxWidth = '420px'; s.width = '100%'; s.padding = '10px 12px'; s.borderRadius = '12px';
    s.background = cfg.colors.bg; s.color = cfg.colors.ink; s.border = '1px solid ' + (tone === 'warn' ? cfg.colors.warn : cfg.colors.line);
    s.boxShadow = '0 6px 24px rgba(0,0,0,.45)'; s.fontSize = '14px'; s.lineHeight = '1.35'; s.display = 'flex'; s.flexWrap = 'wrap'; s.alignItems = 'center'; s.gap = '8px 12px';
    var p = document.createElement('span'); p.textContent = text; p.style.flex = '1 1 180px'; el.appendChild(p);
    (buttons || []).forEach(function (b) { el.appendChild(button(b[0], b[1], b[2])); });
    ensureBar().appendChild(el);
    return el;
  }

  // offline
  function syncOnline() { if (navigator.onLine === false) card('offline', t('offline'), [], 'warn'); else remove('offline'); }
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);
  function start() { syncOnline(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  // install (Android and desktop Chrome)
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    if (standalone() || dismissed('install')) return;
    card('install', t('install'), [
      [t('installBtn'), function () {
        var d = deferred; deferred = null; remove('install'); if (!d) return;
        function hint() { card('install-hint', t('installHint'), [[t('gotIt'), function () { remove('install-hint'); }, true]]); }
        try { d.prompt(); } catch (e) { hint(); return; }
        if (!d.userChoice) return;
        d.userChoice.then(function (c) {
          if (c && c.outcome === 'accepted') { card('install-done', t('installing'), []); setTimeout(function () { remove('install-done'); }, 8000); } else hint();
        }, hint);
      }, true],
      [t('notNow'), function () { dismiss('install'); remove('install'); }]
    ]);
  });
  window.addEventListener('appinstalled', function () { deferred = null; remove('install'); remove('ios'); });

  // install (iPhone and iPad Safari have no install prompt)
  var ua = navigator.userAgent || '';
  var iosSafari = /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  if (iosSafari && !standalone() && !dismissed('ios') && cfg.iosDelayMs >= 0) {
    setTimeout(function () {
      if (standalone()) return;
      card('ios', t('ios'), [[t('gotIt'), function () { dismiss('ios'); remove('ios'); }, true]]);
    }, cfg.iosDelayMs);
  }

  // service worker and updates
  var sw = navigator.serviceWorker;
  var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (sw && secure) {
    var hadController = !!sw.controller;
    var reloading = false;
    sw.addEventListener('controllerchange', function () { if (!hadController || reloading) return; reloading = true; location.reload(); });
    var offer = function (worker) {
      card('update', t('update'), [
        [t('reload'), function () { remove('update'); worker.postMessage('skipWaiting'); }, true],
        [t('later'), function () { remove('update'); }]
      ]);
    };
    var watch = function (reg) {
      if (reg.waiting && sw.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var w = reg.installing; if (!w) return;
        w.addEventListener('statechange', function () { if (w.state === 'installed' && sw.controller) offer(w); });
      });
    };
    var register = function () {
      sw.register(cfg.sw, { scope: cfg.scope }).then(function (reg) {
        watch(reg);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) reg.update().catch(noop); });
        setInterval(function () { reg.update().catch(noop); }, cfg.updateEveryMs);
      }).catch(noop);
    };
    if (document.readyState === 'complete') register(); else window.addEventListener('load', register);
  }
})();
