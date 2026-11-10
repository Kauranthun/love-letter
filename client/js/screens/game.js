// Écran de jeu : joueurs, main (cachée par défaut), choix de la carte / cible / carte nommée,
// Chancelier, dernier coup joué, fins de manche et de partie, outils de l'hôte, défausses, journal.
import { esc, toast } from '../util.js';
import { cardArt } from '../cards-art.js';

// ---------------------------------------------------------------------------
// Aides d'affichage
// ---------------------------------------------------------------------------

function helpers(app) {
  const { room, me, game: g } = app.payload;
  const ed = app.edition;
  const card = (id) => ed.byId[id] || { id, name: id, value: '?', text: '', article: '' };
  const player = (id) => g.players.find((p) => p.id === id);
  const name = (id) => esc(player(id) ? player(id).name : '?');
  const pname = (id) => (id === me.id ? 'vous' : name(id));
  const connected = (id) => {
    const rp = room.players.find((p) => p.id === id);
    return !!(rp && rp.connected);
  };
  const label = (id) => esc(card(id).article + card(id).name);
  return { room, me, g, ed, card, player, name, pname, connected, label };
}

/** Petite étiquette de carte (défausses, résultats). */
function chip(h, id) {
  const c = h.card(id);
  return `<span class="chip v${c.value}"><b>${c.value}</b> ${esc(c.name)}</span>`;
}

/** Grande carte illustrée. `act` la rend cliquable. */
function bigCard(h, id, { act = null, data = '', selected = false, disabled = false, note = '', compact = false } = {}) {
  const c = h.card(id);
  const tag = act ? 'button' : 'div';
  const attrs = act ? `type="button" data-act="${act}" ${data} ${disabled ? 'disabled' : ''} aria-pressed="${selected}"` : '';
  return `
    <${tag} class="card v${c.value} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${compact ? 'compact' : ''}" ${attrs}>
      <span class="card-top"><span class="card-value">${c.value}</span><span class="card-name">${esc(c.name)}</span></span>
      <span class="card-art">${cardArt(c.id)}</span>
      ${compact ? '' : `<span class="card-text">${esc(c.text)}</span>`}
      ${note ? `<span class="card-note">${esc(note)}</span>` : ''}
    </${tag}>`;
}

/** Dos de carte : la main est cachée aux regards tant que le joueur ne la montre pas. */
function cardBack(compact = false) {
  return `
    <button type="button" class="card back ${compact ? 'compact' : ''}" data-act="reveal" aria-label="Carte cachée : toucher pour voir">
      <span class="back-seal" aria-hidden="true">♥</span>
      <span class="back-label">Toucher pour voir</span>
    </button>`;
}

/** Bloc « main cachée » : dos de cartes + gros bouton pour retourner. */
function hiddenHand(n, title, extra = '') {
  return `
  <section class="my-hand hidden-hand">
    <h2>${title}</h2>
    <div class="hand n${n}">${Array.from({ length: n }, () => cardBack(n === 3)).join('')}</div>
    <button type="button" class="btn primary big" data-act="reveal">👁 Voir ${n > 1 ? 'mes cartes' : 'ma carte'}</button>
    <p class="note center">Vos cartes restent cachées aux regards ; elles se retournent toutes seules après votre tour.${extra}</p>
  </section>`;
}

/** Texte d'un événement du journal (les informations privées sont masquées si la main est cachée). */
function eventText(e, reveal) {
  if (e.scope === 'private' && !reveal) return '🔒 Information secrète : affichez votre main pour la lire.';
  return `${e.scope === 'private' ? '🔒 ' : ''}${esc(e.text)}`;
}

/**
 * Regroupe le journal de la manche par tour :
 * [{ kind:'start'|'turn'|'end', player, items:[événements] }]
 */
