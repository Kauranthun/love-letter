'use strict';
/**
 * Moteur de jeu Love Letter — PUR : aucune dépendance réseau, aucun effet de bord.
 *
 * API principale :
 *   createGame({ players:[{id,name}], seed?, editionId? })  → { state, events }
 *   applyAction(state, playerId, action)                    → { state, events }
 *   applyHostAction(state, action)                          → { state, events }
 *   legalPlays(state, playerId)                             → coups légaux du joueur actif
 *
 * Les fonctions ne modifient jamais l'état reçu : elles travaillent sur une copie
 * (structuredClone). Une action illégale lève une GameError (message en français).
 *
 * Actions de joueur :
 *   { type:'play', card:'guard', target?:'idJoueur', guess?:'priest' }
 *   { type:'chancellorKeep', index }        → index (dans la main) de la carte à garder
 *   { type:'chancellorReturn', order:[i,j] } → indices (dans pending.cards) : i est remise
 *                                             sous la pioche EN PREMIER, j EN SECOND
 *                                             (j devient donc la toute dernière carte).
 * Actions d'hôte (l'autorisation est vérifiée par rooms.js) :
 *   { type:'nextRound' }                    → lance la manche suivante
 *   { type:'forceEliminate', target }       → élimine un joueur (déconnecté) de la manche
 *   { type:'removePlayer', target }         → retire un joueur de la partie (entre deux manches)
 *
 * Convention de pioche : state.deck[0] est le DESSUS de la pioche, la fin du tableau le DESSOUS.
 *
 * Événements : { scope:'public'|'private', to?:[ids], type, text, ...données }.
 */
const { getEdition } = require('../editions');
const rng = require('./rng');
const { EFFECTS } = require('./cards');

/** Erreur de jeu « attendue » (action illégale) : renvoyée au joueur, jamais fatale. */
class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Accès et utilitaires
// ---------------------------------------------------------------------------

function edition(state) {
  return getEdition(state.editionId);
}

function info(state, cardId) {
  const c = edition(state).cardsById[cardId];
  if (!c) throw new GameError('UNKNOWN_CARD', `Carte inconnue : « ${cardId} ».`);
  return c;
}

/** « le Garde », « l'Espionne »… */
function label(state, cardId) {
  const c = info(state, cardId);
  return `${c.article}${c.name}`;
}

function getPlayer(state, id) {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new GameError('UNKNOWN_PLAYER', 'Joueur inconnu.');
  return p;
}

/** Joueurs de la manche encore en lice, dans l'ordre du tour. */
function alivePlayers(state) {
  return state.players.filter((p) => state.roundPlayers.includes(p.id) && !p.eliminated);
}

/** Ordre du tour (ids) en commençant par `startId` inclus, restreint à `ids`. */
function rotateFrom(state, startId, ids) {
  const all = state.players.map((p) => p.id);
  const k = Math.max(0, all.indexOf(startId));
  return all.slice(k).concat(all.slice(0, k)).filter((id) => ids.includes(id));
}

/** Prochain joueur en lice APRÈS `id` dans l'ordre du tour. */
function nextAliveAfter(state, id) {
  const alive = alivePlayers(state).map((p) => p.id);
  const all = state.players.map((p) => p.id);
  const k = all.indexOf(id);
  return all.slice(k + 1).concat(all.slice(0, k + 1)).find((x) => alive.includes(x)) || null;
}

function pub(events, type, text, data = {}) {
  events.push({ scope: 'public', type, text, ...data });
}

function priv(events, to, type, text, data = {}) {
  events.push({ scope: 'private', to: [...to], type, text, ...data });
}

/**
 * Élimine un joueur : il révèle et défausse sa main, et ne joue plus de la manche.
 * `forced` : élimination décidée par l'hôte (joueur déconnecté) — elle ne compte pas
 * dans l'ordre des éliminations (qui sert à désigner le premier joueur de la manche suivante).
 */
function eliminate(state, p, events, { forced = false } = {}) {
  if (p.eliminated) return;
  p.eliminated = true;
  p.protected = false;
  if (!forced) state.eliminationOrder.push(p.id);
  const revealed = p.hand.splice(0);
  p.discard.push(...revealed);
  const shown = revealed.length ? ` et révèle ${revealed.map((c) => label(state, c)).join(', ')}` : '';
  pub(events, 'eliminated', `❌ ${p.name} est éliminé de la manche${shown}.`, { player: p.id, revealed });
}

