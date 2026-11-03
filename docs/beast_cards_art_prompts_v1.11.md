# ПАКЕТ ПРОМТОВ НА АРТ НОВЫХ КАРТ ЗВЕРЕЙ (b18–b59)

**Статус:** фаза B, приложение к `beast_rework_v1.11_phase_A_design.md`.
**Объём:** 42 новых карт (36 призываемых b18–b53 + 6 Духов Леса b54–b59).
Живые карты (b0–b17) и здания не перегенерируются — арт уже есть
(решение как у культистов: арт вторичен к правилам).

# ПРАВИЛА ФАЙЛОВ (как у нежити/культистов)
- Путь: `assets/cards/<id>.png`, нижний регистр, строго PNG, квадрат.
- Финал: **64×64** (единообразно), мастер 1024×1024 — в `raw/` (в репо не идёт).
- Фон: непрозрачный почти чёрный, без альфы. Прозрачность НЕ нужна.
- Отсутствующий файл = эмодзи-фолбэк (`cardArtFail`), игра не ломается.

# ЕДИНЫЙ СТИЛЬ
**БАЗА (позитив):**
```text
Dark forest fantasy pixel art game sprite, realistic proportions, not chibi, wild grim fairytale, one centered creature filling the frame on a solid near-black opaque background, muted desaturated palette with a single moss-green accent, chunky clean pixels, crisp readable silhouette, moody dim moonlit lighting, 16-bit console detail, front 3/4 view
```
**НЕГАТИВ (общий):**
```text
chibi, cute, kawaii, anime, big head small body, cartoon, 3D render, CGI, photograph, blurry, anti-aliasing, smooth gradients, soft airbrush shading, noise, jpeg artifacts, text, letters, numbers, watermark, signature, logo, UI elements, card frame, border, multiple characters, crowd, busy background, scenery, landscape, extra limbs, deformed hands, mutated face, double pupils, gibberish symbols, oversaturated, neon colors
```

**Акцент по родам леса:** Стая — тусклое олово клыков и холодный
взгляд; Стадо — тёплая шерсть и охра рогов; Чаща — болотно-зелёная
хвоя и светлячки; Духи — полупрозрачная бирюзово-зелёная мгла.

# ПРОМТЫ ПО КАРТАМ (сюжет = БАЗА + строка ниже)

| id | Карта | Сюжет (дописка к базе) |
|----|-------|--------------------------|
| b18 | Росомаха | stocky wolverine with bristling fur and small hostile glowing eyes, frost on whiskers |
| b19 | Гиена | hunched hyena with mottled hide and a crooked grinning muzzle, ears torn |
| b20 | Шакал | lean jackal with oversized ears and a stolen bone in its jaws |
| b21 | Лисица | cunning red fox with a white tail tip crouched low, sly narrowed eyes |
| b22 | Пещерный Лев | massive cave lion with a ragged mane and faint cave moss on shoulders |
| b23 | Белый Волк | noble white wolf with pale grey markings, calm commanding gaze, thin frost breath |
| b24 | Фенрир | colossal mythic winter wolf, fur turning to ice and snow, cold glowing eyes, crown of icicles |
| b25 | Кролик | small wild rabbit with tall ears at a dark burrow entrance |
| b26 | Косуля | shy roe deer doe with small antler buds, alert ears, dappled hide |
| b27 | Благородный Олень | majestic red deer stag with a crown of tall antlers wrapped in vines |
| b28 | Тур | heavily built wild aurochs bull with long curved horns and a stone-like brow |
| b29 | Зубр | enormous bison with a shaggy beard and a lowered massive head |
| b30 | Дикобраз | quilled beast with long bristling quills raised in a defensive crest |
| b31 | Бобр | beaver with a broad flat tail and a gnawed branch, water droplets in fur |
| b32 | Шерстистый Носорог | woolly rhinoceros with thick russet fur and a long curved horn |
| b33 | Мускусный Бык | musk ox in a defensive stance with massive curved horns and a long skirt of fur |
| b34 | Тарпан | wild untamed tarpan horse, dark grey coat, upright mane, defiant stare |
| b35 | Лось | tall moose bull with broad palmate antlers, calm shepherd gaze, hanging moss |
| b36 | Гигантская Черепаха | giant ancient tortoise with a mossy armored shell like a hill |
| b37 | Мамонт | huge woolly mammoth with sweeping tusks and a thick hump of fur, falling snow |
| b38 | Золотой Олень | radiant golden deer with softly glowing antlers and floating light dust |
| b39 | Папоротник | dense fern thicket with curling fronds hiding a pair of watchful eyes |
| b40 | Плющ | creeping ivy coil with glossy leaves strangling a broken branch |
| b41 | Ельник | dark spruce grove shaped as a cluster of fir trees with a shadowy hollow |
| b42 | Мухомор | cluster of red fly agaric mushrooms with white spots exhaling spore haze |
| b43 | Плакучая Ива | weeping willow with long falling branches veiling a dark hollow |
| b44 | Тис | yew tree with dark needle fans and clusters of bright red berries |
| b45 | Терновник | blackthorn thicket with long vicious thorns and pale blossoms |
| b46 | Омела | mistletoe bundle growing parasitically on a bare branch, white berries |
| b47 | Дуб-Патриарх | enormous ancient oak with a massive gnarled trunk and a hollow like a face, acorns |
| b48 | Секвойя | colossal sequoia trunk rising beyond the frame, fire-scarred bark |
| b49 | Лунная Роща | small circle of pale trees in moonlight with a cold moon glow above |
| b50 | Прародитель Леса | titanic ancestral tree with a face in the bark, roots gripping stones |
| b51 | Сердце Чащи | glowing green heart-shaped hollow in a dense living thicket |
| b52 | Шепчущая Роща | grove of leaves opening like tiny mouths, faint green wisps of sound |
| b53 | Зимний Багульник | misty wild rosemary bush exhaling narcotic fog with pale blooms |
| b54 | Серый Предок | ghostly grey spirit wolf, translucent fur dissolving into mist, wise old eyes |
| b55 | Рогатая Мать | spectral deer-mother spirit with great antlers and a calm protective glow |
| b56 | Старая Крона | ancient canopy spirit, a wise leafy face made of crowns of foliage |
| b57 | Крылатый Пожиратель | monstrous spectral vulture with vast spread wings and hollow eyes |
| b58 | Полуночный Гон | phantom hunting pack of wolves merged into one dark galloping mass under a black moon |
| b59 | Хозяин Троп | forest path spirit, a lantern-eyed wanderer whose body is a winding trail |
