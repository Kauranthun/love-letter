// Écran de jeu : joueurs, main, choix de la carte / cible / carte nommée, Chancelier,
// fins de manche et de partie, outils de l'hôte, journal.
import { esc, toast } from '../util.js';

// ---------------------------------------------------------------------------
// Aides d'affichage
// ---------------------------------------------------------------------------

function helpers(app) {
  const { room, me, game: g } = app.payload;
  const ed = app.edition;
  const card = (id) => ed.byId[id] || { id, name: id, value: '?', text: '', article: '' };
  const player = (id) => g.players.find((p) => p.id === id);
  const pname = (id) => (id === me.id ? 'vous' : esc(player(id) ? player(id).name : '?'));
  const connected = (id) => {
    const rp = room.players.find((p) => p.id === id);
    return !!(rp && rp.connected);
  };
  const label = (id) => esc(card(id).article + card(id).name);
  return { room, me, g, ed, card, player, pname, connected, label };
}

/** Petite étiquette de carte (défausses, résultats). */
function chip(h, id) {
  const c = h.card(id);
  return `<span class="chip v${c.value}"><b>${c.value}</b> ${esc(c.name)}</span>`;
}

/** Grande carte (main). `act` rend la carte cliquable. */
function bigCard(h, id, { act = null, data = '', selected = false, disabled = false, note = '' } = {}) {
  const c = h.card(id);
  const tag = act ? 'button' : 'div';
  const attrs = act ? `data-act="${act}" ${data} ${disabled ? 'disabled' : ''}` : '';
  return `
    <${tag} class="card v${c.value} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}" ${attrs}>
      <span class="card-value">${c.value}</span>
      <span class="card-name">${esc(c.name)}</span>
      <span class="card-text">${esc(c.text)}</span>
      ${note ? `<span class="card-note">${esc(note)}</span>` : ''}
    </${tag}>`;
}

// ---------------------------------------------------------------------------
// Blocs de l'écran
// ---------------------------------------------------------------------------

function topBar(h) {
  const { g } = h;
  return `
  <header class="topbar">
    <span>Manche ${g.round}${g.tiebreak ? ' · départage' : ''}</span>
    <span title="Cartes restantes dans la pioche">🂠 ${g.deckCount}</span>
    <span title="Jetons pour gagner">♥ ${g.tokensToWin}</span>
  </header>`;
}

function playersGrid(h) {
  const { g, me } = h;
  const tiles = g.players.filter((p) => !p.removed).map((p) => {
    const badges = [];
    if (!p.inRound) badges.push('<span title="Ne joue pas cette manche">⏸</span>');
    if (p.eliminated) badges.push('<span title="Éliminé">❌</span>');
    if (p.protected) badges.push('<span title="Protégé par la Servante">🛡️</span>');
    if (p.spyPlayed) badges.push('<span title="A joué ou défaussé une Espionne">🕵️</span>');
    if (!h.connected(p.id)) badges.push('<span title="Déconnecté">📴</span>');
    const cls = [
      'ptile',
      g.phase === 'playing' && g.current === p.id ? 'current' : '',
      p.eliminated || !p.inRound ? 'out' : '',
      p.id === me.id ? 'me' : '',
    ].join(' ');
    return `
    <div class="${cls}">
      <div class="pname">${esc(p.name)}${p.id === me.id ? ' <small>(vous)</small>' : ''}</div>
      <div class="ptokens" title="${p.tokens} jeton(s)">${'♥'.repeat(Math.min(p.tokens, 7))}<small>${p.tokens}/${g.tokensToWin}</small></div>
      <div class="pbadges">${badges.join('')}${p.inRound && !p.eliminated ? `<span class="hc" title="Cartes en main">🂠${p.handCount}</span>` : ''}</div>
    </div>`;
  }).join('');
  return `<div class="players">${tiles}</div>`;
}

function faceUpRow(h) {
  if (!h.g.faceUp.length || h.g.phase !== 'playing') return '';
  return `<div class="faceup"><span>Retirées (visibles) :</span> ${h.g.faceUp.map((c) => chip(h, c)).join(' ')}</div>`;
}

/** Ligne d'état : à qui de jouer ? */
function statusLine(h) {
  const { g, me } = h;
  const mine = h.player(me.id);
  if (g.phase !== 'playing') return '';
  let msg;
  if (mine && !mine.inRound) msg = 'Vous ne participez pas à cette manche de départage.';
  else if (mine && mine.eliminated) msg = `Vous êtes éliminé de cette manche. Au tour de ${h.pname(g.current)}.`;
  else if (g.pending && g.pending.playerId !== me.id) msg = `${h.pname(g.pending.playerId)} utilise le Chancelier…`;
  else if (g.current === me.id) msg = g.pending ? 'Chancelier : à vous de choisir.' : '⭐ À vous de jouer !';
  else msg = `Au tour de ${h.pname(g.current)}.`;
  if (g.current && !h.connected(g.current) && g.current !== me.id) msg += ' (déconnecté)';
  return `<div class="status ${g.current === me.id ? 'my-turn' : ''}">${msg}</div>`;
}

