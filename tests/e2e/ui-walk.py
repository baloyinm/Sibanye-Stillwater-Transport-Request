# Browser walk of the whole flow with every setting switched on. Needs: python playwright + chromium; server on PORT.
# Usage: PORT=3111 APPROVAL_CHAIN=two DRIVER_ACCEPT=accept ROTABLES=on COST_CENTRE=required NOTIFY=inapp node src/server.mjs & python3 tests/e2e/ui-walk.py
import os, sys
from playwright.sync_api import sync_playwright
BASE = f"http://127.0.0.1:{os.environ.get('PORT', '3111')}/"
errs = []
def sideways(pg, where):
    assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'sideways scroll: ' + where
with sync_playwright() as p:
    b = p.chromium.launch()
    for w in (390, 1280):
        for scheme in ('light', 'dark'):
            def as_(name):
                ctx = b.new_context(viewport={'width': w, 'height': 800}, color_scheme=scheme); pg = ctx.new_page()
                pg.on('pageerror', lambda e: errs.append(str(e)))
                pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '401' not in m.text else None)
                pg.goto(BASE); pg.click(f'text={name}'); pg.wait_for_selector('#who button'); return pg
            u = as_('Demo Requester One'); u.click('#new'); u.wait_for_selector('#kd'); u.select_option('#kd', 'parts')
            u.wait_for_selector('#it'); u.fill('#it', 'Pump housing\nSeal kit'); u.fill('#cc', 'CC-100'); u.select_option('#vt', 'Bakkie'); sideways(u, 'new trip'); u.click('#f .primary')
            u.wait_for_selector('text=Next step'); tid = u.url.split('/')[-1]
            s = as_('Demo Supervisor'); s.goto(BASE + '#/trip/' + tid); s.reload(); s.wait_for_selector('text=Endorse trip'); s.click('button[data-a=endorse]'); s.wait_for_selector('text=Endorsed, waiting')
            a = as_('Demo Controller'); a.goto(BASE + '#/trip/' + tid); a.reload(); a.click('button[data-a=approve]'); a.wait_for_selector('text=Approved, needs a driver'); a.wait_for_selector('#dv'); a.click('button[data-a=assign]'); a.wait_for_selector('text=Offered to the driver')
            d = as_('Demo Driver One'); d.goto(BASE + '#/trip/' + tid); d.reload(); d.click('button[data-a=accept]'); d.wait_for_selector('button[data-a=start]'); d.click('button[data-a=start]'); d.wait_for_selector('button[data-a=complete]'); d.click('button[data-a=complete]'); d.wait_for_selector('text=Completed')
            u.goto(BASE); u.reload(); u.wait_for_selector('text=Messages'); sideways(u, 'list'); a.goto(BASE + '#/reports'); a.reload(); a.wait_for_selector('text=By status'); sideways(a, 'reports')
            print(w, scheme, 'ok')
    print('errors', errs); sys.exit(1 if errs else 0)
