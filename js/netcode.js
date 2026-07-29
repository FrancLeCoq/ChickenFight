/* ══════════════════════════════════════════════════════════════
   ChickenNet — squelette de duel en ligne (à finaliser plus tard)
   ---------------------------------------------------------------
   Objectif : brancher le moteur ChickenArena en PvP temps réel.
   Approche prévue (inspirée du netcode rollback d'Ikemen GO) :
     • transport : Supabase Realtime (WebSocket) pour le lobby + relais
       d'inputs ; WebRTC DataChannel en P2P pour la faible latence.
     • modèle : chaque client envoie SON input par frame (numéroté).
       Le moteur tourne en lockstep déterministe ; en cas de retard,
       on prédit l'input distant puis on « rollback + resimule » les
       frames divergentes (d'où l'importance d'un moteur déterministe).
     • déterminisme : remplacer Math.random() du moteur par un RNG à
       graine partagée, et fixer le pas à 60 Hz (déjà le cas).
   Ce fichier expose l'interface ; l'implémentation réseau viendra
   dans une prochaine itération (voir README ▸ Roadmap).
   ══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const ChickenNet = {
    role: null,        // 'host' | 'guest'
    roomCode: null,
    connected: false,
    _onRemoteInput: null,
    _frame: 0,

    /** Crée un salon et renvoie un code à partager. (stub) */
    async createRoom(){
      this.role = 'host';
      this.roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      console.info('[ChickenNet] createRoom (stub) →', this.roomCode);
      // TODO: supabase.channel('duel:'+code) + présence + échange d'offre WebRTC
      return this.roomCode;
    },

    /** Rejoint un salon existant. (stub) */
    async joinRoom(code){
      this.role = 'guest';
      this.roomCode = code;
      console.info('[ChickenNet] joinRoom (stub) →', code);
      // TODO: rejoindre le channel, échanger la réponse WebRTC, marquer connected
      return false; // pas encore implémenté
    },

    /** Envoie l'input local de la frame courante. (stub) */
    sendInput(frame, input){
      // TODO: dataChannel.send({f:frame, i:encodeInput(input)})
    },

    /** Callback quand un input distant arrive. */
    onRemoteInput(cb){ this._onRemoteInput = cb; },

    /** Ferme la connexion. */
    close(){ this.connected = false; this.role = null; this.roomCode = null; }
  };

  window.ChickenNet = ChickenNet;
})();
