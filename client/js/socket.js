// Connexion au serveur et jeton de reconnexion.
/* global io */

const KEY = 'loveletter.token';
const params = new URLSearchParams(location.search);

// « ?nouveau » dans l'adresse : ignorer le jeton enregistré (utile pour jouer à plusieurs
// dans le même navigateur pendant les tests). Le jeton de l'onglet (sessionStorage) reste prioritaire.
let useLocal = !params.has('nouveau');

export const tokenStore = {
  get() {
    try {
      return sessionStorage.getItem(KEY) || (useLocal ? localStorage.getItem(KEY) : null);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      sessionStorage.setItem(KEY, token);
      localStorage.setItem(KEY, token);
      useLocal = true;
    } catch { /* stockage indisponible : la reconnexion ne marchera qu'avec l'onglet ouvert */ }
  },
  clear() {
    try {
      const mine = sessionStorage.getItem(KEY);
      sessionStorage.removeItem(KEY);
      if (!mine || localStorage.getItem(KEY) === mine) localStorage.removeItem(KEY);
    } catch { /* ignoré */ }
  },
};

export const socket = io({
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
});

/** Envoie une requête et attend la réponse du serveur ({ ok, error, ... }). */
export function request(event, data = {}) {
  return new Promise((resolve) => {
    socket.timeout(8000).emit(event, data, (err, reply) => {
      resolve(err ? { ok: false, error: 'Le serveur ne répond pas. Vérifiez le Wi-Fi.' } : reply);
    });
  });
}

// Quand le téléphone se réveille, on relance la connexion sans attendre le délai automatique.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
});
window.addEventListener('online', () => {
  if (!socket.connected) socket.connect();
});
