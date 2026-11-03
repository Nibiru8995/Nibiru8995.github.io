# ПАКЕТ ПРОМТОВ НА АРТ НОВЫХ КАРТ НЕЖИТИ (u13–u38)

**Статус:** фаза A, приложение к дизайн-документу `undead_rework_v1.9_phase_A_design.md`. Кода нет, коммитов нет.
**Объём:** 26 новых карт (u13–u38). Живые карты (u0–u12) и здания не перегенерируются — у них арт уже есть.
**Цель стиля:** реалистичный пиксель-арт (гримдарк, пропорции взрослого существа), БЕЗ чиби, БЕЗ нейро-артефактов, в едином ряду с существующими спрайтами.

---

# ЧТО ПРОВЕРЕНО В РЕПО (по арту)

| Факт | Источник |
|---|---|
| Игра берёт спрайт строго по пути `assets/cards/<id>.png` | `js/utils.js`: `CARD_ART_DIR = 'assets/cards/'`, `cardArtHTML(card)` → `<img src="assets/cards/ + card.id + '.png'">` |
| При отсутствии файла — эмодзи-фолбэк (`onerror → cardArtFail`) | `js/utils.js`, строки 152–161. Значит: карта без арта не ломает игру |
| Размеры существующих спрайтов: **64×64** (все, включая ★5 u10/u11 и здания); u12 Псалмопевец — **96×96** | замер PIL по файлам `assets/cards/*.png`. Код размер не ограничивает — масштабирует CSS |
| Фон спрайтов **непрозрачный, почти чёрный** (RGB 0–20, альфы нет) | замер угловых пикселей u0, u5, u10, u12, bl_crypt |
| «Hero»-варианты для карт НЕ нужны: `u12_hero.png` кодом не используется, промо-арт живёт отдельно в `assets/promo/` | grep по `js/` — 0 вхождений `_hero` |
| Имена — только `id` + `.png`, без префиксов/суффиксов; регистр нижний | формат id в `CARD_DEFS` (u0–u12, bl_*) |

**Следствие:** параллельная подмена «новые карты — арт Псалмописца» из плана B.1 (`js/utils.js`) становится НЕ нужна, как только у каждой новой карты появится собственный `u<NN>.png`.

---

# 1. КАК ИМЕНОВАТЬ ФАЙЛЫ

Имя файла = id карты из сметы A.1 + `.png`. Ничего другого движок не прочитает.

**Полный список имён (26 файлов):**

```
u13.png  u14.png                                    (Скелеты)
u15.png  u16.png  u17.png  u18.png  u19.png  u20.png
u21.png  u22.png  u23.png  u24.png  u25.png  u26.png  (Призраки)
u27.png  u28.png  u29.png  u30.png  u31.png  u32.png
u33.png  u34.png  u35.png  u36.png  u37.png  u38.png  (Вампиры)
```

**Правила:**
1. Строго нижний регистр, строго `.png` (не JPG/WebP), квадрат.
2. Никаких `u13_final.png`, `u13_v2.png`, `undead_u13.png` — версии держите в рабочей папке, в репо и в зип попадает только чистое имя.
3. **Два экземпляра каждой карты:** мастер 1024×1024 — в рабочую папку `raw/` (в репо НЕ идёт), финал 64×64 — в `assets/cards/`.
4. Финальный размер: **64×64 для всех** (единообразно со старыми). Допуск: 96×96 для ★5, если деталь не влезает — код масштабирует сам, но сначала попробуйте 64×64.
5. Фон: непрозрачный почти чёрный (как у старых), без альфа-канала. Прозрачность НЕ нужна.

---

# 2. ЕДИНЫЙ СТИЛЬ (база каждого промта)

Каждый промт ниже = **БАЗА** + ` — ` + **сюжет карты**. База уже вписана в каждый блок промтов, здесь — для справки и правок «всем сразу».