/** Étape courante du choix d'un coup. */
function playStep(entry, sel) {
  if (!sel) return 'card';
  if (entry.targets && entry.targets.length && !sel.target) return 'target';
  if (entry.guesses && sel.target && !sel.guess) return 'guess';
  return 'confirm';
}

function describePlay(h, entry, sel) {
  let s = `Jouer ${h.label(sel.card)}`;
  if (sel.target) s += sel.target === h.me.id ? ' sur vous-même' : ` sur ${h.pname(sel.target)}`;
  if (sel.guess) s += ` en nommant ${h.label(sel.guess)}`;
  if (entry.targets && entry.targets.length === 0) s += ' — sans effet (aucune cible possible)';
  return s;
}

/** Panneau d'action (mon tour) : cible → carte nommée → confirmation. */
function actionPanel(h, ui) {
  const { g } = h;
  const sel = ui.sel;
  if (!sel) return '<div class="panel action"><p>Touchez une carte de votre main pour la jouer.</p></div>';
  const entry = g.legal.find((e) => e.card === sel.card);
  const step = playStep(entry, sel);
  let body = '';
  if (step === 'target') {
    body = `<p>Choisissez une cible pour ${h.label(sel.card)} :</p>
      <div class="choices">${entry.targets.map((id) => `
        <button class="btn choice" data-act="target" data-id="${esc(id)}">${id === h.me.id ? 'Vous-même' : esc(h.player(id).name)}</button>`).join('')}
      </div>`;
  } else if (step === 'guess') {
    body = `<p>Quelle carte pensez-vous que ${h.pname(sel.target)} a en main ?</p>
      <div class="choices guesses">${entry.guesses.map((id) => `
        <button class="btn choice" data-act="guess" data-card="${id}"><b>${h.card(id).value}</b> ${esc(h.card(id).name)}</button>`).join('')}
      </div>`;
  } else {
    body = `<p class="summary">${describePlay(h, entry, sel)}</p>
      <button class="btn primary big" data-act="confirm">Confirmer</button>`;
  }
  return `<div class="panel action">${body}<button class="btn link" data-act="cancel">Annuler</button></div>`;
}

/** Panneau privé du Chancelier. */
function chancellorPanel(h, ui) {
  const pd = h.g.pending;
  if (pd.step === 'keep') {
    const hand = h.g.hand;
    return `
    <div class="panel action chancellor">
      <h2>Chancelier</h2>
      <p>Touchez la carte à <strong>garder</strong>. Les autres iront sous la pioche.</p>
      <div class="hand three">${hand.map((c, i) => bigCard(h, c, { act: 'keepPick', data: `data-index="${i}"`, selected: ui.keep === i })).join('')}</div>
      ${ui.keep !== null ? `<button class="btn primary big" data-act="keepConfirm">Garder ${h.label(hand[ui.keep])}</button>` : ''}
    </div>`;
  }
  // Étape « ordre »
  const cards = pd.cards;
  if (ui.order.length === 0) {
    return `
    <div class="panel action chancellor">
      <h2>Chancelier</h2>
      <p>Vous gardez ${h.label(h.g.hand[0])}. Choisissez la carte à remettre <strong>en premier</strong> sous la pioche
      (l'autre ira tout en dessous).</p>
      <div class="hand two">${cards.map((c) => bigCard(h, c)).join('')}</div>
      <div class="choices">${cards.map((c, i) => `
        <button class="btn choice" data-act="orderPick" data-index="${i}">Remettre ${h.label(c)} en premier</button>`).join('')}
      </div>
    </div>`;
  }
  const [a, b] = ui.order;
  return `
  <div class="panel action chancellor">
    <h2>Chancelier</h2>
    <ol class="order">
      <li>${h.label(cards[a])} — remise en premier</li>
      <li>${h.label(cards[b])} — remise en second (tout en dessous)</li>
    </ol>
    <button class="btn primary big" data-act="orderConfirm">Confirmer</button>
    <button class="btn link" data-act="orderReset">Recommencer</button>
  </div>`;
}

