// ╔══════════════════════════════════════════════════════════════╗
// ║  Kontrola programu v editorech G-kódu (CNCParser)             ║
// ╚══════════════════════════════════════════════════════════════╝
// Do 10. 11. 2026 měl CAM Editor i CNC Editor vlastní třídu. CNC Editor
// (kreslení) přidal kontroly modálního pohybu, parametrů oblouku a osy
// zapsané dvakrát (checkModalMotion) a položky nastavení pro kreslení. Ty se
// spouští jen, když je konfigurace obsahuje (`drawChecks`) — CAM Editor je
// nemá, takže jeho kontrola se nezměnila.

import { safeEvalMath } from '../utils.js';

/** Položky ⚙ nastavení kontroly; drawChecks = navíc kontroly pro kreslení (CNC Editor). */
export function defaultParserConfig({ drawChecks = false } = {}) {
  const before = {
    movement:  { name: 'Pohyb (G0-G3)',        active: true },
    coords:    { name: 'Souřadnice (G90/G91)', active: true },
    feed:      { name: 'Posuv (G94/G95)',      active: true },
    spindle:   { name: 'Otáčky (G96/G97)',     active: true },
    startstop: { name: 'Vřeteno při G95',      active: true },
    end:       { name: 'Konec programu',       active: true },
    duplicate: { name: 'Zbytečný (G0-G3) na stejnou souřadnici', active: true },
  };
  const draw = drawChecks ? {
    modalMove: { name: 'Souřadnice bez G po G0 – chybí G1? (kreslení)', active: true },
    arcParams: { name: 'Oblouk G2/G3 bez R / CR / I,K', active: true },
    axisTwice: { name: 'Osa zapsaná v bloku dvakrát', active: true },
    arcFit:    { name: 'Oblouk nejde sestrojit (R / I,K) (kreslení)', active: true },
    contJump:  { name: 'Kontura nenavazuje – G0 uprostřed (kreslení)', active: true },
    negX:      { name: 'X pod osou soustružení (kreslení)', active: true },
    tangency:  { name: 'Netečný přechod úsečka/oblouk (kreslení)', active: false },
  } : {};
  const after = {
    calls:     { name: 'Podprogramy',          active: true },
    params:    { name: 'Parametry (R)',         active: true },
    syntax:    { name: 'Syntaxe',              active: true },
  };
  return { ...before, ...draw, ...after };
}

export class CNCParser {
  constructor() { this.reset(); }
  reset() {
    this.parameters = new Map();
    this.loadedSubprograms = new Map();
    this.errors = [];
    this.coordMode = 90;
    this.lastX = null;
    this.lastZ = null;
    this.modalG = null;       // naposledy platné G0–G3 (modální)
    this.modalGLine = -1;
    this.modalWarned = false; // hlásit jen první blok, který zdědil G0 / nemá G vůbec
  }

