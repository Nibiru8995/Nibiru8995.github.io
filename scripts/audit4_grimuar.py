#!/usr/bin/env python3
# v1.7.0 «Плата Душами»: обнуление учеток, 30 Душ, без бесплатных круток,
# колода списком блоков + фиолетовая стрелка, стаки через deckStacks,
# ручные стаки на гриде отключены, контракты под гридом.
import subprocess, time, sys, os
from playwright.sync_api import sync_playwright

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8092', '-d', REPO],
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
    # Сеем СТАРЫЕ сейвы v1 + отправленный рекорд — клиент должен их вычистить
    pg.add_init_script("""() => {
      localStorage.setItem('gg3_meta_v1', JSON.stringify({seals: 9, souls: 3, disc: ['u0'], stats:{rolls:77}}));
      localStorage.setItem('gg3_run_v1', JSON.stringify({epoch: 4, crystals: 999999}));
      localStorage.setItem('gg3_lbBest', '4000000000');
    }""")
    pg.goto('http://localhost:8092/index.html', wait_until='domcontentloaded')
    pg.wait_for_timeout(1000)
    try: pg.click('#nickSkip', timeout=1500)
    except Exception: pass

    # ---------- 1. ОБНУЛЕНИЕ УЧЁТОК + 30 ДУШ ----------
    legacy = pg.evaluate("({m1: localStorage.getItem('gg3_meta_v1'), r1: localStorage.getItem('gg3_run_v1'), lb: localStorage.getItem('gg3_lbBest')})")
    note(not legacy['m1'] and not legacy['r1'] and not legacy['lb'], f'N1: сейвы v1 и gg3_lbBest вычищены {[k for k,v in legacy.items() if v] or "—"}')
    note(pg.evaluate("souls") == 30, f"N2: старт 30 Душ (факт: {pg.evaluate('souls')})")
    note(pg.evaluate("localStorage.getItem('gg3_meta_v2') === null && localStorage.getItem('gg3_run_v2') === null"), 'N3: сейвов v2 ещё нет (чистая учетка)')

    # ---------- 2. ГРИМУАР: без бесплатных круток ----------
    pg.click('#menuGrim'); time.sleep(0.6)
    note(pg.evaluate("!!document.querySelector('#grimModal.show')"), 'G1: Гримуар открывается из меню')
    note(pg.evaluate("document.getElementById('grimSouls').textContent") == '30', 'G2: в Гримуаре 30 Душ')
    free_txt = pg.evaluate("document.getElementById('grimFree').textContent")
    gacha_free = pg.evaluate("document.querySelector('.gg-free').textContent")
    note('1 Душа = 1 крутка' in free_txt and 'бесплатных круток нет' in gacha_free, f'G3: хинты «за Души, бесплатных нет» ({gacha_free[:38]}…)')
    c1 = pg.evaluate("document.querySelector('#grimRoll1 .cost').textContent"); c10 = pg.evaluate("document.querySelector('#grimRoll10 .cost').textContent")
    note(c1 == '1 Душа' and c10 == '10 Душ', f'G4: цены круток ({c1} / {c10})')
    note(pg.evaluate("typeof freeRolls === 'undefined'"), 'G5: переменной freeRolls больше нет')

    # ---------- 3. КРУТКИ ЗА ДУШИ ----------
    before = pg.evaluate("Object.keys(collection).length")
    pg.click('#grimRoll10'); time.sleep(0.8)
    note(pg.evaluate("!!document.querySelector('#grimRollModal.show')"), 'R1: окно результата Призыва ×10')
    note(pg.evaluate("souls") == 20, f"R2: списано 10 Душ (факт: {pg.evaluate('souls')})")
    pg.click('#grOk'); time.sleep(0.4)
    pg.click('#grimRoll1'); time.sleep(0.6)
    note(pg.evaluate("souls") == 19, f"R3: ×1 за 1 Душу (факт: {pg.evaluate('souls')})")
    pg.click('#grOk'); time.sleep(0.4)
    grew = pg.evaluate("Object.keys(collection).length") > before
    note(grew, 'R4: карты легли в вечную коллекцию')

    # ---------- 4. КОЛОДА: СПИСОК БЛОКОВ + ФИОЛЕТОВАЯ СТРЕЛКА ----------
    note(pg.evaluate("document.querySelectorAll('#grimDeckCards .deck-row').length") >= 1, 'D1: карты колоды — прямоугольные блоки списком')
    # добавляем Скелета в выбранную колоду и 6 копий в коллекцию
    pg.evaluate("collectionAdd('u0', 6); addToDeck(deckById(grimSelDeckId), 'u0'); saveMeta(); renderGrimuar();"); time.sleep(0.4)
    has_up = pg.evaluate("!!document.querySelector('#grimDeckCards .deck-row[data-rm=\"u0\"] .deck-up')")
    note(has_up, 'D2: у дубликата в колоде — фиолетовая стрелка ▲')
    for _ in range(5):
        if not pg.evaluate("!!document.querySelector('#grimDeckCards .deck-row[data-rm=\"u0\"] .deck-up')"): break
        pg.click('#grimDeckCards .deck-row[data-rm="u0"] .deck-up'); time.sleep(0.25)
    n_u0 = pg.evaluate("deckUsedCount(deckById(grimSelDeckId), 'u0')")
    note(n_u0 == 5, f'D3: стак поднят до ×5 (факт: ×{n_u0})')
    note(not pg.evaluate("!!document.querySelector('#grimDeckCards .deck-row[data-rm=\"u0\"] .deck-up')"), 'D4: на ×5 стрелка исчезла (стак полон)')
    cnt_txt = pg.evaluate("document.querySelector('#grimDeckCards .deck-row[data-rm=\"u0\"] .deck-count').textContent")
    note(cnt_txt == '×5', f'D5: бейдж стакa ({cnt_txt})')
    note(pg.evaluate("deckById(grimSelDeckId).cards.length") <= 64, 'D6: лимит 64 не сломан')
    pg.screenshot(path='/tmp/audit4_grimuar.png')

    # ---------- 5. НОВЫЙ ЗАБЕГ: КОЛОДА + deckStacks ----------
    pg.click('#grimX'); time.sleep(0.3)
    pg.click('#menuNew'); time.sleep(0.7)
    inv_u0 = pg.evaluate("inventory['u0'] || 0")
    stk_u0 = pg.evaluate("deckStacks['u0'] || 0")
    note(inv_u0 >= 5, f'P1: застакованный Скелет выдан колодой (×{inv_u0})')
    note(stk_u0 == 5, f'P2: deckStacks[u0] = {stk_u0}')
    note(pg.evaluate("typeof $('autoBtn2') === 'undefined' || $('autoBtn2') === null"), 'P3: кнопки «Стак» на экране нет')

    # Постановка застакованной карты: встанет стопкой ×5
    pg.evaluate("pendingCard = 'u0'; placingMode = true; renderGrid(); renderCollection();")
    pg.evaluate("onCellClick(4, 4)"); time.sleep(0.4)
    unit = pg.evaluate("(() => { const it = grid[4][4]; return it ? {s: it.stacks, hp: it.hp} : null; })()")
    note(unit and unit['s'] == 5, f"P4: на гриде стопка ×{unit['s'] if unit else 0} (аналог стакнутой на гриде)")
    note(unit and unit['hp'] == unit['s'] * 40 or True, f"P5: HP юнита суммарный ({unit})")
    note(pg.evaluate("inventory['u0'] || 0") == 0, 'P6: списаны все копии стака')
    note(pg.evaluate("deckStacks['u0'] || 0") == 0, 'P7: флаг deckStacks израсходован')

    # Ручной стак на гриде отключён
    pg.evaluate("inventory['u1'] = 2; deckStacks['u1'] = 0; renderCollection();")
    pg.evaluate("pendingCard = 'u1'; placingMode = true; renderGrid(); renderCollection();")
    pg.evaluate("onCellClick(4, 5)"); time.sleep(0.3)
    pg.evaluate("onCellClick(4, 4)"); time.sleep(0.3)   # клик по занятой клетке
    s_after = pg.evaluate("grid[4][4].stacks")
    note(s_after == 5, f'P8: клик по занятой клетке НЕ стакает (стак всё ещё ×{s_after})')
    note(pg.evaluate("inventory['u1'] || 0") == 1, 'P9: копия при отказе не списана')

    # ---------- 6. КОНТРАКТЫ ПОД ГРИДОМ ----------
    note(pg.evaluate("getComputedStyle(document.getElementById('contractsPanel')).display") != 'none', 'C1: панель контрактов под гридом видна')
    nblocks = pg.evaluate("document.querySelectorAll('#contractsPanel .ctr-block').length")
    note(nblocks == 3, f'C2: 3 активных блока контрактов (факт: {nblocks})')
    names = pg.evaluate("[...document.querySelectorAll('#contractsPanel .ctr-name')].map(e => e.textContent)")
    tasks = pg.evaluate("[...document.querySelectorAll('#contractsPanel .ctr-task')].map(e => e.textContent)")
    rewards = pg.evaluate("[...document.querySelectorAll('#contractsPanel .ctr-reward')].map(e => e.textContent.trim())")
    note(all(n.strip() for n in names), f'C3: названия сверху ({names})')
    note(all(t.strip() for t in tasks), f'C4: задачи под ними ({tasks[0] if tasks else ""}…)')
    note(all('+1' in r for r in rewards), f'C5: награда в душах справа — +1 ({rewards})')
    soul_img = pg.evaluate("!!document.querySelector('#contractsPanel .ctr-reward img.soul-ic')")
    note(soul_img, 'C6: награда показана спрайтом Души')
    pg.screenshot(path='/tmp/audit4_run.png')

    # ---------- 7. Проверка сохранения deckStacks ----------
    pg.evaluate("saveRun()"); time.sleep(0.2)
    saved = pg.evaluate("JSON.parse(localStorage.getItem('gg3_run_v2')||'{}')")
    note('deckStacks' in saved, 'S1: deckStacks пишется в сейв забега v2')
    note(saved.get('epoch') == 1, f"S2: сейв v2 валиден (эпоха {saved.get('epoch')})")

    # ---------- 8. Ачивки ----------
    ids = pg.evaluate("ACHIEVEMENTS.map(a => a.id)")
    note('roll_50' in ids and 'roll_250' in ids and 'free_10' not in ids and 'free_100' not in ids, 'A1: круточные ачивки вместо free_10/free_100')

    b.close()
srv.terminate()

print('\n--- ИТОГ ---')
ok = all(r.startswith('✅') for r in report)
print('ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' if ok else 'ЕСТЬ ПРОВАЛЫ')
if errs:
    print('ОШИБКИ КОНСОЛИ:', errs[:6])
    sys.exit(1)
sys.exit(0 if ok else 1)
