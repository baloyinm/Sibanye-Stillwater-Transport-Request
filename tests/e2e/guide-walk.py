# Walks every scenario of the user guide pack in a real browser, role by role, checks what the guide says you will see,
# and saves one screenshot per step into docs/guides/pack/screens (G-<scenario>-<step>.png). Exit 1 on any failure.
# Needs python playwright + chromium. Starts its own demo servers: default settings, and a second with two-step approval + driver accept.
import json, os, re, subprocess, sys, time, glob
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PACK = os.path.join(ROOT, 'docs/guides/pack')
roles = {r['id']: r['demoPerson'] for r in json.load(open(f'{PACK}/roles.json'))['roles']}
scen = [json.load(open(f)) for f in sorted(glob.glob(f'{PACK}/scenarios/*.json'))]
os.makedirs(f'{PACK}/screens', exist_ok=True)
SERVERS = {'default': (3121, {}), 'two': (3122, {'APPROVAL_CHAIN': 'two', 'DRIVER_ACCEPT': 'accept'})}
procs = []
for name, (port, env) in SERVERS.items():
    procs.append(subprocess.Popen(['node', 'src/server.mjs'], cwd=ROOT, env={**os.environ, 'PORT': str(port), **env}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
time.sleep(2)
fails = []; shots = 0
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for i, sc in enumerate(scen, 1):
            port = SERVERS['two' if 'two-step' in sc['workflow'] else 'default'][0]; base = f'http://127.0.0.1:{port}/'
            pages = {}; tid = None
            def page_for(role):
                if role not in pages:
                    ctx = b.new_context(viewport={'width': 390, 'height': 844}); pg = ctx.new_page(); pg.goto(base)
                    pg.click(f'button:has-text("{roles[role]}")'); pg.wait_for_selector('#who button'); pages[role] = pg
                return pages[role]
            for st in sc['steps']:
                pg = page_for(st['role']); lab = st['label']
                try:
                    if tid and st['role'] != sc['steps'][st['n'] - 2]['role'] if st['n'] > 1 else False:
                        pg.goto(base + '#/trip/' + tid); pg.reload(); pg.wait_for_selector('.card')
                    if lab == 'Send request':
                        if not pg.query_selector('#f'): pg.click('#new'); pg.wait_for_selector('#f')
                        pg.click('#f .primary'); pg.wait_for_selector('text=Next step'); tid = pg.url.split('/')[-1]
                    elif lab == 'Request a trip': pg.click('#new'); pg.wait_for_selector('#f')
                    elif lab == 'Reject trip': pg.fill('#rs', 'No vehicle is free'); pg.click('button[data-a=reject]'); pg.wait_for_selector('text=Rejected')
                    elif lab == 'Places': pg.goto(base + '#/places'); pg.reload(); pg.wait_for_selector('#pf')
                    elif lab == 'Reports': pg.click('#rep'); pg.wait_for_selector('text=By status')
                    elif lab == 'Add place': pg.fill('#pn', 'Demo Gate Z'); pg.fill('#pla', '-26.5'); pg.fill('#plo', '27.5'); pg.click('#pf button'); pg.wait_for_selector('text=Place added.')
                    elif lab == 'Print trip sheet':
                        assert pg.query_selector(f'a[href^="/api/rides/{tid}/sheet"]'), 'no print link'
                        r = pg.request.get(base + f'api/rides/{tid}/sheet'); assert r.ok and 'Trip sheet' in r.text(), 'sheet not served'
                    elif lab == 'User guide': pg.goto(base); pg.reload(); pg.wait_for_selector('#gd'); pg.click('#gd'); pg.wait_for_selector('text=Made-up demo people')
                    elif lab is None: pg.goto(base + '#/trip/' + tid); pg.reload(); pg.wait_for_selector('.card')
                    else: pg.click(f'button:has-text("{lab}")'); pg.wait_for_timeout(400)
                    text = re.sub(r'\s+', ' ', pg.inner_text('body')).lower()
                    for q in re.findall(r"'([^']{2,}?)'", st['expect']):
                        if q.lower() not in text: raise AssertionError(f'"{q}" not on screen')
                    pg.screenshot(path=f"{PACK}/screens/G-{i:02d}-{st['n']}.png"); shots += 1
                    print(f"{sc['id']}/{st['n']} ok")
                except Exception as e:
                    fails.append(f"{sc['id']}/{st['n']} {lab}: {str(e)[:120]}"); print('FAIL', fails[-1])
            for pg in pages.values(): pg.context.close()
        b.close()
finally:
    for pr in procs: pr.terminate()
print(f'WALK: {len(fails)} failure(s), {shots} screenshot(s)'); sys.exit(1 if fails else 0)
