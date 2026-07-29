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
    roi:   { rigged:false, srcW:660, srcH:900, scale:0.215, layers:{ body:'assets/roi.webp' } }
  };

  // ── Frame data des coups (frames @60fps) ──
  // reach/box en unités monde, relatifs au combattant (devant = +x*facing).
  const MOVES = {
    peck:  { name:'peck',  startup:4,  active:3,  recovery:9,  dmg:6,  meter:8,
             hit:{x:34,y:-70,w:40,h:26}, kb:4.5, hitstun:14, blockstun:8, push:5 },
    wing:  { name:'wing',  startup:8,  active:4,  recovery:18, dmg:12, meter:6,
             hit:{x:30,y:-92,w:56,h:52}, kb:7,   hitstun:18, blockstun:11, push:7, launch:false },
    kick:  { name:'kick',  startup:6,  active:4,  recovery:14, dmg:9,  meter:7,
             hit:{x:36,y:-34,w:48,h:26}, kb:6,   hitstun:16, blockstun:10, push:6, low:true },
    egg:   { name:'egg',   startup:10, active:2,  recovery:24, dmg:0,  meter:0, projectile:true }
  };

  // ── État module ──
  let cv, ctx, raf = null, acc = 0, last = 0;
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
    ids.forEach(id => { const r = RENDER[id]; if(r) Object.values(r.layers).forEach(loadImage); });
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
      flash:0
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
    f.facing = (opp.x >= f.x) ? 1 : -1;   // fait toujours face à l'adversaire (au sol)

    const prevDir = f.buffer.length?f.buffer[f.buffer.length-1].d:5;
    pushBuffer(f, inp, prevDir);

    // états qui verrouillent le contrôle
    if(f.state==='ko'){ physics(f); return; }
    if(f.state==='hitstun'){ if(f.st>=f.stun){ setState(f,'idle'); } physics(f); return; }
    if(f.state==='attack'){ runAttack(f, opp); physics(f); return; }

    // au sol : garde / accroupi / marche / saut / attaques
    f.blockHold = false;
    const fwd = f.facing>0?inp.right:inp.left;
    const back = f.facing>0?inp.left:inp.right;

    if(f.onGround){
      // attaques (priorité)
      if(inp.special && f.meter>=100){ startAttack(f,'egg'); f.meter=0; return; }
      if(inp.special && hasQCF(f) && f.meter>=30){ startAttack(f,'egg'); f.meter-=30; return; }
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
    f.state='attack'; f.st=0; f.move=MOVES[moveName]; f.hitDone=false;
    if(f.move.projectile){ f.spawned=false; }
  }
  function runAttack(f, opp){
    const m = f.move;
    if(m.projectile){
      if(f.st===m.startup && !f.spawned){ spawnEgg(f); f.spawned=true; }
    } else {
      const activeStart = m.startup, activeEnd = m.startup+m.active;
      if(f.st>=activeStart && f.st<activeEnd && !f.hitDone){
        const hb = hitboxWorld(f, m.hit);
        if(overlap(hb, hurtbox(opp))){ applyHit(f, opp, m); f.hitDone=true; }
      }
    }
    if(f.st >= m.startup + (m.active||0) + m.recovery){ setState(f,'idle'); f.move=null; }
    f.vx *= 0.8;
  }

  function applyHit(att, def, m){
    // garde : le défenseur recule et n'attaque pas → chip minimal
    const blocking = def.state==='block' || def.blockHold;
    spawnSpark((def.x + att.x)/2, GROUND - 70, blocking?'block':'hit');
    if(blocking){
      def.vx = 0.6*m.push*(-def.facing); def.stun = m.blockstun; setState(def,'hitstun');
      def.hp -= Math.max(0, Math.round(m.dmg*0.12*(1/def.defense)));
      shake(4); return;
    }
    const dmg = Math.max(1, Math.round(m.dmg * att.power / def.defense));
    def.hp -= dmg; def.flash = 6;
    def.vx = m.kb*(-def.facing); def.vy = m.launch?-8:0; if(m.launch) def.onGround=false;
    def.stun = m.hitstun; setState(def,'hitstun'); def.buffer=[];
    att.meter = Math.min(100, att.meter + m.meter);
    def.meter = Math.min(100, def.meter + Math.round(m.meter*0.4));
    shake(m.dmg>=10?9:5);
    popDamage(def.x, GROUND-120, dmg);
  }

  function setState(f, s){ if(f.state!==s){ f.state=s; f.st=0; } }

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
  function banner(text,tone){ fx.push({kind:'banner',text,tone,t:0,life:70}); }
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

  function drawEgg(pr){ ctx.save(); ctx.translate(pr.x,pr.y); ctx.rotate(pr.rot); ctx.font='22px serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('🥚',0,0); ctx.restore(); }

  function drawFx(){
    for(const o of fx){
      if(o.kind==='spark'){ const k=o.t/o.life; ctx.save(); ctx.globalAlpha=1-k; ctx.fillStyle=o.type==='block'?'#8ad':'#ffd54a'; ctx.beginPath(); ctx.arc(o.x,o.y,6+k*22,0,7); ctx.fill(); ctx.restore(); }
      if(o.kind==='boom'){ const k=o.t/o.life; ctx.save(); ctx.globalAlpha=1-k; ctx.font=(30+k*36)+'px serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('💥',o.x,o.y); ctx.restore(); }
      if(o.kind==='dmg'){ const k=o.t/o.life; ctx.save(); ctx.globalAlpha=1-k; ctx.fillStyle='#fff'; ctx.font='bold 20px Fredoka,sans-serif'; ctx.textAlign='center'; ctx.fillText('-'+o.d, o.x, o.y - k*30); ctx.restore(); }
      if(o.kind==='banner'){ const k=o.t/o.life; ctx.save(); ctx.globalAlpha=k<0.15?k/0.15:(k>0.8?(1-k)/0.2:1); ctx.fillStyle=o.tone==='ko'?'#ff5252':'#ffd54a'; ctx.font='bold 46px Bangers,Fredoka,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.lineWidth=5; ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.strokeText(o.text,VW/2,VH*0.42); ctx.fillText(o.text,VW/2,VH*0.42); ctx.restore(); }
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
    const f = {hit:120,egg:300,boom:80,ko:70,block:200}[type]||160;
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
    start(o){
      opts=o; cv=o.canvas; ctx=cv.getContext('2d');
      preload([o.playerId, o.enemyId]);
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
