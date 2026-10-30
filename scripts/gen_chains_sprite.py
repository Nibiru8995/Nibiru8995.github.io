#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================
# v1.5.8.1 «ГЛУХИЕ ОКОВЫ» — генератор спрайтов цепей нежити.
#
# УРОК v1.5.8 (фидбек игрока): «цепи полупрозрачные и закрывают
# слишком много пространства карты». ФИКС:
#   1) БАНДА ТОЛЬКО НА ШВЕ: 36px -> 14px (по 7px на карту — зона
#      рамки, арт карт свободен). Кромка по-прежнему вся: кольца
#      стоят по всей высоте/ширине общего края.
#   2) ГЛУХАЯ АЛЬФА: никаких альфа-фейдов — тело звена alpha=255,
#      концы звена жёстко обрезаны (звено НАХОДИТ на кромки карт
#      и держит их). Полупрозрачность остаётся только у проблеска
#      — это свет поверх глухого металла, не дырка в цепи.
#   3) ЗВЕНО-КОЛЬЦО: одна плитка = одно кольцо 14x14 поперёк шва
#      (как нарисовал игрок: овалы с дырами в столбик по шву).
#      Кольцо левого обода держит левую карту, правого — правую,
#      дыра в середине показывает шов. Стопка колец = цепь.
#
# assets/fx/chains_x.png      14x14 — ВЕРТИКАЛЬНЫЙ шов (соседи в
#                                   ряду): кольцо поперёк, стопка
#                                   по Y с периодом 14 — бесшовно.
# assets/fx/chains_y.png      14x14 — ГОРИЗОНТАЛЬНЫЙ шов (соседи в
#                                   столбце): транспозиция.
# assets/fx/glint_pale_x.png  14x14 — холодный проблеск: та же
#                                   геометрия в яркой стали с
#                                   колокольным окном поперёк шва
#                                   (свет бежит от карты к карте).
# assets/fx/glint_royal_x.png 14x14 — яркий фиолетовый отблеск
#                                   особых связей (окно шире).
# assets/fx/glint_*_y.png           — варианты горизонтального шва.
#
# Рисуется БЕЗ СУПЕРСЭМПЛИНГА — честный пиксель-арт (урок v1.5.2).
# ============================================================
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = os.path.join(ROOT, 'assets', 'fx')

# ---------- палитра: холодная могильная сталь ----------
# Урок живого прогона: тёмный металл на тёмных картах исчезает —
# держим контраст тела ~6:1, глубину дают контур и тень.
PAL = {
    'O': (15, 16, 20, 255),     # контур
    'd': (56, 63, 74, 255),     # тёмное железо
    'm': (84, 94, 108, 255),    # железо
    'l': (114, 126, 142, 255),  # светлое железо
    'h': (153, 165, 181, 255),  # холодный блик
    'p': (199, 208, 219, 255),  # сталь, спекуляр (редко)
    'g': (76, 96, 86, 255),     # могильная патина
    'G': (107, 131, 112, 255),  # патина светлая
    '.': (0, 0, 0, 0),
}

# ---------- «горячие» палитры проблесков (та же геометрия) ----------
PALE = {  # лунная сталь — проблеск по всем цепям
    'O': (56, 66, 80, 255),  'd': (99, 112, 128, 255), 'm': (140, 154, 170, 255),
    'l': (183, 197, 211, 255), 'h': (216, 228, 238, 255), 'p': (240, 246, 251, 255),
    'g': (108, 132, 119, 255), 'G': (148, 172, 155, 255),
}
ROYAL = {  # фиолетовая магия тьмы — яркий отблеск особых связей
    'O': (72, 40, 110, 255), 'd': (118, 72, 182, 255), 'm': (166, 114, 235, 255),
    'l': (206, 160, 255, 255), 'h': (231, 205, 255, 255), 'p': (249, 238, 255, 255),
    'g': (122, 85, 200, 255), 'G': (163, 127, 232, 255),
}

# плитка кольца: 14 поперёк шва (толщина банды), 14 вдоль шва (период стопки)
BW, BH = 14, 14

# ---------- звено-кольцо: ОВАЛ 14x12 в плитке 14x14 ----------
# Свет сверху-слева: блик по верхне-левому ободу, тень снизу-справа.
# Тело НЕПРЕРЫВНО вокруг дыры (урок: чистый контур рассыпается в штрихи).
# Ободы x0..3 / x10..13 держат левую/правую карты, дыра x4..9 показывает
# шов (это ДЫРКА кольца, не прозрачность металла). Эллипс считается
# программно — углы скругляются сами, звено читается ОВАЛОМ (как в эскизе).


