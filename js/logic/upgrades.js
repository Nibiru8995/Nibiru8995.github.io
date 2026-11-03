'use strict';
/* ============================================================
   ЛОГИКА: УЛУЧШЕНИЯ (logic/upgrades.js) — v1.8.0 «Вечная Эпоха»
   Состояние покупок (мета): upgLv (бонусы, бывшие печати),
   fieldLv (поле), deckLv (страницы колоды), feats (фичи),
   staffLv (Слуги), factionsOwned (фракции).
   Отсюда же — единые аксессоры доступа вместо старых эпохальных:
   fieldSize() / unlockedRarities() / availFactions() /
   featOwned() / deckStackMax() / deckCap().
   Печати 🔱 («эссенция») удалены.
   ============================================================ */

/* upgLv/fieldLv/deckLv/feats/staffLv/factionsOwned объявлены в state.js. */

function featOwned(k) { return feats.indexOf(k) >= 0; }
function factionOwned(f) { return f === 'undead' || factionsOwned.indexOf(f) >= 0; }
function availFactions() { return ['undead'].concat(factionsOwned); }
/* Поле: размер = купленные расширения (больше НЕ растёт от Эпох):
   fieldLv 0..3 → 3×3 / 5×5 / 7×7 / 9×9 */
const FIELD_SIZES = [3, 5, 7, 9];
function fieldSize() { return FIELD_SIZES[clamp(Math.floor(fieldLv) || 0, 0, 3)]; }
function fieldMaxSize() { return 9; }
/* Лимит КОЛОДЫ (количество карт, суммарно): страницы Гримуара.
   deckLv 0..3 → 9 / 25 / 49 / 81. */
const DECK_CAPS = [9, 25, 49, 81];
function deckCap() { return DECK_CAPS[clamp(Math.floor(deckLv) || 0, 0, DECK_CAPS.length - 1)]; }
/* Максимальный стак карты в КОЛОДЕ (улучшение «Зодчего») */
function deckStackMax() { return 5 + (upgLv.arch || 0); }
/* Старое имя (мёртвый код продажи дубликатов) — совместимость */
function maxStacks() { return deckStackMax(); }
/* Редкости Призыва: здания + ★3 всегда, ★4/★5 — покупки */
function unlockedRarities() {
  const r = ['B', 3];
  if (featOwned('r4')) r.push(4);
  if (featOwned('r5')) r.push(5);
  return r;
}

function upgCostOnce(key) {
  if (key === 'deck') return deckLv < UPG_DECK.length ? UPG_DECK[deckLv].cost : null;
  return UPG_ONCE[key] ? UPG_ONCE[key].cost : null;
}
function upgCostField() { return fieldLv < UPG_FIELD.length ? UPG_FIELD[fieldLv].cost : null; }
function upgCostBonus(id) {
  const u = UPG_BONUS.find(b => b.id === id);
  return u && upgLv[id] < u.max ? u.cost(upgLv[id]) : null;
}

function buyUpgradeOnce(key) {
  const u = UPG_ONCE[key];
  if (!u) return;
  const isFaction = key.indexOf('f_') === 0;
  const owned = isFaction ? factionOwned(key.slice(2)) : featOwned(key);
  if (owned) return;
  if (u.need && !featOwned(u.need)) { toast('Сначала нужно: ' + UPG_ONCE[u.need].name); return; }
  if (souls < u.cost) { toast(SOUL_IMG + ' Не хватает Душ: нужно ' + u.cost + ' (есть ' + fmt(souls) + ')'); return; }
  souls -= u.cost;
  /* фракции — в factionsOwned (значения 'cultist'/'beast'/'demon'), остальное — в feats */
  if (isFaction) factionsOwned.push(key.slice(2)); else feats.push(key);
  sfx('milestone');
  toast(u.icon + ' <b>' + u.name + '</b> — куплено за ' + u.cost + ' Душ!');
  afterUpgrade(key);
  saveMeta(); updateHUD();
  if ($('upgModal') && $('upgModal').classList.contains('show')) renderUpgrades();
}

function buyUpgradeField() {
  if (fieldLv >= UPG_FIELD.length) return;
  const f = UPG_FIELD[fieldLv];
  if (souls < f.cost) { toast(SOUL_IMG + ' Не хватает Душ: нужно ' + f.cost + ' (есть ' + fmt(souls) + ')'); return; }
  souls -= f.cost;
  fieldLv++;
  sfx('epoch');
  toast('🧱 <b>' + f.name + '</b> — Алтарь расширен за ' + f.cost + ' Душ!');
  afterUpgrade('field');
  saveMeta(); updateHUD();
  if ($('upgModal') && $('upgModal').classList.contains('show')) renderUpgrades();
}

/* Страница колоды — следующая по уровню deckLv. */
function buyUpgradeDeck() {
  if (deckLv >= UPG_DECK.length) return;
  const p = UPG_DECK[deckLv];
  if (souls < p.cost) { toast(SOUL_IMG + ' Не хватает Душ: нужно ' + p.cost + ' (есть ' + fmt(souls) + ')'); return; }
  souls -= p.cost;
  deckLv++;
  sfx('epoch');
  toast('📖 <b>' + p.name + '</b> — Гримуар вмещает ' + p.cap + ' карт (за ' + p.cost + ' Душ)!');
  afterUpgrade('deck');
  saveMeta(); updateHUD();
  if ($('upgModal') && $('upgModal').classList.contains('show')) renderUpgrades();
}

