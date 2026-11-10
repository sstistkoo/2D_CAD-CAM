// ╔════════════════════════════════════════╗
// ║  DIALEKT ŘÍDICÍHO SYSTÉMU (hlavička, závěr, převod)   ║
// ╚════════════════════════════════════════╝
// Vyňato z `cam/gcodeEmit.js` (rozdělení podle OPERACÍ, plán §3.A).
// Sinumerik / Fanuc / Heidenhain — JEDINÉ místo, kde se dialekty liší.
// Importuje jen `toolCall.js` (sám bez importů), proto z něj smí čerpat i moduly
// operací (`ops/thread.js`, `ops/partOff.js`) bez rizika cyklu.
//
// POZOR: `ctrlCmt` MUSÍ zůstat function declaration (ne const) — headless
// test harness ho zachytává přes hoisting (viz tests/helpers/camHeadless.mjs).

import { toolCallWord, convertToolCallLine, parseToolCall, toolNumberForName, toolNameForNumber } from './toolCall.js';

// ── Hlavička/závěr programu podle řídicího systému ────────────
// Sdíleno mezi generateAutoGCode() (čerstvé generování z kontury) a
// convertGCodeControlSystem() (rychlý převod existujícího — i ručně
// upraveného — kódu při přepnutí řídicího systému v panelu Parametry).
// Jediné místo, kde se hlavičky/závěry jednotlivých systémů definují.
// Function declaration (ne const) — musí být hoistnutá i přes early-return
// capture v headless test harnessu (tests/helpers/camHeadless.mjs), který
// vrací hned po zachycení referencí, ještě před vykonáním const inicializací.
// Fanuc: závorky uvnitř textu se zahodí — první `)` komentář ukončí a zbytek
// by řízení četlo jako kód (např. „HRUBOVANI (CELNI)" → alarm).
export function ctrlCmt(ctrl) {
  return (text) => ctrl === 'fanuc' ? `( ${String(text).replace(/[()]/g, '')} )` : `; ${text}`;
}

// PRŮMĚR × POLOMĚR U SYSTÉMŮ BEZ DIAMON/DIAMOF.
// Souřadnice X se podle `prms.mode` emitují buď jako průměr (DIAMON), nebo
// jako poloměr (DIAMOF) — viz `xDia` v gcodeEmit.js. Sinumerik to v hlavičce
// vysloví slovem DIAMON/DIAMOF, jenže Fanuc ani Heidenhain ISO na to žádný
// G-kód nemají: rozhoduje strojní parametr (u Fanuca č. 1006 bit 3 pro osu X).
// Program tedy nemá jak si režim vynutit a při nesouladu by se všechny
// radiální rozměry lišily dvojnásobně. Zapíše se proto alespoň do hlavičky,
// v jakém zápisu je psaný — a když je to poloměr (nezvyklý případ, který na
// soustruhu nikdo nečeká), řekne se to důrazně.
//
// Bez závorek uvnitř textu: Fanuc komentář vymezuje právě jimi a vnořené
// zavření by ho ukončilo dřív, takže by zbytek věty spadl do kódu.
function diaModeNote(ctrl, prms) {
  if (prms.mode === 'DIAMON') return 'X = PRŮMĚR, diametrální zápis';
  const where = ctrl === 'fanuc' ? 'parametr 1006 bit 3' : 'strojní parametr';
  return `POZOR: X = POLOMĚR, řízení musí být v radiálním režimu, ${where}`;
}

// Limit otáček z „LIMS=…" v machineType (pole Max. otáčky) — stejné čtení jako
// machineLimitRpm ve feedRates.js; tady bez importu (viz hlavička souboru).
// Do 10. 11. 2026 měl Fanuc natvrdo G50 S2000 a uživatelský limit ignoroval.
function headerLimitRpm(prms) {
  const v = parseInt(String((prms && prms.machineType) || '').match(/LIMS\s*=\s*(\d+)/i)?.[1], 10);
  return Number.isFinite(v) && v > 0 ? v : 2000;
}

// Programovaný bod = STŘED RÁDIUSU destičky (dráhy jsou o R odsazené, bez
// G41/G42). Nástroj změřený na teoretickou špičku by vyrobil díl o R vedle
// (v X o 2R na průměru) — proto to hlavička musí říct.
const NOSE_CENTER_NOTE = 'Dráhy = STŘED rádiusu destičky, bez G41/G42 - korekce měřit ke středu, poloha břitu 9';

