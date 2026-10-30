#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================
# v1.5.8 «ПОПЕРЕЧНЫЕ ОКОВЫ» — генератор спрайтов цепей нежити.
#
# УРОК v1.5.8 (фидбек игрока): «как цепи, которые держат два
# объекта, могут идти ВДОЛЬ этих объектов?» — никак. Цепь,
# которая СКРЕПЛЯЕТ две карты, идёт ПОПЕРЁК шва, от карты к
# карте, как скоба/стежок. Банда по-прежнему во всю кромку
# (вся высота/ширина общего края) — но цепочки внутри
# перпендикулярны шву и распределены по всей его длине.
#
# Рисуется БЕЗ СУПЕРСЭМПЛИНГА — честный пиксель-арт, каждый
# пиксель ставится вручную (урок v1.5.2).
#
# assets/fx/chains_x.png      36x24 — ВЕРТИКАЛЬНЫЙ шов (соседи в ряду):
#                                   4 ГОРИЗОНТАЛЬНЫЕ цепи поперёк шва;
#                                   стопка по Y с периодом 24 — бесшовно.
#                                   По X тайл НЕ стыкуется: длина цепи =
#                                   вся толщина банды 36px, концы
#                                   растворяются альфой — цепь «ныряет»
#                                   под кромку карты.
# assets/fx/chains_y.png      24x36 — ГОРИЗОНТАЛЬНЫЙ шов (соседи в
#                                   столбце): то же, оси поменяны.
# assets/fx/glint_pale_x.png  36x24 — холодный проблеск: та же геометрия
#                                   цепей в яркой стали с колокольным
#                                   окном ВДОЛЬ цепи (свет бежит поперёк
#                                   шва, от карты к карте).
# assets/fx/glint_royal_x.png 36x24 — яркий фиолетовый отблеск особых
#                                   связей (окно шире и ярче).
# assets/fx/glint_*_y.png           — варианты для горизонтального шва.
# ============================================================
import os
import math
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

# chains_x: 36 ПОПЕРЁК шва (толщина банды), 24 вдоль шва (период стопки)
BW, BH = 36, 24

# ---------- штампы звеньев (пиксели ставятся вручную) ----------
# Свет сверху-слева: блик ТОЛЬКО на голове звена, тело целиком, тень
# снизу-справа. Тело звена НЕПРЕРЫВНО вокруг дыры — чистый контур 'O'
# на карте #17171a рассыпает цепь в штрихи (урок живого прогона).
T1 = ['.hhmm.',      # обычное звено 6x4, период 6
      'hl..mm',
      'dm..md',
      '.dddd.']
T3 = ['.hhmmmm.',    # тяжёлое звено 8x5, крупная дыра — кольцо
      'hm....md',
      'dm....md',
      'dm....md',
      '.dddddd.']
T5 = ['hmm',         # тонкая цепь 3x2, период 3
      'ddm']
BONE = ['BBB',       # бусина-кость 3x4 (вставлена в провисшую цепь)
        'bBb',
        'bBb',
        'bbb']


def sag(x, period=18):
    """Провис цепи: плавная волна 0..1px вдоль цепочки."""
    return int(round((1 - math.cos(2 * math.pi * x / period)) / 2))


def build_cross_x():
    """ВЕРТИКАЛЬНЫЙ шов: 4 горизонтальные цепи-скобы поперёк шва, 36x24.
    Каждая цепь длиной во всю толщу банды (36px) — от кромки левой карты
    до кромки правой. Стопка по Y с периодом 24 — бесшовно; по X тайл
    не стыкуется, концы цепей растворяются альфой (ныряют под кромку)."""
    im = Image.new('RGBA', (BW, BH), (0, 0, 0, 0))
    px = im.load()

    def stamp(x, y, rows):
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch == '.':
                    continue
                xx, yy = x + i, y + j
                if 0 <= xx < BW and 0 <= yy < BH:
                    px[xx, yy] = PAL[ch]

    # --- скоба 0: тугая мелкая (y0..3), период 6 — ровно 6 звеньев ---
    for x in range(0, BW, 6):
        stamp(x, 0, T1)

    # --- скоба 1: тяжёлые крупные кольца (y6..10), период 9 ---
    for x in range(0, BW, 9):
        stamp(x, 6, T3)

    # --- скоба 2: провисшая (y13..17), волна ±1; костяная бусина на x19 ---
    for x in range(0, BW, 6):
        if x == 18:
            stamp(19, 13 + sag(19), BONE)
        else:
            stamp(x, 13 + sag(x + 3), T1)

    # --- скоба 3: тонкая тугая (y19..20), период 3 ---
    for x in range(0, BW, 3):
        stamp(x, 19, T5)

    # патина (кладбищенский налёт) и спекуляр на тяжёлом кольце
    for xx, yy, ch in [(4, 1, 'g'), (22, 2, 'G'), (12, 7, 'g'), (30, 8, 'G'),
                       (7, 14, 'g'), (27, 15, 'G'), (15, 19, 'g')]:
        px[xx, yy] = PAL[ch]
    px[10, 6] = PAL['p']
    px[2, 0] = PAL['p']

    # концы цепей ныряют под кромку: альфа-фейд на крайних столбцах
    fade = {0: .35, 1: .7, BW - 2: .7, BW - 1: .35}
    for x, k in fade.items():
        for y in range(BH):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = (r, g, b, int(a * k))
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


