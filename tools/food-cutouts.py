# Cuts every menu photo out of its background (table, board, plate) for the shop TV: img/cut/<key>.webp
# with a transparent background, and img/cut/index.json listing them with their size. The TV shows the
# cut-out food where there is one and the plain photo where there is not (a photo added since the last run).
# Look over the new cutouts: if one came out badly (a white box on a white table), delete its .webp and set its
# entry in index.json to null, and the TV keeps showing that photo as it is.
# Run after adding or changing menu photos, then commit img/cut:
#   pip install "rembg[cpu]" scipy && python3 tools/food-cutouts.py https://cheesypizza.online
import json, os, sys, io, urllib.request
import numpy as np
from PIL import Image
from scipy import ndimage
from rembg import remove, new_session

SERVER = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000').rstrip('/')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'img', 'cut')
MAX = 900

def get(url):
    # the clean original (the live site gives the till, admin and TV pages clean photos, and everyone else a marked copy)
    req = urllib.request.Request(url, headers={'X-Cheesy-Clean': '1', 'User-Agent': 'cheesy-cutouts'})
    with urllib.request.urlopen(req, timeout=60) as r: return r.read()

def key_of(img):
    """img/cut/<key>.webp: the photo's id for uploaded photos (api/images/<id>), its name for built-in ones"""
    return img.rsplit('/', 1)[-1] if img.startswith('api/images/') else img if '/' not in img else None

def cut(im, session):
    out = remove(im, session=session, post_process_mask=True)
    # keep the food: the biggest piece and anything at least a quarter its size; drop crumbs and splashes
    a = np.asarray(out)[..., 3]; lab, n = ndimage.label(a > 40)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        keep = ndimage.binary_dilation(np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= .25 * sizes.max()]), iterations=3)
        arr = np.asarray(out).copy(); arr[..., 3] = np.where(keep, arr[..., 3], 0); out = Image.fromarray(arr)
    # fill holes inside the food (white print on a fries box, glare on a pizza) so the slide does not show through
    arr = np.asarray(out).copy(); solid = ndimage.binary_fill_holes(arr[..., 3] > 40)
    arr[..., 3] = np.maximum(arr[..., 3], ndimage.binary_erosion(solid, iterations=2) * 255)
    out = Image.fromarray(arr)
    bb = out.getbbox()
    out = out.crop(bb) if bb else out
    out.thumbnail((MAX, MAX), Image.LANCZOS)
    return out

def main():
    state = json.loads(get(SERVER + '/api/state'))
    menu = (state.get('state') or state)['menu']
    os.makedirs(OUT, exist_ok=True)
    idx_file = os.path.join(OUT, 'index.json')
    index = json.load(open(idx_file)) if os.path.exists(idx_file) else {}
    session = new_session('isnet-general-use')
    for m in menu:
        img = m.get('img'); k = img and key_of(img)
        # done already; null in index.json marks a photo whose cutout came out badly (the TV keeps its plain photo)
        if not k or k in index and (index[k] is None or os.path.exists(os.path.join(OUT, k + '.webp'))): continue
        try:
            raw = get(SERVER + '/' + img) if img.startswith('api/') else open(os.path.join(ROOT, 'img', img + '.jpg'), 'rb').read()
            im = Image.open(io.BytesIO(raw))
            if not im.format or im.format.lower() not in ('jpeg', 'png', 'webp'): continue
            out = cut(im.convert('RGB'), session)
            out.save(os.path.join(OUT, k + '.webp'), 'WEBP', quality=86, method=6)
            index[k] = list(out.size); print('cut', m['name'], k, out.size, flush=True)
        except Exception as e:
            print('skipped', m['name'], e, flush=True)
    json.dump(index, open(idx_file, 'w'), indent=0, sort_keys=True)

main()