/* Слуги: разовые улучшения своей фракции (staffLv[id] = 1). */
function buyUpgradeStaff(id) {
  const u = UPG_STAFF.find(s => s.id === id);
  if (!u || staffLv[id]) return;
  if (souls < u.cost) { toast(SOUL_IMG + ' Не хватает Душ: нужно ' + u.cost + ' (есть ' + fmt(souls) + ')'); return; }
  souls -= u.cost;
  staffLv[id] = 1;
  sfx('milestone');
  toast(u.icon + ' <b>' + u.name + '</b> — куплено за ' + u.cost + ' Душ!');
  afterUpgrade(id);
  saveMeta(); updateHUD();
  if ($('upgModal') && $('upgModal').classList.contains('show')) renderUpgrades();
}

function buyUpgradeBonus(id) {
  const u = UPG_BONUS.find(b => b.id === id);
  if (!u || upgLv[id] >= u.max) return;
  const cost = u.cost(upgLv[id]);
  if (souls < cost) { toast(SOUL_IMG + ' Не хватает Душ: нужно ' + cost + ' (есть ' + fmt(souls) + ')'); return; }
  souls -= cost;
  upgLv[id]++;
  sfx('milestone');
  toast(u.icon + ' <b>' + u.name + '</b>: уровень ' + upgLv[id] + ' (за ' + cost + ' Душ)');
  afterUpgrade(id);
  saveMeta(); updateHUD();
  if ($('upgModal') && $('upgModal').classList.contains('show')) renderUpgrades();
}

/* Немедленные эффекты покупки */
function afterUpgrade(key) {
  if (key === 'field' && gameStarted) {
    playableSize = fieldSize();
    rebuildPlayableMask();
    buildGrid(); renderGrid(); renderCollection();
  }
  if (key === 'deck') {
    /* Страница колоды — окно Гримуара (если открыто) перерисовывает лимиты */
    if (typeof renderGrimuar === 'function' && $('grimModal') && $('grimModal').classList.contains('show')) renderGrimuar();
  }
  if (key === 'arena' || key === 'casino') {
    updateHUD();
    if (typeof queueFeatureGuides === 'function') queueFeatureGuides();
  }
}

/* ---------------- Разовая миграция прогресса ----------------
   Разблокировки раньше давались Эпохами — переводим их в покупки
   один раз, чтобы уже играющие не потеряли Арну/Казино/поле. */
const MIG_KEY = 'gg3_mig18';
function migrateUpgrades() {
  let done = false;
  try { done = !!localStorage.getItem(MIG_KEY); } catch (e) { }
  if (done) return;
  const e = maxEpoch || 1;
  const grants = [];
  if (e >= 2) grants.push('arena');
  if (e >= 3) grants.push('r4');
  if (e >= 4) grants.push('casino');
  if (e >= 5) grants.push('f_cultist');
  if (e >= 6) grants.push('r5');
  if (e >= 7) grants.push('f_beast');
  if (e >= 10) grants.push('f_demon');
  grants.forEach(k => {
    if (k.indexOf('f_') === 0) { if (!factionOwned(k.slice(2))) factionsOwned.push(k.slice(2)); }
    else if (!featOwned(k)) feats.push(k);
  });
  if (e >= 9) fieldLv = 3; else if (e >= 7) fieldLv = 2; else if (e >= 3) fieldLv = 1;
  try { localStorage.setItem(MIG_KEY, '1'); } catch (e2) { }
  if (grants.length || fieldLv > 0) {
    saveMeta();
    setTimeout(() => toast('✦ <b>Улучшения:</b> открывавшееся Эпохами переведено в покупки (Арена, Казино, поле, ★4/★5, фракции) — бесплатно, по вашему рекорду Эпох', 'mig', 10), 1200);
  }
}

/* Страницы колоды — отдельный разовый перенос (ключ свой: у игроков
   v1.8.0 базовая миграция уже отмечена). Старый лимит был 64 у всех —
   выдаём столько страниц, чтобы новый лимит (9/25/49/81) покрывал
   все их сохранённые колоды. */
const MIG_DECK_KEY = 'gg3_mig18b';
function migrateDeckPages() {
  let done = false;
  try { done = !!localStorage.getItem(MIG_DECK_KEY); } catch (e) { }
  if (done) return;
  let deckMax = 0;
  (decks || []).forEach(dk => { deckMax = Math.max(deckMax, deckTotal(dk)); });
  if (deckMax > 49) deckLv = Math.max(deckLv, 3);
  else if (deckMax > 25) deckLv = Math.max(deckLv, 2);
  else if (deckMax > 9) deckLv = Math.max(deckLv, 1);
  try { localStorage.setItem(MIG_DECK_KEY, '1'); } catch (e2) { }
  if (deckLv > 0) {
    saveMeta();
    setTimeout(() => toast('📖 <b>Гримуар:</b> страницы колоды выданы по вашим сохранённым колодам — лимит теперь ' + deckCap() + ' карт', 'mig', 10), 2600);
  }
}