  // Pohybové bloky: modální G0–G3 (blok bez G dědí předchozí – po smazaném G1
  // by se kontura jela rychloposuvem), parametry oblouku, osa dvakrát v bloku.
  checkModalMotion(clean, isMv, file, i) {
    const body = clean.replace(/MSG\s*\([^)]*\)/g, '').replace(/^N\d+\s*/, '').trim();
    const gAll = [...body.matchAll(/\bG0*([0-3])\b/g)];
    if (gAll.length) { this.modalG = +gAll[gAll.length - 1][1]; this.modalGLine = i; this.modalWarned = false; }
    // X/Z u jiných příkazů (TRANS, CYCLE…, LIMS=, G4, G53, G74/G75, G33…) nejsou cílem G0–G3.
    if (/^[A-Z_]{2,}/.test(body) && !/^G\d/.test(body)) return;
    if (/\bG(?:0*4|5[03]|7[45]|92|33|50)\b/.test(body)) return;
    const axes = body.match(/(?:^|\s)[XZ]\s*=?\s*[-+.\d(R]/g) || [];
    if (!axes.length) return;
    const c = this.cfg;
    if (c.axisTwice?.active) {
      const names = axes.map(a => a.trim()[0]);
      const dup = names.find((n, k) => names.indexOf(n) !== k);
      if (dup) this.errors.push({ file, lineIndex: i, msg: `Osa ${dup} je v bloku zapsaná dvakrát.` });
    }
    if (!isMv && c.modalMove?.active && !this.modalWarned) {
      if (this.modalG === null) {
        this.modalWarned = true;
        this.errors.push({ file, lineIndex: i, msg: 'Souřadnice bez G0/G1/G2/G3 – není zadaný druh pohybu.' });
      } else if (this.modalG === 0) {
        this.modalWarned = true;
        this.errors.push({ file, lineIndex: i, msg: `Blok nemá G1 – platí G0 (rychloposuv) z řádku ${this.modalGLine + 1}. Chybí G1?` });
      }
    }
    if ((this.modalG === 2 || this.modalG === 3) && c.arcParams?.active &&
        !/(?:^|\s)(?:CR\s*=|AR\s*=|R\s*=?\s*[-+.\d]|[IK]\s*=?\s*[-+.\d(A]|CIP\b|CT\b)/.test(body))
      this.errors.push({ file, lineIndex: i, msg: `Oblouk G${this.modalG} bez poloměru (R / CR=) ani středu (I, K).` });
  }
  loadSubprograms(progs) {
    this.loadedSubprograms = new Map(Object.entries(progs));
  }
  findProgramContent(name) {
    const u = name.toUpperCase().trim();
    if (this.loadedSubprograms.has(name)) return this.loadedSubprograms.get(name);
    if (this.loadedSubprograms.has(u)) return this.loadedSubprograms.get(u);
    if (this.loadedSubprograms.has(u + '.SPF')) return this.loadedSubprograms.get(u + '.SPF');
    if (this.loadedSubprograms.has(u + '.MPF')) return this.loadedSubprograms.get(u + '.MPF');
    const lm = u.match(/^L(\d+)/);
    if (lm) {
      const ln = 'L' + lm[1];
      for (const [key] of this.loadedSubprograms) {
        if (key.toUpperCase().startsWith(ln + '.') || key.toUpperCase() === ln)
          return this.loadedSubprograms.get(key);
      }
    }
    return null;
  }

  parseProgram(code, fileName, cfg) {
    this.reset();
    this.cfg = cfg;
    this.hasLims = false;
    this.spindleActive = false;
    this.coordModeDefined = false;
    this.feedModeDefined = true;
    this.spindleModeDefined = true;
    this.firstMoveFound = false;
    this.activeFeedMode = null;
    this.lastFeedDefined = false;
    this.processLines(code.split('\n'), 0, fileName, new Set());
    return { parameters: this.parameters, errors: this.errors };
  }

  processLines(lines, depth, currentFile, visited) {
    if (depth > 10) return;
    const vk = `${currentFile}-${depth}`;
    if (visited.has(vk)) return;
    visited.add(vk);

    const labels = new Set();
    let hasEnd = false;
    const saved = depth > 0 ? {
      hasLims: this.hasLims, spindleActive: this.spindleActive,
      coordModeDefined: this.coordModeDefined, feedModeDefined: this.feedModeDefined,
      spindleModeDefined: this.spindleModeDefined, firstMoveFound: this.firstMoveFound,
      activeFeedMode: this.activeFeedMode,
      coordMode: this.coordMode, lastX: this.lastX, lastZ: this.lastZ
    } : null;

    lines.forEach(l => {
      const c = l.trim().toUpperCase().split(';')[0];
      const m = c.match(/^\s*(?:N\d+\s*)?([a-zA-Z0-9_]+):/);
      if (m) labels.add(m[1]);
    });

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const ci = line.indexOf(';');
      let clean = ci !== -1 ? line.substring(0, ci).trim().toUpperCase() : line.trim().toUpperCase();
      if (!clean) continue;

      const isMv = /\bG0?[0-3]\b/.test(clean);
      const hasCo = /[XZ]/.test(clean);
      const isFirst = depth === 0 && isMv && hasCo && !this.firstMoveFound;

      if (/\bG90\b/.test(clean)) this.coordMode = 90;
      if (/\bG91\b/.test(clean)) this.coordMode = 91;
      if (/\bG90\b/.test(clean) || /\bG91\b/.test(clean)) this.coordModeDefined = true;

      // Pohyb na stejnou souřadnici jako předchozí blok — typicky zbytečný
      // blok vložený mezi dva bloky, které už na daném místě skončily
      // (např. chainBreak v CAM generátoru). Platí pro G0-G3 stejně.
      if (this.cfg.duplicate.active && isMv && hasCo) {
        const gm = clean.match(/G0?([0-3])\b/);
        const gCode = gm ? 'G' + gm[1] : 'G?';
        const xm = clean.match(/X(-?[\d.]+)/);
        const zm = clean.match(/Z(-?[\d.]+)/);
        const xv = xm ? parseFloat(xm[1]) : null;
        const zv = zm ? parseFloat(zm[1]) : null;
        const newX = xv === null ? this.lastX : (this.coordMode === 91 ? (this.lastX ?? 0) + xv : xv);
        const newZ = zv === null ? this.lastZ : (this.coordMode === 91 ? (this.lastZ ?? 0) + zv : zv);
        if (this.lastX !== null && this.lastZ !== null &&
            Math.abs(newX - this.lastX) < 1e-6 && Math.abs(newZ - this.lastZ) < 1e-6)
          this.errors.push({ file: currentFile, lineIndex: i, msg: `Zbytečný pohyb ${gCode} na stejnou souřadnici jako předchozí blok (X${this.lastX} Z${this.lastZ}).` });
      }
      this.checkModalMotion(clean, isMv, currentFile, i);
      if (isMv && hasCo) {
        const xm = clean.match(/X(-?[\d.]+)/);
        const zm = clean.match(/Z(-?[\d.]+)/);
        const xv = xm ? parseFloat(xm[1]) : null;
        const zv = zm ? parseFloat(zm[1]) : null;
        this.lastX = xv === null ? this.lastX : (this.coordMode === 91 ? (this.lastX ?? 0) + xv : xv);
        this.lastZ = zv === null ? this.lastZ : (this.coordMode === 91 ? (this.lastZ ?? 0) + zv : zv);
      }
      if (/\bG94\b/.test(clean) || /\bG95\b/.test(clean)) this.feedModeDefined = true;
      if (/\bG96\b/.test(clean) || /\bG97\b/.test(clean)) this.spindleModeDefined = true;
      if (/\bG94\b/.test(clean)) this.activeFeedMode = 'G94';
      if (/\bG95\b/.test(clean)) this.activeFeedMode = 'G95';

      if (isFirst) {
        this.firstMoveFound = true;
        if (this.cfg.coords.active && !this.coordModeDefined)
          this.errors.push({ file: currentFile, lineIndex: i, msg: 'Chybí G90/G91 před prvním pohybem.' });
        if (this.cfg.feed.active && !clean.includes('G0') && !this.feedModeDefined)
          this.errors.push({ file: currentFile, lineIndex: i, msg: 'Chybí G94/G95 před pracovním posuvem.' });
      }

      if (/\bG96\b/.test(clean) && !this.hasLims && this.cfg.spindle.active) {
        let found = false;
        for (const l of lines) {
          const cu = l.trim().toUpperCase().split(';')[0];
          if (cu.match(/LIMS\s*=/) || /\bG50\b/.test(cu)) { found = true; break; }
        }
        if (!found) this.errors.push({ file: currentFile, lineIndex: i, msg: 'G96 bez definovaného LIMS/G50.' });
      }
      if (clean.match(/LIMS\s*=/) || /\bG50\b/.test(clean)) this.hasLims = true;

      const isSS = /\bM3\b/.test(clean) || /\bM4\b/.test(clean);
      if (isSS && !this.spindleModeDefined && this.cfg.spindle.active)
        this.errors.push({ file: currentFile, lineIndex: i, msg: 'Chybí G96/G97 před M3/M4.' });
      if (isSS) this.spindleActive = true;
      if (/\bM5\b/.test(clean)) this.spindleActive = false;

      if (/\bG[0]*[123]\b/.test(clean) && this.activeFeedMode === 'G95' &&
          !this.spindleActive && !clean.includes('S') && this.cfg.startstop.active)
        this.errors.push({ file: currentFile, lineIndex: i, msg: 'Pracovní posuv bez aktivního vřetene při G95.' });
      if (/\bF[\d.]+/.test(clean)) this.lastFeedDefined = true;

      if (/\bM30\b/.test(clean) || /\bM17\b/.test(clean) || /\bM02\b/.test(clean)) hasEnd = true;

      const gotoM = clean.match(/\b(GOTOF|GOTOB|IF.*GOTO)\s+([a-zA-Z0-9_]+)/);
      if (gotoM && !labels.has(gotoM[2]) && this.cfg.calls.active)
        this.errors.push({ file: currentFile, lineIndex: i, msg: `Cíl skoku '${gotoM[2]}' neexistuje.` });

      let subName = null;
      const lm = clean.match(/(?:^|\s)L(\d+)(?:\s|;|$)/);
      const cm = clean.match(/\bCALL\s+([A-Z0-9_.]+)/);
      if (lm) subName = 'L' + lm[1]; else if (cm) subName = cm[1];
      if (subName) {
        const csn = subName.trim().toUpperCase().replace(/\.(SPF|MPF)$/i, '');
        const sc = this.findProgramContent(csn);
        if (sc) this.processLines(sc.split('\n'), depth + 1, subName, visited);
        else if (this.cfg.calls.active)
          this.errors.push({ file: currentFile, lineIndex: i, msg: `Podprogram '${subName}' nenalezen.` });
      }

      const ar = /R(\d+)\s*=\s*(.*?)(?=\s+R\d+\s*=|;|$)/g;
      let rm;
      while ((rm = ar.exec(clean)) !== null) {
        const pn = parseInt(rm[1]);
        let expr = rm[2].replace(/R(\d+)/g, (_, n) => {
          const ex = this.parameters.get(`R${n}`);
          return ex ? ex.value : 0;
        }).replace(/[^0-9.+\-*/()]/g, '');
        let val = 0;
        // CSP zakazuje eval/Function (tiše by vrátilo 0) – bezpečný parser výrazů.
        val = safeEvalMath(expr);
        if (!isFinite(val)) val = 0;
        const nM = clean.match(/^N(\d+)/);
        this.parameters.set(`R${pn}`, {
          value: val,
          source: `${currentFile}: ${nM ? 'N' + nM[1] : 'L' + (i + 1)}`,
          file: currentFile, line: i
        });
      }
    }

    if (this.cfg.end.active && !hasEnd && depth === 0 && lines.length > 0)
      this.errors.push({ file: currentFile, lineIndex: lines.length - 1, msg: 'Program nekončí M30 nebo M17.' });
    if (saved) Object.assign(this, saved);
  }
}
