// Petits utilitaires d'interface.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Échappe un texte avant de l'insérer dans du HTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

let toastTimer = null;

/** Message bref en bas de l'écran (erreurs, confirmations). */
export function toast(message, kind = 'info') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast-${kind}`;
  el.hidden = false;
  el.onclick = () => { el.hidden = true; }; // un appui ferme le message
  clearTimeout(toastTimer);
  const ms = { error: 4000, alert: 5000, secret: 5000 }[kind] || 2500;
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/** Vibration courte si le téléphone le permet. */
export function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch { /* non supporté */ }
}

/** Lecture/écriture localStorage protégées (navigation privée, stockage bloqué…). */
export const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* ignoré */ }
  },
};
