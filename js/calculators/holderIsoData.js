// ── ISO 5608 / ISO 5610 – GEOMETRIE DRŽÁKU ─────────────────────
// Orientační referenční hodnoty konzistentní napříč hlavními výrobci nářadí
// (Sandvik, Seco, Kennametal apod.), NIKOLI certifikovaná katalogová čísla
// konkrétního výrobce. Přesná geometrie (κr, h, b, l1) se u jednotlivých
// výrobců/velikostí může mírně lišit – v UI vždy zobrazovat upozornění
// "Orientační dle ISO 5608, ověřte v katalogu nástroje".

// Styl držáku (pozice 3 kódu dle ISO 5608) → úhel nastavení hlavního ostří κr.
export const HOLDER_STYLES = [
  { code: 'A', kappa: 90,   desc: 'Podélné soustružení, přímý' },
  { code: 'B', kappa: 75,   desc: 'Podélné soustružení' },
  { code: 'C', kappa: 90,   desc: 'Čelní/podélné, pravoúhlý' },
  { code: 'D', kappa: 45,   desc: 'Kopírovací' },
  { code: 'E', kappa: 60,   desc: 'Kopírovací' },
  { code: 'F', kappa: 90,   desc: 'Čelní' },
  { code: 'G', kappa: 90,   desc: 'Zapichovací / upichovací' },
  { code: 'J', kappa: 93,   desc: 'Kopírovací' },
  { code: 'K', kappa: 75,   desc: 'Kopírovací' },
  { code: 'L', kappa: 95,   desc: 'Kopírovací' },
  { code: 'M', kappa: 45,   desc: 'Univerzální' },
  { code: 'P', kappa: 90,   desc: 'Univerzální' },
  { code: 'Q', kappa: 45,   desc: 'Kopírovací' },
  { code: 'R', kappa: 75,   desc: 'Univerzální' },
  { code: 'S', kappa: 45,   desc: 'Univerzální' },
  { code: 'T', kappa: 90,   desc: 'Upichovací' },
  { code: 'U', kappa: 93,   desc: 'Kopírovací, dvoubřitý' },
  { code: 'V', kappa: 72.5, desc: 'Kopírovací (destička V)' },
  { code: 'W', kappa: 60,   desc: 'Univerzální (destička W)' },
];

// Typická řada funkční délky l1 [mm] podle výšky tělesa h [mm].
export const HOLDER_LENGTH_BY_HEIGHT = [
  { h: 16, l1: 100 },
  { h: 20, l1: 125 },
  { h: 25, l1: 150 },
  { h: 32, l1: 170 },
  { h: 40, l1: 200 },
];

export function holderStyleByCode(code) {
  return HOLDER_STYLES.find(function (s) { return s.code === code; }) || null;
}

export function suggestL1(h) {
  if (!h || !isFinite(h)) return null;
  var rows = HOLDER_LENGTH_BY_HEIGHT;
  var best = rows[0];
  var bestDiff = Math.abs(rows[0].h - h);
  for (var i = 1; i < rows.length; i++) {
    var diff = Math.abs(rows[i].h - h);
    if (diff < bestDiff) { best = rows[i]; bestDiff = diff; }
  }
  return best.l1;
}
