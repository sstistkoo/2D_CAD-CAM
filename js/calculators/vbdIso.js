// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Značení VBD dle ISO 1832 (data + dekódování)        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Pozice: 1 tvar · 2 úhel hřbetu · 3 třída přesnosti · 4 typ (díra/utvařeč)
// · 5 velikost (DÉLKA BŘITU v mm, ne IC) · 6 tloušťka (kód) · 7 rádius
// · 8 úprava břitu · 9 směr. Za pomlčkou je označení výrobce (utvařeč,
// např. -PM) – není součástí ISO kódu.

const P = (pts, fill) => '<polygon points="' + pts + '" fill="' + fill + '" stroke="#89b4fa" stroke-width="1.5"/>';

/** Tvar: úhel špičky (pro CAM), poměr IC / délka břitu (pro velikost). */
export const SHAPES = [
  { v: 'C', d: 'Kosočtverec 80°', dt: 'Nejrozšířenější – podélné i čelní soustružení', angle: 80, icPerEdge: Math.sin(80 * Math.PI / 180), svg: P('35,5 53,35 35,65 17,35', '#3498db') },
  { v: 'D', d: 'Kosočtverec 55°', dt: 'Kopírování, dokončování', angle: 55, icPerEdge: Math.sin(55 * Math.PI / 180), svg: P('35,8 55,35 35,62 15,35', '#e74c3c') },
  { v: 'R', d: 'Kruhový', dt: 'Kopírování, hrubování s velkým rádiusem', angle: null, icPerEdge: 1, svg: '<circle cx="35" cy="35" r="22" fill="#9b59b6" stroke="#89b4fa" stroke-width="1.5"/>' },
  { v: 'S', d: 'Čtverec 90°', dt: 'Hrubování, srážení hran, 4 (8) břity', angle: 90, icPerEdge: 1, svg: P('13,13 57,13 57,57 13,57', '#2ecc71') },
  { v: 'T', d: 'Trojúhelník 60°', dt: 'Univerzální, 3 (6) břity', angle: 60, icPerEdge: 1 / Math.sqrt(3), svg: P('35,10 55,52 15,52', '#f1c40f') },
  { v: 'V', d: 'Kosočtverec 35°', dt: 'Jemné kopírování, nejostřejší špička', angle: 35, icPerEdge: Math.sin(35 * Math.PI / 180), svg: P('35,15 52,35 35,55 18,35', '#1abc9c') },
  { v: 'W', d: 'Trigon 80°', dt: 'Šestibřitý trojúhelník s tupými rohy 80°', angle: 80, icPerEdge: 12.7 / 8.69, svg: P('35,9 41,30 58,49 35,45 12,49 29,30', '#e67e22') },
  { v: 'E', d: 'Kosočtverec 75°', dt: 'Méně časté', angle: 75, icPerEdge: Math.sin(75 * Math.PI / 180), svg: P('35,7 54,35 35,63 16,35', '#5dade2') },
  { v: 'M', d: 'Kosočtverec 86°', dt: 'Méně časté', angle: 86, icPerEdge: Math.sin(86 * Math.PI / 180), svg: P('35,9 59,35 35,61 11,35', '#48c9b0') },
  { v: 'H', d: 'Šestiúhelník 120°', dt: 'Frézování, speciální', angle: 120, icPerEdge: Math.sqrt(3), svg: P('35,10 57,22 57,48 35,60 13,48 13,22', '#d35400') },
  { v: 'O', d: 'Osmiúhelník 135°', dt: 'Frézování', angle: 135, icPerEdge: 1 + Math.SQRT2, svg: P('26,12 44,12 58,26 58,44 44,58 26,58 12,44 12,26', '#a04000') },
  { v: 'P', d: 'Pětiúhelník 108°', dt: 'Frézování', angle: 108, icPerEdge: 1.3764, svg: P('35,10 58,28 49,57 21,57 12,28', '#7d3c98') },
  { v: 'L', d: 'Obdélník 90°', dt: 'Speciální', angle: 90, icPerEdge: null, svg: P('8,22 62,22 62,48 8,48', '#2e86c1') },
  { v: 'A', d: 'Rovnoběžník 85°', dt: 'Frézování', angle: 85, icPerEdge: null, svg: P('14,52 22,18 58,18 50,52', '#566573') },
  { v: 'B', d: 'Rovnoběžník 82°', dt: 'Frézování', angle: 82, icPerEdge: null, svg: P('12,52 22,18 58,18 48,52', '#616a6b') },
  { v: 'K', d: 'Rovnoběžník 55°', dt: 'Frézování, zapichování', angle: 55, icPerEdge: null, svg: P('8,52 30,18 62,18 40,52', '#717d7e') },
];