def bell_x(img, steps):
    """Колокольное окно яркости ВДОЛЬ цепи (по X): узкая полоса света,
    которая в игре едет поперёк шва. Окно НЕ бесшовное по X — тайл по X
    не стыкуется, свет гаснет к краям банды сам."""
    w, h = img.size
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    po, pi = out.load(), img.load()
    cx = (w - 1) / 2
    for y in range(h):
        for x in range(w):
            r, g, b, a = pi[x, y]
            if a == 0:
                continue
            d = int(round(abs(x - cx)))
            al = steps[d] if d < len(steps) else 0
            if al <= 0:
                continue
            po[x, y] = (r, g, b, int(a * al))
    return out


def mock_scene_v(band, glint, zoom, phase):
    """Макет ВЕРТИКАЛЬНОГО шва: две карты в ряду, банда-стопка между ними.
    phase — позиция окна проблеска поперёк шва (px). NEAREST-зум."""
    card_h, gap = 74, 5
    W, H = 96, card_h
    scene = Image.new('RGBA', (W, H), (12, 14, 12, 255))
    sc = scene.load()
    # две «карты» слева и справа от шва (шов по центру x=48)
    for side in (0, 1):
        x0 = side * (43 + gap)
        for cx in range(43):
            for cy in range(card_h):
                edge = cx in (0, 42) or cy in (0, card_h - 1)
                sc[x0 + cx, cy] = (96, 82, 122, 255) if edge else (23, 23, 26, 255)
    # тень-подложка вдоль шва
    for dy in range(card_h):
        for dx in range(-5, 6):
            xx = 43 + gap // 2 + 1 + dx
            if 0 <= xx < W:
                sc[xx, dy] = (5, 6, 5, 255)
    # банда: стопка плиток chains_x вдоль всего шва
    bx = 43 + gap // 2 + 1 - band.width // 2
    y = 0
    while y < card_h:
        scene.alpha_composite(band, (bx, y))
        y += band.height
    if glint:
        scene.alpha_composite(glint, (bx - glint.width + phase, 8))
    box = (bx - 14, 0, bx + band.width + 14, card_h)
    return scene.crop(box).resize(((box[2] - box[0]) * zoom, (box[3] - box[1]) * zoom),
                                  Image.NEAREST)


def main():
    os.makedirs(FX, exist_ok=True)
    x_band = build_cross_x()
    y_band = x_band.transpose(Image.TRANSPOSE)   # оси поменяны, свет сверху сохранён

    pale_x = bell_x(repalette(x_band, PALE), [1.0, .9, .78, .64, .5, .37, .26, .17, .1, .05])
    royal_x = bell_x(repalette(x_band, ROYAL), [1.0, .95, .88, .8, .7, .6, .5, .4, .3, .22, .15, .09, .04])
    pale_y = pale_x.transpose(Image.TRANSPOSE)
    royal_y = royal_x.transpose(Image.TRANSPOSE)

    x_band.save(os.path.join(FX, 'chains_x.png'))
    y_band.save(os.path.join(FX, 'chains_y.png'))
    pale_x.save(os.path.join(FX, 'glint_pale_x.png'))
    pale_y.save(os.path.join(FX, 'glint_pale_y.png'))
    royal_x.save(os.path.join(FX, 'glint_royal_x.png'))
    royal_y.save(os.path.join(FX, 'glint_royal_y.png'))

    # старые «вдоль шва» спрайты v1.5.6/7 больше не нужны — безжалостная чистка
    for old in ['chains_h.png', 'chains_v.png', 'glint_pale_h.png', 'glint_pale_v.png',
                'glint_royal_h.png', 'glint_royal_v.png']:
        p = os.path.join(FX, old)
        if os.path.exists(p):
            os.remove(p)
    print('sprites written to', FX)

    # ---------- превью для контроля (в репо не идёт) ----------
    Z = 8
    comp_p = Image.alpha_composite(x_band, pale_x)
    comp_r = Image.alpha_composite(x_band, royal_x)
    tiles = [x_band, comp_p, comp_r]
    sheet = Image.new('RGBA', (BW * Z + 40, (BH * Z + 20) * len(tiles) + 20), (14, 16, 14, 255))
    for i, t in enumerate(tiles):
        big = t.resize((BW * Z, BH * Z), Image.NEAREST)
        sheet.paste(big, (20, 20 + i * (BH * Z + 20)), big)
    mocks = [mock_scene_v(x_band, None, 4, 0),
             mock_scene_v(x_band, pale_x, 4, 26),
             mock_scene_v(x_band, royal_x, 4, 20)]
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
