'use strict';
/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 * Son état (un entier 32 bits) est stocké DANS l'état de jeu (`state.rng`) :
 * l'état reste sérialisable et une même graine donne toujours la même partie.
 */
const crypto = require('crypto');

/** Convertit une graine quelconque (nombre, texte, rien) en entier 32 bits. */
function seedFrom(seed) {
  if (seed === undefined || seed === null) return crypto.randomBytes(4).readUInt32LE(0);
  if (typeof seed === 'number') return seed >>> 0;
  // Hachage FNV-1a d'une chaîne
  let h = 0x811c9dc5;
  for (const ch of String(seed)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Nombre aléatoire dans [0, 1[ ; fait avancer `holder.rng`. */
function nextRandom(holder) {
  let t = (holder.rng = (holder.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Entier aléatoire dans [0, n[. */
function randomInt(holder, n) {
  return Math.floor(nextRandom(holder) * n);
}

/** Mélange de Fisher-Yates, en place. */
function shuffle(holder, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(holder, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = { seedFrom, nextRandom, randomInt, shuffle };
