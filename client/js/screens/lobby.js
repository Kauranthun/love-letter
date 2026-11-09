// Salon d'attente : joueurs connectés, jetons requis, lancement par l'hôte.
import { esc, toast } from '../util.js';

export function renderLobby(app) {
  const { room, me } = app.payload;
  const n = room.players.length;
  const url = app.info && app.info.url ? `${app.info.url}/?code=${room.code}` : '';
  const host = room.players.find((p) => p.isHost);
  const canStart = n >= room.minPlayers;

  const players = room.players.map((p) => `
    <li class="lobby-player ${p.connected ? '' : 'offline'}">
      <span class="dot" title="${p.connected ? 'connecté' : 'déconnecté'}"></span>
      <span class="pname">${esc(p.name)}</span>
      ${p.isHost ? '<span class="tag">hôte</span>' : ''}
      ${p.id === me.id ? '<span class="tag you">vous</span>' : ''}
      ${!p.connected ? '<span class="tag warn">déconnecté</span>' : ''}
      ${me.isHost && p.id !== me.id ? `<button class="btn tiny" data-act="kick" data-id="${esc(p.id)}">
        ${app.ui.confirmHost === p.id ? 'Confirmer ?' : 'Retirer'}</button>` : ''}
    </li>`).join('');

  const tokens = Object.entries(room.tokensToWin).map(([k, v]) => `
    <div class="tok ${Number(k) === n ? 'current' : ''}"><b>${k}</b> joueurs<br><span>${v} ♥</span></div>`).join('');

  return `
  <section class="screen lobby">
    <header class="lobby-head">
      <p class="label">Code de la partie</p>
      <p class="room-code">${esc(room.code)}</p>
    </header>

    <div class="panel">
      <h2>Joueurs (${n}/${room.maxPlayers})</h2>
      <ul class="lobby-list">${players}</ul>
      <p class="goal">${canStart
        ? `À ${n} joueurs : <strong>${room.tokensToWin[n]} jetons de faveur</strong> pour gagner.`
        : `Il faut au moins ${room.minPlayers} joueurs.`}</p>
      <div class="tokens-table">${tokens}</div>
    </div>

    ${me.isHost
      ? `<button class="btn primary big" data-act="start" ${canStart ? '' : 'disabled'}>Lancer la partie</button>`
      : `<p class="waiting">En attente du lancement par ${esc(host ? host.name : "l'hôte")}…</p>`}

    <div class="panel qr-panel">
      <h2>Faire rejoindre</h2>
      <img class="qr" src="/api/qr.svg?code=${encodeURIComponent(room.code)}" alt="QR code de la partie" width="200" height="200">
      ${url ? `<p class="url">${esc(url)}</p>` : ''}
    </div>

    <button class="btn link" data-act="rules">📜 Règles du jeu</button>
    <button class="btn link" data-act="leave">Quitter le salon</button>
  </section>`;
}

export const lobbyActions = {
  async start(el, ctx) {
    const r = await ctx.request('start');
    if (!r.ok) toast(r.error, 'error');
  },

  async kick(el, ctx) {
    const id = el.dataset.id;
    if (ctx.app.ui.confirmHost !== id) {
      ctx.app.ui.confirmHost = id; // premier appui : demande de confirmation
      return ctx.render();
    }
    ctx.app.ui.confirmHost = null;
    const r = await ctx.request('host', { type: 'kick', target: id });
    if (!r.ok) toast(r.error, 'error');
  },

  async leave(el, ctx) {
    const r = await ctx.request('leave');
    if (!r.ok) return toast(r.error, 'error');
    ctx.leaveToHome();
  },
};
