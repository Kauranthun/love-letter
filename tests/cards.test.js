'use strict';
/**
 * Tests de chaque carte et de ses cas limites.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { legalPlays } = require('../server/game/engine');
const { eventsFor } = require('../server/game/views');
const { makeRound, act, assertGameError, player } = require('./helpers');

const P3 = ['A', 'B', 'C'];
const DECK = ['handmaid', 'king', 'baron', 'priest', 'guard'];

describe('Garde', () => {
  test('nommer la bonne carte élimine la cible', () => {
    const s = makeRound({ players: P3, hands: { A: ['guard', 'priest'], B: ['baron'], C: ['king'] }, deck: DECK });
    const { state, events } = act(s, 'A', { type: 'play', card: 'guard', target: 'B', guess: 'baron' });
    assert.equal(player(state, 'B').eliminated, true);
    assert.deepEqual(player(state, 'B').discard, ['baron']);
    assert.equal(state.current, 'C', 'B éliminé : le tour passe à C');
    assert.ok(events.some((e) => e.type === 'play' && e.hit === true));
  });

  test('se tromper ne fait rien et le tour passe', () => {
    const s = makeRound({ players: P3, hands: { A: ['guard', 'priest'], B: ['baron'], C: ['king'] }, deck: DECK });
    const { state, events } = act(s, 'A', { type: 'play', card: 'guard', target: 'B', guess: 'king' });
    assert.equal(player(state, 'B').eliminated, false);
    assert.equal(state.current, 'B');
    assert.equal(player(state, 'B').hand.length, 2);
    assert.match(events.find((e) => e.type === 'play').text, /se trompe/);
  });

  test('ne peut pas nommer Garde', () => {
    const s = makeRound({ players: P3, hands: { A: ['guard', 'priest'], B: ['guard'], C: ['king'] }, deck: DECK });
    assertGameError(() => act(s, 'A', { type: 'play', card: 'guard', target: 'B', guess: 'guard' }), 'BAD_GUESS');
  });

  test("peut nommer l'Espionne", () => {
    const s = makeRound({ players: P3, hands: { A: ['guard', 'priest'], B: ['spy'], C: ['king'] }, deck: DECK });
    const { state } = act(s, 'A', { type: 'play', card: 'guard', target: 'B', guess: 'spy' });
    assert.equal(player(state, 'B').eliminated, true);
  });

  test('carte nommée obligatoire et valide', () => {
    const s = makeRound({ players: P3, hands: { A: ['guard', 'priest'], B: ['spy'], C: ['king'] }, deck: DECK });
    assertGameError(() => act(s, 'A', { type: 'play', card: 'guard', target: 'B' }), 'GUESS_REQUIRED');
    assertGameError(() => act(s, 'A', { type: 'play', card: 'guard', target: 'B', guess: 'dragon' }), 'BAD_GUESS');
    assertGameError(() => act(s, 'A', { type: 'play', card: 'guard' }), 'TARGET_REQUIRED');
    assertGameError(() => act(s, 'A', { type: 'play', card: 'guard', target: 'A', guess: 'spy' }), 'BAD_TARGET');
  });

  test('ne peut pas cibler un joueur protégé par la Servante', () => {
    const s = makeRound({ players: P3, hands: { A: ['guard', 'priest'], B: ['spy'], C: ['king'] }, deck: DECK, protectedIds: ['B'] });
    assertGameError(() => act(s, 'A', { type: 'play', card: 'guard', target: 'B', guess: 'spy' }), 'BAD_TARGET');
    const g = legalPlays(s, 'A').find((e) => e.card === 'guard');
    assert.deepEqual(g.targets, ['C']);
  });

  test('tous les adversaires protégés ou éliminés : jouée sans effet', () => {
    const s = makeRound({
      players: P3, hands: { A: ['guard', 'priest'], B: ['spy'], C: [] }, deck: DECK,
      protectedIds: ['B'], eliminated: ['C'],
    });
    const g = legalPlays(s, 'A').find((e) => e.card === 'guard');
    assert.deepEqual(g.targets, []);
    assertGameError(() => act(s, 'A', { type: 'play', card: 'guard', target: 'B', guess: 'spy' }), 'BAD_TARGET');
    const { state, events } = act(s, 'A', { type: 'play', card: 'guard' });
    assert.equal(player(state, 'B').eliminated, false);
    assert.match(events.find((e) => e.type === 'play').text, /sans effet/);
    assert.equal(state.current, 'B');
  });
});

describe('Prêtre', () => {
  test('seul le joueur actif voit la main ciblée', () => {
    const s = makeRound({ players: P3, hands: { A: ['priest', 'guard'], B: ['princess'], C: ['king'] }, deck: DECK });
    const { events } = act(s, 'A', { type: 'play', card: 'priest', target: 'B' });
    const peek = events.find((e) => e.type === 'peek');
    assert.deepEqual(peek.to, ['A']);
    assert.equal(peek.card, 'princess');
    // Le journal public et les vues de B et C ne mentionnent pas la Princesse.
    const pubJson = JSON.stringify(events.filter((e) => e.scope === 'public'));
    assert.ok(!pubJson.includes('princess') && !pubJson.includes('Princesse'));
    assert.ok(!JSON.stringify(eventsFor(events, 'C')).includes('princess'));
    assert.ok(JSON.stringify(eventsFor(events, 'A')).includes('princess'));
  });
});

describe('Baron', () => {
  test('le plus faible est éliminé', () => {
    const s = makeRound({ players: P3, hands: { A: ['baron', 'king'], B: ['priest'], C: ['guard'] }, deck: DECK });
    const { state, events } = act(s, 'A', { type: 'play', card: 'baron', target: 'B' });
    assert.equal(player(state, 'B').eliminated, true);
    assert.equal(player(state, 'A').eliminated, false);
    const detail = events.find((e) => e.type === 'baron');
    assert.deepEqual(detail.to.sort(), ['A', 'B']);
    assert.ok(!JSON.stringify(eventsFor(events, 'C')).includes('king'), 'C ne voit pas le Roi de A');
  });

  test('le joueur actif peut perdre', () => {
    const s = makeRound({ players: P3, hands: { A: ['baron', 'guard'], B: ['king'], C: ['guard'] }, deck: DECK });
    const { state } = act(s, 'A', { type: 'play', card: 'baron', target: 'B' });
    assert.equal(player(state, 'A').eliminated, true);
    assert.equal(player(state, 'B').eliminated, false);
    assert.equal(state.current, 'B');
  });

  test('égalité : rien ne se passe', () => {
    const s = makeRound({ players: P3, hands: { A: ['baron', 'prince'], B: ['prince'], C: ['guard'] }, deck: DECK });
    const { state, events } = act(s, 'A', { type: 'play', card: 'baron', target: 'B' });
    assert.equal(player(state, 'A').eliminated, false);
    assert.equal(player(state, 'B').eliminated, false);
    assert.match(events.find((e) => e.type === 'play').text, /égalité/);
  });
});

describe('Servante', () => {
  test("protège jusqu'au prochain tour du joueur", () => {
    let s = makeRound({ players: P3, hands: { A: ['handmaid', 'guard'], B: ['guard'], C: ['priest'] }, deck: ['guard', 'baron', 'king', 'prince'] });
    s = act(s, 'A', { type: 'play', card: 'handmaid' }).state;
    assert.equal(player(s, 'A').protected, true);
    // B ne peut cibler que C
    assert.deepEqual(legalPlays(s, 'B').find((e) => e.card === 'guard').targets, ['C']);
    s = act(s, 'B', { type: 'play', card: 'guard', target: 'C', guess: 'king' }).state;
    s = act(s, 'C', { type: 'play', card: 'priest', target: 'B' }).state;
    // Retour au tour de A : la protection prend fin
    assert.equal(s.current, 'A');
    assert.equal(player(s, 'A').protected, false);
  });
});

describe('Prince', () => {
  test('sur soi-même : défausse et pioche', () => {
    const s = makeRound({ players: P3, hands: { A: ['prince', 'guard'], B: ['priest'], C: ['baron'] }, deck: ['king', 'handmaid', 'guard'] });
    const { state } = act(s, 'A', { type: 'play', card: 'prince', target: 'A' });
    assert.deepEqual(player(state, 'A').discard, ['prince', 'guard']);
    assert.deepEqual(player(state, 'A').hand, ['king']);
  });

  test('défausser la Princesse élimine la cible', () => {
    const s = makeRound({ players: P3, hands: { A: ['prince', 'guard'], B: ['princess'], C: ['baron'] }, deck: ['king', 'handmaid'] });
    const { state } = act(s, 'A', { type: 'play', card: 'prince', target: 'B' });
    assert.equal(player(state, 'B').eliminated, true);
    assert.deepEqual(player(state, 'B').discard, ['princess']);
    assert.deepEqual(player(state, 'B').hand, []);
  });

  test('pioche vide : la cible prend la carte écartée', () => {
    const s = makeRound({ players: ['A', 'B'], hands: { A: ['prince', 'guard'], B: ['baron'] }, deck: [], setAside: 'king' });
    const { state, events } = act(s, 'A', { type: 'play', card: 'prince', target: 'B' });
    assert.equal(state.setAside, null);
    assert.deepEqual(player(state, 'B').hand, ['king']);
    assert.ok(events.some((e) => e.type === 'setAside'));
    // Pioche vide à la fin du tour : fin de manche, le Roi de B gagne.
    assert.equal(state.phase, 'roundOver');
    assert.deepEqual(state.roundResult.winners, ['B']);
  });

  test('tous les adversaires protégés : le joueur doit se cibler', () => {
    const s = makeRound({ players: P3, hands: { A: ['prince', 'guard'], B: ['priest'], C: ['baron'] }, deck: DECK, protectedIds: ['B', 'C'] });
    assert.deepEqual(legalPlays(s, 'A').find((e) => e.card === 'prince').targets, ['A']);
    assertGameError(() => act(s, 'A', { type: 'play', card: 'prince', target: 'B' }), 'BAD_TARGET');
    assertGameError(() => act(s, 'A', { type: 'play', card: 'prince' }), 'TARGET_REQUIRED');
    const { state } = act(s, 'A', { type: 'play', card: 'prince', target: 'A' });
    assert.deepEqual(player(state, 'A').discard, ['prince', 'guard']);
  });
});

describe('Comtesse', () => {
  test('coup forcé avec le Roi', () => {
    const s = makeRound({ players: P3, hands: { A: ['countess', 'king'], B: ['priest'], C: ['baron'] }, deck: DECK });
    assertGameError(() => act(s, 'A', { type: 'play', card: 'king', target: 'B' }), 'FORCED_PLAY');
    const legal = legalPlays(s, 'A');
    assert.equal(legal.find((e) => e.card === 'king').playable, false);
    assert.equal(legal.find((e) => e.card === 'countess').playable, true);
    const { state } = act(s, 'A', { type: 'play', card: 'countess' });
    assert.deepEqual(player(state, 'A').hand, ['king']);
  });

  test('coup forcé avec le Prince', () => {
    const s = makeRound({ players: P3, hands: { A: ['prince', 'countess'], B: ['priest'], C: ['baron'] }, deck: DECK });
    assertGameError(() => act(s, 'A', { type: 'play', card: 'prince', target: 'A' }), 'FORCED_PLAY');
  });

  test('le Chancelier ne force pas la Comtesse', () => {
    const s = makeRound({ players: P3, hands: { A: ['chancellor', 'countess'], B: ['priest'], C: ['baron'] }, deck: DECK });
    assert.ok(legalPlays(s, 'A').every((e) => e.playable));
    const { state } = act(s, 'A', { type: 'play', card: 'chancellor' });
    assert.equal(state.pending.kind, 'chancellor');
  });

  test('peut être jouée librement sinon', () => {
    const s = makeRound({ players: P3, hands: { A: ['countess', 'guard'], B: ['priest'], C: ['baron'] }, deck: DECK });
    assert.ok(legalPlays(s, 'A').every((e) => e.playable));
  });
});

describe('Roi', () => {
  test('échange les mains', () => {
    const s = makeRound({ players: P3, hands: { A: ['king', 'guard'], B: ['priest'], C: ['baron'] }, deck: DECK });
    const { state, events } = act(s, 'A', { type: 'play', card: 'king', target: 'B' });
    assert.deepEqual(player(state, 'A').hand, ['priest']);
    // B a pioché au début de son tour : sa main contient le Garde reçu + la carte piochée
    assert.equal(player(state, 'B').hand[0], 'guard');
    assert.ok(!JSON.stringify(eventsFor(events, 'C')).includes('priest'));
  });

  test('ne peut pas cibler un joueur protégé', () => {
    const s = makeRound({ players: P3, hands: { A: ['king', 'guard'], B: ['priest'], C: ['baron'] }, deck: DECK, protectedIds: ['B'] });
    assertGameError(() => act(s, 'A', { type: 'play', card: 'king', target: 'B' }), 'BAD_TARGET');
  });
});

describe('Princesse', () => {
  test('la jouer élimine le joueur', () => {
    const s = makeRound({ players: ['A', 'B'], hands: { A: ['princess', 'guard'], B: ['priest'] }, deck: DECK });
    const { state } = act(s, 'A', { type: 'play', card: 'princess' });
    assert.equal(player(state, 'A').eliminated, true);
    assert.equal(state.phase, 'roundOver');
    assert.deepEqual(state.roundResult.winners, ['B']);
  });
});

describe('Chancelier', () => {
  test('pioche de 3+ cartes : garder 1, remettre 2 dans l\'ordre choisi', () => {
    let s = makeRound({ players: P3, hands: { A: ['chancellor', 'guard'], B: ['priest'], C: ['baron'] }, deck: ['priest', 'baron', 'king', 'handmaid'] });
    s = act(s, 'A', { type: 'play', card: 'chancellor' }).state;
    assert.deepEqual(player(s, 'A').hand, ['guard', 'priest', 'baron']);
    assert.deepEqual(s.pending, { kind: 'chancellor', playerId: 'A', step: 'keep', cards: [] });
    assert.equal(s.current, 'A');

    // Personne d'autre ne peut agir, et A ne peut pas jouer une carte.
    assertGameError(() => act(s, 'B', { type: 'play', card: 'priest', target: 'A' }), 'PENDING');
    assertGameError(() => act(s, 'A', { type: 'play', card: 'guard', target: 'B', guess: 'baron' }), 'PENDING');
    assertGameError(() => act(s, 'B', { type: 'chancellorKeep', index: 0 }), 'NOT_YOUR_DECISION');
    assertGameError(() => act(s, 'A', { type: 'chancellorReturn', order: [0, 1] }), 'BAD_STEP');
    assertGameError(() => act(s, 'A', { type: 'chancellorKeep', index: 3 }), 'BAD_INDEX');
    assertGameError(() => act(s, 'A', { type: 'chancellorKeep', index: '1' }), 'BAD_INDEX');

    s = act(s, 'A', { type: 'chancellorKeep', index: 2 }).state; // garde le Baron
    assert.deepEqual(player(s, 'A').hand, ['baron']);
    assert.equal(s.pending.step, 'return');
    assert.deepEqual(s.pending.cards, ['guard', 'priest']);

    assertGameError(() => act(s, 'A', { type: 'chancellorReturn', order: [0, 0] }), 'BAD_ORDER');
    assertGameError(() => act(s, 'A', { type: 'chancellorReturn', order: [1] }), 'BAD_ORDER');
    assertGameError(() => act(s, 'A', { type: 'chancellorReturn', order: [0, 2] }), 'BAD_ORDER');
    assertGameError(() => act(s, 'A', { type: 'chancellorKeep', index: 0 }), 'BAD_STEP');

    // Le Prêtre (index 1) est remis en premier, le Garde (index 0) en second = tout en dessous.
    const { state, events } = act(s, 'A', { type: 'chancellorReturn', order: [1, 0] });
    assert.equal(state.pending, null);
    assert.equal(state.current, 'B');
    assert.deepEqual(player(state, 'B').hand, ['priest', 'king']); // B a pioché le Roi (dessus)
    assert.deepEqual(state.deck, ['handmaid', 'priest', 'guard']);
    // Le journal public ne révèle aucune carte.
    const pub = events.filter((e) => e.scope === 'public');
    assert.ok(!JSON.stringify(pub).includes('priest'));
  });

  test("une seule carte dans la pioche : en piocher 1 et en remettre 1", () => {
    let s = makeRound({ players: P3, hands: { A: ['chancellor', 'guard'], B: ['priest'], C: ['baron'] }, deck: ['king'] });
    s = act(s, 'A', { type: 'play', card: 'chancellor' }).state;
    assert.deepEqual(player(s, 'A').hand, ['guard', 'king']);
    const { state } = act(s, 'A', { type: 'chancellorKeep', index: 1 });
    assert.equal(state.pending, null);
    assert.deepEqual(player(state, 'A').hand, ['king']);
    // Le Garde est remis sous la pioche, puis pioché par B au début de son tour.
    assert.equal(state.current, 'B');
    assert.deepEqual(player(state, 'B').hand, ['priest', 'guard']);
    assert.equal(state.deck.length, 0);
  });

  test('pioche vide : aucun effet', () => {
    const s = makeRound({ players: P3, hands: { A: ['chancellor', 'guard'], B: ['priest'], C: ['baron'] }, deck: [] });
    const { state, events } = act(s, 'A', { type: 'play', card: 'chancellor' });
    assert.equal(state.pending, null);
    assert.match(events.find((e) => e.type === 'play').text, /sans effet/);
    assert.equal(state.phase, 'roundOver'); // pioche vide à la fin du tour
    assert.deepEqual(state.roundResult.winners, ['C']); // Baron (3) > Prêtre (2) > Garde (1)
  });
});

describe('Validation générale', () => {
  test('jouer hors de son tour ou une carte absente', () => {
    const s = makeRound({ players: P3, hands: { A: ['guard', 'priest'], B: ['baron'], C: ['king'] }, deck: DECK });
    assertGameError(() => act(s, 'B', { type: 'play', card: 'baron', target: 'A' }), 'NOT_YOUR_TURN');
    assertGameError(() => act(s, 'A', { type: 'play', card: 'king', target: 'B' }), 'NOT_IN_HAND');
    assertGameError(() => act(s, 'A', { type: 'play', card: 'priest', target: 'Z' }), 'BAD_TARGET');
    assertGameError(() => act(s, 'A', { type: 'dance' }), 'BAD_ACTION');
    assertGameError(() => act(s, 'A', null), 'BAD_ACTION');
    assertGameError(() => act(s, 'Z', { type: 'play', card: 'guard' }), 'UNKNOWN_PLAYER');
  });

  test("une carte sans cible refuse qu'on lui en donne une", () => {
    const s = makeRound({ players: P3, hands: { A: ['handmaid', 'priest'], B: ['baron'], C: ['king'] }, deck: DECK });
    assertGameError(() => act(s, 'A', { type: 'play', card: 'handmaid', target: 'B' }), 'NO_TARGET_ALLOWED');
  });

  test("l'état d'origine n'est jamais modifié", () => {
    const s = makeRound({ players: P3, hands: { A: ['guard', 'priest'], B: ['baron'], C: ['king'] }, deck: DECK });
    const before = JSON.stringify(s);
    act(s, 'A', { type: 'play', card: 'guard', target: 'B', guess: 'baron' });
    assert.equal(JSON.stringify(s), before);
  });
});