/** Pioche de remplacement (Prince) : la pioche, sinon la carte écartée face cachée. */
function drawReplacement(state, p) {
  if (state.deck.length > 0) {
    const card = state.deck.shift();
    p.hand.push(card);
    return { card, fromSetAside: false };
  }
  if (state.setAside) {
    const card = state.setAside;
    state.setAside = null;
    p.hand.push(card);
    return { card, fromSetAside: true };
  }
  // Inaccessible avec les règles 2019 (la manche se termine dès que la pioche est vide).
  return null;
}

/** Utilitaires fournis aux effets de cartes. */
const helpers = { pub, priv, eliminate, label, info, drawReplacement };

/** Construit le paquet complet d'une édition (non mélangé). */
function buildDeck(ed) {
  const deck = [];
  for (const c of ed.cards) for (let i = 0; i < c.count; i++) deck.push(c.id);
  return deck;
}

// ---------------------------------------------------------------------------
// Création de partie et déroulement des manches
// ---------------------------------------------------------------------------

/**
 * Crée une partie et lance la première manche (premier joueur tiré au hasard).
 * @param {{players:{id:string,name:string}[], seed?:number|string, editionId?:string,
 *          options?:{nextRoundStarter?:'firstEliminated'|'winner'}}} opts
 */
function createGame({ players, seed, editionId = '2019', options = {} } = {}) {
  const ed = getEdition(editionId);
  if (!Array.isArray(players)) throw new GameError('BAD_PLAYERS', 'Liste de joueurs manquante.');
  const n = players.length;
  if (n < ed.minPlayers || n > ed.maxPlayers) {
    throw new GameError('BAD_PLAYER_COUNT', `Il faut entre ${ed.minPlayers} et ${ed.maxPlayers} joueurs (actuellement ${n}).`);
  }
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== n) throw new GameError('BAD_PLAYERS', 'Identifiants de joueurs en double.');

  const starterRule = options.nextRoundStarter || (ed.rules && ed.rules.nextRoundStarter) || 'winner';
  if (!['firstEliminated', 'winner'].includes(starterRule)) {
    throw new GameError('BAD_OPTION', `Option inconnue : « ${starterRule} ».`);
  }
  const state = {
    editionId,
    options: { nextRoundStarter: starterRule },
    rng: rng.seedFrom(seed),
    tokensToWin: ed.tokensToWin[n],
    players: players.map((p) => ({
      id: p.id, name: String(p.name), tokens: 0,
      hand: [], discard: [], eliminated: false, protected: false, removed: false,
    })),
    phase: 'setup',          // 'playing' | 'roundOver' | 'gameOver'
    round: 0,
    turn: 0,
    roundPlayers: [],        // ids des joueurs qui participent à la manche en cours
    deck: [],
    setAside: null,          // carte écartée face cachée
    faceUp: [],              // cartes retirées face visible (2 joueurs)
    current: null,           // joueur actif
    startPlayer: null,       // premier joueur de la manche en cours
    pending: null,           // décision en attente (Chancelier)
    eliminationOrder: [],    // ids des joueurs éliminés dans la manche, dans l'ordre
    roundResult: null,
    nextStarter: null,
    nextStarterReason: null, // 'firstEliminated' | 'weakestHand' | 'winner' | 'random'
    tiebreak: null,          // ids des joueurs à départager (fin de partie)
    winners: null,           // gagnant(s) de la partie
  };
  const events = [];
  const starter = state.players[rng.randomInt(state, n)].id;
  state.nextStarterReason = 'random';
  startRound(state, starter, events);
  return { state, events };
}

