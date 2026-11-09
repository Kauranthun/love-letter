'use strict';
/**
 * Utilitaires de test : fabrication d'états de jeu précis et vérification des fuites.
 */
const assert = require('node:assert/strict');
const { createGame, applyAction, applyHostAction, GameError } = require('../server/game/engine');
const { buildView } = require('../server/game/views');

/**
 * Crée une manche « sur mesure ». Par défaut le joueur `current` a déjà pioché :
 * on lui donne directement ses 2 cartes dans `hands`.
 */
function makeRound({
  players = ['A', 'B'],
  hands = {},
  deck = [],
  setAside = 'guard',
  faceUp = [],
  current = players[0],
  discards = {},
  protectedIds = [],
  eliminated = [],
  tokens = {},
  seed = 1,
} = {}) {
  const { state } = createGame({ players: players.map((id) => ({ id, name: id })), seed });
  state.deck = [...deck];
  state.setAside = setAside;
  state.faceUp = [...faceUp];
  for (const p of state.players) {
    p.hand = [...(hands[p.id] || [])];
    p.discard = [...(discards[p.id] || [])];
    p.protected = protectedIds.includes(p.id);
    p.eliminated = eliminated.includes(p.id);
    p.tokens = tokens[p.id] || 0;
  }
  state.current = current;
  state.startPlayer = current;
  state.pending = null;
  state.phase = 'playing';
  return state;
}

/** Raccourci : applique une action et renvoie le résultat. */
function act(state, pid, action) {
  return applyAction(state, pid, action);
}

/** Vérifie qu'une fonction lève une GameError avec le code attendu. */
function assertGameError(fn, code) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof GameError, `GameError attendue, reçu : ${err}`);
    if (code) assert.equal(err.code, code, `code attendu ${code}, reçu ${err.code} (${err.message})`);
    return true;
  });
}

function player(state, id) {
  return state.players.find((p) => p.id === id);
}

/**
 * Vérification de fuite par « marqueurs » : on remplace chaque carte cachée au
 * joueur `viewerId` par une chaîne unique SECRET_n, puis on vérifie que la vue
 * sérialisée (ce qui passerait sur le réseau) ne contient aucun marqueur.
 */
function assertNoLeak(state, viewerId) {
  const s = structuredClone(state);
  let k = 0;
  const mark = () => `SECRET_${k++}`;
  for (const p of s.players) if (p.id !== viewerId) p.hand = p.hand.map(mark);
  s.deck = s.deck.map(mark);
  if (s.setAside) s.setAside = mark();
  if (s.pending && s.pending.playerId !== viewerId) s.pending.cards = s.pending.cards.map(mark);
  const json = JSON.stringify(buildView(s, viewerId));
  assert.ok(!json.includes('SECRET_'), `Fuite d'information pour ${viewerId} : ${json}`);
  return json;
}

module.exports = { makeRound, act, assertGameError, player, assertNoLeak, applyHostAction };
