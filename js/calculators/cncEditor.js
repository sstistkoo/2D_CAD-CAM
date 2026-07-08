// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CNC Editor (Sinumerik 840D)                        ║
// ║  Editor CNC kódu párovaný s CAD panelem, se zvýrazněním      ║
// ║  syntaxe (dvojče CAM Editoru, pracuje s CNC kódem z CAD)     ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeOverlay } from '../dialogFactory.js';
import { bridge } from '../bridge.js';
import { showToast } from '../state.js';
import { filletTwoLines, chamferTwoLines } from '../geometry.js';

// ── Konstanty ──────────────────────────────────────────────────
const STORAGE_DATA  = 'skica-cnc-editor-data';
const STORAGE_CFG   = 'skica-cnc-editor-settings';
const STORAGE_HDR   = 'skica-cnc-editor-header';
const STORAGE_MERGE = 'skica-cnc-editor-merge-queue';

const G_CODES = {
  '0':'Rychloposuv','1':'Lineární interpolace','2':'Kruhová int. (CW)',
  '3':'Kruhová int. (CCW)','4':'Časová prodleva','17':'Rovina XY',
  '18':'Rovina ZX','19':'Rovina YZ','40':'Zrušení kompenzace',
  '41':'Komp. vlevo','42':'Komp. vpravo','53':'Strojní souřadnice',
  '54':'Nulový bod 1','55':'Nulový bod 2','56':'Nulový bod 3',
  '57':'Nulový bod 4','90':'Absolutní','91':'Přírůstkové',
  '94':'Posuv mm/min','95':'Posuv mm/ot','96':'Konst. řezná rychlost',
  '97':'Konst. otáčky'
};
const M_CODES = {
  '0':'Stop programu','1':'Volitelný stop','3':'Vřeteno CW',
  '4':'Vřeteno CCW','5':'Stop vřetena','6':'Výměna nástroje',
  '8':'Chlazení ZAP','9':'Chlazení VYP','17':'Konec podprogramu',
  '30':'Konec programu','80':'Odjezd do pozice výměny'
};

// ── Pre-compiled regex ─────────────────────────────────────────
// Jediný průchod přes kód řádku – každý znak je vypsán právě jednou
// (buď prostý, nebo obalený přesně jedním <span>), takže výstup má
// vždy stejný počet řádků/sloupců jako textarea (žádné vnořené spany).
const TOKEN_RE = new RegExp(
  '(?<msg>MSG\\s*\\([^)]*\\))' +
  '|(?<block>\\bN\\d+\\b)' +
  '|(?<logic>\\b(?:GOTOF|GOTOB|IF|ELSE|ENDIF|STOPRE)\\b)' +
  '|(?<sub>\\bL\\d+\\b)' +
  '|(?<g>\\bG\\d+\\b)' +
  '|(?<m>\\bM\\d+\\b)' +
  '|(?<param>\\bR\\d+\\b)' +
  '|(?<coord>[XZIKCR]\\s*=?\\s*[-\\d.]+)' +
  '|(?<feed>\\b[FSTD]\\d*\\.?\\d+\\b)',
  'gi'
);

