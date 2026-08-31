// ╔════════════════════════════════════════╗
// ║  DIALEKT ŘÍDICÍHO SYSTÉMU (hlavička, závěr, převod)   ║
// ╚════════════════════════════════════════╝
// Vyňato z `cam/gcodeEmit.js` (rozdělení podle OPERACÍ, plán §3.A).
// Sinumerik / Fanuc / Heidenhain — JEDINÉ místo, kde se dialekty liší.
// Nezávisí na ničem dalším (žádné importy), proto z něj smí čerpat i moduly
// operací (`ops/thread.js`, `ops/partOff.js`) bez rizika cyklu.
//
// POZOR: `ctrlCmt` MUSÍ zůstat function declaration (ne const) — headless
// test harness ho zachytává přes hoisting (viz tests/helpers/camHeadless.mjs).

// ── Hlavička/závěr programu podle řídicího systému ────────────
// Sdíleno mezi generateAutoGCode() (čerstvé generování z kontury) a
// convertGCodeControlSystem() (rychlý převod existujícího — i ručně
// upraveného — kódu při přepnutí řídicího systému v panelu Parametry).
// Jediné místo, kde se hlavičky/závěry jednotlivých systémů definují.
// Function declaration (ne const) — musí být hoistnutá i přes early-return
// capture v headless test harnessu (tests/helpers/camHeadless.mjs), který
// vrací hned po zachycení referencí, ještě před vykonáním const inicializací.
export function ctrlCmt(ctrl) {
  return (text) => ctrl === 'fanuc' ? `( ${text} )` : `; ${text}`;
}

export function buildControlHeaderLines(ctrl, prms, flipX, flipZ) {
  const cmt = ctrlCmt(ctrl);
  const note = (text) => ` ${cmt(text)}`;
  const names = { sinumerik: 'SINUMERIK 840D', fanuc: 'FANUC', heidenhain: 'HEIDENHAIN ISO' };
  const lines = [];
  lines.push(cmt(`Vygenerovaný kód ${names[ctrl] || names.sinumerik}`));
  lines.push(cmt(`Datum: ${new Date().toLocaleDateString()}`));
  if (flipX) lines.push(cmt('Obrábění zespodu (X+ dolů) – G2/G3 prohozeny'));
  if (flipZ) lines.push(cmt('Otočená osa Z (Z+ vlevo) – G2/G3 prohozeny'));

  if (ctrl === 'fanuc') {
    lines.push(`G21${note('Metrický vstup')}`, `G40${note('Zrušení kompenzace')}`);
    lines.push(`G99${note('Posuv mm/ot')}`, `G18${note('Rovina ZX')}`);
    lines.push(`G28 U0 W0${note('Referenční bod')}`, `G50 S2000${note('Max otáčky')}`);
    lines.push(`G96 S${prms.speed} M3${note('Konst. řezná rychlost')}`);
    lines.push(`T0101${note('Nástroj 1 / Korekce 1')}`, `M8${note('Chlazení ZAP')}`);
  } else if (ctrl === 'heidenhain') {
    lines.push(`G18${note('Rovina ZX')}`, `G90${note('Absolutní')}`);
    lines.push(`G71${note('Metrický systém')}`, `G54${note('Nulový bod')}`);
    lines.push(`G96 S${prms.speed} M3${note('Řezná rychlost')}`);
    lines.push(`T1 M6${note('Nástroj')}`, 'M8');
  } else {
    lines.push(`G18${note('Rovina ZX')}`, `G90${note('Absolutní programování')}`);
    lines.push(`G54${note('Posunutí počátku')}`, `G95${note('Posuv na otáčku')}`);
    lines.push(`G75 X${prms.safeX}${note('Nájezd do ref. bodu')}`, `G75 Z${prms.safeZ}`);
    lines.push(`LIMS=2000${note('Limit otáček')}`);
    lines.push(`G96 S${prms.speed} ${prms.machineType}${note('Konst. řezná rychlost')}`);
    lines.push(`${prms.mode === 'DIAMON' ? 'DIAMON' : 'DIAMOF'}${note(prms.mode === 'DIAMON' ? 'Programování průměru' : 'Programování poloměru')}`);
    lines.push(`T="${prms.toolName}" D1 M6${note('Výměna nástroje')}`);
    lines.push(`M3${note('Vřeteno CW')}`, `M8${note('Chlazení ZAP')}`);
  }
  return lines;
}

export function buildControlTailLines(ctrl) {
  const cmt = ctrlCmt(ctrl);
  if (ctrl === 'fanuc') return ['M9', 'M5', 'G28 U0 W0', `M30 ${cmt('Konec programu')}`];
  if (ctrl === 'heidenhain') return ['M9', 'M5', 'M30'];
  return [`M30 ${cmt('Konec programu')}`];
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
export function convertGCodeControlSystem(code, oldCtrl, newCtrl, prms, flipX, flipZ) {
  if (!code || !code.trim() || oldCtrl === newCtrl) return code;
  const lines = code.replace(/\r\n/g, '\n').split('\n');

  // Konec hlavičky: dělicí komentář "--- ... ---" (obě varianty stylu),
  // jinak záložně první řezný/kruhový pohyb G1/G2/G3.
  let bodyStart = lines.findIndex(l => /^\s*[;(]\s*-{2,}/.test(l));
  if (bodyStart === -1) {
    bodyStart = lines.findIndex(l => /\bG[123]\b/i.test(l.replace(/^\s*N\d+\s*/i, '').replace(/[;(].*$/, '')));
    if (bodyStart === -1) bodyStart = lines.length;
  }
  const body = lines.slice(bodyStart);

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
    let out = line;
    if (oldCtrl !== 'fanuc' && newCtrl === 'fanuc') {
      out = out.replace(/;\s*(.*)$/, (_, t) => t.trim() ? `( ${t.trim()} )` : '');
    } else if (oldCtrl === 'fanuc' && newCtrl !== 'fanuc') {
      out = out.replace(/\(\s*(.*?)\s*\)\s*$/, (_, t) => t.trim() ? `; ${t.trim()}` : '');
    }
    if (/\bG0?[23]\b/i.test(out)) {
      if (oldCtrl === 'sinumerik' && newCtrl !== 'sinumerik') out = out.replace(/\bCR=(-?[\d.]+)/i, 'R$1');
      else if (oldCtrl !== 'sinumerik' && newCtrl === 'sinumerik') out = out.replace(/\bR(-?[\d.]+)\b/i, 'CR=$1');
    }
    return out;
  };

  const newHeader = buildControlHeaderLines(newCtrl, prms, flipX, flipZ);
  const newTail = hasTail ? buildControlTailLines(newCtrl) : [];

  const assembled = [...newHeader, ...middle.map(convLine), ...newTail, ...trailing.map(convLine)];
  return renumberGCodeLines(assembled, 10, 10).join('\n');
}
