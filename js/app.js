(() => {
  'use strict';

  const tg = window.Telegram?.WebApp;
  const WALLET_PAGE = 'https://franclecoq.github.io/Wallet/connect-wallet.html';
  const BACKEND = 'https://mubqtnqulpyehkgubhnh.supabase.co/functions/v1';
  const STORAGE = {
    lang: 'flc_lang',
    holder: 'flc_holder',
    balance: 'flc_balance',
    reason: 'flc_reason',
    walletLinked: 'flc_walletLinked',
    profile: 'flc_fight_profile_v1',
    sound: 'flc_fight_sound'
  };

  const I18N = {
    fr: {
      tagline: 'Entraîne ton coq. Défie le poulailler. Deviens champion.',
      training: 'ENTRAÎNEMENT', trainingSub: 'Combat gratuit contre le Valet',
      campaign: 'CAMPAGNE ROYALE', campaignSub: 'Valet, Reine puis Roi',
      arena: 'ARÈNE CLASSÉE', arenaSub: 'Grimpe dans le classement local',
      duel: 'DUEL LOCAL', duelSub: 'Deux joueurs, un téléphone',
      profile: 'MON COQ', profileSub: 'Progression, trophées et statistiques',
      free: 'GRATUIT', holderMode: 'MODE HOLDER',
      campaignIntro: 'Bats la cour royale et récupère ses combattants.',
      arenaIntro: 'Choisis ton combattant et affronte une IA qui devient plus forte avec ton rang.',
      duelIntro: 'Chaque joueur choisit son coq puis ses actions en secret.',
      rating: 'COTE', league: 'LIGUE', streak: 'SÉRIE',
      enterArena: 'ENTRER DANS L’ARÈNE', player: 'JOUEUR', startDuel: 'COMMENCER LE DUEL',
      level: 'NIVEAU', wins: 'VICTOIRES', losses: 'DÉFAITES', feathers: 'PLUMES',
      achievements: 'TROPHÉES', howToPlay: 'COMMENT JOUER ?', round: 'TOUR',
      chooseAction: 'CHOISIS TON ACTION', quitFight: 'Abandonner le combat',
      walletConnected: '✅ Connecté', walletNoFranc: '⚠️ Connecté — aucun $FRANC', walletNotConnected: 'Non connecté',
      holderStatus: '<b>Entraînement</b> : gratuit pour tous<br><b>Campagne, Arène, Duel et techniques avancées</b> : réservés aux détenteurs de <b>$FRANC</b>',
      nonHolderStatus: '<b>Entraînement</b> : gratuit pour tous<br><b>Campagne, Arène, Duel et techniques avancées</b> : réservés aux détenteurs de <b>$FRANC</b>',
      holderOnlyTitle: 'RÉSERVÉ AUX HOLDERS',
      holderOnlyText: 'Cette fonctionnalité est réservée aux détenteurs de <b>$FRANC</b>.<br>Connecte ton wallet pour la débloquer.',
      connectWallet: '👛 CONNECTER LE WALLET', close: 'FERMER',
      lockedFighter: 'Combattant à débloquer dans la Campagne Royale.',
      stageLocked: 'Bats d’abord le combattant précédent.',
      stageComplete: 'VAINCU', stageFight: 'COMBATTRE',
      opponentValet: 'Le Valet teste tes réflexes.', opponentReine: 'La Reine anticipe tes habitudes.', opponentRoi: 'Le Roi encaisse et frappe très fort.',
      passPhone: 'PASSE LE TÉLÉPHONE', passToP2: 'Joueur 2, ne regarde pas le choix du Joueur 1.', passToP1: 'Joueur 1, ne regarde pas le choix du Joueur 2.', ready: 'JE SUIS PRÊT',
      victory: 'VICTOIRE !', defeat: 'DÉFAITE…', draw: 'MATCH NUL',
      victoryText: 'Le coq est heureux : le poulailler a un nouveau champion !',
      defeatText: 'Francis pleure… mais il reviendra plus fort au prochain combat.',
      drawText: 'Les deux coqs sont encore debout. Quel combat !',
      xp: 'XP', replay: 'REJOUER', menu: 'MENU', continue: 'CONTINUER', share: 'PARTAGER',
      newFighter: 'NOUVEAU COMBATTANT DÉBLOQUÉ',
      newAchievement: 'Nouveau trophée',
      actionLocked: 'Technique avancée réservée aux holders de $FRANC.',
      notEnoughEnergy: 'Pas assez d’énergie.', specialNotReady: 'La jauge spéciale doit être pleine.',
      abandonConfirm: 'Abandonner le combat ?', yesAbandon: 'OUI, ABANDONNER', cancel: 'ANNULER',
      modeTraining: 'ENTRAÎNEMENT', modeCampaign: 'CAMPAGNE', modeArena: 'ARÈNE', modeDuel: 'DUEL LOCAL',
      selectFighter: 'Choisis un combattant.',
      shareWin: '🐓 Je viens de gagner un combat dans ChickenFight ! Qui ose me défier ? 🔥',
      titles: ['Coq débutant','Combattant du poulailler','Coq aguerri','Champion de la basse-cour','Coq légendaire'],
      leagues: ['Bronze','Argent','Or','Diamant','Légende'],
      passives: {
        francis: 'Rage : +15% de dégâts sous 35 PV',
        valet: 'Agile : première esquive gratuite',
        reine: 'Stratège : la garde recharge davantage',
        roi: 'Forteresse : garde renforcée'
      },
      actions: {
        peck: ['COUP DE BEC','Dégâts fiables, recharge les jauges'],
        guard: ['GARDE','Réduit fortement les dégâts'],
        crow: ['COCORICO','Recharge et booste la prochaine attaque'],
        wing: ['AILE TRANCHANTE','Puissante mais moins précise'],
        dodge: ['ESQUIVE','Peut annuler complètement une attaque'],
        feint: ['FEINTE','Brise la garde adverse'],
        special: ['COCORICO FATAL','Attaque ultime, jauge à 100%']
      },
      rules: [
        ['🥊','Attaque','Le coup de bec est sûr. L’aile tranche plus fort mais peut rater.'],
        ['🛡️','Défense','La garde réduit les dégâts. La feinte détruit une garde.'],
        ['💨','Esquive','L’esquive peut éviter un coup, mais consomme de l’énergie.'],
        ['📣','Cocorico','Recharge les jauges et renforce la prochaine attaque, mais te rend vulnérable.'],
        ['🔥','Spécial','Remplis la jauge violette pour déclencher le Cocorico Fatal.']
      ]
    },
    en: {
      tagline: 'Train your rooster. Challenge the coop. Become the champion.',
      training: 'TRAINING', trainingSub: 'Free fight against the Jack',
      campaign: 'ROYAL CAMPAIGN', campaignSub: 'Jack, Queen, then King',
      arena: 'RANKED ARENA', arenaSub: 'Climb your local ranking',
      duel: 'LOCAL DUEL', duelSub: 'Two players, one phone',
      profile: 'MY ROOSTER', profileSub: 'Progress, trophies and statistics',
      free: 'FREE', holderMode: 'HOLDER MODE',
      campaignIntro: 'Defeat the royal court and unlock its fighters.',
      arenaIntro: 'Choose your fighter and face an AI that grows stronger with your rating.',
      duelIntro: 'Each player secretly chooses a rooster and an action.',
      rating: 'RATING', league: 'LEAGUE', streak: 'STREAK',
      enterArena: 'ENTER THE ARENA', player: 'PLAYER', startDuel: 'START DUEL',
      level: 'LEVEL', wins: 'WINS', losses: 'LOSSES', feathers: 'FEATHERS',
      achievements: 'TROPHIES', howToPlay: 'HOW TO PLAY?', round: 'ROUND',
      chooseAction: 'CHOOSE YOUR ACTION', quitFight: 'Forfeit the fight',
      walletConnected: '✅ Connected', walletNoFranc: '⚠️ Connected — no $FRANC', walletNotConnected: 'Not connected',
      holderStatus: '<b>Training</b>: free for everyone<br><b>Campaign, Arena, Duel and advanced moves</b>: reserved for <b>$FRANC</b> holders',
      nonHolderStatus: '<b>Training</b>: free for everyone<br><b>Campaign, Arena, Duel and advanced moves</b>: reserved for <b>$FRANC</b> holders',
      holderOnlyTitle: 'HOLDERS ONLY',
      holderOnlyText: 'This feature is reserved for <b>$FRANC</b> holders.<br>Connect your wallet to unlock it.',
      connectWallet: '👛 CONNECT WALLET', close: 'CLOSE',
      lockedFighter: 'Unlock this fighter in the Royal Campaign.',
      stageLocked: 'Defeat the previous fighter first.',
      stageComplete: 'DEFEATED', stageFight: 'FIGHT',
      opponentValet: 'The Jack tests your reflexes.', opponentReine: 'The Queen predicts your habits.', opponentRoi: 'The King absorbs punishment and hits hard.',
      passPhone: 'PASS THE PHONE', passToP2: 'Player 2, do not look at Player 1’s choice.', passToP1: 'Player 1, do not look at Player 2’s choice.', ready: 'I’M READY',
      victory: 'VICTORY!', defeat: 'DEFEAT…', draw: 'DRAW',
      victoryText: 'The rooster is happy: the coop has a new champion!',
      defeatText: 'Francis is crying… but he will come back stronger.',
      drawText: 'Both roosters are still standing. What a fight!',
      xp: 'XP', replay: 'REPLAY', menu: 'MENU', continue: 'CONTINUE', share: 'SHARE',
      newFighter: 'NEW FIGHTER UNLOCKED',
      newAchievement: 'New trophy',
      actionLocked: 'Advanced move reserved for $FRANC holders.',
      notEnoughEnergy: 'Not enough energy.', specialNotReady: 'The special meter must be full.',
      abandonConfirm: 'Forfeit the fight?', yesAbandon: 'YES, FORFEIT', cancel: 'CANCEL',
      modeTraining: 'TRAINING', modeCampaign: 'CAMPAIGN', modeArena: 'ARENA', modeDuel: 'LOCAL DUEL',
      selectFighter: 'Choose a fighter.',
      shareWin: '🐓 I just won a ChickenFight! Who dares challenge me? 🔥',
      titles: ['Beginner Rooster','Coop Fighter','Seasoned Rooster','Barnyard Champion','Legendary Rooster'],
      leagues: ['Bronze','Silver','Gold','Diamond','Legend'],
      passives: {
        francis: 'Rage: +15% damage below 35 HP',
        valet: 'Agile: first dodge is free',
        reine: 'Tactician: guarding restores more energy',
        roi: 'Fortress: stronger guard'
      },
      actions: {
        peck: ['PECK','Reliable damage, charges both meters'],
        guard: ['GUARD','Greatly reduces incoming damage'],
        crow: ['COCORICO','Recharge and boost your next attack'],
        wing: ['WING SLASH','Powerful but less accurate'],
        dodge: ['DODGE','May completely avoid an attack'],
        feint: ['FEINT','Breaks the opponent’s guard'],
        special: ['FATAL COCORICO','Ultimate attack, meter at 100%']
      },
      rules: [
        ['🥊','Attack','Peck is reliable. Wing Slash hits harder but can miss.'],
        ['🛡️','Defence','Guard reduces damage. Feint destroys a guard.'],
        ['💨','Dodge','Dodge may avoid a hit, but costs energy.'],
        ['📣','Cocorico','Recharges meters and boosts your next attack, but leaves you vulnerable.'],
        ['🔥','Special','Fill the purple meter to unleash Fatal Cocorico.']
      ]
    }
  };

  const CHARACTERS = {
    francis: { id:'francis', name:'Francis', image:'assets/francis-default.webp', hp:100, power:1, defense:1, speed:1, specialName:'Cocorico Fatal' },
    valet: { id:'valet', nameFr:'Le Valet', nameEn:'The Jack', image:'assets/valet.webp', hp:92, power:.95, defense:.94, speed:1.18, specialName:'Pluie de cartes' },
    reine: { id:'reine', nameFr:'La Reine', nameEn:'The Queen', image:'assets/reine.webp', hp:100, power:1, defense:1.08, speed:1.05, specialName:'Échec et Mat' },
    roi: { id:'roi', nameFr:'Le Roi', nameEn:'The King', image:'assets/roi.webp', hp:116, power:1.08, defense:1.16, speed:.88, specialName:'Décret Royal' }
  };

  const ACTIONS = {
    peck: { id:'peck', icon:'🥊', category:'basic', cost:0, premium:false, kind:'attack', accuracy:1, min:9, max:14 },
    guard: { id:'guard', icon:'🛡️', category:'defense', cost:0, premium:false, kind:'defense' },
    crow: { id:'crow', icon:'📣', category:'basic', cost:0, premium:false, kind:'support' },
    wing: { id:'wing', icon:'🪽', category:'tactical', cost:25, premium:true, kind:'attack', accuracy:.83, min:17, max:24 },
    dodge: { id:'dodge', icon:'💨', category:'defense', cost:15, premium:true, kind:'defense' },
    feint: { id:'feint', icon:'🎭', category:'tactical', cost:15, premium:true, kind:'attack', accuracy:.96, min:7, max:11 },
    special: { id:'special', icon:'🔥', category:'special', cost:100, premium:false, kind:'attack', accuracy:.92, min:30, max:39 }
  };

  const ACHIEVEMENTS = {
    firstWin: { icon:'🥚', fr:['Premier sang','Remporter un premier combat'], en:['First win','Win your first fight'] },
    streak3: { icon:'🔥', fr:['Coq en feu','Gagner 3 combats de suite'], en:['On fire','Win 3 fights in a row'] },
    perfect: { icon:'💎', fr:['Sans une plume froissée','Gagner avec tous ses PV'], en:['Flawless','Win at full health'] },
    tactician: { icon:'🎭', fr:['Fin stratège','Briser une garde avec une feinte'], en:['Master tactician','Break a guard with a feint'] },
    royal: { icon:'👑', fr:['Roi du poulailler','Terminer la Campagne Royale'], en:['King of the coop','Complete the Royal Campaign'] },
    veteran: { icon:'🏅', fr:['Vétéran','Disputer 10 combats'], en:['Veteran','Play 10 fights'] }
  };

  const defaultProfile = () => ({
    xp:0, level:1, wins:0, losses:0, draws:0, feathers:0,
    rating:1000, streak:0, bestStreak:0, campaign:0,
    achievements:{}, fights:0, actionCounts:{}, lastMode:'training'
  });

  let lang = localStorage.getItem(STORAGE.lang) || 'fr';
  let isHolder = safeJson(localStorage.getItem(STORAGE.holder), false);
  let francBalance = Number(localStorage.getItem(STORAGE.balance) || 0);
  let unlockReason = localStorage.getItem(STORAGE.reason) || null;
  let walletLinked = safeJson(localStorage.getItem(STORAGE.walletLinked), false);
  let profile = Object.assign(defaultProfile(), safeJson(localStorage.getItem(STORAGE.profile), {}));
  profile.achievements = profile.achievements || {};
  profile.actionCounts = profile.actionCounts || {};
  let soundEnabled = safeJson(localStorage.getItem(STORAGE.sound), true);

  let currentScreen = 'menu';
  let screenStack = [];
  let selectedArenaFighter = null;
  let duelSelections = { 1:null, 2:null };
  let battle = null;
  let toastTimer = null;
  let audioCtx = null;

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const tr = key => I18N[lang][key];
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const randomInt = (min,max) => Math.floor(Math.random()*(max-min+1))+min;

  function safeJson(value, fallback){
    try { return value == null ? fallback : JSON.parse(value); } catch { return fallback; }
  }

  function saveProfile(){
    profile.level = levelFromXp(profile.xp);
    localStorage.setItem(STORAGE.profile, JSON.stringify(profile));
  }

  function levelFromXp(xp){ return Math.min(50, Math.floor(Math.sqrt(xp / 75)) + 1); }
  function xpFloor(level){ return 75 * Math.pow(level - 1, 2); }
  function xpCeil(level){ return 75 * Math.pow(level, 2); }

  function characterName(id){
    const c = CHARACTERS[id];
    if(id === 'francis') return c.name;
    return lang === 'fr' ? c.nameFr : c.nameEn;
  }

  function unlockedFighters(){
    const list = ['francis'];
    if(profile.campaign >= 1) list.push('valet');
    if(profile.campaign >= 2) list.push('reine');
    if(profile.campaign >= 3) list.push('roi');
    return list;
  }

  function lockSvg(open){
    if(open){
      return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 9.6-2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><rect x="4" y="10" width="14" height="10" rx="2.5" fill="#fff"/><circle cx="11" cy="14.5" r="1.6" fill="#15803d"/><rect x="10.2" y="14.5" width="1.6" height="3.2" rx=".8" fill="#15803d"/></svg>`;
    }
    return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3" stroke="#fff" stroke-width="2" stroke-linecap="round"/><rect x="4.5" y="10" width="15" height="10" rx="2.5" fill="#fff"/><circle cx="12" cy="14.5" r="1.6" fill="#b45309"/><rect x="11.2" y="14.5" width="1.6" height="3.2" rx=".8" fill="#b45309"/></svg>`;
  }

  function initTelegram(){
    if(!tg) return;
    try{
      tg.ready(); tg.expand();
      tg.setHeaderColor?.('#0d0520');
      tg.setBackgroundColor?.('#0d0520');
      tg.disableVerticalSwipes?.();
    }catch{}
  }

  async function detectHolder(){
    if(tg?.initData){
      try{
        const res = await fetch(`${BACKEND}/check-franc`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ initData:tg.initData })
        });
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        walletLinked = !!data?.walletLinked;
        isHolder = !!(data && (data.unlocked ?? (data.walletLinked && data.hasFranc)));
        unlockReason = data?.reason || (isHolder ? 'solana' : null);
        francBalance = isHolder ? Number(data?.balance || 0) : 0;
        localStorage.setItem(STORAGE.holder, JSON.stringify(isHolder));
        localStorage.setItem(STORAGE.balance, String(francBalance));
        localStorage.setItem(STORAGE.reason, unlockReason || '');
        localStorage.setItem(STORAGE.walletLinked, JSON.stringify(walletLinked));
      }catch(err){
        console.warn('Holder check unavailable, cached state kept.', err);
      }
    }
    renderAccessState();
  }

  function renderAccessState(){
    const walletBtn = $('#walletBtn');
    const walletSub = $('#walletSub');
    walletBtn.classList.remove('holder','linked-no-token');
    if(isHolder){
      walletBtn.classList.add('holder');
      const symbol = unlockReason === 'ton' ? '💎' : unlockReason === 'stars' ? '⭐' : '◎';
      const balance = francBalance ? Number(francBalance).toLocaleString() : '?';
      walletSub.textContent = unlockReason === 'stars' ? 'Unlocked via ⭐' : `${tr('walletConnected')} ${symbol} · ${balance} $FRANC`;
      $('#walletLock').innerHTML = lockSvg(true);
    }else if(walletLinked){
      walletBtn.classList.add('linked-no-token');
      walletSub.textContent = tr('walletNoFranc');
      $('#walletLock').innerHTML = lockSvg(false);
    }else{
      walletSub.textContent = tr('walletNotConnected');
      $('#walletLock').innerHTML = lockSvg(false);
    }
    ['campaign','arena','duel'].forEach(mode => {
      const el = document.querySelector(`[data-lock-for="${mode}"]`);
      if(el) el.innerHTML = lockSvg(isHolder);
    });
    const bar = $('#statusBar');
    bar.className = `status-bar ${isHolder ? 'franc' : 'no-franc'}`;
    bar.innerHTML = isHolder ? tr('holderStatus') : tr('nonHolderStatus');
  }

  function applyLanguage(){
    document.documentElement.lang = lang;
    $$('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if(typeof tr(key) === 'string') el.textContent = tr(key);
    });
    $('#flagFr').classList.toggle('active',lang === 'fr');
    $('#flagEn').classList.toggle('active',lang === 'en');
    $('#soundBtn').textContent = soundEnabled ? '🔊' : '🔇';
    renderAccessState();
    renderCampaign(); renderArena(); renderDuel(); renderProfile();
    updateScreenCaption();
    if(battle) renderBattle();
  }

  function setLang(next){
    lang = next;
    localStorage.setItem(STORAGE.lang, lang);
    applyLanguage();
  }

  function screenTitle(name){
    const map = { menu:'', campaign:tr('campaign'), arena:tr('arena'), duel:tr('duel'), profile:tr('profile'), battle:battle ? tr(`mode${capitalize(battle.mode)}`) : '' };
    return map[name] || '';
  }

  function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

  function showScreen(name, push=true){
    if(name === currentScreen) return;
    if(push && currentScreen !== 'battle') screenStack.push(currentScreen);
    $$('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === name));
    currentScreen = name;
    $('#backBtn').classList.toggle('hidden', name === 'menu' || name === 'battle');
    updateScreenCaption();
    window.scrollTo({top:0,behavior:'instant'});
  }

  function updateScreenCaption(){ $('#screenCaption').textContent = screenTitle(currentScreen); }

  function goBack(){
    const previous = screenStack.pop() || 'menu';
    showScreen(previous,false);
  }

  function openMode(mode){
    if(mode !== 'training' && !isHolder){ showHolderModal(); return; }
    if(mode === 'training') startBattle({mode:'training',player:'francis',enemy:'valet',difficulty:.82});
    if(mode === 'campaign'){ renderCampaign(); showScreen('campaign'); }
    if(mode === 'arena'){ renderArena(); showScreen('arena'); }
    if(mode === 'duel'){ renderDuel(); showScreen('duel'); }
  }

  function showHolderModal(){
    showModal(`
      <img class="result-rooster" src="assets/francis-sad.webp" alt="Francis triste">
      <h2>🔒 ${tr('holderOnlyTitle')}</h2>
      <p>${tr('holderOnlyText')}</p>
      <div class="modal-actions">
        <button class="modal-btn orange" data-modal-action="wallet">${tr('connectWallet')}</button>
        <button class="modal-btn purple" data-modal-action="close">${tr('close')}</button>
      </div>`);
  }

  function goWallet(){ window.location.href = WALLET_PAGE; }

  function renderCampaign(){
    const root = $('#campaignMap');
    if(!root) return;
    const stages = [
      {id:1,enemy:'valet',desc:'opponentValet',difficulty:.9},
      {id:2,enemy:'reine',desc:'opponentReine',difficulty:1.05},
      {id:3,enemy:'roi',desc:'opponentRoi',difficulty:1.18}
    ];
    root.innerHTML = stages.map(stage => {
      const completed = profile.campaign >= stage.id;
      const available = profile.campaign >= stage.id - 1;
      return `<button class="campaign-node ${completed?'completed':''} ${available?'':'locked'}" type="button" data-stage="${stage.id}" ${available?'':'disabled'}>
        <img src="${CHARACTERS[stage.enemy].image}" alt="${characterName(stage.enemy)}">
        <span><h3>${stage.id}. ${characterName(stage.enemy)}</h3><p>${tr(stage.desc)}</p></span>
        <span class="node-state">${completed?'✅':available?'🥊':'🔒'}<small>${completed?tr('stageComplete'):available?tr('stageFight'):''}</small></span>
      </button>`;
    }).join('');
    $$('[data-stage]',root).forEach(btn => btn.addEventListener('click',() => {
      const stage = Number(btn.dataset.stage);
      if(profile.campaign < stage - 1){ toast(tr('stageLocked')); return; }
      const config = stages.find(s => s.id === stage);
      startBattle({mode:'campaign',player:'francis',enemy:config.enemy,difficulty:config.difficulty,stage});
    }));
  }

  function fighterCard(id, selected, locked, compact=false){
    return `<button class="fighter-option ${selected?'selected':''} ${locked?'locked':''}" data-fighter="${id}" type="button" ${locked?'disabled':''}>
      ${locked?'<span class="tiny-lock">🔒</span>':''}
      <img src="${CHARACTERS[id].image}" alt="${characterName(id)}">
      <b>${characterName(id)}</b>
      <small>${tr('passives')[id]}</small>
    </button>`;
  }

  function renderArena(){
    const unlocked = unlockedFighters();
    if(!selectedArenaFighter || !unlocked.includes(selectedArenaFighter)) selectedArenaFighter = unlocked[0];
    $('#ratingValue').textContent = profile.rating;
    $('#leagueValue').textContent = leagueName(profile.rating);
    $('#streakValue').textContent = profile.streak;
    const root = $('#arenaRoster');
    root.innerHTML = Object.keys(CHARACTERS).map(id => fighterCard(id,selectedArenaFighter===id,!unlocked.includes(id))).join('');
    $$('.fighter-option',root).forEach(btn => btn.addEventListener('click',() => {
      if(btn.disabled){toast(tr('lockedFighter'));return;}
      selectedArenaFighter = btn.dataset.fighter; renderArena();
    }));
    $('#arenaFightBtn').disabled = !selectedArenaFighter;
  }

  function renderDuel(){
    [1,2].forEach(player => {
      const root = $(`#duelRoster${player}`);
      const unlocked = unlockedFighters();
      root.innerHTML = Object.keys(CHARACTERS).map(id => fighterCard(id,duelSelections[player]===id,!unlocked.includes(id),true)).join('');
      $$('.fighter-option',root).forEach(btn => btn.addEventListener('click',() => {
        if(btn.disabled){toast(tr('lockedFighter'));return;}
        duelSelections[player] = btn.dataset.fighter; renderDuel();
      }));
    });
    $('#duelStartBtn').disabled = !(duelSelections[1] && duelSelections[2]);
  }

  function renderProfile(){
    if(!$('#profileLevel')) return;
    const lvl = levelFromXp(profile.xp);
    const floor = xpFloor(lvl), ceil = xpCeil(lvl);
    const pct = clamp(((profile.xp-floor)/(ceil-floor))*100,0,100);
    $('#profileLevel').textContent = lvl;
    $('#profileTitle').textContent = tr('titles')[Math.min(4,Math.floor((lvl-1)/3))];
    $('#xpFill').style.width = `${pct}%`;
    $('#xpText').textContent = `${profile.xp-floor} / ${ceil-floor} XP`;
    $('#statWins').textContent = profile.wins;
    $('#statLosses').textContent = profile.losses;
    $('#statRating').textContent = profile.rating;
    $('#statFeathers').textContent = profile.feathers;
    const achRoot = $('#achievementGrid');
    achRoot.innerHTML = Object.entries(ACHIEVEMENTS).map(([id,a]) => {
      const unlocked = !!profile.achievements[id];
      const copy = a[lang];
      return `<div class="achievement ${unlocked?'':'locked'}"><span class="ach-ico">${unlocked?a.icon:'🔒'}</span><span><b>${copy[0]}</b><small>${copy[1]}</small></span></div>`;
    }).join('');
    $('#rulesList').innerHTML = tr('rules').map(r => `<div class="rule-row"><span>${r[0]}</span><div><b>${r[1]}</b><small>${r[2]}</small></div></div>`).join('');
  }

  function leagueName(rating){
    const idx = rating < 1100 ? 0 : rating < 1250 ? 1 : rating < 1450 ? 2 : rating < 1700 ? 3 : 4;
    return tr('leagues')[idx];
  }

  function makeFighter(id, side, difficulty=1){
    const c = CHARACTERS[id];
    const hpScale = side === 'enemy' ? difficulty : 1;
    const maxHp = Math.round(c.hp * hpScale);
    return {
      id, side, name:characterName(id), image:c.image,
      maxHp, hp:maxHp, power:c.power*(side==='enemy'?difficulty:1), defense:c.defense*(side==='enemy'?Math.sqrt(difficulty):1), speed:c.speed,
      energy:0, special:0, buff:0, firstDodge:true, lastActions:[], guardBreaks:0
    };
  }

  function startBattle(config){
    const difficulty = config.difficulty || 1;
    battle = {
      mode:config.mode, stage:config.stage || null, difficulty,
      player:makeFighter(config.player,'player',1),
      enemy:makeFighter(config.enemy,'enemy',difficulty),
      round:1, maxRounds:15, busy:false, over:false,
      chooser:config.mode === 'duel' ? 1 : null,
      pendingActions:{}, logs:[], selectedAction:null
    };
    profile.lastMode = config.mode;
    saveProfile();
    $('#playerImg').src = battle.player.image;
    $('#enemyImg').src = battle.enemy.image;
    showScreen('battle',false);
    $('#backBtn').classList.add('hidden');
    renderBattle();
    addLog(lang==='fr'?'Le combat commence !':'The fight begins!');
    playSound('start'); haptic('medium');
    if(config.mode === 'duel') showPass(1,true);
  }

  function renderBattle(){
    if(!battle) return;
    const p = battle.player, e = battle.enemy;
    $('#battleModeBadge').textContent = tr(`mode${capitalize(battle.mode)}`);
    $('#roundValue').textContent = battle.round;
    $('#playerName').textContent = p.name;
    $('#enemyName').textContent = e.name;
    $('#playerPassive').textContent = tr('passives')[p.id];
    $('#enemyPassive').textContent = tr('passives')[e.id];
    $('#playerImg').src = p.image; $('#enemyImg').src = e.image;
    renderBar('player',p); renderBar('enemy',e);
    renderActionGrid();
    updateScreenCaption();
  }

  function renderBar(prefix,f){
    $(`#${prefix}HpFill`).style.width = `${clamp(f.hp/f.maxHp*100,0,100)}%`;
    $(`#${prefix}EnergyFill`).style.width = `${f.energy}%`;
    $(`#${prefix}SpecialFill`).style.width = `${f.special}%`;
    $(`#${prefix}HpText`).textContent = `${Math.max(0,f.hp)}/${f.maxHp}`;
    $(`#${prefix}EnergyText`).textContent = `${f.energy}⚡`;
    $(`#${prefix}SpecialText`).textContent = `${f.special}%`;
  }

  function currentActor(){
    if(!battle) return null;
    if(battle.mode !== 'duel') return battle.player;
    return battle.chooser === 1 ? battle.player : battle.enemy;
  }

  function renderActionGrid(){
    if(!battle) return;
    const actor = currentActor();
    const root = $('#actionGrid');
    if(battle.mode === 'duel'){
      $('#turnPrompt').textContent = `${tr('player')} ${battle.chooser} — ${tr('chooseAction')}`;
    }else $('#turnPrompt').textContent = tr('chooseAction');
    root.innerHTML = Object.values(ACTIONS).map(action => {
      const premiumLocked = action.premium && !isHolder;
      const insufficient = action.id === 'special' ? actor.special < 100 : actor.energy < action.cost && !(actor.id==='valet'&&action.id==='dodge'&&actor.firstDodge);
      const disabled = battle.busy || battle.over || insufficient;
      const copy = tr('actions')[action.id];
      const cost = action.id === 'special' ? '100%' : action.cost ? `${action.cost}⚡` : '';
      return `<button class="action-btn ${action.category} ${premiumLocked?'locked':''}" type="button" data-action="${action.id}" ${disabled?'disabled':''}>
        <span class="action-ico">${premiumLocked?'🔒':action.icon}</span>
        <span class="action-copy"><b>${copy[0]}</b><small>${copy[1]}</small></span>
        <span class="action-cost">${cost}</span>
      </button>`;
    }).join('');
    $$('[data-action]',root).forEach(btn => btn.addEventListener('click',() => chooseAction(btn.dataset.action)));
  }

  function chooseAction(actionId){
    if(!battle || battle.busy || battle.over) return;
    const action = ACTIONS[actionId];
    const actor = currentActor();
    if(action.premium && !isHolder){ toast(tr('actionLocked')); haptic('error'); return; }
    if(actionId === 'special' && actor.special < 100){ toast(tr('specialNotReady')); return; }
    const effectiveCost = actor.id==='valet'&&actionId==='dodge'&&actor.firstDodge ? 0 : action.cost;
    if(actionId !== 'special' && actor.energy < effectiveCost){ toast(tr('notEnoughEnergy')); return; }
    if(battle.mode === 'duel'){
      battle.pendingActions[battle.chooser] = actionId;
      if(battle.chooser === 1){ battle.chooser = 2; showPass(2,false); }
      else{
        battle.busy = true;
        resolveTurn(battle.pendingActions[1],battle.pendingActions[2]);
      }
    }else{
      battle.busy = true;
      const aiAction = chooseAiAction(battle.enemy,battle.player,battle.difficulty);
      resolveTurn(actionId,aiAction);
    }
  }

  function chooseAiAction(ai, opponent, difficulty){
    const available = Object.values(ACTIONS).filter(a => {
      if(a.id === 'special') return ai.special >= 100;
      const cost = ai.id==='valet'&&a.id==='dodge'&&ai.firstDodge ? 0 : a.cost;
      return ai.energy >= cost;
    });
    if(ai.special >= 100 && Math.random() < .78) return 'special';
    const last = opponent.lastActions.at(-1);
    const low = ai.hp/ai.maxHp < .32;
    const weights = {};
    available.forEach(a => weights[a.id] = 1);
    weights.peck = 3.4;
    weights.guard = low ? 3.6 : 1.5;
    weights.crow = ai.energy < 30 ? 2.5 : .8;
    weights.wing = ai.energy >= 25 ? 2.2 : 0;
    weights.dodge = low ? 2.8 : 1.2;
    weights.feint = last === 'guard' ? 4.5 : 1.2;
    if(ai.id === 'valet') weights.dodge *= 1.7;
    if(ai.id === 'reine') { weights.guard *= 1.5; weights.feint *= 1.7; }
    if(ai.id === 'roi') { weights.guard *= 1.8; weights.wing *= 1.5; }
    if(difficulty > 1.1 && last === 'crow') weights.wing *= 1.8;
    if(opponent.lastActions.slice(-2).every(x => x === 'guard')) weights.feint *= 2.2;
    return weightedChoice(available.map(a => a.id),weights);
  }

  function weightedChoice(items,weights){
    const total = items.reduce((s,id)=>s+Math.max(0,weights[id]||0),0);
    let r = Math.random()*total;
    for(const id of items){ r -= Math.max(0,weights[id]||0); if(r<=0) return id; }
    return items[0] || 'peck';
  }

  async function resolveTurn(playerActionId,enemyActionId){
    const p = battle.player, e = battle.enemy;
    const pAction = ACTIONS[playerActionId], eAction = ACTIONS[enemyActionId];
    spendCost(p,pAction); spendCost(e,eAction);
    p.lastActions.push(playerActionId); e.lastActions.push(enemyActionId);
    p.lastActions = p.lastActions.slice(-4); e.lastActions = e.lastActions.slice(-4);
    profile.actionCounts[playerActionId] = (profile.actionCounts[playerActionId]||0)+1;

    animateAction('player',pAction); animateAction('enemy',eAction);
    addLog(`${pAction.icon} ${p.name}: ${tr('actions')[playerActionId][0]}`);
    addLog(`${eAction.icon} ${e.name}: ${tr('actions')[enemyActionId][0]}`);
    playSound(playerActionId==='special'||enemyActionId==='special'?'special':'move');
    await wait(440);

    applySupport(p,pAction);
    applySupport(e,eAction);
    const toEnemy = calculateAttack(p,e,pAction,eAction);
    const toPlayer = calculateAttack(e,p,eAction,pAction);

    if(toEnemy.guardBreak){ p.guardBreaks++; profile.achievements.tactician = true; }
    if(toPlayer.guardBreak){ e.guardBreaks++; }

    e.hp = clamp(e.hp - toEnemy.damage,0,e.maxHp);
    p.hp = clamp(p.hp - toPlayer.damage,0,p.maxHp);
    if(toEnemy.damage){ e.special = clamp(e.special + Math.round(toEnemy.damage*.75),0,100); effect('enemy',`-${toEnemy.damage}`); animateHit('enemy'); }
    else if(toEnemy.missed) effect('enemy',lang==='fr'?'RATÉ !':'MISS!');
    else if(toEnemy.blocked) effect('enemy',lang==='fr'?'BLOQUÉ':'BLOCKED');
    if(toPlayer.damage){ p.special = clamp(p.special + Math.round(toPlayer.damage*.75),0,100); effect('player',`-${toPlayer.damage}`); animateHit('player'); }
    else if(toPlayer.missed) effect('player',lang==='fr'?'RATÉ !':'MISS!');
    else if(toPlayer.blocked) effect('player',lang==='fr'?'BLOQUÉ':'BLOCKED');

    if(toEnemy.text) addLog(toEnemy.text);
    if(toPlayer.text) addLog(toPlayer.text);
    renderBattle();
    if(toEnemy.damage || toPlayer.damage){ playSound('hit'); haptic('heavy'); }
    await wait(560);

    const finished = p.hp <= 0 || e.hp <= 0 || battle.round >= battle.maxRounds;
    if(finished){ finishBattle(); return; }
    battle.round++;
    battle.pendingActions = {};
    battle.busy = false;
    if(battle.mode === 'duel'){
      battle.chooser = 1;
      showPass(1,false);
    }
    renderBattle();
  }

  function spendCost(f,action){
    if(action.id === 'special'){ f.special = 0; return; }
    let cost = action.cost;
    if(f.id === 'valet' && action.id === 'dodge' && f.firstDodge){ cost = 0; f.firstDodge = false; }
    f.energy = clamp(f.energy-cost,0,100);
  }

  function applySupport(f,action){
    if(action.id === 'guard'){
      f.energy = clamp(f.energy + (f.id === 'reine' ? 20 : 12),0,100);
      f.special = clamp(f.special + 8,0,100);
    }
    if(action.id === 'crow'){
      f.energy = clamp(f.energy+32,0,100);
      f.special = clamp(f.special+18,0,100);
      f.buff = Math.max(f.buff,1);
    }
    if(action.id === 'dodge') f.special = clamp(f.special+8,0,100);
  }

  function calculateAttack(attacker,defender,action,defenderAction){
    if(action.kind !== 'attack') return {damage:0,blocked:false,missed:false,text:''};
    let accuracy = action.accuracy;
    let dodgeChance = 0;
    if(defenderAction.id === 'dodge'){
      dodgeChance = .62 + (defender.speed-attacker.speed)*.12;
      if(action.id === 'feint') dodgeChance = .16;
      if(action.id === 'special') dodgeChance *= .64;
      dodgeChance = clamp(dodgeChance,.08,.82);
      if(Math.random() < dodgeChance){
        defender.energy = clamp(defender.energy+5,0,100);
        return {damage:0,missed:true,blocked:false,text:`💨 ${defender.name} ${lang==='fr'?'esquive !':'dodges!'}`};
      }
    }
    if(Math.random() > accuracy){ return {damage:0,missed:true,blocked:false,text:`💨 ${attacker.name} ${lang==='fr'?'rate son coup.':'misses.'}`}; }
    let base = randomInt(action.min,action.max);
    let power = attacker.power;
    if(attacker.id === 'francis' && attacker.hp/attacker.maxHp < .35) power *= 1.15;
    if(attacker.buff){ power *= 1.2; attacker.buff = 0; }
    let multiplier = power / defender.defense;
    let guardBreak = false, blocked = false;
    if(defenderAction.id === 'guard'){
      blocked = true;
      if(action.id === 'feint'){
        multiplier *= 2.05; guardBreak = true; blocked = false;
        defender.energy = clamp(defender.energy-10,0,100);
      }else if(action.id === 'special') multiplier *= defender.id === 'roi' ? .48 : .65;
      else multiplier *= defender.id === 'roi' ? .2 : .3;
    }
    if(defenderAction.id === 'crow') multiplier *= 1.2;
    let crit = Math.random() < (.06 + Math.max(0,attacker.speed-defender.speed)*.08);
    if(crit) multiplier *= 1.45;
    const damage = Math.max(1,Math.round(base*multiplier));
    if(action.id === 'peck'){ attacker.energy=clamp(attacker.energy+13,0,100); attacker.special=clamp(attacker.special+12,0,100); }
    if(action.id === 'wing') attacker.special=clamp(attacker.special+16,0,100);
    if(action.id === 'feint') attacker.special=clamp(attacker.special+13,0,100);
    const extras = [guardBreak ? (lang==='fr'?'GARDE BRISÉE !':'GUARD BROKEN!') : '', crit ? 'CRITIQUE !' : ''].filter(Boolean).join(' ');
    return {damage,missed:false,blocked,guardBreak,crit,text:extras?`💥 ${extras}`:''};
  }

  function animateAction(side,action){
    const el = $(`#${side}Side`);
    const cls = action.id === 'guard' ? 'guarding' : action.id === 'dodge' ? 'dodging' : action.id === 'crow' ? 'crowing' : 'attacking';
    el.classList.add(cls); setTimeout(()=>el.classList.remove(cls),760);
  }
  function animateHit(side){ const el=$(`#${side}Side`);el.classList.add('hit');setTimeout(()=>el.classList.remove('hit'),620); }
  function effect(side,text){ const el=$(`#${side}Effect`);el.textContent=text;el.classList.remove('show');void el.offsetWidth;el.classList.add('show'); }

  function addLog(text){
    if(!battle) return;
    battle.logs.push(text); battle.logs = battle.logs.slice(-4);
    $('#battleLog').innerHTML = battle.logs.map(x=>`<div class="log-line">${escapeHtml(x)}</div>`).join('');
  }

  function finishBattle(forfeit=false){
    if(!battle || battle.over) return;
    battle.over = true; battle.busy = true;
    let outcome = 'draw';
    if(forfeit) outcome = 'lose';
    else if(battle.player.hp > battle.enemy.hp) outcome = 'win';
    else if(battle.player.hp < battle.enemy.hp) outcome = 'lose';
    else if(battle.player.hp <= 0 && battle.enemy.hp > 0) outcome = 'lose';
    else if(battle.enemy.hp <= 0 && battle.player.hp > 0) outcome = 'win';

    const rewards = applyMatchRewards(outcome,forfeit);
    const resultImage = outcome === 'win' ? (battle.player.id==='francis'?'assets/francis-happy.webp':battle.player.image) : outcome === 'lose' ? 'assets/francis-sad.webp' : battle.player.image;
    const title = outcome === 'win' ? tr('victory') : outcome === 'lose' ? tr('defeat') : tr('draw');
    const text = outcome === 'win' ? tr('victoryText') : outcome === 'lose' ? tr('defeatText') : tr('drawText');
    if(outcome === 'win'){ confetti(); playSound('win'); haptic('success'); }
    else if(outcome === 'lose'){ playSound('lose'); haptic('error'); }

    const unlock = rewards.unlockedFighter ? `<p><b>🎉 ${tr('newFighter')} : ${characterName(rewards.unlockedFighter)}</b></p>` : '';
    showModal(`
      <img class="result-rooster" src="${resultImage}" alt="${title}">
      <h2>${title}</h2>
      <p>${text}</p>
      ${battle.player.id!=='francis'&&outcome==='win'?'<div style="font-size:38px">😄</div>':''}
      ${unlock}
      ${battle.mode!=='duel'?`<div class="reward-line"><span class="reward-chip">+${rewards.xp} ${tr('xp')}</span><span class="reward-chip">🪶 +${rewards.feathers}</span>${rewards.rating?`<span class="reward-chip">🏆 ${rewards.rating>0?'+':''}${rewards.rating}</span>`:''}</div>`:''}
      <div class="modal-actions">
        <button class="modal-btn green" data-modal-action="replay">${tr('replay')}</button>
        ${outcome==='win'?`<button class="modal-btn orange" data-modal-action="share">${tr('share')}</button>`:''}
        <button class="modal-btn purple" data-modal-action="menu">${tr('menu')}</button>
      </div>`);
  }

  function applyMatchRewards(outcome,forfeit){
    if(battle.mode === 'duel') return {xp:0,feathers:0,rating:0};
    profile.fights++;
    let xp=0,feathers=0,rating=0,unlockedFighter=null;
    if(outcome === 'win'){
      profile.wins++; profile.streak++; profile.bestStreak=Math.max(profile.bestStreak,profile.streak);
      const multipliers = {training:1,campaign:1.8,arena:1.45};
      xp = Math.round(25*(multipliers[battle.mode]||1));
      feathers = Math.round(10*(multipliers[battle.mode]||1));
      if(battle.mode === 'campaign' && battle.stage && battle.stage > profile.campaign){
        profile.campaign = battle.stage;
        unlockedFighter = ['','valet','reine','roi'][battle.stage];
      }
      if(battle.mode === 'arena'){
        rating = Math.round(18 + Math.max(0,battle.difficulty-1)*10);
        profile.rating = clamp(profile.rating+rating,700,2400);
      }
    }else if(outcome === 'lose'){
      profile.losses++; profile.streak=0; xp=forfeit?2:10; feathers=forfeit?0:3;
      if(battle.mode === 'arena'){
        rating = -Math.round(12 + Math.max(0,1.05-battle.difficulty)*8);
        profile.rating = clamp(profile.rating+rating,700,2400);
      }
    }else{
      profile.draws++; profile.streak=0; xp=12; feathers=4;
    }
    profile.xp += xp; profile.feathers += feathers;
    if(profile.wins>=1) profile.achievements.firstWin=true;
    if(profile.bestStreak>=3) profile.achievements.streak3=true;
    if(outcome==='win' && battle.player.hp===battle.player.maxHp) profile.achievements.perfect=true;
    if(profile.campaign>=3) profile.achievements.royal=true;
    if(profile.fights>=10) profile.achievements.veteran=true;
    saveProfile(); renderProfile(); renderCampaign(); renderArena(); renderDuel();
    return {xp,feathers,rating,unlockedFighter};
  }

  function replayBattle(){
    if(!battle) return;
    const config = {mode:battle.mode,player:battle.player.id,enemy:battle.enemy.id,difficulty:battle.difficulty,stage:battle.stage};
    closeModal(); startBattle(config);
  }

  function quitBattle(){
    if(!battle || battle.over){ goMenu(); return; }
    showModal(`<img class="result-rooster" src="assets/francis-sad.webp" alt="">
      <h2>${tr('abandonConfirm')}</h2>
      <div class="modal-actions"><button class="modal-btn orange" data-modal-action="forfeit">${tr('yesAbandon')}</button><button class="modal-btn purple" data-modal-action="close">${tr('cancel')}</button></div>`);
  }

  function goMenu(){
    closeModal(); closePass(); battle=null; screenStack=[]; showScreen('menu',false); $('#backBtn').classList.add('hidden');
  }

  function showPass(player,initial){
    if(!battle || battle.mode !== 'duel') return;
    $('#passTitle').textContent = tr('passPhone');
    $('#passText').textContent = player===2?tr('passToP2'):tr('passToP1');
    $('#passReadyBtn').textContent = tr('ready');
    $('#passOverlay').classList.add('show'); $('#passOverlay').setAttribute('aria-hidden','false');
    battle.chooser = player;
    battle.busy = true;
  }

  function closePass(){ $('#passOverlay').classList.remove('show'); $('#passOverlay').setAttribute('aria-hidden','true'); }

  function readyAfterPass(){
    closePass();
    if(!battle) return;
    battle.busy = false;
    renderBattle();
  }

  function showModal(html){
    $('#modalContent').innerHTML = html;
    $('#modalOverlay').classList.add('show'); $('#modalOverlay').setAttribute('aria-hidden','false');
  }
  function closeModal(){ $('#modalOverlay').classList.remove('show'); $('#modalOverlay').setAttribute('aria-hidden','true'); }

  function handleModalAction(action){
    if(action==='close') closeModal();
    if(action==='wallet') goWallet();
    if(action==='replay') replayBattle();
    if(action==='menu') goMenu();
    if(action==='share') shareResult();
    if(action==='forfeit'){ closeModal(); finishBattle(true); }
  }

  function shareResult(){
    const text = tr('shareWin');
    const url = `https://t.me/share/url?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent(text)}`;
    try{ if(tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url,'_blank','noopener'); }catch{ window.open(url,'_blank','noopener'); }
  }

  function toast(message){
    const el = $('#toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2300);
  }

  function confetti(){
    const root=$('#confetti'); root.innerHTML='';
    for(let i=0;i<42;i++){
      const piece=document.createElement('span'); piece.className='confetti-piece';
      piece.style.left=`${Math.random()*100}%`; piece.style.animationDelay=`${Math.random()*.7}s`;
      piece.style.animationDuration=`${1.8+Math.random()*1.5}s`; piece.style.setProperty('--drift',`${-70+Math.random()*140}px`);
      piece.style.background=[ '#ffd54a','#c084fc','#22c55e','#38bdf8','#ef4444' ][i%5];
      root.appendChild(piece);
    }
    setTimeout(()=>root.innerHTML='',3600);
  }

  function initAudio(){
    if(!soundEnabled) return null;
    try{ audioCtx ||= new (window.AudioContext||window.webkitAudioContext)(); return audioCtx; }catch{return null;}
  }

  function playSound(type){
    const ctx=initAudio(); if(!ctx) return;
    const now=ctx.currentTime;
    const patterns={
      move:[[220,.05,.05]], hit:[[110,.08,.08],[75,.08,.04]], special:[[220,.1,.05],[440,.16,.08],[700,.22,.1]],
      win:[[523,.1,.08],[659,.1,.18],[784,.18,.3]], lose:[[220,.16,.05],[165,.22,.22]], start:[[330,.08,.04],[440,.1,.14]]
    };
    (patterns[type]||patterns.move).forEach(([freq,dur,delay])=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain(); osc.type=type==='hit'?'sawtooth':'triangle'; osc.frequency.value=freq;
      gain.gain.setValueAtTime(.0001,now+delay); gain.gain.exponentialRampToValueAtTime(.12,now+delay+.01); gain.gain.exponentialRampToValueAtTime(.0001,now+delay+dur);
      osc.connect(gain).connect(ctx.destination); osc.start(now+delay); osc.stop(now+delay+dur+.02);
    });
  }

  function toggleSound(){
    soundEnabled=!soundEnabled; localStorage.setItem(STORAGE.sound,JSON.stringify(soundEnabled));
    $('#soundBtn').textContent=soundEnabled?'🔊':'🔇'; if(soundEnabled) playSound('move');
  }

  function haptic(type){
    try{
      if(type==='success'||type==='error') tg?.HapticFeedback?.notificationOccurred(type);
      else tg?.HapticFeedback?.impactOccurred(type);
    }catch{}
  }

  function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  function escapeHtml(str){return String(str).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}

  function arenaDifficulty(){ return clamp(.92 + (profile.rating-900)/1000, .9, 1.45); }

  function bindEvents(){
    $$('[data-open-mode]').forEach(btn=>btn.addEventListener('click',()=>openMode(btn.dataset.openMode)));
    $('#profileBtn').addEventListener('click',()=>{renderProfile();showScreen('profile');});
    $('#walletBtn').addEventListener('click',goWallet);
    $('#flagFr').addEventListener('click',()=>setLang('fr'));
    $('#flagEn').addEventListener('click',()=>setLang('en'));
    $('#backBtn').addEventListener('click',goBack);
    $('#soundBtn').addEventListener('click',toggleSound);
    $('#arenaFightBtn').addEventListener('click',()=>{
      if(!selectedArenaFighter){toast(tr('selectFighter'));return;}
      const ids=Object.keys(CHARACTERS); const enemy=ids[randomInt(0,ids.length-1)];
      startBattle({mode:'arena',player:selectedArenaFighter,enemy,difficulty:arenaDifficulty()});
    });
    $('#duelStartBtn').addEventListener('click',()=>{
      if(!duelSelections[1]||!duelSelections[2]){toast(tr('selectFighter'));return;}
      startBattle({mode:'duel',player:duelSelections[1],enemy:duelSelections[2],difficulty:1});
    });
    $('#quitBattleBtn').addEventListener('click',quitBattle);
    $('#passReadyBtn').addEventListener('click',readyAfterPass);
    $('#modalOverlay').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeModal(); });
    $('#modalContent').addEventListener('click',e=>{
      const btn=e.target.closest('[data-modal-action]'); if(btn) handleModalAction(btn.dataset.modalAction);
    });
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'){
        if($('#modalOverlay').classList.contains('show')) closeModal();
        else if(currentScreen!=='menu'&&currentScreen!=='battle') goBack();
      }
    });
  }

  function initPwa(){
    if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(()=>{});
  }

  function init(){
    initTelegram(); bindEvents(); applyLanguage(); renderCampaign(); renderArena(); renderDuel(); renderProfile(); renderAccessState(); detectHolder(); initPwa();
  }

  document.addEventListener('DOMContentLoaded',init);
})();
