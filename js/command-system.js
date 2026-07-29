/* ══════════════════════════════════════════════════════════════
   ChickenCommand — détection de commandes façon Ikemen GO / MUGEN
   ---------------------------------------------------------------
   Reproduit la logique du fichier .CMD de MUGEN / Ikemen GO :
     • notation numpad (1..9) : 4=arrière, 6=avant, 2=bas, 3=bas-avant…
       (toujours relative au sens dans lequel le combattant regarde)
     • symboles : "~" = relâchement, "$" = direction quelconque,
       "/" = maintenu, "+" = simultané
     • fenêtres de saisie : time (durée totale) et buffer.time
   Exemples de commandes reconnues :
     QCF  = 2,3,6   (↓ ↘ →)   → boule de feu / œuf
     QCB  = 2,1,4   (↓ ↙ ←)   → coup tournant
     DP   = 6,2,3   (→ ↓ ↘)   → anti-air (dragon punch)
     HCF  = 4,1,2,3,6          → prise / coup lourd
     2QCF = 2,3,6,2,3,6        → SUPER
     CHARGE = [4]40,6          → maintenir arrière puis avant
   ══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  // Convertit l'état des directions en notation numpad, relative au facing.
  function toNumpad(inp, facing){
    const fwd  = facing > 0 ? inp.right : inp.left;
    const back = facing > 0 ? inp.left  : inp.right;
    const up = inp.up, down = inp.down;
    if(up   && fwd)  return 9;
    if(up   && back) return 7;
    if(up)           return 8;
    if(down && fwd)  return 3;
    if(down && back) return 1;
    if(down)         return 2;
    if(fwd)          return 6;
    if(back)         return 4;
    return 5; // neutre
  }

  /** Définition d'une commande : suite d'étapes à valider dans l'ordre. */
  class Command {
    /**
     * @param {string} name  identifiant du coup
     * @param {Array}  steps suite d'étapes : nombre = direction numpad,
     *                       'P'/'K'/'S' = bouton, tableau = alternatives
     * @param {number} time  fenêtre totale en frames pour tout valider
     */
    constructor(name, steps, time = 20, priority = 0){
      this.name = name; this.steps = steps; this.time = time; this.priority = priority;
    }
  }

  /** Historique d'entrées + détection. Un exemplaire par combattant. */
  class CommandBuffer {
    constructor(commands){
      this.commands = commands.slice().sort((a,b)=>b.priority-a.priority);
      this.history = [];      // [{dir, btns:Set, t}]
      this.frame = 0;
      this.consumedAt = -99;  // évite de redéclencher la même commande
    }

    /** À appeler une fois par frame avec l'input brut et le facing. */
    update(inp, facing){
      this.frame++;
      const dir = toNumpad(inp, facing);
      const btns = [];
      if(inp.light)   btns.push('LP');
      if(inp.heavy)   btns.push('HP');
      if(inp.kick)    btns.push('LK');
      if(inp.special) btns.push('S');

      const prev = this.history[this.history.length-1];
      const changed = !prev || prev.dir !== dir || btns.join() !== prev.btns.join();
      if(changed) this.history.push({ dir, btns, t:this.frame });
      // conserve ~40 frames d'historique
      this.history = this.history.filter(h => this.frame - h.t <= 40).slice(-24);
    }

    /** Renvoie la commande la plus prioritaire validée, ou null. */
    detect(){
      if(this.frame - this.consumedAt < 6) return null; // anti-répétition
      for(const cmd of this.commands){
        if(this._match(cmd)){ this.consumedAt = this.frame; return cmd.name; }
      }
      return null;
    }

    /** Valide une commande en remontant l'historique à l'envers. */
    _match(cmd){
      const steps = cmd.steps;
      let si = steps.length - 1;
      let lastT = null;
      for(let i = this.history.length - 1; i >= 0 && si >= 0; i--){
        const h = this.history[i];
        if(lastT !== null && lastT - h.t > cmd.time) return false;
        if(this._stepMatches(steps[si], h)){
          if(si === steps.length-1) lastT = h.t;
          si--;
          if(si < 0){
            // toute la séquence validée dans la fenêtre de temps
            return (lastT - h.t) <= cmd.time;
          }
        }
      }
      return si < 0;
    }

    _stepMatches(step, h){
      if(Array.isArray(step)) return step.some(s => this._stepMatches(s, h));
      if(typeof step === 'number') return h.dir === step;
      // bouton : doit être pressé sur cette entrée
      return h.btns.includes(step);
    }

    reset(){ this.history = []; }
  }

  // ── Répertoire de coups du coq (style Ikemen GO) ──
  // Priorité : les commandes complexes d'abord, sinon le simple bouton gagne.
  function roosterCommands(){
    return [
      // SUPER : ↓↘→ ↓↘→ + coup  → COCORICO FATAL
      new Command('super',  [2,3,6,2,3,6,['LP','HP']], 34, 100),
      // DP : →↓↘ + coup  → COQ ASCENDANT (anti-air, invincible au départ)
      new Command('dp',     [6,2,3,['LP','HP']],       18, 80),
      // QCB : ↓↙← + patte → RETOURNÉ TOURNOYANT
      new Command('qcb',    [2,1,4,['LK','LP']],       18, 70),
      // QCF : ↓↘→ + coup  → ŒUF EXPLOSIF (projectile)
      new Command('qcf',    [2,3,6,['LP','HP','S']],   18, 60),
      // Charge arrière puis avant + aile → CHARGE D'AILE
      new Command('charge', [4,6,['HP']],              14, 50)
    ];
  }

  window.ChickenCommand = { Command, CommandBuffer, roosterCommands, toNumpad };
})();
