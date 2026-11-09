// Emblèmes des cartes, dessinés en SVG (créations originales, sans reprise des illustrations officielles).
// Chaque emblème tient dans un cadre 100 × 80.

const INK = '#5a3a1e';
const GOLD = '#d4a23c';

const ART = {
  // 0 — Espionne : loup de bal masqué
  spy: `
    <path d="M8 30 Q2 22 6 14" stroke="#2c2a3a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M92 30 Q98 22 94 14" stroke="#2c2a3a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M8 34 Q12 18 34 22 Q50 26 66 22 Q88 18 92 34 Q90 54 70 56 Q57 57 50 45 Q43 57 30 56 Q10 54 8 34Z" fill="#2c2a3a"/>
    <ellipse cx="30" cy="38" rx="10" ry="6.5" fill="#fff8ec"/>
    <ellipse cx="70" cy="38" rx="10" ry="6.5" fill="#fff8ec"/>
    <circle cx="31" cy="38" r="3.5" fill="#2c2a3a"/><circle cx="69" cy="38" r="3.5" fill="#2c2a3a"/>
    <path d="M40 66 Q50 72 60 66" stroke="#b3223a" stroke-width="3" fill="none" stroke-linecap="round"/>`,

  // 1 — Garde : deux hallebardes croisées
  guard: `
    <g stroke="${INK}" stroke-width="4.5" stroke-linecap="round">
      <line x1="22" y1="74" x2="68" y2="14"/><line x1="78" y1="74" x2="32" y2="14"/>
    </g>
    <path d="M68 14 L80 2 L76 20 Z" fill="#9aa3ad" stroke="${INK}" stroke-width="1.5"/>
    <path d="M32 14 L20 2 L24 20 Z" fill="#9aa3ad" stroke="${INK}" stroke-width="1.5"/>
    <path d="M62 18 Q54 10 60 4 Q66 14 70 12Z" fill="#9aa3ad"/>
    <path d="M38 18 Q46 10 40 4 Q34 14 30 12Z" fill="#9aa3ad"/>
    <circle cx="50" cy="44" r="7" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>`,

  // 2 — Prêtre : chandelle allumée
  priest: `
    <ellipse cx="50" cy="40" rx="26" ry="26" fill="#fff3b0" opacity=".45"/>
    <rect x="42" y="34" width="16" height="36" rx="2" fill="#f7efdc" stroke="#8a6a3a" stroke-width="2"/>
    <path d="M44 38 Q47 44 44 50" stroke="#e6d9bb" stroke-width="2" fill="none"/>
    <path d="M50 8 Q62 22 50 32 Q38 22 50 8Z" fill="#f2a93b"/>
    <path d="M50 16 Q55 24 50 30 Q45 24 50 16Z" fill="#fff3b0"/>
    <line x1="50" y1="30" x2="50" y2="35" stroke="${INK}" stroke-width="2"/>
    <path d="M30 70 H70 Q72 76 66 76 H34 Q28 76 30 70Z" fill="#8a6a3a"/>`,

  // 3 — Baron : balance
  baron: `
    <g stroke="#7a5a1a" stroke-width="3" fill="none" stroke-linecap="round">
      <line x1="50" y1="12" x2="50" y2="70"/><line x1="18" y1="22" x2="82" y2="22"/>
      <line x1="18" y1="22" x2="10" y2="46"/><line x1="18" y1="22" x2="26" y2="46"/>
      <line x1="82" y1="22" x2="74" y2="46"/><line x1="82" y1="22" x2="90" y2="46"/>
      <line x1="34" y1="72" x2="66" y2="72"/>
    </g>
    <path d="M7 46 Q18 58 29 46Z" fill="${GOLD}" stroke="#7a5a1a" stroke-width="1.5"/>
    <path d="M71 46 Q82 58 93 46Z" fill="${GOLD}" stroke="#7a5a1a" stroke-width="1.5"/>
    <circle cx="50" cy="12" r="5" fill="${GOLD}" stroke="#7a5a1a" stroke-width="1.5"/>`,

  // 4 — Servante : écu protecteur au cœur
  handmaid: `
    <path d="M50 6 L82 16 Q82 52 50 74 Q18 52 18 16Z" fill="#3f6e8c" stroke="${GOLD}" stroke-width="3.5"/>
    <path d="M50 14 L74 21 Q74 49 50 65Z" fill="#335b75"/>
    <path d="M50 54 C30 40 37 24 50 33 C63 24 70 40 50 54Z" fill="#fff8ec"/>`,

  // 5 — Prince : couronne fine et épée
  prince: `
    <line x1="50" y1="70" x2="50" y2="34" stroke="#9aa3ad" stroke-width="4"/>
    <line x1="40" y1="68" x2="60" y2="68" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <path d="M24 44 L24 18 L37 30 L50 10 L63 30 L76 18 L76 44Z" fill="${GOLD}" stroke="#7a5a1a" stroke-width="2" stroke-linejoin="round"/>
    <rect x="24" y="42" width="52" height="7" rx="2" fill="#7a5a1a"/>
    <circle cx="50" cy="31" r="4" fill="#2f6fa8"/>
    <circle cx="24" cy="18" r="3" fill="${GOLD}"/><circle cx="76" cy="18" r="3" fill="${GOLD}"/><circle cx="50" cy="10" r="3" fill="${GOLD}"/>`,

  // 6 — Chancelier : parchemin et plume
  chancellor: `
    <rect x="20" y="18" width="52" height="50" rx="3" fill="#f7efdc" stroke="#8a6a3a" stroke-width="2"/>
    <rect x="16" y="12" width="60" height="9" rx="4.5" fill="#dcc79c" stroke="#8a6a3a" stroke-width="2"/>
    <rect x="16" y="65" width="60" height="9" rx="4.5" fill="#dcc79c" stroke="#8a6a3a" stroke-width="2"/>
    <g stroke="#b9a07a" stroke-width="2.2" stroke-linecap="round">
      <line x1="28" y1="30" x2="62" y2="30"/><line x1="28" y1="38" x2="58" y2="38"/>
      <line x1="28" y1="46" x2="62" y2="46"/><line x1="28" y1="54" x2="50" y2="54"/>
    </g>
    <path d="M92 4 Q72 16 62 56 L66 57 Q80 22 92 4Z" fill="#7a2438"/>
    <line x1="64" y1="56" x2="60" y2="64" stroke="${INK}" stroke-width="2"/>`,

  // 7 — Roi : grande couronne
  king: `
    <path d="M16 60 L10 22 L30 40 L40 12 L50 34 L60 12 L70 40 L90 22 L84 60Z" fill="#e0b13e" stroke="#7a5a1a" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="14" y="58" width="72" height="11" rx="3" fill="#7a5a1a"/>
    <g fill="#b3223a"><circle cx="10" cy="22" r="4"/><circle cx="40" cy="12" r="4"/><circle cx="60" cy="12" r="4"/><circle cx="90" cy="22" r="4"/></g>
    <circle cx="50" cy="48" r="6" fill="#b3223a" stroke="#fff3b0" stroke-width="1.5"/>
    <g fill="#fff3b0"><circle cx="30" cy="63.5" r="2"/><circle cx="50" cy="63.5" r="2"/><circle cx="70" cy="63.5" r="2"/></g>`,

  // 8 — Comtesse : diadème
  countess: `
    <path d="M10 62 Q50 34 90 62" fill="none" stroke="#c9ced8" stroke-width="7" stroke-linecap="round"/>
    <path d="M28 50 L34 28 L42 44 M44 40 L50 12 L56 40 M58 44 L66 28 L72 50" fill="none" stroke="#c9ced8" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="50" cy="12" r="6" fill="#8e3fa8" stroke="#fff" stroke-width="1.5"/>
    <circle cx="34" cy="28" r="4.5" fill="#8e3fa8"/><circle cx="66" cy="28" r="4.5" fill="#8e3fa8"/>
    <circle cx="50" cy="48" r="3" fill="#fff"/>`,

  // 9 — Princesse : la lettre scellée d'un cœur
  princess: `
    <rect x="12" y="18" width="76" height="52" rx="4" fill="#fff8ec" stroke="#8a6a3a" stroke-width="2.5"/>
    <path d="M12 21 L50 50 L88 21" fill="none" stroke="#8a6a3a" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="50" cy="50" r="12" fill="#b3223a" stroke="#7d1426" stroke-width="2"/>
    <path d="M50 57 C41 50 44 43 50 47 C56 43 59 50 50 57Z" fill="#fff"/>`,
};

/** SVG de l'emblème d'une carte. */
export function cardArt(id) {
  const body = ART[id] || `<text x="50" y="50" text-anchor="middle" font-size="30">?</text>`;
  return `<svg class="art" viewBox="0 0 100 80" aria-hidden="true" focusable="false">${body}</svg>`;
}
