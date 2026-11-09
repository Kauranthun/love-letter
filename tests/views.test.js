'use strict';
/**
 * Tests de confidentialité : aucune vue privée ne doit contenir d'information cachée.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createGame, applyHostAction } = require('../server/game/engine');
const { buildView, eventsFor } = require('../server/game/views');
const { makeRound, act, assertNoLeak, player } = require('./helpers');

const names = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Joueur ${i}` }));

describe('Vues privées', () => {
  for (let n = 2; n <= 6; n++) {
    test(`aucune fuite en début de manche à ${n} joueurs`, () => {
      const { state } = createGame({ players: names(n), seed: n });
      for (const p of state.players) {
        const json = assertNoLeak(state, p.id);
        const view = JSON.parse(json);
        assert.deepEqual(view.hand.length, p.hand.length);
        for (const other of view.players) {
          assert.equal(other.hand, undefined, 'jamais de champ « hand » pour les autres joueurs');
        }
        assert.equal(view.deck, undefined);
        assert.equal(view.setAside, undefined);
        assert.equal(view.deckCount, state.deck.length);
      }
      assertNoLeak(state, null); // spectateur
    });
  }

  test('les cartes en attente du Chancelier restent privées', () => {
    let s = makeRound({ players: ['A', 'B', 'C'], hands: { A: ['chancellor', 'guard'], B: ['baron'], C: ['king'] }, deck: ['priest', 'spy', 'handmaid'] });
    s = act(s, 'A', { type: 'play', card: 'chancellor' }).state;
    for (const id of ['B', 'C']) {
      const v = JSON.parse(assertNoLeak(s, id));
      assert.deepEqual(v.pending, { kind: 'chancellor', playerId: 'A' });
      assert.equal(v.players.find((p) => p.id === 'A').handCount, 3);
    }
    const va = buildView(s, 'A');
    assert.deepEqual(va.hand, ['guard', 'priest', 'spy']);
    assert.equal(va.pending.step, 'keep');

    s = act(s, 'A', { type: 'chancellorKeep', index: 1 }).state;
    for (const id of ['B', 'C']) {
      const v = JSON.parse(assertNoLeak(s, id));
      assert.equal(v.pending.cards, undefined);
      assert.equal(v.players.find((p) => p.id === 'A').handCount, 3);
    }
    const va2 = buildView(s, 'A');
    assert.deepEqual(va2.hand, ['priest']);
    assert.deepEqual(va2.pending, { kind: 'chancellor', playerId: 'A', step: 'return', cards: ['guard', 'spy'] });
  });

  test('fin de manche : la carte écartée et la main du survivant restent cachées', () => {
    const s = makeRound({ players: ['A', 'B', 'C'], hands: { A: ['guard', 'king'], B: ['baron'], C: [] }, deck: ['handmaid'], eliminated: ['C'], setAside: 'princess' });
    const { state } = act(s, 'A', { type: 'play', card: 'guard', target: 'B', guess: 'baron' });
    assert.equal(state.phase, 'roundOver');
    for (const id of ['B', 'C']) {
      const json = assertNoLeak(state, id);
      assert.ok(!json.includes('princess'), 'carte écartée non révélée');
      assert.ok(!json.includes('king'), 'main du survivant non révélée');
    }
  });

  test('les légaux ne sont calculés que pour le joueur actif', () => {
    const { state } = createGame({ players: names(4), seed: 3 });
    for (const p of state.players) {
      const v = buildView(state, p.id);
      if (p.id === state.current) assert.equal(v.legal.length > 0, true);
      else assert.deepEqual(v.legal, []);
    }
  });

  test('eventsFor ne transmet que les événements publics et ceux adressés au joueur', () => {
    const events = [
      { scope: 'public', type: 'a', text: 'public' },
      { scope: 'private', to: ['A'], type: 'b', text: 'pour A' },
      { scope: 'private', to: ['A', 'B'], type: 'c', text: 'pour A et B' },
    ];
    assert.deepEqual(eventsFor(events, 'C').map((e) => e.type), ['a']);
    assert.deepEqual(eventsFor(events, 'B').map((e) => e.type), ['a', 'c']);
    assert.deepEqual(eventsFor(events, 'A').map((e) => e.type), ['a', 'b', 'c']);
    assert.ok(eventsFor(events, 'A').every((e) => e.to === undefined));
  });

  test('indicateur Espionne public', () => {
    const s = makeRound({ players: ['A', 'B', 'C'], hands: { A: ['spy', 'guard'], B: ['baron'], C: ['king'] }, deck: ['handmaid', 'priest'] });
    const { state } = act(s, 'A', { type: 'play', card: 'spy' });
    const v = buildView(state, 'C');
    assert.equal(v.players.find((p) => p.id === 'A').spyPlayed, true);
    assert.equal(v.players.find((p) => p.id === 'B').spyPlayed, false);
  });

  test('départage : les joueurs hors manche sont signalés', () => {
    const s = makeRound({
      players: ['A', 'B', 'C'], hands: { A: ['handmaid', 'king'], B: ['guard'], C: ['priest'] }, deck: [],
      discards: { B: ['spy'] }, tokens: { A: 4, B: 4 },
    });
    let state = act(s, 'A', { type: 'play', card: 'handmaid' }).state;
    state = applyHostAction(state, { type: 'nextRound' }).state;
    const v = buildView(state, 'C');
    assert.equal(v.players.find((p) => p.id === 'C').inRound, false);
    assert.deepEqual(v.hand, []);
    assertNoLeak(state, 'C');
    assert.equal(player(state, 'C').tokens, 0);
  });
});
