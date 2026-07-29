# 🐓 ChickenFight

Jeu de combat tactique mobile conçu pour l’univers **Francis Le Coq** et son mini-app Telegram.

## Modes de jeu

- **Entraînement** : gratuit pour tous, contre le Valet.
- **Campagne Royale** : réservée aux holders de `$FRANC`, avec le Valet, la Reine et le Roi.
- **Arène classée** : combats contre une IA évolutive et cote locale.
- **Duel local** : deux joueurs sur un même téléphone avec choix secrets.
- **Mon Coq** : niveau, XP, plumes, statistiques et trophées.

## Combat

Les actions sont résolues simultanément : coup de bec, garde, Cocorico, aile tranchante, esquive, feinte et attaque spéciale. Les techniques avancées sont réservées aux holders. Le vainqueur apparaît heureux et le perdant pleure.

### Mise en scène « Tekken du poulailler »

Le combat est animé façon jeu de baston pour rester vivant plutôt que statique :

- posture d'attente (idle) : les deux coqs respirent et se balancent en permanence, avec une ombre portée qui pulse ;
- chorégraphies distinctes par action : le coup de bec pique en avant, l'aile tranchante balaie avec une traînée, la feinte fait un faux pas, le Cocorico Fatal charge puis explose ;
- réactions à l'impact : recul (knockback), flash rouge, étincelle d'impact et bouffée de poussière au sol ;
- tremblement d'écran proportionnel aux dégâts (renforcé sur les spéciales et les K.O.) ;
- barres de vie d'arcade avec « dégât fantôme » qui traîne derrière la barre et pulsation rouge en dessous de 30 % de PV ;
- bannières animées « COMBAT ! » au lancement et « K.O. ! » à la chute d'un combattant ;
- scène animée : foule qui ondule et projecteurs qui pulsent.

Toutes ces animations sont désactivées automatiquement si l'utilisateur a activé `prefers-reduced-motion`.

## Vérification holder

La logique reprend celle des autres jeux Francis Le Coq :

- Telegram WebApp `initData`
- appel `POST` vers `https://mubqtnqulpyehkgubhnh.supabase.co/functions/v1/check-franc`
- cache local compatible avec `flc_holder`, `flc_balance`, `flc_reason` et `flc_walletLinked`
- redirection wallet : `https://franclecoq.github.io/Wallet/connect-wallet.html`

Les données de progression du jeu sont enregistrées localement sous `flc_fight_profile_v1`.

## Développement local

Le jeu est statique et ne nécessite pas de compilation.

```bash
python3 -m http.server 8080
```

Ouvrir ensuite `http://localhost:8080`.

Pour tester l’état holder hors Telegram, utiliser temporairement la console du navigateur :

```js
localStorage.setItem('flc_holder', 'true');
location.reload();
```

## Déploiement

Le workflow `.github/workflows/pages.yml` publie automatiquement la branche `main` sur GitHub Pages. Selon la configuration initiale du dépôt, il peut être nécessaire de choisir **GitHub Actions** dans **Settings → Pages → Build and deployment**.

## Limite connue

Le duel inclus dans cette version est un duel local à choix secrets sur un même appareil. Un PvP en ligne temps réel nécessitera un service serveur de matchmaking et de synchronisation des tours.

## Arène temps réel (BÊTA) — moteur façon Ikemen GO

En plus du combat tactique au tour par tour, le jeu embarque un **moteur de baston 2D temps réel** (`js/fighter-engine.js`, `window.ChickenArena`) qui absorbe les concepts d'Ikemen GO / MUGEN, réécrits pour le web :

- boucle temps réel à pas fixe (60 Hz), machine à états par combattant ;
- **frame data** par coup (startup / active / recovery), **hitbox** vs **hurtbox** ;
- déplacements, saut, accroupi, **garde**, **pushbox**, projectiles (œuf) ;
- **buffer d'inputs** et commande spéciale (→↓ + œuf), jauge de super ;
- rounds / timer / KO, IA adverse, HUD arcade ;
- rendu canvas avec les images existantes (rig 3 couches pour Francis).

Accessible depuis le menu (**Arène temps réel**). **Échelle d'évolution** : le coq absorbe l'adversaire vaincu et évolue **Valet ▸ Reine ▸ Roi** face à des IA de plus en plus fortes. Contrôles : manette tactile à l'écran + clavier (◀▶ déplacer, ▲ saut, ▼ garde/bas, J bec, L patte, K aile, Espace œuf).

### Mécaniques absorbées d'Ikemen GO

