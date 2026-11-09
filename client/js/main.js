// Point d'entrée du client : état local, routage des écrans, délégation des clics.
import { socket, request, tokenStore } from './socket.js';
import { toast, vibrate } from './util.js';
import { renderHome, homeActions, bindHome } from './screens/home.js';
import { renderLobby, lobbyActions } from './screens/lobby.js';
import { renderGame, gameActions } from './screens/game.js';
import { openRules } from './rules.js';

/** État de l'application côté client (tout vient du serveur, sauf les choix en cours). */
const app = {
  edition: null,     // cartes (noms, valeurs, textes)
  info: null,        // URL du serveur pour les QR codes
  payload: null,     // dernière vue reçue : { room, me, game }
  log: [],           // journal d'événements
  ui: freshUi(),     // sélections en cours (carte, cible…)
  screen: null,
};

function freshUi() {
  return { sel: null, keep: null, order: [], open: {}, confirmHost: null, scroll: null };
}

const ctx = {
  app,
  request,
  tokenStore,
  render: () => render(),
  resetUi: () => { app.ui = freshUi(); },
  leaveToHome: () => {
    tokenStore.clear();
    app.payload = null;
    app.log = [];
    app.ui = freshUi();
    render();
  },
};

const actions = {
  ...homeActions,
  ...lobbyActions,
  ...gameActions,
  rules: () => openRules(app.edition),
};

/** Grand bandeau « À vous de jouer ! » + vibration. */
let flashTimer = null;
function flashMyTurn() {
  vibrate([150, 80, 150]);
  const el = document.getElementById('flash');
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth; // relance l'animation
  el.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.hidden = true; }, 1500);
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

function render() {
  const root = document.getElementById('app');
  if (!app.edition) {
    root.innerHTML = '<p class="loading">Chargement…</p>';
    return;
  }
  const p = app.payload;
  const screen = !p ? 'home' : p.room.status === 'lobby' ? 'lobby' : 'game';
  // L'accueil contient des champs de saisie : on ne le redessine pas inutilement.
  if (screen === 'home' && app.screen === 'home') return;
  app.screen = screen;
  if (screen === 'home') {
    root.innerHTML = renderHome(app);
    bindHome(ctx);
  } else if (screen === 'lobby') {
    root.innerHTML = renderLobby(app);
  } else {
    root.innerHTML = renderGame(app);
    // Après un choix, on amène le panneau d'action à l'écran (petits téléphones).
    if (app.ui.scroll) {
      const target = root.querySelector(app.ui.scroll);
      app.ui.scroll = null;
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

// Délégation : tout élément avec data-act="nom" déclenche actions[nom].
document.addEventListener('click', (ev) => {
  if (ev.target.closest('#modal')) return;
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) {
    ev.preventDefault();
    Promise.resolve(fn(el, ctx)).catch((err) => {
      console.error(err);
      toast('Erreur inattendue.', 'error');
    });
  }
});

// ---------------------------------------------------------------------------
// Messages du serveur
// ---------------------------------------------------------------------------

const isMyTurn = (p) => !!(p && p.game && p.game.phase === 'playing' && p.game.current === p.me.id);

socket.on('connect', async () => {
  document.getElementById('net-banner').hidden = true;
  const token = tokenStore.get();
  if (token) {
    const r = await request('resume', { token });
    if (!r.ok) {
      tokenStore.clear();
      if (app.payload) toast(r.error, 'error');
      app.payload = null;
      app.screen = null;
      render();
    }
  } else {
    render();
  }
});

socket.on('disconnect', () => {
  document.getElementById('net-banner').hidden = false;
});

socket.on('state', (payload) => {
  const prev = app.payload;
  app.payload = payload;
  const g = payload.game;
  const ui = app.ui;

  // C'est mon tour : vibration + remise à zéro de la sélection.
  if (isMyTurn(payload) && !isMyTurn(prev)) {
    if (prev) flashMyTurn();
    ui.sel = null;
  }
  // Sélection devenue invalide (plus mon tour, carte plus en main…)
  if (ui.sel && (!isMyTurn(payload) || g.pending || !g.legal.some((e) => e.card === ui.sel.card && e.playable))) {
    ui.sel = null;
  }
  // Décision du Chancelier : on oublie les choix si l'étape a changé.
  const pd = g && g.pending && g.pending.playerId === payload.me.id ? g.pending : null;
  const prevPd = prev && prev.game && prev.game.pending;
  if (!pd || !prevPd || prevPd.step !== pd.step) {
    ui.keep = null;
    ui.order = [];
  }
  if (!g || !prev || !prev.game || prev.game.phase !== g.phase) ui.confirmHost = null;
  render();
});

socket.on('events', (events) => {
  app.log.push(...events);
  if (app.log.length > 300) app.log.splice(0, app.log.length - 300);
  // Les informations secrètes (Prêtre, Baron, Roi) s'affichent aussi en bandeau.
  for (const e of events) {
    if (e.scope === 'private' && ['peek', 'baron', 'swap'].includes(e.type)) toast(e.text, 'secret');
  }
  render();
});

socket.on('history', (events) => {
  app.log = events;
  render();
});

socket.on('kicked', ({ message }) => {
  toast(message, 'error');
  ctx.leaveToHome();
});

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

async function init() {
  try {
    const [edition, info] = await Promise.all([
      fetch('/api/edition').then((r) => r.json()),
      fetch('/api/info').then((r) => r.json()).catch(() => null),
    ]);
    edition.byId = Object.fromEntries(edition.cards.map((c) => [c.id, c]));
    app.edition = edition;
    app.info = info;
  } catch {
    document.getElementById('app').innerHTML =
      '<p class="loading">Impossible de joindre le serveur. Vérifiez le Wi-Fi puis rechargez la page.</p>';
    return;
  }
  render();
}

init();
