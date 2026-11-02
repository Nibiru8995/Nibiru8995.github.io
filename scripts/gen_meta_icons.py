#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_meta_icons.py — v1.6.0 «Гримуар»
Спрайты мета-валют:
  assets/dark_energy.png — Тёмная энергия (бывшие кристаллы): тёмно-фиолетовый
        сгусток с вихрем, лиловым свечением и искрами. Читается в 13-15px.
  assets/soul.png — Души: бледный потусторонний огонёк-душа (бирюзово-ледяной).
Рисование: суперсэмплинг ×8, гауссово свечение, LANCZOS-даунскейл.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 8                     # суперсэмплинг
SIZE = 96                 # итоговый размер
BIG = SIZE * S


def radial_glow(draw, cx, cy, r_in, r_out, col_in, col_out, steps=64):
    """Мягкое радиальное свечение концентрическими кругами."""
    for i in range(steps, 0, -1):
        t = i / steps
        r = r_out * t
        a = int(col_in[3] * (1 - t) + col_out[3] * t) if False else int(col_out[3] * t)
        # от прозрачного края к плотному центру
        alpha = int(col_in[3] + (col_out[3] - col_in[3]) * (1 - t))
        col = (col_in[0], col_in[1], col_in[2], max(0, min(255, alpha)))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)


def sphere_shading(draw, cx, cy, r, base, hi, lo, steps=72):
    """Тёмная сфера: свет сверху-слева, тень снизу-справа."""
    for i in range(steps, 0, -1):
        t = i / steps
        rr = r * t
        k = 1 - t
        col = tuple(int(base[c] + (hi[c] - base[c]) * (k ** 1.6)) for c in range(3))
        if t < 0.45:
            kk = t / 0.45
            col = tuple(int(lo[c] + (col[c] - lo[c]) * kk) for c in range(3))
        ox = -r * 0.18 * (1 - t)
        oy = -r * 0.22 * (1 - t)
        draw.ellipse([cx - rr + ox, cy - rr + oy, cx + rr + ox, cy + rr + oy], fill=col)


def dark_energy():
    im = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = BIG / 2
    R = BIG * 0.30

    # 1. Внешнее лиловое свечение (усилено для читаемости в 15px)
    glow = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(48, 0, -1):
        t = i / 48
        r = BIG * 0.47 * t
        a = int(150 * (1 - t) ** 1.1)
        gd.ellipse([c - r, c - r, c + r, c + r], fill=(140, 78, 210, a))
    glow = glow.filter(ImageFilter.GaussianBlur(BIG * 0.035))
    im.alpha_composite(glow)

    # 2. Тело сферы — тёмный фиолет, светлее прежнего
    body = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    sphere_shading(bd, c, c, R, base=(44, 20, 76), hi=(150, 84, 220), lo=(14, 6, 26))
    im.alpha_composite(body)

    # 2b. Светлый обод по краю сферы (рим-свет) — читаемость в мелком размере
    rim = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    rd.ellipse([c - R, c - R, c + R, c + R], outline=(196, 140, 255, 210), width=int(BIG * 0.018))
    rim = rim.filter(ImageFilter.GaussianBlur(BIG * 0.006))
    im.alpha_composite(rim)

    # 3. Вихрь энергии внутри (дуги-спирали)
    swirl = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    sd = ImageDraw.Draw(swirl)
    for k, (rr, col, w) in enumerate([
        (0.92, (168, 102, 232, 200), int(BIG * 0.020)),
        (0.72, (216, 168, 255, 230), int(BIG * 0.016)),
        (0.52, (122, 63, 184, 190), int(BIG * 0.018)),
    ]):
        pts = []
        n = 140
        for i in range(n + 1):
            t = i / n
            ang = t * math.pi * 2.6 + k * 2.1
            rad = R * rr * (0.35 + 0.65 * t)
            x = c + math.cos(ang) * rad
            y = c + math.sin(ang) * rad * 0.94
            pts.append((x, y))
        sd.line(pts, fill=col, width=w, joint='curve')
    swirl = swirl.filter(ImageFilter.GaussianBlur(BIG * 0.006))
    im.alpha_composite(swirl)

    # 4. Ядро — яркий сгусток
    core = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    cd = ImageDraw.Draw(core)
    radial_glow(cd, c * 0.94, c * 0.90, 0, R * 0.52, (236, 222, 255, 235), (236, 222, 255, 0))
    core = core.filter(ImageFilter.GaussianBlur(BIG * 0.012))
    im.alpha_composite(core)
    # 4b. Плотное яркое ядро поверх
    core2 = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    cd2 = ImageDraw.Draw(core2)
    cd2.ellipse([c * 0.94 - R * 0.16, c * 0.90 - R * 0.16, c * 0.94 + R * 0.16, c * 0.90 + R * 0.16], fill=(245, 236, 255, 240))
    core2 = core2.filter(ImageFilter.GaussianBlur(BIG * 0.008))
    im.alpha_composite(core2)

    # 5. Орбитальные искры + золотые flecks (стиль игры)
    sparks = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    pd = ImageDraw.Draw(sparks)
    rnd = 12345
    def prand():
        nonlocal rnd
        rnd = (rnd * 1103515245 + 12345) & 0x7fffffff
        return rnd / 0x7fffffff
    for i in range(26):
        ang = prand() * math.pi * 2
        rad = R * (1.02 + prand() * 0.45)
        x = c + math.cos(ang) * rad
        y = c + math.sin(ang) * rad * (0.9 + prand() * 0.2)
        s = BIG * (0.006 + prand() * 0.012)
        col = (216, 168, 255, 220) if prand() < 0.7 else (232, 192, 96, 210)
        pd.ellipse([x - s, y - s, x + s, y + s], fill=col)
    sparks = sparks.filter(ImageFilter.GaussianBlur(BIG * 0.004))
    im.alpha_composite(sparks)

    return im.resize((SIZE, SIZE), Image.LANCZOS)


