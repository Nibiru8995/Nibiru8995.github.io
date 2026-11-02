#!/usr/bin/env python3
# v1.5.15 «Таверна Тьмы»: сборка казино-ассетов из AI-генерации.
# 52 карты блэкджека (В=Псалмопевец, Д=Плакальщик, К=Владыка Тлена, А=Лич)
# + рубашка + иконки рулетки + силуэт падальщика + фон таверны.
# СПРАЙТЫ ГРИДА НЕ ТРОГАЮТСЯ — всё складывается в assets/casino/.
from PIL import Image, ImageDraw, ImageFont, ImageOps
import os

DIR = '/home/z/my-project/game-repo/assets/casino'
F_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
CW, CH = 150, 210
RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'В', 'Д', 'К']
SUITS = ['\u2660', '\u2665', '\u2666', '\u2663']   # ♠ ♥ ♦ ♣
SUIT_COL = {0: (216, 210, 196), 1: (190, 40, 40), 2: (190, 40, 40), 3: (216, 210, 196)}
BONE = (216, 203, 168)
EDGE = (138, 122, 85)
INNER = (32, 27, 19)

def card_base():
    im = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, CW - 1, CH - 1), 14, fill=BONE + (255,))
    d.rounded_rectangle((4, 4, CW - 5, CH - 5), 11, fill=INNER + (255,), outline=EDGE + (255,), width=2)
    return im, d

def corner(im, rank, suit, cx, cy, rot=False):
    col = SUIT_COL[suit] + (255,)
    f1 = ImageFont.truetype(F_BOLD, 24 if rank != '10' else 20)
    f2 = ImageFont.truetype(F_BOLD, 18)
    tile = Image.new('RGBA', (64, 84), (0, 0, 0, 0))
    t2 = ImageDraw.Draw(tile)
    t2.text((32, 2), rank, font=f1, fill=col, anchor='ma')
    t2.text((32, 32), SUITS[suit], font=f2, fill=col, anchor='ma')
    if rot:
        tile = tile.rotate(180)
    im.alpha_composite(tile, (cx - 32, cy - 42))

def paste_art(im, art_path, box):
    art = Image.open(art_path).convert('RGB')
    w, h = art.size
    s = min(w, h)
    top = int((h - s) * 0.18)   # берём чуть выше центра — лица выше
    art = art.crop((0, top, w, top + s)).resize((box[2] - box[0], box[3] - box[1]), Image.LANCZOS)
    mask = Image.new('L', (box[2] - box[0], box[3] - box[1]), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, box[2] - box[0] - 1, box[3] - box[1] - 1), 8, fill=255)
    im.paste(art, (box[0], box[1]), mask)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(box, 8, outline=EDGE + (255,), width=2)