/** Met en place une manche et commence le tour du premier joueur. */
function startRound(state, starterId, events) {
  const ed = edition(state);
  const participants = state.tiebreak
    ? [...state.tiebreak]
    : state.players.filter((p) => !p.removed).map((p) => p.id);
  state.roundPlayers = state.players.map((p) => p.id).filter((id) => participants.includes(id));
  state.round += 1;
  for (const p of state.players) {
    p.hand = [];
    p.discard = [];
    p.eliminated = false;
    p.protected = false;
  }

  // Mélange, carte écartée face cachée, cartes visibles (à 2 joueurs), une carte par joueur.
  state.deck = rng.shuffle(state, buildDeck(ed));
  state.setAside = state.deck.splice(0, ed.setup.faceDown)[0] || null;
  const faceUpCount = ed.setup.faceUpByPlayerCount[state.roundPlayers.length] || 0;
  state.faceUp = state.deck.splice(0, faceUpCount);
  for (const id of state.roundPlayers) getPlayer(state, id).hand.push(state.deck.shift());

  state.pending = null;
  state.eliminationOrder = [];
  state.roundResult = null;
  state.nextStarter = null;
  state.phase = 'playing';
  const starter = rotateFrom(state, starterId, state.roundPlayers)[0];
  state.startPlayer = starter;

  const tb = state.tiebreak ? ' (manche de départage)' : '';
  const why = starter !== starterId ? '' : {
    random: ' (tiré au sort)',
    firstEliminated: ' (a perdu en premier la manche précédente)',
    weakestHand: ' (avait la plus faible main à la manche précédente)',
    winner: ' (a gagné la manche précédente)',
  }[state.nextStarterReason] || '';
  pub(events, 'roundStart', `📜 Manche ${state.round}${tb} : ${getPlayer(state, starter).name} commence${why}.`,
    { round: state.round, starter, reason: state.nextStarterReason, faceUp: [...state.faceUp] });
  if (state.faceUp.length) {
    pub(events, 'faceUp', `Cartes retirées face visible : ${state.faceUp.map((c) => label(state, c)).join(', ')}.`,
      { cards: [...state.faceUp] });
  }
  beginTurn(state, starter, events);
}

/** Début de tour : la protection de la Servante prend fin, le joueur pioche. */
function beginTurn(state, playerId, events) {
  const p = getPlayer(state, playerId);
  p.protected = false;
  state.current = playerId;
  state.turn += 1;
  const card = state.deck.shift();
  p.hand.push(card);
  pub(events, 'turn', `C'est au tour de ${p.name}.`, { player: playerId });
  priv(events, [playerId], 'draw', `Vous piochez ${label(state, card)}.`, { card });
}

/** Fin de tour : vérifie la fin de manche, sinon passe au joueur suivant. */
function endTurn(state, events) {
  const alive = alivePlayers(state);
  if (alive.length <= 1) return endRound(state, 'lastStanding', events);
  if (state.deck.length === 0) return endRound(state, 'deckEmpty', events);
  beginTurn(state, nextAliveAfter(state, state.current), events);
}

function discardSum(state, p) {
  return p.discard.reduce((s, c) => s + info(state, c).value, 0);
}

