#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================
# v1.5.10 «НЕРОВНЫЕ ОКОВЫ» — генератор спрайтов цепей нежити.
#
# ФИДБЕК ИГРОКА: прежний шов — плотная лестница одинаковых колец
# (читалась как решётка, а не как цепи). НОВЫЙ ОБРАЗ: шов скрепляют
# НЕСКОЛЬКО коротких цепей, ПО-РАЗНОМУ НАТЯНУТЫХ (тугая, средняя,
# слабая — слабая провисает дугой).
#
# ПЕРФ (урок v1.5.9): каждая нить ЗАПЕКАЕТСЯ В ОДИН СПРАЙТ — на шов
# 3 картинки-нити + 1 проблеск вместо 15 отдельных звеньев в DOM
# (на поле 9x9 это ~464 <image> вместо ~1740). Пиксели те же, что
# рисовал бы JS: звенья по квадратичной кривой (та же математика,
# что в drawUgLink), ориентация чередуется, металл ГЛУХОЙ (alpha=255).
#
# assets/fx/chain_v_0/1/2.png  30x30 — нить на ВЕРТИКАЛЬНОМ шве
#            (соседи в ряду): идёт горизонтально от карты к карте,
#            провисает ВНИЗ на 1.5 / 4 / 8 px.
# assets/fx/chain_h_0.png      30x30 — тугая нить на ГОРИЗОНТАЛЬНОМ
#            шве (соседи в столбце): идёт вертикально.
# assets/fx/chain_h_1l/1r.png  средняя (4px), бортает влево/вправо.
# assets/fx/chain_h_2l/2r.png  слабая (8px), бортает влево/вправо.
# assets/fx/glint_pale.png     14x14 — мягкий холодный отблеск, бежит
#            ВДОЛЬ нитей от карты к карте (SMIL animateMotion).
# assets/fx/glint_royal.png    14x14 — фиолетовый отблеск особых связей.
#
# Геометрия нити в спрайте: центр (14,14); опорные точки кривой:
#   chain_v_k: P0=(8,15) C=(15,15+2*slack) P2=(22,15)  → прогиб = slack
#   chain_h_*: P0=(15,8) C=(15±2*slack,15) P2=(15,22)  → прогиб = slack
# Рисуется БЕЗ СУПЕРСЭМПЛИНГА — честный пиксель-арт (урок v1.5.2).
# ============================================================
import math
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = os.path.join(ROOT, 'assets', 'fx')

# ---------- палитра: холодная могильная сталь (та же, что была) ----------
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
PALE_GLOW = (222, 234, 244)   # лунная сталь — свет проблеска
ROYAL_GLOW = (208, 156, 255)  # фиолетовая магия особых связей

TILE = 11           # плитка звена
FRAMES = 12         # поворотов звена с шагом 30°
RX, RY = 4.7, 3.4   # внешняя полуось овала (вдоль нити) — крупное звено
HX, HY = 2.2, 1.35  # полуось дыры
S = 30              # плитка целой нити (центр кривой — 15,15)
LINKS = 3           # звеньев на нити: крупное, боком, крупное


def link_class(v, e):
    """Класс пикселя звена по поперечной координате (v: -1..1) и вытянутости."""
    if e > 1.0:
        return '.'
    if e > .80:
        return 'O'                 # внешний контур
    t = v                          # свет сверху (в мире): v<0 — верх
    if t < -.45:
        return 'h'
    if t < -.10:
        return 'l'
    if t < .30:
        return 'm'
    if t < .66:
        return 'd'
    return 'O'


def draw_link(im, cx, cy, ang, sc=1.0):
    """Рисует звено-кольцо с центром (cx,cy), поворот ang (радианы, 0 = вдоль X).
    sc — масштаб (боковые звенья рисуются мельче: видны с торца)."""
    px = im.load()
    ca, sa = math.cos(ang), math.sin(ang)
    rx, ry, hx, hy = RX * sc, RY * sc, HX * sc, HY * sc
    for y in range(int(cy - 7), int(cy + 7) + 1):
        for x in range(int(cx - 7), int(cx + 7) + 1):
            if not (0 <= x < S and 0 <= y < S):
                continue
            dx, dy = x + .5 - cx, y + .5 - cy
            u = dx * ca + dy * sa      # вдоль нити
            v = -dx * sa + dy * ca     # поперёк
            e = (u / rx) ** 2 + (v / ry) ** 2
            ho = (u / hx) ** 2 + (v / hy) ** 2
            if e > 1.0 or ho <= 1.0:
                continue
            ch = link_class(v / ry, e)
            if ch != '.':
                px[x, y] = PAL[ch]
    # спекуляр и патина — по паре пикселей на верхнем ободе
    sx, sy = int(cx - (rx - 1.1) * ca), int(cy - (rx - 1.1) * sa - (ry - 1.3))
    if 0 <= sx < S and 0 <= sy < S and px[sx, sy][3]:
        px[sx, sy] = PAL['p']
    gx, gy = int(cx + (rx - 1.2) * sa), int(cy - (ry - 1.1) * ca)
    if 0 <= gx < S and 0 <= gy < S and px[gx, gy][3]:
        px[gx, gy] = PAL['G']