/**
 * @param {{name?:string, num?:number}} [tool] nástroj programu; Fanuc/Heidenhain
 *   volají číslem (slot zásobníku), Sinumerik jménem. Bez něj = prms.toolName / T1.
 */
export function buildControlHeaderLines(ctrl, prms, flipX, flipZ, tool) {
  const cmt = ctrlCmt(ctrl);
  const lims = headerLimitRpm(prms);
  const tl = { name: (tool && tool.name) || (prms && prms.toolName), num: tool && tool.num };
  const tWord = toolCallWord(ctrl, tl);
  const tNum = tWord.match(/^T(\d+)/)?.[1] || '';
  const note = (text) => ` ${cmt(text)}`;
  const names = { sinumerik: 'SINUMERIK 840D', fanuc: 'FANUC', heidenhain: 'HEIDENHAIN ISO' };
  const lines = [];
  // Stroj v hlavičce (uživatel 3. 11. 2026): karusel má osy prohozené, program pro
  // soustruh by na něm jel jinam. Prohozený svět karuselu po X opraví emitSwapped.
  const machine = prms && prms.machineStructure === 'carousel' ? 'KARUSEL' : 'SOUSTRUH';
  lines.push(cmt(`Vygenerovaný kód ${names[ctrl] || names.sinumerik} - ${machine}`));
  lines.push(cmt(`Datum: ${new Date().toLocaleDateString()}`));
  if (flipX) lines.push(cmt('Obrábění zespodu (X+ dolů) – G2/G3 prohozeny'));
  if (flipZ) lines.push(cmt('Otočená osa Z (Z+ vlevo) – G2/G3 prohozeny'));
  lines.push(cmt(NOSE_CENTER_NOTE));

  if (ctrl === 'fanuc') {
    lines.push(`G21${note('Metrický vstup')}`, `G40${note('Zrušení kompenzace')}`);
    lines.push(`G99${note('Posuv mm/ot')}`, `G18${note('Rovina ZX')}`);
    lines.push(cmt(diaModeNote(ctrl, prms)));
    lines.push(`G28 U0 W0${note('Referenční bod')}`, `G50 S${lims}${note('Max otáčky')}`);
    lines.push(`G96 S${prms.speed} M3${note('Konst. řezná rychlost')}`);
    lines.push(`${tWord}${note(`Nástroj ${parseInt(tNum.slice(0, 2), 10)} / Korekce ${parseInt(tNum.slice(2), 10)}`)}`, `M8${note('Chlazení ZAP')}`);
  } else if (ctrl === 'heidenhain') {
    lines.push(`G18${note('Rovina ZX')}`, `G90${note('Absolutní')}`);
    lines.push(`G71${note('Metrický systém')}`, `G54${note('Nulový bod')}`);
    lines.push(cmt(diaModeNote(ctrl, prms)));
    lines.push(cmt(`POZOR: limit otáček ${lims} 1/min nastavit na řízení, program ho nepíše`));
    lines.push(`G96 S${prms.speed} M3${note('Řezná rychlost')}`);
    lines.push(`${tWord}${note(`Nástroj ${tNum}`)}`, 'M8');
  } else {
    lines.push(`G18${note('Rovina ZX')}`, `G90${note('Absolutní programování')}`);
    lines.push(`G54${note('Posunutí počátku')}`, `G95${note('Posuv na otáčku')}`);
    lines.push(`G75 X${prms.safeX}${note('Najetí na pevný bod stroje')}`, `G75 Z${prms.safeZ}`);
    lines.push(`LIMS=${lims}${note('Limit otáček')}`);
    lines.push(`G96 S${prms.speed} ${prms.machineType}${note('Konst. řezná rychlost')}`);
    lines.push(`${prms.mode === 'DIAMON' ? 'DIAMON' : 'DIAMOF'}${note(prms.mode === 'DIAMON' ? 'Programování průměru' : 'Programování poloměru')}`);
    lines.push(`${tWord}${note('Výměna nástroje')}`);
    lines.push(`M3${note('Vřeteno CW')}`, `M8${note('Chlazení ZAP')}`);
  }
  return lines;
}

