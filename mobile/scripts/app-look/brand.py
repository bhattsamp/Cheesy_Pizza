# Traces the owner's logo artwork (img/logo-source.png, teal and white on black) into exact vector
# shapes and writes img/logo*.svg: the full logo, the pin alone, the wordmark, and white versions of
# each for dark backgrounds. The black background is dropped (transparent).
# Run: pip install potracer && python3 mobile/scripts/app-look/brand.py img
import os, sys
import numpy as np, potrace
from PIL import Image
OUT = sys.argv[1] if len(sys.argv) > 1 else 'img'
K = 2  # trace at twice the size for smoother curves
TEAL = '#10A1BC'
im = np.asarray(Image.open(os.path.join(OUT, 'logo-source.png')).convert('RGB')).astype(np.float32)
a = np.clip(im.max(2) / 188.0, 0, 1)                    # how much of each pixel is logo (not black)
un = im / np.maximum(a, 1e-4)[..., None]
t = np.clip((un[..., 0] - 16) / 239, 0, 1) * (a > .15)  # how white it is (the ring lettering)
up = lambda m: np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((m.shape[1] * K, m.shape[0] * K), Image.BICUBIC)).astype(np.float32) / 255
f = lambda v: ('%.1f' % (v / K)).rstrip('0').rstrip('.')

def trace(mask):
    """[(path data, x0, y0, x1, y1)] for each traced outline, in the source image's pixels"""
    out = []
    for c in potrace.Bitmap(mask).trace(turdsize=8, alphamax=1.0, opticurve=True, opttolerance=.2):
        s = c.start_point; d = [f'M{f(s.x)} {f(s.y)}']; xs = [s.x]; ys = [s.y]
        for g in c.segments:
            e = g.end_point
            if g.is_corner: d.append(f'L{f(g.c.x)} {f(g.c.y)}L{f(e.x)} {f(e.y)}'); xs += [g.c.x, e.x]; ys += [g.c.y, e.y]
            else: d.append(f'C{f(g.c1.x)} {f(g.c1.y)} {f(g.c2.x)} {f(g.c2.y)} {f(e.x)} {f(e.y)}'); xs.append(e.x); ys.append(e.y)
        out.append((''.join(d) + 'Z', min(xs) / K, min(ys) / K, max(xs) / K, max(ys) / K))
    # potracer also returns the frame of the whole picture: drop it
    H, Wd = mask.shape
    return [c for c in out if not (c[1] <= 1 and c[2] <= 1 and c[3] >= Wd / K - 1 and c[4] >= H / K - 1)]

teal = trace(up(a) > .5)          # everything that is not black: pin (with its centre hole), C, name, tagline
white = trace(up(t * a) > .5)     # the white lettering and stars round the ring
# The round hole in the middle of the pin comes out a little lumpy from the photo: make it a true circle
def roundish(c):
    w, h = c[3] - c[1], c[4] - c[2]
    return w > 150 and abs(w - h) < .03 * w
for i, c in enumerate(teal):
    if roundish(c) and c[3] - c[1] < 400:
        cx, cy, r = (c[1] + c[3]) / 2, (c[2] + c[4]) / 2, (c[3] - c[1] + c[4] - c[2]) / 4
        teal[i] = (f'M{cx - r:.1f} {cy:.1f}A{r:.1f} {r:.1f} 0 1 0 {cx + r:.1f} {cy:.1f}A{r:.1f} {r:.1f} 0 1 0 {cx - r:.1f} {cy:.1f}Z',) + c[1:]
# The pin is the biggest outline; its tip is where the pin ends and the wordmark starts
pin = max(teal, key=lambda c: (c[3] - c[1]) * (c[4] - c[2]))
TIP = pin[4]
in_pin = lambda c: c[4] <= TIP + 1
P = [c for c in teal if in_pin(c)]; W = [c for c in teal if not in_pin(c)]
box = lambda cs: (min(c[1] for c in cs), min(c[2] for c in cs), max(c[3] for c in cs), max(c[4] for c in cs))
def vb(cs, pad):
    x0, y0, x1, y1 = box(cs)
    return f'{x0 - pad:.0f} {y0 - pad:.0f} {x1 - x0 + 2 * pad:.0f} {y1 - y0 + 2 * pad:.0f}'
d = lambda cs: ' '.join(c[0] for c in cs)
svg = lambda v, body: f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{v}">{body}</svg>'
color = lambda cs, ring=True: f'<path fill="{TEAL}" fill-rule="evenodd" d="{d(cs)}"/>' + (f'<path fill="#fff" fill-rule="evenodd" d="{d(white)}"/>' if ring else '')
# White versions: the ring lettering is cut out of the white pin, so the background shows through it
knock = lambda cs: (f'<defs><mask id="k" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1600"><rect width="1600" height="1600" fill="#fff"/>'
                    f'<path fill="#000" fill-rule="evenodd" d="{d(white)}"/></mask></defs><path fill="#fff" fill-rule="evenodd" mask="url(#k)" d="{d(cs)}"/>')
# The pin's viewBox has 6 units round the pin's circle (logo.js uses that to place it)
PV = vb(P, 6)
files = {
    'logo.svg': svg(vb(teal, 12), color(teal)),
    'logo-white.svg': svg(vb(teal, 12), knock(teal)),
    'logo-pin.svg': svg(PV, color(P)),
    'logo-pin-white.svg': svg(PV, knock(P)),
    'logo-wordmark.svg': svg(vb(W, 8), color(W, False)),
    'logo-wordmark-white.svg': svg(vb(W, 8), f'<path fill="#fff" fill-rule="evenodd" d="{d(W)}"/>'),
}
for n, s in files.items():
    open(os.path.join(OUT, n), 'w').write(s); print(n, len(s))
