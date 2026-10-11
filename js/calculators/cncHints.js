// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CNC Editor (kreslení): nápověda k zápisu             ║
// ║  Čisté funkce bez DOM – vysvětlí, co které slovo na řádku     ║
// ║  dělá, a poradí, co dopsat. Testy: tests/cncHints.test.js.    ║
// ╚══════════════════════════════════════════════════════════════╝

import { codePart } from './cncDrawTools.js';

/** Význam slov (klíč = písmena adresy / G-kód). X a Z se doplní podle režimu. */
function wordHelp(w, num, o) {
  const x = o.diam ? 'průměr' : 'poloměr';
  const n = num === null ? null : Number(num);
  switch (w) {
    case 'G':
      switch (n) {
        case 0: return 'rychloposuv bez řezání – na prvním řádku je to STARTOVNÍ BOD';
        case 1: return 'úsečka (lineární posuv) do bodu X, Z';
        case 2: return 'oblouk po směru hodin (↻) do bodu X, Z';
        case 3: return 'oblouk proti směru hodin (↺) do bodu X, Z';
        case 90: return 'absolutní kóty – X, Z jsou polohy od nulového bodu';
        case 91: return 'přírůstkové kóty – X, Z jsou posuny od předchozího bodu';
        default: return 'přípravná funkce G' + num;
      }
    case 'X': return `cíl v ose X (${x}); chybí-li, X se nemění`;
    case 'Z': return 'cíl v ose Z (délka); chybí-li, Z se nemění';
    case 'I': return `střed oblouku: vzdálenost od začátku v X (${x}), jen u G2/G3`;
    case 'K': return 'střed oblouku: vzdálenost od začátku v Z, jen u G2/G3';
    case 'R': return 'poloměr oblouku (alternativa k I, K); záporný = delší oblouk';
    case 'CR': return 'poloměr oblouku (Sinumerik); záporný = delší oblouk';
    case 'PU': return 'polární úhel úsečky od osy +Z (proti směru hodin); k tomu délka L, nebo cílové X či Z. Bez G = G1';
    case 'L': return 'délka úsečky zadané úhlem PU';
    case 'CHF': return 'sražení hrany – délka sražení na kratší straně';
    case 'RND': return 'zaoblení hrany – poloměr';
    case 'C': return 'sražení hrany (Fanuc) – délka sražení';
    case 'M': return 'pomocná funkce (vřeteno, chlazení, konec programu…)';
    case 'F': return 'posuv';
    case 'S': return 'otáčky / řezná rychlost';
    case 'T': return 'číslo nástroje';
    case 'D': return 'korekce nástroje';
    case 'N': return 'číslo bloku (řádku)';
    default: return null;
  }
}

/** Co dopsat dál (jedna věta) podle obsahu řádku; '' = nic. */
function nextTip(words, hasPrevMove) {
  const has = k => words.some(w => w.w === k);
  const g = words.filter(w => w.w === 'G').map(w => Number(w.num));
  const arc = g.includes(2) || g.includes(3);
  if (!words.length) return hasPrevMove
    ? 'Další bod: G1 X… Z… (úsečka) nebo G2 / G3 X… Z… R… (oblouk).'
    : 'Začni startovním bodem: G0 X… Z…, potom G1 / G2 / G3.';
  if (arc) {
    const rad = has('R') || has('CR'), ik = has('I') || has('K');
    if (rad && ik) return 'Oblouk zadej BUĎ poloměrem R, NEBO středem I + K – ne obojí.';
    if (!rad && !ik) return 'Oblouk potřebuje poloměr R (nebo střed I + K).';
    if (!has('X') && !has('Z')) return 'Doplň koncový bod oblouku: X a Z.';
    return '';
  }
  if (g.includes(0) || g.includes(1)) {
    if (has('PU')) return has('L') || has('X') || has('Z') ? '' : 'K úhlu PU doplň délku L (nebo cílové X či Z).';
    if (!has('X') && !has('Z')) return 'Doplň cíl: X a/nebo Z.';
    if (g.includes(0) && !hasPrevMove) return 'Tohle je startovní bod; další řádky tvoří obrys (G1 / G2 / G3).';
  }
  if (has('PU') && !g.length) return has('L') || has('X') || has('Z') ? '' : 'K úhlu PU doplň délku L (nebo cílové X či Z).';
  if (has('X') && !g.length) return 'Bez G se použije naposledy zadané G (G0 / G1 / G2 / G3).';
  return '';
}

/**
 * Nápověda k řádku.
 * @param {string} raw    celý řádek
 * @param {number} caret  sloupec kurzoru v řádku (pro zvýraznění slova pod ním)
 * @param {{diam?:boolean, hasPrevMove?:boolean}} o
 * @returns {{items:{k:string,t:string,cur:boolean}[], tip:string, comment:string}}
 */