function groupLog(log) {
  const groups = [];
  let cur = null;
  const open = (kind, player = null) => {
    cur = { kind, player, items: [] };
    groups.push(cur);
  };
  for (const e of log) {
    if (e.type === 'roundStart') { open('start'); cur.items.push(e); continue; }
    if (e.type === 'turn') { open('turn', e.player); continue; }
    if (e.type === 'roundEnd') open('end');
    if (!cur) open('start');
    cur.items.push(e);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Blocs de l'écran
// ---------------------------------------------------------------------------

function topBar(h) {
  const { g } = h;
  return `
  <header class="topbar">
    <span class="tb-round">Manche ${g.round}${g.tiebreak ? ' <small>départage</small>' : ''}</span>
    <span class="tb-deck" title="Cartes restantes dans la pioche">🂠 ${g.deckCount}</span>
    <span class="tb-goal" title="Jetons pour gagner">♥ ${g.tokensToWin}</span>
    <button class="btn tiny light" data-act="rules" aria-label="Règles">📜 Règles</button>
  </header>`;
}

function playersGrid(h) {
  const { g, me } = h;
  const list = g.players.filter((p) => !p.removed);
  const tiles = list.map((p) => {
    const badges = [];
    if (!p.inRound) badges.push('<span title="Ne joue pas cette manche">⏸</span>');
    if (p.eliminated) badges.push('<span title="Éliminé">❌</span>');
    if (p.protected) badges.push('<span title="Protégé par la Servante">🛡️</span>');
    if (p.spyPlayed && !p.eliminated) badges.push('<span title="A joué ou défaussé une Espionne">🕵️</span>');
    if (!h.connected(p.id)) badges.push('<span title="Déconnecté">📴</span>');
    const isCurrent = g.phase === 'playing' && g.current === p.id;
    const last = p.discard.length ? p.discard[p.discard.length - 1] : null;
    const cls = ['ptile', isCurrent ? 'current' : '', p.eliminated || !p.inRound ? 'out' : '', p.id === me.id ? 'me' : ''].join(' ');
    return `
    <div class="${cls}" aria-label="${esc(p.name)}, ${p.tokens} jetons${isCurrent ? ', joue' : ''}${p.eliminated ? ', éliminé' : ''}">
      <div class="pname">${isCurrent ? '▶ ' : ''}${esc(p.name)}${p.id === me.id ? ' <small>(vous)</small>' : ''}</div>
      <div class="ptokens"><span class="hearts">${'♥'.repeat(Math.min(p.tokens, 6))}</span><small>${p.tokens}/${g.tokensToWin}</small></div>
      <div class="pbadges">${badges.join('')}</div>
      <div class="plast" title="Dernière carte défaussée">${last && g.phase === 'playing' ? chip(h, last) : ''}</div>
    </div>`;
  }).join('');
  return `<div class="players n${list.length}">${tiles}</div>`;
}

/** Ligne d'état : qui joue, et que se passe-t-il ? */
function statusBlock(h) {
  const { g, me } = h;
  if (g.phase !== 'playing') return '';
  const mine = h.player(me.id);
  let msg;
  let mineTurn = false;
  if (mine && !mine.inRound) msg = 'Vous ne participez pas à cette manche de départage.';
  else if (mine && mine.eliminated) msg = `Vous êtes éliminé de cette manche. Au tour de ${h.name(g.current)}.`;
  else if (g.pending && g.pending.playerId !== me.id) msg = `⏳ ${h.name(g.pending.playerId)} utilise le Chancelier et choisit ses cartes…`;
  else if (g.current === me.id) { msg = g.pending ? '⭐ Chancelier : à vous de choisir.' : '⭐ À vous de jouer !'; mineTurn = true; }
  else msg = `⏳ Au tour de ${h.name(g.current)} : en train de choisir une carte…`;
  if (g.current && g.current !== me.id && !h.connected(g.current)) msg += ' <span class="warn">(déconnecté)</span>';

  const spies = g.players.filter((p) => p.spyPlayed && !p.eliminated);
  return `
  <div class="status ${mineTurn ? 'my-turn' : ''}">${msg}</div>
  ${spies.length ? `<p class="spy-line">🕵️ Espionne jouée par : ${spies.map((p) => h.name(p.id)).join(', ')}
    ${spies.length > 1 ? '<small>(si ça reste ainsi, personne n\'aura le bonus)</small>' : ''}</p>` : ''}
  ${g.faceUp.length ? `<div class="faceup"><span>Retirées (visibles) :</span> ${g.faceUp.map((c) => chip(h, c)).join(' ')}</div>` : ''}`;
}

/** Panneau « Dernier coup » : la carte jouée en grand et ses conséquences. */
function lastMovePanel(h, app) {
  if (h.g.phase !== 'playing') return '';
  const groups = groupLog(app.log);
  const last = [...groups].reverse().find((gr) => gr.kind === 'turn' && gr.items.some((e) => e.type === 'play'));
  if (!last) {
    const start = groups.find((gr) => gr.kind === 'start');
    const ev = start && start.items.find((e) => e.type === 'roundStart');
    return ev ? `<div class="panel last-move start"><p>${esc(ev.text)}</p></div>` : '';
  }
  const play = last.items.find((e) => e.type === 'play');
  const c = h.card(play.card);
  const consequences = last.items.filter((e) => e !== play && !(e.scope === 'private' && e.type === 'draw'));
  const targetMe = play.target === h.me.id && play.player !== h.me.id;
  return `
  <div class="panel last-move ${targetMe ? 'targets-me' : ''}">
    <div class="lm-head">Dernier coup${play.player === h.me.id ? ' (le vôtre)' : ''}${targetMe ? ' — <b>vous étiez visé !</b>' : ''}</div>
    <div class="lm-body">
      <div class="lm-card v${c.value}">${cardArt(c.id)}<span><b>${c.value}</b> ${esc(c.name)}</span></div>
      <div class="lm-text">
        <p class="lm-main">${esc(play.text)}</p>
        ${consequences.map((e) => `<p class="lm-sub ${e.type === 'eliminated' ? 'bad' : ''} ${e.scope === 'private' ? 'private' : ''}">${eventText(e, app.ui.reveal)}</p>`).join('')}
      </div>
    </div>
  </div>`;
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
  if (sel.target) s += sel.target === h.me.id ? ' sur vous-même' : ` sur ${h.name(sel.target)}`;
  if (sel.guess) s += ` en nommant ${h.label(sel.guess)}`;
  if (entry.targets && entry.targets.length === 0) s += ' — sans effet (aucune cible possible)';
  return `${s} ?`;
}

/** Panneau d'action (mon tour) : cible → carte nommée → confirmation. */
function actionPanel(h, ui) {
  const { g } = h;
  const sel = ui.sel;
  if (!sel) return '<div class="panel action hint-panel"><p>👆 Touchez la carte que vous voulez jouer.</p></div>';
  const entry = g.legal.find((e) => e.card === sel.card);
  const step = playStep(entry, sel);
  let body = `<p class="effect"><b>${h.label(sel.card)} :</b> ${esc(h.card(sel.card).text)}</p>`;
  if (step === 'target') {
    const self = entry.targets.includes(h.me.id);
    body += `<p class="step">Qui ciblez-vous ?</p>
      <div class="choices">${entry.targets.map((id) => `
        <button type="button" class="btn choice" data-act="target" data-id="${esc(id)}">${id === h.me.id ? 'Vous-même' : h.name(id)}</button>`).join('')}
      </div>
      ${self && entry.targets.length === 1 ? '<p class="note">Tous vos adversaires sont protégés : vous devez vous cibler.</p>' : ''}`;
  } else if (step === 'guess') {
    body += `<p class="step">Selon vous, quelle carte ${h.name(sel.target)} a en main ?</p>
      <div class="choices guesses">${entry.guesses.map((id) => `
        <button type="button" class="btn choice v${h.card(id).value}" data-act="guess" data-card="${id}"><b>${h.card(id).value}</b>&nbsp;${esc(h.card(id).name)}</button>`).join('')}
      </div>`;
  } else {
    body += `<p class="summary">${describePlay(h, entry, sel)}</p>
      <button type="button" class="btn primary big" data-act="confirm">✔ Confirmer</button>`;
  }
  return `<div class="panel action">${body}<button type="button" class="btn link" data-act="cancel">Annuler</button></div>`;
}

/** Écran privé du Chancelier. */
function chancellorPanel(h, ui) {
  const pd = h.g.pending;
  if (!ui.reveal) {
    const n = pd.step === 'keep' ? h.g.hand.length : 2;
    return hiddenHand(n, '🔒 Chancelier : vos cartes sont cachées');
  }
  if (pd.step === 'keep') {
    const hand = h.g.hand;
    return `
    <div class="panel action chancellor">
      <h2>🔒 Chancelier — étape 1/2</h2>
      <p>Touchez la carte à <strong>garder</strong>. Les autres iront sous la pioche.</p>
      <div class="hand n${hand.length}">${hand.map((c, i) => bigCard(h, c, { act: 'keepPick', data: `data-index="${i}"`, selected: ui.keep === i, compact: hand.length === 3 })).join('')}</div>
      ${ui.keep !== null
        ? `<button type="button" class="btn primary big" data-act="keepConfirm">✔ Garder ${h.label(hand[ui.keep])}</button>`
        : ''}
      <button type="button" class="btn link" data-act="hideHand">🙈 Cacher mes cartes</button>
    </div>`;
  }
  const cards = pd.cards;
  if (ui.order.length === 0) {
    return `
    <div class="panel action chancellor">
      <h2>🔒 Chancelier — étape 2/2</h2>
      <p>Vous gardez ${h.label(h.g.hand[0])}. Dans quel ordre remettre les 2 autres sous la pioche ?</p>
      <div class="hand n2">${cards.map((c, i) => `
        <div class="order-col">
          ${bigCard(h, c, { compact: true })}
          <button type="button" class="btn choice" data-act="orderPick" data-index="${i}">Remettre en premier</button>
        </div>`).join('')}
      </div>
      <p class="note">La carte remise en second se retrouve tout en dessous de la pioche.</p>
      <button type="button" class="btn link" data-act="hideHand">🙈 Cacher mes cartes</button>
    </div>`;
  }
  const [a, b] = ui.order;
  return `
  <div class="panel action chancellor">
    <h2>🔒 Chancelier — étape 2/2</h2>
    <ol class="order">
      <li>${h.label(cards[a])} — remise <b>en premier</b></li>
      <li>${h.label(cards[b])} — remise <b>en second</b> (tout en dessous)</li>
    </ol>
    <button type="button" class="btn primary big" data-act="orderConfirm">✔ Confirmer</button>
    <button type="button" class="btn link" data-act="orderReset">Recommencer</button>
  </div>`;
}

function handSection(h, ui) {
  const { g, me } = h;
  const mine = h.player(me.id);
  if (!mine || !mine.inRound || mine.eliminated || g.phase !== 'playing') return '';
  if (g.pending && g.pending.playerId === me.id) return ''; // affichée dans l'écran du Chancelier
  const myTurn = g.current === me.id && !g.pending;
  if (!ui.reveal) return hiddenHand(g.hand.length, 'Votre main (cachée)');

  const cards = g.hand.map((c) => {
    if (!myTurn) return bigCard(h, c);
    const entry = g.legal.find((e) => e.card === c);
    return bigCard(h, c, {
      act: 'pick',
      data: `data-card="${c}"`,
      selected: !!(ui.sel && ui.sel.card === c),
      disabled: !entry.playable,
      note: entry.playable ? '' : entry.reason,
    });
  }).join('');
  return `
  <section class="my-hand">
    <div class="hand-head"><h2>Votre main</h2>
      <button type="button" class="btn tiny" data-act="hideHand">🙈 Cacher</button></div>
    <div class="hand n${g.hand.length}">${cards}</div>
  </section>`;
}

/** Tableau des jetons (fin de manche / de partie). */
function standings(h) {
  const { g } = h;
  return `<ul class="standings">${g.players.filter((p) => !p.removed).map((p) => `
    <li>
      <span class="sname">${h.name(p.id)}</span>
      <span class="bar"><span style="width:${Math.min(100, (p.tokens / g.tokensToWin) * 100)}%"></span></span>
      <span class="snum">${p.tokens}/${g.tokensToWin}</span>
    </li>`).join('')}</ul>`;
}

const STARTER_REASON = {
  firstEliminated: 'a perdu en premier cette manche',
  weakestHand: 'personne n\'a été éliminé : plus faible main',
  winner: 'gagnant de la manche',
  seat: 'joueur suivant dans l\'ordre du tour',
};

function roundOverPanel(h) {
  const { g, me } = h;
  const r = g.roundResult;
  if (!r) return '';
  const reason = r.reason === 'lastStanding'
    ? 'Il ne reste qu\'un joueur en lice.'
    : 'La pioche est vide : les joueurs en lice révèlent leur main.';
  const order = r.eliminationOrder || [];
  const rows = Object.keys(r.discardSums).map((id) => {
    const p = h.player(id);
    const rank = order.indexOf(id);
    const hand = r.revealed[id] ? chip(h, r.revealed[id])
      : p.eliminated ? `<span class="out">éliminé${rank >= 0 ? ` (${rank === 0 ? '1ᵉʳ' : `${rank + 1}ᵉ`})` : ''}</span>` : '<span class="muted">cachée</span>';
    const g1 = r.winners.includes(id) ? '<span class="gain">+1 ♥</span>' : '';
    const g2 = r.spyBonus === id ? '<span class="gain">+1 🕵️</span>' : '';
    return `<tr class="${r.winners.includes(id) ? 'win' : ''}">
      <td>${r.winners.includes(id) ? '🏆 ' : ''}${h.name(id)}</td><td>${hand}</td><td>${r.discardSums[id]}</td><td>${g1}${g2}</td></tr>`;
  }).join('');

  let spy;
  if (r.spyBonus) spy = `🕵️ <b>${h.name(r.spyBonus)}</b> est le seul joueur en lice à avoir joué ou défaussé une Espionne : +1 jeton.`;
  else if (r.spyHolders.length > 1) spy = `🕵️ ${r.spyHolders.map((id) => h.name(id)).join(' et ')} ont joué une Espionne : personne n'a le bonus.`;
  else spy = '🕵️ Aucun joueur en lice n\'a joué d\'Espionne : pas de bonus.';

  let footer = '';
  if (g.phase !== 'gameOver') {
    const next = r.nextStarter
      ? `<p class="next-starter">➜ <b>${h.name(r.nextStarter)}</b> commencera la manche suivante
          <small>(${STARTER_REASON[r.nextStarterReason] || ''})</small></p>`
      : '';
    footer = next + (me.isHost
      ? `<button type="button" class="btn primary big" data-act="nextRound">${g.tiebreak ? '⚔️ Lancer le départage' : 'Manche suivante ➜'}</button>`
      : '<p class="waiting">En attente de l\'hôte pour la manche suivante…</p>');
  }

  return `
  <div class="panel result">
    <h2>Fin de la manche ${r.round}</h2>
    <p>${reason}</p>
    <div class="table-wrap"><table class="round-table">
      <thead><tr><th>Joueur</th><th>Main</th><th title="Somme des cartes défaussées">Déf.</th><th>Gain</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="spy-detail">${spy}</p>
    ${g.phase !== 'gameOver' ? standings(h) : ''}
    ${g.tiebreak && g.phase !== 'gameOver' ? `<p class="tiebreak">⚔️ Égalité au seuil : manche de départage entre ${g.tiebreak.map((id) => h.name(id)).join(' et ')}.</p>` : ''}
    ${footer}
  </div>`;
}

function gameOverPanel(h) {
  const { g, me } = h;
  const ranking = [...g.players].sort((a, b) => b.tokens - a.tokens);
  const medal = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
  return `
  <div class="panel result final">
    <div class="seal big" aria-hidden="true">♥</div>
    <h2>${g.winners.map((id) => h.name(id)).join(', ')} remporte le cœur de la Princesse !</h2>
    <ol class="ranking">${ranking.map((p, i) => `
      <li class="${g.winners.includes(p.id) ? 'win' : ''}"><span>${medal(i)} ${h.name(p.id)}${p.removed ? ' <small>(parti)</small>' : ''}</span><span>${p.tokens} ♥</span></li>`).join('')}
    </ol>
    ${me.isHost
      ? '<button type="button" class="btn primary big" data-act="restart">Nouvelle partie</button>'
      : '<p class="waiting">L\'hôte peut relancer une partie.</p>'}
    <button type="button" class="btn link" data-act="leave">Quitter</button>
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
      btn = `<button type="button" class="btn tiny danger" data-act="forceEliminate" data-id="${esc(p.id)}">${ui.confirmHost === k ? 'Confirmer ?' : 'Éliminer de la manche'}</button>`;
    } else if (g.phase === 'roundOver') {
      const k = `remove:${p.id}`;
      btn = `<button type="button" class="btn tiny danger" data-act="removePlayer" data-id="${esc(p.id)}">${ui.confirmHost === k ? 'Confirmer ?' : 'Retirer de la partie'}</button>`;
    }
    return btn ? `<li><span>📴 ${h.name(p.id)}</span>${btn}</li>` : '';
  }).join('');
  if (!rows) return '';
  return `<div class="panel host"><h2>Hôte : joueurs déconnectés</h2>
    <p class="note">Attendez quelques instants : un téléphone en veille revient souvent tout seul.</p><ul>${rows}</ul></div>`;
}

function discards(h, ui) {
  const { g } = h;
  const rows = g.players.filter((p) => p.inRound).map((p) => {
    const open = !!ui.open[p.id];
    const last = p.discard.length ? chip(h, p.discard[p.discard.length - 1]) : '<small class="muted">vide</small>';
    return `
    <li class="discard-row">
      <button type="button" class="discard-head" data-act="toggleDiscard" data-id="${esc(p.id)}" aria-expanded="${open}">
        <span>${open ? '▾' : '▸'} ${h.name(p.id)} <small>(${p.discard.length})</small></span>
        <span class="last">${open ? '' : last}</span>
      </button>
      ${open ? `<div class="discard-cards">${p.discard.map((c) => chip(h, c)).join(' ') || '<small class="muted">vide</small>'}</div>` : ''}
    </li>`;
  }).join('');
  return `<section class="discards"><h2>Défausses <small>(ordre de jeu, la plus récente à droite)</small></h2><ul>${rows}</ul></section>`;
}

/** Journal de la manche en cours, regroupé par tour (le plus récent en haut). */
function logSection(h, app) {
  const groups = groupLog(app.log).reverse();
  // Une fois la manche finie, plus rien à cacher : les infos privées s'affichent en clair.
  const reveal = app.ui.reveal || h.g.phase !== 'playing';
  const title = (gr) => {
    if (gr.kind === 'start') return 'Début de la manche';
    if (gr.kind === 'end') return 'Fin de la manche';
    return gr.player === h.me.id ? 'Votre tour' : `Tour de ${h.name(gr.player)}`;
  };
  const items = groups.filter((gr) => gr.items.length || gr.kind === 'turn').map((gr) => `
    <li class="log-group ${gr.kind} ${gr.player === h.me.id ? 'mine' : ''}">
      <div class="log-title">${title(gr)}</div>
      ${gr.items.length ? gr.items.map((e) => `<p class="${e.scope === 'private' ? 'private' : ''} t-${esc(e.type)}">${eventText(e, reveal)}</p>`).join('')
        : '<p class="muted">… choisit une carte</p>'}
    </li>`).join('');
  return `<section class="log"><h2>Journal de la manche ${h.g.round}</h2><ol>${items}</ol></section>`;
}

// ---------------------------------------------------------------------------
// Écran complet
// ---------------------------------------------------------------------------

export function renderGame(app) {
  const h = helpers(app);
  const { g, me } = h;
  const ui = app.ui;

  let main = '';
  if (g.phase === 'gameOver') {
    main = gameOverPanel(h) + roundOverPanel(h);
  } else if (g.phase === 'roundOver') {
    main = roundOverPanel(h);
  } else if (g.pending && g.pending.playerId === me.id) {
    main = chancellorPanel(h, ui);
  } else {
    const myTurn = g.current === me.id && !g.pending;
    main = handSection(h, ui) + (myTurn && ui.reveal ? actionPanel(h, ui) : '');
  }

  return `
  <section class="screen game">
    ${topBar(h)}
    ${playersGrid(h)}
    ${statusBlock(h)}
    ${lastMovePanel(h, app)}
    ${main}
    ${hostPanel(h, ui)}
    ${g.phase === 'playing' ? discards(h, ui) : ''}
    ${logSection(h, app)}
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

async function hostConfirm(ctx, key, action) {
  if (ctx.app.ui.confirmHost !== key) {
    ctx.app.ui.confirmHost = key; // premier appui : demande de confirmation
    return ctx.render();
  }
  ctx.app.ui.confirmHost = null;
  await send(ctx, 'host', action);
}

/** Met à jour la sélection et ramène le panneau d'action à l'écran. */
function step(ctx, fn) {
  fn(ctx.app.ui);
  ctx.app.ui.scroll = '.panel.action';
  ctx.render();
}

export const gameActions = {
  pick(el, ctx) {
    const card = el.dataset.card;
    step(ctx, (ui) => { ui.sel = ui.sel && ui.sel.card === card ? null : { card }; });
  },
  target(el, ctx) {
    step(ctx, (ui) => { ui.sel.target = el.dataset.id; });
  },
  guess(el, ctx) {
    step(ctx, (ui) => { ui.sel.guess = el.dataset.card; });
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
    step(ctx, (ui) => { ui.keep = Number(el.dataset.index); });
  },
  async keepConfirm(el, ctx) {
    el.disabled = true;
    await send(ctx, 'action', { type: 'chancellorKeep', index: ctx.app.ui.keep });
  },
  orderPick(el, ctx) {
    const i = Number(el.dataset.index);
    step(ctx, (ui) => { ui.order = [i, 1 - i]; });
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
    return hostConfirm(ctx, `elim:${id}`, { type: 'forceEliminate', target: id });
  },
  removePlayer(el, ctx) {
    const id = el.dataset.id;
    return hostConfirm(ctx, `remove:${id}`, { type: 'removePlayer', target: id });
  },

  toggleDiscard(el, ctx) {
    const id = el.dataset.id;
    ctx.app.ui.open[id] = !ctx.app.ui.open[id];
    ctx.render();
  },
};
