#!/usr/bin/env python3
"""
Calcule, pour chaque sprite de Kung Fu Man, l'endroit où poser la tête de coq.

Pourquoi : greffer la tête DANS le fichier .sff obligeait à la quantifier sur
une palette indexée de 256 couleurs, à très petite taille — d'où un rendu sale.
On préfère donc garder le corps tel quel et dessiner l'illustration d'origine
PAR-DESSUS au moment du rendu, en pleine qualité et en vraies couleurs.

Ce script ne produit donc que des coordonnées : chars/coqfu/head-anchors.json
    { "0,0": { "x": 23, "y": 4, "w": 30 }, ... }
  x, y = coin haut-gauche de la tête, en pixels du sprite
  w    = largeur souhaitée (la hauteur suit le ratio de l'image)

Usage :  python3 tools/build-head-anchors.py
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sff import read_sff

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, 'chars', 'kfm', 'kfm.sff')
OUT  = os.path.join(ROOT, 'chars', 'coqfu', 'head-anchors.json')

HEADBAND = {22, 23}     # bleus du bandeau : bon repère de centrage
HEAD_FRACTION = 0.30    # part haute de la silhouette occupée par la tête
HEAD_SCALE = 1.65       # la tête de coq déborde volontairement du crâne

def head_box(idx, w, h):
    """Bande haute de la silhouette, recentrée sur le bandeau si visible."""
    ys = [y for y in range(h) for x in range(w) if idx[y*w+x]]
    if not ys:
        return None
    y0, y1 = min(ys), max(ys)
    band = y0 + max(6, int((y1 - y0 + 1) * HEAD_FRACTION))

    xs = [x for y in range(y0, min(h, band+1)) for x in range(w) if idx[y*w+x]]
    if not xs:
        return None
    x0, x1 = min(xs), max(xs)

    bx = [x for y in range(y0, min(h, band+1)) for x in range(w)
          if idx[y*w+x] in HEADBAND]
    if len(bx) >= 8 and (max(bx) - min(bx)) >= 4:
        pad = max(2, (max(bx) - min(bx)) // 3)
        x0, x1 = max(x0, min(bx) - pad), min(x1, max(bx) + pad)
    return x0, y0, x1, band

def main():
    sprites, _ = read_sff(SRC)
    anchors = {}
    for s in sprites:
        box = head_box(s['idx'], s['w'], s['h'])
        if not box:
            continue
        x0, y0, x1, y1 = box
        bw = x1 - x0 + 1
        tw = max(8, int(bw * HEAD_SCALE))
        anchors[f"{s['group']},{s['image']}"] = {
            'x': x0 + (bw - tw) // 2,
            'y': y0 - int((y1 - y0 + 1) * 0.30),
            'w': tw
        }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(anchors, open(OUT, 'w'), separators=(',', ':'))
    print(f'{len(anchors)} ancrages écrits dans {OUT}')

if __name__ == '__main__':
    main()
