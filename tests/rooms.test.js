'use strict';
/**
 * Tests des salles (sans réseau) : lobby, hôte, déconnexion, reconnexion
 * — y compris au milieu d'une décision en attente (Chancelier).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { RoomManager, RoomError, cleanName } = require('../server/rooms');
const { GameError } = require('../server/game/engine');

/** Gestionnaire avec un « faux réseau » qui enregistre tout ce qui est émis. */
function setup() {
  const out = new Map();
  const box = (sid) => {
    if (!out.has(sid)) out.set(sid, { states: [], events: [], history: null, kicked: null });
    return out.get(sid);
  };
  const emit = (sid, ev, data) => {
    const b = box(sid);
    if (ev === 'state') b.states.push(data);
    else if (ev === 'events') b.events.push(...data);
    else if (ev === 'history') b.history = data;
    else if (ev === 'kicked') b.kicked = data;
  };
  let clock = 1000;
  const m = new RoomManager({ emit, now: () => clock });
  return {
    m, box,
    last: (sid) => box(sid).states.at(-1),
    tick: (ms) => { clock += ms; },
  };
}

function throwsRoom(fn, code) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof RoomError || err instanceof GameError, String(err));
    if (code) assert.equal(err.code, code, err.message);
    return true;
  });
}

/** Salle avec 3 joueurs : Alice (hôte, s1), Bob (s2), Chloé (s3). */
function room3(t) {
  const a = t.m.create('s1', 'Alice');
  const b = t.m.join('s2', a.code, 'Bob');
  const c = t.m.join('s3', a.code.toLowerCase(), 'Chloé');
  return { a, b, c, room: t.m.rooms.get(a.code) };
}

describe('Lobby', () => {
  test('création et arrivée des joueurs', () => {
    const t = setup();
    const { a, b, room } = room3(t);
    assert.match(a.code, /^[A-HJ-NP-Z]{4}$/);
    assert.equal(room.hostId, a.playerId);
    const view = t.last('s2');
    assert.equal(view.room.status, 'lobby');
    assert.deepEqual(view.room.players.map((p) => p.name), ['Alice', 'Bob', 'Chloé']);
    assert.equal(view.me.id, b.playerId);
    assert.equal(view.me.isHost, false);
    assert.deepEqual(view.room.tokensToWin, { 2: 6, 3: 5, 4: 4, 5: 3, 6: 3 });
  });

  test('les jetons secrets ne sont jamais diffusés', () => {
    const t = setup();
    const { a, b, c } = room3(t);
    t.m.start('s1', { seed: 1 });
    for (const sid of ['s1', 's2', 's3']) {
      const all = JSON.stringify(t.box(sid));
      for (const tok of [a.token, b.token, c.token]) assert.ok(!all.includes(tok), 'jeton diffusé !');
    }
  });

  test('erreurs de connexion au lobby', () => {
    const t = setup();
    const { a } = room3(t);
    throwsRoom(() => t.m.join('x', 'ZZZZ', 'Dan'), 'NO_ROOM');
    throwsRoom(() => t.m.join('x', a.code, 'bob'), 'NAME_TAKEN');
    throwsRoom(() => t.m.join('x', a.code, '   '), 'BAD_NAME');
    throwsRoom(() => t.m.join('x', a.code, 'x'.repeat(17)), 'BAD_NAME');
    t.m.join('s4', a.code, 'Dan');
    t.m.join('s5', a.code, 'Eve');
    t.m.join('s6', a.code, 'Fred');
    throwsRoom(() => t.m.join('s7', a.code, 'Gus'), 'FULL');
  });

  test('nettoyage des pseudos', () => {
    assert.equal(cleanName('  Al   ice  '), 'Al ice');
    assert.equal(cleanName('<b>Bob</b>'), 'bBob/b');
  });

  test("seul l'hôte lance la partie, à 2 joueurs minimum", () => {
    const t = setup();
    const a = t.m.create('s1', 'Alice');
    throwsRoom(() => t.m.start('s1'), 'NOT_ENOUGH');
    t.m.join('s2', a.code, 'Bob');
    throwsRoom(() => t.m.start('s2'), 'NOT_HOST');
    t.m.start('s1', { seed: 3 });
    assert.equal(t.last('s2').room.status, 'game');
    assert.equal(t.last('s2').game.tokensToWin, 6);
    throwsRoom(() => t.m.join('s3', a.code, 'Chloé'), 'STARTED');
  });

  test("si l'hôte quitte le lobby, le rôle passe au suivant", () => {
    const t = setup();
    const { b, room } = room3(t);
    t.m.leave('s1');
    assert.equal(room.hostId, b.playerId);
    assert.equal(t.last('s2').me.isHost, true);
    assert.equal(room.players.length, 2);
  });

  test("l'hôte peut retirer quelqu'un du lobby", () => {
    const t = setup();
    const { c, room } = room3(t);
    throwsRoom(() => t.m.hostAction('s2', { type: 'kick', target: c.playerId }), 'NOT_HOST');
    t.m.hostAction('s1', { type: 'kick', target: c.playerId });
    assert.equal(room.players.length, 2);
    assert.ok(t.box('s3').kicked);
    throwsRoom(() => t.m.resume('s3b', c.token), 'BAD_TOKEN');
  });

  test('plusieurs salles indépendantes', () => {
    const t = setup();
    const r1 = t.m.create('s1', 'Alice');
    const r2 = t.m.create('t1', 'Alice');
    assert.notEqual(r1.code, r2.code);
    t.m.join('s2', r1.code, 'Bob');
    t.m.join('t2', r2.code, 'Bob');
    t.m.start('s1', { seed: 1 });
    assert.equal(t.last('s2').room.status, 'game');
    assert.equal(t.last('t2').room.status, 'lobby');
    assert.deepEqual(t.last('t1').room.players.map((p) => p.name), ['Alice', 'Bob']);
  });
});