def soul():
    im = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    c = BIG / 2

    # 1. Свечение
    glow = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(44, 0, -1):
        t = i / 44
        r = BIG * 0.44 * t
        a = int(80 * (1 - t) ** 1.3)
        gd.ellipse([c - r, c - r, c + r, c + r], fill=(88, 200, 216, a))
    glow = glow.filter(ImageFilter.GaussianBlur(BIG * 0.03))
    im.alpha_composite(glow)

    # 2. Пламя-душа: контур капли (языки огня)
    body = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    top = BIG * 0.16
    bot = BIG * 0.84
    cx = BIG * 0.485
    w = BIG * 0.185
    flame = []
    n = 60
    for i in range(n + 1):          # правая сторона вверх
        t = i / n
        y = bot + (top - bot) * t
        ww = w * math.sin((1 - t) ** 0.55 * math.pi) ** 0.8
        wig = math.sin(t * math.pi * 3.2) * BIG * 0.012
        flame.append((cx + ww + wig * (1 - t * 0.5), y))
    for i in range(n, -1, -1):      # левая сторона вниз
        t = i / n
        y = bot + (top - bot) * t
        ww = w * math.sin((1 - t) ** 0.55 * math.pi) ** 0.8
        wig = math.sin(t * math.pi * 3.2 + 1.1) * BIG * 0.014
        flame.append((cx - ww + wig * (1 - t * 0.5), y))
    bd.polygon(flame, fill=(64, 168, 190, 235))
    im.alpha_composite(body)

    # 3. Внутреннее ядро
    inner = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    idr = ImageDraw.Draw(inner)
    sc = 0.55
    core_pts = [((x - cx) * sc + cx * 1.02, (y - (top + bot) / 2) * sc * 0.86 + (top + bot) / 2 * 0.96) for (x, y) in flame]
    idr.polygon(core_pts, fill=(216, 255, 248, 235))
    inner = inner.filter(ImageFilter.GaussianBlur(BIG * 0.008))
    im.alpha_composite(inner)

    # 4. Хвостик-вихрь и капельки
    sp = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sp)
    rnd = 777
    def prand():
        nonlocal rnd
        rnd = (rnd * 1103515245 + 12345) & 0x7fffffff
        return rnd / 0x7fffffff
    for i in range(12):
        ang = -math.pi / 2 + (prand() - 0.5) * 2.4
        rad = BIG * (0.30 + prand() * 0.16)
        x = cx * 0.95 + math.cos(ang) * rad
        y = BIG * 0.52 + math.sin(ang) * rad
        s = BIG * (0.006 + prand() * 0.010)
        sd.ellipse([x - s, y - s, x + s, y + s], fill=(200, 255, 250, 200))
    sp = sp.filter(ImageFilter.GaussianBlur(BIG * 0.004))
    im.alpha_composite(sp)

    return im.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    os.makedirs(os.path.join(REPO, 'assets'), exist_ok=True)
    de = dark_energy()
    de.save(os.path.join(REPO, 'assets', 'dark_energy.png'), optimize=True)
    so = soul()
    so.save(os.path.join(REPO, 'assets', 'soul.png'), optimize=True)
    # Контактный лист для визуальной проверки
    sheet = Image.new('RGBA', (SIZE * 2 + 60, SIZE + 40), (18, 16, 22, 255))
    sheet.paste(de, (20, 20), de)
    sheet.paste(so, (SIZE + 40, 20), so)
    sheet.save(os.path.join(REPO, 'scripts', '_meta_icons_preview.png'))
    print('OK: assets/dark_energy.png, assets/soul.png')


if __name__ == '__main__':
    main()