// ── Helpers ────────────────────────────────────────────────────
function esc(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function storageSave(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
}
function storageLoad(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
}

// ── Spojení více programů do jednoho ─────────────────────────
// Rozdělí kód na "hlavičku" (úvodní nastavení stroje – rovina, G90/91,
// nulový bod, posuv, otáčky, nástroj…) a "tělo" (vlastní dráhy). Hranice
// se hledá primárně podle dělicího komentáře "; ---" (tímto stylem
// generuje hlavičky CAD export této appky); pokud žádný není, hlavička
// končí prvním řádkem s G1/G2/G3 (řezný/kruhový pohyb).
function splitHeaderBody(code) {
  const lines = code.replace(/\r\n/g, '\n').split('\n');
  const dividerIdx = lines.findIndex(l => /^\s*;\s*-{2,}/.test(l));
  if (dividerIdx !== -1) return { header: lines.slice(0, dividerIdx), body: lines.slice(dividerIdx) };
  let i = 0;
  while (i < lines.length && !/\bG[123]\b/i.test(lines[i].replace(/^N\d+\s*/, '').replace(/;.*/, ''))) i++;
  return { header: lines.slice(0, i), body: lines.slice(i) };
}

// Modální skupiny sledované při spojování – pro každý rozpoznaný kód
// na řádku hlavičky vrátí dvojici [klíč, hodnota] použitou k porovnání
// se stavem z předchozích programů.
const HEADER_GROUP_PATTERNS = [
  ['plane',    /\bG1[789]\b/i],
  ['absinc',   /\bG9[01]\b/i],
  ['coordsys', /\bG5[4-7]\b|\bG505\b|\bG53\b/i],
  ['feedmode', /\bG9[45]\b/i],
  ['spmode',   /\bG9[67]\b/i],
  ['lims',     /\bLIMS=([\d.]+)/i],
  ['sval',     /\bS([\d.]+)\b/i],
  ['spdir',    /\bM[34]\b/i],
  ['coolant',  /\bM[89]\b/i],
  ['tool',     /\bT="?[^"\s]+"?|\bT\d+\b/i],
  ['dcorr',    /\bD\d+\b/i],
  ['diamode',  /\bDIAMOF\b|\bRADIUS\b/i],
  ['g75x',     /\bG75\b.*\bX-?[\d.]+/i],
  ['g75z',     /\bG75\b.*\bZ-?[\d.]+/i],
  ['startpos', /^G0\s+(.+)$/i],
];

function classifyHeaderLine(line) {
  const clean = line.replace(/^N\d+\s*/, '').replace(/;.*/, '').trim();
  if (!clean) return [];
  const out = [];
  for (const [key, re] of HEADER_GROUP_PATTERNS) {
    const m = clean.match(re);
    if (m) out.push([key, m[1] !== undefined ? m[1] : m[0]]);
  }
  return out;
}

// Přečísluje N-bloky řádků (stejná logika jako menu akce "Přečíslovat
// N-bloky" v editoru) – řádkům bez N-bloku ho přidá, komentáře a prázdné
// řádky nechá beze změny.
function renumberLines(lines, start = 10, step = 10) {
  let n = start;
  return lines.map(line => {
    const t = line.trim();
    if (!t || t.startsWith(';')) return line;
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

// Umožní do fronty pro spojení načíst i uložený projekt (.camprog) – vytáhne
// z něj uložený G-kód (pole manualGCode), místo syrového JSON obsahu souboru.
function extractGCodeFromFile(name, text) {
  if (/\.camprog$/i.test(name)) {
    try {
      const data = JSON.parse(text);
      if (data && typeof data.manualGCode === 'string' && data.manualGCode.trim()) return data.manualGCode;
    } catch { /* není platný JSON projekt – použije se syrový obsah */ }
  }
  return text;
}

// Spojí pole {name, code} do jednoho programu: u druhého a dalších se
// z hlavičky vypíší jen řádky měnící stav stroje oproti stavu z předchozích
// programů (opakované nastavení se vynechá), závěrečné M30 zůstává jen
// u posledního programu a celý výsledek se na závěr přečísluje N10, N20…
// Na každém přechodu mezi programy (kde se M30 vynechává) se před odjezdem
// na bezpečnou polohu vypne vřeteno i chlazení a po výměně nástroje a
// doplnění chybějící hlavičky dalšího programu se zase zapnou.
function mergePrograms(items) {
  const state = {};
  const out = [];
  const isM30 = line => /^(N\d+\s*)?M30\b/i.test(line.replace(/;.*/, '').trim());
  // Index posledního skutečného kódového řádku (přeskočí komentáře typu
  // "; --- KONTURA (Pro referenci) ---" za posledním pohybem) – sem se
  // vloží M5/M9 ještě před odjezd na bezpečnou polohu.
  const lastCodeIndex = lines => {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].replace(/;.*/, '').trim()) return i;
    }
    return -1;
  };

  items.forEach((item, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === items.length - 1;
    const { header, body } = splitHeaderBody(item.code);

    out.push(`; ===== ${item.name} =====`);

    header.forEach(line => {
      if (!line.trim()) return;
      const keys = classifyHeaderLine(line);
      if (!keys.length) {
        if (isFirst) out.push(line);
        return;
      }
      const changed = keys.some(([k, v]) => state[k] !== v);
      if (isFirst || changed) {
        // Před výměnou nástroje (M6) musí být STOPRE, jinak by se mohlo
        // předzpracování bloků dostat dál, než stroj fyzicky vymění nástroj.
        if (!isFirst && keys.some(([k]) => k === 'tool' || k === 'dcorr')) out.push('STOPRE');
        keys.forEach(([k, v]) => { state[k] = v; });
        out.push(line);
      }
    });

    if (!isFirst) {
      const dir = state.spdir || 'M3';
      out.push(`${dir} ; ${M_CODES[dir.slice(1)] || 'Vřeteno ZAP'}`);
      out.push('M8 ; Chlazení ZAP');
    }

    const bodyLines = isLast ? body : body.filter(l => !isM30(l));
    if (!isLast) {
      const stopLines = ['M5 ; Vřeteno STOP', 'M9 ; Chlazení VYP'];
      const ci = lastCodeIndex(bodyLines);
      if (ci >= 0) bodyLines.splice(ci, 0, ...stopLines);
      else bodyLines.push(...stopLines);
    }
    bodyLines.forEach(line => out.push(line));
  });

  return renumberLines(out, 10, 10).join('\n');
}

function defaultParserConfig() {
  return {
    movement:  { name: 'Pohyb (G0-G3)',        active: true },
    coords:    { name: 'Souřadnice (G90/G91)', active: true },
    feed:      { name: 'Posuv (G94/G95)',      active: true },
    spindle:   { name: 'Otáčky (G96/G97)',     active: true },
    startstop: { name: 'Vřeteno při G95',      active: true },
    end:       { name: 'Konec programu',       active: true },
    duplicate: { name: 'Zbytečný (G0-G3) na stejnou souřadnici', active: true },
    calls:     { name: 'Podprogramy',          active: true },
    params:    { name: 'Parametry (R)',         active: true },
    syntax:    { name: 'Syntaxe',              active: true }
  };
}

function defaultHeaderConfig() {
  return {
    gear:    { name: 'Převod (M4x)',       active: true, val: '41' },
    door:    { name: 'Odjezd do výměny',   active: true, val: '80' },
    tool:    { name: 'Nástroj a korekce',  active: true, t: '1', d: '1' },
    coords:  { name: 'Souřadný systém',   active: true, val: 'G54' },
    feed:    { name: 'Posuv',              active: true, mode: 'G95' },
    spindle: { name: 'Vřeteno',            active: true, mode: 'G97', s: '500', m: '4', lims: '2000' }
  };
}

// ── CNCParser ──────────────────────────────────────────────────
class CNCParser {
  constructor() { this.reset(); }
  reset() {
    this.parameters = new Map();
    this.loadedSubprograms = new Map();
    this.errors = [];
    this.coordMode = 90;
    this.lastX = null;
    this.lastZ = null;
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
        try { val = Function('"use strict";return (' + expr + ')')(); } catch { val = 0; }
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

// ── Řídicí systém (sdíleno s CAM Editorem/Simulátorem přes localStorage) ─
function getControlSystem() {
  try {
    const saved = JSON.parse(localStorage.getItem('skica-cam-simulator') || 'null');
    if (saved && saved.params && saved.params.controlSystem) return saved.params.controlSystem;
  } catch { /* ignore */ }
  return 'sinumerik';
}

// Sražení a zaoblení hrany se v jednotlivých řídicích systémech zapisují
// odlišnou syntaxí: Sinumerik CHF=/RND= jako přiřazení hodnoty, Fanuc přímo
// písmenem C/R za koncovými souřadnicemi bloku, Heidenhain vlastním
// blokem CHF <hodnota> / RND R<hodnota>.
function getChamferPrefix() {
  const ctrl = getControlSystem();
  if (ctrl === 'fanuc') return 'C';
  if (ctrl === 'heidenhain') return 'CHF ';
  return 'CHF=';
}

function getRoundPrefix() {
  const ctrl = getControlSystem();
  if (ctrl === 'fanuc') return 'R';
  if (ctrl === 'heidenhain') return 'RND R';
  return 'RND=';
}

// Regex pro rozpoznání markeru sražení/zaoblení v textu kódu, dle aktuálního
// řídicího systému (musí odpovídat tomu, co vkládají tlačítka Sraž./Zaobl.
// přes getChamferPrefix()/getRoundPrefix()).
function getCornerMarkerRegex(kind) {
  const ctrl = getControlSystem();
  if (kind === 'chamfer') {
    if (ctrl === 'fanuc') return /\bC([\d.]+)\b/i;
    if (ctrl === 'heidenhain') return /\bCHF\s+([\d.]+)/i;
    return /\bCH[FR]\s*=\s*([\d.]+)/i; // Sinumerik: CHF= nebo CHR=
  }
  if (ctrl === 'fanuc') return /\bR([\d.]+)\b/i;
  if (ctrl === 'heidenhain') return /\bRND\s+R([\d.]+)/i;
  return /\bRND\s*=\s*([\d.]+)/i;
}

// Přepíše (nebo doplní) X/Z na řádku na nové souřadnice; volitelně z řádku
// nejprve odstraní text markeru sražení/zaoblení (pokud byl na stejném
// řádku jako pohyb). Ostatní obsah řádku (N-blok, G-kód, komentář) zachová.
function rewriteLineXZ(lineText, newX, newZ, stripRe) {
  const ci = lineText.indexOf(';');
  let code = ci !== -1 ? lineText.slice(0, ci) : lineText;
  const comment = ci !== -1 ? lineText.slice(ci) : '';

  if (stripRe) code = code.replace(stripRe, '');

  const xStr = 'X' + newX.toFixed(3);
  const zStr = 'Z' + newZ.toFixed(3);
  code = /\bX\s*-?[\d.]+/i.test(code) ? code.replace(/\bX\s*-?[\d.]+/i, xStr) : (code.replace(/\s+$/, '') + ' ' + xStr);
  code = /\bZ\s*-?[\d.]+/i.test(code) ? code.replace(/\bZ\s*-?[\d.]+/i, zStr) : (code.replace(/\s+$/, '') + ' ' + zStr);

  return code.replace(/[ \t]+/g, ' ').replace(/\s+$/, '') + comment;
}

// ── Sražení/zaoblení → skutečná G-kód dráha ─────────────────────
// Najde markery CHF=/RND= (resp. C/R, CHF/RND R dle řídicího systému)
// vložené tlačítky Sraž./Zaobl. a nahradí je reálnou drahou: zkrácenou
// úsečkou před rohem + G2/G3 obloukem (zaoblení) nebo G1 spojovací
// úsečkou (sražení). Používá stejnou geometrii jako CAD nástroj Zaob./Zkos.
// (filletTwoLines/chamferTwoLines z geometry.js).
function convertCornersToPaths(code) {
  const lines = code.split('\n');
  const n = lines.length;
  const ctrl = getControlSystem();
  const chamferRe = getCornerMarkerRegex('chamfer');
  const roundRe   = getCornerMarkerRegex('round');

  // ── Pass 1: modální sledování polohy + seznam pohybových bodů a markerů ──
  const points = []; // { lineIdx, x, z, isFeed }
  const markers = []; // { lineIdx, kind, value, hasOwnXZ, pointIdx }
  let x = null, z = null, mode = 90;

  for (let i = 0; i < n; i++) {
    const raw = lines[i];
    const ci = raw.indexOf(';');
    const clean = (ci !== -1 ? raw.slice(0, ci) : raw).trim().toUpperCase();
    if (!clean) continue;

    if (/\bG90\b/.test(clean)) mode = 90;
    if (/\bG91\b/.test(clean)) mode = 91;

    const isFeed    = /\bG0?1\b/.test(clean);
    const isRapid   = /\bG0+\b/.test(clean) && !isFeed;
    const isArcMove = /\bG0?[23]\b/.test(clean);

    const xm = clean.match(/\bX\s*(-?[\d.]+)/);
    const zm = clean.match(/\bZ\s*(-?[\d.]+)/);
    const hasXZ = !!(xm || zm);

    let curX = x, curZ = z;
    if (hasXZ) {
      const xv = xm ? parseFloat(xm[1]) : null;
      const zv = zm ? parseFloat(zm[1]) : null;
      curX = xv === null ? x : (mode === 91 ? (x ?? 0) + xv : xv);
      curZ = zv === null ? z : (mode === 91 ? (z ?? 0) + zv : zv);
    }

    // Fanuc: holé C/R jsou nejednoznačné na řádku s G2/G3 (tam R = poloměr
    // oblouku) – takové řádky pro marker přeskočíme.
    const skipMarkerOnLine = ctrl === 'fanuc' && isArcMove;
    const cm = !skipMarkerOnLine ? clean.match(chamferRe) : null;
    const rm = !skipMarkerOnLine ? clean.match(roundRe)   : null;
    const markerKind = cm ? 'chamfer' : (rm ? 'round' : null);
    const markerVal  = cm ? parseFloat(cm[1]) : (rm ? parseFloat(rm[1]) : null);

    if (hasXZ && (isFeed || isRapid)) {
      x = curX; z = curZ;
      const pointIdx = points.length;
      points.push({ lineIdx: i, x, z, isFeed });
      if (markerKind) markers.push({ lineIdx: i, kind: markerKind, value: markerVal, hasOwnXZ: true, pointIdx });
    } else if (markerKind) {
      markers.push({ lineIdx: i, kind: markerKind, value: markerVal, hasOwnXZ: false, pointIdx: points.length - 1 });
    }
  }

  if (!markers.length) return { code, converted: 0, skipped: 0 };

  // ── Pass 2: pro každý marker spočti geometrii korekce rohu ──
  const lineEdits = new Map();  // lineIdx -> nový text řádku (null = smazat)
  const insertions = new Map(); // lineIdx -> pole řádků k vložení ZA tento řádek
  let converted = 0, skipped = 0;

  for (const mk of markers) {
    const cornerPtIdx = mk.pointIdx;
    const beforePtIdx = cornerPtIdx - 1;
    const afterPtIdx  = cornerPtIdx + 1;
    if (cornerPtIdx < 0 || beforePtIdx < 0 || afterPtIdx >= points.length) { skipped++; continue; }

    const beforePt = points[beforePtIdx];
    const cornerPt = points[cornerPtIdx];
    const afterPt  = points[afterPtIdx];
    if (!cornerPt.isFeed || !afterPt.isFeed) { skipped++; continue; } // jen mezi G1 pohyby

    const lineA = { x1: beforePt.x, y1: beforePt.z, x2: cornerPt.x, y2: cornerPt.z };
    const lineB = { x1: cornerPt.x, y1: cornerPt.z, x2: afterPt.x,  y2: afterPt.z };

    let tp1, tp2, connectorLine;
    if (mk.kind === 'round') {
      const res = filletTwoLines(lineA, lineB, mk.value);
      if (!res.ok) { skipped++; continue; }
      tp1 = { x: lineA.x2, z: lineA.y2 };
      tp2 = { x: lineB.x1, z: lineB.y1 };
      const cx = res.arc.cx, cz = res.arc.cy, r = res.arc.r;
      // Směr G2 (CW) / G3 (CCW) dopočítaný z reálné geometrie oblouku
      // (nespoléhá na startAngle/endAngle – ty po interní normalizaci ve
      // filletTwoLines nemusí odpovídat pořadí tp1→tp2). G3/ccw je (jak ho
      // čte parseGcodeToObjects i vykresluje drawArc) definován ve SKUTEČNÉM
      // světovém (X,Z) systému, kde světové X = G-kód Z pole a světové Y =
      // G-kód X pole (soustružnická konvence) – proto se v cross productu
      // musí prohodit .x/.z oproti tomu, jak jsou pojmenované v G-kódu.
      const cross = (tp1.z - cz) * (tp2.x - cx) - (tp1.x - cx) * (tp2.z - cz);
      const gWord = cross > 0 ? 'G3' : 'G2';
      connectorLine = `${gWord} X${tp2.x.toFixed(3)} Z${tp2.z.toFixed(3)} R${r.toFixed(3)}`;
    } else {
      const res = chamferTwoLines(lineA, lineB, mk.value, mk.value);
      if (!res.ok) { skipped++; continue; }
      tp1 = { x: lineA.x2, z: lineA.y2 };
      tp2 = { x: lineB.x1, z: lineB.y1 };
      connectorLine = `G1 X${tp2.x.toFixed(3)} Z${tp2.z.toFixed(3)}`;
    }

    const cornerLineIdx = cornerPt.lineIdx;
    const stripRe = mk.hasOwnXZ ? (mk.kind === 'chamfer' ? chamferRe : roundRe) : null;
    lineEdits.set(cornerLineIdx, rewriteLineXZ(lines[cornerLineIdx], tp1.x, tp1.z, stripRe));

    const ins = insertions.get(cornerLineIdx) || [];
    ins.push(connectorLine);
    insertions.set(cornerLineIdx, ins);

    // Samostatný řádek jen s markerem (bez vlastních X/Z) se po převodu smaže.
    if (!mk.hasOwnXZ && mk.lineIdx !== cornerLineIdx) lineEdits.set(mk.lineIdx, null);

    converted++;
  }

  if (!converted) return { code, converted: 0, skipped };

  // ── Pass 3: sestav výsledný kód ──
  const out = [];
  for (let i = 0; i < n; i++) {
    if (lineEdits.has(i)) {
      const v = lineEdits.get(i);
      if (v !== null) out.push(v);
    } else {
      out.push(lines[i]);
    }
    if (insertions.has(i)) out.push(...insertions.get(i));
  }

  return { code: out.join('\n'), converted, skipped };
}

function getControlSystemBarText() {
  const ctrl = getControlSystem();
  const names = { sinumerik: 'SINUMERIK 840D sl', fanuc: 'FANUC', heidenhain: 'HEIDENHAIN' };
  return `${names[ctrl] || names.sinumerik} &mdash; CNC Editor (CAD kontura)`;
}

// ── Build HTML ─────────────────────────────────────────────────
function buildEditorHTML() {
  return `
<div class="cne-layout">
  <div class="cne-sn-bar" data-el="snBar"></div>
  <div class="cne-toolbar">
    <div class="cne-toolbar-left">
      <button class="cne-tb-btn cne-tb-sidebar" data-act="sidebar" title="Soubory">☰</button>
      <span class="cne-filename" data-el="filename">—</span>
    </div>
    <div class="cne-toolbar-right">
      <button class="cne-tb-btn cne-tb-new cne-hide-m" data-act="new" title="Nový program">＋</button>
      <button class="cne-tb-btn cne-hide-m" data-act="search" title="Hledat v kódu (Ctrl+F)">🔍</button>
      <button class="cne-tb-btn cne-hide-m" data-act="copy" title="Kopírovat do schránky">📋</button>
      <button class="cne-tb-btn cne-hide-m" data-act="download" title="Stáhnout soubor">⬇</button>
      <button class="cne-tb-btn cne-hide-m" data-act="import" title="Import balíčku">📂</button>
      <button class="cne-tb-btn cne-hide-m" data-act="export" title="Export balíčku">📦</button>
      <button class="cne-tb-btn cne-hide-m" data-act="renum" title="Přečíslovat N-bloky">N</button>
      <button class="cne-tb-btn cne-conv cne-hide-m" data-act="convMode" data-el="convModeBtn" title="Přepnout G90 (absolutní) / G91 (přírůstkové)">G90</button>
      <button class="cne-tb-btn cne-hide-m" data-act="header" title="Generovat hlavičku">📝</button>
      <button class="cne-tb-btn cne-hide-m" data-act="cornersToPath" title="Převést sražení/zaoblení (CHF/RND) na skutečnou dráhu G1/G2/G3">⌒</button>
      <button class="cne-tb-btn cne-status" data-act="validate" data-el="statusBtn" title="Validace">●</button>
      <button class="cne-tb-btn" data-act="calc" title="Kalkulačka">🔢</button>
      <button class="cne-tb-btn cne-hide-m" data-act="settings" title="Nastavení parseru">⚙</button>
      <button class="cne-tb-btn cne-menu-btn" data-act="menu" title="Menu">⋮</button>
      <button class="cne-tb-btn cne-cam-btn" data-act="toCad" title="Vykreslit v CAD (přenést úpravy)" aria-label="Vykreslit v CAD">🔄</button>
    </div>
  </div>

  <div class="cne-search-bar" data-el="searchBar">
    <input type="text" data-el="searchInput" placeholder="Hledat v kódu…">
    <span class="cne-search-count" data-el="searchCount"></span>
    <button class="cne-tb-btn" data-act="searchPrev" title="Předchozí (Shift+Enter)">▲</button>
    <button class="cne-tb-btn" data-act="searchNext" title="Další (Enter)">▼</button>
    <button class="cne-tb-btn" data-act="searchClose" title="Zavřít (Esc)">✕</button>
  </div>

  <div class="cne-main">
    <div class="cne-sidebar" data-el="sidebar">
      <div class="cne-sb-section">
        <div class="cne-sb-title" data-act="toggleSection"><span class="cne-sb-arrow">▾</span> Historie</div>
        <div class="cne-sb-content">
          <div class="cne-file-list" data-el="fileList"></div>
        </div>
      </div>
      <div class="cne-sb-section collapsed">
        <div class="cne-sb-title" data-act="toggleSection"><span class="cne-sb-arrow">▾</span> Spoj G-kód</div>
        <div class="cne-sb-content">
          <button class="cne-sb-btn" data-act="mergeLoad" title="Načíst .MPF/.SPF nebo uložený projekt .camprog (vytáhne se jeho G-kód)">📂 Načíst program</button>
          <div class="cne-merge-list" data-el="mergeList"></div>
          <button class="cne-sb-btn accent" data-act="mergeJoin" data-el="mergeJoinBtn" disabled>🔗 Spojit do jednoho</button>
        </div>
      </div>
      <div class="cne-sb-section">
        <div class="cne-sb-title" data-act="toggleSection"><span class="cne-sb-arrow">▾</span> R-Parametry</div>
        <div class="cne-sb-content">
          <div class="cne-param-list" data-el="paramList"></div>
        </div>
      </div>
    </div>

    <div class="cne-editor-wrap">
      <div class="cne-editor-container">
        <div class="cne-backdrop" data-el="backdrop"><div data-el="highlights"></div></div>
        <textarea class="cne-textarea" data-el="editor" spellcheck="false"
                  placeholder="Zde pište CNC kód…"></textarea>
      </div>
    </div>
  </div>

  <div class="cne-quickbar">
    <button class="cne-qb blue" data-inp="G" title="G-kód (cykly, interpolace)">G</button>
    <button class="cne-qb blue" data-inp="M" title="M-kód (vřeteno, chlazení)">M</button>
    <button class="cne-qb" data-inp="X" title="Osa X (průměr)">X</button>
    <button class="cne-qb" data-inp="Z" title="Osa Z (délka)">Z</button>
    <button class="cne-qb gray" data-ins=" " title="Mezera">␣</button>
    <button class="cne-qb del" data-act="backspace" title="Smazat znak">⌫</button>

    <button class="cne-qb" data-inp="F" title="F – Posuv (mm/ot)">F</button>
    <button class="cne-qb" data-inp="S" title="S – Otáčky / řezná rychlost">S</button>
    <button class="cne-qb" data-inp="T" title="T – Číslo nástroje">T</button>
    <button class="cne-qb" data-inp="D" title="D – Korekce nástroje">D</button>
    <button class="cne-qb" data-inp="R" title="R – Parametr">R</button>
    <button class="cne-qb gray" data-inp="" title="Zadat číslo">123</button>

    <button class="cne-qb gray" data-ins=";" title="Středník (komentář)">;</button>
    <button class="cne-qb gray" data-ins="=" title="Přiřazení hodnoty">=</button>
    <button class="cne-qb accent" data-ins="G0 " title="G0 – Rychloposuv">G0</button>
    <button class="cne-qb accent" data-ins="G1 " title="G1 – Lineární interpolace">G1</button>
    <button class="cne-qb accent" data-act="chamfer" title="Sražení hrany (CHF= / C / CHF – dle řídicího systému)">Sraž.</button>
    <button class="cne-qb accent" data-act="round" title="Zaoblení hrany (RND= / R / RND R – dle řídicího systému)">Zaobl.</button>

    <button class="cne-qb green" data-ins="\\n" title="Nový řádek">↵</button>
    <button class="cne-qb red" data-inp="LIMS=" title="LIMS – Omezení otáček">LIMS</button>
    <button class="cne-qb accent" data-ins="STOPRE" title="STOPRE – Zastavit předzpracování">STOP</button>
    <button class="cne-qb gray" data-act="copy" title="Kopírovat kód">📋</button>
    <button class="cne-qb blue" data-act="addBlock" title="Přidat číslo bloku">N+</button>
    <button class="cne-qb cne-kb-btn" data-act="keyboard" title="Zobrazit klávesnici">⌨</button>
  </div>

  <!-- Menu modal (mobile full actions) -->
  <div class="cne-inner-modal" data-el="menuModal" style="display:none">
    <div class="cne-im-card cne-menu-card">
      <div class="cne-im-title">Nástroje editoru<button class="cne-im-close" data-act="menuClose" title="Zavřít">✕</button></div>
      <div class="cne-menu-list">
        <button class="cne-menu-item" data-act="new"><span class="cne-mi-icon green">＋</span><span class="cne-mi-text"><b>Nový program</b><small>Vytvořit nový CNC soubor</small></span></button>
        <button class="cne-menu-item" data-act="search"><span class="cne-mi-icon">🔍</span><span class="cne-mi-text"><b>Hledat v kódu</b><small>Rychlé vyhledávání textu</small></span></button>
        <button class="cne-menu-item" data-act="copy"><span class="cne-mi-icon">📋</span><span class="cne-mi-text"><b>Kopírovat</b><small>Zkopírovat kód do schránky</small></span></button>
        <button class="cne-menu-item" data-act="download"><span class="cne-mi-icon">⬇</span><span class="cne-mi-text"><b>Stáhnout</b><small>Stáhnout aktuální soubor</small></span></button>
        <button class="cne-menu-item" data-act="import"><span class="cne-mi-icon">📂</span><span class="cne-mi-text"><b>Import balíčku</b><small>Načíst soubory z balíčku</small></span></button>
        <button class="cne-menu-item" data-act="export"><span class="cne-mi-icon">📦</span><span class="cne-mi-text"><b>Export balíčku</b><small>Exportovat všechny soubory</small></span></button>
        <div class="cne-menu-sep"></div>
        <button class="cne-menu-item" data-act="renum"><span class="cne-mi-icon">🔢</span><span class="cne-mi-text"><b>Přečíslovat N-bloky</b><small>Přečíslování bloků N10, N20…</small></span></button>
        <button class="cne-menu-item" data-act="convMode"><span class="cne-mi-icon sn" data-el="convModeMenuIcon">G90</span><span class="cne-mi-text"><b>Přepnout G90 / G91</b><small>Absolutní ↔ přírůstkové (nájezd v G90)</small></span></button>
        <div class="cne-menu-sep"></div>
        <button class="cne-menu-item" data-act="header"><span class="cne-mi-icon">📝</span><span class="cne-mi-text"><b>Generovat hlavičku</b><small>Vložit hlavičku programu (M4x, T, G54…)</small></span></button>
        <button class="cne-menu-item" data-act="cornersToPath"><span class="cne-mi-icon">⌒</span><span class="cne-mi-text"><b>Sražení/zaoblení → dráha</b><small>Převede CHF/RND markery na G1/G2/G3</small></span></button>
        <div class="cne-menu-sep"></div>
        <button class="cne-menu-item" data-act="toCad"><span class="cne-mi-icon">🔄</span><span class="cne-mi-text"><b>Vykreslit v CAD</b><small>Přenést kód do CAD a vykreslit konturu</small></span></button>
        <button class="cne-menu-item" data-act="calc"><span class="cne-mi-icon">🔢</span><span class="cne-mi-text"><b>Kalkulačka</b><small>Otevřít kalkulačku</small></span></button>
        <div class="cne-menu-sep"></div>
        <button class="cne-menu-item" data-act="settings"><span class="cne-mi-icon">⚙</span><span class="cne-mi-text"><b>Nastavení validace</b><small>Pravidla kontroly programu</small></span></button>
      </div>
      <button class="cne-im-btn cancel" data-act="menuClose" style="margin-top:10px;width:100%">Zavřít</button>
    </div>
  </div>

  <!-- Numpad modal -->
  <div class="cne-inner-modal" data-el="numModal" style="display:none">
    <div class="cne-im-card">
      <div class="cne-im-title" data-el="numTitle">Vstup<button class="cne-im-close" data-act="numCancel" title="Zavřít">✕</button></div>
      <input class="cne-im-input" data-el="numInput" type="text" readonly>
      <div class="cne-im-helpers" data-el="numHelpers"></div>
      <div class="cne-numpad">
        <button class="cne-np" data-n="7">7</button><button class="cne-np" data-n="8">8</button><button class="cne-np" data-n="9">9</button>
        <button class="cne-np" data-n="4">4</button><button class="cne-np" data-n="5">5</button><button class="cne-np" data-n="6">6</button>
        <button class="cne-np" data-n="1">1</button><button class="cne-np" data-n="2">2</button><button class="cne-np" data-n="3">3</button>
        <button class="cne-np sign" data-n="±">±</button><button class="cne-np" data-n="0">0</button><button class="cne-np" data-n=".">.</button>
      </div>
      <div class="cne-im-actions">
        <button class="cne-im-btn cancel" data-act="numCancel">Zrušit</button>
        <button class="cne-im-btn ok" data-act="numOk">OK</button>
      </div>
    </div>
  </div>

  <!-- Validation modal -->
  <div class="cne-inner-modal" data-el="valModal" style="display:none">
    <div class="cne-im-card cne-val-card">
      <div class="cne-im-title">Validace programu<button class="cne-im-close" data-act="valClose" title="Zavřít">✕</button></div>
      <div class="cne-val-list" data-el="valList"></div>
      <button class="cne-im-btn cancel" data-act="valClose" style="margin-top:8px;width:100%">Zavřít</button>
    </div>
  </div>

  <!-- Settings modal -->
  <div class="cne-inner-modal" data-el="cfgModal" style="display:none">
    <div class="cne-im-card">
      <div class="cne-im-title">Nastavení validace<button class="cne-im-close" data-act="cfgClose" title="Zavřít">✕</button></div>
      <div class="cne-cfg-list" data-el="cfgList"></div>
      <button class="cne-im-btn cancel" data-act="cfgClose" style="margin-top:8px;width:100%">Zavřít</button>
    </div>
  </div>

  <!-- Renumber modal -->
  <div class="cne-inner-modal" data-el="renumModal" style="display:none">
    <div class="cne-im-card">
      <div class="cne-im-title">Přečíslování N-bloků<button class="cne-im-close" data-act="renumCancel" title="Zavřít">✕</button></div>
      <div style="display:flex;gap:8px;margin:8px 0">
        <label style="flex:1;color:var(--ctp-subtext0);font-size:.85rem">Start:<input data-el="renumStart" type="number" inputmode="numeric" value="10" min="1" class="cne-im-input" style="width:100%;margin-top:4px"></label>
        <label style="flex:1;color:var(--ctp-subtext0);font-size:.85rem">Krok:<input data-el="renumStep" type="number" inputmode="numeric" value="10" min="1" class="cne-im-input" style="width:100%;margin-top:4px"></label>
      </div>
      <div class="cne-im-actions">
        <button class="cne-im-btn cancel" data-act="renumCancel">Zrušit</button>
        <button class="cne-im-btn ok" data-act="renumOk">Přečíslovat</button>
      </div>
      <button class="cne-im-btn cancel" data-act="undoRenum" data-el="undoRenumBtn" style="margin-top:4px;width:100%;display:none">↩ Vrátit přečíslování</button>
    </div>
  </div>

  <!-- Header generator modal -->
  <div class="cne-inner-modal" data-el="hdrModal" style="display:none">
    <div class="cne-im-card" style="min-width:300px;max-width:380px">
      <div class="cne-im-title"><span data-el="hdrTitle">Generovat hlavičku programu</span><button class="cne-im-close" data-act="hdrClose" title="Zavřít">✕</button></div>
      <div class="cne-hdr-list" data-el="hdrList"></div>
      <div class="cne-im-actions" style="margin-top:10px">
        <button class="cne-im-btn cancel" data-act="hdrClose">Zavřít</button>
        <button class="cne-im-btn ok" data-act="hdrApply">Vložit hlavičku</button>
      </div>
    </div>
  </div>

  <input type="file" data-el="fileInput" style="display:none" accept=".txt,.mpf,.spf">
  <input type="file" data-el="mergeFileInput" style="display:none" accept=".txt,.mpf,.spf,.camprog" multiple>
</div>`;
}

// ══════════════════════════════════════════════════════════════
// ██  MAIN EXPORT  ████████████████████████████████████████████
// ══════════════════════════════════════════════════════════════
export function openCncEditor(initialCode) {
  // ── State ──────────────────────────────────────────────────
  let programs   = {};
  let currentFile = '';
  let parserCfg  = defaultParserConfig();
  let headerCfg  = defaultHeaderConfig();
  let tValidate  = null;
  let tSave      = null;
  let rafHL      = null;
  let inputPrefix = '';
  let numTargetSel = null;          // pozice kurzoru v editoru zachycená při otevření numpadu
  const parser   = new CNCParser();
  let coordMode = 'abs';            // aktuální režim souřadnic: 'abs' (G90) / 'inc' (G91)
  let codeBeforeRenum = '';
  let mergeQueue = [];              // fronta {name, code} pro spojení do jednoho programu

  // Load persisted
  const sd = storageLoad(STORAGE_DATA);
  if (sd && sd.programs && Object.keys(sd.programs).length) {
    programs = sd.programs;
    currentFile = sd.currentFile || Object.keys(programs)[0];
  }
  const sc = storageLoad(STORAGE_CFG);
  if (sc) {
    // Jen 'active' (ZAP/VYP) je uživatelské nastavení k zachování — popisky
    // (name) musí vždy pocházet z aktuálního kódu, jinak přežije stará
    // uložená verze textu i po přejmenování v defaultParserConfig().
    parserCfg = defaultParserConfig();
    Object.keys(parserCfg).forEach(k => {
      if (sc[k] && typeof sc[k].active === 'boolean') parserCfg[k].active = sc[k].active;
    });
  }
  const sh = storageLoad(STORAGE_HDR);
  if (sh) headerCfg = { ...defaultHeaderConfig(), ...sh };
  const sm = storageLoad(STORAGE_MERGE);
  if (Array.isArray(sm)) mergeQueue = sm;

  // ── Create overlay ─────────────────────────────────────────
  const overlay = makeOverlay('cnc-editor', '💻 CNC Editor', buildEditorHTML(), 'cnc-editor-window');
  if (!overlay) return;

  // ── DOM refs ───────────────────────────────────────────────
  const $ = s => overlay.querySelector(`[data-el="${s}"]`);
  const root        = overlay.querySelector('.cne-layout');
  $('snBar').innerHTML = getControlSystemBarText();
  const editor      = $('editor');
  const backdrop    = $('backdrop');
  const highlights  = $('highlights');
  const fileListEl  = $('fileList');
  const paramListEl = $('paramList');
  const sidebarEl   = $('sidebar');
  const statusBtn   = $('statusBtn');
  const filenameLbl = $('filename');
  const numModal    = $('numModal');
  const numInput    = $('numInput');
  const numTitle    = $('numTitle');
  const numHelpers  = $('numHelpers');
  const valModal    = $('valModal');
  const valList     = $('valList');
  const cfgModal    = $('cfgModal');
  const cfgList     = $('cfgList');
  const fileInput   = $('fileInput');
  const hdrModal    = $('hdrModal');
  const hdrList     = $('hdrList');
  const mergeListEl = $('mergeList');
  const mergeJoinBtn = $('mergeJoinBtn');
  const mergeFileInput = $('mergeFileInput');
  const searchBar    = $('searchBar');
  const searchInput  = $('searchInput');
  const searchCountEl = $('searchCount');

  // ── Persistence ────────────────────────────────────────────
  function persist() { storageSave(STORAGE_DATA, { programs, currentFile }); }
  function persistCfg() { storageSave(STORAGE_CFG, parserCfg); }
  function persistMerge() { storageSave(STORAGE_MERGE, mergeQueue); }

  // ── File management ────────────────────────────────────────
  function ensureFile() {
    if (!currentFile || !programs[currentFile]) {
      const nm = 'PROG_1.MPF';
      programs[nm] = '; Nový program\nG54 G90 G18\nG95\nG97 S500 M4\nSTOPRE\n\n\nM30\n';
      currentFile = nm;
    }
  }

  function displayFile(name) {
    if (!programs[name]) return;
    currentFile = name;
    editor.value = programs[name];
    filenameLbl.textContent = name;
    // Vstupní CNC kód je generován absolutně – při zobrazení souboru začínáme v G90.
    coordMode = 'abs';
    updateModeBtn();
    refreshVisual();
    renderFileList();
    scheduleValidation();
  }

  function renderFileList() {
    const keys = Object.keys(programs);
    fileListEl.innerHTML = keys.map(k => {
      const act = k === currentFile ? ' active' : '';
      return `<div class="cne-fi${act}" data-file="${esc(k)}">
        <span class="cne-fi-name">${esc(k)}</span>
        <button class="cne-fi-del" data-del="${esc(k)}" title="Smazat">✕</button>
      </div>`;
    }).join('') || '<div class="cne-fi-empty">Žádné soubory</div>';
  }

  function createNew() {
    let n = 1;
    while (programs[`PROG_${n}.MPF`]) n++;
    const nm = `PROG_${n}.MPF`;
    programs[nm] = `; ${nm}\nG54 G90 G18\nG95\nG97 S500 M4\nSTOPRE\n\n\nM30\n`;
    displayFile(nm);
    persist();
  }

  function deleteFile(name) {
    if (!confirm(`Smazat "${name}"?`)) return;
    delete programs[name];
    const keys = Object.keys(programs);
    if (keys.length) displayFile(keys[0]);
    else { currentFile = ''; ensureFile(); displayFile(currentFile); }
    persist();
  }

  function renameFile() {
    let nw = prompt('Nový název:', currentFile);
    if (!nw || nw.trim() === currentFile) return;
    nw = nw.trim();
    if (!/\.(MPF|SPF)$/i.test(nw)) {
      nw += /\.SPF$/i.test(currentFile) ? '.SPF' : '.MPF';
    }
    if (programs[nw]) return;
    programs[nw] = programs[currentFile];
    delete programs[currentFile];
    currentFile = nw;
    displayFile(nw);
    persist();
  }

  // ── Spojení více programů do jednoho ────────────────────────
  function renderMergeList() {
    mergeListEl.innerHTML = mergeQueue.length
      ? mergeQueue.map((p, i) => `
        <div class="cne-mq">
          <span class="cne-mq-name" title="${esc(p.name)}">${i + 1}. ${esc(p.name)}</span>
          <div class="cne-mq-btns">
            <button class="cne-mq-btn" data-mq-act="up" data-mq-i="${i}" title="Posunout nahoru" ${i === 0 ? 'disabled' : ''}>▲</button>
            <button class="cne-mq-btn" data-mq-act="down" data-mq-i="${i}" title="Posunout dolů" ${i === mergeQueue.length - 1 ? 'disabled' : ''}>▼</button>
            <button class="cne-mq-btn del" data-mq-act="del" data-mq-i="${i}" title="Odebrat">✕</button>
          </div>
        </div>`).join('')
      : '<div class="cne-fi-empty">Žádné programy ve frontě</div>';
    mergeJoinBtn.disabled = mergeQueue.length < 2;
  }

  function handleMergeLoad(ev) {
    const files = Array.from(ev.target.files || []);
    if (!files.length) return;
    // Výsledky se skládají podle pořadí výběru (do předem připraveného pole),
    // ne podle toho, který soubor se asynchronně načte první.
    const results = new Array(files.length);
    let pending = files.length;
    files.forEach((f, i) => {
      const reader = new FileReader();
      reader.onload = () => {
        results[i] = { name: f.name, code: extractGCodeFromFile(f.name, reader.result) };
        if (--pending === 0) {
          mergeQueue.push(...results);
          renderMergeList();
          persistMerge();
        }
      };
      reader.readAsText(f);
    });
    mergeFileInput.value = '';
  }

  function joinMergeQueue() {
    if (mergeQueue.length < 2) return;
    const merged = mergePrograms(mergeQueue);
    let n = 1;
    while (programs[`SPOJENY_${n}.MPF`]) n++;
    const nm = `SPOJENY_${n}.MPF`;
    programs[nm] = merged;
    displayFile(nm);
    persist();
  }

  // ── Syntax highlighting ────────────────────────────────────
  function highlightCode(code) {
    let out = '';
    let last = 0;
    TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = TOKEN_RE.exec(code))) {
      out += esc(code.slice(last, m.index));
      const g = m.groups;
      const cls = g.msg ? 'hl-msg' : g.block ? 'hl-block' : g.logic ? 'hl-logic'
        : g.sub ? 'hl-sub' : g.g ? 'hl-g' : g.m ? 'hl-m' : g.param ? 'hl-param'
        : g.coord ? 'hl-coord' : 'hl-feed';
      out += `<span class="${cls}">${esc(m[0])}</span>`;
      last = m.index + m[0].length;
      if (m[0].length === 0) TOKEN_RE.lastIndex++;
    }
    out += esc(code.slice(last));
    return out;
  }

  function applyHighlight() {
    const code = editor.value;
    const out = code.split('\n').map(line => {
      const ci = line.indexOf(';');
      if (ci === 0) return `<span class="hl-comment">${esc(line)}</span>`;

      const work = ci > 0 ? line.substring(0, ci) : line;
      const comment = ci > 0 ? `<span class="hl-comment">${esc(line.substring(ci))}</span>` : '';

      return highlightCode(work) + comment;
    });
    highlights.innerHTML = out.join('\n') + '\n';
  }

  function refreshVisual() {
    applyHighlight();
    syncScroll();
  }

  function syncScroll() {
    backdrop.scrollTop  = editor.scrollTop;
    backdrop.scrollLeft = editor.scrollLeft;
  }

  // ── Aktivní cíl vkládání (naposledy zaostřené pole) ─────────
  // Spodní klávesnice (quickbar) i numpad musí psát tam, kde uživatel
  // naposledy klikl — do editoru kódu, nebo do vyhledávacího pole,
  // pokud je otevřené. mousedown na quickbaru má preventDefault, takže
  // fokus mezi kliky neputuje na tlačítko a activeTarget zůstává platný
  // i během interakce s numpad modalem (ten focus nepřebírá).
  let activeTarget = editor;
  editor.addEventListener('focus', () => { activeTarget = editor; });
  searchInput.addEventListener('focus', () => { activeTarget = searchInput; });

  // ── Insert / Backspace ─────────────────────────────────────
  function insertText(text) {
    const actual = text === '\\n' ? '\n' : text;
    if (activeTarget === searchInput) {
      const s = searchInput.selectionStart, e = searchInput.selectionEnd, v = searchInput.value;
      searchInput.value = v.substring(0, s) + actual + v.substring(e);
      searchInput.selectionStart = searchInput.selectionEnd = s + actual.length;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    editor.readOnly = false;
    const s = editor.selectionStart, e = editor.selectionEnd, v = editor.value;
    // Nastavení .value textarey samo o sobě resetuje scrollTop/scrollLeft
    // na 0 (prohlížeč to bere jako úplně nový obsah) – bez tohoto uložení
    // a obnovení by po každém klepnutí na spodní klávesnici pohled skočil
    // na začátek souboru, i když kurzor zůstal správně na místě.
    const scrollTop = editor.scrollTop, scrollLeft = editor.scrollLeft;
    // Automatická mezera před vkládaným tokenem, pokud znak před kurzorem
    // není mezera/zalomení řádku – umožní psát tlačítky v kuse bez nutnosti
    // ručně mezi nimi klikat na "␣". Vynechá se pro pokračování stejného
    // tokenu (";" komentář, "=" přiřazení, samotnou mezeru/nový řádek).
    const prevChar = s > 0 ? v[s - 1] : '';
    const needsSpace = prevChar && !/\s/.test(prevChar) && !/^[;=]/.test(actual) && actual !== ' ' && actual !== '\n';
    const insert = (needsSpace ? ' ' : '') + actual;
    editor.value = v.substring(0, s) + insert + v.substring(e);
    editor.selectionStart = editor.selectionEnd = s + insert.length;
    editor.scrollTop = scrollTop;
    editor.scrollLeft = scrollLeft;
    // Tlačítka uvnitř numpad modalu (číslice, OK) na rozdíl od quickbaru
    // nemají mousedown-preventDefault, takže po jejich použití editor
    // ztratil focus – na nefokusovaném textarea se selectionStart po čase
    // (další DOM změna) přestane spolehlivě držet, což při druhém
    // vkládání za sebou (např. RND=5 pak Z5) způsobovalo skok na začátek.
    // Vrácením focusu se stav ustálí pro další čtení.
    editor.focus({ preventScroll: true });
    onInput();
  }

  function doBackspace() {
    if (activeTarget === searchInput) {
      const s = searchInput.selectionStart, e = searchInput.selectionEnd, v = searchInput.value;
      if (s !== e) {
        searchInput.value = v.substring(0, s) + v.substring(e);
        searchInput.selectionStart = searchInput.selectionEnd = s;
      } else if (s > 0) {
        searchInput.value = v.substring(0, s - 1) + v.substring(s);
        searchInput.selectionStart = searchInput.selectionEnd = s - 1;
      }
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    editor.readOnly = false;
    const s = editor.selectionStart, e = editor.selectionEnd, v = editor.value;
    const scrollTop = editor.scrollTop, scrollLeft = editor.scrollLeft;
    if (s !== e) {
      editor.value = v.substring(0, s) + v.substring(e);
      editor.selectionStart = editor.selectionEnd = s;
    } else if (s > 0) {
      editor.value = v.substring(0, s - 1) + v.substring(s);
      editor.selectionStart = editor.selectionEnd = s - 1;
    }
    editor.scrollTop = scrollTop;
    editor.scrollLeft = scrollLeft;
    editor.focus({ preventScroll: true });
    onInput();
  }

  function insertBlockNumber() {
    editor.readOnly = false;
    const v = editor.value, pos = editor.selectionStart;
    const lineStart = v.lastIndexOf('\n', pos - 1) + 1;
    const lineEnd = v.indexOf('\n', pos); const le = lineEnd === -1 ? v.length : lineEnd;
    const line = v.substring(lineStart, le);
    if (/^\s*N\d+/i.test(line)) return; // already has block number
    const step = parseInt($('renumStep')?.value) || 10;
    // find highest existing N-block in code
    let maxN = 0;
    const matches = v.matchAll(/\bN(\d+)/gi);
    for (const m of matches) { const nn = parseInt(m[1]); if (nn > maxN) maxN = nn; }
    const nextN = maxN > 0 ? maxN + step : step;
    const prefix = 'N' + nextN + ' ';
    const scrollTop = editor.scrollTop, scrollLeft = editor.scrollLeft;
    editor.value = v.substring(0, lineStart) + prefix + v.substring(lineStart);
    editor.selectionStart = editor.selectionEnd = lineStart + prefix.length;
    editor.scrollTop = scrollTop;
    editor.scrollLeft = scrollLeft;
    editor.focus({ preventScroll: true });
    onInput();
  }

  // ── Numpad ─────────────────────────────────────────────────
  function openNumpad(prefix) {
    inputPrefix = prefix;
    // Kurzor v editoru zachytíme HNED při otevření numpadu, ne až při
    // potvrzení – kliknutí na číslice/OK uvnitř modalu (na rozdíl od
    // quickbaru) nemá mousedown-preventDefault, takže editor při nich
    // ztrácí focus a prohlížeč mu mezitím může selectionStart resetovat
    // na 0. Vložení pak vždy použije tuhle uloženou pozici, ne aktuální
    // (potenciálně vynulovanou) editor.selectionStart.
    numTargetSel = activeTarget === editor
      ? { start: editor.selectionStart, end: editor.selectionEnd }
      : null;
    numTitle.textContent = prefix ? `Zadejte ${prefix}` : 'Zadejte číslo';
    numInput.value = '';
    buildHelpers(prefix);
    numModal.style.display = 'flex';
  }

  function buildHelpers(prefix) {
    const codes = prefix === 'G' ? G_CODES : prefix === 'M' ? M_CODES : null;
    if (!codes) { numHelpers.innerHTML = ''; return; }
    numHelpers.innerHTML = Object.entries(codes).map(([k, v]) =>
      `<div class="cne-helper" data-hv="${k}"><b>${prefix}${k}</b> ${esc(v)}</div>`
    ).join('');
  }

  function confirmNumpad() {
    const v = numInput.value.trim();
    if (v) {
      if (numTargetSel) { editor.selectionStart = numTargetSel.start; editor.selectionEnd = numTargetSel.end; }
      insertText(inputPrefix + v + ' ');
    }
    numModal.style.display = 'none';
  }

  // ── Validation ─────────────────────────────────────────────
  function runValidation() {
    parser.reset();
    parser.loadSubprograms(programs);
    if (!currentFile || !programs[currentFile]) return [];
    const { errors } = parser.parseProgram(programs[currentFile], currentFile, parserCfg);
    return errors;
  }

  function updateStatus() {
    const errs = runValidation();
    if (errs.length === 0) {
      statusBtn.textContent = '✓';
      statusBtn.className = 'cne-tb-btn cne-status cne-st-ok';
    } else {
      statusBtn.textContent = errs.length;
      statusBtn.className = 'cne-tb-btn cne-status cne-st-err';
    }
    renderParams();
  }

  function scheduleValidation() {
    clearTimeout(tValidate);
    tValidate = setTimeout(updateStatus, 800);
  }

  function showValidation() {
    const errs = runValidation();
    if (!errs.length) {
      valList.innerHTML = '<div class="cne-val-ok">✓ Program je v pořádku</div>';
    } else {
      valList.innerHTML = errs.map(e =>
        `<div class="cne-val-row" data-ln="${e.lineIndex}">
          <span class="cne-val-ic">⚠</span>
          <span class="cne-val-file">${esc(e.file)}</span>
          <span class="cne-val-line">L${e.lineIndex + 1}</span>
          <span class="cne-val-msg">${esc(e.msg)}</span>
        </div>`
      ).join('');
    }
    valModal.style.display = 'flex';
  }

  function jumpToLine(idx) {
    const lines = editor.value.split('\n');
    let pos = 0;
    for (let i = 0; i < idx && i < lines.length; i++) pos += lines[i].length + 1;
    editor.selectionStart = pos;
    editor.selectionEnd = pos + (lines[idx] || '').length;
    editor.focus();
    editor.scrollTop = Math.max(0, idx * 20 - editor.clientHeight / 2);
    syncScroll();
  }

  // ── R-Params display ───────────────────────────────────────
  function renderParams() {
    const p = parser.parameters;
    if (!p || !p.size) { paramListEl.innerHTML = '<div class="cne-fi-empty">Žádné parametry</div>'; return; }
    const sorted = [...p.entries()].sort((a, b) => parseInt(a[0].slice(1)) - parseInt(b[0].slice(1)));
    paramListEl.innerHTML = sorted.map(([k, v]) =>
      `<div class="cne-pr"><span class="cne-pr-name">${esc(k)}</span><span class="cne-pr-val">= ${v.value}</span><span class="cne-pr-src">${esc(v.source)}</span></div>`
    ).join('');
  }

  // ── Settings ───────────────────────────────────────────────
  function showSettings() {
    cfgList.innerHTML = Object.entries(parserCfg).map(([key, r]) =>
      `<div class="cne-cfg-row">
        <span>${esc(r.name)}</span>
        <button class="cne-cfg-tog ${r.active ? 'on' : ''}" data-sk="${key}">${r.active ? 'ZAP' : 'VYP'}</button>
      </div>`
    ).join('');
    cfgModal.style.display = 'flex';
  }

  // ── Header generator ──────────────────────────────────────
  function persistHdr() { storageSave(STORAGE_HDR, headerCfg); }

  function showHeaderSettings() {
    const h = headerCfg;
    const ctrlNames = { sinumerik: 'SINUMERIK', fanuc: 'FANUC', heidenhain: 'HEIDENHAIN' };
    const hdrTitleEl = $('hdrTitle');
    if (hdrTitleEl) hdrTitleEl.textContent = `Generovat hlavičku programu (${ctrlNames[getControlSystem()] || ctrlNames.sinumerik})`;
    const coordOpts = ['G54','G55','G56','G57','G505','G53'].map(v =>
      `<option value="${v}" ${h.coords.val === v ? 'selected' : ''}>${v}</option>`).join('');
    const feedOpts = ['G95','G94'].map(v =>
      `<option value="${v}" ${h.feed.mode === v ? 'selected' : ''}>${v} ${v === 'G95' ? '(mm/ot)' : '(mm/min)'}</option>`).join('');
    const spModeOpts = ['G97','G96'].map(v =>
      `<option value="${v}" ${h.spindle.mode === v ? 'selected' : ''}>${v} ${v === 'G97' ? '(konst. ot.)' : '(konst. řez.)'}</option>`).join('');
    const spDirOpts = ['4','3'].map(v =>
      `<option value="${v}" ${h.spindle.m === v ? 'selected' : ''}>M${v} ${v === '4' ? '(CCW)' : '(CW)'}</option>`).join('');

    hdrList.innerHTML = `
      <div class="cne-hdr-row">
        <label><input type="checkbox" data-hdr="gear" ${h.gear.active ? 'checked' : ''}> Převod</label>
        <span>M<input type="number" class="cne-hdr-inp" data-hdr-v="gear.val" value="${h.gear.val}" min="40" max="45" inputmode="numeric" style="width:40px"></span>
      </div>
      <div class="cne-hdr-row">
        <label><input type="checkbox" data-hdr="door" ${h.door.active ? 'checked' : ''}> Odjezd do výměny</label>
        <span>M<input type="number" class="cne-hdr-inp" data-hdr-v="door.val" value="${h.door.val}" min="0" max="99" inputmode="numeric" style="width:40px"></span>
      </div>
      <div class="cne-hdr-row">
        <label><input type="checkbox" data-hdr="tool" ${h.tool.active ? 'checked' : ''}> Nástroj</label>
        <span>T<input type="number" class="cne-hdr-inp" data-hdr-v="tool.t" value="${h.tool.t}" min="1" max="99" inputmode="numeric" style="width:36px">
        D<input type="number" class="cne-hdr-inp" data-hdr-v="tool.d" value="${h.tool.d}" min="1" max="9" inputmode="numeric" style="width:36px"></span>
      </div>
      <div class="cne-hdr-row">
        <label><input type="checkbox" data-hdr="coords" ${h.coords.active ? 'checked' : ''}> Souřadnice</label>
        <select class="cne-hdr-inp" data-hdr-v="coords.val">${coordOpts}</select>
      </div>
      <div class="cne-hdr-row">
        <label><input type="checkbox" data-hdr="feed" ${h.feed.active ? 'checked' : ''}> Posuv</label>
        <select class="cne-hdr-inp" data-hdr-v="feed.mode">${feedOpts}</select>
      </div>
      <div class="cne-hdr-row">
        <label><input type="checkbox" data-hdr="spindle" ${h.spindle.active ? 'checked' : ''}> Vřeteno</label>
        <div class="cne-hdr-sp-wrap">
          <select class="cne-hdr-inp" data-hdr-v="spindle.mode">${spModeOpts}</select>
          <span>S<input type="number" class="cne-hdr-inp" data-hdr-v="spindle.s" value="${h.spindle.s}" min="1" max="9999" inputmode="numeric" style="width:52px"></span>
          <select class="cne-hdr-inp" data-hdr-v="spindle.m">${spDirOpts}</select>
          <span>LIMS<input type="number" class="cne-hdr-inp" data-hdr-v="spindle.lims" value="${h.spindle.lims}" min="1" max="9999" inputmode="numeric" style="width:52px"></span>
        </div>
      </div>`;
    hdrModal.style.display = 'flex';
  }

  function readHeaderInputs() {
    hdrModal.querySelectorAll('[data-hdr]').forEach(el => {
      const key = el.dataset.hdr;
      if (headerCfg[key]) headerCfg[key].active = el.checked;
    });
    hdrModal.querySelectorAll('[data-hdr-v]').forEach(el => {
      const path = el.dataset.hdrV.split('.');
      if (path.length === 2 && headerCfg[path[0]]) {
        headerCfg[path[0]][path[1]] = el.value;
      }
    });
  }

  function applyHeader() {
    readHeaderInputs();
    persistHdr();
    const h = headerCfg;
    const ctrl = getControlSystem();
    const lines = [];
    let n = 10;
    const N = () => { const s = `N${n} `; n += 10; return s; };

    let coordLine;
    if (ctrl === 'fanuc') {
      // Fanuc: bez STOPRE (Siemens-specifický "stop předzpracování"),
      // volání nástroje T0101 (nástroj+korekce po 2 číslicích),
      // omezení otáček G50 Smax místo LIMS=.
      if (h.gear.active)  lines.push(`${N()}M${h.gear.val}`);
      if (h.door.active)  lines.push(`${N()}M${h.door.val}`);
      if (h.tool.active)  lines.push(`${N()}T${String(h.tool.t).padStart(2, '0')}${String(h.tool.d).padStart(2, '0')}`);
      coordLine = N();
      if (h.coords.active) coordLine += `${h.coords.val} `;
      if (h.feed.active)   coordLine += `${h.feed.mode} `;
      coordLine += 'G90';
      lines.push(coordLine.trim());
      if (h.spindle.active) {
        if (h.spindle.mode === 'G96' && h.spindle.lims) lines.push(`${N()}G50 S${h.spindle.lims}`);
        lines.push(`${N()}${h.spindle.mode} S${h.spindle.s} M${h.spindle.m}`);
      }
    } else if (ctrl === 'heidenhain') {
      // Heidenhain (ISO dialekt): bez STOPRE, nástroj T.. M6, bez LIMS.
      if (h.gear.active)  lines.push(`${N()}M${h.gear.val}`);
      if (h.door.active)  lines.push(`${N()}M${h.door.val}`);
      if (h.tool.active)  lines.push(`${N()}T${h.tool.t} M6`);
      coordLine = N();
      if (h.coords.active) coordLine += `${h.coords.val} `;
      if (h.feed.active)   coordLine += `${h.feed.mode} `;
      coordLine += 'G90';
      lines.push(coordLine.trim());
      if (h.spindle.active) lines.push(`${N()}${h.spindle.mode} S${h.spindle.s} M${h.spindle.m}`);
    } else {
      // Sinumerik 840D (výchozí): STOPRE před výměnou nástroje i na konci,
      // nástroj T.. / D.. na dvou řádcích, LIMS=.. u G96.
      if (h.gear.active)  lines.push(`${N()}M${h.gear.val}`);
      lines.push(`${N()}STOPRE`);
      if (h.door.active)  lines.push(`${N()}M${h.door.val}`);
      if (h.tool.active)  { lines.push(`${N()}T${h.tool.t}`); lines.push(`      D${h.tool.d}`); }
      coordLine = N();
      if (h.coords.active) coordLine += `${h.coords.val} `;
      if (h.feed.active)   coordLine += `${h.feed.mode} `;
      coordLine += 'G90';
      lines.push(coordLine.trim());
      if (h.spindle.active) {
        let sp = `${N()}${h.spindle.mode}`;
        if (h.spindle.mode === 'G96' && h.spindle.lims) sp += ` LIMS=${h.spindle.lims}`;
        sp += ` S${h.spindle.s} M${h.spindle.m}`;
        lines.push(sp);
      }
      lines.push(`${N()}STOPRE`);
    }

    const existing = editor.value.split('\n');
    let result;
    if (existing.length > 0 && existing[0].trim().toUpperCase().startsWith('MSG')) {
      result = existing[0] + '\n' + lines.join('\n') + '\n' + existing.slice(1).join('\n');
    } else {
      result = lines.join('\n') + '\n' + editor.value;
    }
    editor.value = result;
    onInput();
    hdrModal.style.display = 'none';
  }

  // ── Import / Export ────────────────────────────────────────
  function handleImport(ev) {
    const f = ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      const sections = text.split(/^={5,}$/m);
      let count = 0, cName = '', cCode = '';
      for (const sec of sections) {
        const t = sec.trim();
        if (!t) continue;
        const hm = t.match(/(?:HLAVNÍ PROGRAM|PODPROGRAM)[^:]*:\s*(\S+)/i);
        if (hm) {
          if (cName && cCode) { programs[cName] = cCode.trim(); count++; }
          cName = hm[1].trim(); cCode = '';
        } else { cCode += t + '\n'; }
      }
      if (cName && cCode) { programs[cName] = cCode.trim(); count++; }
      if (!count && text.trim()) {
        const nm = f.name || 'IMPORT.MPF';
        programs[nm] = text; count = 1; cName = nm;
      }
      if (count) { displayFile(cName || Object.keys(programs)[0]); persist(); }
      fileInput.value = '';
    };
    reader.readAsText(f);
  }

  function handleExport() {
    const keys = Object.keys(programs);
    if (!keys.length) return;
    let out = '';
    keys.forEach((name, i) => {
      out += '==================================================\n';
      out += `${i === 0 ? 'HLAVNÍ PROGRAM' : 'PODPROGRAM'}: ${name}\n`;
      out += '==================================================\n';
      out += programs[name] + '\n\n';
    });
    const blob = new Blob([out], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'cnc_balicek.txt'; a.click();
    URL.revokeObjectURL(url);
  }

  function downloadFile() {
    if (!currentFile || !programs[currentFile]) return;
    const blob = new Blob([programs[currentFile]], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = currentFile; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Clipboard ──────────────────────────────────────────────
  function closeMenu() {
    const mm = $('menuModal');
    if (mm) mm.style.display = 'none';
  }

  function copyToClipboard() {
    if (!editor.value) return;
    navigator.clipboard.writeText(editor.value).catch(() => {});
  }

  // ── Hledání v kódu ─────────────────────────────────────────
  let searchMatches = [];
  let searchIdx = -1;
  function openSearch() {
    searchBar.classList.add('open');
    searchInput.focus();
    searchInput.select();
  }
  function closeSearch() {
    searchBar.classList.remove('open');
    editor.focus();
  }
  function doSearch(dir) {
    const q = searchInput.value;
    if (!q) { searchCountEl.textContent = ''; searchMatches = []; searchIdx = -1; return; }
    searchMatches = [];
    let i = -1;
    const lower = editor.value.toLowerCase();
    const ql = q.toLowerCase();
    while ((i = lower.indexOf(ql, i + 1)) !== -1) searchMatches.push(i);
    if (!searchMatches.length) { searchCountEl.textContent = '0 / 0'; searchIdx = -1; return; }
    searchIdx = (searchIdx + dir + searchMatches.length) % searchMatches.length;
    searchCountEl.textContent = (searchIdx + 1) + ' / ' + searchMatches.length;
    // Zvýraznění nálezu bez odebrání fokusu z vyhledávacího pole
    // (setSelectionRange funguje i bez focus() — jinak by focus() na
    // editoru "ukradl" fokus z inputu při psaní dalšího znaku).
    const pos = searchMatches[searchIdx];
    editor.setSelectionRange(pos, pos + q.length);
    const lineIdx = editor.value.slice(0, pos).split('\n').length - 1;
    editor.scrollTop = Math.max(0, lineIdx * 20 - editor.clientHeight / 2);
    syncScroll();
  }
  searchInput.addEventListener('input', () => { searchIdx = -1; doSearch(1); });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(e.shiftKey ? -1 : 1); }
    if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
  });
  editor.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); openSearch(); }
  });

  // ── Conversion helpers ────────────────────────────────────
  // CSP-safe vyhodnocení číselného výrazu (+ - * / a závorky) bez eval/Function.
  // CSP stránky (index.html) nepovoluje 'unsafe-eval', takže new Function()
  // by vyhodilo výjimku a přepočet souřadnic by tiše selhal (vrátil NaN).
  function safeEvalArith(expr) {
    const tokens = expr.match(/\d+\.?\d*|\.\d+|[+\-*/()]/g);
    if (!tokens) return NaN;
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    function parseExpr() {                 // sčítání / odčítání
      let v = parseTerm();
      while (peek() === '+' || peek() === '-') {
        const op = next(); const r = parseTerm();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    function parseTerm() {                 // násobení / dělení
      let v = parseFactor();
      while (peek() === '*' || peek() === '/') {
        const op = next(); const r = parseFactor();
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function parseFactor() {               // unární ±, závorky, číslo
      const t = peek();
      if (t === '+') { next(); return parseFactor(); }
      if (t === '-') { next(); return -parseFactor(); }
      if (t === '(') { next(); const v = parseExpr(); if (peek() === ')') next(); return v; }
      next(); return parseFloat(t);
    }
    const result = parseExpr();
    return pos === tokens.length ? result : NaN;   // nespotřebované tokeny = chyba
  }

  function evalParam(expr, params) {
    try {
      let expanded = expr.replace(/R(\d+)/gi, (_, id) => {
        const key = `R${parseInt(id, 10)}`;
        return params.has(key) ? params.get(key) : 0;
      });
      if (!/^[0-9.+\-*/() ]+$/.test(expanded)) return NaN;
      return safeEvalArith(expanded);
    } catch { return NaN; }
  }

  function getParamContext() {
    const pm = new Map();
    parser.parameters.forEach((val, key) => {
      pm.set(key, typeof val === 'object' ? val.value : Number(val));
    });
    return pm;
  }

  function updateModeBtn() {
    const b = $('convModeBtn');
    if (b) {
      b.textContent = coordMode === 'abs' ? 'G90' : 'G91';
      b.classList.toggle('cne-conv-active', coordMode === 'inc');
      b.title = coordMode === 'abs'
        ? 'Režim G90 (absolutní) – klikni pro přepočet na G91 (přírůstkové)'
        : 'Režim G91 (přírůstkové) – klikni pro návrat na G90 (absolutní)';
    }
    const mi = $('convModeMenuIcon');
    if (mi) mi.textContent = coordMode === 'abs' ? 'G90' : 'G91';
  }

  // Přepočet přírůstkového kódu (G91) zpět na absolutní (G90).
  // Podle markerů G90/G91 v textu se sleduje režim, dopočítá absolutní
  // poloha a souřadnice se přepíší absolutně; každý G91 se nahradí G90.
  function codeToAbsolute(code) {
    const lines = code.split('\n');
    const newLines = [];
    let x = 0, z = 0, mode = 90;
    const params = getParamContext();
    for (const line of lines) {
      const ci = line.indexOf(';');
      let clean = (ci !== -1 ? line.substring(0, ci) : line).trim().toUpperCase();
      if (!clean) { newLines.push(line); continue; }
      const am = clean.match(/R(\d+)\s*=\s*([^=;]+?)(?=\s+[A-Z]|$)/g);
      if (am) am.forEach(a => { const p = a.split('='); const n = parseInt(p[0].replace('R','')); const v = evalParam(p[1], params); if (!isNaN(v)) params.set(`R${n}`, v); });
      if (clean.includes('G90')) mode = 90;
      if (clean.includes('G91')) mode = 91;
      // Referenční / pevné body (G74/G75) nesou jen zástupné X0/Z0 – nejsou to
      // souřadnice interpolace, takže je nepřepočítáváme ani jimi neposouváme polohu.
      if (/\bG7[45]\b/.test(clean)) { newLines.push(line); continue; }
      let mod = line;
      if (/[XZ]/.test(clean)) {
        mod = mod.replace(/([XZ])\s*(=?)\s*([^\s;]+)/gi, (m, ax, eq, vs) => {
          ax = ax.toUpperCase();
          let v = evalParam(vs, params); if (isNaN(v)) return m;
          let abs = mode === 91 ? ((ax === 'X' ? x : z) + v) : v;
          if (ax === 'X') x = abs; else z = abs;
          return `${ax}${Number(abs.toFixed(3))}`;
        });
      }
      if (mode === 91) mod = mod.replace(/\bG91\b/gi, 'G90');
      newLines.push(mod);
    }
    return newLines.join('\n');
  }

  // Přepočet absolutního kódu (G90) na přírůstkový (G91).
  // Nájezd (první pohyb v dané ose) zůstává absolutní v G90, navazující
  // pohyby jsou přírůstkové v G91 – stejně jako CNC export v CAD.
  function codeToIncremental(code) {
    const lines = code.split('\n');
    const newLines = [];
    let x = 0, z = 0, curMode = 90, initX = false, initZ = false;
    const params = getParamContext();
    for (const line of lines) {
      const ci = line.indexOf(';');
      let clean = (ci !== -1 ? line.substring(0, ci) : line).trim().toUpperCase();
      if (!clean) { newLines.push(line); continue; }
      const am = clean.match(/R(\d+)\s*=\s*([^=;]+?)(?=\s+[A-Z]|$)/g);
      if (am) am.forEach(a => { const p = a.split('='); const n = parseInt(p[0].replace('R','')); const v = evalParam(p[1], params); if (!isNaN(v)) params.set(`R${n}`, v); });
      if (clean.includes('G90')) curMode = 90;
      if (clean.includes('G91')) curMode = 91;
      // Referenční / pevné body (G74/G75) nesou jen zástupné X0/Z0 – nejsou to
      // souřadnice interpolace, takže je nepřepočítáváme ani jimi neposouváme polohu.
      if (/\bG7[45]\b/.test(clean)) { newLines.push(line); continue; }
      const hasX = /X/i.test(clean), hasZ = /Z/i.test(clean);
      if (!hasX && !hasZ) { newLines.push(line); continue; }
      let tgt = 91;
      if ((hasX && !initX) || (hasZ && !initZ)) tgt = 90;
      let mod = line;
      mod = mod.replace(/([XZ])\s*(=?)\s*([^\s;]+)/gi, (m, ax, eq, vs) => {
        ax = ax.toUpperCase();
        let v = evalParam(vs, params); if (isNaN(v)) return m;
        let abs = curMode === 91 ? ((ax === 'X' ? x : z) + v) : v;
        let out = tgt === 91 ? (abs - (ax === 'X' ? x : z)) : abs;
        if (ax === 'X') { x = abs; if (tgt === 90) initX = true; }
        else { z = abs; if (tgt === 90) initZ = true; }
        return `${ax}${Number(out.toFixed(3))}`;
      });
      mod = mod.replace(/\bG9[01]\b/gi, '').replace(/\s+/g, ' ');
      const newG = tgt === 90 ? 'G90' : 'G91';
      if (/^\s*N\d+/i.test(mod)) mod = mod.replace(/^(N\d+)\s*/i, `$1 ${newG} `);
      else mod = `${newG} ` + mod.trim();
      newLines.push(mod);
    }
    return newLines.join('\n');
  }

  // Jedno tlačítko G90/G91 – přepne režim a přepočítá souřadnice v editoru.
  function toggleCoordMode() {
    editor.value = coordMode === 'abs'
      ? codeToIncremental(editor.value)
      : codeToAbsolute(editor.value);
    coordMode = coordMode === 'abs' ? 'inc' : 'abs';
    onInput();
    updateModeBtn();
  }

  // ── Renumbering ───────────────────────────────────────────
  function performRenumbering(start, step) {
    codeBeforeRenum = editor.value;
    editor.value = renumberLines(editor.value.split('\n'), start, step).join('\n');
    onInput();
  }

  // ── Editor input handler ───────────────────────────────────
  function onInput() {
    programs[currentFile] = editor.value;
    if (rafHL) cancelAnimationFrame(rafHL);
    rafHL = requestAnimationFrame(refreshVisual);
    scheduleValidation();
    clearTimeout(tSave);
    tSave = setTimeout(persist, 2000);
  }

  // ══════════════════════════════════════════════════════════
  // ██  EVENT WIRING  ████████████████████████████████████████
  // ══════════════════════════════════════════════════════════
  editor.addEventListener('input', onInput);
  editor.addEventListener('scroll', syncScroll);
  // Na mobilu je editor zpočátku readOnly (aby se klávesnice neotvírala
  // automaticky při scrollování/výběru). Klepnutím do textu se ale má
  // editace povolit a klávesnice rovnou otevřít.
  editor.addEventListener('pointerdown', () => { editor.readOnly = false; });

  // Klávesy spodní lišty nesmí „ukrást" fokus z textarey – jinak po každém
  // stisku (mazání znaku, vložení) zmizí kurzor a uživatel musí znovu klikat
  // do textu. preventDefault na mousedown ponechá fokus i caret v editoru;
  // samotný klik (a tím i akce) proběhne dál.
  const quickbar = root.querySelector('.cne-quickbar');
  if (quickbar) {
    quickbar.addEventListener('mousedown', e => {
      if (e.target.closest('button')) e.preventDefault();
    });
  }

  // Delegated clicks
  root.addEventListener('click', e => {
    // Actions
    const ab = e.target.closest('[data-act]');
    if (ab) {
      switch (ab.dataset.act) {
        case 'sidebar':   sidebarEl.classList.toggle('open'); ab.classList.toggle('open'); break;
        case 'toggleSection': ab.closest('.cne-sb-section').classList.toggle('collapsed'); break;
        case 'mergeLoad': mergeFileInput.click(); break;
        case 'mergeJoin': joinMergeQueue(); break;
        case 'new':       createNew(); closeMenu(); break;
        case 'download':  downloadFile(); closeMenu(); break;
        case 'import':    fileInput.click(); closeMenu(); break;
        case 'export':    handleExport(); closeMenu(); break;
        case 'validate':  showValidation(); break;
        case 'calc':      closeMenu(); import('../ui.js').then(m => m.openCalculator()); break;
        case 'settings':  showSettings(); closeMenu(); break;
        case 'copy':      copyToClipboard(); closeMenu(); break;
        case 'search':    closeMenu(); openSearch(); break;
        case 'searchPrev': doSearch(-1); break;
        case 'searchNext': doSearch(1); break;
        case 'searchClose': closeSearch(); break;
        case 'renum':     closeMenu(); $('renumModal').style.display = 'flex'; break;
        case 'renumCancel': $('renumModal').style.display = 'none'; break;
        case 'renumOk': {
          const s = parseInt($('renumStart').value) || 10;
          const st = parseInt($('renumStep').value) || 10;
          performRenumbering(s, st);
          $('renumModal').style.display = 'none';
          const ub = $('undoRenumBtn');
          if (ub) ub.style.display = '';
          break;
        }
        case 'undoRenum':
          if (codeBeforeRenum) { editor.value = codeBeforeRenum; codeBeforeRenum = ''; onInput(); }
          $('renumModal').style.display = 'none';
          break;
        case 'convMode':  toggleCoordMode(); closeMenu(); break;
        case 'header':    showHeaderSettings(); closeMenu(); break;
        case 'hdrClose':  readHeaderInputs(); persistHdr(); hdrModal.style.display = 'none'; break;
        case 'hdrApply':  applyHeader(); break;
        case 'cornersToPath': {
          const result = convertCornersToPaths(editor.value);
          if (result.converted > 0) {
            editor.value = result.code;
            onInput();
          }
          if (result.converted && result.skipped) showToast(`Převedeno ${result.converted}, přeskočeno ${result.skipped} (neplatné okolí)`);
          else if (result.converted) showToast(`Převedeno ${result.converted} sražení/zaoblení na G-kód dráhu ✓`);
          else if (result.skipped) showToast(`Nepodařilo se převést (${result.skipped}) – zkontrolujte okolní G1 úsečky`);
          else showToast('Žádné sražení/zaoblení k převedení nenalezeno');
          closeMenu();
          break;
        }
        case 'backspace': doBackspace(); break;
        case 'addBlock':  insertBlockNumber(); break;
        case 'keyboard':  editor.readOnly = false; editor.focus(); break;
        case 'menu':      $('menuModal').style.display = 'flex'; break;
        case 'menuClose': $('menuModal').style.display = 'none'; break;
        case 'toCad': {
          // Přenes upravený kód zpět do CAD panelu (odkud kód pochází) a
          // vykresli konturu na canvas. CAD panel čte souřadnice absolutně,
          // takže přírůstkový režim (G91) před odesláním přepočítáme na G90.
          if (coordMode === 'inc') { editor.value = codeToAbsolute(editor.value); coordMode = 'abs'; onInput(); }
          // Nepřevedené sražení/zaoblení (CHF=/RND=…) by CAD parser G-kódu
          // nerozpoznal – automaticky ho převedeme na skutečnou dráhu (G1/G2/G3).
          const conv = convertCornersToPaths(editor.value);
          if (conv.converted > 0) { editor.value = conv.code; onInput(); }
          persist();
          const code = editor.value;
          overlay.remove();
          if (typeof bridge.renderCncCodeToCanvas === 'function') bridge.renderCncCodeToCanvas(code);
          break;
        }
        case 'chamfer':   openNumpad(getChamferPrefix()); break;
        case 'round':     openNumpad(getRoundPrefix()); break;
        case 'numCancel': numModal.style.display = 'none'; break;
        case 'numOk':     confirmNumpad(); break;
        case 'valClose':  valModal.style.display = 'none'; break;
        case 'cfgClose':  cfgModal.style.display = 'none'; persistCfg(); break;
      }
      return;
    }
    // Insert
    const ib = e.target.closest('[data-ins]');
    if (ib) { insertText(ib.dataset.ins); return; }
    // Input modal
    const ip = e.target.closest('[data-inp]');
    if (ip) { openNumpad(ip.dataset.inp); return; }
    // Numpad keys
    const np = e.target.closest('[data-n]');
    if (np) {
      const k = np.dataset.n;
      if (k === '±') { const v = numInput.value; numInput.value = v.startsWith('-') ? v.slice(1) : '-' + v; }
      else numInput.value += k;
      return;
    }
    // Helper items
    const hi = e.target.closest('[data-hv]');
    if (hi) { numInput.value = hi.dataset.hv; return; }
    // File list
    const dl = e.target.closest('[data-del]');
    if (dl) { deleteFile(dl.dataset.del); return; }
    const fi = e.target.closest('[data-file]');
    if (fi) { displayFile(fi.dataset.file); return; }
    // Merge queue (spojení programů)
    const mq = e.target.closest('[data-mq-act]');
    if (mq) {
      const i = parseInt(mq.dataset.mqI, 10);
      const act = mq.dataset.mqAct;
      if (act === 'del') mergeQueue.splice(i, 1);
      else if (act === 'up' && i > 0) [mergeQueue[i - 1], mergeQueue[i]] = [mergeQueue[i], mergeQueue[i - 1]];
      else if (act === 'down' && i < mergeQueue.length - 1) [mergeQueue[i + 1], mergeQueue[i]] = [mergeQueue[i], mergeQueue[i + 1]];
      renderMergeList();
      persistMerge();
      return;
    }
    // Validation row → jump
    const vr = e.target.closest('[data-ln]');
    if (vr) { valModal.style.display = 'none'; jumpToLine(parseInt(vr.dataset.ln)); return; }
    // Settings toggle
    const st = e.target.closest('[data-sk]');
    if (st) {
      const k = st.dataset.sk;
      parserCfg[k].active = !parserCfg[k].active;
      st.textContent = parserCfg[k].active ? 'ZAP' : 'VYP';
      st.classList.toggle('on', parserCfg[k].active);
      return;
    }
  });

  filenameLbl.addEventListener('click', renameFile);
  numInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmNumpad(); });
  fileInput.addEventListener('change', handleImport);
  mergeFileInput.addEventListener('change', handleMergeLoad);

  // Close menu modal on click outside card
  $('menuModal').addEventListener('click', e => {
    if (e.target === $('menuModal')) $('menuModal').style.display = 'none';
  });
  // Close numpad modal on click outside card
  numModal.addEventListener('click', e => {
    if (e.target === numModal) numModal.style.display = 'none';
  });

  // ── Cleanup ────────────────────────────────────────────────
  new MutationObserver((_, obs) => {
    if (!document.body.contains(overlay)) {
      clearTimeout(tValidate);
      clearTimeout(tSave);
      if (rafHL) cancelAnimationFrame(rafHL);
      persist();
      obs.disconnect();
    }
  }).observe(document.body, { childList: true });

  // ── Init ───────────────────────────────────────────────────
  // On mobile, prevent keyboard from auto-showing on tap
  if (window.matchMedia('(max-width: 600px)').matches) {
    editor.readOnly = true;
  }
  ensureFile();

  // Pokud byl předán initialCode, vloží se do souboru CNC_PROGRAM.MPF.
  // Pokud na něm uživatel právě je a obsah se liší od initialCode (kontura
  // byla mezitím v CAD přegenerována), automaticky se načte aktuální kód
  // z CAD (bez dotazu – editor je jen dočasná pracovní kopie CAD kódu).
  // Je-li uživatel rozkoukaný v jiném souboru (např. po "Nový program"), editor
  // ho při návratu nepřepne pryč ani mu ten soubor nepřepíše.
  const onProgramFile = !programs['CNC_PROGRAM.MPF'] || currentFile === 'CNC_PROGRAM.MPF';
  if (onProgramFile && initialCode && typeof initialCode === 'string' && initialCode.trim()) {
    const name = 'CNC_PROGRAM.MPF';
    if (!programs[name] || programs[name].trim() !== initialCode.trim()) {
      programs[name] = initialCode;
      currentFile = name;
    }
  }

  displayFile(currentFile);
  renderMergeList();
}
