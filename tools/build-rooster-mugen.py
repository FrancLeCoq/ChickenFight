#!/usr/bin/env python3
"""
Génère un personnage au format M.U.G.E.N / Ikemen GO à partir des images
de Francis Le Coq (rig 3 couches : queue / corps / tête).

Produit dans chars/francis/ :
  francis.sff  — banque de sprites SFF v1 (PCX 8 bits + palette partagée)
  francis.air  — animations aux numéros standard MUGEN
  francis.cmd  — commandes (QCF, DP, QCB, super)
  francis.cns  — constantes (vie, vitesses)
  francis.def  — fiche du personnage

Les poses sont composées par transformation du rig (rotation de la tête,
inclinaison du corps, oscillation de la queue), puis quantifiées sur une
palette de 256 couleurs dont l'index 0 est transparent.

Usage :  python3 tools/build-rooster-mugen.py
"""
import os, struct, math
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
OUT = os.path.join(ROOT, 'chars', 'francis')
CANVAS = (170, 215)          # taille de travail des sprites
SCALE = 0.215                # réduction depuis les sources 721x900
                             # (donne ~155x193, à l'échelle d'un perso MUGEN)

def load_rig():
    parts = {}
    for name, fn in (('tail','francis-tail.webp'), ('body','francis-body.webp'), ('head','francis-head.webp')):
        p = os.path.join(ASSETS, fn)
        if not os.path.exists(p):
            raise SystemExit(f'manque {p} — lancer d\'abord la génération du rig')
        parts[name] = Image.open(p).convert('RGBA')
    return parts

def compose(parts, head_rot=0.0, head_dx=0, head_dy=0, tail_rot=0.0,
            body_rot=0.0, body_dx=0, body_dy=0, squash=1.0):
    """Compose une pose : queue derrière, corps, tête articulée."""
    src_w, src_h = parts['body'].size
    layer = Image.new('RGBA', (src_w, src_h), (0,0,0,0))

    tail = parts['tail']
    if tail_rot:
        tail = tail.rotate(math.degrees(tail_rot), resample=Image.BICUBIC,
                           center=(src_w*0.36, src_h*0.52))
    layer.alpha_composite(tail)
    layer.alpha_composite(parts['body'])

    head = parts['head']
    if head_rot:
        head = head.rotate(math.degrees(head_rot), resample=Image.BICUBIC,
                           center=(src_w*0.62, src_h*0.52))
    layer.alpha_composite(head, (int(head_dx), int(head_dy)))

    if body_rot:
        layer = layer.rotate(math.degrees(body_rot), resample=Image.BICUBIC,
                             center=(src_w*0.5, src_h*0.92))

    w = int(src_w*SCALE); h = int(src_h*SCALE*squash)
    layer = layer.resize((w, h), Image.LANCZOS)

    out = Image.new('RGBA', CANVAS, (0,0,0,0))
    ox = (CANVAS[0]-w)//2 + int(body_dx)
    oy = CANVAS[1]-h + int(body_dy)
    out.alpha_composite(layer, (ox, oy))
    return out

def build_poses(parts):
    """Poses aux numéros d'animation standard MUGEN."""
    P = {}
    # 0 — attente (respiration)
    P[(0,0)] = compose(parts)
    P[(0,1)] = compose(parts, head_rot=-0.04, body_dy=-3, tail_rot=0.10)
    P[(0,2)] = compose(parts, head_rot=-0.02, body_dy=-5, tail_rot=0.16)
    P[(0,3)] = compose(parts, head_rot=0.02, body_dy=-2, tail_rot=0.06)
    # 11 — accroupi
    P[(11,0)] = compose(parts, squash=0.74, head_rot=0.10, head_dy=18)
    # 20 — marche avant
    for i,(dx,dy,tr) in enumerate([(0,0,0.0),(3,-4,0.14),(6,0,0.0),(3,-4,-0.10)]):
        P[(20,i)] = compose(parts, body_dx=dx, body_dy=dy, tail_rot=tr, head_rot=-0.05)
    # 21 — marche arrière
    for i,(dx,dy,tr) in enumerate([(0,0,0.0),(-3,-4,-0.12),(-6,0,0.0),(-3,-4,0.10)]):
        P[(21,i)] = compose(parts, body_dx=dx, body_dy=dy, tail_rot=tr, head_rot=0.06)
    # 41 — saut
    P[(41,0)] = compose(parts, body_rot=-0.10, squash=1.05, tail_rot=-0.25, head_rot=-0.12)
    P[(43,0)] = compose(parts, body_rot=0.08, squash=0.97, tail_rot=0.22, head_rot=0.10)
    # 130 — garde
    P[(130,0)] = compose(parts, body_rot=0.10, squash=0.94, head_rot=0.16, tail_rot=-0.16)
    # 200 — coup de bec (poing léger)
    P[(200,0)] = compose(parts, head_rot=-0.16, head_dx=10)
    P[(200,1)] = compose(parts, head_rot=-0.52, head_dx=44, head_dy=10, body_dx=8)
    P[(200,2)] = compose(parts, head_rot=-0.30, head_dx=24, body_dx=4)
    # 210 — coup d'aile (poing fort)
    P[(210,0)] = compose(parts, body_rot=-0.12, tail_rot=-0.30, head_rot=-0.10)
    P[(210,1)] = compose(parts, body_rot=0.20, body_dx=16, tail_rot=0.34, head_rot=-0.34, squash=1.04)
    P[(210,2)] = compose(parts, body_rot=0.08, body_dx=6, tail_rot=0.14)
    # 230 — coup de patte
    P[(230,0)] = compose(parts, body_rot=-0.08, squash=0.95)
    P[(230,1)] = compose(parts, body_rot=0.16, body_dx=18, body_dy=-8, squash=1.02, tail_rot=0.26)
    # 5000 — touché
    P[(5000,0)] = compose(parts, body_rot=0.22, body_dx=-12, head_rot=0.36, tail_rot=0.30)
    # 5110 — au sol (K.O.)
    P[(5110,0)] = compose(parts, body_rot=1.25, body_dy=26, squash=0.9, head_rot=0.5)
    return P

