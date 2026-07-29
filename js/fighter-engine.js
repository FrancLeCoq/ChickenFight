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
    kfm:   { mugen:true, def:'chars/kfm/kfm.def', scale:1.75 }
  };
  const mugenCache = {};   // id → personnage chargé

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
  let cv, ctx, raf = null, acc = 0, last = 0, freezeT = 0;
  let fighters = [], projectiles = [], fx = [];
  let input = blankInput(), keyState = {};
  let round = { n:1, wins:[0,0], timer:99*FPS, state:'intro', stateT:0, best:2 };
  let opts = null, running = false, images = {};

  function blankInput(){ return { left:false,right:false,up:false,down:false,light:false,heavy:false,kick:false,special:false }; }

  // ── Chargement des images (avec cache) ──
  function loadImage(src){
    if(images[src]) return images[src];
    const im = new Image(); im.src = src; images[src] = im; return im;
  }
  function preload(ids){
    ids.forEach(id => { const r = RENDER[id]; if(r && r.layers) Object.values(r.layers).forEach(loadImage); });
  }

  /** Charge (une seule fois) les personnages au format MUGEN nécessaires. */
  async function preloadMugen(ids){
    for(const id of ids){
      const r = RENDER[id];
      if(!r || !r.mugen || mugenCache[id]) continue;
      try{ mugenCache[id] = await window.ChickenMugen.loadCharacter(r.def); }
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
      mugen: mugenCache[id] || null,
      anim: mugenCache[id] && window.ChickenMugen ? new window.ChickenMugen.Animator(mugenCache[id]) : null,
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
      Space:'special',Enter:'special' };
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
    if(round.state==='intro'){ if(round.stateT>70){ round.state='fight'; round.stateT=0; banner('COMBAT !','fight'); } return; }
    if(round.state==='ko' || round.state==='win'){ if(round.stateT>150) nextRound(); return; }
    if(round.state!=='fight') return;

    // timer
    if(round.timer>0) round.timer--;

    const p = fighters[0], e = fighters[1];
    const pin = readInput();
    const ein = aiInput(e, p);
    updateFighter(p, pin, e);
    updateFighter(e, ein, p);
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
    if(f.state==='hitstun'){ if(f.st>=f.stun){ setState(f,'idle'); } physics(f); return; }
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
      // ── 2) boutons simples ──
      if(inp.special && f.meter>=100){ startAttack(f,'super'); f.meter-=100; return; }
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
      if(inp.light||inp.heavy){ startAttack(f, inp.heavy?'wing':'peck'); return; }
      f.vx = fwd ? WALK*0.8*f.facing : back ? -WALK*0.8*f.facing : f.vx*0.98;
      setState(f, f.vy<0?'jump':'fall');
    }
    physics(f);
  }

  function startAttack(f, moveName){
    f.state='attack'; f.st=0; f.move=MOVES[moveName]; f.hitDone=false; f.hitCount=0;
    if(f.move.projectile){ f.spawned=false; }
    if(f.move.invuln) f.invuln = f.move.invuln;
    if(f.move.label) banner(f.move.label, f.move.super?'super':'move');
    if(f.move.super){ freeze(f.move.freeze||30); playBeep('super'); }
    else if(f.move.special) playBeep('special');
  }
  function runAttack(f, opp){
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
    popDamage(def.x, GROUND-120, dmg);
    if(isFinal && att.combo>=2) popCombo(att);
  }

  function setState(f, s){ if(f.state!==s){ f.state=s; f.st=0; } }

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
    const no = mugenAnimFor(f);
    // une attaque relance son animation depuis le début
    const restart = f.state==='attack' && f.st<=1;
    f.anim.play(no, restart);
    f.anim.tick();
  }

  function physics(f){
    f.x += f.vx; f.y += f.vy;
    if(!f.onGround){ f.vy += GRAVITY; if(f.y>=GROUND){ f.y=GROUND; f.vy=0; f.onGround=true; if(f.state==='fall'||f.state==='jump') setState(f,'idle'); } }
    f.x = Math.max(WALL, Math.min(VW-WALL, f.x));
  }

  function resolvePush(a, b){
    const dx = b.x - a.x, min = PUSH*2;
    if(Math.abs(dx) < min){
      const overlap = (min - Math.abs(dx))/2, dir = dx>=0?1:-1;
      a.x -= overlap*dir; b.x += overlap*dir;
      a.x = Math.max(WALL, Math.min(VW-WALL,a.x)); b.x = Math.max(WALL, Math.min(VW-WALL,b.x));
    }
  }

  // ── boîtes ──
  function hurtbox(f){ return { x:f.x-26, y:GROUND-130, w:52, h:130 }; }
  function hitboxWorld(f, box){ return { x: f.x + (f.facing>0?box.x:-box.x-box.w), y: GROUND+box.y, w:box.w, h:box.h }; }
  function overlap(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }

  // ── projectiles (œuf) ──
  function spawnEgg(f){ projectiles.push({ x:f.x+30*f.facing, y:GROUND-78, vx:6.2*f.facing, owner:f, life:120, rot:0 }); playBeep('egg'); }
  function updateProjectiles(){
    for(const pr of projectiles){
      pr.x += pr.vx; pr.rot += 0.4; pr.life--;
      const target = fighters.find(f => f!==pr.owner);
      if(target && overlap({x:pr.x-12,y:pr.y-12,w:24,h:24}, hurtbox(target))){
        eggBoom(pr.x, pr.y); const blocking = target.state==='block'||target.blockHold;
        const dmg = blocking?4:Math.round(28*pr.owner.power/target.defense);
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
    if(round.state!=='fight' || e.state==='ko' || e.state==='hitstun' || e.state==='attack') return out;
    e.aiT--;
    const dist = Math.abs(p.x - e.x), toward = p.x>e.x?'right':'left', away = p.x>e.x?'left':'right';
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

  // ══════════════ ROUNDS ══════════════
  function koFighter(loser, winner){
    setState(loser,'ko'); loser.vx = 5*(-loser.facing); loser.vy=-6; loser.onGround=false;
    round.state='ko'; round.stateT=0; const wi = winner.side; round.wins[wi]++;
    banner(loser.side===0?'K.O. !':'K.O. !','ko'); shake(16); playBeep('ko');
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
  function popCombo(f){ fx.push({kind:'combo',side:f.side,n:f.combo,t:0,life:50}); }
  // Gel cinématique au déclenchement d'un super (hitstop global).
  function freeze(frames){ freezeT = Math.max(freezeT, frames); }
  function spawnSpark(x,y,type){ fx.push({kind:'spark',x,y,type,t:0,life:14}); if(type==='hit')playBeep('hit'); }
  function eggBoom(x,y){ fx.push({kind:'boom',x,y,t:0,life:26}); playBeep('boom'); }
  function popDamage(x,y,d){ fx.push({kind:'dmg',x,y,d,t:0,life:40}); }
  function shake(p){ ChickenArena._shake = Math.max(ChickenArena._shake, p); }
  function updateFx(){ fx.forEach(o=>o.t++); fx = fx.filter(o=>o.t<o.life); ChickenArena._shake*=0.86; }

  // ══════════════ RENDER ══════════════
  function render(){
    const sx = (Math.random()-0.5)*ChickenArena._shake, sy=(Math.random()-0.5)*ChickenArena._shake;
    ctx.setTransform(cv.width/VW,0,0,cv.height/VH, sx, sy);
    drawStage();
    // ombres
    fighters.forEach(f=>{ ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(f.x, GROUND+4, 40, 9, 0,0,7); ctx.fill(); });
    // combattants (le plus en arrière derrière)
    [...fighters].sort((a,b)=>a.y-b.y).forEach(drawFighter);
    projectiles.forEach(drawEgg);
    drawFx();
    drawHud();
  }

  function drawStage(){
    const g = ctx.createLinearGradient(0,0,0,VH);
    g.addColorStop(0,'#3a2568'); g.addColorStop(0.62,'#4a2f7a'); g.addColorStop(0.62,'#6b4423'); g.addColorStop(1,'#3d2712');
    ctx.fillStyle=g; ctx.fillRect(0,0,VW,VH);
    // foule
    ctx.fillStyle='rgba(255,255,255,.06)'; ctx.fillRect(0,VH*0.32,VW,18);
    // sol
    ctx.fillStyle='#7a4a22'; ctx.fillRect(0,GROUND,VW,VH-GROUND);
    ctx.strokeStyle='rgba(255,213,74,.25)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,GROUND); ctx.lineTo(VW,GROUND); ctx.stroke();
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
    ctx.drawImage(img, -s.x + frame.x, -s.y + frame.y);
    if(f.flash>0){
      ctx.globalCompositeOperation='source-atop';
      ctx.fillStyle='rgba(255,90,90,'+(f.flash/12)+')';
      ctx.fillRect(-s.x + frame.x, -s.y + frame.y, img.width, img.height);
      ctx.globalCompositeOperation='source-over';
    }
    ctx.restore();
  }

  function drawEgg(pr){ ctx.save(); ctx.translate(pr.x,pr.y); ctx.rotate(pr.rot); ctx.font='22px serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('🥚',0,0); ctx.restore(); }

  function drawFx(){
    for(const o of fx){
      if(o.kind==='spark'){ const k=o.t/o.life; ctx.save(); ctx.globalAlpha=1-k; ctx.fillStyle=o.type==='block'?'#8ad':'#ffd54a'; ctx.beginPath(); ctx.arc(o.x,o.y,6+k*22,0,7); ctx.fill(); ctx.restore(); }
      if(o.kind==='boom'){ const k=o.t/o.life; ctx.save(); ctx.globalAlpha=1-k; ctx.font=(30+k*36)+'px serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('💥',o.x,o.y); ctx.restore(); }
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
      if(o.kind==='combo'){
        const k=o.t/o.life; ctx.save(); ctx.globalAlpha=1-k*k;
        const x = o.side===0? 60 : VW-60;
        ctx.fillStyle='#fff'; ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.lineWidth=4;
        ctx.font='bold 30px Bangers,Fredoka,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        const y = VH*0.30 - k*14;
        ctx.strokeText(o.n+' COMBO',x,y); ctx.fillStyle='#ffd54a'; ctx.fillText(o.n+' COMBO',x,y); ctx.restore();
      }
    }
  }

  function drawHud(){
    // barres de vie style arcade en haut
    bar(20, 18, 250, fighters[0], false);
    bar(VW-20-250, 18, 250, fighters[1], true);
    // timer
    ctx.fillStyle='#0d0520cc'; ctx.strokeStyle='rgba(255,213,74,.6)'; ctx.lineWidth=2;
    ctx.fillRect(VW/2-26,14,52,34); ctx.strokeRect(VW/2-26,14,52,34);
    ctx.fillStyle='#ffd54a'; ctx.font='bold 22px Fredoka,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(Math.ceil(round.timer/FPS), VW/2, 33);
    // rounds gagnés
    for(let s=0;s<2;s++) for(let i=0;i<round.best;i++){
      const won = round.wins[s]>i; const x = s===0? 20+i*16 : VW-20-i*16;
      ctx.fillStyle = won?'#ffd54a':'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.arc(x,52,5,0,7); ctx.fill();
    }
    // jauge super
    meter(20, 60, 250, fighters[0], false); meter(VW-20-250, 60, 250, fighters[1], true);
  }
  function bar(x,y,w,f,right){
    const pct = Math.max(0,f.hp/f.maxHp);
    ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(x,y,w,16);
    const bw = w*pct, bx = right? x+w-bw : x;
    const grad = ctx.createLinearGradient(x,0,x+w,0);
    if(pct>0.3){ grad.addColorStop(0,'#22c55e'); grad.addColorStop(1,'#84cc16'); } else { grad.addColorStop(0,'#f97316'); grad.addColorStop(1,'#ef4444'); }
    ctx.fillStyle=grad; ctx.fillRect(bx,y,bw,16);
    ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1.5; ctx.strokeRect(x,y,w,16);
    ctx.fillStyle='#fff'; ctx.font='11px Fredoka,sans-serif'; ctx.textAlign=right?'right':'left'; ctx.textBaseline='middle';
    ctx.fillText(f.id.toUpperCase(), right?x+w:x, y-8);
  }
  function meter(x,y,w,f,right){
    const pct=f.meter/100, bw=w*pct, bx=right?x+w-bw:x;
    ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(x,y,w,7);
    ctx.fillStyle = f.meter>=100?'#ffd54a':'#7c3aed'; ctx.fillRect(bx,y,bw,7);
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
    if(!last) last=ts; acc += ts-last; last=ts;
    let guard=0;
    while(acc>=DT && guard<5){ step(); acc-=DT; guard++; }
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
      const P = o.playerStats||{hp:200,power:1,defense:1};
      const E = o.enemyStats||{hp:200,power:1,defense:1,ai:o.aiLevel??0.4};
      fighters=[ makeFighter(o.playerId,0,P), makeFighter(o.enemyId,1,{...E, ai:E.ai}) ];
      projectiles=[]; fx=[]; keyState={}; this._touch=blankInput(); this._shake=0;
      round={ n:1, wins:[0,0], timer:(o.time||60)*FPS, state:'intro', stateT:0, best:o.best||2 };
      running=true; last=0; acc=0;
      this._kd = e=>onKey(e,true); this._ku = e=>onKey(e,false);
      window.addEventListener('keydown',this._kd); window.addEventListener('keyup',this._ku);
      raf=requestAnimationFrame(frame);
    },
    setTouch(k,v){ this._touch[k]=v; },
    resetTouch(){ this._touch=blankInput(); },
    stop(){ running=false; if(raf)cancelAnimationFrame(raf); raf=null; window.removeEventListener('keydown',this._kd); window.removeEventListener('keyup',this._ku); }
  };
  window.ChickenArena = ChickenArena;
})();
