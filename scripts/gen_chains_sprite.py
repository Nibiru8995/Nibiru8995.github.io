#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================
# v1.5.6 «ПЕПЕЛЬНЫЕ ОКОВЫ» — генератор спрайтов цепей нежити.
#
# Рисует БЕЗ СУПЕРСЭМПЛИНГА — честный пиксель-арт, каждый пиксель
# ставится вручную (урок v1.5.2: растяжение/сглаживание = каша).
#
# assets/fx/chains_h.png      24x21 — бандa из ПЯТИ цепочек (гориз.)
# assets/fx/chains_v.png      21x24 — то же, повёрнуто (вертик.)
# assets/fx/glint_pale_h.png  24x21 — холодный проблеск (та же
#                                    геометрия цепей, яркая сталь,
#                                    мягкое колокольное окно) — свечение
#                                    ВСЕГДА лежит ровно на звеньях
# assets/fx/glint_royal_h.png 24x21 — яркий фиолетовый отблеск особых
#                                    связей (шире и ярче)
# assets/fx/glint_*_v.png           — вертикальные варианты
#
# Требование бесшовности: период каждой цепочки делит 24 — тайл
# стыкуется сам с собой без шва.
# ============================================================
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = os.path.join(ROOT, 'assets', 'fx')

# ---------- палитра: холодная могильная сталь ----------
# Урок живого прогона: тёмный металл на тёмных картах (#17171a) исчезает —
# держим контраст тела 6:1, глубину даёт контур и тень, не общая темнота.
PAL = {
    'O': (15, 16, 20, 255),     # контур
    'd': (56, 63, 74, 255),     # тёмное железо
    'm': (84, 94, 108, 255),    # железо
    'l': (114, 126, 142, 255),  # светлое железо
    'h': (153, 165, 181, 255),  # холодный блик
    'p': (199, 208, 219, 255),  # сталь, спекуляр (редко)
    'B': (183, 173, 151, 255),  # кость
    'b': (127, 118, 101, 255),  # кость, тень
    'g': (76, 96, 86, 255),     # могильная патина
    'G': (107, 131, 112, 255),  # патина светлая
    '.': (0, 0, 0, 0),
}

# ---------- «горячие» палитры проблесков (та же геометрия) ----------
PALE = {  # лунная сталь — небольшой проблеск по всем цепям
    'O': (56, 66, 80, 255),  'd': (99, 112, 128, 255), 'm': (140, 154, 170, 255),
    'l': (183, 197, 211, 255), 'h': (216, 228, 238, 255), 'p': (240, 246, 251, 255),
    'B': (240, 235, 224, 255), 'b': (183, 175, 156, 255),
    'g': (108, 132, 119, 255), 'G': (148, 172, 155, 255),
}
ROYAL = {  # фиолетовая магия тьмы — яркий отблеск особых связей
    'O': (72, 40, 110, 255), 'd': (118, 72, 182, 255), 'm': (166, 114, 235, 255),
    'l': (206, 160, 255, 255), 'h': (231, 205, 255, 255), 'p': (249, 238, 255, 255),
    'B': (233, 213, 255, 255), 'b': (168, 127, 224, 255),
    'g': (122, 85, 200, 255), 'G': (163, 127, 232, 255),
}

TW, TH = 24, 26  # тайл: 24 по ходу цепи, 26 поперёк банды

# ---------- штампы звеньев (пиксели ставятся вручную) ----------
# Свет сверху-слева: блик ТОЛЬКО на голове звена, тело целиком, тень снизу-справа.
# Прочность силуэта важнее деталей: на 1x дырки-точки превращаются в шум.
# обычное звено, 4x3 — тело НЕПРЕРЫВНО (dlmm), засечка-провал тёмная, но видимая:
# урок живого прогона — чистый контур 'O' (люм ~17) на карте #17171а
# превращает цепь в рассыпанные штрихи
T1 = ['.hm.',
      'dlmm',
      '.dd.']