export function buildControlTailLines(ctrl) {
  const cmt = ctrlCmt(ctrl);
  if (ctrl === 'fanuc') return ['M9', 'M5', 'G28 U0 W0', `M30 ${cmt('Konec programu')}`];
  if (ctrl === 'heidenhain') return ['M9', 'M5', 'M30'];
  return ['M9', 'M5', `M30 ${cmt('Konec programu')}`];
}

export function controlArcFormatter(ctrl) {
  return ctrl === 'sinumerik'
    ? (r => `CR=${(parseFloat(r) || 0).toFixed(3)}`)
    : (r => `R${(parseFloat(r) || 0).toFixed(3)}`);
}

// Přečísluje N-bloky (stejná konvence jako "Přečíslovat N-bloky" v CAM
// Editoru) — řádkům bez N doplní, komentáře nechá beze změny.
export function renumberGCodeLines(lines, start, step) {
  let n = start;
  return lines.map(line => {
    const t = line.trim();
    if (!t || t.startsWith(';') || t.startsWith('(')) return line;
    if (/^\s*N\d+/i.test(line)) {
      line = line.replace(/^\s*N\d+/i, 'N' + n);
      n += step;
    } else if (/^[A-Z0-9]/i.test(t) && !t.toUpperCase().startsWith('MSG')) {
      line = 'N' + n + ' ' + line;
      n += step;
    }
    return line;
  });
}

