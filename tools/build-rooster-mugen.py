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
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
OUT = os.path.join(ROOT, 'chars', 'francis')
CANVAS = (330, 330)          # large : les poses très inclinées doivent tenir
SCALE = 0.215                # réduction depuis les sources 721x900
                             # (donne ~155x193, à l'échelle d'un perso MUGEN)

# Personnages à générer : Francis est « riggé » (3 couches articulables),
# les autres n'ont qu'une image → les poses viennent de transformations.
CHARACTERS = {
    'francis': dict(rig=True, display='Francis Le Coq',
                    files=dict(tail='francis-tail.webp', body='francis-body.webp', head='francis-head.webp')),
    'valet':   dict(rig=False, display='Le Valet', files=dict(body='valet.webp')),
    'reine':   dict(rig=False, display='La Reine', files=dict(body='reine.webp')),
    'roi':     dict(rig=False, display='Le Roi',   files=dict(body='roi.webp')),
}

def load_parts(spec):
    parts = {}
    for name, fn in spec['files'].items():
        p = os.path.join(ASSETS, fn)
        if not os.path.exists(p):
            raise SystemExit(f'manque {p}')
        parts[name] = Image.open(p).convert('RGBA')
    if not spec['rig']:
        # Sans rig : la tête et la queue pointent sur le corps, les rotations
        # de partie n'ont alors aucun effet (seules les poses globales jouent).
        parts.setdefault('tail', Image.new('RGBA', parts['body'].size, (0,0,0,0)))
        parts.setdefault('head', Image.new('RGBA', parts['body'].size, (0,0,0,0)))
    return parts

def compose(parts, head_rot=0.0, head_dx=0, head_dy=0, tail_rot=0.0,
            body_rot=0.0, body_dx=0, body_dy=0, squash=1.0, stretch=1.0):
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

    # Pivot du corps : les pattes. C'est autour de lui qu'on fait tourner, et
    # c'est lui qu'on repose toujours au même endroit.
    piv = (src_w*0.5, src_h*0.92)

    if body_rot:
        # Une rotation sans marge recadre sur la boîte d'origine : au-delà
        # d'un quart de tour, le coq est tranché. On l'installe donc au
        # centre d'un carré assez grand pour qu'il tourne librement.
        r = int(math.hypot(max(piv[0], src_w - piv[0]),
                           max(piv[1], src_h - piv[1]))) + 4
        big = Image.new('RGBA', (2*r, 2*r), (0,0,0,0))
        big.alpha_composite(layer, (r - int(piv[0]), r - int(piv[1])))
        layer = big.rotate(math.degrees(body_rot), resample=Image.BICUBIC,
                           center=(r, r))
        piv = (r, r)

    # `stretch` élargit la silhouette : c'est ce qui distingue un coup d'aile
    # (le coq s'ouvre en largeur) d'un simple coup de bec (il se projette).
    sx, sy = SCALE*stretch, SCALE*squash
    lw, lh = layer.size
    layer = layer.resize((max(1, int(lw*sx)), max(1, int(lh*sy))), Image.LANCZOS)

    # Le pivot atterrit toujours au même point : la pose peut tourner autant
    # qu'elle veut, le coq reste posé au sol et centré.
    land_x = CANVAS[0]*0.5 + body_dx
    land_y = CANVAS[1] - (src_h - src_h*0.92)*sy + body_dy
    out = Image.new('RGBA', CANVAS, (0,0,0,0))
    out.alpha_composite(layer, (int(land_x - piv[0]*sx), int(land_y - piv[1]*sy)))
    return out