function handSection(h, ui) {
  const { g, me } = h;
  const mine = h.player(me.id);
  if (!mine || !mine.inRound || g.phase !== 'playing') return '';
  if (g.pending && g.pending.playerId === me.id) return ''; // affichée dans le panneau du Chancelier
  if (mine.eliminated) return '';
  const myTurn = g.current === me.id && !g.pending;
  const cards = g.hand.map((c) => {
    if (!myTurn) return bigCard(h, c);
    const entry = g.legal.find((e) => e.card === c);
    return bigCard(h, c, {
      act: 'pick',
      data: `data-card="${c}"`,
      selected: ui.sel && ui.sel.card === c,
      disabled: !entry.playable,
      note: entry.playable ? '' : entry.reason,
    });
  }).join('');
  return `<section class="my-hand"><h2>Votre main</h2><div class="hand ${g.hand.length === 2 ? 'two' : 'one'}">${cards}</div></section>`;
}

function roundOverPanel(h) {
  const { g, me } = h;
  const r = g.roundResult;
  if (!r) return '';
  const reason = r.reason === 'lastStanding'
    ? 'Il ne reste qu\'un joueur en lice.'
    : 'La pioche est vide : les joueurs en lice révèlent leur main.';
  const revealed = Object.entries(r.revealed).map(([id, c]) => `
    <li>${esc(h.player(id).name)} : ${chip(h, c)} <small>défausse : ${r.discardSums[id]}</small></li>`).join('');
  let spy;
  if (r.spyBonus) spy = `🕵️ ${esc(h.player(r.spyBonus).name)} est le seul en lice à avoir joué une Espionne : +1 ♥`;
  else if (r.spyHolders.length > 1) spy = `🕵️ ${r.spyHolders.map((id) => esc(h.player(id).name)).join(' et ')} ont joué une Espionne : pas de bonus.`;
  else spy = '🕵️ Aucun joueur en lice n\'a joué d\'Espionne.';
  const gained = Object.entries(r.gained).map(([id, n]) => `${esc(h.player(id).name)} +${n} ♥`).join(', ');

  let footer;
  if (g.phase === 'gameOver') footer = '';
  else if (me.isHost) footer = `<button class="btn primary big" data-act="nextRound">${g.tiebreak ? 'Lancer le départage' : 'Manche suivante'}</button>`;
  else footer = '<p class="waiting">En attente de l\'hôte pour la manche suivante…</p>';

  return `
  <div class="panel result">
    <h2>Fin de la manche ${r.round}</h2>
    <p>${reason}</p>
    ${revealed ? `<ul class="revealed">${revealed}</ul>` : ''}
    <p class="winners">🏆 ${r.winners.map((id) => esc(h.player(id).name)).join(', ') || 'Aucun gagnant'}</p>
    <p>${spy}</p>
    <p class="gained">${gained || 'Aucun jeton distribué.'}</p>
    ${g.tiebreak && g.phase !== 'gameOver' ? `<p class="tiebreak">⚔️ Égalité : manche de départage entre ${g.tiebreak.map((id) => esc(h.player(id).name)).join(' et ')}.</p>` : ''}
    ${footer}
  </div>`;
}

function gameOverPanel(h) {
  const { g, me } = h;
  const ranking = [...g.players].sort((a, b) => b.tokens - a.tokens);
  return `
  <div class="panel result final">
    <h2>👑 ${g.winners.map((id) => esc(h.player(id).name)).join(', ')} remporte la partie !</h2>
    <ol class="ranking">${ranking.map((p) => `<li><span>${esc(p.name)}</span><span>${p.tokens} ♥</span></li>`).join('')}</ol>
    ${me.isHost ? '<button class="btn primary big" data-act="restart">Nouvelle partie</button>' : '<p class="waiting">L\'hôte peut relancer une partie.</p>'}
  </div>`;
}

/** Outils de l'hôte : débloquer la partie si un joueur ne revient pas. */
function hostPanel(h, ui) {
  const { g, me } = h;
  if (!me.isHost || g.phase === 'gameOver') return '';
  const rows = g.players.filter((p) => !p.removed && p.id !== me.id && !h.connected(p.id)).map((p) => {
    let btn = '';
    if (g.phase === 'playing' && p.inRound && !p.eliminated) {
      const k = `elim:${p.id}`;
      btn = `<button class="btn tiny danger" data-act="forceEliminate" data-id="${esc(p.id)}">${ui.confirmHost === k ? 'Confirmer ?' : 'Éliminer de la manche'}</button>`;
    } else if (g.phase === 'roundOver') {
      const k = `remove:${p.id}`;
      btn = `<button class="btn tiny danger" data-act="removePlayer" data-id="${esc(p.id)}">${ui.confirmHost === k ? 'Confirmer ?' : 'Retirer de la partie'}</button>`;
    }
    return btn ? `<li><span>📴 ${esc(p.name)}</span>${btn}</li>` : '';
  }).join('');
  if (!rows) return '';
  return `<div class="panel host"><h2>Hôte : joueurs déconnectés</h2><ul>${rows}</ul></div>`;
}

