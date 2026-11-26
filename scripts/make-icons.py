"""Génère les icônes PNG de l'application (nuage + gouttes). Usage : python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'app', 'icons')
BG, CLOUD, DROP = (15, 23, 42), (226, 232, 240), (56, 189, 248)

def icon(size, maskable=False):
    s = 4 * size  # sur-échantillonnage pour l'anticrénelage
    im = Image.new('RGB', (s, s), BG)
    d = ImageDraw.Draw(im)
    k = 0.72 if maskable else 1.0  # zone de sécurité des icônes « maskable »
    c = s / 2
    def P(x, y):
        return (c + (x - 0.5) * s * k, c + (y - 0.5) * s * k)
    def circle(x, y, r, fill):
        (cx, cy), rr = P(x, y), r * s * k
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=fill)
    circle(0.36, 0.45, 0.14, CLOUD)
    circle(0.52, 0.37, 0.18, CLOUD)
    circle(0.67, 0.47, 0.12, CLOUD)
    x0, y0 = P(0.24, 0.45); x1, y1 = P(0.78, 0.59)
    d.rounded_rectangle([x0, y0, x1, y1], radius=0.07 * s * k, fill=CLOUD)
    for x, y in [(0.36, 0.70), (0.52, 0.76), (0.68, 0.70)]:
        circle(x, y, 0.045, DROP)
        (cx, cy), rr = P(x, y), 0.045 * s * k
        d.polygon([(cx - rr, cy), (cx + rr, cy), (cx, cy - 2.4 * rr)], fill=DROP)
    return im.resize((size, size), Image.LANCZOS)

os.makedirs(OUT, exist_ok=True)
icon(192).save(os.path.join(OUT, 'icon-192.png'))
icon(512).save(os.path.join(OUT, 'icon-512.png'))
icon(512, maskable=True).save(os.path.join(OUT, 'icon-maskable-512.png'))
print('ok')
