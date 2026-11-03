#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v1.5.16 «Кровь и Кости» — генератор ПОЛНОЙ колоды блэкджека (52 карты + рубашка).

Основа — УЖЕ ИМЕЮЩИЕСЯ спрайты-карты игры (assets/cards/, НЕ трогаются):
  ВАЛЕТ = u12 Псалмопевец, ДАМА = u6 Плакальщик,
  КОРОЛЬ = u10 Владыка Тлена, ТУЗ = u8 Лич.
Портреты вписаны в резные окна на тёмной панели; числовые карты — классическая
раскладка векторных мастей (костей/крови); угловые индексы больше НЕ наезжают
на арт и НЕ обрезаются (зоны выверены по прямоугольникам).

Файлы: assets/casino/bj_<ранг>_<масть>.png (150×210) + bj_back.png.
Запуск:  python3 scripts/gen_bj_deck.py [--sheet] [--zoom]
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASINO = os.path.join(ROOT, 'assets', 'casino')
CARDS_SRC = os.path.join(ROOT, 'assets', 'cards')

CW, CH = 150, 210
RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'В', 'Д', 'К']
COURT_SPRITE = {10: 'u12', 11: 'u6', 12: 'u10', 0: 'u8'}   # В, Д, К, А

BONE      = (240, 231, 205)   # масти пик/треф + рамки
BLOOD     = (186, 48, 50)     # масти червей/бубен
BONE_DK   = (74, 62, 44)
BLOOD_DK  = (86, 16, 20)
INK       = (44, 36, 24)      # контур карты
PANEL_HI  = (43, 34, 25)      # центр тёмной панели (тёплый)
PANEL_LO  = (17, 13, 10)      # края панели
SUIT_COL  = {0: BONE, 1: BLOOD, 2: BLOOD, 3: BONE}
SUIT_DK   = {0: BONE_DK, 1: BLOOD_DK, 2: BLOOD_DK, 3: BONE_DK}

F_SERIF = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
_font_cache = {}
def font(sz):
    if sz not in _font_cache:
        _font_cache[sz] = ImageFont.truetype(F_SERIF, sz)
    return _font_cache[sz]

# ---------------------------------------------------------------- масти
# Векторные масти: рисуем в норм. координатах на суперсэмпле ×6, кэшируем.
_SS = 6
_glyph_cache = {}
def _draw_suit_shapes(d, s, S, fill, outline, ow):
    """Рисует фигуру масти s (0♠ 1♥ 2♦ 3♣) в масштабе S на холсте 1.0×1.0."""
    if s == 0:  # ПИКА: остриё + два лепестка + ножка
        d.ellipse((0.00*S, 0.22*S, 0.52*S, 0.74*S), fill=fill, outline=outline, width=ow)
        d.ellipse((0.48*S, 0.22*S, 1.00*S, 0.74*S), fill=fill, outline=outline, width=ow)
        d.polygon([(0.50*S, 0.02*S), (0.14*S, 0.62*S), (0.86*S, 0.62*S)], fill=fill, outline=outline, width=ow)
        d.polygon([(0.42*S, 0.64*S), (0.58*S, 0.64*S), (0.73*S, 0.97*S), (0.27*S, 0.97*S)], fill=fill, outline=outline, width=ow)
    elif s == 1:  # ЧЕРВА
        d.ellipse((0.00*S, 0.02*S, 0.52*S, 0.54*S), fill=fill, outline=outline, width=ow)
        d.ellipse((0.48*S, 0.02*S, 1.00*S, 0.54*S), fill=fill, outline=outline, width=ow)
        d.polygon([(0.02*S, 0.36*S), (0.98*S, 0.36*S), (0.50*S, 0.93*S)], fill=fill, outline=outline, width=ow)
    elif s == 2:  # БУБНА
        d.polygon([(0.50*S, 0.02*S), (0.86*S, 0.50*S), (0.50*S, 0.98*S), (0.14*S, 0.50*S)],
                  fill=fill, outline=outline, width=ow)
    else:       # ТРЕФА: три круга + ножка
        d.ellipse((0.27*S, 0.04*S, 0.73*S, 0.50*S), fill=fill, outline=outline, width=ow)
        d.ellipse((0.01*S, 0.33*S, 0.47*S, 0.79*S), fill=fill, outline=outline, width=ow)
        d.ellipse((0.53*S, 0.33*S, 0.99*S, 0.79*S), fill=fill, outline=outline, width=ow)
        d.polygon([(0.50*S, 0.28*S), (0.24*S, 0.62*S), (0.76*S, 0.62*S)], fill=fill, outline=outline, width=ow)
        d.polygon([(0.42*S, 0.64*S), (0.58*S, 0.64*S), (0.73*S, 0.97*S), (0.27*S, 0.97*S)], fill=fill, outline=outline, width=ow)