ARTS = {'В': 'gen_J.png', 'Д': 'gen_Q.png', 'К': 'gen_K.png', 'A': 'gen_A.png'}
L, Rt, T, B, mY = 46, CW - 46, 36, CH - 36, CH // 2
cx = CW // 2
PIPS = {
    2: [(cx, T), (cx, B)],
    3: [(cx, T), (cx, mY), (cx, B)],
    4: [(L, T), (Rt, T), (L, B), (Rt, B)],
    5: [(L, T), (Rt, T), (cx, mY), (L, B), (Rt, B)],
    6: [(L, T), (Rt, T), (L, mY), (Rt, mY), (L, B), (Rt, B)],
    7: [(L, T), (Rt, T), (cx, (T + mY) // 2), (L, mY), (Rt, mY), (L, B), (Rt, B)],
    8: [(L, T), (Rt, T), (cx, (T + mY) // 2), (L, mY), (Rt, mY), (cx, (mY + B) // 2), (L, B), (Rt, B)],
    9: [(L, T), (Rt, T), (L, T + 46), (Rt, T + 46), (cx, mY), (L, B - 46), (Rt, B - 46), (L, B), (Rt, B)],
    10: [(L, T), (Rt, T), (cx, T + 23), (L, T + 46), (Rt, T + 46), (L, B - 46), (Rt, B - 46), (cx, B - 23), (L, B), (Rt, B)],
}

for s in range(4):
    for r in range(13):
        rank = RANKS[r]
        im, d = card_base()
        box = (26, 26, CW - 26, CH - 26)
        if rank in ARTS:
            paste_art(im, os.path.join(DIR, ARTS[rank]), box)
            d.text((cx, CH - 30), SUITS[s], font=ImageFont.truetype(F_BOLD, 17), fill=SUIT_COL[s] + (255,), anchor='ma')
        else:
            fp = ImageFont.truetype(F_BOLD, 22)
            for (px, py) in PIPS[r + 1]:
                glyph = SUITS[s]
                if py > mY + 1:
                    tile = Image.new('RGBA', (44, 50), (0, 0, 0, 0))
                    ImageDraw.Draw(tile).text((22, 2), glyph, font=fp, fill=SUIT_COL[s] + (255,), anchor='ma')
                    tile = tile.rotate(180)
                    im.alpha_composite(tile, (px - 22, py - 25))
                else:
                    d.text((px, py), glyph, font=fp, fill=SUIT_COL[s] + (255,), anchor='ma')
        corner(im, rank, s, 24, 26)
        corner(im, rank, s, CW - 24, CH - 26, rot=True)
        im.save(os.path.join(DIR, f'bj_{r}_{s}.png'))

# ---------------- РУБАШКА ----------------
im, d = card_base()
for i in range(-CH, CW + CH, 20):
    d.line([(i, 0), (i + CH, CH)], fill=(70, 62, 45), width=3)
    d.line([(i + CH, 0), (i, CH)], fill=(52, 46, 33), width=3)
# медальон с черепом из AI-иконки
skull = extract = None
src = Image.open(os.path.join(DIR, 'gen_icon_black.png')).convert('L')
skull = Image.new('RGBA', src.size, (0, 0, 0, 0))
skull.putalpha(src.point(lambda v: 255 if v > 40 else 0))
skull_rgb = Image.composite(Image.new('RGB', src.size, BONE), Image.new('RGB', src.size, (0, 0, 0)), skull.split()[3])
bbox = skull.split()[3].getbbox()
if bbox:
    skull_rgb = skull_rgb.crop(bbox)
    skull_rgb.thumbnail((52, 52), Image.LANCZOS)
med = Image.new('RGBA', (84, 84), (0, 0, 0, 0))
md = ImageDraw.Draw(med)
md.ellipse((0, 0, 83, 83), fill=(40, 34, 25, 255), outline=BONE + (255,), width=3)
if bbox:
    med.paste(skull_rgb, (42 - skull_rgb.width // 2, 42 - skull_rgb.height // 2))
im.alpha_composite(med, (CW // 2 - 42, CH // 2 - 42))
d = ImageDraw.Draw(im)
d.rounded_rectangle((0, 0, CW - 1, CH - 1), 14, outline=EDGE + (255,), width=3)
im.save(os.path.join(DIR, 'bj_back.png'))

# ---------------- ИКОНКИ РУЛЕТКИ ----------------
def cut_icon(src_name, out_name, tint=None, size=64):
    src = Image.open(os.path.join(DIR, src_name)).convert('L')
    a = src.point(lambda v: 255 if v > 46 else 0)
    bb = a.getbbox()
    if not bb:
        print('!! пустая иконка', src_name); return
    rgb = Image.new('RGB', src.size, (20, 18, 16))
    col_img = Image.open(os.path.join(DIR, src_name)).convert('RGB')
    rgb = col_img
    icon = Image.new('RGBA', src.size, (0, 0, 0, 0))
    icon.putalpha(a)
    icon = icon.crop(bb)
    if tint:
        solid = Image.new('RGBA', icon.size, tint + (255,))
        icon = Image.composite(solid, icon, a.crop(bb).point(lambda v: 255 if v > 60 else 0))
    icon.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(icon, ((size - icon.width) // 2, (size - icon.height) // 2))
    canvas.save(os.path.join(DIR, out_name))

cut_icon('gen_icon_red.png', 'icon_red.png', size=64)
cut_icon('gen_icon_black.png', 'icon_black.png', size=64)

# ---------------- СИЛУЭТ ПАДАЛЬЩИКА ----------------
src = Image.open(os.path.join(DIR, 'gen_scav.png')).convert('L')
a = src.point(lambda v: 255 if v < 90 else 0)   # тёмные пиксели = силуэт
bb = a.getbbox()
sil = Image.new('RGBA', src.size, (0, 0, 0, 0))
dark = Image.new('RGBA', src.size, (16, 14, 18, 255))
sil = Image.composite(dark, sil, a)
if bb:
    sil = sil.crop(bb)
sil.thumbnail((160, 120), Image.LANCZOS)
sil.save(os.path.join(DIR, 'scav_silhouette.png'))

# ---------------- ФОН ТАВЕРНЫ ----------------
tv = Image.open(os.path.join(DIR, 'gen_tavern.png')).convert('RGB')
tv.save(os.path.join(DIR, 'tavern.jpg'), quality=82)

n_bj = len([f for f in os.listdir(DIR) if f.startswith('bj_')])
print('bj files:', n_bj, '(52 карт + рубашка = 53)')
for f in ['icon_red.png', 'icon_black.png', 'scav_silhouette.png', 'tavern.jpg']:
    p = os.path.join(DIR, f)
    print(f, os.path.exists(p), os.path.getsize(p) if os.path.exists(p) else 0)