/** Úhel hřbetu [°]. */
export const CLEARANCE_DEG = { A: 3, B: 5, C: 7, D: 15, E: 20, F: 25, G: 30, N: 0, P: 11 };
const CLEARANCE = [
  { v: 'N', d: '0° – negativní', dt: 'Oboustranné destičky, pevný břit, hrubování' },
  { v: 'A', d: '3° – pozitivní', dt: '' },
  { v: 'B', d: '5° – pozitivní', dt: 'Např. VBMT' },
  { v: 'C', d: '7° – pozitivní', dt: 'Šroubové upnutí (CCMT, DCMT), dokončování' },
  { v: 'P', d: '11° – pozitivní', dt: 'Ostré destičky, nízké řezné síly' },
  { v: 'D', d: '15° – pozitivní', dt: '' },
  { v: 'E', d: '20° – pozitivní', dt: '' },
  { v: 'F', d: '25° – pozitivní', dt: '' },
  { v: 'G', d: '30° – pozitivní', dt: '' },
  { v: 'O', d: 'Jiný úhel (zvláštní)', dt: 'Viz katalog' },
];

// Třída přesnosti: m (výška rohu), s (tloušťka), d (vepsaná kružnice) ±mm
const TOLERANCE = [
  ['A', '0,005', '0,025', '0,025', 'broušená'], ['F', '0,005', '0,025', '0,013', 'broušená'],
  ['C', '0,013', '0,025', '0,025', 'broušená'], ['H', '0,013', '0,025', '0,013', 'broušená'],
  ['E', '0,025', '0,025', '0,025', 'broušená'], ['G', '0,025', '0,13', '0,025', 'broušená po obvodu'],
  ['J', '0,005', '0,025', '0,05–0,15', 'broušená'], ['K', '0,013', '0,025', '0,05–0,15', 'broušená'],
  ['L', '0,025', '0,025', '0,05–0,15', 'broušená'], ['M', '0,08–0,2', '0,13', '0,05–0,15', 'lisovaná (nejběžnější)'],
  ['N', '0,08–0,2', '0,025', '0,05–0,15', 'lisovaná'], ['U', '0,13–0,38', '0,13', '0,08–0,25', 'lisovaná, hrubá'],
].map(([v, m, s, d, dt]) => ({ v, d: 'm ±' + m + ', s ±' + s + ', d ±' + d + ' mm', dt }));

const TYPE = [
  ['A', 'Válcová díra, bez utvařeče', 'Upnutí páčkou / klínem'],
  ['B', 'Díra se zahloubením 70–90° (1 strana), bez utvařeče', 'Šroub'],
  ['C', 'Díra se zahloubením 70–90° (2 strany), bez utvařeče', 'Šroub'],
  ['F', 'Bez díry, utvařeč na obou stranách', 'Upínka shora'],
  ['G', 'Válcová díra, utvařeč na obou stranách', 'Páčka / klín, oboustranná'],
  ['H', 'Zahloubení 70–90° (1 strana), utvařeč na 1 straně', 'Šroub'],
  ['J', 'Zahloubení 70–90° (2 strany), utvařeč na obou stranách', 'Šroub'],
  ['M', 'Válcová díra, utvařeč na 1 straně', 'Páčka / klín'],
  ['N', 'Bez díry, bez utvařeče', 'Upínka shora'],
  ['Q', 'Zahloubení 40–60° (2 strany), bez utvařeče', 'Šroub'],
  ['R', 'Bez díry, utvařeč na 1 straně', 'Upínka shora'],
  ['T', 'Zahloubení 40–60° (1 strana), utvařeč na 1 straně', 'Šroub (CCMT, DCMT…)'],
  ['U', 'Zahloubení 40–60° (2 strany), utvařeč na obou stranách', 'Šroub'],
  ['W', 'Zahloubení 40–60° (1 strana), bez utvařeče', 'Šroub'],
  ['X', 'Zvláštní provedení', 'Viz katalog'],
].map(([v, d, dt]) => ({ v, d, dt }));

