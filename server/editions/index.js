'use strict';
/**
 * Registre des éditions disponibles. Pour ajouter l'édition 2012 :
 * créer editions/2012.js puis l'enregistrer ici.
 */
const RAW = {
  '2019': require('./2019'),
};

const cache = {};

/** Renvoie l'édition demandée, enrichie d'un index `cardsById`. */
function getEdition(id) {
  if (!RAW[id]) throw new Error(`Édition inconnue : ${id}`);
  if (!cache[id]) {
    const ed = RAW[id];
    const cardsById = {};
    for (const c of ed.cards) cardsById[c.id] = c;
    cache[id] = Object.freeze({ ...ed, cardsById });
  }
  return cache[id];
}

/** Données publiques d'une édition (envoyées au client pour l'affichage). */
function publicEdition(id) {
  const ed = getEdition(id);
  return {
    id: ed.id,
    name: ed.name,
    minPlayers: ed.minPlayers,
    maxPlayers: ed.maxPlayers,
    tokensToWin: { ...ed.tokensToWin },
    rules: { ...(ed.rules || {}) },
    cards: ed.cards.map((c) => ({
      id: c.id, value: c.value, name: c.name, article: c.article, count: c.count,
      text: c.text, targeting: c.targeting || null,
      cannotGuess: c.cannotGuess || [],
      isGuess: c.effect === 'guess',
    })),
  };
}

module.exports = { getEdition, publicEdition, EDITION_IDS: Object.keys(RAW) };
