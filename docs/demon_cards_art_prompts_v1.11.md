# ПАКЕТ ПРОМТОВ НА АРТ НОВЫХ КАРТ ДЕМОНОВ (d16–d47)

**Статус:** фаза B, приложение к `demon_rework_v1.11_phase_A_design.md`.
**Объём:** 32 новых карт (по смете Т.3: Пепел 10 · Мрак 11 · Легион 11).
Живые карты (d0–d15) и здания в фазе B не перегенерируются — арт
вторичен к правилам (решение как у культистов v1.10).

# ПРАВИЛА ФАЙЛОВ (как у нежити/культистов)
- Путь: `assets/cards/<id>.png`, нижний регистр, строго PNG, квадрат.
- Финал: **64×64** (единообразно), мастер 1024×1024 — в `raw/` (в репо не идёт).
- Фон: непрозрачный почти чёрный, без альфы. Прозрачность НЕ нужна.

# ЕДИНЫЙ СТИЛЬ
**БАЗА (позитив):**
```text
Dark gothic pixel art game sprite, realistic proportions, not chibi, grim infernal fantasy, one centered demon figure filling the frame on a solid near-black opaque background, muted desaturated palette with a single accent color, chunky clean pixels, crisp readable silhouette, moody dim lighting, 16-bit console detail, front 3/4 view
```
**НЕГАТИВ (общий):**
```text
chibi, cute, kawaii, anime, big head small body, cartoon, 3D render, CGI, photograph, blurry, anti-aliasing, smooth gradients, soft airbrush shading, noise, jpeg artifacts, text, letters, numbers, watermark, signature, logo, UI elements, card frame, border, multiple characters, crowd, busy background, scenery, landscape, extra limbs, deformed hands, mutated face, double pupils, gibberish symbols, oversaturated, neon colors
```

**Акцент по подрасам:** Пепел — тлеющий оранж жар и сажа; Мрак —
фиолет бездны и холодный полумрак; Легион — раскалённая сталь и
алые знамёна.

# ПРОМТЫ ПО КАРТАМ (сюжет = БАЗА + строка ниже)

| id | Карта | Подраса | Сюжет (дописка к базе) |
|----|-------|---------|--------------------------|
| d16 | Искрёнок | Пепел | tiny wiry imp crackling with tiny orange sparks jumping off its horns, ember accent |
| d17 | Дымовик | Пепел | hunched demon wrapped in thick grey smoke coils, one glowing ember eye |
| d18 | Пепельная Гончая | Пепел | lean feral hound made of grey ash, glowing cracks between soot plates |
| d19 | Тлетень | Пепел | scarecrow-like demon slowly smoldering, straw limbs with orange ember veins |
| d20 | Золовка | Пепел | gaunt hollow-eyed demoness exhaling a cold gust that bends embers aside |
| d21 | Сажевик | Пепел | round squat demon of pure soot, faint orange glow in chest crack |
| d22 | Горнило | Пепел | demon fused with a portable blast furnace, glowing open maw like a forge mouth |
| d23 | Пирокласт | Пепел | towering crowned demon amid falling ember meteor sparks, ash cloak |
| d24 | Тлеющий Престол | Пепел | demon whose lower body is a smoldering charred throne, ember-dotted seat |
| d25 | Феникс Пекла | Пепел | reborn fire-demon spreading burning ash wings, single pale feather crest |
| d26 | Подстрекатель | Мрак | grinning lean demon holding a sputtering torch-brand like a dangerous gift |
| d27 | Ночной Шёпот | Мрак | slight demon of living shadow under a thin crescent moon glow, violet accent |
| d28 | Соглядатай | Мрак | demon with one huge goggling violet eye and sly smirk |
| d29 | Липкая Тень | Мрак | tar-like shadow creature with viscous dripping claws gathering small sparks |
| d30 | Вздох | Мрак | translucent wraith demon exhaling a long pale mist, calming pose |
| d31 | Тёмный Заводила | Мрак | schemer demon in a cracked theatre mask, purple fire reflected in the mask slit |
| d32 | Кошмар | Мрак | broad nightmare demon with a terrifying gaping maw and violet horror aura |
| d33 | Пустотный Вельможа | Мрак | aristocratic void demon in a tall black top hat, violet void instead of a face |
| d34 | Глушитель | Мрак | demon with heavy spiked auditory plates covering its head, sealed mouth slit |
| d35 | Внемлющий | Мрак | massive demon with enormous flared ears listening to the sky, small comet overhead |
| d36 | Погибель Света | Мрак | eclipse-faced demon, black disc head with thin violet corona ring |
| d37 | Копейщик | Легион | legion pikeman demon in scorched steel plate holding a glowing trident spear |
| d38 | Строевик | Легион | legion demon with a wall of a riveted shield, red-hot rivets |
| d39 | Кадровик | Легион | demon clerk with a burning ledger and quill, red-hot accounting seals |
| d40 | Интендант | Легион | demon quartermaster with supply crates and an insignia medal on the chest |
| d41 | Трубач Пекла | Легион | demon blowing a long warped war horn, sound waves heating the air red |
| d42 | Валькирия Пекла | Легион | winged demoness in half-plate, feathered wings with burning tips |
| d43 | Гонец Пекла | Легион | demon courier galloping on a lean hell-steed, dispatch satchel glowing |
| d44 | Знаменосец Легиона | Легион | demon banner bearer holding a tall scarlet standard with black sigil |
| d45 | Центурион | Легион | legion centurion demon with a crest helmet and a glowing medal of rank |
| d46 | Претор | Легион | praetor demon in ornate plate with a fleur-de-lis crest and command baton |
| d47 | Маршал Пекла | Легион | towering marshal demon in a great war-helm, red-hot armor seams, parade bearing |