describe('Jeu via les salles', () => {
  test('une action illégale renvoie une erreur claire sans modifier la partie', () => {
    const t = setup();
    const { room } = room3(t);
    t.m.start('s1', { seed: 5 });
    const before = JSON.stringify(room.game);
    const notCurrent = room.players.find((p) => p.id !== room.game.current);
    const sid = [...notCurrent.sockets][0];
    throwsRoom(() => t.m.act(sid, { type: 'play', card: 'guard', target: 'x', guess: 'spy' }), 'NOT_YOUR_TURN');
    throwsRoom(() => t.m.act(sid, null), 'BAD_ACTION');
    throwsRoom(() => t.m.act(sid, 'n\'importe quoi'), 'BAD_ACTION');
    throwsRoom(() => t.m.act('inconnu', { type: 'play' }), 'NOT_IN_ROOM');
    assert.equal(JSON.stringify(room.game), before);
  });

  test('chaque joueur ne reçoit que sa propre main', () => {
    const t = setup();
    const { room } = room3(t);
    t.m.start('s1', { seed: 9 });
    for (const p of room.players) {
      const sid = [...p.sockets][0];
      const v = t.last(sid).game;
      assert.deepEqual(v.hand, room.game.players.find((x) => x.id === p.id).hand);
      assert.ok(v.players.every((x) => x.hand === undefined));
    }
  });
});

