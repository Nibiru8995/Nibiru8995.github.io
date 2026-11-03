# ПАКЕТ ПРОМТОВ НА АРТ НОВЫХ КАРТ КУЛЬТИСТОВ (c14–c45)

**Статус:** фаза B, приложение к `cultist_rework_v1.10_phase_A_design.md`.
**Объём:** 32 новых карт (26 призываемых c14–c39 + 6 Одержимых c40–c45).
Живые карты (c0–c13) и здания не перегенерируются — арт уже есть
(конвертированные c3/c8/c12/c13 меняют только правила, спрайты остаются).

# ПРАВИЛА ФАЙЛОВ (как у нежити)
- Путь: `assets/cards/<id>.png`, нижний регистр, строго PNG, квадрат.
- Финал: **64×64** (единообразно), мастер 1024×1024 — в `raw/` (в репо не идёт).
- Фон: непрозрачный почти чёрный, без альфы. Прозрачность НЕ нужна.

# ЕДИНЫЙ СТИЛЬ
**БАЗА (позитив):**
```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim occult fantasy, one centered figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail, front 3/4 view
```
**НЕГАТИВ (общий):**
```text
chibi, cute, kawaii, anime, big head small body, cartoon, 3D render, CGI, photograph, blurry, anti-aliasing, smooth gradients, soft airbrush shading, noise, jpeg artifacts, text, letters, numbers, watermark, signature, logo, UI elements, card frame, border, multiple characters, crowd, busy background, scenery, landscape, extra limbs, deformed hands, mutated face, double pupils, gibberish symbols, oversaturated, neon colors
```

**Акцент по орденам:** Хор — тусклое золото свечей; Ложа — холодный
сине-серый камень и геометрия; Внешние — фиолет бездны и мёртвые
звёзды; Одержимые — багрово-лиловая плоть.

# ПРОМТЫ ПО КАРТАМ (сюжет = БАЗА + строка ниже)

| id | Карта | Сюжет (дописка к базе) |
|----|-------|--------------------------|
| c14 | Послушница | young female acolyte in ragged dark robe holding a tiny oil lamp, faint gold flame |
| c15 | Бормотун | hooded man muttering into his collar, lips hidden, thin gold thread of sound |
| c16 | Кадилоносец | acolyte swinging a brass censer on chains, thin grey smoke curling |
| c17 | Стихарь | robed scribe with an open scroll of illegible verses, gold ink |
| c18 | Дьячок | clerk with quill and ledger, gold wax seal, hunched posture |
| c19 | Ризничий | sacristan with a huge ring of black keys, single gold key glowing |
| c20 | Хормастер | choir master with raised baton, dark lectern, gold notes floating |
| c21 | Экзорцист | stern exorcist in dark vestments holding an iron crucifix, pale light |
| c22 | Дух Хора | translucent ghostly choir spirit, hollow singing mouth, faint bubbles of light |
| c23 | Пустотный Серафим | many-winged seraph with a blank void face, six wings, cold halo |
| c24 | Подмастерье | mason's apprentice carrying a brick, apron over dark robe |
| c25 | Верный Каменщик | loyal stonemason with chisel and plumb line, stone dust |
| c26 | Привратник Ложи | lodge gatekeeper with a massive key ring, chained collar |
| c27 | Геометр | geometrician holding a brass set square, chalk diagram in air |
| c28 | Хранитель Чертежа | keeper holding a framed blueprint of an impossible temple |
| c29 | Мастер Наугольника | master with a long measuring rule, one eye behind a lens |
| c30 | Архитектор Круга | architect drawing a perfect circle with a huge compass |
| c31 | Хранительница Очага | woman keeper of the hearth with a small glowing paper lantern |
| c32 | Тень Основателя | shadowy founder silhouette on an invisible throne, only outline |
| c33 | Столп Ложи | robed figure merged into a stone pillar, column capital as head |
| c34 | Спящий между Мирами | colossal sleeping entity floating curled up, closed eyes, dream motes |
| c35 | Пожиратель Формул | void maw devouring floating scrolls and diagrams |
| c36 | Тот, Кто Считает | entity with countless small counting beads and abacus limbs |
| c37 | Глаз, Открывшийся Изнутри | disembodied violet eye opening inside a hooded robe, no face |
| c38 | Хор Угасших Звёзд | cluster of dead star spirits singing, faint cold sparks |
| c39 | Шёпот За Стеной | huge disembodied ear pressed to a cracked wall, whisper fog |
| c40 | Пустотелый | hollow man with empty chest cavity, faint echo rings inside |
| c41 | Шепчущая Плоть | mass of living flesh with small mouths whispering |
| c42 | Многоглазый Служка | hunched servant covered in small blinking eyes |
| c43 | Кровавый Оракул | oracle with a bleeding crystal amulet, droplet floating |
| c44 | Слепой Пророк | blind prophet with stitched eyes, seeing a violet portal instead |
| c45 | Дитя Бездны | small childlike void-born silhouette smiling, abyss below |

# ПАЙПЛАЙН
`scripts/gen_cultist_sprites.sh` — генерация 1024×1024 в `raw/cultist/`
→ PIL даунскейл до 64×64 → `assets/cards/<id>.png`. Проверка: размер,
не пустой, угловые пиксели тёмные.