def _specular_coord(s):
    return {0: (0.30, 0.34), 1: (0.30, 0.22), 2: (0.36, 0.30), 3: (0.40, 0.30)}[s]

def suit_glyph(s, h):
    """RGBA-глиф масти высотой h пикселей (с контуром и бликом)."""
    key = (s, h)
    if key in _glyph_cache:
        return _glyph_cache[key]
    W = 0.86 if s == 2 else 1.0
    H = 0.95 if s == 1 else 1.0
    S = h * _SS
    # проход 1: тёмный контур (чуть увеличенный), проход 2: цвет — швов нет
    layer = Image.new('RGBA', (int(W*S), int(H*S) + _SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    _draw_suit_shapes(d, s, S, SUIT_DK[s] + (255,), SUIT_DK[s] + (255,), max(2, _SS))
    _draw_suit_shapes(d, s, S, SUIT_COL[s] + (255,), SUIT_COL[s] + (255,), 0)
    # блик
    sx, sy = _specular_coord(s)
    sr = 0.07 * S
    spec = Image.new('RGBA', layer.size, (0, 0, 0, 0))
    ImageDraw.Draw(spec).ellipse((sx*S - sr, sy*S - sr, sx*S + sr, sy*S + sr), fill=(255, 248, 230, 80))
    layer.alpha_composite(spec)
    glyph = layer.resize((max(1, int(round(W*h))), max(1, int(round(H*h)))), Image.LANCZOS)
    _glyph_cache[key] = glyph
    return glyph

def paste_suit(im, s, cx, cy, h, rot=False):
    g = suit_glyph(s, h)
    if rot:
        g = g.rotate(180, resample=Image.BICUBIC)
    im.alpha_composite(g, (int(cx - g.width / 2), int(cy - g.height / 2)))

# ---------------------------------------------------------------- база карты
def _noise_overlay(size, dark_a=9, light_a=7):
    """Мелкое зерно панели: два порога гауссова шума."""
    n = np.asarray(Image.effect_noise(size, 11), dtype=np.int16)
    rgba = np.zeros((size[1], size[0], 4), dtype=np.uint8)
    rgba[n < 116] = (0, 0, 0, dark_a)
    rgba[n > 140] = (255, 244, 214, light_a)
    return Image.fromarray(rgba)

def _vignette_mask(size):
    """Радиальное затемнение к краям (0 в центре → ~64 по углам)."""
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w]
    dx = (xx - (w - 1) / 2) / ((w - 1) / 2)
    dy = (yy - (h - 1) / 2) / ((h - 1) / 2)
    dist = np.sqrt(dx * dx + dy * dy) / np.sqrt(2)
    a = np.clip((dist - 0.52) * 150, 0, 64).astype('uint8')
    return Image.fromarray(a)

VIGN = None
def card_base(seed=0):
    """Костяная рамка + тёмная панель. Возвращает (image, draw)."""
    global VIGN
    rng = np.random.default_rng(seed)
    im = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # костяное поле с лёгким вертикальным градиентом
    top, bot = (246, 238, 216), (213, 199, 165)
    grad = np.linspace(0, 1, CH)[:, None, None]
    body = (np.array(top) * (1 - grad) + np.array(bot) * grad) * np.ones((CH, CW, 3), dtype=np.float64)
    im.paste(Image.fromarray(body.astype('uint8')), (0, 0))
    # пятна возраста (2-3 тусклых)
    stains = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    sd = ImageDraw.Draw(stains)
    for _ in range(rng.integers(2, 4)):
        x, y = rng.uniform(6, CW - 6), rng.uniform(6, CH - 6)
        r = rng.uniform(7, 22)
        sd.ellipse((x - r, y - r, x + r, y + r), fill=(120, 92, 52, 14))
    im.alpha_composite(stains)
    if VIGN is None:
        VIGN = _vignette_mask((CW, CH))
    im.paste(Image.new('RGB', (CW, CH), (28, 20, 12)), (0, 0), VIGN)
    d = ImageDraw.Draw(im)
    # контур + светлая фаска
    d.rounded_rectangle((0, 0, CW - 1, CH - 1), 14, outline=INK + (255,), width=2)
    d.rounded_rectangle((2, 2, CW - 3, CH - 3), 12, outline=(255, 252, 240, 60), width=1)
    # тёмная панель
    d.rounded_rectangle((8, 8, CW - 9, CH - 9), 9, fill=(23, 18, 13, 255))
    # тёплое свечение в центре панели
    yy, xx = np.mgrid[0:CH, 0:CW]
    dx = (xx - CW / 2) / (CW / 2); dy = (yy - CH / 2) / (CH / 2)
    dist = np.sqrt(dx * dx + dy * dy)
    glow = np.clip((1.0 - dist) * 34, 0, 34).astype('uint8')
    im.paste(Image.new('RGB', (CW, CH), (62, 48, 33)), (0, 0), Image.fromarray(glow))
    im.alpha_composite(_noise_overlay((CW, CH)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((8, 8, CW - 9, CH - 9), 9, outline=(0, 0, 0, 150), width=1)
    d.rounded_rectangle((11, 11, CW - 12, CH - 12), 7, outline=BONE + (64,), width=1)
    return im, d

# ------------------------------------------------- угловые индексы (зоны выверены)
TILE_W, TILE_H = 52, 78
def corner_tile(rank, s):
    tile = Image.new('RGBA', (TILE_W, TILE_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    fsz = 18 if rank == '10' else 22
    col = SUIT_COL[s]
    d.text((TILE_W / 2, 2), rank, font=font(fsz), fill=col + (255,),
           anchor='ma', stroke_width=1, stroke_fill=(18, 14, 10, 220))
    paste_suit(tile, s, TILE_W / 2, 38, 13)
    return tile

def add_corners(im, rank, s):
    t = corner_tile(rank, s)
    im.alpha_composite(t, (9, 9))                                     # верх-лево
    im.alpha_composite(t.rotate(180, resample=Image.BICUBIC), (CW - 9 - TILE_W, CH - 9 - TILE_H))

# ---------------------------------------------------------------- портреты
def unit_sprite(name, w, h):
    """Пиксель-портрет юнита: целочисленный NEAREST-апскейл, затем LANCZOS до box."""
    sp = Image.open(os.path.join(CARDS_SRC, name + '.png')).convert('RGBA')
    k = max(1, int(np.ceil(max(w, h) / max(sp.size))))
    up = sp.resize((sp.width * k, sp.height * k), Image.NEAREST)
    return up.resize((w, h), Image.LANCZOS)

def rounded_mask(size, r):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), r, fill=255)
    return m

# ---------------------------------------------------------------- сборка карт
def make_court(r, s):
    im, d = card_base(seed=r * 4 + s)
    # резное окно-портрет (28..106, 56..164) — не задевает зоны индексов
    box = (28, 56, 106, 164)
    d.rounded_rectangle(box, 9, fill=(19, 15, 11, 255))
    # тёплое свечение за портретом
    wv, hv = box[2] - box[0], box[3] - box[1]
    yy, xx = np.mgrid[0:hv, 0:wv]
    dx = (xx - wv / 2) / (wv / 2); dy = (yy - hv / 2) / (hv / 2)
    g = np.clip((1.0 - np.sqrt(dx * dx + dy * dy)) * 62, 0, 62).astype('uint8')
    im.paste(Image.new('RGB', (wv, hv), (80, 62, 40)), (box[0], box[1]), Image.fromarray(g, 'L'))
    art = unit_sprite(COURT_SPRITE[r], 74, 104)
    im.paste(art, (box[0] + (wv - art.width) // 2, box[1] + (hv - art.height) // 2),
             rounded_mask(art.size, 6))
    d.rounded_rectangle(box, 9, outline=BONE + (200,), width=2)
    d.rounded_rectangle((box[0] + 3, box[1] + 3, box[2] - 3, box[3] - 3), 7,
                        outline=(0, 0, 0, 130), width=1)
    # масть в медальонах сверху и снизу
    paste_suit(im, s, CW / 2, 34, 20)
    paste_suit(im, s, CW / 2, 184, 20, rot=True)
    add_corners(im, RANKS[r], s)
    return im

def make_ace(r, s):
    im, d = card_base(seed=100 + s)
    # медальон с Личем сверху
    bx = (CW / 2 - 32, 22, CW / 2 + 32, 86)
    d.rounded_rectangle(bx, 12, fill=(13, 10, 8, 255))
    art = unit_sprite(COURT_SPRITE[0], 58, 58)
    im.paste(art, (int(CW / 2 - art.width / 2), 25), rounded_mask(art.size, 8))
    d.rounded_rectangle(bx, 12, outline=BONE + (210,), width=2)
    d.rounded_rectangle((bx[0] + 3, bx[1] + 3, bx[2] - 3, bx[3] - 3), 9, outline=(0, 0, 0, 130), width=1)
    # большая масть по центру
    paste_suit(im, s, CW / 2, 146, 54)
    # рунные точки
    for dx in (-10, 0, 10):
        d.ellipse((CW / 2 + dx - 1.5, 188, CW / 2 + dx + 1.5, 191), fill=BONE + (150,))
    add_corners(im, 'A', s)
    return im

# колонки/ряды классической раскладки: x 54/75/94, y 40/103/166 — зоны индексов чисты
L, C, R = 54, 75, 94
T, MID, B = 40, 103, 166
def PIPS(n):
    m = {
        2:  [(C, T), (C, B)],
        3:  [(C, T), (C, MID), (C, B)],
        4:  [(L, T), (R, T), (L, B), (R, B)],
        5:  [(L, T), (R, T), (C, MID), (L, B), (R, B)],
        6:  [(L, T), (R, T), (L, MID), (R, MID), (L, B), (R, B)],
        7:  [(L, T), (R, T), (C, 71), (L, MID), (R, MID), (L, B), (R, B)],
        8:  [(L, T), (R, T), (C, 71), (L, MID), (R, MID), (C, 135), (L, B), (R, B)],
        9:  [(L, T), (R, T), (L, 82), (R, 82), (C, MID), (L, 124), (R, 124), (L, B), (R, B)],
        10: [(L, T), (R, T), (C, 61), (L, 82), (R, 82), (L, 124), (R, 124), (C, 145), (L, B), (R, B)],
    }
    return m[n]

def make_number(n, s):
    im, d = card_base(seed=n * 4 + s)
    ph = 16 if n == 10 else 19
    for (px, py) in PIPS(n):
        paste_suit(im, s, px, py, ph, rot=(py > MID + 1))
    add_corners(im, RANKS[n], s)
    return im

# ---------------------------------------------------------------- рубашка
def make_back():
    im, d = card_base(seed=777)
    panel = (9, 9, CW - 10, CH - 10)
    # решётка 45°: тайл 11px рисуем на ×4 и бесшовно мостим
    S = 4; ts = 11
    tile = Image.new('RGBA', (ts * S, ts * S), (0, 0, 0, 0))
    td = ImageDraw.Draw(tile)
    td.line([(0, 0), (ts * S, ts * S)], fill=BONE + (74,), width=5)
    td.line([(ts * S, 0), (0, ts * S)], fill=BONE + (74,), width=5)
    td.ellipse((ts * S / 2 - 6, ts * S / 2 - 6, ts * S / 2 + 6, ts * S / 2 + 6), fill=BONE + (96,))
    tile = tile.resize((ts, ts), Image.LANCZOS)
    patt = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    for ty in range(0, CH, ts):
        for tx in range(0, CW, ts):
            patt.alpha_composite(tile, (tx, ty))
    pm = Image.new('L', (CW, CH), 0)
    ImageDraw.Draw(pm).rounded_rectangle(panel, 8, fill=255)
    pa = np.asarray(patt.getchannel('A'), dtype=np.uint16) * np.asarray(pm, dtype=np.uint16)
    patt.putalpha(Image.fromarray((pa // 255).astype('uint8')))
    im.alpha_composite(patt)
    # медальон с черепом (×4 → LANCZOS)
    M = 400
    med = Image.new('RGBA', (M, M), (0, 0, 0, 0))
    md = ImageDraw.Draw(med)
    md.ellipse((8, 8, M - 8, M - 8), fill=(16, 12, 9, 235), outline=BONE + (255,), width=10)
    md.ellipse((44, 44, M - 44, M - 44), outline=BONE + (80,), width=4)
    for i in range(24):
        a = i / 24 * 2 * np.pi
        r0, r1 = 152, 172
        md.line([(M / 2 + np.cos(a) * r0, M / 2 + np.sin(a) * r0),
                 (M / 2 + np.cos(a) * r1, M / 2 + np.sin(a) * r1)], fill=BONE + (150,), width=8)
    skull_src = Image.open(os.path.join(CASINO, 'gen_icon_black.png')).convert('L')
    a = skull_src.point(lambda v: 255 if v > 45 else 0)
    bb = a.getbbox()
    if bb:
        skull_src = skull_src.crop(bb)
        a = a.crop(bb)
    sk = Image.new('RGBA', skull_src.size, (0, 0, 0, 0))
    sk.paste(Image.new('RGB', skull_src.size, (232, 222, 196)), (0, 0), a)
    sk.thumbnail((150, 150), Image.LANCZOS)   # череп ~35% медальона (400→98), кольцо видно
    med.alpha_composite(sk, (int(M / 2 - sk.width / 2), int(M / 2 - sk.height / 2)))
    med = med.resize((98, 98), Image.LANCZOS)
    im.alpha_composite(med, (int(CW / 2 - 49), int(CH / 2 - 49)))
    # тройные точки по углам панели
    for (cx, cy) in [(22, 22), (128, 22), (22, 188), (128, 188)]:
        d.ellipse((cx - 1.6, cy - 6, cx + 1.6, cy - 2.8), fill=BONE + (120,))
        d.ellipse((cx - 1.6, cy - 1.6, cx + 1.6, cy + 1.6), fill=BONE + (150,))
        d.ellipse((cx - 1.6, cy + 2.8, cx + 1.6, cy + 6), fill=BONE + (120,))
    d.rounded_rectangle(panel, 8, outline=BONE + (70,), width=1)
    return im

# ---------------------------------------------------------------- main
def build_all(sheet=False, zoom=False):
    n = 0
    for s in range(4):
        for r in range(13):
            if r == 0:
                im = make_ace(r, s)
            elif r >= 10:
                im = make_court(r, s)
            else:
                im = make_number(r + 1, s)
            im.save(os.path.join(CASINO, f'bj_{r}_{s}.png'))
            n += 1
    make_back().save(os.path.join(CASINO, 'bj_back.png'))
    print(f'OK: {n} карт + рубашка → {CASINO}')

    if sheet:
        cols, rows, cw, ch = 9, 6, 96, 134
        sh = Image.new('RGB', (cols * (cw + 6) + 6, rows * (ch + 6) + 6), (26, 22, 19))
        i = 0
        for s in range(4):
            for r in range(13):
                c, rw = i % cols, i // cols
                card = Image.open(os.path.join(CASINO, f'bj_{r}_{s}.png')).resize((cw, ch), Image.LANCZOS)
                sh.paste(card, (6 + c * (cw + 6), 6 + rw * (ch + 6)), card)
                i += 1
        back = Image.open(os.path.join(CASINO, 'bj_back.png')).resize((cw, ch), Image.LANCZOS)
        sh.paste(back, (6 + 1 * (cw + 6), 6 + 5 * (ch + 6)), back)
        out = '/home/z/my-project/scripts/sheet_new_deck.png'
        sh.save(out); print('sheet →', out, sh.size)
    if zoom:
        card = Image.open(os.path.join(CASINO, 'bj_10_1.png')).resize((CW * 2, CH * 2), Image.LANCZOS)
        out = '/home/z/my-project/scripts/zoom_court.png'
        card.save(out); print('zoom →', out)

if __name__ == '__main__':
    build_all('--sheet' in sys.argv, '--zoom' in sys.argv)
