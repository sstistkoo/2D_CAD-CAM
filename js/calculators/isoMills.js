// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – stopkové frézy pro 📚 katalog (poháněné nástroje)     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Frézy pro frézování poháněným nástrojem (cam/live: kapsa a drážka na čele,
// drážka pro pero v plášti) — uživatel 22. 10. 2026: „fréza do zásobníku,
// výběr podle Ø a řezné podmínky jako u vrtáků". Druhy:
//   tvrdokov (VHM) 3 zuby — řeže středem, univerzální na ocel,
//   tvrdokov (VHM) 4 zuby — řeže středem, dokončování / tužší,
//   HSS-Co 2 zuby (drážkovací) — řeže středem, pomalejší, snese horší upnutí,
//   HSS-Co 4 zuby (válcová čelní) — NEŘEŽE středem (zanořit jen rampou /
//     předvrtanou dírou).
// Slot zásobníku: shape 'mill', radius = Ø/2, `teeth` (z), vc [m/min],
// f = POSUV NA ZUB fz [mm/zub], `centerCut`. Otáčky n = Vc·1000 / (π·Ø),
// posuv F [mm/min] = fz · z · n (cam/live/liveMillTools.js).
// Rozměry a řezné podmínky (ocel) jsou ORIENTAČNÍ, jako ostatní katalog.

const r3 = (v) => Math.round(v * 1000) / 1000;
const cz = (v) => String(v).replace('.', ',');

const DIAMETERS = [2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 25];

export const ISO_MILL_KINDS = [
  { id: 'hm3', label: 'tvrdokov 3 zuby', teeth: 3, vc: 120, centerCut: true, hm: true, name: 'Freza HM Z3',
    desc: 'Stopková fréza z tvrdokovu (VHM), 3 zuby, řeže středem — univerzální na drážky a kapsy v oceli, zanoří kolmo.' },
  { id: 'hm4', label: 'tvrdokov 4 zuby', teeth: 4, vc: 140, centerCut: true, hm: true, name: 'Freza HM Z4',
    desc: 'Stopková fréza z tvrdokovu (VHM), 4 zuby, řeže středem — tužší, na dokončení stěn a širší drážky; drážku na plnou šířku raději 3 zuby.' },
  { id: 'hss2', label: 'HSS-Co 2 zuby', teeth: 2, vc: 30, centerCut: true, name: 'Freza HSS Z2',
    desc: 'Drážkovací fréza HSS-Co, 2 zuby, řeže středem — drážka pro pero na jeden průjezd, snese méně tuhé upnutí.' },
  { id: 'hss4', label: 'HSS-Co 4 zuby (neřeže středem)', teeth: 4, vc: 30, centerCut: false, name: 'Freza HSS Z4',
    desc: 'Válcová čelní fréza HSS-Co, 4 zuby, NEŘEŽE středem — kolmo nezanoří (rampa nebo předvrtaná díra); na obvodové frézování.' },
];
const kindOf = (id) => ISO_MILL_KINDS.find((k) => k.id === id) || ISO_MILL_KINDS[0];

/** Průměry fréz v katalogu. */
export function isoMillDiameters() { return DIAMETERS.slice(); }

/** Posuv na zub fz [mm/zub] podle Ø a materiálu frézy (ocel, orientačně). */
export function millFz(d, hm) {
  const fz = hm ? 0.004 * d + 0.01 : 0.003 * d + 0.006;
  return r3(Math.min(hm ? 0.1 : 0.08, Math.max(0.01, fz)));
}

/** Upínač: kleštinové pouzdro ER podle Ø stopky. */
function holderFor(d) {
  if (d <= 10) return { code: 'ER16', w: 32, l: 40 };
  if (d <= 16) return { code: 'ER25', w: 42, l: 50 };
  return { code: 'ER32', w: 50, l: 60 };
}

/**
 * Fréza jako záznam knihovny (tvar jako buildIsoDrill).
 * @param {{kind?:string, diameter?:number}} [opts]
 */
export function buildIsoMill(opts = {}) {
  const kind = kindOf(opts.kind);
  const d = DIAMETERS.includes(Number(opts.diameter)) ? Number(opts.diameter) : 10;
  const L = Math.round(3 * d + 20);          // vyložení: břit ~2×Ø + kus stopky
  const h = holderFor(d);
  const tool = {
    toolShape: 'mill', toolLength: L, toolAngle: 0, toolTipAngle: 180, toolRadius: d / 2,
    toolTipFlat: 0, toolTipMirror: false, toolVbdCode: '', toolClearanceAngle: 0,
    holderLength: h.l, holderWidth: h.w, holderHand: 'R', holderProfile: null,
    knifeAngle: 270, holderInflate: 0, holderInflateAll: false, toolInternal: false,
  };
  // Jméno bez diakritiky — jde do G-kódu (T="…").
  return {
    name: `${kind.name} D${d}`, vbdCode: '', holderCode: h.code,
    desc: kind.desc, iso: { type: 'ML', kind: kind.id, diameter: d, holder: h.code },
    material: '', tipRadius: d / 2, toolAngle: 0, tipAngle: 180, clearanceAngle: 0,
    vc: kind.vc, f: millFz(d, kind.hm), ap: r3(d * (kind.hm ? 0.5 : 0.3)),   // ap = doporučený krok do hloubky
    teeth: kind.teeth, centerCut: kind.centerCut, tool,
  };
}

/** Popisek frézy pro výběr: „⌀10 · z3". */
export function isoMillLabel(d, kindId) {
  return `⌀${cz(d)} · z${kindOf(kindId).teeth}`;
}

/** Kolik fréz katalog nabízí (druh × ⌀). */
export function isoMillCount() {
  return ISO_MILL_KINDS.length * DIAMETERS.length;
}

/** Jednoduchý náhled frézy (SVG): stopka v pouzdře, břit se šroubovicí. */
export function isoMillSvg(rec, px = 68) {
  const d = rec.tool.toolRadius * 2;
  const w = Math.min(40, 10 + d * 1.4), cx = 50, top = 8, cut = 46, len = 88;
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const helix = [0, 1, 2, 3].map(i => `<path d="M${x0} ${top + 30 + i * 10} L${x1} ${top + 22 + i * 10}" stroke="#1e1e2e" stroke-width="1.6"/>`).join('');
  return `<svg viewBox="0 0 100 100" width="${px}" height="${px}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${cx - 18}" y="${top}" width="36" height="16" rx="2" fill="#585b70"/>
    <rect x="${x0}" y="${top + 16}" width="${w}" height="${len - cut}" fill="#a6adc8"/>
    <rect x="${x0}" y="${top + 16 + len - cut}" width="${w}" height="${cut - 20}" fill="#cba6f7"/>
    ${helix}
    ${rec.centerCut ? `<path d="M${x0} ${top + 16 + len - 20} L${x1} ${top + 16 + len - 20}" stroke="#f9e2af" stroke-width="2"/>` : ''}
  </svg>`;
}
