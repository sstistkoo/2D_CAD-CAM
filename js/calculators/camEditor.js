// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CAM Editor (Sinumerik 840D)                       ║
// ║  Editor CNC drah pro obrábění se zvýrazněním syntaxe        ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeOverlay, closeOnBackdropClick } from '../dialogFactory.js';
import { openCamSimulator } from './camSimulator.js';
import { showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { codeToAbsolute as toAbsolute, codeToIncremental as toIncremental } from './gcodeCoordConvert.js';
import { headerTitle, headerSettingsHTML, readHeaderInputs as readHeaderForm, buildHeaderLines, insertHeader } from './gcodeEditorHeader.js';
import { mergePrograms, renumberLines } from './cam/gcodeMerge.js';
import { G_CODES, M_CODES, TOKEN_RE, convertCornersToPaths, defaultHeaderConfig, esc, extractGCodeFromFile, getChamferPrefix, getControlSystem, getRoundPrefix, storageLoad, storageSave, spacedPrefix, numpadHTML, numpadResult, wireNumpadCalc, numpadOn, wireNumpadToggle, wireTapBelow, wireCommentTools, commentClass, wireCurrentLine, wireNoKeyboard, wireKeyboardMode, ensureCaretVisible } from './gcodeEditorShared.js';

// ── Konstanty ──────────────────────────────────────────────────
const STORAGE_DATA  = 'skica-cam-editor-data';
const STORAGE_CFG   = 'skica-cam-editor-settings';
const STORAGE_HDR   = 'skica-cam-editor-header';
const STORAGE_MERGE = 'skica-cam-editor-merge-queue';

// Naplní frontu „SPOJ G-KÓD" zvenčí (CAM Simulátor → tlačítko „⛓ Spojit"
// nad částmi programu). Editor si frontu načítá z localStorage při každém
// otevření, takže stačí zapsat data ještě před openCamEditor().
export function setEditorMergeQueue(items) {
  try { localStorage.setItem(STORAGE_MERGE, JSON.stringify(items)); } catch { /* quota */ }
}

// ── Potvrzení přepsání zastaralého kódu ──────────────────────────
// Editor si drží svůj vlastní uložený program; pokud se mezitím
// v simulátoru přegenerovaly dráhy, nabídne se přepsání aktuálním kódem.
function confirmStaleCodeOverwrite() {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;';
    ov.innerHTML = `
      <div style="background:#1e1e2e;border:1px solid #45475a;border-radius:10px;padding:24px 28px 18px;min-width:320px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.5);color:#cdd6f4;font-family:system-ui,sans-serif;">
        <div style="font-size:14px;margin-bottom:18px;line-height:1.5;">Kód v editoru se liší od aktuálního G-kódu simulátoru (dráhy byly mezitím přegenerovány).<br><br>Přepsat editor aktuálním kódem ze simulátoru? Neuložené ruční úpravy v editoru budou ztraceny.</div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button data-r="keep" style="padding:7px 22px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:#45475a;color:#cdd6f4;">Ponechat uložený</button>
          <button data-r="overwrite" style="padding:7px 22px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:#89b4fa;color:#1e1e2e;">Přepsat aktuálním</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const cleanup = (val) => { ov.remove(); resolve(val); };
    ov.querySelector('[data-r="overwrite"]').addEventListener('click', () => cleanup(true));
    ov.querySelector('[data-r="keep"]').addEventListener('click', () => cleanup(false));
    closeOnBackdropClick(ov, () => cleanup(false));
  });
}

// ── Spojení více programů do jednoho ─────────────────────────
// splitHeaderBody / classifyHeaderLine / renumberLines / mergePrograms
// → přesunuto do cam/gcodeMerge.js (sdíleno s CAM Simulátorem, kde se
// stejným způsobem skládají části programu — viz cam/opParts.js).

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

function getControlSystemBarText(programName) {
  const ctrl = getControlSystem();
  const names = { sinumerik: 'SINUMERIK', fanuc: 'FANUC', heidenhain: 'HEIDENHAIN' };
  return `${names[ctrl] || names.sinumerik} (CAM) &mdash; ${esc(programName || '')}`;
}

// ── Build HTML ─────────────────────────────────────────────────
function buildEditorHTML() {
  return `
<div class="cne-layout">
  <div class="cne-sn-bar">
    <button class="cne-sn-arrow" data-el="undoArrowBtn" data-act="editorUndo" title="Zpět (Ctrl+Z)" disabled>◀</button>
    <button class="cne-sn-arrow" data-el="redoArrowBtn" data-act="editorRedo" title="Vpřed (Ctrl+Y)" disabled>▶</button><button class="cne-sn-arrow cne-sn-numtog" data-numpadtog>123</button>
    <span class="cne-sn-text" data-el="snBar"></span>
    <button class="cne-sn-close" data-act="closeEditor" title="Zavřít editor">✕</button>
  </div>
  <div class="cne-toolbar">
    <div class="cne-toolbar-left">
      <button class="cne-tb-btn cne-tb-sidebar" data-act="sidebar" title="Soubory">☰</button>
      <span class="cne-filename cne-hide-m" data-el="filename">—</span>
      <button class="cne-tb-btn cne-show-m" data-act="cornersToPath" title="Převést sražení/zaoblení (CHF/RND) na skutečnou dráhu G1/G2/G3">⌒</button>
      <button class="cne-tb-btn cne-conv cne-show-m" data-el="convModeBtn" data-act="convMode" title="Přepnout G90 (absolutní) / G91 (přírůstkové)">G90</button>
      <button class="cne-tb-btn cne-show-m" data-act="search" title="Hledat v kódu (Ctrl+F)">🔍</button>
      <button class="cne-tb-btn cne-tb-new cne-show-m" data-act="new" title="Nový program">＋</button>
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
      <button class="cne-tb-btn cne-cam-btn" data-act="cam" title="Otevřít v CAM Simulátoru (přenést úpravy)" aria-label="Otevřít v CAM Simulátoru">🔄</button>
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
    <button class="cne-qb gray" data-hidecom title="Skrýt poznámky za středníkem">;👁</button>
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
    ${numpadHTML()}
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
export function openCamEditor(initialCode, jumpLine) {
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
  let undoStack = [];                // zásobník pro šipky Zpět/Vpřed (snapshoty textu editoru)
  let redoStack = [];
  let undoGroupTimer = null;
  let undoGroupOpen = false;        // true = probíhající "shluk" úprav se sype do jednoho kroku undo

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
  const overlay = makeOverlay('cam-editor', '🔄 CAM Editor', buildEditorHTML(), 'cnc-editor-window');
  if (!overlay) return;

  // ── DOM refs ───────────────────────────────────────────────
  const $ = s => overlay.querySelector(`[data-el="${s}"]`);
  const root        = overlay.querySelector('.cne-layout');
  const editor      = $('editor');
  const backdrop    = $('backdrop');
  const highlights  = $('highlights');
  const fileListEl  = $('fileList');
  const paramListEl = $('paramList');
  const sidebarEl   = $('sidebar');
  const statusBtn   = $('statusBtn');
  const filenameLbl = $('filename');
  const undoArrowBtn = $('undoArrowBtn');
  const redoArrowBtn = $('redoArrowBtn');
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
    $('snBar').innerHTML = getControlSystemBarText(name);
    // Historie Zpět/Vpřed patří vždy k jednomu souboru, ne napříč programy.
    undoStack = []; redoStack = []; undoGroupOpen = false;
    updateUndoRedoButtons();
    // CAM kód je generován absolutně – při zobrazení souboru začínáme v G90.
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
      if (ci === 0) return `<span class="${commentClass(line)}">${esc(line)}</span>`;

      const work = ci > 0 ? line.substring(0, ci) : line;
      const comment = ci > 0 ? `<span class="${commentClass(line)}">${esc(line.substring(ci))}</span>` : '';

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
    captureUndoSnapshot();
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
    ensureCaretVisible(editor);   // nový řádek / dlouhý řádek: kurzor vždy vidět
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
    if (s !== e || s > 0) captureUndoSnapshot();
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
    ensureCaretVisible(editor);
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
    captureUndoSnapshot();
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

  // 123 v horní liště: VYP = písmeno osy přímo do kódu, ZAP = číselník (8. 11. 2026)
  const inputOrNumpad = p => p && !numpadOn('cam_numpadOn', true) ? insertText(spacedPrefix(activeTarget === editor && editor, p)) : openNumpad(p);

  function confirmNumpad() {
    const v = numpadResult(numInput.value);   // výraz (100/2+5) → výsledek
    if (v === null) { showToast('Neplatný výraz – zkontrolujte závorky a znaménka'); return; }
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

  // Formulář a řádky hlavičky → gcodeEditorHeader.js (společný pro CAM i CNC Editor).
  function showHeaderSettings() {
    const hdrTitleEl = $('hdrTitle');
    if (hdrTitleEl) hdrTitleEl.textContent = headerTitle(getControlSystem());
    hdrList.innerHTML = headerSettingsHTML(headerCfg);
    hdrModal.style.display = 'flex';
  }

  function readHeaderInputs() { readHeaderForm(hdrModal, headerCfg); }

  function applyHeader() {
    readHeaderInputs();
    persistHdr();
    captureUndoSnapshot();
    editor.value = insertHeader(editor.value, buildHeaderLines(headerCfg, getControlSystem()));
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
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); performUndo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); performRedo(); }
  });
  editor.addEventListener('beforeinput', captureUndoSnapshot);

  // ── Conversion helpers ────────────────────────────────────
  function getParamContext() {
    const pm = new Map();
    parser.parameters.forEach((val, key) => {
      pm.set(key, typeof val === 'object' ? val.value : Number(val));
    });
    return pm;
  }

  function updateModeBtn() {
    // Tlačítko G90/G91 existuje 2× (desktop toolbar-right, mobil toolbar-left) –
    // musí se aktualizovat obě instance, proto querySelectorAll místo $().
    overlay.querySelectorAll('[data-el="convModeBtn"]').forEach(b => {
      b.textContent = coordMode === 'abs' ? 'G90' : 'G91';
      b.classList.toggle('cne-conv-active', coordMode === 'inc');
      b.title = coordMode === 'abs'
        ? 'Režim G90 (absolutní) – klikni pro přepočet na G91 (přírůstkové)'
        : 'Režim G91 (přírůstkové) – klikni pro návrat na G90 (absolutní)';
    });
    const mi = $('convModeMenuIcon');
    if (mi) mi.textContent = coordMode === 'abs' ? 'G90' : 'G91';
  }

  // Přepočet G90 ↔ G91 → gcodeCoordConvert.js (společný pro CAM i CNC Editor).
  function codeToAbsolute(code) { return toAbsolute(code, getParamContext()); }
  function codeToIncremental(code) { return toIncremental(code, getParamContext()); }

  // Jedno tlačítko G90/G91 – přepne režim a přepočítá souřadnice v editoru.
  function toggleCoordMode() {
    captureUndoSnapshot();
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
    captureUndoSnapshot();
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

  // ── Zpět / Vpřed (šipky v oranžové liště) ───────────────────
  // Vlastní historie místo nativního textarea undo: přímé přiřazení
  // editor.value (quickbar, hlavička, přečíslování…) prohlížeči nativní
  // undo zásobník stejně zahodí, takže by fungoval nespolehlivě.
  function updateUndoRedoButtons() {
    if (undoArrowBtn) undoArrowBtn.disabled = !undoStack.length;
    if (redoArrowBtn) redoArrowBtn.disabled = !redoStack.length;
  }

  function captureUndoSnapshot() {
    clearTimeout(undoGroupTimer);
    if (!undoGroupOpen) {
      undoStack.push({ value: editor.value, sel: editor.selectionEnd });
      if (undoStack.length > 200) undoStack.shift();
      redoStack.length = 0;
      undoGroupOpen = true;
    }
    undoGroupTimer = setTimeout(() => { undoGroupOpen = false; }, 600);
    updateUndoRedoButtons();
  }

  function performUndo() {
    if (!undoStack.length) return;
    const entry = undoStack.pop();
    redoStack.push({ value: editor.value, sel: editor.selectionEnd });
    editor.value = entry.value;
    editor.selectionStart = editor.selectionEnd = entry.sel;
    undoGroupOpen = false;
    onInput();
    editor.focus({ preventScroll: true });
    updateUndoRedoButtons();
  }

  function performRedo() {
    if (!redoStack.length) return;
    const entry = redoStack.pop();
    undoStack.push({ value: editor.value, sel: editor.selectionEnd });
    editor.value = entry.value;
    editor.selectionStart = editor.selectionEnd = entry.sel;
    undoGroupOpen = false;
    onInput();
    editor.focus({ preventScroll: true });
    updateUndoRedoButtons();
  }

  // ══════════════════════════════════════════════════════════
  // ██  EVENT WIRING  ████████████████████████████████████████
  // ══════════════════════════════════════════════════════════
  editor.addEventListener('input', onInput);
  editor.addEventListener('scroll', syncScroll);
  // Sdílené s kreslicím CNC editorem (8. 11. 2026): klik pod text / Enter v poznámce → nový řádek,
  // ;👁 skrytí poznámek, podklad řádku s kurzorem, číselník s kalkulačkou, 123, klávesnice jen přes ⌨.
  wireTapBelow(editor, () => insertText('\n')); wireCommentTools(editor, root, () => insertText('\n'));
  wireNumpadToggle(root, 'cam_numpadOn', true); wireCurrentLine(editor, backdrop); wireNumpadCalc(numModal, numInput); wireNoKeyboard(root, editor);
  const toggleKeyboard = wireKeyboardMode(editor, root);

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
        case 'sidebar': {
          const isOpen = sidebarEl.classList.toggle('open');
          ab.classList.toggle('open', isOpen);
          // Klávesnice quickbaru se přes otevřený panel nepotřebuje – ať má panel i ten prostor.
          if (quickbar) quickbar.classList.toggle('cne-hidden-by-sidebar', isOpen);
          break;
        }
        case 'closeEditor': overlay.remove(); break;
        case 'editorUndo': performUndo(); break;
        case 'editorRedo': performRedo(); break;
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
            captureUndoSnapshot();
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
        case 'keyboard':  toggleKeyboard(); break;
        case 'menu':      $('menuModal').style.display = 'flex'; break;
        case 'menuClose': $('menuModal').style.display = 'none'; break;
        case 'cam': {
          // Přenes upravenou dráhu zpět do CAM simulátoru (odkud se kód bral).
          // Simulátor čte souřadnice absolutně, takže přírůstkový režim (G91)
          // před odesláním přepočítáme zpět na G90.
          if (coordMode === 'inc') { editor.value = codeToAbsolute(editor.value); coordMode = 'abs'; onInput(); }
          // Nepřevedené sražení/zaoblení (CHF=/RND=…) by simulátor nerozpoznal –
          // automaticky ho převedeme na skutečnou dráhu (G1/G2/G3).
          const conv = convertCornersToPaths(editor.value);
          if (conv.converted > 0) { editor.value = conv.code; onInput(); }
          persist();
          const code = editor.value;
          overlay.remove();
          // Pokud zůstal otevřený simulátor (z „Odeslat do CAM editoru"), zavři ho,
          // aby ho šlo znovu vytvořit s přenesenou dráhou (jinak by makeOverlay
          // vrátil null a kód by se nepřenesl).
          document.querySelector('.calc-overlay[data-type="cam-simulator"]')?.remove();
          openCamSimulator(undefined, code);
          break;
        }
        case 'chamfer':   inputOrNumpad(getChamferPrefix()); break;
        case 'round':     inputOrNumpad(getRoundPrefix()); break;
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
    if (ip) { inputOrNumpad(ip.dataset.inp); return; }
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
  numInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmNumpad();
    else if (e.key === 'Backspace') { e.preventDefault(); numInput.value = numInput.value.slice(0, -1); }
  });
  fileInput.addEventListener('change', handleImport);
  mergeFileInput.addEventListener('change', handleMergeLoad);

  // Close menu modal on click outside card
  closeOnBackdropClick($('menuModal'), () => { $('menuModal').style.display = 'none'; });
  // Close numpad modal on click outside card
  closeOnBackdropClick(numModal, () => { numModal.style.display = 'none'; });

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
  ensureFile();

  // Pokud byl předán initialCode, vloží se do souboru CAM_PROGRAM.MPF.
  // Pokud na něm uživatel právě je a obsah se liší od initialCode (dráhy byly
  // mezitím v simulátoru přegenerovány), nabídne se přepsání zastaralého obsahu.
  // Je-li uživatel rozkoukaný v jiném souboru (např. po "Nový program"), editor
  // ho při návratu nepřepne pryč ani mu ten soubor nepřepíše.
  const onProgramFile = !programs['CAM_PROGRAM.MPF'] || currentFile === 'CAM_PROGRAM.MPF';
  if (onProgramFile && initialCode && typeof initialCode === 'string' && initialCode.trim()) {
    const name = 'CAM_PROGRAM.MPF';
    if (!programs[name]) {
      programs[name] = initialCode;
      currentFile = name;
    } else if (programs[name].trim() !== initialCode.trim()) {
      confirmStaleCodeOverwrite().then(overwrite => {
        if (overwrite) {
          programs[name] = initialCode;
          if (currentFile === name) displayFile(name);
        }
      });
    }
  }

  displayFile(currentFile);
  renderMergeList();

  // Skok kurzoru na řádek odpovídající aktuální pozici v simulaci CAM
  // (dává smysl jen na souboru se synchronizovaným G-kódem ze simulátoru)
  if (currentFile === 'CAM_PROGRAM.MPF' && typeof jumpLine === 'number' && jumpLine >= 0) {
    requestAnimationFrame(() => jumpToLine(jumpLine));
  }
}