// ── Rychlý převod existujícího G-kódu mezi řídicími systémy ──────
// Volá se při přepnutí "Řídicí systém" v panelu Parametry: hlavička a
// závěr programu (M30 blok) se přegenerují pro nový systém, střední
// část — skutečné dráhy, posuvy, i ruční úpravy uživatele — zůstává
// beze změny, jen se převede styl komentářů (; ↔ ( )) a zápis oblouku
// (CR=... ↔ R...) na řádcích s G2/G3. Chce-li uživatel dráhy přegenerovat
// od nuly z kontury, použije tlačítko "🔄 Dráhy" jako dřív.
// Volání nástroje (hlavička i výměny uvnitř) se převádí jméno ↔ číslo přes
// zásobník `magazine` (S.toolMagazine) — viz toolCall.js.
export function convertGCodeControlSystem(code, oldCtrl, newCtrl, prms, flipX, flipZ, magazine) {
  if (!code || !code.trim() || oldCtrl === newCtrl) return code;
  const lines = code.replace(/\r\n/g, '\n').split('\n');

  // Konec hlavičky: dělicí komentář "--- ... ---" (obě varianty stylu),
  // jinak záložně první řezný/kruhový pohyb G1/G2/G3.
  let bodyStart = lines.findIndex(l => /^\s*[;(]\s*-{2,}/.test(l));
  // Když se hlavička nedá rozpoznat ANI podle dělicího komentáře, ANI podle
  // prvního řezného pohybu, NENÍ co vyměnit — celý text je pak tělo a nová
  // hlavička se nepředřazuje. Do 15. 9. 2026 se v tom případě `bodyStart`
  // nastavil na `lines.length`, takže tělo vyšlo prázdné a převod (pouhé
  // přepnutí „Řídicí systém" v panelu Parametry) uživateli SMAZAL celý
  // program — stačilo, aby v něm nebyl žádný G1/G2/G3 (např. jen rychloposuvy
  // a M-kódy) a chyběl dělicí komentář.
  let headerFound = true;
  if (bodyStart === -1) {
    bodyStart = lines.findIndex(l => /\bG[123]\b/i.test(l.replace(/^\s*N\d+\s*/i, '').replace(/[;(].*$/, '')));
    if (bodyStart === -1) { bodyStart = 0; headerFound = false; }
  }
  const body = lines.slice(bodyStart);
  // Nástroj programu = první volání nástroje ve staré hlavičce.
  const isCmtLine = (l) => /^\s*[;(]/.test(l);
  const oldTc = lines.slice(0, bodyStart).filter(l => !isCmtLine(l)).map(parseToolCall).find(Boolean);
  const headTool = oldTc ? (() => {
    const num = oldTc.num || toolNumberForName(oldTc.name, magazine) || undefined;
    return { num, name: oldTc.name || (num && toolNameForNumber(num, magazine)) || undefined };
  })() : undefined;

  // Konec programu: poslední M30 + bezprostředně předcházející M5/M9/G28
  // (typický závěrečný blok — viz buildControlTailLines).
  let tailStart = -1;
  for (let i = body.length - 1; i >= 0; i--) {
    if (/^\s*(N\d+\s*)?M30\b/i.test(body[i])) { tailStart = i; break; }
  }
  const tailEnd = tailStart === -1 ? -1 : tailStart + 1;
  while (tailStart > 0) {
    const prevClean = body[tailStart - 1].replace(/^\s*N\d+\s*/i, '').replace(/[;(].*$/, '').trim().toUpperCase();
    if (/^M[59]$/.test(prevClean) || /^G28\b/.test(prevClean)) tailStart--;
    else break;
  }
  const hasTail  = tailStart !== -1;
  const middle   = hasTail ? body.slice(0, tailStart) : body;
  const trailing = hasTail ? body.slice(tailEnd) : [];

  const convLine = (line) => {
    let out = isCmtLine(line) ? line : convertToolCallLine(line, newCtrl, magazine);
    if (oldCtrl !== 'fanuc' && newCtrl === 'fanuc') {
      out = out.replace(/;\s*(.*)$/, (_, t) => t.trim() ? `( ${t.trim()} )` : '');
    } else if (oldCtrl === 'fanuc' && newCtrl !== 'fanuc') {
      out = out.replace(/\(\s*(.*?)\s*\)\s*$/, (_, t) => t.trim() ? `; ${t.trim()}` : '');
    }
    // Závit (ops/thread.js): Fanuc `G32 … F stoupání`, ostatní `G33 … K stoupání`.
    // Bez převodu by na Fanucu zůstal G33 (na soustruhu jiný význam / alarm).
    if (newCtrl === 'fanuc' && oldCtrl !== 'fanuc' && /\bG33\b/i.test(out)) {
      out = out.replace(/\bG33\b/i, 'G32').replace(/\bK(\d*\.?\d+)/i, 'F$1');
    } else if (oldCtrl === 'fanuc' && newCtrl !== 'fanuc' && /\bG32\b/i.test(out)) {
      out = out.replace(/\bG32\b/i, 'G33').replace(/\bF(\d*\.?\d+)/i, 'K$1');
    }
    // LIMS= je jen Sinumerik (např. `G96 S… LIMS=…` u výměny na dokončovací nůž);
    // limit ostatních systémů nese hlavička (Fanuc G50).
    if (newCtrl !== 'sinumerik') out = out.replace(/\s*\bLIMS\s*=\s*\d+/i, '');
    if (/\bG0?[23]\b/i.test(out)) {
      if (oldCtrl === 'sinumerik' && newCtrl !== 'sinumerik') out = out.replace(/\bCR=(-?[\d.]+)/i, 'R$1');
      else if (oldCtrl !== 'sinumerik' && newCtrl === 'sinumerik') out = out.replace(/\bR(-?[\d.]+)\b/i, 'CR=$1');
    }
    // Prodleva (vrtání, ops/drill.js): Sinumerik `G4 F s`, Heidenhain
    // `G04 F s`, Fanuc `G04 P ms` — X/U by Fanuc i simulace četly jako osu.
    const dwellS = (() => {
      const f = out.match(/\bG0?4\s+F(\d*\.?\d+)/i);
      if (f) return parseFloat(f[1]);
      const p = out.match(/\bG0?4\s+P(\d+)/i);
      return p ? parseInt(p[1], 10) / 1000 : null;
    })();
    if (dwellS !== null) {
      const word = newCtrl === 'fanuc' ? `G04 P${Math.round(dwellS * 1000)}`
        : newCtrl === 'heidenhain' ? `G04 F${dwellS}` : `G4 F${dwellS}`;
      out = out.replace(/\bG0?4\s+[FP]\d*\.?\d+/i, word);
    }
    return out;
  };

  const newHeader = headerFound ? buildControlHeaderLines(newCtrl, prms, flipX, flipZ, headTool) : [];
  const newTail = hasTail ? buildControlTailLines(newCtrl) : [];

  const assembled = [...newHeader, ...middle.map(convLine), ...newTail, ...trailing.map(convLine)];
  return renumberGCodeLines(assembled, 10, 10).join('\n');
}