/** Fin de manche : désigne le(s) gagnant(s), applique le bonus Espionne, vérifie la fin de partie. */
function endRound(state, reason, events) {
  const ed = edition(state);
  const alive = alivePlayers(state);
  const revealed = {};
  const discardSums = {};
  for (const id of state.roundPlayers) discardSums[id] = discardSum(state, getPlayer(state, id));

  let winners;
  if (reason === 'lastStanding') {
    winners = alive.map((p) => p.id);
  } else {
    // Pioche vide : tous les joueurs en lice révèlent leur main.
    for (const p of alive) revealed[p.id] = p.hand[0];
    const best = Math.max(...alive.map((p) => info(state, p.hand[0]).value));
    let cands = alive.filter((p) => info(state, p.hand[0]).value === best);
    if (cands.length > 1) {
      const bestSum = Math.max(...cands.map((p) => discardSums[p.id]));
      cands = cands.filter((p) => discardSums[p.id] === bestSum);
    }
    winners = cands.map((p) => p.id);
  }

  // Bonus de l'Espionne : un SEUL joueur en lice a joué/défaussé une Espionne.
  const bonusCards = ed.cards.filter((c) => c.endOfRoundBonus === 'spy').map((c) => c.id);
  const spyHolders = alive.filter((p) => p.discard.some((c) => bonusCards.includes(c))).map((p) => p.id);
  const spyBonus = spyHolders.length === 1 ? spyHolders[0] : null;

  const gained = {};
  for (const id of winners) gained[id] = (gained[id] || 0) + 1;
  if (spyBonus) gained[spyBonus] = (gained[spyBonus] || 0) + 1;
  for (const [id, g] of Object.entries(gained)) getPlayer(state, id).tokens += g;

  const ordered = rotateFrom(state, state.startPlayer, winners);
  const next = chooseNextStarter(state, ordered, alive, discardSums);
  state.nextStarter = next.id;
  state.nextStarterReason = next.reason;
  state.current = null;
  state.pending = null;
  state.roundResult = {
    round: state.round,
    reason,
    winners: ordered,
    revealed,
    discardSums,
    spyHolders,
    spyBonus,
    gained,
    eliminationOrder: [...state.eliminationOrder],
    nextStarter: next.id,
    nextStarterReason: next.reason,
  };

  const names = ordered.map((id) => getPlayer(state, id).name).join(', ');
  const why = reason === 'lastStanding' ? 'dernier joueur en lice' : 'pioche vide, plus forte main';
  pub(events, 'roundEnd', `🏆 Fin de la manche ${state.round} (${why}) : ${names || 'aucun gagnant'} remporte${ordered.length > 1 ? 'nt' : ''} un jeton.`,
    { winners: ordered, reason, revealed });
  if (spyBonus) {
    pub(events, 'spyBonus', `🕵️ Bonus Espionne : ${getPlayer(state, spyBonus).name} gagne 1 jeton.`, { player: spyBonus });
  } else if (spyHolders.length > 1) {
    pub(events, 'spyBonus', '🕵️ Plusieurs joueurs en lice ont joué une Espionne : pas de bonus.', { player: null });
  }
  checkGameEnd(state, events);

  // Annonce du premier joueur de la manche suivante (en tenant compte d'un éventuel départage).
  if (state.phase === 'roundOver') {
    const participants = state.tiebreak || state.players.filter((p) => !p.removed).map((p) => p.id);
    const first = rotateFrom(state, state.nextStarter, participants)[0];
    state.roundResult.nextStarter = first;
    if (first !== state.nextStarter) state.roundResult.nextStarterReason = 'seat';
    const because = first === state.nextStarter ? {
      firstEliminated: ' (a perdu en premier)',
      weakestHand: ' (plus faible main, personne n\'a été éliminé)',
      winner: ' (gagnant de la manche)',
    }[state.nextStarterReason] || '' : '';
    pub(events, 'nextStarter', `➜ ${getPlayer(state, first).name} commencera la manche suivante${because}.`,
      { player: first, reason: state.roundResult.nextStarterReason });
  }
}

/**
 * Désigne le premier joueur de la manche suivante selon l'option `nextRoundStarter` :
 *  - 'firstEliminated' : le premier éliminé (hors éliminations par l'hôte) ; si personne n'a été
 *    éliminé, la plus faible main révélée (puis la plus petite défausse, puis l'ordre du tour) ;
 *  - 'winner' : le premier gagnant dans l'ordre du tour (règle officielle).
 */
function chooseNextStarter(state, orderedWinners, alive, discardSums) {
  const fallbackWinner = { id: orderedWinners[0] || state.startPlayer, reason: 'winner' };
  if (state.options.nextRoundStarter !== 'firstEliminated') return fallbackWinner;
  if (state.eliminationOrder.length) return { id: state.eliminationOrder[0], reason: 'firstEliminated' };
  if (alive.length > 1 && alive.every((p) => p.hand.length === 1)) {
    const seat = rotateFrom(state, state.startPlayer, alive.map((p) => p.id));
    const weakest = [...alive].sort((a, b) =>
      info(state, a.hand[0]).value - info(state, b.hand[0]).value ||
      discardSums[a.id] - discardSums[b.id] ||
      seat.indexOf(a.id) - seat.indexOf(b.id))[0];
    return { id: weakest.id, reason: 'weakestHand' };
  }
  return fallbackWinner;
}

/** Vérifie si la partie est terminée (ou s'il faut une manche de départage). */
function checkGameEnd(state, events) {
  const group = state.tiebreak
    ? state.tiebreak.map((id) => getPlayer(state, id))
    : state.players.filter((p) => !p.removed && p.tokens >= state.tokensToWin);

  if (group.length === 0) {
    state.phase = 'roundOver';
    return;
  }
  const max = Math.max(...group.map((p) => p.tokens));
  const top = group.filter((p) => p.tokens === max);
  if (top.length === 1) {
    state.phase = 'gameOver';
    state.winners = [top[0].id];
    state.tiebreak = null;
    pub(events, 'gameEnd', `👑 ${top[0].name} remporte la partie avec ${top[0].tokens} jetons !`, { winners: [top[0].id] });
  } else {
    state.phase = 'roundOver';
    state.tiebreak = top.map((p) => p.id);
    pub(events, 'tiebreak', `⚔️ Égalité à ${max} jetons entre ${top.map((p) => p.name).join(', ')} : manche de départage !`,
      { players: state.tiebreak });
  }
}