/** Tloušťka podle kódu [mm]. */
export const THICKNESS_MM = { '01': 1.59, T1: 1.98, '02': 2.38, T2: 2.78, '03': 3.18, T3: 3.97, '04': 4.76, '05': 5.56, '06': 6.35, '07': 7.94, '09': 9.52 };
/** Rádius špičky podle kódu [mm]. */
export const RADIUS_MM = { '00': 0, '01': 0.1, '02': 0.2, '04': 0.4, '08': 0.8, '12': 1.2, '16': 1.6, '20': 2.0, '24': 2.4, '28': 2.8, '32': 3.2 };

const EDGE = [
  ['F', 'Ostrý břit'], ['E', 'Zaoblený (honovaný) břit'], ['T', 'Fazetka (negativní)'],
  ['S', 'Fazetka + zaoblení'], ['K', 'Dvojitá fazetka'], ['P', 'Dvojitá fazetka + zaoblení'],
].map(([v, d]) => ({ v, d, dt: '' }));

/** Data pozic 1–9 (pro výběr i popis). */
export const VBD_ISO = {
  1: { title: 'Tvar', options: SHAPES },
  2: { title: 'Úhel hřbetu', options: CLEARANCE },
  3: { title: 'Třída přesnosti', options: TOLERANCE },
  4: { title: 'Typ (díra, utvařeč)', options: TYPE },
  5: { title: 'Velikost (délka břitu)', options: ['04', '06', '07', '08', '09', '11', '12', '15', '16', '19', '22', '25', '27']
    .map(v => ({ v, d: 'kód ' + v + ' (délka břitu ' + parseInt(v, 10) + '… mm)', dt: '' })) },
  6: { title: 'Tloušťka', options: Object.keys(THICKNESS_MM).map(v => ({ v, d: String(THICKNESS_MM[v]).replace('.', ',') + ' mm', dt: '' })) },
  7: { title: 'Rádius špičky', options: [...Object.keys(RADIUS_MM).map(v => ({ v, d: RADIUS_MM[v] === 0 ? 'ostrá špička' : String(RADIUS_MM[v]).replace('.', ',') + ' mm', dt: '' })),
    { v: 'M0', d: 'kulatá destička, metrický průměr', dt: '' }] },
  8: { title: 'Úprava břitu', options: EDGE },
  9: { title: 'Směr', options: [{ v: 'R', d: 'Pravý', dt: '' }, { v: 'L', d: 'Levý', dt: '' }, { v: 'N', d: 'Neutrální', dt: '' }] },
};

/** Normalizované IC (palcová řada – u ISO VBD standardní). */
const IC_SERIES = [3.97, 4.76, 5.56, 6.35, 7.94, 9.525, 12.7, 15.875, 19.05, 25.4, 31.75];

/**
 * Velikost z kódu poz. 5: IC a skutečná délka břitu.
 * @returns {{ic:number, edge:number}|{diameter:number}|null}
 */
export function sizeInfo(shape, code) {
  if (!/^\d\d$/.test(code || '')) return null;
  const n = parseInt(code, 10);
  if (shape === 'R') return { diameter: n };
  const s = SHAPES.find(x => x.v === shape);
  if (!s || !s.icPerEdge) return null;
  const est = (n + 0.5) * s.icPerEdge;                 // kód = délka břitu oříznutá na celé mm
  const ic = IC_SERIES.reduce((b, v) => (Math.abs(v - est) < Math.abs(b - est) ? v : b));
  return { ic, edge: Math.round(ic / s.icPerEdge * 100) / 100 };
}