Ikemen GO (licence MIT) est un moteur **natif Go (CGO + SDL2 + OpenGL)** : il ne peut pas être exécuté dans un navigateur, donc dans une mini-app Telegram. Son **architecture** est en revanche reproduite ici en JavaScript.

**Système de commandes** (`js/command-system.js`) — reproduit la logique des fichiers `.CMD` :

| Commande | Saisie | Coup |
|---|---|---|
| QCF | ↓ ↘ → + coup | **Œuf explosif** (projectile) |
| DP | → ↓ ↘ + coup | **Coq ascendant** (anti-air, invincible au départ) |
| QCB | ↓ ↙ ← + patte | **Retourné tournoyant** |
| Charge | ← puis → + aile | **Charge d'aile** |
| SUPER | ↓↘→ ↓↘→ + coup | **COCORICO FATAL** (5 hits, jauge à 100) |

Notation numpad relative au sens du personnage, fenêtres de saisie, priorité des commandes complexes sur les boutons simples.

**Systèmes de combat** : compteur de **combos** avec **dégressivité des dégâts**, **juggle** (limite les combos aériens), **frames d'invincibilité**, **gel cinématique** au déclenchement du super, attaques **multi-hit**, garde avec chip damage.

**Chargeur de personnages** (`js/mugen-loader.js`) — lit les vrais formats Ikemen GO / MUGEN pour faire combattre de vrais personnages :

- `.DEF` (fiche INI), `.AIR` (animations), `.CMD` (commandes), `.CNS` (constantes) ;
- `.SFF` **v1** (palette + PCX RLE) et **v2** — tous les sous-formats courants : **RAW**, **RLE8**, **RLE5**, **LZ5** et **PNG à palette**.

Les PNG du format 10 portent des *index*, pas des couleurs : leur palette interne est souvent nulle et ce sont les palettes du SFF qui font foi. Le chargeur décode donc ces PNG lui-même (inflate + dé-filtrage des lignes) pour récupérer les index avant d'appliquer la bonne palette — sans quoi le personnage s'affiche entièrement noir.

```js
const perso = await ChickenMugen.loadCharacter('chars/kfm/kfm.def');
perso.anims[200];      // animation de marche
perso.sprite(0, 0);    // sprite (groupe, image)
```

Un jeu de fixtures au format réel se trouve dans `testchar/` pour valider les parseurs.

**Personnage Ikemen GO chargé et vérifié** : `chars/kfm/` contient **Kung Fu Man** (Elecbyte), récupéré depuis le dépôt [Ikemen-GO-Screenpack](https://github.com/ikemen-engine/Ikemen-GO-Screenpack). Le chargeur en extrait **281 sprites** (dont 280 compressés en **LZ5**), **117 animations** et **36 commandes** en ~200 ms, rendus au pixel près.

Les décompresseurs **LZ5 / RLE8 / RLE5** sont portés fidèlement depuis la source d'Ikemen GO (`src/image.go`, licence MIT).

### Coq Fu Man — le combattant principal

Le coq illustré jurait visuellement avec les personnages MUGEN en pixel art. `tools/build-rooster-head.py` règle le problème par un **head-swap**, la technique classique du milieu :

- décodage des 281 sprites de Kung Fu Man ;
- localisation de la tête dans chaque pose (détection géométrique affinée par le bandeau — attention, la couleur sombre du personnage est un **contour** partagé par tout le corps, pas un repère de tête) ;
- greffe d'une tête de coq pixellisée, mise à l'échelle de la boîte détectée ;
- réutilisation des `.air` / `.cmd` / `.cns` de KFM : le personnage hérite ainsi de **tout son moveset réel** (frame data, spéciaux, supers).

```bash
python3 tools/build-rooster-head.py     # régénère chars/coqfu/
```

C'est lui que l'on incarne dans le mode **COMBAT**, et il monte en grade (Coq ▸ Valet ▸ Reine ▸ Roi) au fil des paliers.

### Hitbox réelles (Clsn)

Les boîtes de collision sont désormais lues dans les fichiers `.AIR` : `Clsn1` (attaque) et `Clsn2` (corps), y compris les blocs `Default` valables pour toute l'animation. Sur Kung Fu Man, **604 frames sur 655** portent leurs hurtboxes réelles et 63 leurs hitboxes. Les coordonnées MUGEN (relatives à l'axe, Y négatif vers le haut) sont converties et miroitées selon l'orientation du combattant. À défaut de boîtes, le moteur retombe sur une portée approchée.

### Interpréteur CNS — les personnages utilisent leurs VRAIS coups