export function lineHint(raw, caret, o = {}) {
  const res = { items: [], tip: '', comment: '' };
  const trimmed = raw.trim();
  if (/^;/.test(trimmed)) {
    const c = trimmed.replace(/^;\s*/, '');
    if (/^KONTURA_START/i.test(c)) res.comment = 'značka: začátek obrysu dílu – řádky pod ní tvoří kontura';
    else if (/^STOCK_START/i.test(c)) res.comment = 'značka: začátek polotovaru – řádky pod ní tvoří polotovar';
    else if (/^(KONTURA|STOCK)_END/i.test(c)) res.comment = 'značka: konec bloku (obrys / polotovar)';
    else res.comment = 'komentář – do výkresu se nepromítá';
    return res;
  }
  const code = codePart(raw);
  const re = /([A-Z]+)\s*=?\s*([-+]?(?:\d+\.?\d*|\.\d+))?/g;
  // Pozice slov v původním řádku (pro slovo pod kurzorem) – hledá se postupně
  const upper = raw.toUpperCase();
  let from = (raw.match(/^\s*N\d+\s*/i) || [''])[0].length;
  let m;
  const words = [];
  while ((m = re.exec(code))) {
    const w = m[1];
    if (!wordHelp(w, m[2] ?? null, o)) continue;
    const at = upper.indexOf(m[0].replace(/\s+/g, ' ').split(' ')[0], from);
    const start = at < 0 ? from : at;
    from = start + m[0].length;
    words.push({ w, num: m[2] ?? null, start, end: start + m[0].length });
  }
  const seen = new Set();
  let curSet = false;
  for (const wd of words) {
    const key = wd.w + (wd.w === 'G' ? wd.num : '');
    if (seen.has(key)) continue;
    seen.add(key);
    const cur = !curSet && caret >= wd.start && caret <= wd.end;
    if (cur) curSet = true;
    res.items.push({ k: wd.w + (wd.w === 'G' && wd.num !== null ? wd.num : ''), t: wordHelp(wd.w, wd.num, o), cur });
  }
  // Slovo pod kurzorem první (u dlouhých řádků se zbytek ořízne)
  res.items.sort((a, b) => Number(b.cur) - Number(a.cur));
  res.tip = nextTip(words, !!o.hasPrevMove);
  return res;
}

/** Celá nápověda k zápisu (okno z pravého panelu). Statické HTML. */
export function helpHTML() {
  const row = (k, t) => `<div class="cne-help-row"><b>${k}</b><span>${t}</span></div>`;
  return `
<h4>Jak se píše obrys</h4>
<p>Každý řádek je jeden pohyb. Obrys začíná <b>startovním bodem</b> (G0), pak následují úsečky a oblouky. Pořadí řádků = pořadí na obrysu.</p>
<pre>G90 G0 X0 Z30     ; start
G1 X20 Z30        ; úsečka
G1 X20 Z10
G2 X30 Z0 R10     ; oblouk po směru hodin
G1 X30 Z-20</pre>
<h4>Pohyby</h4>
${row('G0', 'rychloposuv bez řezání. První řádek = <b>startovní bod</b>.')}
${row('G1', 'úsečka (lineární posuv) do bodu X, Z.')}
${row('G2', 'oblouk <b>po směru hodin</b> ↻ do bodu X, Z.')}
${row('G3', 'oblouk <b>proti směru hodin</b> ↺ do bodu X, Z.')}
<h4>Souřadnice</h4>
${row('G90', 'absolutní – X, Z jsou polohy od nulového bodu.')}
${row('G91', 'přírůstkové – X, Z jsou posuny od předchozího bodu.')}
${row('X', 'poloha v ose X (poloměr nebo průměr – podle nastavení „X displej“). Chybí-li, X se nemění.')}
${row('Z', 'poloha v ose Z (délka). Chybí-li, Z se nemění.')}
<h4>Oblouk – dvě možnosti zadání</h4>
${row('R', 'poloměr oblouku. Záporný = delší oblouk (nad 180°).')}
${row('I, K', 'střed oblouku jako posun od <b>začátku</b> oblouku: I v ose X, K v ose Z.')}
<p>Zadej <b>buď R, nebo I + K</b> – ne obojí.</p>
<pre>G2 X30 Z0 R10
G2 X30 Z0 I10 K0</pre>
<h4>Úsečka úhlem a spojení v průsečíku</h4>
${row('PU, L', 'úsečka polárně: <b>PU</b> = úhel od +Z (proti směru hodin), <b>L</b> = délka (místo L jde zadat cílové X nebo Z). Bez G je to G1.')}
${row('🔗', 'jedno tlačítko v horní liště, vždy u kurzoru: na řádku se sražením/zaoblením (CHF/RND) ho převede na dráhu; na druhé ze dvou křížících se úseček je <b>ořízne v průsečíku a spojí</b> do jedné kontury.')}
<pre>G0 X0 Z0
G1 PU45 L1200     ; 1. úsečka
G0 X50 Z200       ; začátek 2. úsečky
PU180 L1200       ; 2. úsečka   ← kurzor sem, klik na 🔗
→
G0 X0 Z0
G1 X50 Z50
Z200</pre>
<p>PU/L se před přenosem do výkresu samy přepíšou na X, Z.</p>
<h4>Hrany</h4>
${row('CHF= / C', 'sražení hrany mezi dvěma řádky (délka sražení).')}
${row('RND= / R', 'zaoblení hrany mezi dvěma řádky (poloměr). Tlačítka Sraž. a Zaobl. zapíšou správný tvar podle řídicího systému.')}
<h4>Ostatní</h4>
${row(';', 'komentář – zbytek řádku se ignoruje.')}
${row('; KONTURA_START', 'začátek obrysu dílu (konec: <b>; KONTURA_END</b>).')}
${row('; STOCK_START', 'začátek polotovaru (konec: <b>; STOCK_END</b>). Tlačítko ✎ Kontura značky vloží.')}
${row('N…', 'číslo bloku (nepovinné).')}
${row('M, F, S, T, D', 'pomocná funkce, posuv, otáčky, nástroj, korekce – kreslení je ignoruje.')}
<h4>Tipy</h4>
<p>Nad klávesnicí je rozbalovací lišta <b>▸ Údaje a nápověda</b>: vysvětlí slova na řádku s kurzorem a ukáže délku, úhel a koncový bod pohybu. Stisk klávesy ukáže její popis. Tlačítko <b>🎯 Bod z plátna</b> vloží souřadnice kliknutím do výkresu, <b>∠</b> zadá úsečku úhlem.</p>`;
}
