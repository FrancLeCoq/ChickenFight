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
- `.SFF` v1 (palette + PCX RLE) et v2 (sous-formats RAW et PNG). Les sprites SFF v2 compressés en RLE8/RLE5/LZ5 ne sont pas encore décodés et sont ignorés sans bloquer le chargement.

```js
const perso = await ChickenMugen.loadCharacter('chars/kfm/kfm.def');
perso.anims[200];      // animation de marche
perso.sprite(0, 0);    // sprite (groupe, image)
```

Un jeu de fixtures au format réel se trouve dans `testchar/` pour valider les parseurs.

**Personnage Ikemen GO chargé et vérifié** : `chars/kfm/` contient **Kung Fu Man** (Elecbyte), récupéré depuis le dépôt [Ikemen-GO-Screenpack](https://github.com/ikemen-engine/Ikemen-GO-Screenpack). Le chargeur en extrait **281 sprites** (dont 280 compressés en **LZ5**), **117 animations** et **36 commandes** en ~200 ms, rendus au pixel près.

Les décompresseurs **LZ5 / RLE8 / RLE5** sont portés fidèlement depuis la source d'Ikemen GO (`src/image.go`, licence MIT).

### Le coq est lui aussi un personnage MUGEN

`tools/build-rooster-mugen.py` convertit Francis en **véritable personnage au format M.U.G.E.N / Ikemen GO**, généré depuis son rig 3 couches :

- **26 poses** composées par transformation du rig (bec qui pique, garde, coup d'aile, coup de patte, saut, K.O.) ;
- quantification sur une **palette 256 couleurs** (index 0 transparent), encodage **PCX RLE**, écriture d'un **SFF v1** authentique ;
- `francis.air` aux **numéros d'animation standard MUGEN** (0 attente, 20 marche, 200 poing, 5000 touché, 5110 au sol…), plus `.cmd`, `.cns` et `.def`.

```bash
python3 tools/build-rooster-mugen.py     # régénère chars/francis/
```

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
