'use strict';
/**
 * Simulation de parties complètes avec des joueurs aléatoires.
 *
 *   npm run bots                      → 600 parties (2 à 6 joueurs)
 *   npm run bots -- --games 2000      → nombre de parties
 *   npm run bots -- --seed 1234       → graine de départ (reproductible)
 *
 * À chaque étape on vérifie les invariants :
 *  - 21 cartes en jeu, composition identique au paquet de l'édition ;
 *  - tailles de main cohérentes (1 carte, 2 pour le joueur actif, Chancelier) ;
 *  - joueur actif en lice ; jetons jamais en baisse ;
 *  - tout coup proposé comme légal est accepté ; un coup illégal lève une GameError (jamais un crash) ;
 *  - aucune vue privée ne contient d'information cachée ;
 *  - la partie se termine (pas de blocage).
 */
const { createGame, applyAction, applyHostAction, legalPlays, allCards, buildDeck, GameError } = require('../server/game/engine');
const { buildView, eventsFor } = require('../server/game/views');
const { getEdition } = require('../server/editions');
const rng = require('../server/game/rng');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const GAMES = opt('games', 600);
const SEED = opt('seed', 20190);
const MAX_STEPS = 20000;

const ed = getEdition('2019');
const REFERENCE = buildDeck(ed).sort().join(',');
const r = { rng: SEED >>> 0 };
const pick = (arr) => arr[rng.randomInt(r, arr.length)];

class InvariantError extends Error {}
function check(cond, msg) {
  if (!cond) throw new InvariantError(msg);
}

/** Vérifie les invariants de l'état. */
function checkState(s, prevTokens) {
  const cards = allCards(s);
  check(cards.length === 21, `nombre de cartes = ${cards.length}`);
  check([...cards].sort().join(',') === REFERENCE, 'composition du paquet altérée');
  for (const p of s.players) {
    check(p.tokens >= (prevTokens[p.id] || 0), `jetons en baisse pour ${p.id}`);
    if (s.phase !== 'playing') continue;
    const inRound = s.roundPlayers.includes(p.id);
    if (!inRound || p.eliminated) {
      check(p.hand.length === 0, `${p.id} hors jeu avec ${p.hand.length} carte(s)`);
    } else if (p.id === s.current) {
      if (s.pending) {
        const ok = s.pending.step === 'keep'
          ? p.hand.length === 2 || p.hand.length === 3
          : p.hand.length === 1 && s.pending.cards.length === 2;
        check(ok, `main incohérente pendant le Chancelier (${p.hand.length})`);
      } else {
        check(p.hand.length === 2, `joueur actif avec ${p.hand.length} carte(s)`);
      }
    } else {
      check(p.hand.length === 1, `${p.id} en lice avec ${p.hand.length} carte(s)`);
    }
  }
  if (s.phase === 'playing') {
    const cur = s.players.find((p) => p.id === s.current);
    check(cur && !cur.eliminated && s.roundPlayers.includes(cur.id), 'joueur actif invalide');
    check(!s.pending || s.pending.playerId === s.current, 'décision en attente d\'un autre joueur');
  }
}

/** Vérification de fuite par marqueurs (même principe que tests/helpers.js). */
function checkNoLeak(s) {
  for (const viewer of s.players) {
    const c = structuredClone(s);
    let k = 0;
    for (const p of c.players) if (p.id !== viewer.id) p.hand = p.hand.map(() => `SECRET_${k++}`);
    c.deck = c.deck.map(() => `SECRET_${k++}`);
    if (c.setAside) c.setAside = `SECRET_${k++}`;
    if (c.pending && c.pending.playerId !== viewer.id) c.pending.cards = c.pending.cards.map(() => `SECRET_${k++}`);
    const json = JSON.stringify(buildView(c, viewer.id));
    check(!json.includes('SECRET_'), `fuite dans la vue de ${viewer.id}`);
  }
}

/** Les événements privés ont des destinataires valides ; le Chancelier ne publie aucune carte. */
function checkEvents(s, events) {
  const ids = new Set(s.players.map((p) => p.id));
  for (const e of events) {
    check(e.scope === 'public' || e.scope === 'private', 'portée d\'événement inconnue');
    check(typeof e.text === 'string' && e.text.length > 0, 'événement sans texte');
    if (e.scope === 'private') check(e.to.every((id) => ids.has(id)), 'destinataire inconnu');
    if (e.scope === 'public') check(e.type !== 'peek' && e.type !== 'baron' && e.type !== 'draw', `événement secret publié (${e.type})`);
  }
  for (const p of s.players) eventsFor(events, p.id);
}

/** Choisit une action aléatoire légale pour le joueur qui doit agir. */
function randomAction(s) {
  if (s.pending) {
    const p = s.players.find((x) => x.id === s.pending.playerId);
    if (s.pending.step === 'keep') return [p.id, { type: 'chancellorKeep', index: rng.randomInt(r, p.hand.length) }];
    return [p.id, { type: 'chancellorReturn', order: pick([[0, 1], [1, 0]]) }];
  }
  const legal = legalPlays(s, s.current).filter((e) => e.playable);
  check(legal.length > 0, 'aucun coup légal pour le joueur actif');
  const e = pick(legal);
  const action = { type: 'play', card: e.card };
  if (e.targets && e.targets.length) action.target = pick(e.targets);
  if (e.guesses && action.target) action.guess = pick(e.guesses);
  return [s.current, action];
}

