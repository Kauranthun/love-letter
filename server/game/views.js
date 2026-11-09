'use strict';
/**
 * Vues personnalisées : ce que CHAQUE joueur a le droit de voir.
 *
 * Principe : LISTE BLANCHE. La vue est construite champ par champ ; on ne copie
 * jamais l'état entier. Ne sont JAMAIS envoyés :
 *   - la main des autres joueurs (seulement leur nombre de cartes),
 *   - le contenu de la pioche (seulement son nombre de cartes),
 *   - la carte écartée face cachée (jamais révélée, même en fin de manche),
 *   - les cartes en suspens du Chancelier d'un autre joueur.
 */
const { getEdition } = require('../editions');
const { legalPlays } = require('./engine');

/**
 * @param {object} state  état complet du moteur
 * @param {string} viewerId  id du joueur qui regarde (ou null pour un spectateur)
 */
function buildView(state, viewerId) {
  const ed = getEdition(state.editionId);
  const spyCards = ed.cards.filter((c) => c.endOfRoundBonus === 'spy').map((c) => c.id);
  const me = state.players.find((p) => p.id === viewerId) || null;
  const pd = state.pending;

  const view = {
    you: me ? me.id : null,
    editionId: state.editionId,
    phase: state.phase,
    round: state.round,
    current: state.current,
    startPlayer: state.startPlayer,
    tokensToWin: state.tokensToWin,
    deckCount: state.deck.length,
    setAsideCount: state.setAside ? 1 : 0,
    faceUp: [...state.faceUp],
    tiebreak: state.tiebreak ? [...state.tiebreak] : null,
    winners: state.winners ? [...state.winners] : null,
    players: state.players.map((p) => {
      const inRound = state.roundPlayers.includes(p.id);
      const pendingCount = pd && pd.playerId === p.id ? pd.cards.length : 0;
      return {
        id: p.id,
        name: p.name,
        tokens: p.tokens,
        inRound,
        eliminated: p.eliminated,
        protected: p.protected,
        removed: p.removed,
        handCount: p.hand.length + pendingCount,
        discard: [...p.discard],
        spyPlayed: inRound && p.discard.some((c) => spyCards.includes(c)),
      };
    }),
    hand: me ? [...me.hand] : [],
    pending: null,
    legal: me ? legalPlays(state, me.id) : [],
    roundResult: null,
  };

  if (pd) {
    if (me && pd.playerId === me.id) {
      // Le propriétaire de la décision voit ses cartes en suspens.
      view.pending = { kind: pd.kind, playerId: pd.playerId, step: pd.step, cards: [...pd.cards] };
    } else {
      // Les autres savent seulement qu'une décision est en cours.
      view.pending = { kind: pd.kind, playerId: pd.playerId };
    }
  }

  if (state.roundResult) {
    const r = state.roundResult;
    view.roundResult = {
      round: r.round,
      reason: r.reason,
      winners: [...r.winners],
      revealed: { ...r.revealed },
      discardSums: { ...r.discardSums },
      spyHolders: [...r.spyHolders],
      spyBonus: r.spyBonus,
      gained: { ...r.gained },
    };
  }
  return view;
}

/** Filtre une liste d'événements pour un joueur (publics + privés qui lui sont adressés). */
function eventsFor(events, viewerId) {
  return events
    .filter((e) => e.scope === 'public' || (e.to && e.to.includes(viewerId)))
    .map((e) => {
      const { to, ...rest } = e; // inutile d'exposer la liste des destinataires
      return rest;
    });
}

module.exports = { buildView, eventsFor };
