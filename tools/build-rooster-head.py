#!/usr/bin/env python3
"""
Construit « Coq Fu Man » : un combattant au corps pixel art de Kung Fu Man
avec une tête de coq greffée.

Pourquoi : le coq illustré jure visuellement avec les personnages MUGEN en
pixel art. Le head-swap est la technique classique pour régler ça — et en
réutilisant les fichiers .air / .cmd / .cns de KFM, le personnage hérite de
TOUT son moveset réel (frame data, coups spéciaux, supers).

Méthode :
  1. décodage des 281 sprites de KFM (SFF v2 / LZ5)
  2. localisation de la tête dans chaque pose via ses couleurs propres
     (cheveux, bandeau, peau du visage) — robuste quelle que soit la pose
  3. composition d'une tête de coq pixellisée, mise à l'échelle de la boîte
  4. écriture d'un SFF v1 et copie des fichiers de logique de KFM

Usage :  python3 tools/build-rooster-head.py
"""
import os, sys, shutil, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sff import read_sff, write_sff_v1
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, 'chars', 'kfm')
OUT  = os.path.join(ROOT, 'chars', 'coqfu')
# Tête dessinée nativement en pixel art (voir tools/draw-rooster-head.py) :
# alpha strictement 0 ou 255, donc aucun liseré une fois indexée.
HEAD_IMG = os.path.join(ROOT, 'assets', 'rooster-head-pixel.png')

# Attention : l'index 31 (49,49,49) est la couleur de CONTOUR de tout le
# personnage, pas seulement des cheveux — il ne peut donc pas servir de
# repère. La détection est donc géométrique : la tête occupe le haut du
# sprite. Le bandeau (index 22) affine le centrage quand il est visible.
HEADBAND = {22, 23}           # bleus du bandeau (aussi présents aux chaussures)
FACE     = {26, 27, 28, 29}   # tons de peau du visage
HEAD_FRACTION = 0.30          # part haute du personnage occupée par la tête

