/* ══════════════════════════════════════════════════════════════
   ChickenCns — interpréteur d'états M.U.G.E.N / Ikemen GO
   ---------------------------------------------------------------
   Exécute les fichiers .CNS : c'est ce qui donne à un personnage ses
   VRAIS coups, sa vraie frame data et ses vrais enchaînements.

   Structure d'un .CNS :
     [Statedef 200]                  ← un état (ici : coup de poing debout)
     type = S  movetype = A  anim = 200  ctrl = 0
     [State 200, 1]                  ← un contrôleur dans cet état
     type = HitDef                   ← ce qu'il fait
     trigger1 = AnimElem = 3         ← quand il le fait
     damage = 23, 0  ...             ← ses paramètres

   Sémantique des déclencheurs (fidèle à MUGEN) :
     • triggerall  : doit être vrai, sinon le contrôleur est ignoré
     • trigger1, trigger2, …  : groupes en OU
     • plusieurs lignes d'un même groupe : ET

   Couverture : les contrôleurs et déclencheurs les plus courants
   (voir SUPPORTED plus bas). Tout ce qui n'est pas reconnu est ignoré
   sans bloquer l'exécution — le personnage continue de fonctionner.
   ══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  // ─────────── Parsing du .CNS ───────────
  /**
   * Découpe un fichier CNS en états.
   * → { 200: { attrs:{...}, controllers:[ {type, triggers, params} ] } }
   */
  function parseCns(text){
    const states = {};
    let cur = null, ctrl = null;

    for(let raw of text.split(/\r?\n/)){
      const line = raw.replace(/;.*$/, '').trim();
      if(!line) continue;

      const sd = line.match(/^\[\s*Statedef\s+(-?\d+)\s*\]/i);
      if(sd){
        cur = { no:Number(sd[1]), attrs:{}, controllers:[] };
        states[cur.no] = cur; ctrl = null; continue;
      }
      const st = line.match(/^\[\s*State\s+.*\]/i);
      if(st){
        if(!cur) continue;
        ctrl = { type:null, triggers:{}, params:{} };
        cur.controllers.push(ctrl); continue;
      }
      if(/^\[/.test(line)){ cur = null; ctrl = null; continue; }

      const eq = line.indexOf('=');
      if(eq < 0) continue;
      const key = line.slice(0, eq).trim().toLowerCase();
      const val = line.slice(eq + 1).trim();

      if(ctrl){
        if(key === 'type') ctrl.type = val.toLowerCase();
        else if(key === 'triggerall') (ctrl.triggers.all ||= []).push(val);
        else if(/^trigger(\d+)$/.test(key)){
          const n = key.match(/^trigger(\d+)$/)[1];
          (ctrl.triggers[n] ||= []).push(val);
        }
        else ctrl.params[key] = val;
      } else if(cur){
        cur.attrs[key] = val;
      }
    }
    return states;
  }

  // ─────────── Évaluateur d'expressions de déclenchement ───────────
  // Sous-ensemble suffisant pour les personnages courants.
  const TOKEN = /\s*(>=|<=|!=|&&|\|\||[-+*/%(),<>=!]|[A-Za-z_][\w.]*|\d*\.?\d+|"[^"]*")/y;

  function tokenize(src){
    const out = []; TOKEN.lastIndex = 0;
    let m, guard = 0;
    while(TOKEN.lastIndex < src.length && guard++ < 500){
      m = TOKEN.exec(src);
      if(!m) break;
      out.push(m[1]);
    }
    return out;
  }

  /** Évalue une expression de déclenchement dans un contexte donné. */
  function evalTrigger(expr, ctx){
    try{
      const toks = tokenize(expr);
      let i = 0;
      const peek = () => toks[i];
      const next = () => toks[i++];

      function parseOr(){
        let v = parseAnd();
        while(peek() === '||'){ next(); const r = parseAnd(); v = (v || r); }
        return v;
      }
      function parseAnd(){
        let v = parseCmp();
        while(peek() === '&&'){ next(); const r = parseCmp(); v = (v && r); }
        return v;
      }
      function parseCmp(){
        let l = parseAdd();
        while(['=','!=','<','>','<=','>='].includes(peek())){
          const op = next();
          const r = parseAdd();
          // MUGEN autorise "AnimElem = 3, >=1" — on ignore la partie après virgule
          switch(op){
            case '=':  l = eqLoose(l, r); break;
            case '!=': l = !eqLoose(l, r); break;
            case '<':  l = num(l) <  num(r); break;
            case '>':  l = num(l) >  num(r); break;
            case '<=': l = num(l) <= num(r); break;
            case '>=': l = num(l) >= num(r); break;
          }
        }
        return l;
      }
      function parseAdd(){
        let v = parseMul();
        while(peek() === '+' || peek() === '-'){
          const op = next(); const r = parseMul();
          v = op === '+' ? num(v) + num(r) : num(v) - num(r);
        }
        return v;
      }
      function parseMul(){
        let v = parseUnary();
        while(peek() === '*' || peek() === '/' || peek() === '%'){
          const op = next(); const r = parseUnary();
          v = op === '*' ? num(v)*num(r) : op === '/' ? num(v)/(num(r)||1) : num(v)%(num(r)||1);
        }
        return v;
      }
      function parseUnary(){
        if(peek() === '-'){ next(); return -num(parseUnary()); }
        if(peek() === '!'){ next(); return !truthy(parseUnary()); }
        return parsePrimary();
      }
      function parsePrimary(){
        const t = next();
        if(t === undefined) return 0;
        if(t === '('){ const v = parseOr(); if(peek() === ')') next(); return v; }
        if(/^"/.test(t)) return t.slice(1, -1);
        if(/^\d*\.?\d+$/.test(t)) return parseFloat(t);
        // identifiant / redirection / appel
        let name = t.toLowerCase();
        // arguments entre parenthèses : Command = "x", Random, AnimElem(2)
        let arg = null;
        if(peek() === '('){ next(); arg = parseOr(); if(peek() === ')') next(); }
        // accès composé : "Vel X", "Pos Y", "P2BodyDist X"
        if(peek() && /^[A-Za-z]$/.test(peek()) && ['vel','pos','p2bodydist','p2dist','parentdist','screenpos'].includes(name)){
          name += ' ' + next().toLowerCase();
        }
        return resolve(name, arg, ctx);
      }
      // on ignore la queue éventuelle après une virgule (", >=1")
      const v = parseOr();
      return truthy(v);
    }catch{ return false; }
  }

  const num = v => typeof v === 'number' ? v : (v === true ? 1 : v === false ? 0 : parseFloat(v) || 0);
  const truthy = v => typeof v === 'boolean' ? v : num(v) !== 0;
  function eqLoose(a, b){
    if(typeof a === 'string' || typeof b === 'string') return String(a).toLowerCase() === String(b).toLowerCase();
    return num(a) === num(b);
  }

  /** Résout un nom de déclencheur dans le contexte du combattant. */
  function resolve(name, arg, ctx){
    switch(name){
      case 'time':          return ctx.time;
      case 'stateno':       return ctx.stateNo;
      case 'prevstateno':   return ctx.prevStateNo;
      case 'anim':          return ctx.anim;
      case 'animtime':      return ctx.animTime;      // négatif, 0 à la fin
      case 'animelem':      return ctx.animElem;      // index de frame (base 1)
      case 'animelemtime':  return ctx.animElemTime;
      case 'ctrl':          return ctx.ctrl ? 1 : 0;
      case 'alive':         return ctx.alive ? 1 : 0;
      case 'life':          return ctx.life;
      case 'power':         return ctx.power;
      case 'movecontact':   return ctx.moveContact;
      case 'movehit':       return ctx.moveHit;
      case 'moveguarded':   return ctx.moveGuarded;
      case 'movetype':      return ctx.moveType;
      case 'statetype':     return ctx.stateType;
      // Sans argument, "Command" vaut le nom de la commande détectée cette
      // frame, ce qui permet la comparaison `Command = "qcf_x"`.
      case 'command':       return arg == null ? (ctx.currentCommand || '') : ctx.command(arg);
      case 'random':        return Math.floor(Math.random()*1000);
      case 'roundstate':    return ctx.roundState;
      case 'numenemy':      return 1;
      case 'numexplod':     return 0;
      case 'numhelper':     return 0;
      case 'numproj':       return ctx.numProj || 0;
      case 'numtarget':     return ctx.numTarget || 0;
      case 'hitshakeover':  return ctx.hitShakeOver ? 1 : 0;
      case 'hitover':       return ctx.hitOver ? 1 : 0;
      case 'hitfall':       return ctx.hitFall ? 1 : 0;
      case 'canrecover':    return 1;
      case 'vel x':         return ctx.velX;
      case 'vel y':         return ctx.velY;
      case 'pos x':         return ctx.posX;
      case 'pos y':         return ctx.posY;
      case 'p2bodydist x':  return ctx.p2dist;
      case 'p2dist x':      return ctx.p2dist;
      case 'p2statetype':   return ctx.p2StateType;
      case 'facing':        return ctx.facing;
      case 'stateno!':      return ctx.stateNo;
      case 'const':         return 0;
      case 'gametime':      return ctx.gameTime;
      case 'ishelper':      return 0;
      case 'var':           return ctx.getVar(num(arg));
      case 'fvar':          return ctx.getFVar(num(arg));
      case 'sysvar':        return ctx.getVar(100 + num(arg));
      case 'inguarddist':   return ctx.inGuardDist ? 1 : 0;
      case 'true':          return 1;
      case 'false':         return 0;
      // Les littéraux d'état (S, C, A, L, H, I, NA, SA…) se comparent en
      // texte : `StateType = S`, `MoveType = A`. On renvoie donc le nom tel
      // quel ; tout autre inconnu vaudra 0 une fois converti en nombre.
      default:              return name;
    }
  }

  /** Un contrôleur se déclenche-t-il ? (triggerall ET (trigger1 OU trigger2 …)) */
  function triggersPass(triggers, ctx){
    if(triggers.all && !triggers.all.every(e => evalTrigger(e, ctx))) return false;
    const groups = Object.keys(triggers).filter(k => k !== 'all');
    if(!groups.length) return !!triggers.all;
    return groups.some(g => triggers[g].every(e => evalTrigger(e, ctx)));
  }

  // Contrôleurs pris en charge (les autres sont ignorés silencieusement).
  const SUPPORTED = new Set([
    'changestate','selfstate','changeanim','changeanim2','velset','veladd','velmul',
    'posset','posadd','ctrlset','hitdef','poweradd','statetypeset','turn',
    'playsnd','varset','varadd','attackdist','width','sprpriority','afterimage',
    'explod','removeexplod','nothitby','hitby','screenbound','destroyself','projectile',
    // ── contrôleurs additionnels ──
    'palfx','allpalfx','bgpalfx','afterimagetime','envshake','envcolor',
    'targetbind','bindtoparent','bindtoroot','targetstate','targetveladd','targetvelset',
    'targetlifeadd','targetpoweradd','targetdrop','hitoverride','reversaldef',
    'lifeadd','lifeset','poweset','powerset','hitadd','hitfalldamage','hitfallvel',
    'hitfallset','fallenvshake','makedust','gamemakeanim','pause','superpause',
    'assertspecial','sndpan','stopsnd','removeexplod','angledraw','angleset',
    'angleadd','anglemul','defencemulset','attackmulset','forcefeedback','null'
  ]);

  // Découpe "a, b, c" en nombres.
  const nums = (s, d=0) => String(s ?? '').split(',').map(x => { const v = parseFloat(x); return isNaN(v) ? d : v; });

  /**
   * Machine d'états CNS attachée à un combattant.
   * `host` fournit l'accès au moteur (voir fighter-engine.js).
   */
  class CnsRuntime {
    constructor(states, host){
      this.states = states;
      this.host = host;
      this.stateNo = 0; this.prevStateNo = 0;
      this.time = 0;
      this.vars = {}; this.fvars = {};
      this.pendingHit = null;
      this.changed = false;
    }

    changeState(no, ctrlVal){
      const s = this.states[no];
      this.prevStateNo = this.stateNo;
      this.stateNo = no;
      this.time = 0;
      this.changed = true;
      if(!s) return;
      const a = s.attrs;
      if(a.anim !== undefined) this.host.setAnim(parseInt(a.anim, 10));
      if(a.velset !== undefined){ const v = nums(a.velset); this.host.setVel(v[0], v[1]); }
      if(a.ctrl !== undefined) this.host.setCtrl(num(a.ctrl) !== 0);
      if(ctrlVal !== undefined) this.host.setCtrl(ctrlVal);
      if(a.poweradd !== undefined) this.host.addPower(num(a.poweradd));
      if(a.type) this.host.setStateType(a.type.trim().toUpperCase());
      if(a.movetype) this.host.setMoveType(a.movetype.trim().toUpperCase());
      if(a.physics) this.host.setPhysics(a.physics.trim().toUpperCase());
      if(a.juggle !== undefined) this.host.setJuggle(num(a.juggle));
    }

    /** Exécute les contrôleurs de l'état courant pour cette frame. */
    update(ctx){
      const guard = 8;                       // évite les boucles d'états infinies
      for(let pass = 0; pass < guard; pass++){
        this.changed = false;
        const s = this.states[this.stateNo];
        if(!s) break;
        ctx.stateNo = this.stateNo;
        ctx.prevStateNo = this.prevStateNo;
        ctx.time = this.time;
        ctx.getVar = i => this.vars[i] || 0;
        ctx.getFVar = i => this.fvars[i] || 0;

        for(const c of s.controllers){
          if(!c.type || !SUPPORTED.has(c.type)) continue;
          if(!triggersPass(c.triggers, ctx)) continue;
          this.exec(c, ctx);
          if(this.changed) break;            // l'état a changé → on repart
        }
        if(!this.changed) break;
      }
      this.time++;
    }

    exec(c, ctx){
      const p = c.params, h = this.host;
      switch(c.type){
        case 'changestate':
        case 'selfstate': {
          const v = parseInt(p.value, 10);
          if(!isNaN(v)) this.changeState(v, p.ctrl !== undefined ? num(p.ctrl) !== 0 : undefined);
          break;
        }
        case 'changeanim':
        case 'changeanim2': {
          const v = parseInt(p.value, 10);
          if(!isNaN(v)) h.setAnim(v, p.elem ? parseInt(p.elem,10) : 0);
          break;
        }
        case 'velset':  { const v = nums(p.x !== undefined ? `${p.x},${p.y ?? ''}` : p.value); h.setVel(p.x !== undefined ? num(p.x) : v[0], p.y !== undefined ? num(p.y) : v[1]); break; }
        case 'veladd':  { h.addVel(num(p.x)||0, num(p.y)||0); break; }
        case 'velmul':  { h.mulVel(p.x !== undefined ? num(p.x) : 1, p.y !== undefined ? num(p.y) : 1); break; }
        case 'posset':  { h.setPos(p.x !== undefined ? num(p.x) : null, p.y !== undefined ? num(p.y) : null); break; }
        case 'posadd':  { h.addPos(num(p.x)||0, num(p.y)||0); break; }
        case 'ctrlset': { h.setCtrl(num(p.value) !== 0); break; }
        case 'poweradd':{ h.addPower(num(p.value)); break; }
        case 'turn':    { h.turn(); break; }
        case 'statetypeset': {
          if(p.statetype) h.setStateType(String(p.statetype).trim().toUpperCase());
          if(p.movetype)  h.setMoveType(String(p.movetype).trim().toUpperCase());
          if(p.physics)   h.setPhysics(String(p.physics).trim().toUpperCase());
          break;
        }
        case 'varset':  { const i = parseInt(p.v ?? p.value, 10); if(!isNaN(i)) this.vars[i] = num(p.value); break; }
        case 'varadd':  { const i = parseInt(p.v ?? p.value, 10); if(!isNaN(i)) this.vars[i] = (this.vars[i]||0) + num(p.value); break; }
        case 'attackdist': { h.setAttackDist(num(p.value)); break; }
        case 'sprpriority': break;
        case 'playsnd': h.playSound(); break;
        case 'hitdef':  h.setHitDef(buildHitDef(p)); break;
        // ── effets visuels et de scène ──
        case 'palfx':
        case 'allpalfx': {
          const add = nums(p.add, 0), mul = nums(p.mul, 256);
          h.palFx?.({ time:num(p.time)||10, add, mul,
                      invert: /1|true/i.test(String(p.invertall ?? '')) });
          break;
        }
        case 'envshake':     h.envShake?.(num(p.time)||8, num(p.ampl)||10); break;
        case 'envcolor':     h.envColor?.(nums(p.value,255), num(p.time)||1); break;
        case 'superpause':
        case 'pause':        h.pause?.(num(p.time)||30); break;
        case 'makedust':     h.dust?.(nums(p.pos,0)); break;
        case 'afterimage':
        case 'afterimagetime': h.afterImage?.(num(p.time ?? p.value) || 10); break;
        // ── effets sur l'adversaire ciblé ──
        case 'targetlifeadd':  h.targetLife?.(num(p.value)); break;
        case 'targetpoweradd': h.targetPower?.(num(p.value)); break;
        case 'targetveladd':   h.targetVel?.(num(p.x)||0, num(p.y)||0, true); break;
        case 'targetvelset':   h.targetVel?.(num(p.x)||0, num(p.y)||0, false); break;
        case 'targetstate':    h.targetState?.(parseInt(p.value,10)); break;
        case 'targetbind':     h.targetBind?.(num(p.time)||1, nums(p.pos,0)); break;
        case 'targetdrop':     h.targetDrop?.(); break;
        // ── vie, jauge, multiplicateurs ──
        case 'lifeadd':        h.addLife?.(num(p.value)); break;
        case 'lifeset':        h.setLife?.(num(p.value)); break;
        case 'powerset':
        case 'poweset':        h.setPower?.(num(p.value)); break;
        case 'attackmulset':   h.setAttackMul?.(num(p.value) || 1); break;
        case 'defencemulset':  h.setDefenceMul?.(num(p.value) || 1); break;
        // ── prises et parades ──
        case 'hitoverride':    h.hitOverride?.(parseInt(p.stateno,10), num(p.time)||1); break;
        case 'reversaldef':    h.reversalDef?.(buildHitDef(p)); break;
        case 'hitfallset':     h.setFall?.(num(p.value) !== 0); break;
        case 'hitfalldamage':  h.addLife?.(-Math.abs(num(p.value))); break;
        case 'assertspecial':  h.assertSpecial?.(String(p.flag||'')); break;
        case 'projectile': h.spawnProjectile(buildHitDef(p), {
          id: num(p.projid), anim: parseInt(p.projanim ?? p.anim, 10),
          velX: nums(p.velocity)[0] || 4, velY: nums(p.velocity)[1] || 0,
          offX: nums(p.offset)[0] || 0, offY: nums(p.offset)[1] || 0,
          removeTime: p.projremovetime !== undefined ? num(p.projremovetime) : -1
        }); break;
        default: break;                       // reconnu mais sans effet visuel
      }
    }
  }

  /** Traduit un bloc HitDef en données de coup exploitables par le moteur. */
  function buildHitDef(p){
    const dmg = nums(p.damage, 0);
    const gv  = nums(p['ground.velocity'], 0);
    const av  = nums(p['air.velocity'], 0);
    const pt  = nums(p.pausetime, 0);
    return {
      damage: dmg[0] || 0,
      guardDamage: dmg[1] || 0,
      attr: String(p.attr || 'S, NA'),
      groundType: String(p['ground.type'] || 'High').trim(),
      hitTime: p['ground.hittime'] !== undefined ? num(p['ground.hittime']) : 12,
      slideTime: p['ground.slidetime'] !== undefined ? num(p['ground.slidetime']) : 5,
      guardHitTime: p['guard.hittime'] !== undefined ? num(p['guard.hittime']) : 8,
      groundVelX: gv[0] || -4, groundVelY: gv[1] || 0,
      airVelX: av[0] || -1.4, airVelY: av[1] || -3,
      airHitTime: p['air.hittime'] !== undefined ? num(p['air.hittime']) : 15,
      fall: /1|true/i.test(String(p.fall ?? '')),
      pauseTime: pt[0] || 0, shakeTime: pt[1] || 0,
      guardFlag: String(p.guardflag || 'MA'),
      hitFlag: String(p.hitflag || 'MAF'),
      priority: nums(p.priority, 4)[0] || 4,
      animType: String(p.animtype || 'Light').trim(),
      sparkXY: nums(p.sparkxy, 0),
      getPower: nums(p.getpower, 0),
      givePower: nums(p.givepower, 0),
      juggle: p.juggle !== undefined ? num(p.juggle) : 1
    };
  }

  window.ChickenCns = { parseCns, CnsRuntime, evalTrigger, triggersPass, buildHitDef, SUPPORTED };
})();