def quad_point(p0, c, p2, t):
    mt = 1 - t
    x = mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p2[0]
    y = mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p2[1]
    dx = 2 * mt * (c[0] - p0[0]) + 2 * t * (p2[0] - c[0])
    dy = 2 * mt * (c[1] - p0[1]) + 2 * t * (p2[1] - c[1])
    return x, y, math.atan2(dy, dx)


def bake_strand(fname, p0, c, p2):
    """Целая нить одним спрайтом 28x28: LINKS звеньев по дуге,
    ориентация чередуется (плашмя/боком), поворот — по касательной."""
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    for k in range(LINKS):
        t = .18 + .32 * k
        x, y, ang = quad_point(p0, c, p2, t)
        fr = int(round(ang / (2 * math.pi) * FRAMES)) % FRAMES
        fa = fr * 2 * math.pi / FRAMES
        sc = 1.0
        if k % 2:
            fa += math.pi / 2          # звено боком — виден с торца, мельче
            sc = .62
        draw_link(im, x, y, fa, sc)
    im.save(os.path.join(FX, fname))


def build_glow(color):
    """14x14 мягкое пятно света: полупрозрачен ТОЛЬКО свет (это проблеск,
    не металл). Сдержанная яркость (пик ~150): свет читается, но не
    превращается в снежные комья поверх звеньев."""
    Sg = 14
    im = Image.new('RGBA', (Sg, Sg), (0, 0, 0, 0))
    px = im.load()
    c = (Sg - 1) / 2.0
    for y in range(Sg):
        for x in range(Sg):
            d = math.hypot(x + .5 - c, y + .5 - c) / (Sg / 2.0)
            if d >= 1.0:
                continue
            a = (1.0 - d) ** 2.1
            core = max(0.0, 1.0 - math.hypot(x + .5 - c, y + .5 - c) / 1.8)
            alpha = int(round(128 * a + 28 * core))
            if alpha <= 0:
                continue
            px[x, y] = (color[0], color[1], color[2], min(255, alpha))
    return im


def mock_scene(zoom=5):
    """Макет ВЕРТИКАЛЬНОГО шва: две карты, три нити с разной натяжкой."""
    card_w, card_h, gap = 43, 74, 6
    W = card_w * 2 + gap
    scene = Image.new('RGBA', (W, card_h), (12, 14, 12, 255))
    sc = scene.load()
    for side in (0, 1):
        x0 = side * (card_w + gap)
        for cx in range(card_w):
            for cy in range(card_h):
                edge = cx in (0, card_w - 1) or cy in (0, card_h - 1)
                sc[x0 + cx, cy] = (96, 82, 122, 255) if edge else (23, 23, 26, 255)
    glow_p = build_glow(PALE_GLOW)
    mx = card_w + gap // 2
    for si, slack in enumerate((1.5, 4, 8)):
        y = int(card_h * (si + 1) / 4.0)
        bake_strand('_tmp.png', (8, 15), (15, 15 + slack * 2), (22, 15))
        strand = Image.open(os.path.join(FX, '_tmp.png'))
        scene.alpha_composite(strand, (mx - 15, y - 15))
        gx, gy = .25 * 8 + .5 * 15 + .25 * 22, .25 * 15 + .5 * (15 + slack * 2) + .25 * 15
        scene.alpha_composite(glow_p, (mx - 15 + int(gx) - 7, y - 15 + int(gy) - 7))
    os.remove(os.path.join(FX, '_tmp.png'))
    return scene.resize((W * zoom, card_h * zoom), Image.NEAREST)


def main():
    os.makedirs(FX, exist_ok=True)
    # вертикальный шов: нить горизонтальна, провисает ВНИЗ (1.5 / 4 / 8 px)
    for k, slack in enumerate((1.5, 4, 8)):
        bake_strand('chain_v_%d.png' % k, (8, 15), (15, 15 + slack * 2), (22, 15))
    # горизонтальный шов: нить вертикальна; тугая — прямая, слабые бортают вбок
    bake_strand('chain_h_0.png', (15, 8), (15, 15), (15, 22))
    for k, slack in ((1, 4), (2, 8)):
        for side, sx in (('l', -1), ('r', 1)):
            bake_strand('chain_h_%d%s.png' % (k, side),
                        (15, 8), (15 + sx * slack * 2, 15), (15, 22))
    build_glow(PALE_GLOW).save(os.path.join(FX, 'glint_pale.png'))
    build_glow(ROYAL_GLOW).save(os.path.join(FX, 'glint_royal.png'))
    # отдельные звенья и старые плитки-банды больше не нужны
    for old in ('chains_x.png', 'chains_y.png', 'chain_link.png',
                'glint_pale_x.png', 'glint_pale_y.png',
                'glint_royal_x.png', 'glint_royal_y.png'):
        p = os.path.join(FX, old)
        if os.path.exists(p):
            os.remove(p)
            print('removed old', old)
    for f in range(12):
        p = os.path.join(FX, 'chain_link_%d.png' % f)
        if os.path.exists(p):
            os.remove(p)
    print('sprites written to', FX)

    # ---------- превью для контроля (в репо не идёт) ----------
    comp = mock_scene()
    out = os.path.join(os.path.dirname(ROOT), 'chains_preview.png')
    comp.save(out)
    print('preview:', out)


if __name__ == '__main__':
    main()
