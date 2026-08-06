#!/usr/bin/env python3
"""
Dessine la tête de coq de Francis directement en PIXEL ART.

Pourquoi : réduire l'illustration d'origine (lisse, très détaillée) à ~40 px
et 24 couleurs donnait un rendu sale — bords baveux, béret tronqué, trous
dans les lunettes. Un dessin natif à la bonne résolution règle tout cela :
chaque pixel est posé volontairement, il n'y a aucune semi-transparence.

Produit assets/rooster-head-pixel.png (RGBA, alpha strictement 0 ou 255).

Usage :  python3 tools/draw-rooster-head.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT  = os.path.join(ROOT, 'assets', 'rooster-head-pixel.png')

# Palette — lisible et fidèle à Francis
# Palette calquée sur la référence : béret marine à cocarde, lunettes de
# soleil NOIRES et opaques, plumage orange, bec jaune ouvert.
C = {
    '.': None,                 # transparent
    'k': (24, 18, 26),         # contour
    'B': (38, 52, 92),         # béret marine
    'b': (26, 36, 68),         # béret ombre
    'H': (72, 92, 150),        # béret reflet
    'R': (206, 40, 46),        # cocarde rouge
    'W': (245, 245, 250),      # cocarde blanc
    'N': (30, 62, 150),        # cocarde bleu
    'c': (214, 40, 44),        # crête / barbillon
    'C': (248, 78, 72),        # rouge clair
    'd': (158, 22, 30),        # rouge ombre
    'f': (226, 126, 34),       # plumage orange
    'F': (250, 168, 66),       # plumage clair
    'g': (176, 84, 22),        # plumage ombre
    'y': (250, 186, 42),       # bec
    'Y': (255, 214, 96),       # bec clair
    'o': (198, 132, 18),       # bec ombre
    'm': (150, 30, 40),        # intérieur du bec
    'L': (18, 16, 20),         # monture des lunettes
    'v': (40, 38, 46),         # verre noir opaque
    'V': (86, 84, 96),         # reflet du verre
}

# 34 colonnes x 34 lignes. Béret ENTIER, lunettes pleines, bec net.
ART = [
    "...........kkkkkkkkkkk............",
    ".........kkBBBBBBBBBBBkk..........",
    ".......kkBBBBHHHHHHBBBBBkk........",
    "......kBBBBHHHHHHHHHBBBBBBk.......",
    ".....kBBBBHHHHHHHHHHHBBBBBBk......",
    ".....kBBRRRBBBBBBBBBBBBBBBBk......",
    ".....kBRWWWRBBBBBBBBBBBBBBBk..kck.",
    ".....kBRWNWRBBBBBBBBBBBBBBk..kcCk.",
    ".....kBBRWRBBBBBBBBBBBBBBk..kcCCk.",
    "....kbbBBRBBBBBBBBBBBBBbk..kcCCck.",
    "....kkbbbbbbbbbbbbbbbbbk..kcCCck..",
    ".....kkkkkkkkkkkkkkkkkk..kdcCck...",
    "......kgfffffffffffffffgk.kdcck...",
    ".....kgfFFFFFFFFFFFFFFFFgk.kkk....",
    ".....kfFFFFFFFFFFFFFFFFFFfk.......",
    "....kLLLLLLLLLLLLLLLLLLLLLLk......",
    "....kLvvvvvvLkkLvvvvvvvvvvLk......",
    "....kLvVvvvvLkkLvVvvvvvvvvLk......",
    "....kLvvvvvvLkkLvvvvvvvvvvLk......",
    "....kLLLLLLLLkkLLLLLLLLLLLLk......",
    ".....kfFFFFFFFFFFFFFFFFFFfk.......",
    ".....kfFFFFFFFyyyyyyyyyyyyyyk.....",
    ".....kgfFFFFkyYYYYYYYYYYYYYYyk....",
    "......kgfFFkyYYYYYYYYYYYYYyok.....",
    "......kgfFkyymmmmmmmmmmyyook......",
    "......kgfkyyYYYYYYYYYYyook........",
    ".....kcCkkyyyyyyyyyyook...........",
    ".....kcCCkkkkkkkkkkkk.............",
    "....kdcCCCk.......................",
    "....kdcCCCck......................",
    "....kdcCCCck......................",
    ".....kdcCCck......................",
    ".....kddccdk......................",
    "......kkkkk.......................",
]

def main():
    h = len(ART); w = max(len(r) for r in ART)
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(ART):
        for x, ch in enumerate(row):
            col = C.get(ch)
            if col is None:
                continue                      # alpha 0, franc
            px[x, y] = (col[0], col[1], col[2], 255)   # alpha 255, franc
    img.save(OUT)
    opaque = sum(1 for y in range(h) for x in range(w) if px[x, y][3] == 255)
    print(f'écrit {OUT} — {w}x{h}, {opaque} pixels opaques, aucune semi-transparence')

if __name__ == '__main__':
    main()