def build_ring_tile():
    """Плитка 14x14 с одним овальным кольцом поперёк шва. ГЛУХАЯ альфа."""
    im = Image.new('RGBA', (BW, BH), (0, 0, 0, 0))
    px = im.load()
    cx, cy = 6.5, 6.5          # центр кольца
    rx, ry = 6.7, 5.7          # внешняя полуось: овал во всю толщу банды
    hx, hy = 2.9, 1.9          # внутренняя полуось (дыра)
    for y in range(BH):
        for x in range(BW):
            dx, dy = (x + .5 - cx) / rx, (y + .5 - cy) / ry
            if dx * dx + dy * dy > 1.0:
                continue                     # вне кольца — прозрачный фон
            e = dx * dx + dy * dy
            hdx, hdy = (x + .5 - cx) / hx, (y + .5 - cy) / hy
            if hdx * hdx + hdy * hdy <= 1.0:
                continue                     # дыра — шов виден насквозь
            # окраска по наклону поверхности: свет сверху-слева
            t = dy * .8 - dx * .5
            if e > .82:      ch = 'O'        # внешний край — контур
            elif t < -.42:   ch = 'h'        # блик
            elif t < -.12:   ch = 'l'        # светлое железо
            elif t < .28:    ch = 'm'        # железо
            elif t < .62:    ch = 'd'        # тёмное железо
            else:            ch = 'O'        # теневой край
            px[x, y] = PAL[ch]
    # патина (кладбищенский налёт) и спекуляр — по паре пикселей
    for xx, yy, ch in [(2, 3, 'G'), (3, 4, 'g'), (10, 9, 'G'), (9, 10, 'g'), (4, 10, 'g')]:
        if px[xx, yy][3]:
            px[xx, yy] = PAL[ch]
    px[7, 2] = PAL['p']                      # спекуляр на верхнем ободе
    px[3, 2] = PAL['p']
    return im


def repalette(band, pal):
    """Та же геометрия кольца в другой палитре (для проблесков)."""
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
    """Колокольное окно яркости ПОПЕРЁК шва (по X): свет бежит от карты
    к карте. Окно гаснет к ободам — свет живёт в середине звена."""
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
    """Макет ВЕРТИКАЛЬНОГО шва: две карты в ряду, стопка колец между ними.
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
    # банда: стопка плиток-колец вдоль всего шва
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
    x_band = build_ring_tile()
    y_band = x_band.transpose(Image.TRANSPOSE)   # оси поменяны, свет сверху сохранён

    pale_x = bell_x(repalette(x_band, PALE), [1.0, .93, .84, .72, .58, .42, .26, .12])
    royal_x = bell_x(repalette(x_band, ROYAL), [1.0, .96, .9, .84, .76, .66, .56, .44])
    pale_y = pale_x.transpose(Image.TRANSPOSE)
    royal_y = royal_x.transpose(Image.TRANSPOSE)

    x_band.save(os.path.join(FX, 'chains_x.png'))
    y_band.save(os.path.join(FX, 'chains_y.png'))
    pale_x.save(os.path.join(FX, 'glint_pale_x.png'))
    pale_y.save(os.path.join(FX, 'glint_pale_y.png'))
    royal_x.save(os.path.join(FX, 'glint_royal_x.png'))
    royal_y.save(os.path.join(FX, 'glint_royal_y.png'))
    print('sprites written to', FX)

    # ---------- превью для контроля (в репо не идёт) ----------
    Z = 10
    comp_p = Image.alpha_composite(x_band, pale_x)
    comp_r = Image.alpha_composite(x_band, royal_x)
    tiles = [x_band, comp_p, comp_r]
    sheet = Image.new('RGBA', (BW * Z + 40, (BH * Z + 20) * len(tiles) + 20), (14, 16, 14, 255))
    for i, t in enumerate(tiles):
        big = t.resize((BW * Z, BH * Z), Image.NEAREST)
        sheet.paste(big, (20, 20 + i * (BH * Z + 20)), big)
    mocks = [mock_scene_v(x_band, None, 4, 0),
             mock_scene_v(x_band, pale_x, 4, 10),
             mock_scene_v(x_band, royal_x, 4, 8)]
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
