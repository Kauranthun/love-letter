'use strict';
/**
 * Effets des cartes.
 *
 * Chaque effet reçoit un contexte déjà VALIDÉ par le moteur :
 *   ctx = { state, actor, target, guess, cardId, events }
 *     - actor  : objet joueur qui joue la carte (la carte jouée est déjà dans sa défausse)
 *     - target : objet joueur ciblé, ou null si la carte est jouée sans effet faute de cible
 *     - guess  : carte nommée (Garde)
 * et un objet `h` d'utilitaires fournis par le moteur (évite une dépendance circulaire) :
 *   h.pub(events, type, text, data)        → événement public (journal de tous)
 *   h.priv(events, to, type, text, data)   → événement privé (uniquement les joueurs `to`)
 *   h.eliminate(state, player, events)     → élimine un joueur (révèle et défausse sa main)
 *   h.label(state, cardId)                 → « le Garde », « l'Espionne »…
 *   h.info(state, cardId)                  → données de la carte (édition)
 *   h.drawReplacement(state, player)       → pioche (ou carte écartée si pioche vide)
 *
 * RÈGLE DE CONFIDENTIALITÉ : un événement public ne doit contenir aucune information
 * cachée (main d'un joueur encore en lice, contenu de la pioche, carte écartée).
 */

/** Texte standard pour une carte jouée sans effet faute de cible valide. */
function noTarget(ctx, h) {
  const { state, actor, cardId, events } = ctx;
  h.pub(events, 'play', `${actor.name} joue ${h.label(state, cardId)} sans effet (aucune cible possible).`,
    { player: actor.id, card: cardId, target: null });
}