def head_box(idx, w, h):
    """Boîte de la tête : partie haute de la silhouette, recentrée si possible."""
    # 1) silhouette réelle
    pts_y = [y for y in range(h) for x in range(w) if idx[y*w+x]]
    if not pts_y: return None
    y0s, y1s = min(pts_y), max(pts_y)
    height = y1s - y0s + 1
    band = y0s + max(6, int(height * HEAD_FRACTION))

    # 2) extension horizontale dans cette bande haute
    xs = [x for y in range(y0s, min(h, band+1)) for x in range(w) if idx[y*w+x]]
    if not xs: return None
    x0, x1 = min(xs), max(xs)

    # 3) affinage : si le bandeau est visible dans la bande, il donne le
    #    centre exact de la tête (utile quand un bras passe au-dessus).
    bx = [x for y in range(y0s, min(h, band+1)) for x in range(w)
          if idx[y*w+x] in HEADBAND]
    if len(bx) >= 8:
        bx0, bx1 = min(bx), max(bx)
        if (bx1 - bx0) >= 4:
            pad = max(2, (bx1-bx0)//3)
            x0, x1 = max(x0, bx0-pad), min(x1, bx1+pad)
    return x0, y0s, x1, band

def build_palette(kfm_pal, head_rgb_colors):
    """Palette finale : celle de KFM + les couleurs du coq dans les emplacements libres."""
    pal = bytearray(kfm_pal[:768])
    # emplacements réellement utilisés par KFM
    used = set()
    for i in range(256):
        c = tuple(pal[i*3:i*3+3])
        used.add(i)
    # on écrase la fin de palette (rarement utilisée par KFM) avec le coq
    start = 256 - len(head_rgb_colors)
    mapping = {}
    for k, rgb in enumerate(head_rgb_colors):
        slot = start + k
        pal[slot*3:slot*3+3] = bytes(rgb)
        mapping[k] = slot
    return bytes(pal), mapping, start

def main():
    if not os.path.isdir(SRC):
        raise SystemExit('chars/kfm introuvable')
    os.makedirs(OUT, exist_ok=True)

    sprites, pals = read_sff(os.path.join(SRC, 'kfm.sff'))
    kfm_pal = pals[0]
    print(f'{len(sprites)} sprites de KFM décodés')

    # Tête de coq : quantifiée sur peu de couleurs pour tenir dans la palette.
    head = Image.open(HEAD_IMG).convert('RGBA')
    head = head.crop(head.getbbox())
    # Nettoyage des bords : l'image d'origine a un halo semi-transparent qui,
    # une fois quantifié sur une palette indexée (sans canal alpha), donne
    # des pixels sales autour de la tête. On binarise donc l'alpha et on
    # érode d'un pixel pour supprimer le liseré.
    a = head.split()[3].point(lambda v: 255 if v >= 170 else 0)
    a = a.filter(ImageFilter.MinFilter(3))
    head.putalpha(a)
    head = head.crop(head.getbbox())
    NCOL = 16
    rgbq = head.convert('RGB').quantize(colors=NCOL, method=Image.MEDIANCUT)
    qpal = rgbq.getpalette()[:NCOL*3]
    head_colors = [tuple(qpal[i*3:i*3+3]) for i in range(NCOL)]

    palette, mapping, slot0 = build_palette(kfm_pal, head_colors)

    swapped = 0
    out_sprites = []
    for s in sprites:
        w, h, idx = s['w'], s['h'], bytearray(s['idx'])
        box = head_box(idx, w, h)
        if box:
            x0, y0, x1, y1 = box
            bw, bh = x1-x0+1, y1-y0+1
            # Tête dimensionnée sur la bande détectée, en conservant les
            # proportions du dessin d'origine.
            th = max(6, int(bh * 1.08))
            tw = max(6, int(th * head.width / head.height))
            hq = rgbq.resize((tw, th), Image.NEAREST)
            ha = head.resize((tw, th), Image.NEAREST).split()[3]
            hp, ap = hq.load(), ha.load()
            # centrée horizontalement sur la bande, posée un peu au-dessus
            ox = x0 + (bw - tw)//2
            oy = y0 - int(th * 0.18)
            # On efface uniquement la peau du visage : le contour (index 31)
            # est partagé avec le reste du corps et doit être préservé.
            for y in range(y0, min(h, y1+1)):
                row = y*w
                for x in range(max(0,x0), min(w, x1+1)):
                    if idx[row+x] in FACE:
                        idx[row+x] = 0
            # dessine la tête de coq
            for ty in range(th):
                y = oy + ty
                if not (0 <= y < h): continue
                row = y*w
                for tx in range(tw):
                    x = ox + tx
                    if not (0 <= x < w): continue
                    if ap[tx, ty] < 200: continue
                    idx[row+x] = slot0 + hp[tx, ty]
            swapped += 1
        out_sprites.append(dict(group=s['group'], image=s['image'],
                                w=w, h=h, x=s['x'], y=s['y'], idx=bytes(idx)))

    write_sff_v1(os.path.join(OUT, 'coqfu.sff'), out_sprites, palette)

    # Logique de combat : on reprend telle quelle celle de KFM.
    for ext in ('air', 'cmd', 'cns'):
        shutil.copyfile(os.path.join(SRC, f'kfm.{ext}'), os.path.join(OUT, f'coqfu.{ext}'))
    open(os.path.join(OUT, 'coqfu.def'), 'w', encoding='utf-8').write(
        '; Coq Fu Man — corps de Kung Fu Man (Elecbyte, CC BY-NC), tête de coq\n'
        '[Info]\n'
        'name = "CoqFuMan"\n'
        'displayname = "Coq Fu Man"\n'
        'versiondate = 1.0\n'
        'mugenversion = 1.0\n'
        'author = "ChickenFight"\n\n'
        '[Files]\n'
        'cmd = coqfu.cmd\n'
        'cns = coqfu.cns\n'
        'sprite = coqfu.sff\n'
        'anim = coqfu.air\n'
    )
    size = os.path.getsize(os.path.join(OUT, 'coqfu.sff'))
    print(f'tête greffée sur {swapped}/{len(sprites)} sprites')
    print(f'écrit dans chars/coqfu/ — coqfu.sff = {size//1024} Ko')

if __name__ == '__main__':
    main()
