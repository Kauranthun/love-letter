// Fenêtre « Règles », accessible depuis tous les écrans.
import { esc } from './util.js';
import { cardArt } from './cards-art.js';

function rulesHtml(ed) {
  const cards = [...ed.cards].sort((a, b) => b.value - a.value).map((c) => `
    <li class="rule-card v${c.value}">
      <span class="rule-art">${cardArt(c.id)}</span>
      <span class="rule-body">
        <b>${c.value} · ${esc(c.name)}</b> <small>×${c.count}</small><br>
        <span>${esc(c.text)}</span>
      </span>
    </li>`).join('');
  const tokens = Object.entries(ed.tokensToWin).map(([n, t]) => `<td>${n} j. : <b>${t}</b></td>`).join('');
  return `
  <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="rules-title">
    <header class="modal-head">
      <h2 id="rules-title">Règles — édition 2019</h2>
      <button class="btn tiny" data-modal="close" aria-label="Fermer">✕ Fermer</button>
    </header>
    <div class="modal-body">
      <p><b>But :</b> faire parvenir sa lettre à la Princesse. Chaque manche gagnée rapporte 1 jeton de faveur.
      La partie s'arrête dès qu'un joueur atteint le nombre de jetons requis :</p>
      <table class="rules-tokens"><tr>${tokens}</tr></table>

      <h3>Mise en place</h3>
      <p>On mélange les 21 cartes, on écarte la première face cachée. <b>À 2 joueurs</b>, on retire aussi 3 cartes
      face visible. Chaque joueur pioche 1 carte. Le premier joueur est tiré au hasard ; ensuite,
      ${ed.rules && ed.rules.nextRoundStarter === 'winner'
        ? 'le gagnant de la manche précédente commence.'
        : '<b>le joueur qui a perdu en premier</b> la manche précédente commence (si personne n\'a été éliminé : celui qui avait la plus faible main).'}</p>

      <h3>Main cachée</h3>
      <p>Vos cartes sont affichées <b>face cachée</b> pour que vos voisins ne les voient pas d'un coup d'œil.
      Touchez « Voir ma main » pour les retourner : elles se recachent après votre tour, au bout de quelques
      secondes, ou dès que vous quittez l'application.</p>

      <h3>Votre tour</h3>
      <p>Piochez une carte, puis jouez l'une de vos 2 cartes face visible et appliquez son effet.
      Si aucune cible n'est possible (adversaires protégés ou éliminés), la carte est jouée sans effet.</p>

      <h3>Les cartes</h3>
      <ul class="rules-cards">${cards}</ul>

      <h3>Fin de manche</h3>
      <p>La manche s'arrête quand il ne reste qu'un joueur en lice, ou quand la pioche est vide à la fin d'un tour.
      Dans ce cas, les joueurs en lice révèlent leur main : la plus forte gagne. En cas d'égalité, la plus grande
      somme des cartes défaussées l'emporte ; si l'égalité persiste, tous les ex aequo gagnent un jeton.</p>
      <p><b>Bonus Espionne :</b> si un seul joueur encore en lice a joué ou défaussé une Espionne pendant la manche,
      il gagne 1 jeton supplémentaire (même sans avoir gagné la manche).</p>

      <h3>Fin de partie</h3>
      <p>Si plusieurs joueurs atteignent le seuil en même temps, celui qui a le plus de jetons gagne ;
      en cas d'égalité, une manche de départage est jouée entre eux.</p>
    </div>
  </div>`;
}

let lastFocus = null;

export function openRules(edition) {
  const modal = document.getElementById('modal');
  lastFocus = document.activeElement;
  modal.innerHTML = rulesHtml(edition);
  modal.hidden = false;
  document.body.classList.add('no-scroll');
  modal.querySelector('[data-modal="close"]').focus();
}

export function closeRules() {
  const modal = document.getElementById('modal');
  modal.hidden = true;
  modal.innerHTML = '';
  document.body.classList.remove('no-scroll');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

// Fermeture : bouton, clic sur le fond, touche Échap.
document.getElementById('modal').addEventListener('click', (ev) => {
  if (ev.target.id === 'modal' || ev.target.closest('[data-modal="close"]')) closeRules();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !document.getElementById('modal').hidden) closeRules();
});