# тяжёлое звено, 5x4 — крупная дыра читается как кольцо
T3 = ['.hmm.',
      'dl..d',
      'm...d',
      '.ddd.']
# тонкая цепь, 2x2 (период 3)
T5 = ['hm',
      'dm']
# бусина-кость, 2x3 (вставлена в провисшую цепочку)
BONE = ['BB',
        'bB',
        'bb']

import math

def wave(x, amp):
    """Гладкая периодическая волна провиса: dy 0..amp по всему тайлу."""
    return int(round(amp * (1 - math.cos(2 * math.pi * (x % TW) / TW))))


def build_band():
    """Банда из пяти по-разному натянутых цепочек, 24x21, бесшовная по X."""
    im = Image.new('RGBA', (TW, TH), (0, 0, 0, 0))
    px = im.load()

    def stamp(x, y, rows):
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch == '.':
                    continue
                xx = (x + i) % TW          # заворот через край тайла — бесшовность
                yy = y + j
                if 0 <= yy < TH:
                    px[xx, yy] = PAL[ch]

    # --- цепь 0: тугая мелкая (y1..3), период 4, без провиса ---
    for x in range(0, TW, 4):
        stamp(x, 1, T1)

    # --- цепь 1: провисшая (y6..8), глубокая волна до +2, сдвиг фазы 2 ---
    for x in range(0, TW, 4):
        stamp(x + 2, 6 + wave(x + 4, 2), T1)

    # --- цепь 2: тяжёлые крупные кольца, тугая (y12..15), период 6 ---
    for x in range(0, TW, 6):
        stamp(x, 12, T3)

    # --- цепь 3: слабина (y18..20), волна до +1; каждые 12px — костяная бусина ---
    for x in range(0, TW, 4):
        xx = x % TW
        if xx == 12:
            stamp(x, 18 + wave(x + 1, 1), BONE)
        else:
            stamp(x, 18 + wave(x + 2, 1), T1)

    # --- цепь 4: тонкая тугая (y23..24), период 3 ---
    for x in range(0, TW, 3):
        stamp(x, 23, T5)

    # лёгкая патина на паре звеньев (кладбищенский налёт)
    accents = [(9, 14, 'g'), (21, 13, 'G'), (2, 8, 'g'), (17, 7, 'G')]
    for xx, yy, ch in accents:
        px[xx, yy] = PAL[ch]
    # спекуляр: один холодный блик на звене тяжёлой цепи
    px[13, 12] = PAL['p']
    return im


def repalette(band, pal):
    """Та же геометрия цепей в другой палитре (для проблесков)."""
    out = Image.new('RGBA', band.size, (0, 0, 0, 0))
    po, pi = out.load(), band.load()
    lut = {(c[0], c[1], c[2]): pal[ch] for ch, c in PAL.items() if ch != '.'}
    for y in range(band.size[1]):
        for x in range(band.size[0]):
            r, g, b, a = pi[x, y]
            if a == 0:
                continue
            po[x, y] = lut[(r, g, b)]
    return out


def bell_window(img, steps):
    """Колокольное окно яркости по X: сам проблеск — узкая полоса света.
    steps: альфа по дистанции от центра тайла (пиксель-арт ступени)."""
    w, h = img.size
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    po, pi = out.load(), img.load()
    cx = w // 2
    for y in range(h):
        for x in range(w):
            r, g, b, a = pi[x, y]
            if a == 0:
                continue
            dist = min(abs(x - cx), w - abs(x - cx))  # окно бесшовно по тайлу
            al = steps[dist] if dist < len(steps) else 0
            if al <= 0:
                continue
            po[x, y] = (r, g, b, int(a * al))
    return out