def build_poses(parts, rigged=True):
    """Poses aux numéros d'animation standard MUGEN.

    Sans rig, les rotations de tête/queue sont neutralisées et l'expressivité
    passe entièrement par l'inclinaison, le déplacement et l'écrasement.
    """
    if not rigged:
        return build_poses_simple(parts)
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
    # Les trois attaques doivent se reconnaître à la SILHOUETTE, pas seulement
    # à la distance parcourue — sinon tout ressemble à un coup de bec.
    # 200 — coup de bec : seule la tête part loin devant, le corps bouge peu
    P[(200,0)] = compose(parts, head_rot=-0.16, head_dx=10, body_dx=-4)
    P[(200,1)] = compose(parts, head_rot=-0.60, head_dx=52, head_dy=12, body_dx=10)
    P[(200,2)] = compose(parts, head_rot=-0.30, head_dx=24, body_dx=4)
    # 210 — coup d'aile : le coq s'ouvre en largeur et s'écrase, puis balaie
    P[(210,0)] = compose(parts, body_rot=-0.26, body_dx=-12, tail_rot=-0.42,
                         head_rot=-0.10, stretch=0.88, squash=1.05)
    P[(210,1)] = compose(parts, body_rot=0.30, body_dx=26, tail_rot=0.46,
                         head_rot=-0.36, stretch=1.32, squash=0.86)
    P[(210,2)] = compose(parts, body_rot=0.12, body_dx=10, tail_rot=0.18,
                         stretch=1.12, squash=0.95)
    # 230 — coup de patte : détente vers le bas puis extension haute et étirée
    P[(230,0)] = compose(parts, body_rot=-0.06, squash=0.84, stretch=1.08, body_dy=6)
    P[(230,1)] = compose(parts, body_rot=0.24, body_dx=30, body_dy=-18,
                         squash=1.18, stretch=0.90, tail_rot=0.34)
    P[(230,2)] = compose(parts, body_rot=0.10, body_dx=12, body_dy=-6, squash=1.05)
    # 5000 — touché
    P[(5000,0)] = compose(parts, body_rot=0.22, body_dx=-12, head_rot=0.36, tail_rot=0.30)
    # 5110 — au sol (K.O.)
    P[(5110,0)] = compose(parts, body_rot=1.25, body_dy=26, squash=0.9, head_rot=0.5)
    P.update(build_specials(parts))
    return P

def build_poses_simple(parts):
    """Poses pour un personnage sans rig : tout vient des transformations."""
    P = {}
    P[(0,0)] = compose(parts)
    P[(0,1)] = compose(parts, body_dy=-3, body_rot=-0.015)
    P[(0,2)] = compose(parts, body_dy=-6, squash=1.01)
    P[(0,3)] = compose(parts, body_dy=-2, body_rot=0.015)
    P[(11,0)] = compose(parts, squash=0.74)
    for i,(dx,dy) in enumerate([(0,0),(4,-5),(8,0),(4,-5)]):
        P[(20,i)] = compose(parts, body_dx=dx, body_dy=dy, body_rot=-0.05)
    for i,(dx,dy) in enumerate([(0,0),(-4,-5),(-8,0),(-4,-5)]):
        P[(21,i)] = compose(parts, body_dx=dx, body_dy=dy, body_rot=0.05)
    P[(41,0)] = compose(parts, body_rot=-0.12, squash=1.06)
    P[(43,0)] = compose(parts, body_rot=0.10, squash=0.96)
    P[(130,0)] = compose(parts, body_rot=0.12, squash=0.93)
    # Attaques : sans rig, c'est la déformation qui doit rendre chaque coup
    # reconnaissable — projection pour le bec, largeur pour l'aile, hauteur
    # pour la patte. Sinon les trois se ressemblent.
    P[(200,0)] = compose(parts, body_dx=4, body_rot=-0.05, squash=0.99)
    P[(200,1)] = compose(parts, body_dx=34, body_rot=0.16, stretch=1.10, squash=0.97)
    P[(200,2)] = compose(parts, body_dx=14, body_rot=0.07)
    P[(210,0)] = compose(parts, body_rot=-0.28, body_dx=-12, stretch=0.86, squash=1.06)
    P[(210,1)] = compose(parts, body_rot=0.32, body_dx=30, stretch=1.36, squash=0.84)
    P[(210,2)] = compose(parts, body_rot=0.12, body_dx=12, stretch=1.14, squash=0.94)
    P[(230,0)] = compose(parts, body_rot=-0.06, squash=0.82, stretch=1.10, body_dy=6)
    P[(230,1)] = compose(parts, body_rot=0.26, body_dx=32, body_dy=-20, squash=1.20, stretch=0.88)
    P[(230,2)] = compose(parts, body_rot=0.10, body_dx=14, body_dy=-6, squash=1.06)
    P[(5000,0)] = compose(parts, body_rot=0.26, body_dx=-16)
    P[(5110,0)] = compose(parts, body_rot=1.25, body_dy=26, squash=0.9)
    P.update(build_specials(parts))
    return P


