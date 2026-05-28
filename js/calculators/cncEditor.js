// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CNC Editor (Sinumerik 840D)                       ║
// ║  Integrovaný editor CNC kódu se zvýrazňováním syntaxe       ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeOverlay } from '../dialogFactory.js';
import { openCamSimulator } from './camSimulator.js';

// ── Konstanty ──────────────────────────────────────────────────
const STORAGE_DATA = 'skica-cnc-editor-data';
const STORAGE_CFG  = 'skica-cnc-editor-settings';
const STORAGE_HDR  = 'skica-cnc-editor-header';

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
const RE_FEED   = /\b([FSTD])(\d*\.?\d+)\b/g;
const RE_BLOCK  = /\b(N\d+)\b/g;
const RE_G_RAP  = /\b(G0[0-3]?|G[0-3])\b/g;
const RE_G_GEN  = /\b(G\d+)\b/g;
const RE_M_GEN  = /\b(M\d+)\b/g;
const RE_COORD  = /([XZIKCR])(\s*=?\s*[-\d.]+)/g;
const RE_PARAM  = /\b(R\d+)/g;
const RE_LOGIC  = /\b(GOTOF|GOTOB|IF|ELSE|ENDIF|STOPRE)\b/g;
const RE_SUB    = /\b(L\d+)\b/g;
const RE_MSG    = /(MSG\s*\()(.*?)(\))/gi;
const RE_MSG_PH = /__MSG_(\d+)__/g;