def mock_scene(band, glint, gpx, zoom, phase):
    """Макет связи: тёмный фон, две «карты», между ними стежок с бандой.
    phase — позиция центра проблеска вдоль связи (px). Всё в реальных px,
    в конце — NEAREST-зум для разглядывания."""
    card_w, gap = 74, 5
    W, H = card_w * 2 + gap, 96
    scene = Image.new('RGBA', (W, H), (12, 14, 12, 255))
    sc = scene.load()
    for cx in range(card_w):                      # карты — как .card: тёмные с рамкой
        for cy in range(14, 82):
            for x0 in (0, card_w + gap):
                x = x0 + cx
                edge = cx in (0, card_w - 1) or cy in (14, 81)
                sc[x, cy] = (96, 82, 122, 255) if edge else (23, 23, 26, 255)
    y_c = 48                                      # тень-подложка в зазоре
    for x in range(card_w - 1, card_w + gap + 1):
        for dy in range(-5, 6):
            sc[x, y_c + dy] = (5, 6, 5, 255)
    x0, x1 = card_w - gpx, card_w + gap + gpx     # банда: глобальная фаза тайлов
    ty = y_c - band.height // 2
    x = (x0 // band.width) * band.width
    while x < x1:
        scene.alpha_composite(band, (x, ty))
        x += band.width
    if glint:                                     # ОДНО окно проблеска
        scene.alpha_composite(glint, (x0 + phase - glint.width // 2, ty))
    box = (x0 - 10, y_c - 16, x1 + 10, y_c + 16)
    return scene.crop(box).resize(((box[2] - box[0]) * zoom, (box[3] - box[1]) * zoom),
                                  Image.NEAREST)


def main():
    os.makedirs(FX, exist_ok=True)
    band = build_band()
    band_v = band.transpose(Image.ROTATE_90)

    pale = bell_window(repalette(band, PALE), [1.0, 0.62, 0.28, 0.10])
    royal = bell_window(repalette(band, ROYAL), [1.0, 0.82, 0.55, 0.30, 0.14, 0.05])
    pale_v = pale.transpose(Image.ROTATE_90)
    royal_v = royal.transpose(Image.ROTATE_90)

    band.save(os.path.join(FX, 'chains_h.png'))
    band_v.save(os.path.join(FX, 'chains_v.png'))
    pale.save(os.path.join(FX, 'glint_pale_h.png'))
    pale_v.save(os.path.join(FX, 'glint_pale_v.png'))
    royal.save(os.path.join(FX, 'glint_royal_h.png'))
    royal_v.save(os.path.join(FX, 'glint_royal_v.png'))
    print('sprites written to', FX)

    # ---------- превью для контроля (в репо не идёт) ----------
    Z = 10
    comp_p = Image.alpha_composite(band, pale)
    comp_r = Image.alpha_composite(band, royal)
    tiles = [band, comp_p, comp_r]
    sheet = Image.new('RGBA', (TW * Z + 40, (TH * Z + 20) * len(tiles) + 20), (14, 16, 14, 255))
    for i, t in enumerate(tiles):
        big = t.resize((TW * Z, TH * Z), Image.NEAREST)
        sheet.paste(big, (20, 20 + i * (TH * Z + 20)), big)

    # макеты связей (3x): без проблеска / проблеск слева / фиолетовый в центре
    g = 6
    mocks = [mock_scene(band, None, g, 3, 0),
             mock_scene(band, pale, g, 3, 2),
             mock_scene(band, royal, g, 3, 5)]
    mw = max(m.width for m in mocks)
    y = sheet.height + 10
    sheet2 = Image.new('RGBA', (max(sheet.width, mw + 40), y + sum(m.height + 10 for m in mocks)),
                       (14, 16, 14, 255))
    sheet2.paste(sheet, (0, 0))
    for i, m in enumerate(mocks):
        sheet2.paste(m, (20, y))
        y += m.height + 10
    out = os.path.join(os.path.dirname(ROOT), 'chains_preview.png')
    sheet2.save(out)
    print('preview:', out)


if __name__ == '__main__':
    main()
