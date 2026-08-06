#!/usr/bin/env python3
"""
Calcule, pour chaque sprite de Kung Fu Man, où poser la tête de coq.

Pourquoi : greffer la tête DANS le fichier .sff obligeait à la quantifier sur
une palette indexée de 256 couleurs, à très petite taille — d'où un rendu sale.
On garde donc le corps tel quel et on dessine l'illustration PAR-DESSUS au
moment du rendu, en pleine qualité. Mais poser simplement l'image sur le
sprite laissait dépasser la tête d'origine : il faut aussi effacer celle-ci.
Ce fichier fournit donc une BOÎTE — le moteur y efface le crâne de KFM, puis
y dessine l'illustration. Zone effacée et zone dessinée étant les mêmes, il
est impossible de voir deux têtes superposées.

Repère : le bandeau bleu (indices 22-24) ceint le front sur presque toutes les
images. Sa rangée la plus fournie donne le centre et la hauteur du front ; la
boîte a ensuite une taille FIXE (même tête à chaque image, elle ne fait que
suivre le corps — c'est le rendu demandé) et se place autour de ce repère.

Sortie : chars/coqfu/head-anchors.json
    { "0,0": { "x": 4, "y": 0, "w": 27, "h": 31 }, ... }

Usage :  python3 tools/build-head-anchors.py
"""
import os, sys, json, statistics
from collections import deque
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sff import read_sff

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, 'chars', 'kfm', 'kfm.sff')
HEAD = os.path.join(ROOT, 'assets', 'francis-head-fight.webp')
OUT  = os.path.join(ROOT, 'chars', 'coqfu', 'head-anchors.json')

BAND = {22, 23, 24}          # bandeau bleu
SKIN = {25, 26, 27, 28, 29}  # peau

WIDTH_FACTOR = 2.45   # largeur de la tête de coq ÷ largeur du bandeau
FOREHEAD_Y   = 0.46   # hauteur du front dans l'illustration (0 = sommet)


def _band_cluster(idx, w, h):
    """Amas de bleu le plus haut : le bandeau. (Le pantalon aussi est bleu,
    d'où la sélection par hauteur et non par taille.)"""
    seen = bytearray(w * h)
    best = None
    for i, v in enumerate(idx):
        if v not in BAND or seen[i]:
            continue
        comp, q = [], deque([i])
        seen[i] = 1
        while q:
            j = q.popleft()
            comp.append(j)
            x, y = j % w, j // w
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    k = ny * w + nx
                    if not seen[k] and idx[k] in BAND:
                        seen[k] = 1
                        q.append(k)
        if len(comp) >= 6 and (best is None or min(comp) < min(best)):
            best = comp
    return best or []


def forehead(idx, w, h):
    """(centre x, ligne y, largeur) du front, ou None."""
    comp = _band_cluster(idx, w, h)
    if comp:
        rows = {}
        for i in comp:
            rows.setdefault(i // w, []).append(i % w)
        # rangée la plus fournie du bandeau = le tour du front
        y = max(rows, key=lambda k: len(rows[k]))
        xs = rows[y]
        return (min(xs) + max(xs)) / 2, y, max(xs) - min(xs) + 1
    # sans bandeau : plus haute tache de peau
    for y in range(h):
        xs = [x for x in range(w) if idx[y * w + x] in SKIN]
        if len(xs) >= 4:
            return (min(xs) + max(xs)) / 2, y + 1, max(xs) - min(xs) + 1
    return None


def main():
    from PIL import Image
    im = Image.open(HEAD)
    ratio = im.height / im.width

    sprites, _ = read_sff(SRC)
    marks = {}
    for s in sprites:
        f = forehead(s['idx'], s['w'], s['h'])
        if f:
            marks[f"{s['group']},{s['image']}"] = f

    # une seule taille pour toutes les images : la tête ne doit pas « pulser »
    med = statistics.median(m[2] for m in marks.values())
    bw = max(8, round(med * WIDTH_FACTOR))
    bh = round(bw * ratio)

    anchors = {}
    for key, (cx, fy, _) in marks.items():
        anchors[key] = {
            'x': round(cx - bw / 2),
            'y': round(fy - bh * FOREHEAD_Y),
            'w': bw, 'h': bh
        }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(anchors, open(OUT, 'w'), separators=(',', ':'))
    print(f'{len(anchors)}/{len(sprites)} têtes placées, boîte {bw}x{bh} → {OUT}')


if __name__ == '__main__':
    main()