`js/cns-interpreter.js` exécute les fichiers `.CNS`, c'est-à-dire la logique de combat des personnages :

- **parseur d'états** : `[Statedef N]` + attributs, `[State]` + contrôleurs ;
- **évaluateur de déclencheurs** avec la sémantique MUGEN exacte (`triggerall` en ET, `trigger1/2/…` en OU), comparaisons, `&&`/`||`, parenthèses, littéraux d'état (`StateType = S`) ;
- **déclencheurs** : `Time`, `AnimTime`, `AnimElem`, `Anim`, `StateNo`, `Command`, `Ctrl`, `Life`, `Power`, `MoveContact/Hit/Guarded`, `Vel`/`Pos`, `P2BodyDist`, `Var`… ;
- **contrôleurs** : `ChangeState`, `ChangeAnim`, `VelSet/Add/Mul`, `PosSet/Add`, `CtrlSet`, `HitDef`, `Projectile`, `PowerAdd`, `StateTypeSet`, `VarSet`, `Turn`… — **99 % des contrôleurs de KFM** sont couverts, le reste est ignoré sans bloquer l'exécution.

Le `HitDef` du personnage pilote dégâts, hitstun, projection et hitstop, avec mise à l'échelle de la vie MUGEN (1000) vers celle du jeu. Vérifié sur le vrai KFM : son état 200 produit `anim=200`, `ctrl=0`, `power+=10` puis un HitDef de **23 dégâts / hitTime 11** ; son état 1000 (Kung Fu Palm) un HitDef de **85 dégâts / hitTime 17 / projection −7**.

La locomotion (marche, saut, garde) reste gérée par le moteur : ces états communs vivent normalement dans le `common1.cns` du moteur, pas dans le fichier du personnage.

### Le coq est lui aussi un personnage MUGEN

`tools/build-rooster-mugen.py` convertit Francis en **véritable personnage au format M.U.G.E.N / Ikemen GO**, généré depuis son rig 3 couches :

- **26 poses** composées par transformation du rig (bec qui pique, garde, coup d'aile, coup de patte, saut, K.O.) ;
- quantification sur une **palette 256 couleurs** (index 0 transparent), encodage **PCX RLE**, écriture d'un **SFF v1** authentique ;
- `francis.air` aux **numéros d'animation standard MUGEN** (0 attente, 20 marche, 200 poing, 5000 touché, 5110 au sol…), plus `.cmd`, `.cns` et `.def`.

```bash
python3 tools/build-rooster-mugen.py            # les 4 personnages
python3 tools/build-rooster-mugen.py valet roi  # ou une sélection
```

**Toute l'échelle d'évolution tourne au format MUGEN** : Francis, le Valet, la Reine et le Roi sont générés par ce script (26 poses chacun, ~420 Ko), et le boss final est le vrai Kung Fu Man. Les personnages sans rig (Valet, Reine, Roi) tirent leur expressivité de l'inclinaison, du déplacement et de l'écrasement.

Le personnage produit est relu par le chargeur du jeu (aller-retour vérifié) et suit **exactement le même pipeline** que Kung Fu Man — il est donc en principe utilisable dans le vrai Ikemen GO natif.

### Licences

Le projet est développé **sans exploitation commerciale** (les paris en $FRANC sont écartés pour le moment), ce qui est compatible avec les licences en présence :

- **moteur** Ikemen GO : MIT — les décompresseurs LZ5/RLE portés ici en découlent ;
- **assets Elecbyte** (Kung Fu Man) : Creative Commons 3.0 **Non-Commercial** — usage non commercial uniquement ;
- **Francis Le Coq** et ses évolutions : création propre au projet.

> ⚠️ Si le jeu devait être monétisé un jour (paris, achats), la clause « non commercial » des assets Elecbyte deviendrait bloquante : il faudrait une autorisation, des personnages libres de droits commerciaux, ou s'en tenir aux personnages maison. Chaque personnage MUGEN tiers a par ailleurs son propre auteur et ses propres conditions.

## Roadmap

- **Duel en ligne temps réel** : squelette prêt dans `js/netcode.js` (`window.ChickenNet`). Plan : lobby via Supabase Realtime, P2P WebRTC pour la latence, netcode **rollback** (le moteur doit devenir déterministe — RNG à graine partagée). À finaliser.
- **Paris en Franc** : mise et gains adossés à `$FRANC`, avec la vérification holder existante (`check-franc`) comme base d'authentification wallet.
- **Bascule complète** : une fois l'arène temps réel validée, elle remplacera le combat au tour par tour comme mode principal.