function discards(h, ui) {
  const { g } = h;
  const rows = g.players.filter((p) => p.inRound).map((p) => {
    const open = !!ui.open[p.id];
    const last = p.discard.length ? chip(h, p.discard[p.discard.length - 1]) : '<small>vide</small>';
    return `
    <li class="discard-row">
      <button class="discard-head" data-act="toggleDiscard" data-id="${esc(p.id)}" aria-expanded="${open}">
        <span>${esc(p.name)} (${p.discard.length})</span>
        <span class="last">${open ? '▲' : last}</span>
      </button>
      ${open ? `<div class="discard-cards">${p.discard.map((c) => chip(h, c)).join(' ') || '<small>vide</small>'}</div>` : ''}
    </li>`;
  }).join('');
  return `<section class="discards"><h2>Défausses</h2><ul>${rows}</ul></section>`;
}

function logSection(app) {
  const items = app.log.slice(-40).reverse().map((e) =>
    `<li class="${e.scope === 'private' ? 'private' : ''}">${e.scope === 'private' ? '🔒 ' : ''}${esc(e.text)}</li>`).join('');
  return `<section class="log"><h2>Journal</h2><ol>${items}</ol></section>`;
}

// ---------------------------------------------------------------------------
// Écran complet
// ---------------------------------------------------------------------------

export function renderGame(app) {
  const h = helpers(app);
  const { g, me } = h;
  const ui = app.ui;
  let center = '';
  if (g.phase === 'gameOver') center = gameOverPanel(h) + roundOverPanel(h);
  else if (g.phase === 'roundOver') center = roundOverPanel(h);
  else if (g.pending && g.pending.playerId === me.id) center = chancellorPanel(h, ui);
  else if (g.current === me.id && !g.pending) center = actionPanel(h, ui);

  return `
  <section class="screen game">
    ${topBar(h)}
    ${playersGrid(h)}
    ${statusLine(h)}
    ${faceUpRow(h)}
    ${center}
    ${handSection(h, ui)}
    ${hostPanel(h, ui)}
    ${discards(h, ui)}
    ${logSection(app)}
  </section>`;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function send(ctx, event, data) {
  const r = await ctx.request(event, data);
  if (!r.ok) toast(r.error, 'error');
  return r;
}

async function hostConfirm(el, ctx, key, action) {
  if (ctx.app.ui.confirmHost !== key) {
    ctx.app.ui.confirmHost = key;
    return ctx.render();
  }
  ctx.app.ui.confirmHost = null;
  await send(ctx, 'host', action);
}

export const gameActions = {
  pick(el, ctx) {
    const card = el.dataset.card;
    const ui = ctx.app.ui;
    ui.sel = ui.sel && ui.sel.card === card ? null : { card };
    ctx.render();
  },
  target(el, ctx) {
    ctx.app.ui.sel.target = el.dataset.id;
    ctx.render();
  },
  guess(el, ctx) {
    ctx.app.ui.sel.guess = el.dataset.card;
    ctx.render();
  },
  cancel(el, ctx) {
    ctx.app.ui.sel = null;
    ctx.render();
  },
  async confirm(el, ctx) {
    const sel = ctx.app.ui.sel;
    if (!sel) return;
    el.disabled = true;
    const r = await send(ctx, 'action', { type: 'play', card: sel.card, target: sel.target, guess: sel.guess });
    if (!r.ok) {
      ctx.app.ui.sel = null;
      ctx.render();
    }
  },

  keepPick(el, ctx) {
    ctx.app.ui.keep = Number(el.dataset.index);
    ctx.render();
  },
  async keepConfirm(el, ctx) {
    el.disabled = true;
    await send(ctx, 'action', { type: 'chancellorKeep', index: ctx.app.ui.keep });
  },
  orderPick(el, ctx) {
    const i = Number(el.dataset.index);
    ctx.app.ui.order = [i, 1 - i];
    ctx.render();
  },
  orderReset(el, ctx) {
    ctx.app.ui.order = [];
    ctx.render();
  },
  async orderConfirm(el, ctx) {
    el.disabled = true;
    await send(ctx, 'action', { type: 'chancellorReturn', order: ctx.app.ui.order });
  },

  async nextRound(el, ctx) {
    el.disabled = true;
    await send(ctx, 'host', { type: 'nextRound' });
  },
  async restart(el, ctx) {
    el.disabled = true;
    await send(ctx, 'host', { type: 'restart' });
  },
  forceEliminate(el, ctx) {
    const id = el.dataset.id;
    return hostConfirm(el, ctx, `elim:${id}`, { type: 'forceEliminate', target: id });
  },
  removePlayer(el, ctx) {
    const id = el.dataset.id;
    return hostConfirm(el, ctx, `remove:${id}`, { type: 'removePlayer', target: id });
  },

  toggleDiscard(el, ctx) {
    const id = el.dataset.id;
    ctx.app.ui.open[id] = !ctx.app.ui.open[id];
    ctx.render();
  },
};
