/* ══════════════════════════════════════════════════════════════
   ChickenStreet — mode « La Street » (beat'em up)
   ---------------------------------------------------------------
   Règles du mode, séparées du moteur de combat pour rester lisibles :

     • on progresse dans une ville sombre, vague après vague ;
     • le coq est bien plus résistant que les adversaires, qui tombent
       en quelques coups ;
     • 1 vie pour les non-holders, 10 vies pour les holders ;
     • les ennemis abattus restent au sol, allongés dans une mare de sang ;
     • on ramasse parfois une arme à munitions limitées :
         pistolet (le combo ultime), épée, ou réserve d'œufs.

   Ce fichier décrit les DONNÉES et les règles ; le moteur
   (fighter-engine.js) s'en sert pour piloter le combat.
   ══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  // ── Armes ramassables ──────────────────────────────────────────
  // `ammo` : nombre d'utilisations. `reach` : portée en unités monde.
  const WEAPONS = {
    pistol: {
      id:'pistol', name:'PISTOLET', icon:'🔫', ammo:6,
      dmg:60, projectile:true, speed:13, cooldown:16,
      desc:'Abat presque n\'importe qui d\'une balle'
    },
    sword: {
      id:'sword', name:'ÉPÉE', icon:'⚔️', ammo:14,
      dmg:34, reach:96, cooldown:22,
      desc:'Longue portée, tranche en un coup ou deux'
    },
    eggs: {
      id:'eggs', name:'ŒUFS', icon:'🥚', ammo:10,
      dmg:26, projectile:true, speed:8, cooldown:20, explodes:true,
      desc:'Explose à l\'impact, touche large'
    }
  };

  // Table de butin : ce qui peut tomber d'un ennemi vaincu.
  const DROPS = [
    { w:null,     chance:0.55 },   // rien, le plus souvent
    { w:'eggs',   chance:0.22 },
    { w:'sword',  chance:0.15 },
    { w:'pistol', chance:0.08 }    // le plus rare : c'est le combo ultime
  ];

  function rollDrop(){
    let r = Math.random();
    for(const d of DROPS){
      if(r < d.chance) return d.w;
      r -= d.chance;
    }
    return null;
  }

  // ── Vagues d'ennemis ───────────────────────────────────────────
  // On croise aussi bien les Kung Fu que les coqs, comme demandé.
  const POOL = [
    { id:'kfm', pal:0 }, { id:'kfm', pal:3 }, { id:'kfm', pal:6 },
    { id:'kfm', pal:9 }, { id:'kfm', pal:2, skin:'ninja' },
    { id:'kfm', pal:12 }, { id:'kfm', pal:4 },
    { id:'valetMugen' }, { id:'reineMugen' }, { id:'roiMugen' }
  ];

  /**
   * Un adversaire, tiré au sort, calibré sur le palier courant.
   *
   * `defense` est la clé de la difficulté ici. Les dégâts d'un coup MUGEN sont
   * proportionnels aux PV max de la cible (23/1000 pour un direct), donc
   * baisser les PV ne change RIEN au nombre de coups nécessaires. C'est en
   * divisant la défense qu'on obtient ce qui est demandé : deux poings suffisent.
   */
  function pick(tier){
    // Un colosse de temps en temps : deux fois plus grand, bien plus coriace,
    // et il frappe fort. De quoi casser le rythme de la rue.
    if(tier >= 2 && Math.random() < 0.11){
      const g = GIANTS[Math.floor(Math.random() * GIANTS.length)];
      return {
        ...g,
        hp:      120 + tier * 20,
        defense: Math.min(0.42, 0.26 + tier * 0.02),   // ~6 à 8 coups
        power:   1.5 + tier * 0.06,
        ai:      Math.min(0.8, 0.34 + tier * 0.05),
        giant:   true
      };
    }
    const e = POOL[Math.floor(Math.random() * POOL.length)];
    return {
      ...e,
      hp:      34 + tier * 5,
      defense: Math.min(0.085, 0.05 + tier * 0.004),  // ~2 directs, 1 gros coup
      power:   0.85 + tier * 0.05,
      ai:      Math.min(0.85, 0.28 + tier * 0.06)
    };
  }

  // Colosses : mêmes personnages, mais dessinés bien plus grands.
  const GIANTS = [
    { id:'kfm',        pal:2, skin:'ninja', scale:2.0, name:'NINJA GÉANT' },
    { id:'reineMugen',              scale:2.0, name:'REINE GÉANTE' }
  ];

  /** Palier de difficulté : il monte tous les six adversaires abattus. */
  const tierFor = killed => 1 + Math.floor(killed / 6);

  /** Combien d'adversaires au maximum en même temps à l'écran. */
  const maxAlive = tier => Math.min(4, 1 + Math.ceil(tier / 2));

  /**
   * Délai avant l'arrivée suivante, en frames.
   * Ils descendent la rue un par un — mais une fois sur trois le suivant
   * colle au précédent, histoire qu'on tombe parfois sur un petit groupe.
   */
  function nextDelay(tier){
    if(Math.random() < 0.34) return 18 + Math.random() * 24;   // presque collé
    const base = Math.max(55, 135 - tier * 10);
    return base + Math.random() * 60;
  }

  /**
   * Qui s'allonge en mourant ? Les Kung Fu ont un vrai sprite couché, bras le
   * long du corps : c'est propre. Les coqs n'en ont pas de convaincant — ils
   * clignotent et s'effacent sur place.
   */
  const liesDown = id => id === 'kfm' || id === 'kfm720' || id === 'coqfu';

  // ── Ambiances de rue ───────────────────────────────────────────
  // Toujours nocturne ; la météo change d'une vague à l'autre.
  const MOODS = [
    { weather:'clear',  moon:true,  desc:'Nuit claire' },
    { weather:'cloudy', moon:true,  desc:'Nuages et lune' },
    { weather:'rain',   moon:false, desc:'Pluie battante' },
    { weather:'storm',  moon:false, desc:'Orage' }
  ];
  const moodFor = n => MOODS[(n + Math.floor(Math.random()*2)) % MOODS.length];

  const STREET_DECOR = {
    sky:'#050813', sky2:'#0f172a', ground:'#1f2937', ground2:'#0b0f18',
    street:true, indoor:false
  };

  // ── Durée de vie d'un corps ────────────────────────────────────
  // Il reste visible, puis clignote de plus en plus vite en s'estompant.
  // Seule la mare de sang subsiste.
  const CORPSE_HOLD = 60;    // frames avant le clignotement
  const CORPSE_FADE = 70;    // frames de clignotement / disparition

  /** Opacité d'un corps à l'instant t, ou 0 s'il a fini de disparaître. */
  function corpseAlpha(t){
    if(t < CORPSE_HOLD) return 1;
    const k = (t - CORPSE_HOLD) / CORPSE_FADE;
    if(k >= 1) return 0;
    // clignotement qui s'accélère, sur une opacité qui décroît
    const blink = Math.sin(t * (0.35 + k * 0.55)) > -0.2 ? 1 : 0.15;
    return (1 - k) * blink;
  }

  window.ChickenStreet = {
    WEAPONS, DROPS, POOL, MOODS, STREET_DECOR,
    GIANTS,
    rollDrop, pick, tierFor, maxAlive, nextDelay, moodFor, liesDown, corpseAlpha,
    CORPSE_HOLD, CORPSE_FADE,
    /** Nombre de vies selon le statut du joueur. */
    livesFor: holder => holder ? 10 : 1
  };
})();
