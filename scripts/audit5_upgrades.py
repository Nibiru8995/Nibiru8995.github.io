#!/usr/bin/env python3
# v1.8.0 «Вечная Эпоха»: эпохи бесконечны без грейдов, печати удалены,
# Улучшения за Души, выбор колоды обязателен, колода отдельными копиями
# со стаком конкретной записи, 80 контрактов нежити с req-требованиями.
import subprocess, time, sys, os
from playwright.sync_api import sync_playwright

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8093', '-d', REPO],
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
    # Миграция: старый сейв с maxEpoch=5 и уровнями «печатей».
    # ВАЖНО: сеем ОДИН раз (add_init_script срабатывает на каждую навигацию
    # и иначе перезатирал бы сейв при перезагрузке страницы).
    pg.add_init_script("""(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('gg3_meta_v2', JSON.stringify({maxEpoch: 5, souls: 40,
        sealLv: {rich: 1, greed: 2, impulse: 0, arch: 0, fate: 1},
        decks: [{id: 'dk1', name: 'Старая', race: 'undead', cards: ['u0', 'u0', 'u5', 'bl_grave']}],
        activeDeck: {undead: 'dk1'}, collection: {u0: 2, u5: 1, bl_grave: 1}}));
      localStorage.setItem('gg3_run_v2', JSON.stringify({epoch: 5, faction: 'undead', crystals: 123}));
    })();""")
    pg.add_init_script("""(() => {
      const _setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k, v) {
        if (k === 'gg3_run_v2' && v && v.indexOf('"deckStacks":{}') >= 0) {
          try { sessionStorage.setItem('dbgEmpty', (new Error().stack || '').split('\\n').slice(1, 5).join(' | ')); } catch (e) {}
        }
        return _setItem.call(this, k, v);
      };
    })();""")
    pg.add_init_script("""(() => {
      try { sessionStorage.setItem('bootFile_' + (sessionStorage.getItem('bootN') || '0'), (localStorage.getItem('gg3_run_v2') || 'NULL').slice(0, 200)); sessionStorage.setItem('bootN', String((+sessionStorage.getItem('bootN') || 0) + 1)); } catch (e) {}
    })();""")
    pg.goto('http://localhost:8093/index.html', wait_until='domcontentloaded')
    pg.wait_for_timeout(1000)
    try: pg.click('#nickSkip', timeout=1500)
    except Exception: pass

    # ---------- 1. МИГРАЦИЯ УЛУЧШЕНИЙ ----------
    note(pg.evaluate("featOwned('arena') && featOwned('casino') && featOwned('r4') && factionOwned('cultist')"), 'M1: Э5-прогресс переведён в покупки (Арена/Казино/★4/Культисты)')
    note(pg.evaluate("fieldLv") == 1, f"M2: поле 5×5 куплено миграцией (fieldLv={pg.evaluate('fieldLv')})")
    note(pg.evaluate("upgLv.greed") == 2 and pg.evaluate("upgLv.fate") == 1, f"M3: уровни бонусов из старых печатей сохранены ({pg.evaluate('JSON.stringify(upgLv)')})")
    note(pg.evaluate("deckById('dk1').cards.length") == 4 and pg.evaluate("deckById('dk1').cards[0].n") == 1, 'M4: плоская колода мигрировала в записи {id, n}')
    note(pg.evaluate("document.getElementById('sealsTop')") is None, 'M5: чип печатей удалён из HUD')

    # ---------- 2. УЛУЧШЕНИЯ ЗА ДУШИ ----------
    pg.evaluate("startFreshRun('undead', deckById('dk1'))"); time.sleep(0.6)
    souls0 = pg.evaluate("souls")
    pg.evaluate("hideMenu()"); time.sleep(0.2)
    pg.click('#menuBtn'); time.sleep(0.3)
    pg.click('#menuUpgrades'); time.sleep(0.5)
    note(pg.evaluate("!!document.querySelector('#upgModal.show')"), 'U1: окно «Улучшения» открывается из меню')
    cats = pg.evaluate("[...document.querySelectorAll('#upgList .upg-cat')].map(e => e.textContent)")
    note(len(cats) == 6, f'U2: 6 разделов ({cats})')
    note(pg.evaluate("document.getElementById('upgSouls').textContent") == str(souls0), f'U3: баланс Душ показан ({souls0})')
    # покупка фракции «Звери» (50 Душ) — Арена/Казино уже куплены миграцией
    pg.evaluate("souls = 200; saveMeta(); if (document.getElementById(\x27upgModal\x27)) renderUpgrades();"); time.sleep(0.2)
    souls_before = pg.evaluate("souls")
    pg.click("#upgList [data-upg='f_beast']"); time.sleep(0.4)
    note(pg.evaluate("featOwned('f_beast')") or pg.evaluate("factionsOwned.includes('beast')"), 'U4: фракция «Звери» куплена за Души')
    note(pg.evaluate("souls") == souls_before - 50, f'U5: списано 50 Душ ({souls_before} → {pg.evaluate("souls")})')
    note(pg.evaluate("availFactions().includes('beast')"), 'U5b: Звери доступны в выборе расы')
    # покупка поля 5×5 (15)
    pg.click("#upgList [data-upg='field']"); time.sleep(0.4)
    note(pg.evaluate("fieldLv") == 2 and pg.evaluate("fieldSize()") == 7, f"U6: поле куплено до 7×7 (миграция уже дала 5×5; fieldLv={pg.evaluate('fieldLv')})")
    pg.evaluate("close_('upgModal')"); time.sleep(0.3)

    # ---------- 3. МЕНЮ ЭПОХИ БЕЗ ГРЕЙДОВ ----------
    pg.click('#menuEpoch'); time.sleep(0.4)
    body = pg.evaluate("document.getElementById('epochBody').innerHTML")
    note('Магазин' not in body and 'Печати' not in body and 'Разблокировки' not in body, 'E1: в меню Эпохи нет грейдов (магазин/разблокировки)')
    note('Вехи забега' in body, 'E2: вехи забега на месте')
    note('БЕСКОНЕЧНЫ' in body, 'E3: эпохи объявлены бесконечными')
    pg.keyboard.press('Escape'); time.sleep(0.3)

    # ---------- 4. ГРИМУАР: КОПИИ-БЛОКИ И СТАК КОНКРЕТНОЙ ЗАПИСИ ----------
    pg.click('#menuGrim'); time.sleep(0.6)
    pg.evaluate("collectionAdd('u0', 8); collectionAdd('u1', 2); deckById('dk1').cards = []; saveMeta(); renderGrimuar();"); time.sleep(0.3)
    pg.evaluate("for (let i = 0; i < 4; i++) addToDeck(deckById(grimSelDeckId), 'u0'); renderGrimuar();"); time.sleep(0.3)
    rows = pg.evaluate("document.querySelectorAll('#grimDeckCards .deck-row').length")
    note(rows == 4, f'G1: 4 клика по коллекции → 4 отдельных блока-дубликата (факт: {rows})')
    # стакаем ИМЕННО вторую запись (idx 1) до ×3 — проверяем адресность стрелки
    pg.evaluate("stackUpEntry(deckById(grimSelDeckId), 1); stackUpEntry(deckById(grimSelDeckId), 1); renderGrimuar();"); time.sleep(0.3)
    cnt = pg.evaluate("document.querySelector('#grimDeckCards .deck-row[data-rm=\"1\"] .deck-count').textContent")
    cnt0 = pg.evaluate("document.querySelector('#grimDeckCards .deck-row[data-rm=\"0\"] .deck-count').textContent")
    note(cnt == '×3' and cnt0 == '×1', f'G2: стрелка стакает ТУ запись, на которую кликнули (блок0 {cnt0}, блок1 {cnt})')
    # добиваем блок1 до ×5 — стрелка исчезает только у него
    pg.evaluate("stackUpEntry(deckById(grimSelDeckId), 1); stackUpEntry(deckById(grimSelDeckId), 1); renderGrimuar();"); time.sleep(0.3)
    up0 = pg.evaluate("!!document.querySelector('#grimDeckCards .deck-row[data-rm=\"0\"] .deck-up')")
    up1 = pg.evaluate("!!document.querySelector('#grimDeckCards .deck-row[data-rm=\"1\"] .deck-up')")
    note(up0 and not up1, f'G3: на ×5 стрелка погасла только у застаканной записи (up0={up0}, up1={up1})')
    # клик по карте коллекции добавляет ДУБЛИКАТ (новый блок)
    n_rows_before = pg.evaluate("document.querySelectorAll('#grimDeckCards .deck-row').length")
    pg.click("#grimCards [data-gid='u1']"); time.sleep(0.3)
    n_rows_after = pg.evaluate("document.querySelectorAll('#grimDeckCards .deck-row').length")
    note(n_rows_after == n_rows_before + 1, f'G4: клик по карте ГРИМУАРА добавил дубликат-блок ({n_rows_before} → {n_rows_after})')
    pg.screenshot(path='/tmp/audit5_grim.png')
    pg.click('#grimX'); time.sleep(0.3)

    # ---------- 5. ВЫБОР КОЛОДЫ ОБЯЗАТЕЛЕН ----------
    if not pg.evaluate("!!document.querySelector('#menu.show')"):
        pg.click('#menuBtn'); time.sleep(0.3)
    pg.click('#menuNew'); time.sleep(0.4)
    # есть сейв забега → ask-подтверждение
    if pg.evaluate("!!document.querySelector('#dlg.show')"):
        pg.click('#dlgYes'); time.sleep(0.4)
    note(pg.evaluate("!!document.querySelector('#deckPickModal.show')"), 'P1: перед новой игрой — окно выбора колоды')
    rows = pg.evaluate("document.querySelectorAll('#deckPickModal .deckpick-row').length")
    note(rows >= 1, f'P2: в списке колоды расы ({rows} шт.)')
    pg.evaluate("[...document.querySelectorAll('#deckPickModal .deckpick-row')].find(r => r.textContent.includes('Старая')).click()")
    time.sleep(0.6)
    note(not pg.evaluate("!!document.querySelector('#deckPickModal.show')") and pg.evaluate("gameStarted"), 'P3: колода выбрана — забег начался')
    note('Старая' in pg.evaluate("document.getElementById('collectionTitle').textContent"), 'P4: заголовок коллекции = выбранная колода')
    # выданы копии: 4 блока u0 (один ×5) + u1, + стартовые u5/bl_grave
    inv_u0 = pg.evaluate("inventory['u0'] || 0")
    note(inv_u0 == 8, f"P5: копии колоды выданы (u0 ×{inv_u0})")
    note(pg.evaluate("JSON.stringify(deckStacks['u0'])") == '[5]', f"P6: очереди стаков из записей ({pg.evaluate('JSON.stringify(deckStacks)')})")
    # постановки по очереди стаков: ×5, ×5, затем ×1
    pg.evaluate("pendingCard = 'u0'; placingMode = true; renderGrid(); renderCollection();")
    pg.evaluate("onCellClick(3, 3)"); time.sleep(0.3)
    s1 = pg.evaluate("grid[3][3].stacks")
    pg.evaluate("pendingCard = 'u0'; placingMode = true; renderGrid(); renderCollection();")
    pg.evaluate("onCellClick(3, 4)"); time.sleep(0.3)
    s2 = pg.evaluate("grid[3][4] ? grid[3][4].stacks : 0")
    pg.evaluate("pendingCard = 'u0'; placingMode = true; renderGrid(); renderCollection();")
    pg.evaluate("onCellClick(4, 3)"); time.sleep(0.3)
    s3 = pg.evaluate("grid[4][3] ? grid[4][3].stacks : 0")
    note(s1 == 5 and s2 == 1 and s3 == 1, f'P7: постановки по очереди стаков ({s1}, {s2}, затем {s3})')

    # ---------- 6. КОНТРАКТЫ: 4 БЛОКА, REQ, НАГРАДЫ ----------
    nblocks = pg.evaluate("document.querySelectorAll('#contractsPanel .ctr-block').length")
    # контракты могут исполняться прямо во время аудита — блок исчезает
    note(1 <= nblocks <= 4, f'C1: блоки контрактов под гридом ({nblocks}; исполнено {pg.evaluate("contracts.done")})')
    ok_req = pg.evaluate("contracts.list.every(c => { const t = tplById(c.id); return !t.req || contractReqOK(t); })")
    note(ok_req, 'C2: все выпавшие контракты выполнимы со стартовой колодой (req)')
    rw = pg.evaluate("[...document.querySelectorAll('#contractsPanel .ctr-reward')].map(e => e.textContent.trim())")
    note(all('+1' in r or '+2' in r or '+3' in r for r in rw), f'C3: награды в душах по сложности ({rw})')
    diffs = pg.evaluate("contracts.list.map(c => c.diff)")
    ok_diffs = pg.evaluate("contracts.list.every(c => c.diff === 1 || c.diff === 2 || c.diff === 3)")
    note(ok_diffs, f'C4: сложности из {diffs}')
    pool_n = pg.evaluate("CONTRACTS_UNDEAD.length")
    n1 = pg.evaluate("CONTRACTS_UNDEAD.filter(t => t.diff === 1).length")
    n2 = pg.evaluate("CONTRACTS_UNDEAD.filter(t => t.diff === 2).length")
    n3 = pg.evaluate("CONTRACTS_UNDEAD.filter(t => t.diff === 3).length")
    note(pool_n == 80 and n1 == 60 and n2 == 15 and n3 == 5, f'C5: пул 80 = 60/15/5 ({n1}/{n2}/{n3})')
    badge = pg.evaluate("document.getElementById('contractsBadge').textContent")
    note(badge.endswith('/4'), f'C6: бейдж Тёмного Пакта из 4 ({badge})')
    pg.screenshot(path='/tmp/audit5_run.png')

    # ---------- 7. ВОЗНЕСЕНИЕ БЕЗ ПЕЧАТЕЙ, +1 ДУША, ВЫБОР КОЛОДЫ ----------
    for _ in range(10):  # закрыть онбординг-подсказки, перегораживающие кнопку Эпохи
        if not pg.evaluate("!!document.querySelector('#guidePanel.show')"): break
        pg.evaluate("document.querySelector('#guideSkip') && document.querySelector('#guideSkip').click()")
        time.sleep(0.2)
    pg.evaluate("runEarned = epochThreshold(epoch); updateHUD();"); time.sleep(0.3)
    pg.click('#epochUpBtn'); time.sleep(0.5)
    pg.click('#ewYes'); time.sleep(0.5)
    note(pg.evaluate("!!document.querySelector('#factionModal.show')") or pg.evaluate("!!document.querySelector('#deckPickModal.show')"), 'A1: после Вознесения — выбор расы/колоды')
    if pg.evaluate("!!document.querySelector('#factionModal.show')"):
        pg.evaluate("[...document.querySelectorAll('#factionModal .faction-card')][0].click()"); time.sleep(0.5)
    note(pg.evaluate("!!document.querySelector('#deckPickModal.show')"), 'A2: выбор колоды обязателен и при Вознесении')
    souls_b = pg.evaluate("souls"); epoch_b = pg.evaluate("epoch")
    pg.evaluate("[...document.querySelectorAll('#deckPickModal .deckpick-row')][0].click()"); time.sleep(0.6)
    note(pg.evaluate("epoch") == epoch_b + 1 and pg.evaluate("souls") == souls_b + 1, f'A3: Эпоха {epoch_b}→{pg.evaluate("epoch")}, +1 Душа ({souls_b} → {pg.evaluate("souls")})')
    note(pg.evaluate("typeof seals === 'undefined'"), 'A4: переменной seals больше нет')
    note(pg.evaluate("epochThreshold(12) === epochThreshold(11) * 4"), 'A5: бесконечный множитель порога ×4')

    # ---------- 8. СЕЙВ/ЗАГРУЗКА ОЧЕРЕДЕЙ СТАКОВ ----------
    dbg = pg.evaluate("JSON.stringify({rd: runDeck.length, stk: deckStacks, gs: gameStarted, ns: noSave, invN: Object.keys(inventory).length})")
    print('   before save:', dbg)
    pg.evaluate("runEarned = 0; deckStacks['u1'] = [4, 2]; saveRun();"); time.sleep(0.3)
    dbg2 = pg.evaluate("JSON.stringify({stk: (JSON.parse(localStorage.getItem('gg3_run_v2')||'{}').deckStacks), rd: (JSON.parse(localStorage.getItem('gg3_run_v2')||'{}').runDeck || []).length})")
    print('   after save:', dbg2)
    pg.reload(wait_until='domcontentloaded')
    for t in range(7):
        st = pg.evaluate("(JSON.parse(localStorage.getItem('gg3_run_v2')||'{}').deckStacks) || null")
        print('   t+%dms deckStacks=' % (200 * t), st)
        pg.wait_for_timeout(200)
    try: pg.click('#nickSkip', timeout=1200)
    except Exception: pass
    print('   empty-write stack:', pg.evaluate("window.__lastEmptyWrite || 'none'")[:400])
    print('   boot snapshots:', pg.evaluate("(() => { const out = []; for (let i = 0; i < 5; i++) { const v = sessionStorage.getItem('bootFile_' + i); if (v) out.push(i + ': ' + v.slice(0, 110)); } return out; })()"))
    load_err = pg.evaluate("(() => { try { return 'OK ' + loadRun() } catch(e) { return 'THROW: ' + e.message + ' @ ' + (e.stack || '').split('\\n').slice(1, 3).join(' / ') } })()")
    print('   loadRun after reload:', load_err)
    raw = pg.evaluate("(() => { const d = JSON.parse(localStorage.getItem('gg3_run_v2') || '{}'); return {stk: d.deckStacks || null, rd: (d.runDeck || []).length}; })()")
    note(pg.evaluate("JSON.stringify(deckStacks['u1'] || [])") == '[4,2]', f'S1: очереди deckStacks пережили перезагрузку ({pg.evaluate("JSON.stringify(deckStacks)")}; в сейве: {raw})')
    note(pg.evaluate("Array.isArray(runDeck) && runDeck.length > 0"), f'S2: снапшот runDeck в сейве ({pg.evaluate("runDeck.length")} карт; в сейве: {raw["rd"]})')

    # ---------- 9. БЕЗ РЕЛИКВИЙ В ПРИЗЫВЕ ----------
    pg.evaluate("souls = Math.max(souls, 10)")
    ok_r1 = pg.evaluate("(() => { const x = performGrimRolls(1); return x && x.cards.length === 1 && x.relics === undefined; })()")
    note(ok_r1, 'R1: Призыв выдаёт только карты (поля реликвий в ответе нет)')
    note(pg.evaluate("relicRollDue() === false"), 'R2: relicRollDue всегда false (источника реликвий нет)')

    # ---------- 10. КОНСОЛЬ ----------
    critical = [e for e in errs if 'favicon' not in e and 'supabase' not in e.lower() and 'Failed to fetch' not in e and 'net::' not in e]
    note(not critical, f'Z1: консоль без ошибок ({len(critical)})')
    for e in critical[:4]: print('   ', e[:300])
    pg.screenshot(path='/tmp/audit5_final.png')

    b.close()
srv.terminate()
fails = [r for r in report if r.startswith('❌')]
print('\n===== ИТОГ: ' + str(len(report) - len(fails)) + '/' + str(len(report)) + ' =====')
sys.exit(1 if fails else 0)