def build_specials(parts):
    """Gestes spéciaux, communs aux coqs riggés ou non.

    Ils doivent se lire au premier coup d'œil : la pirouette tourne à ras du
    sol, le saut périlleux fait un tour complet en l'air, la charge s'allonge
    à l'horizontale comme un bélier.
    """
    P = {}
    # 430 — pirouette : le coq s'écrase et tourne au ras du sol
    P[(430,0)] = compose(parts, squash=0.72, stretch=1.16, body_rot=-0.30, body_dy=8)
    P[(430,1)] = compose(parts, squash=0.66, stretch=1.30, body_rot=-1.30, body_dy=10, body_dx=10)
    P[(430,2)] = compose(parts, squash=0.68, stretch=1.26, body_rot=-2.60, body_dy=8,  body_dx=20)
    P[(430,3)] = compose(parts, squash=0.74, stretch=1.14, body_rot=-4.00, body_dy=6,  body_dx=26)
    P[(430,4)] = compose(parts, squash=0.80, stretch=1.06, body_rot=-5.30, body_dy=2,  body_dx=18)
    # 440 — saut périlleux : tour complet, de plus en plus haut puis retombée
    P[(440,0)] = compose(parts, squash=0.80, stretch=1.10, body_rot=-0.25, body_dy=10)
    P[(440,1)] = compose(parts, squash=1.06, body_rot=-1.20, body_dy=-46, body_dx=14)
    P[(440,2)] = compose(parts, squash=1.02, body_rot=-2.50, body_dy=-72, body_dx=30)
    P[(440,3)] = compose(parts, squash=1.02, body_rot=-3.90, body_dy=-70, body_dx=46)
    P[(440,4)] = compose(parts, squash=1.04, body_rot=-5.10, body_dy=-42, body_dx=58)
    P[(440,5)] = compose(parts, squash=0.88, stretch=1.08, body_rot=-6.10, body_dy=-6, body_dx=64)
    # 450 — charge : le coq s'étire à l'horizontale, bec en avant
    P[(450,0)] = compose(parts, squash=0.86, stretch=1.10, body_rot=-0.24, body_dx=-14)
    P[(450,1)] = compose(parts, squash=0.74, stretch=1.42, body_rot=0.42, body_dx=30, body_dy=-6)
    P[(450,2)] = compose(parts, squash=0.70, stretch=1.52, body_rot=0.52, body_dx=52, body_dy=-4)
    P[(450,3)] = compose(parts, squash=0.84, stretch=1.22, body_rot=0.26, body_dx=26)
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
        # Le format indexé n'a pas de canal alpha : tout pixel semi-transparent
        # devient soit opaque, soit un trou. On binarise donc l'alpha pour
        # éviter les trous dans les lunettes et à la jonction du béret.
        a = im.split()[3].point(lambda v: 255 if v >= 96 else 0)
        im = im.copy(); im.putalpha(a)
        rgb = Image.new('RGB', im.size, (0,0,0))
        rgb.paste(im, mask=im.split()[3])
        idx = rgb.quantize(palette=ref, dither=Image.NONE)
        px = bytearray(idx.tobytes())
        alpha = im.split()[3].tobytes()
        for i, a in enumerate(alpha):
            if a < 96: px[i] = 0             # transparent
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
230,2, 0,0, 5

[Begin Action 430]    ; pirouette (bas + patte)
430,0, 0,0, 3
430,1, 0,0, 3
430,2, 0,0, 3
430,3, 0,0, 3
430,4, 0,0, 6

[Begin Action 440]    ; saut périlleux (haut + aile)
440,0, 0,0, 4
440,1, 0,0, 3
440,2, 0,0, 3
440,3, 0,0, 3
440,4, 0,0, 3
440,5, 0,0, 8

[Begin Action 450]    ; charge du coq (avant/arrière + bec)
450,0, 0,0, 4
450,1, 0,0, 3
450,2, 0,0, 5
450,3, 0,0, 8

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

def build_character(cid, spec):
    out = os.path.join(ROOT, 'chars', cid)
    os.makedirs(out, exist_ok=True)
    parts = load_parts(spec)
    poses = build_poses(parts, rigged=spec['rig'])
    poses = crop_poses(poses)
    sprites, palette = quantize_all(poses)
    write_sff(os.path.join(out, f'{cid}.sff'), sprites, palette)
    definition = DEF.replace('francis', cid).replace('Francis Le Coq', spec['display'])
    definition = definition.replace('name = "Francis"', f'name = "{spec["display"]}"')
    for fn, txt in ((f'{cid}.air', AIR), (f'{cid}.cmd', CMD),
                    (f'{cid}.cns', CNS), (f'{cid}.def', definition)):
        open(os.path.join(out, fn), 'w', encoding='utf-8').write(txt)
    size = os.path.getsize(os.path.join(out, f'{cid}.sff'))
    print(f'  {cid:8s} {len(poses):3d} poses  {size//1024:4d} Ko  → chars/{cid}/')

def main():
    import sys
    wanted = sys.argv[1:] or list(CHARACTERS)
    print('Génération des personnages au format MUGEN :')
    for cid in wanted:
        spec = CHARACTERS.get(cid)
        if not spec: print(f'  {cid} : inconnu, ignoré'); continue
        build_character(cid, spec)

if __name__ == '__main__':
    main()
