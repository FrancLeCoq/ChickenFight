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
C = {
    '.': None,                 # transparent
    'k': (26, 20, 28),         # contour
    'B': (44, 78, 140),        # béret bleu
    'b': (32, 58, 108),        # béret ombre
    'H': (92, 132, 200),       # béret reflet
    'c': (198, 42, 46),        # crête / barbillon rouge
    'C': (232, 72, 66),        # rouge clair
    'd': (150, 26, 34),        # rouge ombre
    'f': (168, 96, 44),        # plumage tête
    'F': (206, 132, 62),       # plumage clair
    'g': (120, 64, 30),        # plumage ombre
    'y': (243, 186, 58),       # bec
    'Y': (255, 214, 104),      # bec clair
    'o': (188, 128, 24),       # bec ombre
    'w': (250, 250, 252),      # blanc de l'œil
    'e': (28, 24, 30),         # pupille
    'L': (58, 52, 62),         # monture des lunettes
    'v': (150, 200, 225),      # verre (opaque, pas de transparence)
}

# 34 colonnes x 34 lignes. Béret ENTIER, lunettes pleines, bec net.
ART = [
    "..........kkkkkkkkk...............",
    "........kkBBBBBBBBBkk.............",
    "......kkBBBHHHHHBBBBBkk...........",
    ".....kBBBBHHHHHHHBBBBBBk..........",
    "....kBBBBBHHHHHHHBBBBBBBk.........",
    "....kbBBBBBBBBBBBBBBBBBbk.........",
    "...kbbbBBBBBBBBBBBBBBBbbbk........",
    "...kkbbbbbbbbbbbbbbbbbbbkk........",
    "....kkkkkkkkkkkkkkkkkkkkk.........",
    "...kcCk.kffffffffffffffk..........",
    "..kcCCck kfFFFFFFFFFFFFfk.........",
    "..kcCCCkkfFFFFFFFFFFFFFFfk........",
    "...kdcckfFFFFFFFFFFFFFFFFk........",
    "....kkkkfFFFFFFFFFFFFFFFFk........",
    ".......kfFFFFFFFFFFFFFFFFfk.......",
    "......kLLLLLLLLLLLLLLLLLLLk.......",
    "......kLvvvvLkkkLvvvvvvvvLk.......",
    "......kLvwwwvLkkLvwwwwvvvLk.......",
    "......kLvweewvLkLvweewvvvLk.......",
    "......kLvweeevLkLvweeevvvLk.......",
    "......kLvvvvvvLkLvvvvvvvvLk.......",
    "......kLLLLLLLLkkLLLLLLLLLk.......",
    ".......kfFFFFFFFFFFFFFFFFfk.......",
    ".......kfFFFFFyyyyyyyyyyyyyk......",
    ".......kfFFFkyYYYYYYYYYYYYyk......",
    ".......kfFFkyYYYYYYYYYYYyok.......",
    ".......kfFkyyYYYYYYYYyyook........",
    ".......kfkkyyyyyyyyyook...........",
    "......kcCkkkkkkkkkkkk.............",
    "......kcCCCk......................",
    ".....kdcCCCck.....................",
    ".....kdcCCCck.....................",
    "......kddccdk.....................",
    ".......kkkkk......................",
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