def crop_poses(poses):
    """Recadre chaque pose sur sa silhouette et mémorise son axe (pieds).

    C'est la pratique MUGEN : le sprite est au plus juste, et l'axe indique
    où le poser au sol. Réduit énormément la taille du SFF.
    """
    out = {}
    ax_ref = (CANVAS[0]//2, CANVAS[1]-6)      # axe commun avant recadrage
    for key, im in poses.items():
        bbox = im.getbbox()
        if not bbox:
            out[key] = (im, ax_ref); continue
        cropped = im.crop(bbox)
        axis = (ax_ref[0]-bbox[0], ax_ref[1]-bbox[1])
        out[key] = (cropped, axis)
    return out

def quantize_all(poses):
    """Palette commune : index 0 = transparent, puis 255 couleurs."""
    mw = max(im.size[0] for im,_ in poses.values())
    mh = max(im.size[1] for im,_ in poses.values())
    montage = Image.new('RGB', (mw*len(poses), mh), (0,0,0))
    for i, (im,_) in enumerate(poses.values()):
        bg = Image.new('RGB', im.size, (0,0,0))
        bg.paste(im, mask=im.split()[3])
        montage.paste(bg, (mw*i, 0))
    pal_img = montage.quantize(colors=255, method=Image.MEDIANCUT)
    pal = pal_img.getpalette()[:255*3]
    palette = [(0,0,0)] + [tuple(pal[i*3:i*3+3]) for i in range(255)]

    flat = []
    for c in palette: flat.extend(c)
    ref = Image.new('P', (1,1)); ref.putpalette(flat + [0]*(768-len(flat)))

    out = {}
    for key, (im, axis) in poses.items():
        rgb = Image.new('RGB', im.size, (0,0,0))
        rgb.paste(im, mask=im.split()[3])
        idx = rgb.quantize(palette=ref, dither=Image.NONE)
        px = bytearray(idx.tobytes())
        alpha = im.split()[3].tobytes()
        for i, a in enumerate(alpha):
            if a < 128: px[i] = 0            # transparent
            elif px[i] == 0: px[i] = 1       # évite un faux transparent
        out[key] = (bytes(px), im.size, axis)
    return out, palette

def make_pcx(idx, w, h, palette):
    hdr = bytearray(128)
    hdr[0]=0x0A; hdr[1]=5; hdr[2]=1; hdr[3]=8
    struct.pack_into('<HHHH', hdr, 4, 0, 0, w-1, h-1)
    struct.pack_into('<HH', hdr, 12, 72, 72)
    hdr[65]=1
    struct.pack_into('<H', hdr, 66, w + (w & 1))
    bpl = w + (w & 1)
    body = bytearray()
    for y in range(h):
        row = bytearray(idx[y*w:(y+1)*w])
        if bpl > w: row.append(0)
        x = 0
        while x < len(row):
            run = 1
            while x+run < len(row) and row[x+run] == row[x] and run < 63: run += 1
            if run > 1 or row[x] >= 0xC0:
                body.append(0xC0 | run); body.append(row[x])
            else:
                body.append(row[x])
            x += run
    pal = bytearray()
    for c in palette: pal.extend(c)
    pal.extend(b'\x00' * (768 - len(pal)))
    return bytes(hdr) + bytes(body) + b'\x0C' + bytes(pal)

def write_sff(path, sprites, palette):
    """SFF v1 : en-tête 512 o puis chaîne de sous-en-têtes 32 o + PCX."""
    keys = list(sprites.keys())
    hdr = bytearray(512)
    hdr[0:12] = b'ElecbyteSpr\x00'
    struct.pack_into('<I', hdr, 12, 0)
    hdr[15] = 1
    groups = len({g for g,_ in keys})
    struct.pack_into('<I', hdr, 16, groups)
    struct.pack_into('<I', hdr, 20, len(keys))
    struct.pack_into('<I', hdr, 24, 512)
    struct.pack_into('<I', hdr, 28, 32)

    blobs = []
    for i, key in enumerate(keys):
        g, n = key
        px, (w, h), axis = sprites[key]
        pcx = make_pcx(px, w, h, palette)
        blobs.append((g, n, pcx, axis, i == 0))

    body = bytearray()
    offset = 512
    for i, (g, n, pcx, axis, first) in enumerate(blobs):
        sub = bytearray(32)
        nxt = 0 if i == len(blobs)-1 else offset + 32 + len(pcx)
        struct.pack_into('<I', sub, 0, nxt)
        struct.pack_into('<I', sub, 4, len(pcx))
        struct.pack_into('<hh', sub, 8, axis[0], axis[1])              # axe : pieds
        struct.pack_into('<HH', sub, 12, g, n)
        struct.pack_into('<H', sub, 16, 0)
        sub[18] = 0 if first else 1                                    # palette partagée
        body += sub + pcx
        offset = nxt if nxt else offset
    open(path, 'wb').write(bytes(hdr) + bytes(body))

AIR = """; Francis Le Coq — animations (numéros standard MUGEN)
[Begin Action 0]      ; attente
0,0, 0,0, 8
0,1, 0,0, 8
0,2, 0,0, 8
0,3, 0,0, 8

[Begin Action 11]     ; accroupi
11,0, 0,0, -1

[Begin Action 20]     ; marche avant
20,0, 0,0, 6
20,1, 0,0, 6
20,2, 0,0, 6
20,3, 0,0, 6

[Begin Action 21]     ; marche arrière
21,0, 0,0, 6
21,1, 0,0, 6
21,2, 0,0, 6
21,3, 0,0, 6

[Begin Action 41]     ; montée du saut
41,0, 0,0, -1

[Begin Action 43]     ; descente
43,0, 0,0, -1

[Begin Action 130]    ; garde
130,0, 0,0, -1

[Begin Action 200]    ; coup de bec
200,0, 0,0, 3
200,1, 0,0, 4
200,2, 0,0, 5

[Begin Action 210]    ; coup d'aile
210,0, 0,0, 5
210,1, 0,0, 5
210,2, 0,0, 8

[Begin Action 230]    ; coup de patte
230,0, 0,0, 4
230,1, 0,0, 6

[Begin Action 5000]   ; touché
5000,0, 0,0, -1

[Begin Action 5110]   ; au sol
5110,0, 0,0, -1
"""

CMD = """; Francis Le Coq — commandes
[Command]
name = "EggBomb"
command = ~D, DF, F, x
time = 15

[Command]
name = "RoosterUpper"
command = F, D, DF, x
time = 15

[Command]
name = "SpinKick"
command = ~D, DB, B, y
time = 15

[Command]
name = "FatalCocorico"
command = ~D, DF, F, D, DF, F, x
time = 30

[Command]
name = "peck"
command = x
time = 1

[Command]
name = "wing"
command = y
time = 1

[Command]
name = "talon"
command = a
time = 1
"""

CNS = """; Francis Le Coq — constantes
[Data]
life = 1000
attack = 100
defence = 100
power = 3000

[Size]
xscale = 1
yscale = 1
ground.back = 20
ground.front = 24
air.back = 20
air.front = 24
height = 76

[Velocity]
walk.fwd = 2.4
walk.back = -2.2
run.fwd = 4.6, 0
jump.neu = 0, -8.4
jump.back = -2.55
jump.fwd = 2.5

[Movement]
airjump.num = 1
yaccel = .44
stand.friction = .85
crouch.friction = .82
"""

DEF = """; Francis Le Coq — personnage ChickenFight
[Info]
name = "Francis"
displayname = "Francis Le Coq"
versiondate = 1.0
mugenversion = 1.0
author = "ChickenFight"
pal.defaults = 1

[Files]
cmd = francis.cmd
cns = francis.cns
sprite = francis.sff
anim = francis.air
"""

def main():
    os.makedirs(OUT, exist_ok=True)
    parts = load_rig()
    poses = build_poses(parts)
    print(f'{len(poses)} poses composées')
    poses = crop_poses(poses)
    sprites, palette = quantize_all(poses)
    write_sff(os.path.join(OUT, 'francis.sff'), sprites, palette)
    for fn, txt in (('francis.air', AIR), ('francis.cmd', CMD),
                    ('francis.cns', CNS), ('francis.def', DEF)):
        open(os.path.join(OUT, fn), 'w', encoding='utf-8').write(txt)
    size = os.path.getsize(os.path.join(OUT, 'francis.sff'))
    print(f'écrit dans {OUT} — francis.sff = {size} octets')

if __name__ == '__main__':
    main()
