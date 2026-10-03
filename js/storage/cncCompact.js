// Zhuštění G-kódu do „normálního zápisu": modální G0–G3 se nepíše znovu,
// dokud ho nezruší jiný pohybový G, osy X/Z se píší jen když se mění, čísla
// jsou bez zbytečných nul, prázdné řádky se vypouští a poznámka k objektu
// (`;@ Úsečka 1 L=9.169`, viz runCncExport s asDrawn) jde ZA řádek kódu, ke
// kterému patří. Čte text, který vyrobil runCncExport (řádky `G01 X.. Z..`,
// případně s R/I/K); ostatní řádky (komentáře, G90/G91, G28, M30 …) nechává.

const NUM = String.raw`-?\d+(?:\.\d+)?`;
const MOTION = new RegExp(
  String.raw`^(G0?[0-3])((?:\s+[XZ]${NUM})+)((?:\s+[RIK]${NUM})*)(\s+G9[01])?\s*$`, 'i');
const AXIS = new RegExp(String.raw`([XZ])(${NUM})`, 'gi');
const EPS = 5e-4;

// Čísla bez zbytečných nul: X0.000 → X0, R10.500 → R10.5, -0 → 0.
const WORD = new RegExp(String.raw`([XZRIK])(${NUM})`, 'gi');
function tidy(text) {
  return text.replace(WORD, (_, ax, n) => {
    const v = n.includes('.') ? n.replace(/0+$/, '').replace(/\.$/, '') : n;
    return ax + (v === '-0' ? '0' : v);
  });
}

/** @param {string} code @returns {string} */
export function compactCncModal(code) {
  const out = [];
  let lastG = null;            // poslední zapsaný pohybový G (číslo 0–3)
  let mode = 'abs';            // G90 / G91 podle posledního řádku s režimem
  const last = { X: null, Z: null };
  let pendingMode = null;      // { idx, word } – samostatné G90/G91 čekající na první pohyb
  let note = null;             // poznámka objektu čekající na řádek kódu
  let rapidIdx = null;         // řádek G00 objektu – kam poznámka, když nepřijde nic jiného

  const flushNote = () => {
    if (note === null) return;
    if (rapidIdx !== null) out[rapidIdx] += ' ; ' + note;
    else out.push('; ' + note);
    note = null; rapidIdx = null;
  };
  // Poznámka patří k prvnímu řádku objektu, který není rychloposuv (G00 jen najíždí).
  const emit = (line, g) => {
    out.push(line);
    if (note === null) return;
    if (g !== 0) { out[out.length - 1] += ' ; ' + note; note = null; rapidIdx = null; }
    else if (rapidIdx === null) rapidIdx = out.length - 1;
  };

  for (const line of code.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith(';@')) { flushNote(); note = t.slice(2).trim(); continue; }

    const mm = /^G9([01])\b/i.exec(t);
    if (mm) {
      mode = mm[1] === '0' ? 'abs' : 'inc';
      // Samostatný řádek G90/G91 se při prvním pohybu sloučí do jeho řádku.
      pendingMode = /^G9[01]\s*(?:;.*)?$/i.test(t) ? { idx: out.length, word: t.slice(0, 3).toUpperCase() } : null;
      out.push(line); continue;
    }
    const m = MOTION.exec(t);
    if (!m) {
      if (!t.startsWith(';')) pendingMode = null;
      flushNote();
      out.push(line); continue;
    }

    const g = parseInt(m[1].slice(1), 10);
    const axes = [...m[2].matchAll(AXIS)]
      .map(a => ({ ax: a[1].toUpperCase(), text: a[2], v: parseFloat(a[2]) }));

    // Řádek `G00 X.. Z.. G90` (první nájezd v INC): pozice je absolutní, řádek zůstane.
    if (m[4]) {
      axes.forEach(a => { last[a.ax] = a.v; });
      lastG = g; emit(tidy(t), g); continue;
    }

    const changed = axes.filter(a => mode === 'inc'
      ? Math.abs(a.v) > EPS
      : last[a.ax] === null || Math.abs(a.v - last[a.ax]) > EPS);
    axes.forEach(a => {
      if (mode === 'abs') last[a.ax] = a.v;
      else if (last[a.ax] !== null) last[a.ax] += a.v;
    });

    if (changed.length === 0) {
      // Nulový pohyb se vypouští; oblouk s I/K (celá kružnice) zůstává celý.
      if (m[3] && g >= 2) { lastG = g; emit(tidy(t), g); }
      continue;
    }
    const parts = [];
    if (pendingMode) { out[pendingMode.idx] = null; parts.push(pendingMode.word); pendingMode = null; }
    if (lastG !== g) parts.push(m[1].toUpperCase());
    changed.forEach(a => parts.push(a.ax + a.text));
    emit(tidy(parts.join(' ') + m[3]), g);
    lastG = g;
  }
  flushNote();
  return out.filter(l => l !== null).join('\n');
}
