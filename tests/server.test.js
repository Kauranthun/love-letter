'use strict';
/**
 * Test d'intégration réseau : vrai serveur HTTP + socket.io, vrais clients socket.io.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createServer } = require('../server/index');

let srv;
let base;
const clients = [];

before(async () => {
  srv = createServer();
  const port = await srv.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  for (const c of clients) c.close();
  await srv.close();
});

/** Client qui mémorise le dernier état reçu. */
function client() {
  const s = connect(base, { transports: ['websocket'], forceNew: true, reconnection: false });
  s.lastState = null;
  s.on('state', (st) => { s.lastState = st; });
  clients.push(s);
  return new Promise((resolve) => s.on('connect', () => resolve(s)));
}

function call(s, event, data) {
  return new Promise((resolve) => s.emit(event, data, resolve));
}

/** Attend un état vérifiant `pred` (ou échoue au bout de 2 s). */
function waitState(s, pred) {
  if (s.lastState && pred(s.lastState)) return Promise.resolve(s.lastState);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('état attendu non reçu')), 2000);
    const on = (st) => {
      if (pred(st)) {
        clearTimeout(timer);
        s.off('state', on);
        resolve(st);
      }
    };
    s.on('state', on);
  });
}

test('ressources servies localement', async () => {
  for (const p of ['/', '/socket.io/socket.io.js', '/api/edition', '/api/info']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
  }
  const qr = await fetch(`${base}/api/qr.svg?code=ABCD`);
  assert.equal(qr.status, 200);
  assert.match(qr.headers.get('content-type'), /svg/);
  const ed = await (await fetch(`${base}/api/edition`)).json();
  assert.equal(ed.cards.reduce((s, c) => s + c.count, 0), 21);
});

test('partie complète : création, arrivée, lancement, déconnexion et reprise', async () => {
  const alice = await client();
  const bob = await client();

  const r1 = await call(alice, 'create', { name: 'Alice' });
  assert.equal(r1.ok, true);
  assert.match(r1.code, /^[A-Z]{4}$/);

  const bad = await call(bob, 'join', { code: 'ZZZZ', name: 'Bob' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Aucune partie/);

  const r2 = await call(bob, 'join', { code: r1.code, name: 'Bob' });
  assert.equal(r2.ok, true);
  await waitState(alice, (s) => s.room.players.length === 2);

  assert.equal((await call(bob, 'start')).ok, false, "Bob n'est pas l'hôte");
  assert.equal((await call(alice, 'start')).ok, true);
  const sa = await waitState(alice, (s) => s.game);
  const sb = await waitState(bob, (s) => s.game);
  assert.equal(sa.game.faceUp.length, 3);
  assert.ok(sa.game.players.every((p) => p.hand === undefined));
  assert.ok(!JSON.stringify(sb).includes(r1.token));

  // Action illégale : réponse d'erreur, le serveur continue.
  const illegal = await call(alice, 'action', { type: 'play', card: 'dragon' });
  assert.equal(illegal.ok, false);
  const garbage = await call(alice, 'action', 42);
  assert.equal(garbage.ok, false);

  // Bob perd la connexion ; Alice le voit déconnecté.
  bob.close();
  await waitState(alice, (s) => s.room.players.find((p) => p.name === 'Bob').connected === false);

  // Bob revient avec son jeton depuis une nouvelle connexion.
  const bob2 = await client();
  const r3 = await call(bob2, 'resume', { token: r2.token });
  assert.equal(r3.ok, true);
  const back = await waitState(bob2, (s) => s.game);
  assert.equal(back.me.name, 'Bob');
  assert.deepEqual(back.game.hand.length, sb.game.hand.length);
  await waitState(alice, (s) => s.room.players.find((p) => p.name === 'Bob').connected === true);

  // Le joueur actif joue un coup légal proposé par le serveur.
  const actor = sa.game.current === sa.me.id ? alice : bob2;
  const view = (actor === alice ? alice : bob2).lastState.game;
  const move = view.legal.find((e) => e.playable);
  const action = { type: 'play', card: move.card };
  if (move.targets && move.targets.length) action.target = move.targets[0];
  if (move.guesses && action.target) action.guess = move.guesses[0];
  const res = await call(actor, 'action', action);
  assert.equal(res.ok, true, res.error);
});