// ---------------------------------------------------------------------------
// Coups légaux
// ---------------------------------------------------------------------------

/**
 * Coups possibles du joueur actif. Une entrée par carte distincte en main :
 * { card, playable, reason, targeting, targets, guesses }
 *  - targets : null si la carte ne cible pas ; [] si elle cible mais qu'aucune cible
 *              n'est légale (jouée sans effet) ; sinon la liste des ids ciblables.
 */
function legalPlays(state, playerId) {
  if (state.phase !== 'playing' || state.pending || state.current !== playerId) return [];
  const ed = edition(state);
  const p = getPlayer(state, playerId);
  const hand = p.hand;

  // Coup forcé (Comtesse avec Roi ou Prince).
  const forced = new Set();
  hand.forEach((c, i) => {
    const must = info(state, c).mustPlayIfHolding;
    if (must && hand.some((o, j) => j !== i && must.includes(o))) forced.add(c);
  });

  const out = [];
  for (const c of new Set(hand)) {
    const ci = info(state, c);
    const entry = { card: c, playable: true, reason: null, targeting: ci.targeting || null, targets: null, guesses: null };
    if (forced.size && !forced.has(c)) {
      entry.playable = false;
      entry.reason = `Vous devez jouer ${[...forced].map((f) => label(state, f)).join(' ou ')}.`;
    }
    if (ci.targeting) {
      entry.targets = alivePlayers(state)
        .filter((o) => (o.id === playerId ? ci.targeting === 'anyone' : !o.protected))
        .map((o) => o.id);
    }
    if (ci.effect === 'guess') {
      entry.guesses = ed.cards.map((x) => x.id).filter((id) => !(ci.cannotGuess || []).includes(id));
    }
    out.push(entry);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Actions des joueurs
// ---------------------------------------------------------------------------

function assertPhase(state, phase) {
  if (state.phase !== phase) {
    const msg = {
      playing: "Aucune manche n'est en cours.",
      roundOver: "La manche n'est pas terminée.",
    }[phase] || 'Action impossible maintenant.';
    throw new GameError('BAD_PHASE', msg);
  }
}

function doPlay(state, playerId, action, events) {
  assertPhase(state, 'playing');
  if (state.pending) {
    throw new GameError('PENDING', state.pending.playerId === playerId
      ? 'Terminez d\'abord l\'effet du Chancelier.'
      : `${getPlayer(state, state.pending.playerId).name} doit d'abord terminer son action.`);
  }
  if (state.current !== playerId) throw new GameError('NOT_YOUR_TURN', "Ce n'est pas votre tour.");
  const actor = getPlayer(state, playerId);

  const entry = legalPlays(state, playerId).find((e) => e.card === action.card);
  if (!entry) throw new GameError('NOT_IN_HAND', "Vous n'avez pas cette carte en main.");
  if (!entry.playable) throw new GameError('FORCED_PLAY', entry.reason);

  // Validation de la cible.
  const hasTarget = action.target !== undefined && action.target !== null;
  let target = null;
  if (entry.targets === null) {
    if (hasTarget) throw new GameError('NO_TARGET_ALLOWED', 'Cette carte ne cible personne.');
  } else if (entry.targets.length === 0) {
    if (hasTarget) throw new GameError('BAD_TARGET', 'Aucune cible possible : la carte doit être jouée sans effet.');
  } else {
    if (!hasTarget) throw new GameError('TARGET_REQUIRED', 'Choisissez une cible.');
    if (!entry.targets.includes(action.target)) {
      const t = state.players.find((x) => x.id === action.target);
      let why = 'Cible invalide.';
      if (t && t.protected) why = `${t.name} est protégé par la Servante.`;
      else if (t && t.eliminated) why = `${t.name} est éliminé.`;
      else if (t && t.id === playerId) why = 'Vous ne pouvez pas vous cibler avec cette carte.';
      throw new GameError('BAD_TARGET', why);
    }
    target = getPlayer(state, action.target);
  }

  // Validation de la carte nommée (Garde).
  let guess = null;
  if (entry.guesses && target) {
    if (!action.guess) throw new GameError('GUESS_REQUIRED', 'Nommez une carte.');
    if (!edition(state).cardsById[action.guess]) throw new GameError('BAD_GUESS', `Carte inconnue : « ${action.guess} ».`);
    if (!entry.guesses.includes(action.guess)) {
      throw new GameError('BAD_GUESS', `Vous ne pouvez pas nommer ${label(state, action.guess)}.`);
    }
    guess = action.guess;
  }

  // La carte passe de la main à la défausse, puis on applique son effet.
  actor.hand.splice(actor.hand.indexOf(action.card), 1);
  actor.discard.push(action.card);
  const ci = info(state, action.card);
  EFFECTS[ci.effect]({ state, actor, target, guess, cardId: action.card, events }, helpers);
  if (ci.eliminateOnDiscard) eliminate(state, actor, events);

  if (!state.pending) endTurn(state, events);
}

function assertPending(state, playerId, step) {
  assertPhase(state, 'playing');
  const pd = state.pending;
  if (!pd || pd.kind !== 'chancellor') throw new GameError('NO_PENDING', 'Aucune décision en attente.');
  if (pd.playerId !== playerId) throw new GameError('NOT_YOUR_DECISION', "Ce n'est pas à vous de décider.");
  if (pd.step !== step) {
    throw new GameError('BAD_STEP', step === 'keep'
      ? 'Vous avez déjà choisi la carte à garder : choisissez maintenant l\'ordre.'
      : 'Choisissez d\'abord la carte à garder.');
  }
  return pd;
}

/** Chancelier, étape 1 : choisir la carte gardée. */
function doChancellorKeep(state, playerId, action, events) {
  const pd = assertPending(state, playerId, 'keep');
  const p = getPlayer(state, playerId);
  const idx = action.index;
  if (!Number.isInteger(idx) || idx < 0 || idx >= p.hand.length) {
    throw new GameError('BAD_INDEX', 'Choix de carte invalide.');
  }
  const keep = p.hand[idx];
  const rest = p.hand.filter((_, i) => i !== idx);
  p.hand = [keep];
  if (rest.length === 1) {
    // Une seule carte à remettre : pas besoin de choisir l'ordre.
    state.deck.push(rest[0]);
    state.pending = null;
    pub(events, 'chancellorDone', `${p.name} remet 1 carte sous la pioche.`, { player: playerId, count: 1 });
    endTurn(state, events);
  } else {
    pd.step = 'return';
    pd.cards = rest;
  }
}

/** Chancelier, étape 2 : ordre des deux cartes remises sous la pioche. */
function doChancellorReturn(state, playerId, action, events) {
  const pd = assertPending(state, playerId, 'return');
  const order = action.order;
  const n = pd.cards.length;
  const valid = Array.isArray(order) && order.length === n &&
    order.every((i) => Number.isInteger(i) && i >= 0 && i < n) && new Set(order).size === n;
  if (!valid) throw new GameError('BAD_ORDER', 'Ordre invalide : indiquez chaque carte une seule fois.');
  for (const i of order) state.deck.push(pd.cards[i]);
  state.pending = null;
  pub(events, 'chancellorDone', `${getPlayer(state, playerId).name} remet ${n} cartes sous la pioche.`,
    { player: playerId, count: n });
  endTurn(state, events);
}

/**
 * Applique l'action d'un joueur. Renvoie un NOUVEL état et les événements produits.
 * @throws {GameError} si l'action est illégale
 */
function applyAction(state, playerId, action) {
  if (!action || typeof action !== 'object') throw new GameError('BAD_ACTION', 'Action invalide.');
  const s = structuredClone(state);
  const events = [];
  getPlayer(s, playerId);
  switch (action.type) {
    case 'play': doPlay(s, playerId, action, events); break;
    case 'chancellorKeep': doChancellorKeep(s, playerId, action, events); break;
    case 'chancellorReturn': doChancellorReturn(s, playerId, action, events); break;
    default: throw new GameError('BAD_ACTION', `Action inconnue : « ${action.type} ».`);
  }
  return { state: s, events };
}

// ---------------------------------------------------------------------------
// Actions de l'hôte
// ---------------------------------------------------------------------------

function doForceEliminate(state, targetId, events) {
  assertPhase(state, 'playing');
  const t = getPlayer(state, targetId);
  if (!state.roundPlayers.includes(targetId) || t.eliminated) {
    throw new GameError('BAD_TARGET', `${t.name} n'est pas en lice dans cette manche.`);
  }
  // Si une décision du Chancelier est en attente, les cartes en suspens sont défaussées avec la main.
  if (state.pending && state.pending.playerId === targetId) {
    t.hand.push(...state.pending.cards);
    state.pending = null;
  }
  pub(events, 'kick', `L'hôte retire ${t.name} de la manche (déconnecté).`, { player: targetId });
  eliminate(state, t, events, { forced: true });
  if (state.current === targetId) {
    endTurn(state, events);
  } else if (alivePlayers(state).length <= 1) {
    // Le joueur actif reste seul : il remporte la manche (sa main de 2 cartes n'est pas révélée).
    if (state.pending) {
      const owner = getPlayer(state, state.pending.playerId);
      // Les cartes piochées par le Chancelier retournent sous la pioche.
      const extra = owner.hand.splice(1).concat(state.pending.cards);
      state.deck.push(...extra);
      state.pending = null;
    }
    endRound(state, 'lastStanding', events);
  }
}

function doRemovePlayer(state, targetId, events) {
  if (state.phase !== 'roundOver') {
    throw new GameError('BAD_PHASE', 'On ne peut retirer un joueur de la partie qu\'entre deux manches.');
  }
  const t = getPlayer(state, targetId);
  if (t.removed) throw new GameError('BAD_TARGET', `${t.name} a déjà quitté la partie.`);
  t.removed = true;
  pub(events, 'removed', `${t.name} quitte la partie.`, { player: targetId });
  if (state.tiebreak) state.tiebreak = state.tiebreak.filter((id) => id !== targetId);
  const active = state.players.filter((p) => !p.removed);
  if (active.length < 2 || (state.tiebreak && state.tiebreak.length < 2)) {
    // Plus assez de joueurs : victoire du mieux placé parmi les restants.
    const pool = state.tiebreak && state.tiebreak.length ? state.tiebreak.map((id) => getPlayer(state, id)) : active;
    const max = Math.max(...pool.map((p) => p.tokens));
    state.winners = pool.filter((p) => p.tokens === max).map((p) => p.id);
    state.phase = 'gameOver';
    state.tiebreak = null;
    pub(events, 'gameEnd', `👑 Partie terminée : ${state.winners.map((id) => getPlayer(state, id).name).join(', ')} l'emporte.`,
      { winners: state.winners });
  }
}

/**
 * Actions réservées à l'hôte : 'nextRound', 'forceEliminate', 'removePlayer'.
 * @throws {GameError}
 */
function applyHostAction(state, action) {
  if (!action || typeof action !== 'object') throw new GameError('BAD_ACTION', 'Action invalide.');
  const s = structuredClone(state);
  const events = [];
  switch (action.type) {
    case 'nextRound':
      assertPhase(s, 'roundOver');
      startRound(s, s.nextStarter, events);
      break;
    case 'forceEliminate': doForceEliminate(s, action.target, events); break;
    case 'removePlayer': doRemovePlayer(s, action.target, events); break;
    default: throw new GameError('BAD_ACTION', `Action inconnue : « ${action.type} ».`);
  }
  return { state: s, events };
}

// ---------------------------------------------------------------------------
// Outils de vérification (tests, bots)
// ---------------------------------------------------------------------------

/** Toutes les cartes de la manche, où qu'elles soient (pour l'invariant « 21 cartes »). */
function allCards(state) {
  const cards = [...state.deck, ...state.faceUp];
  if (state.setAside) cards.push(state.setAside);
  for (const p of state.players) cards.push(...p.hand, ...p.discard);
  if (state.pending) cards.push(...state.pending.cards);
  return cards;
}

module.exports = {
  GameError,
  createGame,
  applyAction,
  applyHostAction,
  legalPlays,
  allCards,
  buildDeck,
  // exposés pour les tests
  _internal: { alivePlayers, nextAliveAfter, rotateFrom, startRound },
};
