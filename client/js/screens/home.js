// Écran d'accueil : créer ou rejoindre une partie.
import { esc, toast, storage } from '../util.js';

const NAME_KEY = 'loveletter.name';

/** Le QR code d'invitation n'est utile que sur l'ordinateur hôte (ou un grand écran). */
function isHostScreen() {
  return /^(localhost|127\.|\[?::1\]?$)/.test(location.hostname) || window.innerWidth >= 700;
}

export function renderHome(app) {
  const params = new URLSearchParams(location.search);
  const code = (params.get('code') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const name = storage.get(NAME_KEY) || '';
  const url = app.info && app.info.url;
  return `
  <section class="screen home">
    <header class="brand">
      <div class="seal" aria-hidden="true">♥</div>
      <h1>Love Letter</h1>
      <p class="sub">Édition 2019 · 2 à 6 joueurs</p>
    </header>

    <div class="panel">
      <label class="field">
        <span>Votre pseudo</span>
        <input id="name" maxlength="16" autocomplete="nickname" enterkeyhint="go" value="${esc(name)}" placeholder="ex : Alice">
      </label>
      ${code ? '' : '<button class="btn primary big" data-act="create">Créer une partie</button><div class="or"><span>ou</span></div>'}
      <label class="field">
        <span>Code de la partie</span>
        <input id="code" class="code-input" maxlength="4" autocomplete="off" autocapitalize="characters"
          spellcheck="false" enterkeyhint="go" value="${esc(code)}" placeholder="ABCD">
      </label>
      <button class="btn ${code ? 'primary' : ''} big" data-act="join">Rejoindre</button>
      ${code ? '<button class="btn link" data-act="forgetCode">Créer une autre partie</button>' : ''}
    </div>

    ${isHostScreen() && url ? `
    <div class="panel qr-panel">
      <h2>Inviter des joueurs</h2>
      <img class="qr" src="/api/qr.svg" alt="QR code pour rejoindre" width="220" height="220">
      <p class="url">${esc(url)}</p>
      <p class="hint">Scannez avec l'appareil photo du téléphone, connecté au <strong>même Wi-Fi</strong>.</p>
    </div>` : ''}

    <button class="btn link" data-act="rules">📜 Règles du jeu</button>
    ${app.info && app.info.version ? `<p class="version">v${esc(app.info.version)}</p>` : ''}
  </section>`;
}

/** Branche les champs de saisie (majuscules, touche Entrée). */
export function bindHome(ctx) {
  const name = document.getElementById('name');
  const code = document.getElementById('code');
  code.addEventListener('input', () => {
    code.value = code.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  });
  const enter = (fn) => (ev) => { if (ev.key === 'Enter') fn(null, ctx); };
  name.addEventListener('keydown', enter(code.value ? homeActions.join : homeActions.create));
  code.addEventListener('keydown', enter(homeActions.join));
  if (code.value && !name.value) name.focus();
}

function readName() {
  const el = document.getElementById('name');
  const name = el.value.trim();
  if (!name) {
    toast('Choisissez un pseudo.', 'error');
    el.focus();
    return null;
  }
  storage.set(NAME_KEY, name);
  return name;
}

/** Après être entré dans une salle : on nettoie l'adresse (?code, ?nouveau). */
function entered(ctx, reply) {
  ctx.tokenStore.set(reply.token);
  history.replaceState(null, '', '/');
}

export const homeActions = {
  async create(el, ctx) {
    const name = readName();
    if (!name) return;
    const r = await ctx.request('create', { name });
    if (!r.ok) return toast(r.error, 'error');
    entered(ctx, r);
  },

  async join(el, ctx) {
    const name = readName();
    if (!name) return;
    const code = document.getElementById('code').value.trim().toUpperCase();
    if (code.length !== 4) return toast('Le code fait 4 lettres.', 'error');
    const r = await ctx.request('join', { code, name });
    if (!r.ok) return toast(r.error, 'error');
    entered(ctx, r);
  },

  forgetCode(el, ctx) {
    history.replaceState(null, '', '/');
    ctx.app.screen = null;
    ctx.render();
  },
};
