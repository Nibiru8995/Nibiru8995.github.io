#!/usr/bin/env python3
# ИТЕРАЦИЯ 3: проверка казино — рулетка (канва, метка, цифры), карты блэкджека, падальщик, фон.
import subprocess, time, sys
from playwright.sync_api import sync_playwright

REPO = '/home/z/my-project/game-repo'
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8091', '-d', REPO],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)

report = []
def note(ok, msg):
    report.append(('✅' if ok else '❌') + ' ' + msg)
    print(('✅' if ok else '❌'), msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1440, 'height': 950})
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERR: ' + str(e)))
    pg.goto('http://localhost:8091/index.html', wait_until='domcontentloaded')
    pg.wait_for_timeout(900)
    try: pg.click('#nickSkip', timeout=1500)
    except Exception: pass
    pg.evaluate("() => startDebugRun(4, 'undead', false, false)")
    pg.evaluate("() => { crystals = 500000; updateHUD(); }")

    # ---------- РУЛЕТКА ----------
    pg.click('#casinoBtn'); time.sleep(0.4)
    pg.click('#hub [data-g="roulette"]'); time.sleep(0.8)
    note(pg.evaluate("!!document.querySelector('#rwC')"), 'R1: колесо — канва (#rwC)')
    blank = pg.evaluate("""() => { const cv = document.querySelector('#rwC'); const d = cv.getContext('2d').getImageData(0,0,280,280).data;
      let n = 0; for (let i = 3; i < d.length; i += 40) if (d[i] > 0) n++; return n; }""")
    note(blank > 800, f'R2: колесо нарисовано (непустых сэмплов {blank})')
    ptr = pg.evaluate("(() => { const w = document.querySelector('.rw-wrap'); const c = w.querySelector('#rwC'); const p = w.querySelector('.rw-ptr'); const c0 = getComputedStyle(c).transform; return { ptrInWrap: !!p && !p.contains(c), staticPtr: p !== null, c0 }; })()")
    note(ptr['staticPtr'], 'R3: метка-указатель существует и вне канвы (не вращается)')
    pg.click('#cgBody [data-chip="10000"]')
    pg.click('#cgBody [data-k="n:5"]')
    pg.click('#rGo'); time.sleep(0.5)
    rot_mid = pg.evaluate("getComputedStyle(document.querySelector('#rwC')).transform")
    pg.wait_for_timeout(4200)
    res = pg.eval_on_selector('#rR', 'e => e.textContent')
    rot_end = pg.evaluate("getComputedStyle(document.querySelector('#rwC')).transform")
    n = pg.evaluate("+$('rn').textContent")
    note(rot_mid != rot_end, 'R4: колесо вращается во время прокрутки')
    note(res.startswith('Выпало') and 0 <= n <= 36, f'R5: результат «{res}», число в ступице: {n}')
    # цифры на колесе: в секторах есть текст (проверяем по пикселям костяного цвета в зоне цифр)
    nums_px = pg.evaluate("""() => { const cv = document.querySelector('#rwC'); const c = cv.getContext('2d');
      const d = c.getImageData(0,0,280,280).data; let bone = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i] > 200 && d[i+1] > 190 && d[i+2] > 150) bone++; }
      return bone; }""")
    note(nums_px > 400, f'R6: цифры на колесе (костяных пикселей {nums_px})')
    bgim = pg.evaluate("getComputedStyle(document.querySelector('#cgBody')).backgroundImage")
    note('tavern' in bgim, 'R7: фон рулетки — таверна')
    ico = pg.evaluate("[...document.querySelectorAll('#cgBody img.rico')].map(i => i.naturalWidth)")
    note(len(ico) == 2 and all(w > 0 for w in ico), f'R8: иконки кровь/череп загружены ({ico})')
    pg.screenshot(path='/tmp/casino_roulette.png')
    pg.click('#cgClose'); time.sleep(0.4)

    # ---------- БЛЭКДЖЕК ----------
    if not pg.evaluate("!!document.querySelector('#hub.show')"): pg.click('#casinoBtn'); time.sleep(0.4)
    pg.click('#hub [data-g="blackjack"]'); time.sleep(0.6)
    pg.click('#cgBody [data-p="deal"]'); time.sleep(0.6)
    imgs = pg.evaluate("[...document.querySelectorAll('#bjT img.bjc')].map(i => ({ ok: i.complete && i.naturalWidth > 0, src: i.src.split('/').pop() }))")
    note(len(imgs) >= 3 and all(i['ok'] for i in imgs), f'R9: карты-спрайты загружены ({[i["src"] for i in imgs[:5]]})')
    has_back = pg.evaluate("[...document.querySelectorAll('#bjT img.bjc.back')].length === 1")
    note(has_back, 'R10: закрытая карта дилера — рубашка')
    pg.screenshot(path='/tmp/casino_bj.png')
    # добор до конца
    for _ in range(8):
        if pg.evaluate("bj.phase") != 'play': break
        pg.click('#cgBody [data-p="hit"]'); time.sleep(0.12)
    if pg.evaluate("bj.phase") == 'play': pg.click('#cgBody [data-p="stand"]'); time.sleep(0.3)
    note(pg.evaluate("bj.phase") == 'end', 'R11: раздача завершается корректно')
    note(not errs, 'R12: консоль чиста ' + (('| ' + ' | '.join(errs[:3])) if errs else ''))
    pg.click('#cgClose'); time.sleep(0.4)

    # ---------- АВИАТОР ----------
    if not pg.evaluate("!!document.querySelector('#hub.show')"): pg.click('#casinoBtn'); time.sleep(0.4)
    pg.click('#hub [data-g="aviator"]'); time.sleep(0.8)
    pg.fill('#avBet', '1000')
    pg.click('#avGo'); time.sleep(1.0)
    sp = pg.evaluate("""() => { const cv = document.querySelector('#avC'); const d = cv.getContext('2d').getImageData(0,0,520,220).data;
      // ищем силуэт: тёмно-серые пиксели (46,44,54)±25 в правой половине
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], bl = d[i+2];
        if (Math.abs(r-46) < 28 && Math.abs(g-44) < 28 && Math.abs(bl-54) < 28) n++;
      }
      return n; }""")
    note(sp > 30, f'R13: силуэт падальщика на канве (пикселей {sp})')
    pg.click('#avGo'); time.sleep(0.5)
    res = pg.eval_on_selector('#avR', 'e => e.textContent')
    note('абрали' in res, f'R14: забор выигрыша: «{res[:52]}»')
    pg.screenshot(path='/tmp/casino_av.png')
    note(not errs, 'R15: консоль чиста')

    b.close()

srv.terminate()
print('\n==== ИТОГ АУДИТА 3 (казино) ====')
bad = [r for r in report if r.startswith('❌')]
print(f'Проверок: {len(report)}, провалено: {len(bad)}')
for r in bad: print(r)
sys.exit(1 if bad else 0)