const EFFECTS = {
  /** Espionne, Comtesse, Princesse : aucun effet immédiat. */
  none(ctx, h) {
    const { state, actor, cardId, events } = ctx;
    h.pub(events, 'play', `${actor.name} joue ${h.label(state, cardId)}.`, { player: actor.id, card: cardId });
  },

  /** Garde : nommer une carte ; si la cible l'a, elle est éliminée. */
  guess(ctx, h) {
    const { state, actor, target, guess, cardId, events } = ctx;
    if (!target) return noTarget(ctx, h);
    const hit = target.hand.includes(guess);
    h.pub(events, 'play',
      `${actor.name} joue ${h.label(state, cardId)} sur ${target.name}, nomme ${h.label(state, guess)}… ` +
      (hit ? 'et voit juste !' : 'et se trompe.'),
      { player: actor.id, card: cardId, target: target.id, guess, hit });
    if (hit) h.eliminate(state, target, events);
  },

  /** Prêtre : seul le joueur actif voit la main de la cible. */
  peek(ctx, h) {
    const { state, actor, target, cardId, events } = ctx;
    if (!target) return noTarget(ctx, h);
    h.pub(events, 'play', `${actor.name} joue ${h.label(state, cardId)} et regarde la main de ${target.name}.`,
      { player: actor.id, card: cardId, target: target.id });
    const seen = target.hand[0];
    h.priv(events, [actor.id], 'peek', `🔍 ${target.name} a ${h.label(state, seen)} en main.`,
      { target: target.id, card: seen });
  },

  /** Baron : comparaison secrète, le plus faible est éliminé. */
  compare(ctx, h) {
    const { state, actor, target, cardId, events } = ctx;
    if (!target) return noTarget(ctx, h);
    const mine = actor.hand[0];
    const theirs = target.hand[0];
    const vMine = h.info(state, mine).value;
    const vTheirs = h.info(state, theirs).value;
    // Détail privé : uniquement les deux joueurs concernés
    h.priv(events, [actor.id, target.id], 'baron',
      `⚖️ Baron : ${actor.name} (${h.label(state, mine)}) contre ${target.name} (${h.label(state, theirs)}).`,
      { players: [actor.id, target.id], cards: { [actor.id]: mine, [target.id]: theirs } });
    const loser = vMine < vTheirs ? actor : vTheirs < vMine ? target : null;
    h.pub(events, 'play',
      `${actor.name} joue ${h.label(state, cardId)} contre ${target.name} : ` +
      (loser ? `${loser.name} perd la comparaison.` : 'égalité, rien ne se passe.'),
      { player: actor.id, card: cardId, target: target.id, loser: loser ? loser.id : null });
    if (loser) h.eliminate(state, loser, events);
  },

  /** Servante : protection jusqu'au prochain tour du joueur. */
  protect(ctx, h) {
    const { state, actor, cardId, events } = ctx;
    actor.protected = true;
    h.pub(events, 'play', `${actor.name} joue ${h.label(state, cardId)} et est protégé jusqu'à son prochain tour.`,
      { player: actor.id, card: cardId });
  },

  /** Prince : la cible (éventuellement soi) défausse sa main et pioche. */
  discardDraw(ctx, h) {
    const { state, actor, target, cardId, events } = ctx;
    const discarded = target.hand.shift();
    target.discard.push(discarded);
    const who = target === actor ? 'sur soi-même et défausse' : `sur ${target.name}, qui défausse`;
    h.pub(events, 'play', `${actor.name} joue ${h.label(state, cardId)} ${who} ${h.label(state, discarded)}.`,
      { player: actor.id, card: cardId, target: target.id, discarded });
    if (h.info(state, discarded).eliminateOnDiscard) {
      h.eliminate(state, target, events);
      return;
    }
    const drawn = h.drawReplacement(state, target);
    if (drawn && drawn.fromSetAside) {
      h.pub(events, 'setAside', `La pioche est vide : ${target.name} prend la carte écartée en début de manche.`,
        { player: target.id });
    }
    if (drawn) {
      h.priv(events, [target.id], 'draw', `Vous piochez ${h.label(state, drawn.card)}.`, { card: drawn.card });
    }
  },

  /**
   * Chancelier : pioche 1 ou 2 cartes puis ouvre une DÉCISION EN ATTENTE.
   * La suite se joue avec les actions `chancellorKeep` puis `chancellorReturn` (voir engine.js).
   */
  chancellor(ctx, h) {
    const { state, actor, cardId, events } = ctx;
    const n = Math.min(h.info(state, cardId).draw || 2, state.deck.length);
    if (n === 0) {
      h.pub(events, 'play', `${actor.name} joue ${h.label(state, cardId)} sans effet (pioche vide).`,
        { player: actor.id, card: cardId });
      return;
    }
    const drawn = state.deck.splice(0, n);
    actor.hand.push(...drawn);
    state.pending = { kind: 'chancellor', playerId: actor.id, step: 'keep', cards: [] };
    h.pub(events, 'play', `${actor.name} utilise ${h.label(state, cardId)}.`, { player: actor.id, card: cardId });
    h.priv(events, [actor.id], 'draw',
      `Vous piochez ${drawn.map((c) => h.label(state, c)).join(' et ')}. Choisissez la carte à garder.`,
      { cards: drawn });
  },

  /** Roi : échange des mains. */
  swap(ctx, h) {
    const { state, actor, target, cardId, events } = ctx;
    if (!target) return noTarget(ctx, h);
    [actor.hand, target.hand] = [target.hand, actor.hand];
    h.pub(events, 'play', `${actor.name} joue ${h.label(state, cardId)} et échange sa main avec ${target.name}.`,
      { player: actor.id, card: cardId, target: target.id });
    h.priv(events, [actor.id], 'swap', `🔄 Vous recevez ${h.label(state, actor.hand[0])} de ${target.name}.`,
      { card: actor.hand[0] });
    h.priv(events, [target.id], 'swap', `🔄 Vous recevez ${h.label(state, target.hand[0])} de ${actor.name}.`,
      { card: target.hand[0] });
  },
};

module.exports = { EFFECTS };