describe('Déconnexion et reconnexion', () => {
  test('reconnexion au milieu du Chancelier (étapes « garder » puis « ordre »)', () => {
    const t = setup();
    const { a, b, c, room } = room3(t);
    t.m.start('s1', { seed: 11 });

    // Situation contrôlée : Alice est active avec Chancelier + Garde.
    const g = room.game;
    g.current = a.playerId;
    g.startPlayer = a.playerId;
    const P = (id) => g.players.find((p) => p.id === id);
    P(a.playerId).hand = ['chancellor', 'guard'];
    P(b.playerId).hand = ['baron'];
    P(c.playerId).hand = ['king'];
    g.deck = ['priest', 'spy', 'handmaid', 'guard'];

    t.m.act('s1', { type: 'play', card: 'chancellor' });
    assert.equal(t.last('s1').game.pending.step, 'keep');

    // Le téléphone d'Alice se verrouille.
    t.m.disconnect('s1');
    const seenByBob = t.last('s2').room.players.find((p) => p.id === a.playerId);
    assert.equal(seenByBob.connected, false);
    throwsRoom(() => t.m.act('s2', { type: 'play', card: 'baron', target: a.playerId }), 'PENDING');

    // Alice revient avec son jeton : elle retrouve ses 3 cartes et sa décision.
    t.m.resume('s1b', a.token);
    let v = t.last('s1b');
    assert.equal(v.me.id, a.playerId);
    assert.deepEqual(v.game.hand, ['guard', 'priest', 'spy']);
    assert.equal(v.game.pending.step, 'keep');
    assert.ok(t.box('s1b').history.some((e) => e.type === 'draw' && e.cards), 'journal privé restauré');
    assert.equal(t.last('s2').room.players.find((p) => p.id === a.playerId).connected, true);
    // Bob ne voit toujours pas les cartes en suspens
    assert.equal(t.last('s2').game.pending.cards, undefined);

    t.m.act('s1b', { type: 'chancellorKeep', index: 2 }); // garde l'Espionne

    // Nouvelle coupure pendant l'étape « ordre ».
    t.m.disconnect('s1b');
    t.m.resume('s1c', a.token);
    v = t.last('s1c');
    assert.deepEqual(v.game.hand, ['spy']);
    assert.deepEqual(v.game.pending, { kind: 'chancellor', playerId: a.playerId, step: 'return', cards: ['guard', 'priest'] });

    t.m.act('s1c', { type: 'chancellorReturn', order: [0, 1] });
    v = t.last('s1c');
    assert.equal(v.game.pending, null);
    assert.equal(v.game.current, b.playerId);
    // Bob a pioché la Servante ; dessous : le Garde de la pioche, puis Garde et Prêtre remis dans l'ordre.
    assert.deepEqual(room.game.deck, ['guard', 'guard', 'priest']);
  });

  test("l'hôte ne peut éliminer qu'un joueur déconnecté", () => {
    const t = setup();
    const { c, room } = room3(t);
    t.m.start('s1', { seed: 2 });
    throwsRoom(() => t.m.hostAction('s1', { type: 'forceEliminate', target: c.playerId }), 'CONNECTED');
    t.m.disconnect('s3');
    throwsRoom(() => t.m.hostAction('s2', { type: 'forceEliminate', target: c.playerId }), 'NOT_HOST');
    t.m.hostAction('s1', { type: 'forceEliminate', target: c.playerId });
    assert.equal(room.game.players.find((p) => p.id === c.playerId).eliminated, true);
    assert.ok(t.box('s2').events.some((e) => e.type === 'kick'));
  });

  test('une socket inconnue ou un mauvais jeton sont refusés proprement', () => {
    const t = setup();
    room3(t);
    throwsRoom(() => t.m.resume('x', 'faux-jeton'), 'BAD_TOKEN');
    throwsRoom(() => t.m.resume('x', undefined), 'BAD_TOKEN');
    t.m.disconnect('jamais-vue'); // ne doit rien casser
  });

  test('plusieurs onglets du même joueur : déconnecté seulement quand tous sont fermés', () => {
    const t = setup();
    const { a } = room3(t);
    t.m.resume('s1-onglet2', a.token);
    t.m.disconnect('s1');
    assert.equal(t.last('s2').room.players[0].connected, true);
    t.m.disconnect('s1-onglet2');
    assert.equal(t.last('s2').room.players[0].connected, false);
  });

  test('nettoyage des salles abandonnées', () => {
    const t = setup();
    const { a } = room3(t);
    for (const sid of ['s1', 's2', 's3']) t.m.disconnect(sid);
    t.m.cleanup();
    assert.ok(t.m.rooms.has(a.code), 'pas encore expirée');
    t.tick(3 * 3600e3);
    t.m.cleanup();
    assert.ok(!t.m.rooms.has(a.code));
    throwsRoom(() => t.m.resume('x', a.token), 'BAD_TOKEN');
  });
});

describe('Fin de partie', () => {
  test("retour au salon par l'hôte après la fin", () => {
    const t = setup();
    const { a, b } = room3(t);
    t.m.start('s1', { seed: 4 });
    const room = t.m.rooms.get(a.code);
    throwsRoom(() => t.m.hostAction('s1', { type: 'restart' }), 'IN_GAME');
    room.game.phase = 'gameOver';
    room.game.winners = [b.playerId];
    t.m.hostAction('s1', { type: 'restart' });
    assert.equal(t.last('s3').room.status, 'lobby');
    t.m.start('s1', { seed: 5 });
    assert.equal(t.last('s3').room.status, 'game');
  });
});