/**
 * Rozdělí kód VBD na pozice ISO 1–9 a označení výrobce za pomlčkou.
 * „CNMG120408-PM" → {1:'C',…,7:'08',8:'-',9:'-', suffix:'PM'}
 */
export function parseVbdCode(code) {
  const raw = (code || '').toUpperCase().trim();
  const dash = raw.search(/[-–]/);
  const iso = (dash >= 0 ? raw.slice(0, dash) : raw).replace(/\s/g, '');
  const suffix = dash >= 0 ? raw.slice(dash + 1).replace(/[\s\-–]/g, '') : '';
  const r = { 1: '-', 2: '-', 3: '-', 4: '-', 5: '-', 6: '-', 7: '-', 8: '-', 9: '-', suffix };
  for (let i = 0; i < 4; i++) if (iso[i]) r[i + 1] = iso[i];
  if (iso.length >= 6) r[5] = iso.slice(4, 6);
  if (iso.length >= 8) r[6] = iso.slice(6, 8);
  if (iso.length >= 10) r[7] = iso.slice(8, 10);
  if (iso.length >= 11) r[8] = iso[10];
  if (iso.length >= 12) r[9] = iso[11];
  return r;
}

/** Popis pozice s ohledem na tvar (velikost, tloušťka, rádius jsou z kódu, ne ze seznamu). */
export function describePosition(pos, value, shape) {
  if (!value || value === '-') return null;
  if (pos === 5) {
    const s = sizeInfo(shape, value);
    if (!s) return 'kód ' + value + ' (délka břitu ~' + parseInt(value, 10) + ' mm; IC podle tvaru)';
    if (s.diameter) return 'průměr ' + s.diameter + ' mm';
    return 'délka břitu ' + String(s.edge).replace('.', ',') + ' mm, IC ' + String(s.ic).replace('.', ',') + ' mm';
  }
  if (pos === 6) return THICKNESS_MM[value] !== undefined ? String(THICKNESS_MM[value]).replace('.', ',') + ' mm' : null;
  if (pos === 7) {
    if (value === 'M0') return 'kulatá destička (metrická)';
    return RADIUS_MM[value] !== undefined ? (RADIUS_MM[value] === 0 ? 'ostrá špička' : String(RADIUS_MM[value]).replace('.', ',') + ' mm') : null;
  }
  const o = VBD_ISO[pos].options.find(x => x.v === value);
  return o ? o.d : null;
}

/**
 * Typická upnutí (ISO 5608, 1. písmeno držáku) podle typu destičky:
 * válcová díra → P (páčka), D (tuhé upnutí), M (upínka + kolík); zahloubení → S (šroub);
 * bez díry → C (upínka shora).
 */
export function clampingForType(type) {
  if ('AGM'.includes(type)) return ['P', 'D', 'M'];
  if ('BCHJQTUW'.includes(type)) return ['S'];
  if ('FNR'.includes(type)) return ['C'];
  return [];
}

/** Doporučené držáky: upnutí + tvar + styl + úhel hřbetu (R/L). */
export function holdersFor(shape, clearance, type) {
  const styles = { C: ['L'], D: ['J'], S: ['S', 'K'], T: ['J', 'G'], V: ['J', 'V'], W: ['L'], R: ['D'] }[shape];
  if (!styles || clearance === '-' || !clearance) return '';
  const clamps = type && type !== '-' ? clampingForType(type) : (clearance === 'N' ? ['P', 'D', 'M'] : ['S']);
  const out = [];
  // Neutrální styly (kulatá D, kosočtverec 35° V – 72,5°) mají ruku N
  for (const c of clamps) for (const st of styles) out.push(c + shape + st + clearance + (shape === 'R' || st === 'V' ? 'N' : 'R/L'));
  return out.slice(0, 4).join(', ');
}
