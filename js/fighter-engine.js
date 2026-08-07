/* ══════════════════════════════════════════════════════════════
   ChickenArena — moteur de baston 2D temps réel (inspiré Ikemen GO)
   ---------------------------------------------------------------
   Concepts absorbés d'Ikemen GO / MUGEN, réécrits pour le web :
     • boucle temps réel à pas fixe (60 Hz)
     • machine à états par combattant (idle / marche / saut / accroupi
       / attaque / garde / hitstun / KO)
     • frame data par coup (startup / active / recovery)
     • hitbox (attaque) vs hurtbox (corps) → détection de touche
     • pushbox (les corps ne se traversent pas)
     • buffer d'inputs + commande spéciale (→↓↘ + coup = ŒUF)
     • projectiles, jauge de super, rounds / KO
   Rendu : canvas, sprites = tes images (rig 3 couches pour Francis).
   Exposé en global : window.ChickenArena.start(opts) / .stop()
   ══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const FPS = 60, DT = 1000 / FPS;
  const VW = 640, VH = 360;              // résolution logique (world)
  const GROUND = 322;                    // ligne de sol (y)
  const WALL = 40;                       // marge murs
  const GRAVITY = 0.9, JUMP_V = -14, WALK = 3.1, PUSH = 44;

  // ── Données de rendu par personnage (réutilise les assets existants) ──
  const RENDER = {
    francis: { rigged:true, srcW:721, srcH:900, scale:0.205,
      layers:{ tail:'assets/francis-tail.webp', body:'assets/francis-body.webp', head:'assets/francis-head.webp' },
      headPivot:{x:0.62,y:0.52}, tailPivot:{x:0.36,y:0.52} },
    valet: { rigged:false, srcW:690, srcH:900, scale:0.205, layers:{ body:'assets/valet.webp' } },
    reine: { rigged:false, srcW:606, srcH:900, scale:0.205, layers:{ body:'assets/reine.webp' } },
    roi:   { rigged:false, srcW:660, srcH:900, scale:0.215, layers:{ body:'assets/roi.webp' } },
    // Personnage au format Ikemen GO / MUGEN : sprites et animations chargés
    // depuis ses propres fichiers (.def/.sff/.air).
    kfm:    { mugen:true, def:'chars/kfm/kfm.def', scale:1.75 },
    // Coq Fu Man : corps pixel art de KFM, tête de coq. Hérite de tout son
    // moveset (mêmes .air/.cmd/.cns), donc cohérent visuellement ET mécaniquement.
    // Coq Fu Man : corps pixel art de KFM + tête de coq dessinée PAR-DESSUS
    // au rendu, en pleine qualité (pas de quantification dans le .sff).
    coqfu:  { mugen:true, def:'chars/coqfu/coqfu.def', scale:1.75,
              headOverlay:{ img:'assets/francis-head-fight.webp',
                            anchors:'chars/coqfu/head-anchors.json' } },
    kfm720: { mugen:true, def:'chars/kfm720/kfm720.def', scale:0.44 },
    // Le coq et ses évolutions, convertis au format MUGEN : ils passent
    // exactement par le même pipeline que les personnages Ikemen GO.
    francisMugen: { mugen:true, def:'chars/francis/francis.def', scale:0.95 },
    valetMugen:   { mugen:true, def:'chars/valet/valet.def',     scale:0.95 },
    reineMugen:   { mugen:true, def:'chars/reine/reine.def',     scale:0.95 },
    roiMugen:     { mugen:true, def:'chars/roi/roi.def',         scale:1.00 }
  };
  const mugenCache = {};   // clé (id#palette) → personnage chargé
  const mugenLive = {};    // id → personnage utilisé dans le combat courant

  // ── Frame data des coups (frames @60fps) ──
  // reach/box en unités monde, relatifs au combattant (devant = +x*facing).
  const MOVES = {
    peck:  { name:'peck',  startup:4,  active:3,  recovery:9,  dmg:6,  meter:8,
             hit:{x:34,y:-70,w:40,h:26}, kb:4.5, hitstun:14, blockstun:8, push:5 },
    wing:  { name:'wing',  startup:8,  active:4,  recovery:18, dmg:12, meter:6,
             hit:{x:30,y:-92,w:56,h:52}, kb:7,   hitstun:18, blockstun:11, push:7, launch:false },
    kick:  { name:'kick',  startup:6,  active:4,  recovery:14, dmg:9,  meter:7,
             hit:{x:36,y:-34,w:48,h:26}, kb:6,   hitstun:16, blockstun:10, push:6, low:true },
    egg:   { name:'egg',   startup:10, active:2,  recovery:24, dmg:0,  meter:0, projectile:true },
    // ── Gestes supplémentaires ──
    // SAUT COUP DE PIED : en l'air uniquement, frappe en diagonale.
    jumpkick: { name:'jumpkick', startup:5, active:8, recovery:12, dmg:14, meter:10,
                hit:{x:30,y:-64,w:58,h:46}, kb:8, hitstun:20, blockstun:12, push:8,
                juggle:2, label:'COUP DE PIED SAUTÉ !' },
    // UPPERCUT DU COQ : haut + bec, envoie l'adversaire en l'air.
    uppercut: { name:'uppercut', startup:5, active:6, recovery:22, dmg:17, meter:13,
                hit:{x:18,y:-146,w:52,h:116}, kb:5, hitstun:26, blockstun:14, push:6,
                launch:true, invuln:5, juggle:3, label:'UPPERCUT DU COQ !' },
    // PIROUETTE : bas + patte, balayage tournoyant qui fait chuter.
    pirouette: { name:'pirouette', startup:7, active:9, recovery:20, dmg:15, meter:12,
                hit:{x:26,y:-40,w:74,h:40}, kb:9, hitstun:24, blockstun:12, push:10,
                launch:true, juggle:2, low:true, label:'PIROUETTE !' },
    // ── Coups spéciaux (commandes directionnelles, façon Ikemen GO) ──
    // COQ ASCENDANT : anti-air, invincible au démarrage, envoie en l'air.
    dp:    { name:'dp',    startup:3,  active:8,  recovery:26, dmg:16, meter:12, special:true,
             hit:{x:16,y:-140,w:56,h:110}, kb:5, hitstun:26, blockstun:14, push:6,
             launch:true, invuln:8, juggle:3, cost:0, label:'COQ ASCENDANT !' },
    // RETOURNÉ TOURNOYANT : coup tournant qui traverse, bon en pression.
    qcb:   { name:'qcb',   startup:9,  active:6,  recovery:20, dmg:13, meter:11, special:true,
             hit:{x:24,y:-96,w:66,h:70}, kb:8, hitstun:20, blockstun:12, push:9,
             juggle:2, cost:0, label:'RETOURNÉ !' },
    // SUPER — COCORICO FATAL : multi-hit dévastateur, coûte 100 de jauge.
    super: { name:'super', startup:8,  active:16, recovery:34, dmg:9,  meter:0, special:true, super:true,
             hit:{x:20,y:-150,w:96,h:150}, kb:3, hitstun:12, blockstun:10, push:3,
             hits:5, invuln:14, juggle:9, cost:100, freeze:38, label:'COCORICO FATAL !' }
  };

  // ── État module ──
  let cv, ctx, raf = null, acc = 0, last = 0, freezeT = 0, gameFrame = 0;
  let fighters = [], projectiles = [], fx = [];
  let input = blankInput(), keyState = {};
  let round = { n:1, wins:[0,0], timer:99*FPS, state:'intro', stateT:0, best:2 };
  let opts = null, running = false, images = {};
  // ── Mode « La Street » : beat'em up à vagues ──
  let street = null;   // { wave, lives, corpses, pickups, killed, mood, banner }

  function blankInput(){ return { left:false,right:false,up:false,down:false,light:false,heavy:false,kick:false,special:false,super:false }; }

  // ── Chargement des images (avec cache) ──
  function loadImage(src){
    if(images[src]) return images[src];
    const im = new Image(); im.src = src; images[src] = im; return im;
  }
  function preload(ids){
    ids.forEach(id => { const r = RENDER[id]; if(r && r.layers) Object.values(r.layers).forEach(loadImage); });
  }

  /** Attache une machine d'états CNS au combattant si son perso en fournit. */
  function attachCns(f){
    const ch = f.mugen;
    if(!ch || !ch.states || !window.ChickenCns) return;
    if(!Object.keys(ch.states).length) return;
    f.cns = new window.ChickenCns.CnsRuntime(ch.states, makeCnsHost(f));
    f.cns.states = ch.states;
  }

  const headAnchors = {};   // id → { "group,image": {x,y,w} }
  /** Charge l'illustration de tête et ses points d'ancrage. */
  async function preloadHeadOverlay(ids){
    for(const id of ids){
      const ov = RENDER[id]?.headOverlay;
      if(!ov || headAnchors[id]) continue;
      loadImage(ov.img);
      try{ headAnchors[id] = await (await fetch(ov.anchors)).json(); }
      catch(e){ console.warn('[ChickenArena] ancrages de tête absents:', id); headAnchors[id] = {}; }
    }
  }

  /** Charge (une seule fois) les personnages au format MUGEN nécessaires. */
  async function preloadMugen(ids){
    for(const id of ids){
      const r = RENDER[id];
      if(!r || !r.mugen) continue;
      const pal = (id === opts?.enemyId) ? opts?.enemyPal : undefined;
      const skin = (id === opts?.enemyId) ? opts?.enemySkin : undefined;
      const key = `${id}#${pal ?? 'd'}#${skin ?? 'd'}`;
      if(mugenCache[key]){ mugenLive[id] = mugenCache[key]; continue; }
      try{
        mugenCache[key] = await window.ChickenMugen.loadCharacter(r.def, pal, skin);
        mugenLive[id] = mugenCache[key];
      }
      catch(e){ console.warn('[ChickenArena] perso MUGEN indisponible:', id, e.message); }
    }
  }

  // ── Fabrique un combattant ──
  function makeFighter(id, side, stats){
    const r = RENDER[id] || RENDER.valet;
    return {
      id, side, r,
      x: side===0 ? VW*0.34 : VW*0.66,
      y: GROUND, vx:0, vy:0,
      facing: side===0 ? 1 : -1,
      state:'idle', st:0,
      move:null, hitDone:false,
      hp: stats.hp, maxHp: stats.hp, meter:0,
      power: stats.power||1, defense: stats.defense||1, aiLevel: stats.ai||0,
      onGround:true, blockHold:false,
      buffer:[], aiT:0, aiPlan:null,
      w: 46, // demi-largeur pushbox approx
      flash:0,
      // ── systèmes Ikemen GO ──
      cmd: window.ChickenCommand ? new window.ChickenCommand.CommandBuffer(window.ChickenCommand.roosterCommands()) : null,
      // animateur MUGEN si le personnage vient d'un .def
      mugen: mugenLive[id] || null,
      anim: mugenLive[id] && window.ChickenMugen ? new window.ChickenMugen.Animator(mugenLive[id]) : null,
      // état CNS (personnages MUGEN exécutant leurs vrais coups)
      cns:null, cnsCtrl:true, cnsStateType:'S', cnsMoveType:'I', cnsPhysics:'S',
      cnsJuggle:1, hitDef:null, hitDefUsed:false,
      moveContact:0, moveHit:0, moveGuarded:0, lastCommand:'',
      combo:0, comboT:0,      // compteur de combo + fenêtre
      juggle:0,               // points de juggle restants (limite les combos aériens)
      invuln:0,               // frames d'invincibilité
      hitCount:0,             // coups déjà portés par l'attaque multi-hit en cours
      lastHitT:-99
    };
  }

  // ══════════════ INPUT ══════════════
  function onKey(e, down){
    const map = { ArrowLeft:'left',KeyA:'left', ArrowRight:'right',KeyD:'right',
      ArrowUp:'up',KeyW:'up', ArrowDown:'down',KeyS:'down',
      KeyJ:'light',KeyU:'light', KeyK:'heavy',KeyI:'heavy', KeyL:'kick',KeyO:'kick',
      KeyM:'special', KeyP:'special',          // œuf projectile
      Space:'super', Enter:'super' };          // coup fatal (jauge pleine)
    const k = map[e.code];
    if(k){ e.preventDefault(); keyState[k] = down; }
  }
  function readInput(){
    // clavier + boutons tactiles fusionnés (les tactiles écrivent dans touchState)
    const t = ChickenArena._touch;
    for(const k in input) input[k] = !!(keyState[k] || t[k]);
    return input;
  }

  // ══════════════ COMMANDES (buffer directionnel) ══════════════
  // Enregistre les fronts montants directionnels pour détecter →↓↘.
  function pushBuffer(f, cur, prev){
    const dirNow = dirCode(f, cur);
    if(!f.buffer.length || f.buffer[f.buffer.length-1].d !== dirNow)
      f.buffer.push({ d:dirNow, t:0 });
    f.buffer.forEach(b => b.t++);
    f.buffer = f.buffer.filter(b => b.t < 22).slice(-8);
  }
  function dirCode(f, cur){
    // renvoie 6=avant,3=bas-avant,2=bas,1=bas-arrière,4=arrière,5=neutre
    const fwd = f.facing>0 ? cur.right : cur.left;
    const back = f.facing>0 ? cur.left : cur.right;
    if(cur.down && fwd) return 3;
    if(cur.down && back) return 1;
    if(cur.down) return 2;
    if(fwd) return 6;
    if(back) return 4;
    return 5;
  }
  function hasQCF(f){ // →,↓,↘ dans l'ordre récent
    const seq = f.buffer.map(b=>b.d);
    for(let i=seq.length-1;i>=0;i--){
      if(seq[i]===3){
        const win = seq.slice(Math.max(0,i-4),i);
        if(win.includes(2) && win.includes(6)) return true;
        if(win.includes(6)) return true;
      }
    }
    return false;
  }

  // ══════════════ UPDATE ══════════════
  function step(){
    // hitstop / gel cinématique du super : la scène se fige, les FX continuent
    if(freezeT>0){ freezeT--; updateFx(); return; }
    round.stateT++;
    if(street){ gameFrame++; stepStreet(); return; }
    if(round.state==='intro'){ if(round.stateT>70){ round.state='fight'; round.stateT=0; banner('COMBAT !','fight'); } return; }
    if(round.state==='ko' || round.state==='win'){ if(round.stateT>150) nextRound(); return; }
    if(round.state!=='fight') return;

    // timer
    if(round.timer>0) round.timer--;

    const p = fighters[0], e = fighters[1];
    gameFrame++;
    const pin = readInput();
    const ein = aiInput(e, p);
    updateFighter(p, pin, e);
    updateFighter(e, ein, p);
    updateCns(p, e); updateCns(e, p);
    resolvePush(p, e);
    updateProjectiles();
    updateFx();

    // fin de round
    if(round.timer<=0 && p.state!=='ko' && e.state!=='ko') decideByHp(p,e);
    if(p.hp<=0 && p.state!=='ko') koFighter(p, e);
    else if(e.hp<=0 && e.state!=='ko') koFighter(e, p);
  }

  function updateFighter(f, inp, opp){
    f.st++;
    if(f.flash>0) f.flash--;
    if(f.invuln>0) f.invuln--;
    // fenêtre de combo : au-delà, le compteur retombe
    if(f.comboT>0){ f.comboT--; if(f.comboT===0){ f.combo=0; } }
    if(f.onGround && f.state!=='hitstun') f.juggle = 0;
    f.facing = (opp.x >= f.x) ? 1 : -1;   // fait toujours face à l'adversaire (au sol)

    const prevDir = f.buffer.length?f.buffer[f.buffer.length-1].d:5;
    pushBuffer(f, inp, prevDir);
    if(f.cmd) f.cmd.update(inp, f.facing);
    updateMugenAnim(f);

    // états qui verrouillent le contrôle
    if(f.state==='ko'){ physics(f); return; }
    // Filet de sécurité : une durée absente ou aberrante bloquerait le
    // combattant en hitstun pour toujours.
    if(f.state==='hitstun'){
      const stun = (typeof f.stun === 'number' && f.stun > 0) ? Math.min(f.stun, 60) : 14;
      if(f.st >= stun){ setState(f,'idle'); f.stun = 0; }
      physics(f); return;
    }
    if(f.state==='attack'){ runAttack(f, opp); physics(f); return; }

    // au sol : garde / accroupi / marche / saut / attaques
    f.blockHold = false;
    const fwd = f.facing>0?inp.right:inp.left;
    const back = f.facing>0?inp.left:inp.right;

    if(f.onGround){
      // ── 1) commandes spéciales (prioritaires sur les boutons simples) ──
      const detected = f.cmd ? f.cmd.detect() : null;
      if(detected){
        if(detected==='super' && f.meter>=MOVES.super.cost){ f.meter-=MOVES.super.cost; startAttack(f,'super'); return; }
        if(detected==='dp'){ startAttack(f,'dp'); return; }
        if(detected==='qcb'){ startAttack(f,'qcb'); return; }
        if(detected==='qcf'){ startAttack(f,'egg'); return; }
        if(detected==='charge'){ startAttack(f,'wing'); return; }
      }
      // ── 2) combinaisons ──
      // Haut + bec = uppercut ; bas + patte = pirouette. Les entrées
      // maintenues suffisent, sans avoir à saisir une commande directionnelle.
      if(inp.up && inp.light){ startAttack(f,'uppercut'); return; }
      if(inp.down && inp.kick){ startAttack(f,'pirouette'); return; }
      // ── 3) boutons simples ──
      // Coup fatal : touche dédiée, uniquement jauge pleine.
      if(inp.super && f.meter >= 100){ f.meter -= 100; startAttack(f,'super'); return; }
      // Œuf explosif : projectile, sur sa propre touche.
      if(inp.special){ startAttack(f,'egg'); return; }
      if(inp.heavy){ startAttack(f, 'wing'); return; }
      if(inp.kick){ startAttack(f, 'kick'); return; }
      if(inp.light){ startAttack(f, 'peck'); return; }
      // saut
      if(inp.up){ f.vy = JUMP_V; f.onGround=false; setState(f,'jump'); return; }
      // garde : reculer (sans attaquer)
      if(back){ f.blockHold = true; f.vx = 0; setState(f,'block'); if(!inp.down) { /* garde haute */ } return; }
      if(inp.down){ f.vx=0; setState(f,'crouch'); return; }
      if(fwd){ f.vx = WALK*f.facing; setState(f,'walk'); }
      else if(back){ f.vx = -WALK*f.facing; setState(f,'walk'); }
      else { f.vx = 0; setState(f,'idle'); }
    } else {
      // en l'air : contrôle horizontal léger, attaque aérienne simple
      if(inp.kick){ startAttack(f,'jumpkick'); return; }
      if(inp.light||inp.heavy){ startAttack(f, inp.heavy?'wing':'peck'); return; }
      f.vx = fwd ? WALK*0.8*f.facing : back ? -WALK*0.8*f.facing : f.vx*0.98;
      setState(f, f.vy<0?'jump':'fall');
    }
    physics(f);
  }

  function startAttack(f, moveName){
    // Personnage MUGEN : on exécute son VRAI état d'attaque (frame data et
    // HitDef issus de son .cns) plutôt que la table de coups du moteur.
    if(f.cns && startCnsAttack(f, moveName)){
      if(MOVES[moveName]?.label) banner(MOVES[moveName].label, MOVES[moveName].super?'super':'move');
      if(MOVES[moveName]?.super){
        freezeSuper(14);                 // court : lisible sans bloquer le jeu
        superEggBarrage(f);              // l'effet attendu : une volée d'œufs
      }
      return;
    }
    f.state='attack'; f.st=0; f.move=MOVES[moveName]; f.hitDone=false; f.hitCount=0;
    if(f.move.projectile){ f.spawned=false; }
    if(f.move.invuln) f.invuln = f.move.invuln;
    if(f.move.label) banner(f.move.label, f.move.super?'super':'move');
    if(f.move.super){ freezeSuper(14); superEggBarrage(f); playBeep('super'); }
    else if(f.move.special) playBeep('special');
  }
  function runAttack(f, opp){
    // Attaque pilotée par le CNS : c'est le HitDef du personnage qui décide.
    if(f.cns && f.hitDef){
      if(!f.hitDefUsed){
        // Collision au plus juste : boîtes Clsn1 de l'attaquant contre les
        // Clsn2 du défenseur, telles que définies dans les fichiers .AIR.
        const atk = clsnBoxes(f, 'hit');
        const def = clsnBoxes(opp, 'hurt');
        let touched;
        if(atk && def) touched = anyOverlap(atk, def);
        else {
          // Repli quand le .air ne donne pas de boîte : la portée doit rester
          // cohérente avec l'écart imposé par les pushbox, sinon le coup ne
          // peut jamais porter.
          const reach = (pushHalf(f) + pushHalf(opp)) * 1.5
                      + (f.hitDef.attr.includes('A') ? 12 : 0);
          touched = Math.abs(opp.x - f.x) < reach && Math.abs(opp.y - f.y) < 130;
        }
        if(touched){
          applyCnsHit(f, opp, f.hitDef);
          f.hitDefUsed = true; f.moveContact = 1; f.moveHit = 1;
        }
      }
      f.vx *= 0.92;
      return;
    }
    if(f.cns){ f.vx *= 0.92; return; }   // état CNS sans HitDef actif
    const m = f.move;
    if(m.projectile){
      if(f.st===m.startup && !f.spawned){ spawnEgg(f); f.spawned=true; }
    } else {
      const activeStart = m.startup, activeEnd = m.startup+m.active;
      const maxHits = m.hits || 1;
      if(f.st>=activeStart && f.st<activeEnd && f.hitCount<maxHits){
        // multi-hit : une touche autorisée tous les 3 frames actifs
        const canHit = maxHits===1 ? !f.hitDone : (f.st - f.lastHitT) >= 3;
        if(canHit){
          const hb = hitboxWorld(f, m.hit);
          if(overlap(hb, hurtbox(opp))){
            applyHit(f, opp, m, f.hitCount===maxHits-1);
            f.hitDone=true; f.hitCount++; f.lastHitT=f.st;
          }
        }
      }
    }
    if(f.st >= m.startup + (m.active||0) + m.recovery){ setState(f,'idle'); f.move=null; }
    f.vx *= 0.8;
  }

  function applyHit(att, def, m, isFinal=true){
    // invincibilité (démarrage de DP / super) : le coup passe à travers
    if(def.invuln>0){ spawnSpark(def.x, GROUND-90, 'block'); return; }
    // garde : le défenseur recule et n'attaque pas → chip minimal
    const blocking = def.state==='block' || def.blockHold;
    spawnSpark((def.x + att.x)/2, GROUND - 70, blocking?'block':'hit');
    if(blocking){
      def.vx = 0.6*m.push*(-def.facing); def.stun = m.blockstun; setState(def,'hitstun');
      def.hp -= Math.max(0, Math.round(m.dmg*0.12*(1/def.defense)));
      att.combo = 0; shake(4); return;
    }
    // juggle : au-delà du quota, l'adversaire au sol ne peut plus être relancé
    if(!def.onGround && def.juggle <= 0){ return; }
    if(!def.onGround) def.juggle -= 1;
    else def.juggle = m.juggle || 2;

    // combo + dégressivité des dégâts (damage scaling façon Ikemen GO)
    att.combo = (att.comboT>0 ? att.combo : 0) + 1;
    att.comboT = 60;
    const scale = att.combo<=1 ? 1 : Math.max(0.30, 1 - (att.combo-1)*0.11);
    const dmg = Math.max(1, Math.round(m.dmg * att.power / def.defense * scale));

    def.hp -= dmg; def.flash = 6;
    def.vx = m.kb*(-def.facing);
    if(m.launch){ def.vy = -9; def.onGround=false; }
    def.stun = m.hitstun; setState(def,'hitstun'); def.buffer=[]; def.cmd?.reset();
    def.combo = 0; def.comboT = 0;
    att.meter = Math.min(100, att.meter + m.meter);
    def.meter = Math.min(100, def.meter + Math.round(m.meter*0.4));
    shake(m.super?12:(m.dmg>=13?9:5));
    // Gerbe proportionnelle : un gros coup gicle nettement plus.
    blood(def.x, GROUND - 95, Math.min(3.2, dmg/9));
    if(dmg >= 18) blood(def.x, GROUND - 60, 2.4);
    popDamage(def.x, GROUND-120, dmg);
    if(isFinal && att.combo>=2) popCombo(att);
  }

  function setState(f, s){ if(f.state!==s){ f.state=s; f.st=0; } }

  /**
   * Applique un HitDef issu d'un .cns : les dégâts, le hitstun et la
   * projection viennent des vraies valeurs du personnage.
   * Échelle : la vie MUGEN est sur 1000, la nôtre sur maxHp.
   */
  function applyCnsHit(att, def, hd){
    if(def.invuln > 0){ spawnSpark(def.x, GROUND-90, 'block'); return; }
    const blocking = def.state === 'block' || def.blockHold;
    spawnSpark((def.x + att.x)/2, GROUND - 70, blocking ? 'block' : 'hit');

    const scaleHp = def.maxHp / 1000;               // 23 dégâts MUGEN → ~4 chez nous
    if(blocking){
      def.hp -= Math.max(0, Math.round(hd.guardDamage * scaleHp));
      def.vx = 1.1 * Math.abs(hd.groundVelX) * (-def.facing);
      def.stun = hd.guardHitTime || 8;
      setState(def, 'hitstun'); att.combo = 0; att.moveGuarded = 1;
      shake(4); return;
    }
    if(!def.onGround && def.juggle <= 0) return;
    if(!def.onGround) def.juggle -= 1; else def.juggle = hd.juggle || 2;

    att.combo = (att.comboT > 0 ? att.combo : 0) + 1;
    att.comboT = 60;
    const scale = att.combo <= 1 ? 1 : Math.max(0.30, 1 - (att.combo-1)*0.11);
    const dmg = Math.max(1, Math.round(hd.damage * scaleHp * att.power / def.defense * scale));

    def.hp -= dmg; def.flash = 6;
    if(def.onGround){
      def.vx = (hd.groundVelX * 1.45) * (-def.facing);   // recul net, mais sans casser la portée
      def.stun = hd.hitTime || 12;
      if(hd.fall || hd.groundType === 'Trip'){ def.vy = hd.airVelY || -6; def.onGround = false; }
    } else {
      def.vx = (hd.airVelX/2) * (-def.facing);
      def.vy = hd.airVelY || -3;
      def.stun = hd.airHitTime || 15;
    }
    setState(def, 'hitstun'); def.buffer = []; def.cmd?.reset();
    def.combo = 0; def.comboT = 0;
    att.meter = clampN(att.meter + (hd.givePower[0] ? hd.givePower[0]/30 : 6), 0, 100);
    def.meter = clampN(def.meter + 3, 0, 100);
    // pausetime du HitDef → hitstop, comme dans MUGEN
    att.vx += 1.3 * (-att.facing);                       // léger contrecoup
    if(hd.pauseTime > 0) freeze(Math.min(6, hd.pauseTime));
    blood(def.x, GROUND - 95, Math.min(2, dmg/12));
    shake(hd.damage >= 40 ? 11 : hd.damage >= 20 ? 8 : 5);
    popDamage(def.x, GROUND-120, dmg);
    if(att.combo >= 2) popCombo(att);
  }

  // ══════════ Pont vers l'interpréteur CNS ══════════
  // Les personnages MUGEN exécutent leurs VRAIS états d'attaque (frame data,
  // vélocités et HitDef issus de leur .cns). La locomotion (marche, saut,
  // garde) reste gérée par le moteur : ces états communs vivent normalement
  // dans le common1.cns du moteur, pas dans le fichier du personnage.
  const CNS_ATTACKS = { peck:200, wing:210, kick:230, heavy:240, dp:1000, qcb:1010, super:3000, egg:1000,
    jumpkick:640, uppercut:1000, pirouette:430 };

  function makeCnsHost(f){
    return {
      setAnim(no){ f.anim?.play(no, true); },
      setVel(x, y){ if(x!=null) f.vx = x*f.facing; if(y!=null) f.vy = y; },
      addVel(x, y){ f.vx += (x||0)*f.facing; f.vy += (y||0); },
      mulVel(x, y){ f.vx *= (x??1); f.vy *= (y??1); },
      setPos(x, y){ if(x!=null) f.x = x; if(y!=null) f.y = GROUND + y; },
      addPos(x, y){ f.x += (x||0)*f.facing; f.y += (y||0); },
      setCtrl(v){ f.cnsCtrl = !!v; },
      addPower(v){ f.meter = clampN(f.meter + v/30, 0, 100); },
      setStateType(t){ f.cnsStateType = t; },
      setMoveType(t){ f.cnsMoveType = t; if(t === 'I'){ f.hitDef = null; } },
      setPhysics(t){ f.cnsPhysics = t; },
      setJuggle(v){ f.cnsJuggle = v; },
      setAttackDist(){},
      turn(){ f.facing *= -1; },
      /** Le .cns renvoie vers un état commun : le moteur reprend la main. */
      commonState(no){
        f.hitDef = null; f.hitDefUsed = false;
        f.cnsMoveType = 'I';
        // Sans durée explicite, le hitstun ne se termine jamais : on garde
        // celle du coup encaissé, sinon une valeur de repli.
        if(no >= 5000 && no < 5900){ f.stun = f.stun || 14; setState(f, 'hitstun'); }
        else if(no === 11 || no === 12) setState(f, 'crouch');
        else if(no === 20) setState(f, 'walk');
        else if(no >= 40 && no <= 52) setState(f, 'jump');
        else if(no >= 120 && no <= 155) setState(f, 'block');
        else setState(f, 'idle');
        f.move = null;
      },
      playSound(){ playBeep('hit'); },
      // HitDef : le coup devient actif jusqu'à ce qu'il touche ou que l'état change.
      setHitDef(hd){ f.hitDef = hd; f.hitDefUsed = false; },
      // ── effets visuels / de scène pilotés par le .cns ──
      palFx(o){ f.palFx = { t:o.time, add:o.add, mul:o.mul, invert:o.invert }; },
      envShake(time, ampl){ shakeStage(Math.min(2, ampl/8)); },
      envColor(rgb, time){ fx.push({ kind:'flashscreen', rgb, t:0, life:Math.max(2,time) }); },
      pause(time){ freeze(Math.min(60, time)); },
      dust(pos){ dust(f.side === 0 ? 'player' : 'enemy'); },
      afterImage(time){ f.afterImage = time; },
      // ── effets sur l'adversaire ──
      targetLife(v){ const o = other(f); if(o) o.hp = clampN(o.hp + v*(o.maxHp/1000), 0, o.maxHp); },
      targetPower(v){ const o = other(f); if(o) o.meter = clampN(o.meter + v/30, 0, 100); },
      targetVel(x, y, add){
        const o = other(f); if(!o) return;
        if(add){ o.vx += x*f.facing; o.vy += y; } else { o.vx = x*f.facing; o.vy = y; }
      },
      targetState(no){ const o = other(f); if(o && o.cns && !isNaN(no)) o.cns.changeState(no); },
      targetBind(time, pos){
        const o = other(f); if(!o) return;
        o.boundTo = f; o.boundT = time; o.boundPos = pos;
      },
      targetDrop(){ const o = other(f); if(o){ o.boundTo = null; o.boundT = 0; } },
      // ── vie / jauge / multiplicateurs ──
      addLife(v){ f.hp = clampN(f.hp + v*(f.maxHp/1000), 0, f.maxHp); },
      setLife(v){ f.hp = clampN(v*(f.maxHp/1000), 0, f.maxHp); },
      setPower(v){ f.meter = clampN(v/30, 0, 100); },
      setAttackMul(v){ f.attackMul = v; },
      setDefenceMul(v){ f.defenceMul = v; },
      setFall(v){ f.forceFall = v; },
      hitOverride(stateNo, time){ f.hitOverride = { stateNo, time }; },
      reversalDef(hd){ f.reversal = hd; },
      assertSpecial(flag){ if(/invisible/i.test(flag)) f.invisible = 6; },
      spawnProjectile(hd, cfg){
        projectiles.push({ x:f.x + (cfg.offX||0)*f.facing, y:GROUND - 78 + (cfg.offY||0),
          vx:(cfg.velX||4)*f.facing, owner:f, life:cfg.removeTime>0?cfg.removeTime:120, rot:0, hitDef:hd });
        playBeep('egg');
      }
    };
  }
  const clampN = (n,a,b) => Math.max(a, Math.min(b, n));
  const other = f => fighters.find(x => x !== f) || null;

  /** Construit le contexte d'évaluation des déclencheurs CNS. */
  function cnsContext(f, opp){
    const frames = f.anim?.anim?.frames || [];
    const total = frames.reduce((s,fr)=> s + (fr.dur>0?fr.dur:0), 0);
    const elapsed = frames.slice(0, f.anim?.i || 0).reduce((s,fr)=> s + (fr.dur>0?fr.dur:0), 0) + (f.anim?.t || 0);
    return {
      anim: f.anim?.no ?? 0,
      animElem: (f.anim?.i ?? 0) + 1,               // MUGEN indexe à partir de 1
      animElemTime: f.anim?.t ?? 0,
      // 0 = animation terminée. Le drapeau `done` de l'animateur est ce qui
      // permet à `ChangeState / trigger1 = AnimTime = 0` de se déclencher :
      // sans lui, l'animation boucle et le personnage reste bloqué dans son
      // état d'attaque, HitDef actif en permanence.
      animTime: f.anim?.done ? 0 : (total > 0 ? elapsed - total : 0),
      ctrl: f.cnsCtrl, alive: f.hp > 0,
      life: Math.max(0, Math.round(f.hp/f.maxHp*1000)),
      power: Math.round(f.meter*30),
      moveContact: f.moveContact, moveHit: f.moveHit, moveGuarded: f.moveGuarded,
      moveType: f.cnsMoveType || 'I', stateType: f.cnsStateType || 'S',
      velX: f.vx*f.facing, velY: f.vy,
      posX: f.x, posY: f.y - GROUND,
      p2dist: Math.abs(opp.x - f.x) - 40,
      facing: f.facing, gameTime: gameFrame, roundState: round.state==='fight'?2:1,
      hitShakeOver: true, hitOver: f.state!=='hitstun', hitFall: !f.onGround,
      currentCommand: f.lastCommand || '',
      command: n => (f.lastCommand && String(n).toLowerCase() === f.lastCommand.toLowerCase()) ? 1 : 0,
      numProj: projectiles.filter(p => p.owner === f).length,
      numTarget: f.moveContact ? 1 : 0
    };
  }

  /** Fait tourner la machine d'états CNS d'un combattant. */
  function updateCns(f, opp){
    if(!f.cns) return;
    f.cns.update(cnsContext(f, opp));
    // Retour en état neutre quand l'attaque est finie et que le contrôle revient.
    if(f.cnsCtrl && f.state === 'attack'){ setState(f, 'idle'); f.move = null; f.hitDef = null; }
    // Chien de garde : certains états du .cns comptent sur des états communs
    // du moteur MUGEN pour se terminer. Si l'un d'eux n'aboutit pas, le joueur
    // se retrouve sans contrôle jusqu'à la fin du round : on le libère.
    if(f.state === 'attack' && !f.cnsCtrl){
      if(f.st > CNS_ATTACK_MAX){
        console.warn('[ChickenArena] état CNS bloqué, contrôle rendu:', f.cns.stateNo);
        landCns(f);
      }
    }
  }
  const CNS_ATTACK_MAX = 150;   // 2,5 s : bien au-delà du plus long coup

  /** Déclenche l'attaque CNS correspondant à un coup du moteur. */
  function startCnsAttack(f, moveName){
    const no = CNS_ATTACKS[moveName];
    if(no == null || !f.cns.states[no]) return false;
    f.state = 'attack'; f.st = 0; f.move = MOVES[moveName] || MOVES.peck;
    f.moveContact = 0; f.moveHit = 0; f.moveGuarded = 0;
    f.cnsCtrl = false; f.hitDef = null;
    f.cns.changeState(no);
    return true;
  }

  /** Traduit l'état du moteur en numéro d'animation MUGEN standard. */
  function mugenAnimFor(f){
    const A = window.ChickenMugen.ANIM;
    if(f.state==='ko')      return f.onGround ? A.down : A.fall;
    if(f.state==='hitstun') return f.onGround ? A.hitHigh : A.fall;
    if(f.state==='block')   return A.guardStand;
    if(f.state==='crouch')  return A.crouch;
    if(f.state==='jump' || f.state==='fall') return f.vy<0 ? A.jumpUp : A.jumpDown;
    if(f.state==='walk')    return (f.vx*f.facing)>0 ? A.walkFwd : A.walkBack;
    if(f.state==='attack'){
      switch(f.move?.name){
        case 'peck':  return A.lightPunch;
        case 'wing':  return A.strongPunch;
        case 'kick':  return A.lightKick;
        case 'dp':    return A.strongPunch;
        case 'qcb':   return A.strongKick;
        case 'egg':   return A.lightKick;
        case 'super': return A.strongPunch;
      }
      return A.lightPunch;
    }
    return A.stand;
  }

  /** Avance l'animation MUGEN en suivant l'état courant. */
  function updateMugenAnim(f){
    if(!f.anim) return;
    // Pendant une attaque CNS, c'est le .cns qui choisit l'animation.
    if(f.cns && f.state === 'attack'){ f.anim.tick(); return; }
    const no = mugenAnimFor(f);
    // une attaque relance son animation depuis le début
    const restart = f.state==='attack' && f.st<=1;
    f.anim.play(no, restart);
    f.anim.tick();
  }

  function physics(f){
    f.x += f.vx; f.y += f.vy;
    if(!f.onGround){
      f.vy += GRAVITY;
      if(f.y>=GROUND){
        f.y=GROUND; f.vy=0; f.onGround=true;
        if(f.state==='fall'||f.state==='jump') setState(f,'idle');
        // Un état aérien du .cns (coup de pied sauté…) ne se termine jamais
        // tout seul : dans MUGEN c'est le moteur qui bascule sur l'état
        // commun 52 à l'atterrissage. Sans ça, le personnage reste bloqué.
        else if(f.state==='attack' && f.cns && f.cnsStateType==='A') landCns(f);
      }
    }
    f.x = Math.max(WALL, Math.min(VW-WALL, f.x));
  }

  /** Atterrissage d'un état aérien piloté par le CNS : on rend la main. */
  function landCns(f){
    f.cns?.changeState(0);           // au cas où le perso définisse l'état 0
    f.cnsCtrl = true; f.cnsStateType = 'S'; f.cnsMoveType = 'I';
    f.hitDef = null; f.hitDefUsed = false; f.move = null;
    setState(f, 'idle');
  }

  /**
   * Demi-largeur de la pushbox. Les personnages MUGEN déclarent la leur
   * dans [Size] (ground.front / ground.back) : s'en servir évite de les
   * tenir trop écartés — sinon aucun coup ne porte.
   */
  function pushHalf(f){
    if(f.pushHalfCache != null) return f.pushHalfCache;
    let half = PUSH;
    const size = f.mugen?.constants?.size;
    if(size){
      const front = parseFloat(size['ground.front']), back = parseFloat(size['ground.back']);
      if(!isNaN(front) && !isNaN(back)) half = ((front + back) / 2) * (f.r.scale || 1);
    } else if(f.r.mugen){
      half = 26 * (f.r.scale || 1);
    }
    f.pushHalfCache = Math.max(10, half);
    return f.pushHalfCache;
  }

  function resolvePush(a, b){
    // Marge de confort : les combattants ne restent pas collés en permanence.
    // En 1 contre 1 on aère franchement ; en mêlée (La Street) on resserre,
    // sinon le joueur est plaqué au mur par le groupe et ne touche plus rien.
    // 2,15 aérait bien trop : l'écart au repos (117) dépassait la portée du
    // coup de bec (135 au mieux) dès le moindre recul, et plus rien ne
    // touchait. 1,65 garde de l'air sans rendre les échanges stériles.
    const margin = street ? 1.05 : 1.65;
    const dx = b.x - a.x, min = (pushHalf(a) + pushHalf(b)) * margin;
    if(Math.abs(dx) >= min) return;
    const push = min - Math.abs(dx), dir = dx>=0?1:-1;
    // Dans La Street on affronte une meute : si le joueur cédait au poussage,
    // le groupe le plaquerait contre le mur. C'est donc l'ennemi qui recule.
    let wa = 0.5, wb = 0.5;
    if(street && a === fighters[0]){ wa = 0; wb = 1; }
    else if(street && b === fighters[0]){ wa = 1; wb = 0; }
    a.x -= push * dir * wa;
    b.x += push * dir * wb;
    a.x = Math.max(WALL, Math.min(VW-WALL, a.x));
    b.x = Math.max(WALL, Math.min(VW-WALL, b.x));
  }

  // ── boîtes ──
  /**
   * Boîtes de collision réelles (Clsn des fichiers .AIR), converties en
   * coordonnées monde. Les coordonnées MUGEN sont relatives à l'axe du
   * sprite, Y négatif vers le haut, et sont miroitées selon le facing.
   */
  function clsnBoxes(f, kind){
    const frame = f.anim && f.anim.current();
    const raw = frame && (kind === 'hit' ? frame.hit : frame.hurt);
    if(!raw || !raw.length) return null;
    const sc = f.r.scale || 1;
    return raw.map(b => {
      const x1 = f.facing > 0 ? b.x1 : -b.x2;
      const x2 = f.facing > 0 ? b.x2 : -b.x1;
      return { x: f.x + x1*sc, y: f.y + b.y1*sc,
               w: (x2-x1)*sc,  h: (b.y2-b.y1)*sc };
    });
  }
  function anyOverlap(as, bs){
    if(!as || !bs) return false;
    for(const a of as) for(const b of bs) if(overlap(a, b)) return true;
    return false;
  }
  function hurtbox(f){
    const real = clsnBoxes(f, 'hurt');
    if(real && real.length) return real[0];          // compat : première boîte
    return { x:f.x-26, y:GROUND-130, w:52, h:130 };
  }
  function hitboxWorld(f, box){ return { x: f.x + (f.facing>0?box.x:-box.x-box.w), y: GROUND+box.y, w:box.w, h:box.h }; }
  function overlap(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }

  // ── projectiles (œuf) ──
  /**
   * COCORICO FATAL : trois œufs lancés en éventail. C'est l'effet visible
   * qui manquait — l'état CNS jouait l'animation sans rien projeter.
   */
  function superEggBarrage(f){
    for(let i=0;i<3;i++){
      setTimeout(() => {
        if(!running) return;
        projectiles.push({ x:f.x + 26*f.facing, y:GROUND - 70 - i*22,
          vx:(6.5 + i*0.8)*f.facing, owner:f, life:110, rot:0, superEgg:true });
        playBeep('egg');
      }, i*110);
    }
  }

  function spawnEgg(f){ projectiles.push({ x:f.x+30*f.facing, y:GROUND-78, vx:6.2*f.facing, owner:f, life:120, rot:0 }); playBeep('egg'); }
  function updateProjectiles(){
    for(const pr of projectiles){
      pr.x += pr.vx; pr.rot += 0.4; pr.life--;
      const target = pr.owner === fighters[0]
        ? fighters.slice(1).find(f => Math.abs(f.x - pr.x) < 40)
        : fighters[0];
      if(target && overlap({x:pr.x-12,y:pr.y-12,w:24,h:24}, hurtbox(target))){
        eggBoom(pr.x, pr.y); const blocking = target.state==='block'||target.blockHold;
        const base = pr.weapon ? pr.weapon.dmg : 28;
        const dmg = blocking?4:Math.round(base*pr.owner.power/target.defense);
        target.hp -= dmg; target.flash=8; if(!blocking){ target.vx=8*(-target.facing); target.stun=22; setState(target,'hitstun'); }
        shake(12); popDamage(target.x,GROUND-120,dmg); pr.life=0;
      }
      if(pr.x<WALL||pr.x>VW-WALL){ eggBoom(pr.x,pr.y); pr.life=0; }
    }
    projectiles = projectiles.filter(p=>p.life>0);
  }

  // ══════════════ IA adversaire ══════════════
  function aiInput(e, p){
    const out = blankInput();
    if(e.aiFrozen) return out;
    if(round.state!=='fight' || e.state==='ko' || e.state==='hitstun' || e.state==='attack') return out;
    e.aiT--;
    const dist = Math.abs(p.x - e.x), toward = p.x>e.x?'right':'left', away = p.x>e.x?'left':'right';
    // La Street : la meute ne frappe pas toute en même temps, sinon le joueur
    // est bloqué en encaissement permanent. Les autres tournent autour.
    if(e.noAttack){
      if(dist > 150) out[toward] = true;
      else if(dist < 90) out[away] = true;
      return out;
    }
    const lvl = e.aiLevel; // 0..1 agressivité/skill
    // bloque parfois si l'adversaire attaque proche
    if(p.state==='attack' && dist<90 && Math.random()<0.25+0.4*lvl){ out[away]=true; return out; }
    if(e.aiT>0){ if(e.aiPlan) out[e.aiPlan]=true; return out; }
    if(dist>120){ out[toward]=true; e.aiPlan=toward; e.aiT=10+Math.random()*20; }
    else if(dist<70){
      const r=Math.random();
      if(r<0.4+0.3*lvl){ out.light=true; e.aiPlan=null; e.aiT=8; }
      else if(r<0.6+0.3*lvl){ out.kick=true; e.aiT=10; }
      else if(r<0.72){ out.heavy=true; e.aiT=14; }
      else if(r<0.8 && e.meter>=100){ out.special=true; e.aiT=20; }
      else { out[away]=true; e.aiPlan=away; e.aiT=12; }
    } else {
      const r=Math.random();
      if(r<0.5+0.2*lvl){ out[toward]=true; e.aiPlan=toward; e.aiT=8+Math.random()*12; }
      else if(r<0.7){ out.heavy=true; e.aiT=16; }
      else { out.up=true; e.aiT=18; }
    }
    return out;
  }

  // ══════════════ MODE « LA STREET » ══════════════

  /** Prépare la vague courante : charge et place les adversaires. */
  async function startWave(){
    const S = window.ChickenStreet;
    const list = S.wave(street.wave);
    street.mood = S.moodFor(street.wave);
    // charge les personnages nécessaires (une fois chacun)
    for(const e of list){
      const r = RENDER[e.id]; if(!r || !r.mugen) continue;
      const key = `${e.id}#${e.pal ?? 'd'}#${e.skin ?? 'd'}`;
      if(!mugenCache[key]){
        try{ mugenCache[key] = await window.ChickenMugen.loadCharacter(r.def, e.pal, e.skin); }
        catch{ continue; }
      }
      e.char = mugenCache[key];
    }
    // le joueur reste, les ennemis sont remplacés
    const player = fighters[0];
    fighters = [player];
    list.forEach((e, i) => {
      if(!e.char) return;
      mugenLive[e.id] = e.char;
      const f = makeFighter(e.id, 1, { hp:e.hp, power:e.power, defense:e.defense ?? 1, ai:e.ai });
      f.mugen = e.char;
      f.anim = new window.ChickenMugen.Animator(e.char);
      // entrent par la droite, échelonnés
      f.x = VW - 60 - i * 70;
      attachCns(f);
      fighters.push(f);
    });
    street.banner = 90;
    round.state = 'fight';
  }

  /** Un adversaire tombe : il s'efface en clignotant, la mare de sang reste. */
  function streetKill(f){
    const S = window.ChickenStreet;
    const lie = S.liesDown(f.id);
    // Les Kung Fu ont une vraie animation « au sol » (bras le long du corps) :
    // bien plus propre que de faire pivoter le sprite debout.
    if(lie) f.anim?.play(window.ChickenMugen.ANIM.down ?? 5110, true);
    street.corpses.push({ x:f.x, facing:f.facing, id:f.id,
      anim:f.anim, lie, pool:0, t:0 });
    blood(f.x, GROUND - 60, 3);
    street.killed++;
    const drop = S.rollDrop();
    if(drop) street.pickups.push({ x:f.x, y:GROUND - 18, w:drop, t:0, bob:0 });
    fighters = fighters.filter(x => x !== f);
    playBeep('ko');
  }

  /** Ramassage d'arme au contact. */
  function streetPickups(p){
    const S = window.ChickenStreet;
    for(const it of street.pickups){
      if(it.taken) continue;
      if(Math.abs(it.x - p.x) < 34){
        it.taken = true;
        const w = S.WEAPONS[it.w];
        p.weapon = { ...w, ammo:w.ammo };
        banner(`${w.icon} ${w.name} !`, 'move');
        playBeep('special');
      }
    }
    street.pickups = street.pickups.filter(i => !i.taken);
  }

  /** Tir de l'arme ramassée (touche ŒUF/super réutilisée). */
  function streetFire(p){
    const w = p.weapon;
    if(!w || w.ammo <= 0 || p.wCool > 0) return false;
    p.wCool = w.cooldown;
    w.ammo--;
    if(w.projectile){
      projectiles.push({ x:p.x + 26*p.facing, y:GROUND - 78,
        vx:w.speed * p.facing, owner:p, life:120, rot:0,
        weapon:w, superEgg:w.explodes });
      playBeep(w.id === 'pistol' ? 'boom' : 'egg');
    } else {
      // épée : frappe large immédiate
      for(const e of fighters){
        if(e === p) continue;
        if(Math.abs(e.x - p.x) < w.reach && (e.x - p.x) * p.facing > -20){
          e.hp -= w.dmg; e.flash = 8;
          e.vx = 7 * (-e.facing); e.stun = 20; setState(e, 'hitstun');
          blood(e.x, GROUND - 90, 2.6); shake(9);
          popDamage(e.x, GROUND - 120, w.dmg);
        }
      }
      playBeep('hit');
    }
    if(w.ammo <= 0){ banner('ARME ÉPUISÉE', 'move'); p.weapon = null; }
    return true;
  }

  /**
   * Le joueur avance et c'est la rue qui défile.
   * Passé le milieu de l'écran on le retient et on décale tout le reste :
   * décor, ennemis, corps et objets gardent ainsi leurs positions relatives.
   */
  function scrollStreet(p){
    const edge = VW * 0.46;
    const d = p.x - edge;
    if(d <= 0) return;
    p.x = edge;
    street.scroll += d;
    for(const f of fighters) if(f !== p) f.x -= d;
    for(const c of street.corpses) c.x -= d;
    for(const it of street.pickups) it.x -= d;
    for(const pr of projectiles) pr.x -= d;
    // ce qui est sorti loin derrière ne reviendra pas
    street.corpses = street.corpses.filter(c => c.x > -80);
    street.pickups = street.pickups.filter(i => i.x > -40);
  }

  /** Boucle propre au mode Street. */
  function stepStreet(){
    const p = fighters[0];
    if(street.banner > 0) street.banner--;
    if(p.wCool > 0) p.wCool--;

    // Sortie d'encaissement : court répit d'invincibilité. Sans lui, une meute
    // enchaîne les coups et le joueur ne reprend jamais la main.
    if(p.state === 'hitstun') p.wasHit = true;
    else if(p.wasHit){ p.wasHit = false; p.invuln = Math.max(p.invuln, 26); }

    const pin = readInput();
    // la touche du coup fatal sert aussi à tirer quand une arme est en main
    if(pin.super && p.weapon){ streetFire(p); pin.super = false; }
    updateFighter(p, pin, nearest(p) || p);
    updateCns(p, nearest(p) || p);
    scrollStreet(p);
    streetPickups(p);

    // jeton d'attaque : au plus deux assaillants à la fois (règle classique
    // du beat'em up), les autres se contentent d'approcher
    const gang = fighters.slice(1).sort((a,b) => Math.abs(a.x-p.x) - Math.abs(b.x-p.x));
    gang.forEach((e, i) => { e.noAttack = i >= 2; });
    for(const e of gang){
      const target = p;
      updateFighter(e, aiInput(e, target), target);
      updateCns(e, target);
      if(e.hp <= 0) streetKill(e);
    }
    // séparation de tous les corps
    for(let i=0;i<fighters.length;i++)
      for(let j=i+1;j<fighters.length;j++)
        resolvePush(fighters[i], fighters[j]);

    updateProjectiles();
    updateFx();
    street.corpses.forEach(c => { c.t++; if(c.pool < 46) c.pool += 0.7; });

    // vague suivante
    if(fighters.length <= 1 && round.state === 'fight'){
      round.state = 'wavedone'; round.stateT = 0;
    }
    if(round.state === 'wavedone'){
      round.stateT++;
      // startWave est asynchrone (chargement des personnages) : sans ce
      // verrou, la condition repasse à chaque frame et les vagues défilent.
      if(round.stateT > 70){
        round.state = 'waveload';
        street.wave++;
        street.corpses = street.corpses.slice(-6);   // on garde les plus récents
        startWave();
      }
    }
    // mort du joueur
    if(p.hp <= 0){
      street.lives--;
      blood(p.x, GROUND - 70, 3); bloodScreen();
      if(street.lives <= 0){
        running = false;
        if(opts.onEnd) opts.onEnd({ win:false, wave:street.wave, killed:street.killed });
        return;
      }
      p.hp = p.maxHp; p.x = VW * 0.25; setState(p, 'idle');
      banner(`${street.lives} VIE${street.lives>1?'S':''} RESTANTE${street.lives>1?'S':''}`, 'ko');
    }
  }

  function nearest(p){
    let best = null, d = 1e9;
    for(const f of fighters){
      if(f === p) continue;
      const dd = Math.abs(f.x - p.x);
      if(dd < d){ d = dd; best = f; }
    }
    return best;
  }

  // ══════════════ ROUNDS ══════════════
  function koFighter(loser, winner){
    setState(loser,'ko'); loser.vx = 5*(-loser.facing); loser.vy=-6; loser.onGround=false;
    round.state='ko'; round.stateT=0; const wi = winner.side; round.wins[wi]++;
    banner('K.O. !','ko'); shake(16); playBeep('ko');
    bloodScreen(); blood(loser.x, GROUND-100, 2.4);
  }
  function decideByHp(p,e){
    if(p.hp===e.hp){ round.state='ko'; round.stateT=0; banner('TEMPS !','fight'); return; }
    const winner = p.hp>e.hp?p:e; round.wins[winner.side]++; round.state='ko'; round.stateT=0;
    banner('TEMPS !','fight');
  }
  function nextRound(){
    if(round.wins[0]>=round.best || round.wins[1]>=round.best){ endMatch(); return; }
    round.n++; round.timer=99*FPS; round.state='intro'; round.stateT=0;
    resetPositions();
  }
  function resetPositions(){
    fighters.forEach((f,i)=>{ f.hp=f.maxHp; f.x= i===0?VW*0.34:VW*0.66; f.y=GROUND; f.vx=f.vy=0; f.onGround=true; setState(f,'idle'); f.buffer=[]; });
    projectiles=[]; fx=[];
  }
  function endMatch(){
    running=false; if(raf) cancelAnimationFrame(raf); raf=null;
    const playerWon = round.wins[0] > round.wins[1];
    if(opts && opts.onEnd) opts.onEnd({ win: playerWon, wins: round.wins.slice() });
  }

  // ══════════════ FX ══════════════
  function banner(text,tone){ fx.push({kind:'banner',text,tone,t:0,life:tone==='move'?40:70}); }
  /** Gerbe de gouttes de sang à l'impact — plus lisible qu'un flash plein. */
  function blood(x, y, power=1){
    const n = Math.min(14, 4 + Math.round(power*6));
    for(let i=0;i<n;i++){
      fx.push({ kind:'blood', x, y,
        vx:(Math.random()-0.5)*6*power, vy:-(1.5+Math.random()*4)*power,
        r:1.6+Math.random()*2.6, t:0, life:26+Math.random()*22 });
    }
  }
  /** Voile sanglant sur tout l'écran (K.O.). */
  function bloodScreen(){ fx.push({ kind:'bloodscreen', t:0, life:110 }); }
  function popCombo(f){ fx.push({kind:'combo',side:f.side,n:f.combo,t:0,life:50}); }
  // Gel cinématique au déclenchement d'un super (hitstop global).
  /**
   * Gel cinématique (hitstop). Plafonné et non cumulable : sur des coups
   * très répétés, des gels enchaînés donnaient une sensation de lag —
   * le jeu était en réalité figé plusieurs fois de suite.
   */
  function freeze(frames){
    if(freezeT > 0) return;                 // déjà figé : on n'empile pas
    freezeT = Math.min(20, Math.max(0, frames));
  }
  /** Gel long réservé aux supers, qui doivent rester spectaculaires. */
  function freezeSuper(frames){ freezeT = Math.min(45, Math.max(freezeT, frames)); }
  function spawnSpark(x,y,type){ fx.push({kind:'spark',x,y,type,t:0,life:14}); if(type==='hit')playBeep('hit'); }
  function eggBoom(x,y){
    fx.push({kind:'boom',x,y,t:0,life:34});
    // éclats de coquille et jaune d'œuf projetés
    for(let i=0;i<12;i++){
      const a = (i/12)*Math.PI*2;
      fx.push({ kind:'yolk', x, y, vx:Math.cos(a)*(2.5+Math.random()*3),
                vy:Math.sin(a)*(2.5+Math.random()*3) - 1.5,
                r:2.5+Math.random()*3, t:0, life:30+Math.random()*16 });
    }
    shake(10); playBeep('boom');
  }
  function popDamage(x,y,d){ fx.push({kind:'dmg',x,y,d,t:0,life:40}); }
  function shake(p){ ChickenArena._shake = Math.max(ChickenArena._shake, p); }
  function updateFx(){
    for(const o of fx){
      o.t++;
      if(o.kind==='blood' || o.kind==='yolk'){ o.x += o.vx; o.y += o.vy; o.vy += 0.42; o.vx *= 0.99; }
      if(o.kind==='rain'){ o.x += o.vx; o.y += o.vy; if(o.y > GROUND){ o.y = -10; o.x = Math.random()*VW; } }
    }
    // Plafonne les effets : au-delà, les plus anciens sont retirés. Sans
    // cela, des coups très répétés accumulent des centaines de particules
    // et la scène se met à ramer.
    fx = fx.filter(o => o.t < o.life);
    if(fx.length > 160) fx = fx.slice(-160);
    ChickenArena._shake *= 0.86;
  }

  // ══════════════ RENDER ══════════════
  function render(){
    const sx = (Math.random()-0.5)*ChickenArena._shake, sy=(Math.random()-0.5)*ChickenArena._shake;
    ctx.setTransform(cv.width/VW,0,0,cv.height/VH, sx, sy);
    drawStage();
    drawStreetProps();
    // ombres
    fighters.forEach(f=>{ ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(f.x, GROUND+4, 40, 9, 0,0,7); ctx.fill(); });
    // combattants (le plus en arrière derrière)
    const order = [...fighters].sort((a,b)=>a.y-b.y);
    order.forEach(f => {
      drawTrail(f);        // sillage : le coup se « voit » même sur peu d'images
      drawFighter(f);
    });
    // Les arcs de coup passent APRÈS tout le monde : sinon le combattant
    // dessiné ensuite recouvre l'arc de son adversaire et le coup ne se voit pas.
    order.forEach(drawSwipe);
    projectiles.forEach(drawEgg);
    drawFx();
    drawHud();
  }

  function drawStage(){
    const D = (opts && opts.decor) || { sky:'#3a2568', sky2:'#4a2f7a', ground:'#6b4423', ground2:'#3d2712' };
    const g = ctx.createLinearGradient(0,0,0,VH);
    g.addColorStop(0,D.sky); g.addColorStop(0.62,D.sky2); g.addColorStop(0.62,D.ground); g.addColorStop(1,D.ground2);
    ctx.fillStyle=g; ctx.fillRect(0,0,VW,VH);
    // foule
    ctx.fillStyle='rgba(255,255,255,.06)'; ctx.fillRect(0,VH*0.32,VW,18);
    // sol
    ctx.fillStyle=D.ground; ctx.fillRect(0,GROUND,VW,VH-GROUND);
    ctx.strokeStyle='rgba(255,213,74,.25)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,GROUND); ctx.lineTo(VW,GROUND); ctx.stroke();
    drawWeather(D);
  }

  /**
   * Météo de l'arène : nuages, pluie, éclairs ou grand soleil.
   * Purement décoratif — dessiné derrière les combattants.
   */
  let lightning = 0;
  function drawWeather(D){
    if(D.city) drawCity();
    if(D.street) drawStreet();
    // En intérieur, aucune météo : ni pluie, ni nuages, ni soleil.
    const w = D.street ? (street?.mood?.weather || 'clear') : (D.indoor ? null : D.weather);
    if(!w || w === 'clear') return;

    if(w === 'sun'){
      const cx = VW*0.82, cy = VH*0.14;
      const g = ctx.createRadialGradient(cx,cy,4, cx,cy,54);
      g.addColorStop(0,'rgba(255,241,150,.95)'); g.addColorStop(1,'rgba(255,214,90,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,54,0,7); ctx.fill();
    }
    if(w === 'sun' || w === 'cloudy' || w === 'rain' || w === 'storm'){
      const dark = (w === 'rain' || w === 'storm');
      ctx.save();
      ctx.fillStyle = dark ? 'rgba(30,30,45,.72)' : 'rgba(255,255,255,.30)';
      for(let i=0;i<4;i++){
        const cx = ((gameFrame*0.16 + i*180) % (VW+180)) - 90;
        const cy = 26 + (i%2)*22;
        const s  = dark ? 1.25 : 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 46*s, 15*s, 0, 0, 7);
        ctx.ellipse(cx+30, cy+4, 34*s, 12*s, 0, 0, 7);
        ctx.ellipse(cx-28, cy+5, 30*s, 11*s, 0, 0, 7);
        ctx.fill();
      }
      ctx.restore();
    }
    if(w === 'rain' || w === 'storm'){
      // voile sombre
      ctx.fillStyle = 'rgba(10,12,28,.30)'; ctx.fillRect(0,0,VW,VH);
      // gouttes : motif déterministe, sans allocation par frame
      ctx.strokeStyle = 'rgba(175,205,240,.55)'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for(let i=0;i<70;i++){
        const seed = i*97;
        const x = (seed*13 + gameFrame*3.4) % VW;
        const y = (seed*29 + gameFrame*11) % VH;
        ctx.moveTo(x, y); ctx.lineTo(x-3, y+13);
      }
      ctx.stroke();
    }
    if(w === 'storm'){
      if(lightning > 0) lightning--;
      else if(Math.random() < 0.006) lightning = 7;
      if(lightning > 0){
        ctx.fillStyle = `rgba(235,240,255,${0.16 + (lightning/7)*0.34})`;
        ctx.fillRect(0,0,VW,VH);
      }
    }
  }

  /** Rue nocturne : lune, immeubles, lampadaires allumés au sol. */
  function drawStreet(){
    const mood = street?.mood || { moon:true };
    // lune
    if(mood.moon){
      const mx = VW*0.80, my = 52;
      const g = ctx.createRadialGradient(mx,my,6, mx,my,54);
      g.addColorStop(0,'rgba(240,244,255,.95)'); g.addColorStop(1,'rgba(200,215,255,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(mx,my,54,0,7); ctx.fill();
      ctx.fillStyle='#eef2ff'; ctx.beginPath(); ctx.arc(mx,my,17,0,7); ctx.fill();
      ctx.fillStyle='rgba(180,190,215,.55)';
      ctx.beginPath(); ctx.arc(mx-6,my-4,4,0,7); ctx.arc(mx+5,my+5,3,0,7); ctx.fill();
    }
    const sc = street?.scroll || 0;
    drawCity(sc);
    drawParkedCars(sc);
    // trottoir
    ctx.fillStyle='#111827'; ctx.fillRect(0, GROUND-10, VW, 10);
    ctx.strokeStyle='rgba(255,255,255,.10)'; ctx.lineWidth=1;
    for(let x = -(sc % 48); x < VW; x += 48){
      ctx.beginPath(); ctx.moveTo(x,GROUND-10); ctx.lineTo(x,GROUND); ctx.stroke();
    }
    // lampadaires : halo chaud projeté sur la chaussée
    for(let i=0;i<5;i++){
      const lx = 70 + i*160 - (sc % 160);
      ctx.strokeStyle='#334155'; ctx.lineWidth=4;
      ctx.beginPath(); ctx.moveTo(lx, GROUND); ctx.lineTo(lx, GROUND-118); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lx, GROUND-118); ctx.lineTo(lx+22, GROUND-126); ctx.stroke();
      ctx.fillStyle='#fde68a';
      ctx.beginPath(); ctx.ellipse(lx+24, GROUND-126, 7, 5, 0, 0, 7); ctx.fill();
      const g = ctx.createRadialGradient(lx+24, GROUND-126, 4, lx+24, GROUND-126, 96);
      g.addColorStop(0,'rgba(255,224,140,.34)'); g.addColorStop(1,'rgba(255,200,90,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(lx+24, GROUND-126, 96, 0, 7); ctx.fill();
      // flaque de lumière au sol
      ctx.fillStyle='rgba(255,214,120,.12)';
      ctx.beginPath(); ctx.ellipse(lx+24, GROUND+4, 62, 11, 0, 0, 7); ctx.fill();
    }
  }

  /** Cadavres au sol et armes à ramasser. */
  function drawStreetProps(){
    if(!street) return;
    for(const c of street.corpses){
      // mare de sang qui s'élargit puis reste sur le bitume
      ctx.save(); ctx.globalAlpha=.85; ctx.fillStyle='#6b0f18';
      ctx.beginPath(); ctx.ellipse(c.x, GROUND+2, c.pool, c.pool*0.28, 0, 0, 7); ctx.fill();
      ctx.globalAlpha=.5; ctx.fillStyle='#8f1420';
      ctx.beginPath(); ctx.ellipse(c.x-6, GROUND+1, c.pool*0.6, c.pool*0.18, 0, 0, 7); ctx.fill();
      ctx.restore();
      // le corps, lui, clignote et s'estompe jusqu'à disparaître
      const a = window.ChickenStreet.corpseAlpha(c.t);
      if(a <= 0) continue;
      const fr = c.anim && c.anim.current();
      if(!fr) continue;
      const sp = fr.sprite;
      const sc = (RENDER[c.id]?.scale) || 1.75;
      ctx.save();
      ctx.translate(c.x, GROUND);
      ctx.scale(c.facing*sc, sc);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = a;
      // les coqs n'ont pas de pose couchée présentable : ils s'effacent debout
      ctx.drawImage(sp.canvas, -sp.x + fr.x, -sp.y + fr.y);
      ctx.restore();
    }
    for(const it of street.pickups){
      it.bob = Math.sin(gameFrame*0.09 + it.x)*4;
      const w = window.ChickenStreet.WEAPONS[it.w];
      ctx.save();
      const g = ctx.createRadialGradient(it.x, it.y+it.bob, 2, it.x, it.y+it.bob, 26);
      g.addColorStop(0,'rgba(255,236,150,.7)'); g.addColorStop(1,'rgba(255,210,80,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(it.x, it.y+it.bob, 26, 0, 7); ctx.fill();
      ctx.font='26px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(w.icon, it.x, it.y + it.bob);
      ctx.restore();
    }
  }

  /**
   * Skyline urbaine, en deux plans qui défilent à des vitesses différentes :
   * de grandes tours au loin, des immeubles plus bas devant.
   */
  function drawCity(scroll = 0){
    // plan lointain : les tours, hautes mais sous la lune, à peine éclairées
    cityLayer(scroll * 0.18, [186,232,158,214,244,170,222,148], 74, 22,
              'rgba(9,13,26,.95)', 'rgba(255,214,120,.16)', 1);
    // plan proche : immeubles bas, fenêtres plus vives
    cityLayer(scroll * 0.42, [70,110,52,132,88,118,64,100,76,124,58], 46, 18,
              'rgba(12,18,34,.94)', 'rgba(255,214,120,.5)', 2);
  }

  /** Une rangée d'immeubles répétée à l'infini, décalée de `off`. */
  function cityLayer(off, heights, baseW, wStep, wall, light, seed){
    const widths = heights.map((_, i) => baseW + (i % 3) * wStep + 8);
    const span = widths.reduce((s, w) => s + w, 0);
    let x = -((off % span) + span) % span;
    for(let n = 0; x < VW && n < 60; n++){
      const i = n % heights.length, w = widths[i] - 8, h = heights[i];
      ctx.fillStyle = wall;
      ctx.fillRect(x, GROUND-h, w, h);
      ctx.fillStyle = light;
      for(let wy = GROUND-h+12; wy < GROUND-14; wy += 20)
        for(let wx = x+8; wx < x+w-8; wx += 16)
          if(((Math.round(wx)*7 + wy*3 + i*seed) % 7) < 2) ctx.fillRect(wx, wy, 4, 6);
      x += widths[i];
    }
  }

  // Voitures garées le long du trottoir : couleur et longueur fixées par leur
  // position, pour qu'elles restent identiques quand on repasse devant.
  const CAR_COLORS = ['#7f1d1d','#1e3a8a','#134e4a','#3f3f46','#78350f','#4c1d95'];
  function drawParkedCars(scroll = 0){
    const SPAN = 210;
    let x = -((scroll % SPAN) + SPAN) % SPAN;
    let n = Math.floor(scroll / SPAN);
    for(; x < VW + 60; x += SPAN, n++){
      const seed = ((n % 6) + 6) % 6;
      const w = 96 + seed * 6, h = 24;
      const y = GROUND - 16;               // garées derrière le trottoir
      ctx.save();
      // carrosserie
      ctx.fillStyle = CAR_COLORS[seed];
      ctx.fillRect(x, y - h, w, h);
      ctx.fillRect(x + w*0.22, y - h - 15, w*0.52, 16);   // habitacle
      // vitres, reflet froid de la nuit
      ctx.fillStyle = 'rgba(148,178,220,.32)';
      ctx.fillRect(x + w*0.25, y - h - 11, w*0.21, 9);
      ctx.fillRect(x + w*0.52, y - h - 11, w*0.21, 9);
      // feux
      ctx.fillStyle = 'rgba(255,196,120,.85)';
      ctx.fillRect(x + w - 5, y - h + 6, 5, 5);
      ctx.fillStyle = 'rgba(220,60,60,.85)';
      ctx.fillRect(x, y - h + 6, 4, 5);
      // roues
      ctx.fillStyle = '#0b0f18';
      ctx.beginPath();
      ctx.arc(x + w*0.24, y, 8, 0, 7);
      ctx.arc(x + w*0.78, y, 8, 0, 7);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Lisibilité des coups ───────────────────────────────────────
  // Les coqs n'ont que deux ou trois images par attaque : sans effet, tout
  // ressemble à un coup de bec. On ajoute donc un sillage et un arc de coup,
  // dessinés par le moteur — indépendants du nombre d'images du personnage.
  //   a0/a1 : angles de départ et d'arrivée (radians, 0 = devant, négatif = haut)
  //   r     : rayon de l'arc            y : hauteur du centre au-dessus du sol
  const SWIPES = {
    wing:      { a0:-1.5, a1:0.7,  r:74, y:-96, color:'255,246,214', width:15, plume:true },
    kick:      { a0:-0.5, a1:0.9,  r:66, y:-66, color:'255,214,150', width:11 },
    heavy:     { a0:-1.3, a1:0.6,  r:78, y:-92, color:'255,236,190', width:16, plume:true },
    dp:        { a0:0.9,  a1:-1.5, r:70, y:-84, color:'255,226,140', width:14 },
    uppercut:  { a0:0.9,  a1:-1.5, r:70, y:-84, color:'255,226,140', width:14 },
    qcb:       { a0:-0.9, a1:1.0,  r:72, y:-74, color:'190,226,255', width:13 },
    pirouette: { a0:-0.2, a1:2.4,  r:64, y:-52, color:'255,208,160', width:12, plume:true },
    jumpkick:  { a0:-1.1, a1:0.5,  r:72, y:-74, color:'214,236,255', width:13 },
    super:     { a0:-1.6, a1:1.2,  r:92, y:-98, color:'255,208,120', width:20, plume:true }
  };

  /** Avancement dans la phase visible d'un coup, ou null hors de cette phase. */
  function swipePhase(f){
    if(f.state !== 'attack' || !f.move) return null;
    const m = f.move;
    const dur = (m.active || 3) + 4;
    const t = f.st - (m.startup || 0) + 1;
    if(t < 0 || t > dur) return null;
    return Math.max(0, Math.min(1, t / dur));
  }

  /** Arc lumineux qui suit la trajectoire du coup. */
  function drawSwipe(f){
    const cfg = SWIPES[f.move?.name];
    const p = cfg ? swipePhase(f) : null;
    if(p == null) return;
    const a = cfg.a0 + (cfg.a1 - cfg.a0) * p;
    const span = 0.85 * (1 - p * 0.35);          // la traîne se resserre
    const fade = Math.sin(Math.min(1, p * 1.15) * Math.PI);
    ctx.save();
    ctx.translate(f.x, GROUND + cfg.y);
    ctx.scale(f.facing, 1);
    ctx.lineCap = 'round';
    // trois passes : halo large, corps de l'arc, cœur clair — le coup doit se
    // lire d'un coup d'œil sur un écran de téléphone
    const pass = [[2.1, 0.20], [1, 0.60], [0.34, 0.85]];
    for(const [k, alpha] of pass){
      ctx.strokeStyle = `rgba(${cfg.color},${alpha * fade})`;
      ctx.lineWidth = cfg.width * k;
      ctx.beginPath();
      ctx.arc(0, 0, cfg.r, a - span, a, false);
      ctx.stroke();
    }
    // plumes emportées par le mouvement d'aile
    if(cfg.plume && fade > 0.3){
      ctx.fillStyle = `rgba(255,248,232,${0.5 * fade})`;
      for(let i = 0; i < 3; i++){
        const pa = a - span * (0.2 + i * 0.3);
        const pr = cfg.r + 6 + i * 5;
        ctx.beginPath();
        ctx.ellipse(Math.cos(pa) * pr, Math.sin(pa) * pr, 4.5, 2, pa, 0, 7);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Sillage : deux copies fantômes du sprite, décalées vers l'arrière. */
  function drawTrail(f){
    const p = swipePhase(f);
    if(p == null || p > 0.85) return;
    const frame = f.anim && f.anim.current();
    if(!frame) return;                 // sillage réservé aux personnages MUGEN
    const sc = f.r.scale || 1.5, s = frame.sprite;
    const box = headBoxOf(f, frame);
    const img = box ? beheaded(s.canvas, box) : s.canvas;
    for(let i = 1; i <= 2; i++){
      ctx.save();
      ctx.globalAlpha = 0.15 / i * (1 - p);
      ctx.translate(f.x - f.facing * (10 * i) * (1 - p), GROUND);
      ctx.scale(f.facing * sc, sc);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, -s.x + frame.x, -s.y + frame.y);
      if(box) drawHeadOverlay(f, frame, s, box);   // le fantôme garde sa tête
      ctx.restore();
    }
  }

  function drawFighter(f){
    if(f.r.mugen){ drawMugenFighter(f); return; }
    const r=f.r, h = r.srcH*r.scale, w = r.srcW*r.scale;
    ctx.save();
    ctx.translate(f.x, GROUND);
    ctx.scale(f.facing, 1);
    // squash/stretch selon l'état
    let sx=1, sy=1, rot=0, dy=0;
    if(f.state==='crouch'){ sy=0.72; sx=1.08; }
    if(f.state==='walk'){ dy = Math.sin(f.st*0.4)*2; }
    if(f.state==='idle'){ sy = 1 + Math.sin(f.st*0.08)*0.02; }
    if(f.state==='block'){ sx=0.92; }
    if(f.state==='attack'){ const p=f.st/(f.move.startup+ (f.move.active||0)); rot = (f.move.projectile?-0.05:0.12)*Math.sin(Math.min(1,p)*Math.PI); }
    if(f.state==='hitstun'){ rot = -0.16; }
    if(f.state==='ko'){ rot = -1.3; dy=6; }
    ctx.translate(0,dy); ctx.rotate(rot); ctx.scale(sx,sy);
    // Toutes les couches (pleine toile) sont dessinées à la MÊME position ;
    // seule l'articulation (rotation autour d'un pivot) diffère.
    const drawLayer = (src, rot=0, piv=null, dx=0, dy=0)=>{
      const im = images[src]; if(!im||!im.complete||!im.naturalWidth) return;
      ctx.save(); ctx.translate(dx,dy);
      if(rot && piv){ const px=-w/2+piv.x*w, py=-h+piv.y*h; ctx.translate(px,py); ctx.rotate(rot); ctx.translate(-px,-py); }
      ctx.drawImage(im, -w/2, -h, w, h); ctx.restore();
    };
    // rig : queue (derrière) → corps → tête (articulée)
    if(r.rigged){
      let headRot=0, headDx=0, headDy=0, tailRot=Math.sin(f.st*0.06)*0.14;
      if(f.state==='attack' && !f.move.projectile){ const p=Math.min(1,f.st/(f.move.startup+f.move.active)); headRot=-0.55*Math.sin(p*Math.PI); headDx=10*Math.sin(p*Math.PI); }
      else if(f.state==='attack' && f.move.projectile){ headRot=0.28; }
      else if(f.state==='hitstun'){ headRot=0.42; }
      else if(f.state==='idle'){ headRot=Math.sin(f.st*0.08)*0.05; }
      else if(f.state==='ko'){ headRot=0.5; }
      drawLayer(r.layers.tail, tailRot, r.tailPivot);
      drawLayer(r.layers.body);
      drawLayer(r.layers.head, headRot, r.headPivot, headDx, headDy);
    } else {
      drawLayer(r.layers.body);
    }
    // teinte de flash (touché)
    if(f.flash>0){ ctx.globalCompositeOperation='source-atop'; ctx.fillStyle='rgba(255,80,80,'+(f.flash/10)+')'; ctx.fillRect(-w/2,-h,w,h); ctx.globalCompositeOperation='source-over'; }
    ctx.restore();
  }

  /** Dessine un personnage MUGEN : sprite courant aligné sur son axe. */
  function drawMugenFighter(f){
    const frame = f.anim && f.anim.current();
    if(!frame){ return; }
    const sc = f.r.scale || 1.5;
    const s = frame.sprite, img = s.canvas;
    ctx.save();
    ctx.translate(f.x, GROUND);
    ctx.scale(f.facing * sc, sc);
    // L'axe du sprite MUGEN est son point d'ancrage au sol.
    const flipX = /h/i.test(frame.flip) ? -1 : 1;
    const flipY = /v/i.test(frame.flip) ? -1 : 1;
    if(flipX < 0 || flipY < 0) ctx.scale(flipX, flipY);
    ctx.imageSmoothingEnabled = false;
    // Teinte de dégât : on redessine le sprite en rouge par-dessus lui-même.
    // (Un fillRect en "source-atop" peindrait un rectangle sur toute la
    //  scène déjà dessinée — d'où les gros rectangles rouges.)
    const box = headBoxOf(f, frame);
    const body = box ? beheaded(img, box) : img;
    ctx.drawImage(body, -s.x + frame.x, -s.y + frame.y);
    if(box) drawHeadOverlay(f, frame, s, box);
    if(f.flash > 0){
      // La teinte est composée dans un canvas hors écran : appliquée
      // directement sur la scène, 'source-atop' peindrait un rectangle sur
      // tout le décor déjà dessiné, et ctx.filter efface le sprite.
      const tint = tintSprite(body, '#e01020');
      if(tint){
        ctx.save();
        ctx.globalAlpha = Math.min(0.5, f.flash / 14);
        ctx.drawImage(tint, -s.x + frame.x, -s.y + frame.y);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /** Boîte de la tête d'origine pour l'image courante, si le perso en a une. */
  function headBoxOf(f, frame){
    const ov = f.r.headOverlay;
    if(!ov) return null;
    const im = images[ov.img];
    if(!im || !im.complete || !im.naturalWidth) return null;
    return headAnchors[f.id]?.[frame.groupKey] || null;
  }

  // Couleurs de la tête de Kung Fu Man (indices 21-31 de sa palette).
  // Dans la boîte de la tête, on les efface : sinon son crâne dépasse de
  // l'illustration et on voit deux têtes superposées.
  const HEAD_RGB = new Set([
    [247,247,247],[165,181,222],[128,148,196],[66,99,165],[212,131,99],
    [239,189,156],[231,148,115],[189,115,90],[132,66,49],[90,90,99],[49,49,49]
  ].map(c => (c[0]<<16) | (c[1]<<8) | c[2]));

  // Un canvas décapité par sprite, calculé une fois puis réutilisé.
  const beheadedCache = new WeakMap();
  function beheaded(img, box){
    let c = beheadedCache.get(img);
    if(c) return c;
    const w = img.width, h = img.height;
    if(!w || !h) return img;
    c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently:true });
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0);
    const x0 = Math.max(0, box.x), y0 = Math.max(0, box.y);
    const x1 = Math.min(w, box.x + box.w), y1 = Math.min(h, box.y + box.h);
    if(x1 > x0 && y1 > y0){
      const d = g.getImageData(x0, y0, x1 - x0, y1 - y0);
      const p = d.data;
      for(let i = 0; i < p.length; i += 4){
        if(!p[i+3]) continue;
        if(HEAD_RGB.has((p[i]<<16) | (p[i+1]<<8) | p[i+2])) p[i+3] = 0;
      }
      g.putImageData(d, x0, y0);
    }
    beheadedCache.set(img, c);
    return c;
  }

  /**
   * Pose l'illustration de la tête de coq à la place de celle d'origine.
   * Elle est statique : elle suit simplement le sprite, sur la boîte calculée
   * hors ligne pour chaque image (voir tools/build-head-anchors.py).
   */
  function drawHeadOverlay(f, frame, s, box){
    const im = images[f.r.headOverlay.img];
    // La boîte dessinée est exactement celle qu'on vient d'effacer : rien de
    // l'ancienne tête ne peut donc rester visible autour de l'illustration.
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(im, -s.x + frame.x + box.x, -s.y + frame.y + box.y, box.w, box.h);
    ctx.restore();
  }

  // Cache des sprites teintés : un canvas hors écran par image, réutilisé.
  const tintCache = new WeakMap();
  function tintSprite(img, color){
    let c = tintCache.get(img);
    if(c) return c;
    const w = img.width, h = img.height;
    if(!w || !h) return null;
    c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';   // isolé : ne touche que ce canvas
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    tintCache.set(img, c);
    return c;
  }

  /** Œuf en vol : coquille dessinée + traînée lumineuse, bien visible. */
  function drawEgg(pr){
    if(pr.weapon && pr.weapon.id === 'pistol'){
      ctx.save();
      ctx.strokeStyle='#ffe9a8'; ctx.lineWidth=3; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(pr.x, pr.y); ctx.lineTo(pr.x - pr.vx*2.2, pr.y); ctx.stroke();
      ctx.fillStyle='#fff7d6'; ctx.beginPath(); ctx.arc(pr.x, pr.y, 3.5, 0, 7); ctx.fill();
      ctx.restore(); return;
    }
    ctx.save();
    // traînée
    ctx.globalAlpha = .35; ctx.fillStyle = '#ffd54a';
    for(let i=1;i<=4;i++){
      ctx.beginPath();
      ctx.ellipse(pr.x - pr.vx*i*1.6, pr.y, 9-i*1.4, 12-i*1.9, 0, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.translate(pr.x, pr.y); ctx.rotate(pr.rot);
    // halo
    const g = ctx.createRadialGradient(0,0,2, 0,0,22);
    g.addColorStop(0,'rgba(255,236,160,.9)'); g.addColorStop(1,'rgba(255,200,60,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,22,0,7); ctx.fill();
    // coquille
    ctx.fillStyle='#fff6e0'; ctx.strokeStyle='#c9a227'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(0,0,9,12,0,0,7); ctx.fill(); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.85)';
    ctx.beginPath(); ctx.ellipse(-3,-4,3,4.5,0,0,7); ctx.fill();
    ctx.restore();
  }

  function drawFx(){
    for(const o of fx){
      if(o.kind==='spark'){ const k=o.t/o.life; ctx.save(); ctx.globalAlpha=1-k; ctx.fillStyle=o.type==='block'?'#8ad':'#ffd54a'; ctx.beginPath(); ctx.arc(o.x,o.y,6+k*22,0,7); ctx.fill(); ctx.restore(); }
      if(o.kind==='boom'){
        const k=o.t/o.life, r=14+k*46;
        ctx.save(); ctx.globalAlpha=Math.max(0,1-k);
        const g=ctx.createRadialGradient(o.x,o.y,2,o.x,o.y,r);
        g.addColorStop(0,'rgba(255,255,240,1)');
        g.addColorStop(.4,'rgba(255,214,96,.95)');
        g.addColorStop(.75,'rgba(240,140,30,.6)');
        g.addColorStop(1,'rgba(200,80,10,0)');
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(o.x,o.y,r,0,7); ctx.fill();
        // anneau de souffle
        ctx.globalAlpha=Math.max(0,.8-k); ctx.strokeStyle='rgba(255,240,190,.9)';
        ctx.lineWidth=3; ctx.beginPath(); ctx.arc(o.x,o.y,r*0.92,0,7); ctx.stroke();
        ctx.restore();
      }
      if(o.kind==='yolk'){
        const k=o.t/o.life; ctx.save(); ctx.globalAlpha=Math.max(0,1-k*k);
        ctx.fillStyle = k<0.5 ? '#ffd54a' : '#f0a020';
        ctx.beginPath(); ctx.arc(o.x,o.y,o.r,0,7); ctx.fill(); ctx.restore();
      }
      if(o.kind==='dmg'){ const k=o.t/o.life; ctx.save(); ctx.globalAlpha=1-k; ctx.fillStyle='#fff'; ctx.font='bold 20px Fredoka,sans-serif'; ctx.textAlign='center'; ctx.fillText('-'+o.d, o.x, o.y - k*30); ctx.restore(); }
      if(o.kind==='banner'){
        const k=o.t/o.life; ctx.save(); ctx.globalAlpha=k<0.15?k/0.15:(k>0.8?(1-k)/0.2:1);
        const small = o.tone==='move', sup = o.tone==='super';
        ctx.fillStyle = o.tone==='ko'?'#ff5252': sup?'#ff3d7f': '#ffd54a';
        ctx.font = 'bold '+(small?26:sup?52:46)+'px Bangers,Fredoka,sans-serif';
        ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.lineWidth=5; ctx.strokeStyle='rgba(0,0,0,.65)';
        const y = small?VH*0.22:VH*0.42;
        ctx.strokeText(o.text,VW/2,y); ctx.fillText(o.text,VW/2,y); ctx.restore();
      }
      if(o.kind==='blood'){
        const k = o.t/o.life;
        ctx.save(); ctx.globalAlpha = Math.max(0, 1-k*k);
        ctx.fillStyle = k < 0.5 ? '#c1121f' : '#7f1020';
        ctx.beginPath(); ctx.ellipse(o.x, o.y, o.r, o.r*1.35, 0, 0, 7); ctx.fill();
        ctx.restore();
      }
      if(o.kind==='bloodscreen'){
        const k = o.t/o.life;
        ctx.save();
        ctx.globalAlpha = Math.min(0.62, (1-k)*0.9);
        const g = ctx.createRadialGradient(VW/2,VH/2,VH*0.2, VW/2,VH/2,VH*0.85);
        g.addColorStop(0,'rgba(120,0,10,0)'); g.addColorStop(1,'rgba(140,0,12,1)');
        ctx.fillStyle=g; ctx.fillRect(0,0,VW,VH);
        // coulures depuis le haut
        ctx.globalAlpha = Math.min(0.75, (1-k));
        ctx.fillStyle='#8b0011';
        for(let i=0;i<10;i++){
          const x = (i*67 + 23) % VW;
          const h = 26 + ((i*37)%54) + Math.min(70, o.t*1.6);
          ctx.fillRect(x, 0, 7, h);
          ctx.beginPath(); ctx.arc(x+3.5, h, 4.5, 0, 7); ctx.fill();
        }
        ctx.restore();
      }
      if(o.kind==='flashscreen'){
        const k=o.t/o.life; ctx.save(); ctx.globalAlpha=(1-k)*0.5;
        ctx.fillStyle=`rgb(${o.rgb[0]||255},${o.rgb[1]||255},${o.rgb[2]||255})`;
        ctx.fillRect(0,0,VW,VH); ctx.restore();
      }
      if(o.kind==='combo'){
        const k=o.t/o.life; ctx.save(); ctx.globalAlpha=1-k*k;
        const x = o.side===0? 60 : VW-60;
        ctx.fillStyle='#fff'; ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.lineWidth=4;
        ctx.font='bold 26px Bangers,Fredoka,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        const y = VH*0.46 - k*14;
        ctx.strokeText(o.n+' COMBO',x,y); ctx.fillStyle='#ffd54a'; ctx.fillText(o.n+' COMBO',x,y); ctx.restore();
      }
    }
  }

  function drawHud(){
    if(street){ drawStreetHud(); return; }
    const M = 16, W = 244, TOP = 30;      // marge haute : lisible même rogné
    // Fond du bandeau : détache le HUD du décor.
    ctx.fillStyle = 'rgba(8,3,20,.55)';
    ctx.fillRect(0, 0, VW, TOP + 46);

    bar(M, TOP, W, fighters[0], false);
    bar(VW-M-W, TOP, W, fighters[1], true);
    // timer
    ctx.fillStyle='#0d0520ee'; ctx.strokeStyle='rgba(255,213,74,.7)'; ctx.lineWidth=2;
    ctx.fillRect(VW/2-26,TOP-6,52,36); ctx.strokeRect(VW/2-26,TOP-6,52,36);
    ctx.fillStyle='#ffd54a'; ctx.font='bold 22px Fredoka,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(Math.ceil(round.timer/FPS), VW/2, TOP+12);
    // rounds gagnés
    for(let s=0;s<2;s++) for(let i=0;i<round.best;i++){
      const won = round.wins[s]>i; const x = s===0? M+6+i*15 : VW-M-6-i*15;
      ctx.fillStyle = won?'#ffd54a':'rgba(255,255,255,.22)';
      ctx.beginPath(); ctx.arc(x, TOP+34, 4.5, 0, 7); ctx.fill();
    }
    // jauges de super, explicitement étiquetées
    meter(M, TOP+42, W, fighters[0], false);
    meter(VW-M-W, TOP+42, W, fighters[1], true);
  }
  /** HUD de La Street : vie, vies restantes, vague, arme et munitions. */
  function drawStreetHud(){
    const p = fighters[0]; if(!p) return;
    ctx.fillStyle='rgba(8,3,20,.55)'; ctx.fillRect(0,0,VW,64);
    bar(16, 26, 260, p, false);
    // vies
    ctx.font='bold 13px Fredoka,sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillStyle='#ff6b6b';
    ctx.fillText('❤'.repeat(Math.min(10, street.lives)), 16, 54);
    // vague et éliminations
    ctx.textAlign='center'; ctx.fillStyle='#ffd54a';
    ctx.font='bold 17px Bangers,Fredoka,sans-serif';
    ctx.fillText(`VAGUE ${street.wave}`, VW/2, 24);
    ctx.font='bold 11px Fredoka,sans-serif'; ctx.fillStyle='rgba(255,255,255,.8)';
    ctx.fillText(`${street.killed} éliminés · ${street.mood.desc}`, VW/2, 44);
    // arme en main
    ctx.textAlign='right';
    if(p.weapon){
      ctx.font='bold 15px Fredoka,sans-serif'; ctx.fillStyle='#ffd54a';
      ctx.fillText(`${p.weapon.icon} ${p.weapon.name}  ×${p.weapon.ammo}`, VW-16, 30);
      ctx.font='9px Fredoka,sans-serif'; ctx.fillStyle='rgba(255,255,255,.7)';
      ctx.fillText('touche ŒUF pour utiliser', VW-16, 48);
    } else {
      ctx.font='10px Fredoka,sans-serif'; ctx.fillStyle='rgba(255,255,255,.5)';
      ctx.fillText('aucune arme — ramasse ce qui tombe', VW-16, 34);
    }
    if(street.banner > 0){
      const k = street.banner/90;
      ctx.save(); ctx.globalAlpha = Math.min(1, k*2);
      ctx.font='bold 40px Bangers,Fredoka,sans-serif'; ctx.textAlign='center';
      ctx.fillStyle='#ffd54a'; ctx.strokeStyle='rgba(0,0,0,.65)'; ctx.lineWidth=5;
      ctx.strokeText(`VAGUE ${street.wave}`, VW/2, VH*0.4);
      ctx.fillText(`VAGUE ${street.wave}`, VW/2, VH*0.4);
      ctx.restore();
    }
  }

  function bar(x,y,w,f,right){
    const pct = Math.max(0,f.hp/f.maxHp);
    ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(x,y,w,16);
    const bw = w*pct, bx = right? x+w-bw : x;
    const grad = ctx.createLinearGradient(x,0,x+w,0);
    if(pct>0.3){ grad.addColorStop(0,'#22c55e'); grad.addColorStop(1,'#84cc16'); } else { grad.addColorStop(0,'#f97316'); grad.addColorStop(1,'#ef4444'); }
    ctx.fillStyle=grad; ctx.fillRect(bx,y,bw,16);
    ctx.strokeStyle='rgba(255,255,255,.4)'; ctx.lineWidth=1.5; ctx.strokeRect(x,y,w,16);
    // Nom + libellé « VIE », pour distinguer clairement des deux jauges.
    ctx.font='bold 10px Fredoka,sans-serif'; ctx.textAlign=right?'right':'left'; ctx.textBaseline='middle';
    ctx.fillStyle='#fff';
    const name = (opts && (right ? opts.enemyName : opts.playerName)) || f.id.toUpperCase();
    ctx.fillText(`❤ ${name}`, right?x+w:x, y-9);
    // pourcentage de vie, dans la barre
    ctx.font='bold 9px Fredoka,sans-serif'; ctx.textAlign='center';
    ctx.fillStyle='rgba(255,255,255,.9)';
    ctx.fillText(`${Math.max(0,Math.round(pct*100))}%`, x+w/2, y+8);
  }
  /**
   * Jauge de SUPER (jauge du bas). Elle se remplit en donnant et en
   * encaissant des coups ; à 100 % elle clignote « SUPER PRÊT » et permet
   * de déclencher le coup ultime (bouton ŒUF ou ↓↘→ ↓↘→ + coup).
   * Elle est étiquetée à l'écran, faute de quoi son rôle reste obscur.
   */
  function meter(x,y,w,f,right){
    const pct = f.meter/100, bw = w*pct, bx = right ? x+w-bw : x;
    const ready = f.meter >= 100;
    ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(x,y,w,9);
    const g = ctx.createLinearGradient(x,0,x+w,0);
    if(ready){ g.addColorStop(0,'#fbbf24'); g.addColorStop(1,'#fff3c4'); }
    else { g.addColorStop(0,'#6d28d9'); g.addColorStop(1,'#a855f7'); }
    ctx.fillStyle = g; ctx.fillRect(bx,y,bw,9);
    ctx.strokeStyle='rgba(255,255,255,.28)'; ctx.lineWidth=1; ctx.strokeRect(x,y,w,9);
    // étiquette
    ctx.font='bold 8px Fredoka,sans-serif'; ctx.textBaseline='middle';
    ctx.textAlign = right ? 'right' : 'left';
    const lx = right ? x+w-3 : x+3;
    if(ready && Math.floor(gameFrame/8) % 2 === 0){
      ctx.fillStyle='#0d0520'; ctx.fillText('⚡ SUPER PRÊT !', lx, y+4.5);
    } else {
      ctx.fillStyle='rgba(255,255,255,.75)';
      ctx.fillText(`SUPER ${Math.round(f.meter)}%`, lx, y+4.5);
    }
  }

  // ══════════════ SON (léger, WebAudio) ══════════════
  let actx=null;
  function playBeep(type){
    try{ actx ||= new (window.AudioContext||window.webkitAudioContext)(); }catch{ return; }
    if(ChickenArena.muted) return;
    const o=actx.createOscillator(), g=actx.createGain(), n=actx.currentTime;
    const f = {hit:120,egg:300,boom:80,ko:70,block:200,special:420,super:660}[type]||160;
    o.type = type==='boom'||type==='hit'?'sawtooth':'triangle'; o.frequency.value=f;
    g.gain.setValueAtTime(0.0001,n); g.gain.exponentialRampToValueAtTime(0.14,n+0.01); g.gain.exponentialRampToValueAtTime(0.0001,n+0.18);
    o.connect(g).connect(actx.destination); o.start(n); o.stop(n+0.2);
  }

  // ══════════════ BOUCLE ══════════════
  function frame(ts){
    if(!running) return;
    if(!last) last = ts;
    let delta = ts - last;
    last = ts;
    // Mise en arrière-plan : requestAnimationFrame s'arrête mais le temps
    // continue. Sans plafond, tout le retard serait rejoué d'un bloc au
    // retour — d'où la salve de coups ingérable. On ignore les écarts
    // anormaux et on borne l'accumulateur.
    if(delta > 250){ delta = DT; acc = 0; ChickenArena.resetTouch(); keyState = {}; }
    acc = Math.min(acc + delta, DT * 5);
    let guard = 0;
    while(acc >= DT && guard < 5){ step(); acc -= DT; guard++; }
    render();
    raf = requestAnimationFrame(frame);
  }

  // ══════════════ API PUBLIQUE ══════════════
  const ChickenArena = {
    _touch: blankInput(), _shake:0, muted:false,
    async start(o){
      opts=o; cv=o.canvas; ctx=cv.getContext('2d');
      preload([o.playerId, o.enemyId]);
      await preloadMugen([o.playerId, o.enemyId]);
      await preloadHeadOverlay([o.playerId, o.enemyId]);
      const P = o.playerStats||{hp:200,power:1,defense:1};
      const E = o.enemyStats||{hp:200,power:1,defense:1,ai:o.aiLevel??0.4};
      fighters=[ makeFighter(o.playerId,0,P), makeFighter(o.enemyId,1,{...E, ai:E.ai}) ];
      fighters.forEach(attachCns);
      gameFrame = 0;
      projectiles=[]; fx=[]; keyState={}; this._touch=blankInput(); this._shake=0;
      round={ n:1, wins:[0,0], timer:(o.time||60)*FPS, state:'intro', stateT:0, best:o.best||2 };
      street = o.mode === 'street' ? {
        wave:1, lives:o.lives||1, corpses:[], pickups:[], killed:0,
        mood: window.ChickenStreet.moodFor(1), spawnT:0, banner:0, scroll:0
      } : null;
      if(street) await startWave();
      running=true; last=0; acc=0;
      this._kd = e=>onKey(e,true); this._ku = e=>onKey(e,false);
      window.addEventListener('keydown',this._kd); window.addEventListener('keyup',this._ku);
      // Retour au premier plan : on repart d'une horloge propre et sans
      // aucune touche restée enfoncée pendant l'absence.
      this._vis = () => {
        if(document.hidden) return;
        last = 0; acc = 0; keyState = {}; this.resetTouch();
        fighters.forEach(f => { f.buffer = []; f.cmd?.reset(); });
      };
      document.addEventListener('visibilitychange', this._vis);
      window.addEventListener('blur', () => { keyState = {}; this.resetTouch(); });
      raf=requestAnimationFrame(frame);
    },
    setTouch(k,v){ this._touch[k]=v; },
    /** Jauge de super du joueur (0-100), pour l'état du bouton ŒUF. */
    playerMeter(){ return fighters[0] ? fighters[0].meter : 0; },
    /** Crochets de test : fige l'IA, place les combattants, force un coup. */
    _test: {
      freezeAi(v){ fighters.forEach(f => f.aiFrozen = !!v); },
      place(i, x){ if(fighters[i]) fighters[i].x = x; },
      attack(i, move){ if(fighters[i]) startAttack(fighters[i], move); },
      kill(){ fighters.slice(1).forEach(f => { f.hp = 0; }); },
      boxes(i, kind){ return fighters[i] ? clsnBoxes(fighters[i], kind) : null; }
    },
    /** État interne, pour le diagnostic et les tests. */
    /** Avancée du joueur dans la rue (mode Street), en unités monde. */
    streetInfo(){
      return street ? { scroll:Math.round(street.scroll), wave:street.wave,
        lives:street.lives, killed:street.killed, corpses:street.corpses.length } : null;
    },
    debug(){
      return fighters.map(f => ({
        id:f.id, hp:Math.round(f.hp), maxHp:f.maxHp, state:f.state,
        move:f.move?.name ?? null, st:f.st, anim:f.anim?.no ?? null,
        cnsState:f.cns?.stateNo ?? null, hasCns:!!f.cns,
        hitDef:!!f.hitDef, meter:Math.round(f.meter), x:Math.round(f.x)
      }));
    },
    resetTouch(){ this._touch=blankInput(); },
    stop(){ running=false; if(raf)cancelAnimationFrame(raf); raf=null;
      window.removeEventListener('keydown',this._kd); window.removeEventListener('keyup',this._ku);
      if(this._vis) document.removeEventListener('visibilitychange', this._vis);
      keyState = {}; this.resetTouch(); }
  };
  window.ChickenArena = ChickenArena;
})();