/** Coup volontairement illégal : doit être refusé proprement. */
function randomIllegal(s) {
  const someone = pick(s.players).id;
  return pick([
    [someone, { type: 'play', card: 'dragon' }],
    [someone, { type: 'chancellorReturn', order: [0, 0] }],
    [someone, { type: 'play', card: 'guard', target: someone, guess: 'guard' }],
    [someone, { type: 'nope' }],
    [someone, { type: 'chancellorKeep', index: 99 }],
  ]);
}

const stats = { games: 0, rounds: 0, steps: 0, tiebreaks: 0, kicks: 0, illegalRejected: 0, byPlayers: {}, spyBonuses: 0, deckEmptyEnds: 0 };

function playGame(n, seed) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `Bot ${i}` }));
  // Une partie sur deux avec la règle officielle (le gagnant commence la manche suivante).
  const nextRoundStarter = seed % 2 ? 'winner' : 'firstEliminated';
  let { state: s } = createGame({ players, seed, options: { nextRoundStarter } });
  let tokens = {};
  let steps = 0;
  checkState(s, tokens);

  while (s.phase !== 'gameOver') {
    check(++steps < MAX_STEPS, 'partie bloquée (trop d\'étapes)');
    let res;
    if (s.phase === 'roundOver') {
      if (s.tiebreak) stats.tiebreaks++;
      stats.rounds++;
      if (s.roundResult.spyBonus) stats.spyBonuses++;
      if (s.roundResult.reason === 'deckEmpty') stats.deckEmptyEnds++;
      const rr = s.roundResult;
      // Premier joueur annoncé : premier éliminé (hors hôte), sinon plus faible main ; ou gagnant (règle officielle).
      if (nextRoundStarter === 'firstEliminated' && rr.eliminationOrder.length && rr.nextStarterReason !== 'seat') {
        check(rr.nextStarter === rr.eliminationOrder[0], 'le premier éliminé ne commence pas');
      }
      if (nextRoundStarter === 'winner' && rr.nextStarterReason === 'winner') {
        check(rr.winners.includes(rr.nextStarter), 'le gagnant ne commence pas');
      }
      res = applyHostAction(s, { type: 'nextRound' });
      check(res.state.current === rr.nextStarter, 'le premier joueur annoncé ne commence pas');
    } else if (rng.nextRandom(r) < 0.01) {
      // L'hôte élimine un joueur « déconnecté » au hasard.
      const alive = s.players.filter((p) => s.roundPlayers.includes(p.id) && !p.eliminated);
      res = applyHostAction(s, { type: 'forceEliminate', target: pick(alive).id });
      stats.kicks++;
    } else {
      if (rng.nextRandom(r) < 0.05) {
        const [pid, bad] = randomIllegal(s);
        try {
          applyAction(s, pid, bad);
        } catch (err) {
          check(err instanceof GameError, `coup illégal : erreur inattendue ${err && err.stack}`);
          stats.illegalRejected++;
        }
      }
      const [pid, action] = randomAction(s);
      try {
        res = applyAction(s, pid, action);
      } catch (err) {
        throw new InvariantError(`coup légal refusé ${JSON.stringify(action)} : ${err.message}`);
      }
    }
    checkEvents(res.state, res.events);
    tokens = Object.fromEntries(s.players.map((p) => [p.id, p.tokens]));
    s = res.state;
    checkState(s, tokens);
    checkNoLeak(s);
  }
  check(s.winners && s.winners.length >= 1, 'partie terminée sans gagnant');
  const w = s.players.find((p) => p.id === s.winners[0]);
  check(w.tokens >= s.tokensToWin || s.players.some((p) => p.removed), 'gagnant sous le seuil');
  stats.steps += steps;
  stats.byPlayers[n] = (stats.byPlayers[n] || 0) + 1;
  stats.games++;
}

const t0 = Date.now();
for (let g = 0; g < GAMES; g++) {
  const n = 2 + (g % 5);
  const seed = SEED * 1000 + g;
  try {
    playGame(n, seed);
  } catch (err) {
    console.error(`\n❌ Échec partie #${g} (${n} joueurs, graine ${seed}) : ${err.message}`);
    if (!(err instanceof InvariantError)) console.error(err.stack);
    process.exit(1);
  }
  if ((g + 1) % 100 === 0) process.stdout.write(`  ${g + 1}/${GAMES} parties…\n`);
}
const dt = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n✅ ${stats.games} parties simulées sans erreur en ${dt} s`);
console.log(`   Répartition (joueurs → parties) : ${JSON.stringify(stats.byPlayers)}`);
console.log(`   Manches : ${stats.rounds} (dont ${stats.deckEmptyEnds} fins par pioche vide), actions : ${stats.steps}`);
console.log(`   Bonus Espionne : ${stats.spyBonuses}, manches de départage : ${stats.tiebreaks}, éliminations par l'hôte : ${stats.kicks}`);
console.log(`   Coups illégaux correctement refusés : ${stats.illegalRejected}`);
