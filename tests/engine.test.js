'use strict';
/**
 * Tests du moteur : mise en place, fin de manche, bonus Espionne, jetons,
 * fin de partie (et départage), actions de l'hôte.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createGame, applyHostAction, allCards, buildDeck } = require('../server/game/engine');
const { getEdition } = require('../server/editions');
const { makeRound, act, assertGameError, player } = require('./helpers');

const ed = getEdition('2019');
const names = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Joueur ${i}` }));

describe('Paquet et mise en place', () => {
  test('le paquet compte 21 cartes avec les bonnes quantités', () => {
    const deck = buildDeck(ed);
    assert.equal(deck.length, 21);
    const expected = { spy: 2, guard: 6, priest: 2, baron: 2, handmaid: 2, prince: 2, chancellor: 2, king: 1, countess: 1, princess: 1 };
    for (const [id, n] of Object.entries(expected)) {
      assert.equal(deck.filter((c) => c === id).length, n, id);
    }
    const values = Object.fromEntries(ed.cards.map((c) => [c.id, c.value]));
    assert.deepEqual(values, { spy: 0, guard: 1, priest: 2, baron: 3, handmaid: 4, prince: 5, chancellor: 6, king: 7, countess: 8, princess: 9 });
  });

  for (const [n, tokens] of [[2, 6], [3, 5], [4, 4], [5, 3], [6, 3]]) {
    test(`mise en place à ${n} joueurs`, () => {
      const { state } = createGame({ players: names(n), seed: 42 + n });
      assert.equal(state.tokensToWin, tokens);
      assert.equal(state.phase, 'playing');
      assert.equal(state.faceUp.length, n === 2 ? 3 : 0, 'cartes visibles seulement à 2 joueurs');
      assert.ok(state.setAside, 'une carte écartée face cachée');
      for (const p of state.players) {
        assert.equal(p.hand.length, p.id === state.current ? 2 : 1);
      }
      assert.equal(state.deck.length, 21 - 1 - state.faceUp.length - n - 1);
      assert.equal(allCards(state).length, 21);
      assert.deepEqual([...allCards(state)].sort(), [...buildDeck(ed)].sort());
    });
  }

  test('refuse moins de 2 ou plus de 6 joueurs', () => {
    assertGameError(() => createGame({ players: names(1) }), 'BAD_PLAYER_COUNT');
    assertGameError(() => createGame({ players: names(7) }), 'BAD_PLAYER_COUNT');
  });

  test('déterministe avec une graine, premier joueur tiré au hasard', () => {
    const a = createGame({ players: names(4), seed: 7 }).state;
    const b = createGame({ players: names(4), seed: 7 }).state;
    assert.deepEqual(a, b);
    const starters = new Set();
    for (let seed = 0; seed < 50; seed++) starters.add(createGame({ players: names(4), seed }).state.current);
    assert.equal(starters.size, 4, 'chaque joueur peut commencer');
  });
});

describe('Fin de manche', () => {
  test('par élimination : le survivant gagne et commence la manche suivante', () => {
    const s = makeRound({ players: ['A', 'B'], hands: { A: ['guard', 'priest'], B: ['baron'] }, deck: ['king', 'handmaid'] });
    let { state } = act(s, 'A', { type: 'play', card: 'guard', target: 'B', guess: 'baron' });
    assert.equal(state.phase, 'roundOver');
    assert.equal(state.roundResult.reason, 'lastStanding');
    assert.deepEqual(state.roundResult.winners, ['A']);
    assert.deepEqual(state.roundResult.revealed, {}, 'le survivant ne révèle pas sa main');
    assert.equal(player(state, 'A').tokens, 1);
    assertGameError(() => act(state, 'A', { type: 'play', card: 'priest', target: 'B' }), 'BAD_PHASE');

    state = applyHostAction(state, { type: 'nextRound' }).state;
    assert.equal(state.round, s.round + 1);
    assert.equal(state.current, 'A');
    assert.equal(state.phase, 'playing');
    assert.equal(allCards(state).length, 21);
    assert.equal(player(state, 'A').tokens, 1, 'les jetons sont conservés');
  });

  test('pioche vide : la plus forte main gagne', () => {
    const s = makeRound({ players: ['A', 'B', 'C'], hands: { A: ['handmaid', 'guard'], B: ['king'], C: ['priest'] }, deck: [] });
    const { state } = act(s, 'A', { type: 'play', card: 'handmaid' });
    assert.equal(state.roundResult.reason, 'deckEmpty');
    assert.deepEqual(state.roundResult.winners, ['B']);
    assert.deepEqual(state.roundResult.revealed, { A: 'guard', B: 'king', C: 'priest' });
    assert.equal(state.nextStarter, 'B');
  });

  test('pioche vide, égalité : la plus grande somme de défausse gagne', () => {
    const s = makeRound({
      players: ['A', 'B'], hands: { A: ['handmaid', 'prince'], B: ['prince'] }, deck: [],
      discards: { A: ['guard'], B: ['baron'] },
    });
    const { state } = act(s, 'A', { type: 'play', card: 'handmaid' });
    assert.deepEqual(state.roundResult.discardSums, { A: 5, B: 3 });
    assert.deepEqual(state.roundResult.winners, ['A']);
    assert.equal(player(state, 'A').tokens, 1);
    assert.equal(player(state, 'B').tokens, 0);
  });

  test('pioche vide, égalité totale : tous les ex aequo gagnent un jeton', () => {
    const s = makeRound({
      players: ['A', 'B', 'C'], hands: { A: ['handmaid', 'prince'], B: ['prince'], C: ['guard'] }, deck: [],
      discards: { A: ['guard'], B: ['prince'], C: [] }, current: 'B',
    });
    // B commence (startPlayer) : on fait jouer... A n'est pas actif. On met A actif mais B premier joueur.
    s.current = 'A';
    s.startPlayer = 'B';
    const { state } = act(s, 'A', { type: 'play', card: 'handmaid' });
    assert.deepEqual(state.roundResult.discardSums, { A: 5, B: 5, C: 0 });
    assert.deepEqual(state.roundResult.winners, ['B', 'A'], 'ordre du tour depuis le premier joueur (B)');
    assert.equal(player(state, 'A').tokens, 1);
    assert.equal(player(state, 'B').tokens, 1);
    assert.equal(state.nextStarter, 'B', 'le premier gagnant dans l\'ordre du tour commence');
  });
});

describe('Espionne', () => {
  // Gabarit : A joue la Servante, pioche vide → fin de manche avec A=Garde, B=Roi, C=Prêtre (B gagne).
  const base = (extra) => makeRound({
    players: ['A', 'B', 'C'], hands: { A: ['handmaid', 'guard'], B: ['king'], C: ['priest'] }, deck: [], ...extra,
  });

  test('un seul joueur en lice l\'a jouée : il gagne un jeton (sans gagner la manche)', () => {
    const { state } = act(base({ discards: { A: ['spy'] } }), 'A', { type: 'play', card: 'handmaid' });
    assert.equal(state.roundResult.spyBonus, 'A');
    assert.equal(player(state, 'A').tokens, 1);
    assert.equal(player(state, 'B').tokens, 1);
    assert.equal(player(state, 'C').tokens, 0);
  });

  test('deux joueurs en lice : aucun bonus', () => {
    const { state, events } = act(base({ discards: { A: ['spy'], C: ['spy'] } }), 'A', { type: 'play', card: 'handmaid' });
    assert.equal(state.roundResult.spyBonus, null);
    assert.deepEqual(state.roundResult.spyHolders, ['A', 'C']);
    assert.equal(player(state, 'A').tokens, 0);
    assert.ok(events.some((e) => e.type === 'spyBonus' && e.player === null));
  });

  test("Espionne d'un joueur ensuite éliminé : il ne compte plus", () => {
    // C a joué une Espionne puis a été éliminé ; A est le seul en lice avec une Espionne.
    const s = makeRound({
      players: ['A', 'B', 'C'], hands: { A: ['handmaid', 'guard'], B: ['king'], C: [] }, deck: [],
      discards: { A: ['spy'], C: ['spy', 'priest'] }, eliminated: ['C'],
    });
    const { state } = act(s, 'A', { type: 'play', card: 'handmaid' });
    assert.equal(state.roundResult.spyBonus, 'A');

    // Seul C (éliminé) en a joué : personne n'a le bonus.
    const s2 = makeRound({
      players: ['A', 'B', 'C'], hands: { A: ['handmaid', 'guard'], B: ['king'], C: [] }, deck: [],
      discards: { C: ['spy', 'priest'] }, eliminated: ['C'],
    });
    const r2 = act(s2, 'A', { type: 'play', card: 'handmaid' }).state;
    assert.equal(r2.roundResult.spyBonus, null);
    assert.equal(player(r2, 'C').tokens, 0);
  });

  test("élimination en cours de manche d'un joueur ayant joué l'Espionne", () => {
    // B a joué une Espionne ; A l'élimine au Garde. Seul A (Espionne aussi) reste avec C.
    let s = makeRound({
      players: ['A', 'B', 'C'], hands: { A: ['guard', 'handmaid'], B: ['baron'], C: ['priest'] }, deck: ['guard'],
      discards: { A: ['spy'], B: ['spy'] },
    });
    s = act(s, 'A', { type: 'play', card: 'guard', target: 'B', guess: 'baron' }).state;
    assert.equal(player(s, 'B').eliminated, true);
    // C pioche le dernier Garde et le joue sans toucher : pioche vide → fin de manche.
    const { state } = act(s, 'C', { type: 'play', card: 'guard', target: 'A', guess: 'king' });
    assert.equal(state.phase, 'roundOver');
    assert.equal(state.roundResult.spyBonus, 'A');
  });

  test('Espionne défaussée via le Prince : compte comme défaussée', () => {
    const s = makeRound({
      players: ['A', 'B', 'C'], hands: { A: ['prince', 'guard'], B: ['spy'], C: ['king'] }, deck: ['baron'],
    });
    const { state } = act(s, 'A', { type: 'play', card: 'prince', target: 'B' });
    assert.deepEqual(player(state, 'B').hand, ['baron']);
    assert.equal(state.phase, 'roundOver');
    assert.deepEqual(state.roundResult.winners, ['C']);
    assert.equal(state.roundResult.spyBonus, 'B');
    assert.equal(player(state, 'B').tokens, 1);
  });

  test('Espionne jouée normalement + victoire de manche : bonus cumulé (2 jetons)', () => {
    const s = makeRound({
      players: ['A', 'B'], hands: { A: ['spy', 'king'], B: ['guard'] }, deck: [],
    });
    const { state } = act(s, 'A', { type: 'play', card: 'spy' });
    assert.deepEqual(state.roundResult.winners, ['A']);
    assert.equal(state.roundResult.spyBonus, 'A');
    assert.deepEqual(state.roundResult.gained, { A: 2 });
    assert.equal(player(state, 'A').tokens, 2);
  });
});

describe('Fin de partie', () => {
  test('un joueur atteint le seuil : il gagne', () => {
    const s = makeRound({ players: ['A', 'B'], hands: { A: ['guard', 'priest'], B: ['baron'] }, deck: ['king'], tokens: { A: 5, B: 3 } });
    const { state, events } = act(s, 'A', { type: 'play', card: 'guard', target: 'B', guess: 'baron' });
    assert.equal(state.phase, 'gameOver');
    assert.deepEqual(state.winners, ['A']);
    assert.ok(events.some((e) => e.type === 'gameEnd'));
    assertGameError(() => applyHostAction(state, { type: 'nextRound' }), 'BAD_PHASE');
  });

  test('deux joueurs atteignent le seuil : le plus de jetons gagne', () => {
    // 3 joueurs (seuil 5). A et B à 4 jetons, égalité totale en fin de manche, A a l'Espionne → A=6, B=5.
    const s = makeRound({
      players: ['A', 'B', 'C'], hands: { A: ['handmaid', 'guard'], B: ['guard'], C: [] }, deck: [],
      discards: { A: ['spy', 'prince'], B: ['prince', 'handmaid'], C: ['priest'] }, eliminated: ['C'],
      tokens: { A: 4, B: 4 },
    });
    const { state } = act(s, 'A', { type: 'play', card: 'handmaid' });
    assert.deepEqual(state.roundResult.winners.sort(), ['A', 'B']);
    assert.equal(player(state, 'A').tokens, 6);
    assert.equal(player(state, 'B').tokens, 5);
    assert.equal(state.phase, 'gameOver');
    assert.deepEqual(state.winners, ['A']);
  });

  test('égalité au seuil : manche de départage entre les ex aequo', () => {
    // 3 joueurs (seuil 5). A=4 gagne la manche, B=4 a le bonus Espionne → 5 / 5.
    const s = makeRound({
      players: ['A', 'B', 'C'], hands: { A: ['handmaid', 'king'], B: ['guard'], C: ['priest'] }, deck: [],
      discards: { B: ['spy'] }, tokens: { A: 4, B: 4, C: 2 },
    });
    let { state, events } = act(s, 'A', { type: 'play', card: 'handmaid' });
    assert.equal(player(state, 'A').tokens, 5);
    assert.equal(player(state, 'B').tokens, 5);
    assert.equal(state.phase, 'roundOver');
    assert.deepEqual(state.tiebreak, ['A', 'B']);
    assert.ok(events.some((e) => e.type === 'tiebreak'));

    // Manche de départage : seulement A et B, donc mise en place à 2 joueurs (3 cartes visibles).
    state = applyHostAction(state, { type: 'nextRound' }).state;
    assert.deepEqual(state.roundPlayers, ['A', 'B']);
    assert.equal(state.faceUp.length, 3);
    assert.deepEqual(player(state, 'C').hand, []);
    assert.equal(allCards(state).length, 21);
    assert.equal(state.current, 'A', 'A a gagné la manche précédente');

    // On force une fin rapide : A élimine B au Garde.
    player(state, 'A').hand = ['guard', 'priest'];
    player(state, 'B').hand = ['baron'];
    const end = act(state, 'A', { type: 'play', card: 'guard', target: 'B', guess: 'baron' }).state;
    assert.equal(end.phase, 'gameOver');
    assert.deepEqual(end.winners, ['A']);
  });
});

describe("Actions de l'hôte", () => {
  test('éliminer un joueur déconnecté qui n\'est pas actif', () => {
    const s = makeRound({ players: ['A', 'B', 'C'], hands: { A: ['guard', 'priest'], B: ['baron'], C: ['king'] }, deck: ['handmaid', 'guard'] });
    const { state } = applyHostAction(s, { type: 'forceEliminate', target: 'C' });
    assert.equal(player(state, 'C').eliminated, true);
    assert.deepEqual(player(state, 'C').discard, ['king']);
    assert.equal(state.current, 'A');
    assertGameError(() => applyHostAction(state, { type: 'forceEliminate', target: 'C' }), 'BAD_TARGET');
  });

  test('éliminer le joueur actif au milieu du Chancelier débloque la manche', () => {
    let s = makeRound({ players: ['A', 'B', 'C'], hands: { A: ['chancellor', 'guard'], B: ['baron'], C: ['king'] }, deck: ['priest', 'spy', 'handmaid'] });
    s = act(s, 'A', { type: 'play', card: 'chancellor' }).state;
    s = act(s, 'A', { type: 'chancellorKeep', index: 0 }).state; // étape « ordre » en attente
    const total = allCards(s).length;
    const { state } = applyHostAction(s, { type: 'forceEliminate', target: 'A' });
    assert.equal(state.pending, null);
    assert.equal(player(state, 'A').eliminated, true);
    assert.deepEqual(player(state, 'A').discard.sort(), ['chancellor', 'guard', 'priest', 'spy'].sort());
    assert.equal(state.current, 'B');
    assert.equal(allCards(state).length, total);
  });

  test('éliminer le dernier adversaire pendant un Chancelier : fin de manche sans perte de carte', () => {
    let s = makeRound({ players: ['A', 'B'], hands: { A: ['chancellor', 'guard'], B: ['baron'] }, deck: ['priest', 'spy', 'handmaid'] });
    s = act(s, 'A', { type: 'play', card: 'chancellor' }).state;
    const total = allCards(s).length;
    const { state } = applyHostAction(s, { type: 'forceEliminate', target: 'B' });
    assert.equal(state.phase, 'roundOver');
    assert.deepEqual(state.roundResult.winners, ['A']);
    assert.equal(allCards(state).length, total);
  });

  test('retirer un joueur de la partie entre deux manches', () => {
    const s = makeRound({ players: ['A', 'B', 'C'], hands: { A: ['guard', 'priest'], B: ['baron'], C: ['king'] }, deck: ['handmaid'] });
    assertGameError(() => applyHostAction(s, { type: 'removePlayer', target: 'C' }), 'BAD_PHASE');
    let state = applyHostAction(s, { type: 'forceEliminate', target: 'C' }).state;
    state = act(state, 'A', { type: 'play', card: 'guard', target: 'B', guess: 'baron' }).state;
    assert.equal(state.phase, 'roundOver');
    state = applyHostAction(state, { type: 'removePlayer', target: 'C' }).state;
    state = applyHostAction(state, { type: 'nextRound' }).state;
    assert.deepEqual(state.roundPlayers, ['A', 'B']);
    assert.equal(state.faceUp.length, 3);
    assert.equal(state.tokensToWin, 5, 'le seuil reste celui du début de partie');
  });

  test('retirer un joueur quand il ne reste qu\'un adversaire termine la partie', () => {
    const s = makeRound({ players: ['A', 'B'], hands: { A: ['guard', 'priest'], B: ['baron'] }, deck: ['handmaid'], tokens: { A: 2 } });
    let state = act(s, 'A', { type: 'play', card: 'guard', target: 'B', guess: 'baron' }).state;
    state = applyHostAction(state, { type: 'removePlayer', target: 'B' }).state;
    assert.equal(state.phase, 'gameOver');
    assert.deepEqual(state.winners, ['A']);
  });
});