// ── Helpers ────────────────────────────────────────────────────
function esc(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function storageSave(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
}
function storageLoad(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
}

function defaultParserConfig() {
  return {
    movement:  { name: 'Pohyb (G0-G3)',        active: true },
    coords:    { name: 'Souřadnice (G90/G91)', active: true },
    feed:      { name: 'Posuv (G94/G95)',      active: true },
    spindle:   { name: 'Otáčky (G96/G97)',     active: true },
    startstop: { name: 'Vřeteno při G95',      active: true },
    end:       { name: 'Konec programu',       active: true },
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
      activeFeedMode: this.activeFeedMode
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

      if (/\bG90\b/.test(clean) || /\bG91\b/.test(clean)) this.coordModeDefined = true;
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

// ── Build HTML ─────────────────────────────────────────────────
function buildEditorHTML() {
  return `
<div class="cne-layout">
  <div class="cne-sn-bar">SINUMERIK 840D sl &mdash; Program Editor</div>
  <div class="cne-toolbar">
    <div class="cne-toolbar-left">
      <button class="cne-tb-btn" data-act="sidebar" title="Soubory">☰</button>
      <span class="cne-filename" data-el="filename">—</span>
    </div>
    <div class="cne-toolbar-right">
      <button class="cne-tb-btn cne-tb-new cne-hide-m" data-act="new" title="Nový program">＋</button>
      <button class="cne-tb-btn cne-hide-m" data-act="copy" title="Kopírovat do schránky">📋</button>
      <button class="cne-tb-btn cne-hide-m" data-act="download" title="Stáhnout soubor">⬇</button>
      <button class="cne-tb-btn cne-hide-m" data-act="import" title="Import balíčku">📂</button>
      <button class="cne-tb-btn cne-hide-m" data-act="export" title="Export balíčku">📦</button>
      <button class="cne-tb-btn cne-hide-m" data-act="renum" title="Přečíslovat N-bloky">🔢</button>
      <button class="cne-tb-btn cne-conv cne-hide-m" data-act="convAbs" data-el="convAbsBtn" title="Převést na absolutní (G90)">ABS</button>
      <button class="cne-tb-btn cne-conv cne-hide-m" data-act="convInc" data-el="convIncBtn" title="Převést na přírůstkové (G91)">INC</button>
      <button class="cne-tb-btn cne-hide-m" data-act="header" title="Generovat hlavičku">📝</button>
      <button class="cne-tb-btn cne-hide-m" data-act="cam" title="Otevřít v CAM Simulátoru">🔄</button>
      <button class="cne-tb-btn cne-status" data-act="validate" data-el="statusBtn" title="Validace">●</button>
      <button class="cne-tb-btn" data-act="calc" title="Kalkulačka">🔢</button>
      <button class="cne-tb-btn cne-hide-m" data-act="settings" title="Nastavení parseru">⚙</button>
      <button class="cne-tb-btn cne-menu-btn" data-act="menu" title="Menu">⋮</button>
      <button class="cne-tb-btn cne-close-btn" data-act="close" title="Zavřít editor">✕</button>
    </div>
  </div>

  <div class="cne-main">
    <div class="cne-sidebar" data-el="sidebar">
      <div class="cne-sb-section">
        <div class="cne-sb-title">Soubory</div>
        <div class="cne-file-list" data-el="fileList"></div>
      </div>
      <div class="cne-sb-section">
        <div class="cne-sb-title">R-Parametry</div>
        <div class="cne-param-list" data-el="paramList"></div>
      </div>
    </div>

    <div class="cne-editor-wrap">
      <div class="cne-line-nums" data-el="lineNums"></div>
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
    <button class="cne-qb accent" data-ins="M30" title="M30 – Konec programu">M30</button>
    <button class="cne-qb accent" data-ins="M17" title="M17 – Konec podprogramu">M17</button>

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
        <button class="cne-menu-item" data-act="copy"><span class="cne-mi-icon">📋</span><span class="cne-mi-text"><b>Kopírovat</b><small>Zkopírovat kód do schránky</small></span></button>
        <button class="cne-menu-item" data-act="download"><span class="cne-mi-icon">⬇</span><span class="cne-mi-text"><b>Stáhnout</b><small>Stáhnout aktuální soubor</small></span></button>
        <button class="cne-menu-item" data-act="import"><span class="cne-mi-icon">📂</span><span class="cne-mi-text"><b>Import balíčku</b><small>Načíst soubory z balíčku</small></span></button>
        <button class="cne-menu-item" data-act="export"><span class="cne-mi-icon">📦</span><span class="cne-mi-text"><b>Export balíčku</b><small>Exportovat všechny soubory</small></span></button>
        <div class="cne-menu-sep"></div>
        <button class="cne-menu-item" data-act="renum"><span class="cne-mi-icon">🔢</span><span class="cne-mi-text"><b>Přečíslovat N-bloky</b><small>Přečíslování bloků N10, N20…</small></span></button>
        <button class="cne-menu-item" data-act="convAbs"><span class="cne-mi-icon sn">ABS</span><span class="cne-mi-text"><b>Převést na absolutní</b><small>G91 → G90 souřadnice</small></span></button>
        <button class="cne-menu-item" data-act="convInc"><span class="cne-mi-icon sn">INC</span><span class="cne-mi-text"><b>Převést na přírůstkové</b><small>G90 → G91 souřadnice</small></span></button>
        <div class="cne-menu-sep"></div>
        <button class="cne-menu-item" data-act="header"><span class="cne-mi-icon">📝</span><span class="cne-mi-text"><b>Generovat hlavičku</b><small>Vložit hlavičku programu (M4x, T, G54…)</small></span></button>
        <div class="cne-menu-sep"></div>
        <button class="cne-menu-item" data-act="cam"><span class="cne-mi-icon">🔄</span><span class="cne-mi-text"><b>CAM Simulátor</b><small>Načíst konturu do CAM simulátoru</small></span></button>
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
        <label style="flex:1;color:var(--ctp-subtext0);font-size:.85rem">Start:<input data-el="renumStart" type="number" value="10" min="1" class="cne-im-input" style="width:100%;margin-top:4px"></label>
        <label style="flex:1;color:var(--ctp-subtext0);font-size:.85rem">Krok:<input data-el="renumStep" type="number" value="10" min="1" class="cne-im-input" style="width:100%;margin-top:4px"></label>
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
      <div class="cne-im-title">Generovat hlavičku programu<button class="cne-im-close" data-act="hdrClose" title="Zavřít">✕</button></div>
      <div class="cne-hdr-list" data-el="hdrList"></div>
      <div class="cne-im-actions" style="margin-top:10px">
        <button class="cne-im-btn cancel" data-act="hdrClose">Zavřít</button>
        <button class="cne-im-btn ok" data-act="hdrApply">Vložit hlavičku</button>
      </div>
    </div>
  </div>

  <input type="file" data-el="fileInput" style="display:none" accept=".txt,.mpf,.spf">
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
  const parser   = new CNCParser();
  let activeConversion = null;
  let originalCode = '';
  let codeBeforeRenum = '';

  // Load persisted
  const sd = storageLoad(STORAGE_DATA);
  if (sd && sd.programs && Object.keys(sd.programs).length) {
    programs = sd.programs;
    currentFile = sd.currentFile || Object.keys(programs)[0];
  }
  const sc = storageLoad(STORAGE_CFG);
  if (sc) parserCfg = { ...defaultParserConfig(), ...sc };
  const sh = storageLoad(STORAGE_HDR);
  if (sh) headerCfg = { ...defaultHeaderConfig(), ...sh };

  // ── Create overlay ─────────────────────────────────────────
  const overlay = makeOverlay('cnc-editor', '💻 CNC Editor', buildEditorHTML(), 'cnc-editor-window');
  if (!overlay) return;

  // ── DOM refs ───────────────────────────────────────────────
  const $ = s => overlay.querySelector(`[data-el="${s}"]`);
  const root        = overlay.querySelector('.cne-layout');
  const editor      = $('editor');
  const backdrop    = $('backdrop');
  const highlights  = $('highlights');
  const lineNums    = $('lineNums');
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

  // ── Persistence ────────────────────────────────────────────
  function persist() { storageSave(STORAGE_DATA, { programs, currentFile }); }
  function persistCfg() { storageSave(STORAGE_CFG, parserCfg); }

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

  // ── Syntax highlighting ────────────────────────────────────
  function applyHighlight() {
    const code = editor.value;
    const out = code.split('\n').map(line => {
      const ci = line.indexOf(';');
      if (ci === 0) return `<span class="hl-comment">${esc(line)}</span>`;

      let work = ci > 0 ? line.substring(0, ci) : line;
      let comment = ci > 0 ? `<span class="hl-comment">${esc(line.substring(ci))}</span>` : '';

      const msgs = [];
      work = work.replace(RE_MSG, (_, pre, content, post) => {
        msgs.push(`<span class="hl-msg">${esc(pre)}${esc(content)}${esc(post)}</span>`);
        return `__MSG_${msgs.length - 1}__`;
      });

      let s = esc(work);
      s = s.replace(RE_BLOCK, '<span class="hl-block">$1</span>');
      s = s.replace(RE_LOGIC, '<span class="hl-logic">$1</span>');
      s = s.replace(RE_SUB,   '<span class="hl-sub">$1</span>');
      s = s.replace(RE_G_RAP, '<span class="hl-g">$1</span>');
      s = s.replace(RE_G_GEN, '<span class="hl-g">$1</span>');
      s = s.replace(RE_M_GEN, '<span class="hl-m">$1</span>');
      s = s.replace(RE_COORD, '<span class="hl-coord">$1$2</span>');
      s = s.replace(RE_FEED,  '<span class="hl-feed">$1$2</span>');
      s = s.replace(RE_PARAM, '<span class="hl-param">$1</span>');
      s = s.replace(RE_MSG_PH, (_, idx) => msgs[parseInt(idx)] || '');
      return s + comment;
    });
    highlights.innerHTML = out.join('\n') + '\n';
  }

  function updateLineNumbers() {
    const c = editor.value.split('\n').length;
    const a = [];
    for (let i = 1; i <= c; i++) a.push(i);
    lineNums.textContent = a.join('\n');
  }

  function refreshVisual() {
    applyHighlight();
    updateLineNumbers();
  }

  function syncScroll() {
    backdrop.scrollTop  = editor.scrollTop;
    backdrop.scrollLeft = editor.scrollLeft;
    lineNums.scrollTop  = editor.scrollTop;
  }

  // ── Insert / Backspace ─────────────────────────────────────
  function insertText(text) {
    editor.readOnly = false;
    const s = editor.selectionStart, e = editor.selectionEnd, v = editor.value;
    const actual = text === '\\n' ? '\n' : text;
    editor.value = v.substring(0, s) + actual + v.substring(e);
    editor.selectionStart = editor.selectionEnd = s + actual.length;
    onInput();
  }

  function doBackspace() {
    editor.readOnly = false;
    const s = editor.selectionStart, e = editor.selectionEnd, v = editor.value;
    if (s !== e) {
      editor.value = v.substring(0, s) + v.substring(e);
      editor.selectionStart = editor.selectionEnd = s;
    } else if (s > 0) {
      editor.value = v.substring(0, s - 1) + v.substring(s);
      editor.selectionStart = editor.selectionEnd = s - 1;
    }
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
    editor.value = v.substring(0, lineStart) + prefix + v.substring(lineStart);
    editor.selectionStart = editor.selectionEnd = lineStart + prefix.length;
    onInput();
  }

  // ── Numpad ─────────────────────────────────────────────────
  function openNumpad(prefix) {
    inputPrefix = prefix;
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
    if (v) insertText(inputPrefix + v + ' ');
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
        <span>M<input type="number" class="cne-hdr-inp" data-hdr-v="gear.val" value="${h.gear.val}" min="40" max="45" style="width:40px"></span>
      </div>
      <div class="cne-hdr-row">
        <label><input type="checkbox" data-hdr="door" ${h.door.active ? 'checked' : ''}> Odjezd do výměny</label>
        <span>M<input type="number" class="cne-hdr-inp" data-hdr-v="door.val" value="${h.door.val}" min="0" max="99" style="width:40px"></span>
      </div>
      <div class="cne-hdr-row">
        <label><input type="checkbox" data-hdr="tool" ${h.tool.active ? 'checked' : ''}> Nástroj</label>
        <span>T<input type="number" class="cne-hdr-inp" data-hdr-v="tool.t" value="${h.tool.t}" min="1" max="99" style="width:36px">
        D<input type="number" class="cne-hdr-inp" data-hdr-v="tool.d" value="${h.tool.d}" min="1" max="9" style="width:36px"></span>
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
          <span>S<input type="number" class="cne-hdr-inp" data-hdr-v="spindle.s" value="${h.spindle.s}" min="1" max="9999" style="width:52px"></span>
          <select class="cne-hdr-inp" data-hdr-v="spindle.m">${spDirOpts}</select>
          <span>LIMS<input type="number" class="cne-hdr-inp" data-hdr-v="spindle.lims" value="${h.spindle.lims}" min="1" max="9999" style="width:52px"></span>
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
    const lines = [];
    let n = 10;

    if (h.gear.active)  { lines.push(`N${n} M${h.gear.val}`); n += 10; }
    lines.push(`N${n} STOPRE`); n += 10;
    if (h.door.active)  { lines.push(`N${n} M${h.door.val}`); n += 10; }
    if (h.tool.active)  { lines.push(`N${n} T${h.tool.t}`); lines.push(`      D${h.tool.d}`); n += 10; }

    let coordLine = `N${n}`;
    if (h.coords.active) coordLine += ` ${h.coords.val}`;
    if (h.feed.active)   coordLine += ` ${h.feed.mode}`;
    coordLine += ' G90';
    lines.push(coordLine); n += 10;

    if (h.spindle.active) {
      let sp = `N${n} ${h.spindle.mode}`;
      if (h.spindle.mode === 'G96' && h.spindle.lims) sp += ` LIMS=${h.spindle.lims}`;
      sp += ` S${h.spindle.s} M${h.spindle.m}`;
      lines.push(sp); n += 10;
    }
    lines.push(`N${n} STOPRE`);

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

  // ── Conversion helpers ────────────────────────────────────
  function evalParam(expr, params) {
    try {
      let expanded = expr.replace(/R(\d+)/gi, (_, id) => {
        const key = `R${parseInt(id, 10)}`;
        return params.has(key) ? params.get(key) : 0;
      });
      if (!/^[0-9.+\-*/() ]+$/.test(expanded)) return NaN;
      return Number(Function('"use strict";return (' + expanded + ')')());
    } catch { return NaN; }
  }

  function getParamContext() {
    const pm = new Map();
    parser.parameters.forEach((val, key) => {
      pm.set(key, typeof val === 'object' ? val.value : Number(val));
    });
    return pm;
  }

  function updateConvButtons() {
    const ab = $('convAbsBtn'), ib = $('convIncBtn');
    if (!ab || !ib) return;
    ab.classList.toggle('cne-conv-active', activeConversion === 'ABS');
    ib.classList.toggle('cne-conv-active', activeConversion === 'INC');
    ab.disabled = activeConversion === 'INC';
    ib.disabled = activeConversion === 'ABS';
  }

  function convertToAbsolute() {
    if (activeConversion === 'ABS') {
      editor.value = originalCode;
      activeConversion = null;
      onInput(); updateConvButtons(); return;
    }
    if (activeConversion) return;
    originalCode = editor.value;
    const lines = editor.value.split('\n');
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
    editor.value = newLines.join('\n');
    activeConversion = 'ABS';
    onInput(); updateConvButtons();
  }

  function convertToIncremental() {
    if (activeConversion === 'INC') {
      editor.value = originalCode;
      activeConversion = null;
      onInput(); updateConvButtons(); return;
    }
    if (activeConversion) return;
    originalCode = editor.value;
    const lines = editor.value.split('\n');
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
    editor.value = newLines.join('\n');
    activeConversion = 'INC';
    onInput(); updateConvButtons();
  }

  // ── Renumbering ───────────────────────────────────────────
  function performRenumbering(start, step) {
    codeBeforeRenum = editor.value;
    const lines = editor.value.split('\n');
    let n = start;
    const newLines = lines.map(line => {
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
    editor.value = newLines.join('\n');
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
  editor.addEventListener('scroll', () => requestAnimationFrame(syncScroll));

  // Delegated clicks
  root.addEventListener('click', e => {
    // Actions
    const ab = e.target.closest('[data-act]');
    if (ab) {
      switch (ab.dataset.act) {
        case 'sidebar':   sidebarEl.classList.toggle('open'); break;
        case 'new':       createNew(); closeMenu(); break;
        case 'download':  downloadFile(); closeMenu(); break;
        case 'import':    fileInput.click(); closeMenu(); break;
        case 'export':    handleExport(); closeMenu(); break;
        case 'validate':  showValidation(); break;
        case 'calc':      closeMenu(); import('../ui.js').then(m => m.openCalculator()); break;
        case 'settings':  showSettings(); closeMenu(); break;
        case 'copy':      copyToClipboard(); closeMenu(); break;
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
        case 'convAbs':   convertToAbsolute(); closeMenu(); break;
        case 'convInc':   convertToIncremental(); closeMenu(); break;
        case 'header':    showHeaderSettings(); closeMenu(); break;
        case 'hdrClose':  readHeaderInputs(); persistHdr(); hdrModal.style.display = 'none'; break;
        case 'hdrApply':  applyHeader(); break;
        case 'backspace': doBackspace(); break;
        case 'addBlock':  insertBlockNumber(); break;
        case 'keyboard':  editor.readOnly = false; editor.focus(); break;
        case 'menu':      $('menuModal').style.display = 'flex'; break;
        case 'menuClose': $('menuModal').style.display = 'none'; break;
        case 'cam':       persist(); overlay.remove(); openCamSimulator(editor.value); break;
        case 'close':     persist(); overlay.remove(); break;
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

  // Pokud byl předán initialCode, vloží se do nového souboru
  if (initialCode && typeof initialCode === 'string' && initialCode.trim()) {
    const name = 'CNC_IMPORT.MPF';
    programs[name] = initialCode;
    currentFile = name;
  }

  displayFile(currentFile);
}