**БАЗА (позитив):**

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail, front 3/4 view
```

**НЕГАТИВ (общий для всех 26):**

```text
chibi, cute, kawaii, anime, big head small body, cartoon, 3D render, CGI, photograph, blurry, anti-aliasing, smooth gradients, soft airbrush shading, noise, jpeg artifacts, text, letters, numbers, watermark, signature, logo, UI elements, card frame, border, multiple characters, crowd, busy background, scenery, landscape, extra limbs, deformed hands, mutated face, double pupils, gibberish symbols, oversaturated, neon colors
```

**Настройки генератора:**

| Генератор | Что выставить |
|---|---|
| Midjourney | `--ar 1:1 --style raw --no chibi, cute, text, watermark` + негатив не поддерживается — страшные слова дублировать в хвост промта |
| SDXL / Comfy / A1111 | размер 1024×1024, CFG 5–7, негатив — блок выше целиком |
| DALL·E / прочие | 1024×1024, квадрат; проверять на вшитую рамку — обрезать до квадрата перед даунскейлом |
| Стиль-референс (если есть image-prompt) | приложите старые спрайты `assets/cards/u10.png` и `u12.png` — зададут гамму и уровень детализации |

**Палитры подрас (держат ряд узнаваемым):**

| Подраса | Гамма |
|---|---|
| Скелеты (u13–u14) | пыльная кость, серо-земляной + один ржаво-красный акцент |
| Призраки (u15–u26) | серо-синий полумрак + холодное призрачное бирюзовое свечение |
| Вампиры (u27–u38) | бледная слоновая кость плоти + багровый и старое золото |

**Градация редкости в сюжете:** ★3 — простая фигура, 1–2 предмета; ★4 — богаче реквизит и свечение; ★5 — монументальный силуэт, фигура крупнее и «дороже», но БЕЗ лишней мелочи (тест на 64px решает).

---

# 3. АНТИ-НЕЙРО-АРТЕФАКТЫ: чек-лист приёмки

Проверять каждый вариант на зуме 800% ДО даунскейла. Список = типовые мутации генераторов на нежити:

| # | Что искать | Что делать |
|---|---|---|
| 1 | **Псевдо-текст**: «руны», буквы на книгах/стелах/рамках, водяные знаки | инпейнт пустой поверхностью или перегенерация; текст в 64px всё равно станет кашей — лучше убрать |
| 2 | **Расплавленные края**: антиалиасинговая «дымка» вокруг силуэта вместо чёткого пиксельного края | даунскейл лечит частично; при чистке вручную жёстко вернуть край в Aseprite/Piskel |
| 3 | **Мутации черепа/лица**: лишние глазницы, двойные зрачки, асимметрия челюсти, «зубы-палочки» | перегенерация с другим сидом; это лицо карты — не мириться |
| 4 | **Кисти и реквизит**: лишние пальцы, сросшиеся предметы (меч+кStaff), предметы без опоры | инпейнт зоны предмета; по возможности предметы крупнее и проще |
| 5 | **Мыльные градиенты** вместо пиксельных кластеров (признак «ненастоящего» пиксель-арта) | после даунскейла — `quantize` до 24–32 цветов; крупные плоские пятна ценнее мелкой шумной детали |
| 6 | **Мусорные пиксели** вокруг фигуры (одиночные точки, «звёздная пыль») | вычистить вручную, на 64px дают грязь |
| 7 | **Симметрия-мутант**: зеркальная фигура с расхождением деталей (хор у u18 — 4 фигуры: проверять, что не слиплись в кашу) | перегенерация; для u18/u24 «множественность» решать перекрытием силуэтов, а не мелкими лицами |
| 8 | **Чиби-протечка**: у генераторов слова «ghost/spirit» часто тянут милых призраков Casper-вида | в позитиве держать «gaunt, elongated, mournful, realistic anatomy»; чиби — в негатив |

**Рабочий процесс:** 4 варианта на карту → отбор по силуэту → чистка → даунскейл 64×64 → «тест прищура» (спрайт читается с трёх шагов?) → если нет: упрощать СИЛУЭТ, а не добавлять деталей.

**Даунскейл 1024 → 64 (PIL, готовый скрипт):**

```python
from PIL import Image
import glob, os
SRC, DST, SIZE = 'raw/*.png', 'final/assets/cards', 64
os.makedirs(DST, exist_ok=True)
for src in sorted(glob.glob(SRC)):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    s = min(w, h)                                  # центральный квадрат
    im = im.crop(((w-s)//2, (h-s)//2, (w+s)//2, (h+s)//2))
    im = im.resize((SIZE, SIZE), Image.LANCZOS)    # усреднение вместо NEAREST — меньше мусора
    im = im.quantize(colors=32, method=Image.MEDIANCUT).convert('RGB')
    name = os.path.basename(src).lower()           # u13.png — строго с имени файла
    im.save(os.path.join(DST, name), optimize=True)
    print(name, 'OK')
```

Файл в `raw/` уже должен называться `u13.png` (скрипт переносит имя как есть). После скрипта — ручная чистка финала в пиксель-редакторе (Aseprite / Piskel / Photopea с сеткой 64).

---

# 4. КАК УПАКОВАТЬ В ZIP

**Структура рабочей папки:**

```
undead_art/
├── raw/                      # мастера 1024×1024, имена уже u13.png … u38.png
└── final/
    └── assets/
        └── cards/            # финалы 64×64
            ├── u13.png … u14.png
            ├── u15.png … u26.png
            └── u27.png … u38.png
```

Зип собирается из `final/`, чтобы внутри архива был путь `assets/cards/<id>.png` — тогда распаковка **в корень локальной копии репо** сама кладёт файлы куда нужно.

**Linux / macOS:**

```bash
cd undead_art/final
zip -X ../undead_cards_u13-u38_v1.9.zip assets/cards/u13.png assets/cards/u14.png \
  assets/cards/u15.png assets/cards/u16.png assets/cards/u17.png assets/cards/u18.png \
  assets/cards/u19.png assets/cards/u20.png assets/cards/u21.png assets/cards/u22.png \
  assets/cards/u23.png assets/cards/u24.png assets/cards/u25.png assets/cards/u26.png \
  assets/cards/u27.png assets/cards/u28.png assets/cards/u29.png assets/cards/u30.png \
  assets/cards/u31.png assets/cards/u32.png assets/cards/u33.png assets/cards/u34.png \
  assets/cards/u35.png assets/cards/u36.png assets/cards/u37.png assets/cards/u38.png
unzip -l ../undead_cards_u13-u38_v1.9.zip   # проверка: 26 файлов, путь assets/cards/
```

Флаг `-X` не пишет лишние атрибуты; мак-мусор исключается заранее: `xattr -rc .` перед сборкой, `.DS_Store` в `final/` не держать.

**Windows (рекомендуется 7-Zip):**

```powershell
cd undead_art\final
7z a ..\undead_cards_u13-u38_v1.9.zip assets
# или штатным PowerShell (пути с \ совместимы не со всеми распаковщиками):
Compress-Archive -Path assets -DestinationPath ..\undead_cards_u13-u38_v1.9.zip -Force
```

**Проверка архива перед отправкой (5 пунктов):**
1. Ровно 26 файлов, все `assets/cards/u<NN>.png` — никаких `raw/`, `__MACOSX/`, `.DS_Store`, старых карт, промо.
2. Имена lowercase, без суффиксов.
3. Каждый файл 64×64 PNG (проверка: `python3 -c "from PIL import Image; import glob; [print(f, Image.open(f).size) for f in sorted(glob.glob('assets/cards/u*.png'))]"`).
4. Фон непрозрачный почти чёрный (глазами или пипеткой угла).
5. Распаковка в корень репо ничего не перезаписывает, кроме добавляемых 26 файлов.

**Когда заливать:** файлы для id, которых ещё нет в `CARD_DEFS`, безвредны — движок их не запрашивает. Но по протоколу фазы A в репо ничего не кладём и не коммитим до «ок»: архив просто лежит наготове и распаковывается вместе с фазой B (или до неё).

---

# 5. ПРОМТЫ ПО КАРТАМ (26)

Каждый блок — самодостаточный позитив-промт (база уже вписана). Негатив общий — из раздела 2. Имя файла для результата — жирным.

## 5.1. Скелеты

### u13 — Гончая Костей (★3 · Скованные) → **u13.png**
*Флейвор: «Бежала за хозяином в жизни. В смерти наконец догнала».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail, front 3/4 view — skeletal hound in mid-gallop, exposed ribcage and spine, torn leather leash flying from a rusted collar, ears flattened, small dust puff under paws, dusty bone tones with rust-red accent
```

### u14 — Костоправ (★3 · Несущие волю) → **u14.png**
*Флейвор: «Вправляет позвонки так, что хруст стоит на весь квартал».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail, front 3/4 view — hunched skeleton bone-setter surgeon in a leather apron stuck with bone needles and splints, holding a large bone splint in one hand and a small bone saw in the other, a roll of pale bandage on the shoulder, dusty bone tones with faded sage-green accent
```

## 5.2. Призраки (гамма: серо-синий полумрак + холодное бирюзовое свечение)

### u15 — Огонёк на Могиле (★3 · Скованные) → **u15.png**
*Флейвор: «Заманивал путников в овраг. Теперь просто освещает — привычка».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a small will-o'-wisp ghost flame hovering low over a modest grave mound with one crooked wooden marker cross, a gaunt mournful face barely visible inside the cold teal fire, thin wisps of flame trailing down, grey-blue gloom with cold spectral teal glow
```

### u16 — Эхо в Стекле (★3 · Скованные) → **u16.png**
*Флейвор: «Кричит в пустоту. Пустота отвечает его же голосом, но вежливее».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a tall cracked standing hand mirror on a dusty floor, a gaunt elongated pale face screaming silently inside the glass, the reflection slightly wrong and translucent, cracked silver frame, faint teal wisp escaping the glass, grey-blue gloom with cold spectral teal glow
```

### u17 — Полуночница (★3 · Скованные) → **u17.png**
*Флейвор: «Сидит у кроватки и поёт. Дети спят. Родители — уже тоже».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a translucent veiled ghost woman bending over a small wooden cradle, singing with hollow open mouth, lower body dissolving into mist, one hand resting on the cradle rail, grey-blue gloom with cold spectral teal glow
```

### u18 — Панихидный Хор (★3 · Скованные) → **u18.png**
*Флейвор: «Поют в четыре голоса. Все четыре одинаковые».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a tight row of four hooded spectral singers fused into one ghostly mass, identical gaunt faces with open singing mouths, translucent overlapping hoods, two open hymn books held together, grey-blue gloom with cold spectral teal glow
```

### u19 — Туманный Правщик (★3 · Несущие волю) → **u19.png**
*Флейвор: «Правит Книгу Мёртвых чернилами из тумана».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a robed ghost scribe with no lower body, robes dissolving into fog, bent over a huge open tome, writing with a quill made of solidified mist, ink drops drifting upward, grey-blue gloom with cold spectral teal glow
```

### u20 — Фонарщица (★3 · Несущие волю) → **u20.png**
*Флейвор: «Зажигает фонари там, где давно никого нет».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a translucent ghost woman in a tattered shawl holding a tall lamplighter pole with a small glass lantern, cold flame burning inside the lantern, she reaches up on tiptoe, lower body fading into mist, grey-blue gloom with cold spectral teal glow
```

### u21 — Колокол на Ветру (★3 · Несущие волю) → **u21.png**
*Флейвор: «Качается без причины. Звонит без повода».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — an old cracked bronze church bell hanging from a weathered wooden post, caught mid-swing, a long visible crack, thin spectral mist coiling out of the bell mouth, motion blur suggested by offset pixel echo, grey-blue gloom with cold spectral teal glow
```

### u22 — Поминальщица (★3 · Несущие волю) → **u22.png**
*Флейвор: «Помянула всех, кого помнила. Помнит всех, кого помянула».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a translucent mourning woman in a black funeral dress and long veil, holding a single burning candle in one hand and a handkerchief in the other, head bowed, lower dress dissolving into mist, cold candle flame, grey-blue gloom with cold spectral teal glow
```

### u23 — Заклинатель Тумана (★4 · Некроманты) → **u23.png**
*Аура «Туман»: пары Скованных дотягиваются на клетку дальше.*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a tall spectral necromancer commanding a spiraling vortex of fog with raised arms, hollow glowing eye sockets, torn ceremonial robes, floating talisman strips circling the vortex, rich detailed 4-star legendary necromancer pose, grey-blue gloom with cold spectral teal glow
```

### u24 — Тень Оркестра (★4 · Владыки) → **u24.png**
*Флейвор: «Дирижирует невидимым оркестром».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a shadowy spectral conductor in a tattered tailcoat, raised white baton, no face under the wild hair, translucent ghost violins and horns orbiting around him in a wide arc, rich detailed 4-star pose, grey-blue gloom with cold spectral teal glow
```

### u25 — Странник без Могилы (★5 · Скованные) → **u25.png**
*Флейвор: «Ходит и ищет свою могилу».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a tall epic wandering ghost in a road-worn travel cloak, faceless darkness under the hood, leaning on a gnarled staff with a small bundled sack, torn cloak hem dissolving into mist, monumental 5-star silhouette radiating quiet sorrow, grey-blue gloom with cold spectral teal glow
```

### u26 — Маяк Мёртвых (★5 · Владыки) → **u26.png**
*Royal-генератор призрачного квартала: «Светит тем, кто заблудился между мирами».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a monumental spectral warden whose hooded upper body crowns a tower-like robed form, the head replaced by a blazing cold lighthouse beacon throwing a beam of pale light, layered ghostly robes like a lighthouse tower, epic 5-star silhouette, grey-blue gloom with cold spectral teal glow
```

## 5.3. Вампиры (гамма: бледная плоть + багровый и старое золото)

### u27 — Бледный Юнец (★3 · Скованные) → **u27.png**
*Флейвор: «Мечтает стать кошмаром. Пока — кошмарное недоразумение с отличным почерком».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail, front 3/4 view — a skinny pale fledgling vampire boy drowning in an oversized inherited velvet coat with gold trim, holding a small glass of milk with deadly serious pride, awkward stiff pose, pale ivory skin with crimson and aged-gold accents
```

### u28 — Мышиная Свита (★3 · Скованные) → **u28.png**
*Флейвор: «Носит плащ из летучих мышей. Мыши считают себя свитой».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a smug pale vampire dandy wearing a living cloak made of bats and mice, bat wings forming the cape collar, one mouse perched on his shoulder like a retainer, pale ivory skin with crimson and aged-gold accents
```

### u29 — Кровавый Садовник (★3 · Скованные) → **u29.png**
*Флейвор: «Выращивает розы на венозной крови».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a gaunt pale gardener in a dark apron trimming blood-red roses with old shears, thorn vines winding around his forearm, a watering can dripping dark red drops, pale ivory skin with crimson and aged-gold accents
```

### u30 — Гробовщик (★3 · Скованные) → **u30.png**
*Флейвор: «Делает гробы на вырост».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a broad-shouldered pale undertaker carrying a plain wooden coffin on his shoulder, tailor measuring tape around his neck, wood shavings stuck to the apron, patient professional expression, pale ivory skin with crimson and aged-gold accents
```

### u31 — Кровный Майордом (★3 · Несущие волю) → **u31.png**
*Флейвор: «Подаёт кровь к столу под соусом из обязанностей».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a precise pale vampire butler in black-and-gold livery with white gloves, presenting a silver tray with one goblet of dark blood, napkin draped over the forearm, bowing slightly with impeccable manners, pale ivory skin with crimson and aged-gold accents
```

### u32 — Фехтовальщица (★3 · Несущие волю) → **u32.png**
*Флейвор: «Вызывает на дуэль тени. Тени отказываются».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — an elegant pale vampire woman fencer in an en-garde duelist lunge, slender rapier extended, high boots and fitted doublet with gold trim, sharp confident grin with small fangs, pale ivory skin with crimson and aged-gold accents
```

### u33 — Предок в Портрете (★3 · Несущие волю) → **u33.png**
*Флейвор: «Висит в раме и следит за родней».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — an ornate gilded oval portrait frame with a stern pale aristocrat ancestor painted inside, haughty collared costume, faint red glow in the painted eyes, dust and one cobweb corner on the frame, pale ivory skin with crimson and aged-gold accents
```

### u34 — Кружевная Дуэнья (★3 · Несущие волю) → **u34.png**
*Флейвор: «Кружева плетёт из паутины, советы — из вздохов».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — an elderly pale vampire lady with an enormous white spider-web lace collar, powdered grey hair in a high coiffure, holding a closed black fan and a cane, disapproving raised eyebrow, faint web strands between her fingers, pale ivory skin with crimson and aged-gold accents
```

### u35 — Кровавый Канцлер (★4 · Некроманты) → **u35.png**
*Аура «Кровавый обет»: Скованные в ауре не теряют HP от даней.*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a pale vampire chancellor-bureaucrat in rich black-and-crimson robes at a lectern, writing a blood-ink contract with a long quill, wax seals and parchment scrolls stacked beside, monocle glowing faintly, rich detailed 4-star pose, pale ivory skin with crimson and aged-gold accents
```

### u36 — Барон Полуночи (★4 · Владыки) → **u36.png**
*Флейвор: «На званых вечерах гасит свечи. Гости не возражают».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a theatrical pale vampire baron in a sweeping caped cloak with crimson lining, snapping his fingers to extinguish a tall candelabra, last candle smoke curling upward, many rings on his fingers, two bats circling behind, rich detailed 4-star pose, pale ivory skin with crimson and aged-gold accents
```

### u37 — Кровная Матриарх (★5 · Несущие волю) → **u37.png**
*Флейвор: «Род предпочёл бы не вспоминать, кому обязан бессмертием. Она напомнит».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — a regal ancient vampire matriarch seated on a high-backed throne chair, floor-length crimson gown with aged-gold embroidery, ornate blood chalice in one hand, commanding icy gaze, silver hair in a severe coiffure, monumental 5-star silhouette, pale ivory skin with crimson and aged-gold accents
```

### u38 — Старый Господин (★5 · Владыки) → **u38.png**
*Флейвор: «Считает всех вокруг недоделанными версиями себя. Технически — не ошибается».*

```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim undead fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail — an ancient aristocratic vampire lord in a floor-length high-collared cloak, leaning on a heavy cane crowned with a small skull, withering disdainful half-lidded gaze, immaculate antique cravat, monumental 5-star silhouette of bored absolute power, pale ivory skin with crimson and aged-gold accents
```

---

## Порядок работ (коротко)

1. Сгенерировать по 4 варианта на карту (промты из раздела 5, настройки и негатив — из раздела 2).
2. Отобрать по силуэту, вычистить артефакты по чек-листу раздела 3.
3. Скрипт даунскейла 1024→64 (раздел 3) + ручная чистка финала.
4. Разложить в `undead_art/final/assets/cards/` под именами из раздела 1.
5. Собрать зип по разделу 4, проверить 5 пунктами приёмки.
6. Архив держать наготове: распаковка в корень репо — вместе с фазой B (или раньше, движку это безразлично); в git — только после «ок».
