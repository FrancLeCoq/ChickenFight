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
