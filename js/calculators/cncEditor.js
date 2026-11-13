// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CNC Editor (Sinumerik 840D)                        ║
// ║  Editor CNC kódu párovaný s CAD panelem, se zvýrazněním      ║
// ║  syntaxe (dvojče CAM Editoru, pracuje s CNC kódem z CAD)     ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeOverlay, onOverlayRemoved, showConfirmDialog, closeOnBackdropClick } from '../dialogFactory.js';
import { bridge } from '../bridge.js';
import { showToast, state } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { codeToAbsolute as toAbsolute, codeToIncremental as toIncremental } from './gcodeCoordConvert.js';
import { headerTitle, headerSettingsHTML, readHeaderInputs as readHeaderForm, buildHeaderLines, insertHeader } from './gcodeEditorHeader.js';
import { buildEditorHTML, getControlSystemBarText } from './cncEditorHtml.js';
import { CNCParser, defaultParserConfig as baseParserConfig } from './gcodeEditorParser.js';
import { analyzeDrawCode, moveInfo, moveAtOrBefore, moveDirDeg, modeAtLine, polarToXZ, tangentToIK, geometryChecks, angleLineEnd, convertLinesMode, f3 } from './cncDrawTools.js';
import { drawPreview } from './cncDrawPreview.js';
import { setupLiveView } from './cncEditorLive.js';
import { wireLongDelete } from './cncLongDelete.js';
import { wireSearch } from './cncSearch.js';
import { createErrMarks } from './cncErrMarks.js';
import { caretInStock as inStockAt, syncQuickKeys, nextCoordG, wireCaretKeys, applyStockToggle } from './cncQuickKeys.js';
import { angleView, polarInputToDialog, relToDialog, dirLabel, polarHint } from './cncAngleCompass.js';
import { lineHint } from './cncHints.js';
import { joinAtIntersection, chamferByAngle } from './cncJoin.js';
import { createArcModal } from './cncArcModal.js';
import { resolveExpressions } from './cncExpr.js';
import { createCanvasPicker } from '../dialogs/canvasPick.js';
import { mergePrograms, renumberLines } from './cam/gcodeMerge.js';
import { autoCompleteMotionG, wireAngleCompass, G_CODES, M_CODES, TOKEN_RE, convertCornersToPaths as convertCorners, defaultHeaderConfig, esc, extractGCodeFromFile, getChamferPrefix, getControlSystem, getRoundPrefix, storageLoad, storageSave, spacedPrefix, wireTapBelow, wireCommentTools, MARKER_RE, commentClass, numpadOn, wireNumpadToggle, wireCurrentLine, numpadResult, wireNumpadCalc, wireNoKeyboard, openCaret, sameCode, autoRedrawOn, wireAutoRedraw, ensureCaretVisible } from './gcodeEditorShared.js';
import { shownIntersections } from '../geometry/shownIntersections.js';

// ── Konstanty ──────────────────────────────────────────────────
const STORAGE_DATA  = 'skica-cnc-editor-data';
const STORAGE_CFG   = 'skica-cnc-editor-settings';
const STORAGE_HDR   = 'skica-cnc-editor-header';
const STORAGE_MERGE = 'skica-cnc-editor-merge-queue';
const STORAGE_HIST  = 'skica-cnc-editor-history';
const STORAGE_FONT  = 'skica-cnc-editor-font-size';
const STORAGE_PREVIEW = 'skica-cnc-editor-preview';
const STORAGE_INFO = 'skica-cnc-editor-info-open';
const HIST_KEEP     = 30;     // kroků Zpět/Vpřed, které přežijí zavření editoru
const HIST_MAX_CHARS = 1_000_000; // strop uložené historie (localStorage má typicky ~5 MB)
const FS_MIN = 9, FS_MAX = 26;

// Historie Zpět/Vpřed po souborech – drží se mimo okno editoru, aby přežila
// zavření (🔄 vykreslení na plátno, bod z plátna) i obnovení stránky.
let histByFile = null;

// ── Spojení více programů do jednoho ─────────────────────────
// `splitHeaderBody`/`classifyHeaderLine`/`renumberLines`/`mergePrograms`
// sdíleny s CAM Editorem/Simulátorem přes cam/gcodeMerge.js (dřív tu žil
// zastaralý fork bez rozpoznání dialektu, TOOL_CHANGE_FORCED nájezdu do
// ref. bodu a fanuckých `( … )` komentářů — viz docs/cam-plan-2026-09-15.md
// bod 8). `mergePrograms` dostává aktuální řídicí systém přes `ctrl`
// (`getControlSystem()` níž), jinak by ho odvozovala jen z první části.

// Kontrola programu (CNCParser) → gcodeEditorParser.js; tady i s kontrolami pro kreslení.
const defaultParserConfig = () => baseParserConfig({ drawChecks: true });

// Převod markerů sražení/zaoblení (sdílený s CAM Editorem, gcodeEditorShared.js) s kreslicí
// konvencí CAD: X v režimu „průměr" dvojnásobné, karusel = prohozené osy (opačné
// znaménko směru oblouku), zrcadlení jedné osy prohazuje G2/G3 (jako flipArc
// v runCncExport), oblouk i s I/K a čísla bez zbytečných nul.
function convertCornersToPaths(code, onlyLine = null) {
  return convertCorners(code, {
    onlyLine,
    xs: state.xDisplayMode === 'diameter' ? 2 : 1,
    ik: true,
    fmt: v => String(Number(v.toFixed(3))),
    gWord: (cross) => {
      const ccwWorld = state.machineType === 'karusel' ? cross < 0 : cross > 0;
      return (ccwWorld !== (state.flipX !== state.flipZ)) ? 'G3' : 'G2';
    },
  });
}

// HTML šablony okna (lišta, menu, kreslicí nástroje) → cncEditorHtml.js.

// ══════════════════════════════════════════════════════════════
// ██  MAIN EXPORT  ████████████████████████████████████████████
// ══════════════════════════════════════════════════════════════
export function openCncEditor(initialCode, { drawOnClose = false, baseline = null, caret = null, insert = null, highlight = null } = {}) {
  // `baseline` = kód z výkresu při PRVNÍM otevření (zachová se přes návrat z výběru bodu
  // z plátna, kdy se editor otevírá znovu s rozpracovaným textem). `caret`/`insert` =
  // kam vložit souřadnice kliknuté na plátně.
  const baselineCode = typeof baseline === 'string' ? baseline : initialCode;
  // Objekty označené na plátně (popisky „Úsečka 3"…) – jejich řádky se zvýrazní.
  const hlLabels = Array.isArray(highlight) ? highlight.filter(Boolean) : [];
  const hlRe = hlLabels.length
    ? new RegExp(';\\s*(?:' + hlLabels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=,|\\s*$)')
    : null;
  let pickSuspended = false;        // editor je zavřený jen na chvíli (výběr bodu) – bez dotazu na přepsání
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
  if (!histByFile) { const hs = storageLoad(STORAGE_HIST); histByFile = hs && typeof hs === 'object' ? hs : {}; }

  // Editor z Kalkulaček se otevírá z pravého panelu – na mobilu ho zavřít, ať po
  // zavření editoru (výběr bodu z plátna) nezakrývá plátno.
  if (drawOnClose) {
    const cadSidebar = document.getElementById('sidebar');
    if (cadSidebar?.classList.contains('mobile-open')) document.getElementById('sidebarCloseBtn')?.click();
  }

  // ── Create overlay ─────────────────────────────────────────
  const overlay = makeOverlay('cnc-editor', '💻 CNC Editor', buildEditorHTML(drawOnClose), 'cnc-editor-window');
  if (!overlay) return;
  // Třída pro CSS: editor z Kalkulaček přes celý displej (bez horního odsazení).
  if (drawOnClose) overlay.classList.add('cne-overlay-draw');

  // Editor z Kalkulaček: po zavření (✕, Esc, klik mimo) vykreslí napsaný kód na
  // canvas jako 🔄 u CNC KÓD – po potvrzení, protože 🔄 výkres nahrazuje (jde vrátit Zpět). Tlačítko „do CAD" (toCad) už kreslí samo.
  let sentToCad = false;
  if (drawOnClose) {
    onOverlayRemoved(overlay, () => {
      if (sentToCad || pickSuspended) return;
      // Editor → plátno: objekt z řádku s kurzorem (poznámka „; Úsečka 3, …") se
      // na plátně označí. Při následném „Přepsat" se výkres stejně nahradí.
      const cm = (editor.value.split('\n')[caretLine()] || '').match(/;\s*([^,;]+?)\s*(?:,|$)/);
      if (cm && typeof bridge.selectAsDrawnLabel === 'function') bridge.selectAsDrawnLabel(cm[1]);
      let code = editor.value;
      if (!code.trim()) return;
      // Nic se nezměnilo oproti kódu z výkresu → není co přepisovat, bez dotazu.
      if (typeof baselineCode === 'string' && sameCode(code, baselineCode)) return;   // prázdné řádky (i ten po otevření) se nepočítají
      code = resolveExpressions(code).code;      // X=R1*2, X10+5 → čísla
      code = polarToXZ(code, drawOpts()).code;   // PU/L → X Z (CAD parser polární zadání nezná)
      code = tangentToIK(code, drawOpts()).code; // G2/G3 … T → X Z I K
      if (coordMode === 'inc') code = codeToAbsolute(code);
      code = convertCornersToPaths(code).code;
      const draw = () => { if (typeof bridge.renderCncCodeToCanvas === 'function') bridge.renderCncCodeToCanvas(code); };
      if (autoRedrawOn()) draw();   // AUTO v horní liště: bez dotazu
      else showConfirmDialog('Přepsat výkres podle zapsaného kódu?', draw, { confirmLabel: 'Přepsat', danger: false, cancelLabel: 'Ponechat výkres' });
    });
  }

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
  function persist() { storageSave(STORAGE_DATA, { programs, currentFile }); storeHistory(); }

  // ── Historie Zpět/Vpřed přes zavření editoru ───────────────
  let historyFile = null;            // soubor, jehož historie je právě v undoStack/redoStack
  function storeHistory() {
    if (!historyFile) return;
    histByFile[historyFile] = { undo: undoStack.slice(-HIST_KEEP), redo: redoStack.slice(-HIST_KEEP), cur: editor.value };
    // Strop velikosti: historie nesmí zaplnit localStorage (pak by neprošlo ani
    // uložení programů). Nejdřív jdou pryč historie ostatních souborů, pak
    // nejstarší kroky toho aktuálního.
    if (JSON.stringify(histByFile).length > HIST_MAX_CHARS) {
      for (const k of Object.keys(histByFile)) if (k !== historyFile) delete histByFile[k];
      const h = histByFile[historyFile];
      while (JSON.stringify(histByFile).length > HIST_MAX_CHARS && (h.redo.length || h.undo.length)) {
        if (h.redo.length) h.redo.shift(); else h.undo.shift();
      }
    }
    storageSave(STORAGE_HIST, histByFile);
  }
  function loadHistory(name) {
    const h = histByFile[name];
    undoStack = h && Array.isArray(h.undo) ? h.undo.slice() : [];
    redoStack = h && Array.isArray(h.redo) ? h.redo.slice() : [];
    // Kód se mezitím změnil mimo editor (🔄 vykreslení a nové otevření z výkresu)
    // → text, který byl v editoru naposledy, je další krok Zpět.
    if (h && typeof h.cur === 'string' && h.cur.replace(/\r/g, '') !== editor.value.replace(/\r/g, '')) {
      undoStack.push({ value: h.cur, sel: h.cur.length, label: 'Načteno z plátna', t: Date.now() });
      redoStack = [];
    }
    undoGroupOpen = false;
    historyFile = name;
  }
  function persistCfg() { storageSave(STORAGE_CFG, parserCfg); }
  function persistMerge() { storageSave(STORAGE_MERGE, mergeQueue); }

  // ── File management ────────────────────────────────────────
  function ensureFile() {
    // Prázdný text je pořád existující soubor (vše smazané) – ne důvod zakládat
    // nový program; ten navíc nesmí přepsat už existující PROG_n.
    if (!currentFile || typeof programs[currentFile] !== 'string') {
      let n = 1;
      while (typeof programs[`PROG_${n}.MPF`] === 'string') n++;
      const nm = `PROG_${n}.MPF`;
      programs[nm] = '; Nový program\nG54 G90 G18\nG95\nG97 S500 M4\nSTOPRE\n\n\nM30\n';
      currentFile = nm;
    }
  }

  function displayFile(name) {
    if (typeof programs[name] !== 'string') return;   // prázdný program ('') je platný soubor
    storeHistory();                   // historie opouštěného souboru
    currentFile = name;
    editor.value = programs[name];
    filenameLbl.textContent = name;
    $('snBar').innerHTML = getControlSystemBarText(name, drawOnClose);
    // Historie Zpět/Vpřed patří vždy k jednomu souboru, ne napříč programy.
    loadHistory(name);
    updateUndoRedoButtons();
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
    while (typeof programs[`PROG_${n}.MPF`] === 'string') n++;
    const nm = `PROG_${n}.MPF`;
    programs[nm] = `; ${nm}\nG54 G90 G18\nG95\nG97 S500 M4\nSTOPRE\n\n\nM30\n`;
    displayFile(nm);
    persist();
  }

  function deleteFile(name) {
    if (!confirm(`Smazat "${name}"?`)) return;
    if (historyFile === name) storeHistory();
    // Smazání jde vrátit šipkou ◀: krok Zpět v souboru, který se zobrazí místo něj.
    // Vnořené „obnov smazaný soubor" z jeho vlastní historie se nenese (rostlo by do hloubky).
    const h = histByFile[name];
    const hist = h ? { ...h, undo: h.undo.filter(e => !e.restoreFile) } : null;
    const restore = { restoreFile: name, code: programs[name], hist, t: Date.now(), wasCurrent: name === currentFile };
    delete programs[name];
    delete histByFile[name];
    if (historyFile === name) historyFile = null;
    // Smazán jiný než otevřený soubor → editor zůstává, kde je.
    if (name !== currentFile && typeof programs[currentFile] === 'string') renderFileList();
    else {
      const keys = Object.keys(programs);
      if (keys.length) displayFile(keys[0]);
      else { currentFile = ''; ensureFile(); displayFile(currentFile); }
    }
    undoStack.push(restore);
    redoStack.length = 0;
    updateUndoRedoButtons();
    persist();
    showToast(`Soubor ${name} smazán – ◀ Zpět ho vrátí`);
  }

  function restoreDeletedFile(e) {
    let name = e.restoreFile;
    if (typeof programs[name] === 'string') name = name.replace(/(\.\w+)?$/, m => '_OBN' + (m || '.MPF'));
    storeHistory();                   // současný soubor už bez kroku obnovení
    programs[name] = e.code ?? '';
    histByFile[name] = e.hist ? { ...e.hist, cur: e.code ?? '' } : { undo: [], redo: [], cur: e.code ?? '' };
    // Smazaný byl jiný než otevřený soubor → jen se vrátí do seznamu, editor zůstává.
    if (e.wasCurrent === false) { renderFileList(); updateUndoRedoButtons(); }
    else displayFile(name);
    persist();
    showToast(`Soubor ${name} obnoven`);
  }

  function renameFile() {
    let nw = prompt('Nový název:', currentFile);
    if (!nw || nw.trim() === currentFile) return;
    nw = nw.trim();
    if (!/\.(MPF|SPF)$/i.test(nw)) {
      nw += /\.SPF$/i.test(currentFile) ? '.SPF' : '.MPF';
    }
    if (typeof programs[nw] === 'string') { showToast(`Soubor ${nw} už existuje`); return; }
    programs[nw] = programs[currentFile];
    delete programs[currentFile];
    delete histByFile[currentFile];
    if (historyFile === currentFile) historyFile = nw;   // historie jde s přejmenovaným souborem
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
    const merged = mergePrograms(mergeQueue, getControlSystem());
    let n = 1;
    while (typeof programs[`SPOJENY_${n}.MPF`] === 'string') n++;
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
      const axis = g.coord ? { X: ' hl-cx', Z: ' hl-cz' }[m[0][0].toUpperCase()] || '' : '';
      out += `<span class="${cls}${axis}">${esc(m[0])}</span>`;
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

      const html = highlightCode(work) + comment;
      // Řádek objektu označeného na plátně – podbarvit (znaky se nemění).
      return ci > 0 && hlRe && hlRe.test(line.substring(ci)) ? `<span class="hl-selline">${html}</span>` : html;
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
  function insertText(text, label = 'Vloženo') {
    const actual = text === '\\n' ? '\n' : text;
    if (activeTarget === searchInput) {
      const s = searchInput.selectionStart, e = searchInput.selectionEnd, v = searchInput.value;
      searchInput.value = v.substring(0, s) + actual + v.substring(e);
      searchInput.selectionStart = searchInput.selectionEnd = s + actual.length;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    editor.readOnly = false;
    let s = editor.selectionStart, e = editor.selectionEnd;
    const v = editor.value;
    // Kurzor v poznámce za středníkem (typicky konec řádku „Z0 ; Úsečka 3…"):
    // kód by skončil v komentáři a nikdo by ho nečetl → vložit před středník.
    let actualIns = actual, mkGap = '';
    if (s === e && actual !== '\n' && !actual.startsWith(';')) {
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      const ci = splitComment(v.slice(ls, s)), le = v.indexOf('\n', s) < 0 ? v.length : v.indexOf('\n', s);     // středník v MSG("…;…") není komentář
      // Řádek se značkou KONTURA_/STOCK_ START/END je jen značka: kód jde na vlastní řádek pod ni (na začátku řádku nad ni).
      if (/^\s*;/.test(v.slice(ls, le)) && MARKER_RE.test(v.slice(ls, le))) { if (s === ls) mkGap = '\n'; else { s = e = le; actualIns = '\n' + actualIns.trimStart(); } }
      else if (ci >= 0) {
        let p = ls + ci;
        while (p > ls && v[p - 1] === ' ') p--;
        s = e = p;
      }
    }
    // Za kurzorem už mezera je → koncovou mezeru tokenu („G1 ") nezdvojovat.
    if (v[e] === ' ' && actual !== ' ') actualIns = actualIns.replace(/[ \t]+$/, '');
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
    const needsSpace = prevChar && !/\s/.test(prevChar) && !/^[;=]/.test(actual) && actual !== ' ' && actual !== '\n' && !/^[\d.-]$/.test(actual);   // číslice čísla: bez mezery
    const insert = (needsSpace && actualIns[0] !== '\n' ? ' ' : '') + actualIns;
    // Hned za vloženým kódem středník („Z0;…") → oddělit mezerou.
    const gap = mkGap || (v[e] === ';' && !/\s$/.test(actualIns) && !actualIns.startsWith(';') ? ' ' : '');
    captureUndoSnapshot(label, actual);
    editor.value = v.substring(0, s) + insert + gap + v.substring(e);
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
    onInput(actual === '\n' ? { inputType: 'insertLineBreak' } : undefined);
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
    if (s !== e || s > 0) captureUndoSnapshot('Mazání');
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
    captureUndoSnapshot('Číslo bloku', prefix.trim());
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

  const inputOrNumpad = p => p && !numpadOn() ? insertText(spacedPrefix(activeTarget === editor && editor, p)) : openNumpad(p); // 123 v horní liště: VYP = písmeno přímo, ZAP = číselník (8. 11. 2026)

  function buildHelpers(prefix) {
    const codes = prefix === 'G' ? G_CODES : prefix === 'M' ? M_CODES : null;
    if (!codes) { numHelpers.innerHTML = ''; return; }
    numHelpers.innerHTML = Object.entries(codes).map(([k, v]) =>
      `<div class="cne-helper" data-hv="${k}"><b>${prefix}${k}</b> ${esc(v)}</div>`
    ).join('');
  }

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
    // Editor z Kalkulaček je kresba bez M30/G28 – „Program nekončí M30" tam není chyba.
    // Dědění G0 hlídá jen kreslicí editor: v obráběcím programu je „G0 X… / Z…" na dvou
    // řádcích běžný odjezd, v kontuře z Kalkulaček je to skoro jistě smazané G1.
    const cfg = drawOnClose
      ? { ...parserCfg, end: { ...parserCfg.end, active: false } }
      : { ...parserCfg, modalMove: { ...parserCfg.modalMove, active: false } };
    const { errors } = parser.parseProgram(programs[currentFile], currentFile, cfg);
    if (!drawOnClose) return errors;
    // Kreslení: kontrola geometrie (oblouky, návaznost, X pod osou, tečnost).
    const geo = geometryChecks(analyzeDrawCode(programs[currentFile], drawOpts()), cfg)
      .map(e => ({ file: currentFile, ...e }));
    return errors.concat(geo).sort((a, b) => a.lineIndex - b.lineIndex);
  }

  function updateStatus() {
    const errs = runValidation(); errMarks.set(errs);   // červený pruh u chybných řádků (cncErrMarks.js)
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
    editor.scrollTop = Math.max(0, idx * lineH() - editor.clientHeight / 2);
    syncScroll();
  }

  /** Výška řádku editoru v px (mění se tlačítky A− / A+). */
  function lineH() { return parseFloat(getComputedStyle(editor).lineHeight) || 18; }

  // ── R-Params display ───────────────────────────────────────
  function renderParams() {
    if (!paramListEl) return;          // editor z Kalkulaček sekci R-parametrů nemá
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
    captureUndoSnapshot('Hlavička programu');
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
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadFile() {
    if (!currentFile || typeof programs[currentFile] !== 'string') return;
    const blob = new Blob([programs[currentFile]], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = currentFile; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);   // hned po click() by stahování na mobilu / Firefoxu zrušilo
  }

  // ── Clipboard ──────────────────────────────────────────────
  function closeMenu() {
    const mm = $('menuModal');
    if (mm) mm.style.display = 'none';
  }

  function copyToClipboard() {
    if (!editor.value) return;
    copyText(editor.value, 'celý kód');
  }

  // ── Hledání v kódu + zkratky Ctrl+F / Z / Y → cncSearch.js ───
  const { openSearch, closeSearch, doSearch } = wireSearch({ editor, searchBar, searchInput, searchCountEl, lineH, syncScroll, undo: () => performUndo(), redo: () => performRedo() });
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

  // Přepočet G90 ↔ G91 → gcodeCoordConvert.js (společný pro CAM i CNC Editor; tady zhuštěně: G90/G91 jen při změně).
  function codeToAbsolute(code) { return toAbsolute(code, getParamContext(), { compact: true }); }
  function codeToIncremental(code) { return toIncremental(code, getParamContext(), { compact: true }); }

  // Jedno tlačítko G90/G91 – přepne režim a přepočítá souřadnice v editoru.
  function toggleCoordMode() {
    captureUndoSnapshot(coordMode === 'abs' ? 'Převod na G91' : 'Převod na G90');
    editor.value = coordMode === 'abs'
      ? codeToIncremental(editor.value)
      : codeToAbsolute(editor.value);
    coordMode = coordMode === 'abs' ? 'inc' : 'abs';
    onInput();
    updateModeBtn();
  }

  // ── Poznámky za středníkem: zkrátit / vrátit ───────────────
  // Středník uvnitř uvozovek (MSG("a;b")) komentář nezačíná. Řádky tvořené jen
  // poznámkou a prázdné řádky se při zkrácení vypustí; zpět se vrací podle pořadí řádků.
  let commentState = null; // { file, stripped, lines: [{ text, kept, comment }] }
  function splitComment(line) {
    let q = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') q = !q;
      else if (line[i] === ';' && !q) return i;
    }
    return -1;
  }
  function toggleComments() {
    const cs = commentState;
    if (cs && cs.file === currentFile) {
      const cur = editor.value.split('\n');
      const keptCnt = cs.lines.filter(l => l.kept).length;
      if (cur.length !== keptCnt) {
        commentState = null;
        showToast('Po zkrácení se změnil počet řádků – poznámky nelze vrátit');
        return;
      }
      captureUndoSnapshot('Vrácení poznámek');
      let k = 0;
      editor.value = cs.lines.map(l => l.kept ? cur[k++] + l.comment : l.text).join('\n');
      commentState = null;
      onInput();
      return;
    }
    const lines = editor.value.split('\n').map(text => {
      if (!text.trim()) return { text, kept: false, comment: '' }; // prázdný řádek
      const i = MARKER_RE.test(text) ? -1 : splitComment(text);   // značka kontury/polotovaru zůstává celá
      if (i < 0) return { text, kept: true, comment: '' };
      const code = text.slice(0, i).replace(/[ \t]+$/, '');
      if (!code.trim()) return { text, kept: false, comment: '' };
      return { text: code, kept: true, comment: text.slice(code.length) };
    });
    if (!lines.some(l => !l.kept || l.comment)) { showToast('Kód neobsahuje žádné poznámky'); return; }
    captureUndoSnapshot('Zkrácení kódu');
    const stripped = lines.filter(l => l.kept).map(l => l.text).join('\n');
    editor.value = stripped;
    commentState = { file: currentFile, stripped, lines };
    onInput();
  }

  // ── Renumbering ───────────────────────────────────────────
  function performRenumbering(start, step) {
    codeBeforeRenum = editor.value;
    captureUndoSnapshot('Přečíslování N');
    editor.value = renumberLines(editor.value.split('\n'), start, step).join('\n');
    onInput();
  }

  // ── Editor input handler ───────────────────────────────────
  function onInput(ev) {
    programs[currentFile] = autoCompleteMotionG(editor, ev);   // Enter: doplní G0/G1 (gcodeAutoMotion.js)
    updateEntryMode();
    updateInfo();
    // Historie se počítá i z aktuálního textu (velikost smazání) → po změně překreslit.
    if (sidebarEl.classList.contains('open')) renderHistoryList();
    if (rafHL) cancelAnimationFrame(rafHL);
    rafHL = requestAnimationFrame(refreshVisual);
    scheduleValidation();
    clearTimeout(tSave);
    tSave = setTimeout(persist, 2000);
  }

  // ── Kontura × polotovar (přepínač dole) ──────────────────────
  // Co se zrovna zadává, určuje poloha kurzoru: za posledním `STOCK_START`, který
  // ještě nebyl uzavřen `STOCK_END`, je polotovar. Tlačítko vloží příslušnou
  // značku (stejné, jaké píše export a čte kreslicí parser).
  function caretInStock() { return inStockAt(editor.value, editor.selectionStart); }
  function updateEntryMode() { syncQuickKeys(root, editor); }   // ✎K/✎P a G90/G91 v liště
  /** Vloží blok textu na kurzor, na vlastní řádek (bez auto-mezery quickbaru). */
  // newLine: za vložený řádek „Enter" – kurzor na nový prázdný řádek hned pod ním (psát dál; ⌒ / ∠ z něj navážou
  // na vložený prvek, i tečně). Na prázdném řádku se text vloží přímo do něj (řetězení oken bez mezer).
  function insertLines(text, label = 'Značka', detail = /STOCK_END/.test(text) ? 'konec polotovaru' : 'polotovar', { newLine = false } = {}) {
    editor.readOnly = false;
    const s = editor.selectionStart, e = editor.selectionEnd, v = editor.value;
    const scrollTop = editor.scrollTop, scrollLeft = editor.scrollLeft;
    const lead = s > 0 && v[s - 1] !== '\n' ? '\n' : '';
    // Na konci řádku se použije jeho stávající zalomení – dřív tu vznikal prázdný řádek navíc.
    const atLineEnd = v[e] === '\n';
    const ins = lead + text + (atLineEnd && !newLine ? '' : '\n');
    captureUndoSnapshot(label, detail);
    editor.value = v.slice(0, s) + ins + v.slice(e);
    editor.selectionStart = editor.selectionEnd = s + ins.length + (!newLine && atLineEnd ? 1 : 0);
    editor.scrollTop = scrollTop; editor.scrollLeft = scrollLeft;
    editor.focus({ preventScroll: true });
    onInput();
  }
  function toggleEntryMode() {
    applyStockToggle(editor, captureUndoSnapshot, onInput);   // párování značek: cncStockMarkers.js
  }

  // ── Bod z plátna ─────────────────────────────────────────────
  // Editor se na chvíli zavře (text i poloha kurzoru se uloží), plátno čeká na
  // jeden klik, pak se editor otevře znovu a souřadnice se vypíšou na kurzor.
  function startCanvasPick() {
    programs[currentFile] = editor.value;
    persist();
    const keep = { code: editor.value, pos: editor.selectionStart ?? editor.value.length };
    pickSuspended = true;
    overlay.remove();
    const picker = createCanvasPicker();
    const back = document.createElement('button');
    back.className = 'cne-pick-cancel';
    back.textContent = '↩ Zpět do editoru';
    document.body.appendChild(back);
    const reopen = (ins) => {
      back.remove();
      document.removeEventListener('keydown', onEsc);
      openCncEditor(keep.code, { drawOnClose, baseline: baselineCode, caret: keep.pos, insert: ins, highlight: hlLabels });
    };
    const onEsc = (e) => { if (e.key === 'Escape') { picker.cancel(); reopen(null); } };
    document.addEventListener('keydown', onEsc);
    back.addEventListener('click', () => { picker.cancel(); reopen(null); });
    picker.pick((wx, wy) => {
      const fmt = bridge.formatAbsCoord ? bridge.formatAbsCoord(wx, wy) : `X${wy.toFixed(3)} Z${wx.toFixed(3)}`;
      // bez zbytečných nul (Z255.100 → Z255.1), stejně jako zhuštěný zápis
      reopen(fmt.replace(/([XZ])(-?\d+\.\d+)/g, (_, a, n) => a + String(Number(n))));
    }, { hint: 'Klikněte na plátno – chytá koncové body a průsečíky, souřadnice se vloží do editoru', forceSnap: true });
  }

  // ── Systémová klávesnice telefonu ────────────────────────────
  // Na dotykovém zařízení se klávesnice sama NEotvírá – ani klepnutím do textu
  // (jen posune kurzor), ani tlačítky spodní lišty. Zapíná/vypíná ji jen ⌨.
  const touchUI = window.matchMedia('(max-width: 600px), (pointer: coarse)').matches;
  let kbOn = !touchUI;
  function applyKeyboardMode() {
    if (!touchUI) return;
    editor.setAttribute('inputmode', kbOn ? 'text' : 'none');
    overlay.querySelectorAll('[data-act="keyboard"]').forEach(b => b.classList.toggle('on', kbOn));
  }
  function toggleKeyboard() {
    if (!touchUI) { editor.focus(); return; }
    kbOn = !kbOn;
    applyKeyboardMode();
    // Nový inputmode se projeví až při dalším fokusu.
    editor.blur();
    editor.focus({ preventScroll: true });
  }

  // ── Velikost písma (A− / A+) ─────────────────────────────────
  let fontSize = Number(storageLoad(STORAGE_FONT)) || 0;   // 0 = výchozí z CSS
  function applyFontSize() {
    root.classList.toggle('cne-fs-custom', fontSize > 0);
    if (fontSize > 0) root.style.setProperty('--cne-fs', fontSize + 'px');
    syncScroll();
  }
  function changeFontSize(d) {
    const cur = fontSize || parseFloat(getComputedStyle(editor).fontSize) || 13;
    fontSize = Math.max(FS_MIN, Math.min(FS_MAX, Math.round(cur) + d));
    storageSave(STORAGE_FONT, fontSize);
    applyFontSize();
    showToast(`Velikost textu ${fontSize} px`);
  }

  // ── Vymazat editor (pravý panel) ─────────────────────────────
  function clearEditor() {
    if (!editor.value) return;
    captureUndoSnapshot('Vymazání editoru');
    editor.value = '';
    onInput();
    showToast('Editor vymazán – ◀ Zpět ho vrátí');
  }

  // ── G90 / G91 na začátek řádku ───────────────────────────────
  // Jen zapíše značku do řádku s kurzorem (už-li tam G90/G91 je, přepíše ji);
  // souřadnice nepřepočítává – to dělá tlačítko G90/G91 v horní liště.
  function setLineG(g) {
    const v = editor.value, pos = editor.selectionStart ?? 0;
    const ls = v.lastIndexOf('\n', pos - 1) + 1;
    let le = v.indexOf('\n', pos); if (le < 0) le = v.length;
    const line = v.slice(ls, le);
    let nl;
    if (/\bG9[01]\b/i.test(line)) nl = line.replace(/\bG9[01]\b/i, g);
    else {
      const pre = (line.match(/^\s*N\d+\s*/i) || line.match(/^\s*/))[0];
      const rest = line.slice(pre.length);
      nl = pre + g + ' ' + rest;
    }
    if (nl === line) return;
    const scrollTop = editor.scrollTop, scrollLeft = editor.scrollLeft;
    captureUndoSnapshot('Vloženo', g);
    editor.value = v.slice(0, ls) + nl + v.slice(le);
    editor.selectionStart = editor.selectionEnd = Math.max(ls, pos + nl.length - line.length);
    editor.scrollTop = scrollTop; editor.scrollLeft = scrollLeft;
    editor.focus({ preventScroll: true });
    onInput();
  }

  // ── Kreslení: údaje k řádku, náhled, úsečka úhlem, průsečíky ──
  // Výpočty v cncDrawTools.js (čisté funkce, testy), tady jen napojení na UI.
  const infoTextEl = $('infoText');
  const previewEl = $('preview');
  const angleModal = $('angleModal');
  const isectListEl = $('isectList');
  let anCache = { code: null, an: null };
  function drawOpts() {
    return { diam: state.xDisplayMode === 'diameter', karusel: state.machineType === 'karusel', flip: state.flipX !== state.flipZ, flipX: !!state.flipX, flipZ: !!state.flipZ };
  }
  function analysis() {
    if (anCache.code !== editor.value) anCache = { code: editor.value, an: analyzeDrawCode(editor.value, drawOpts()) };
    return anCache.an;
  }
  function caretLine() { return editor.value.slice(0, editor.selectionStart ?? 0).split('\n').length - 1; }
  const live = drawOnClose ? setupLiveView(overlay, { analysis, caretLine }) : null;   // ⇕ zmenšený editor nad plátnem
  let tInfo = null;
  // Nápověda k zápisu: vysvětlí slova na řádku s kurzorem a poradí, co dopsat.
  const hintEl = $('hintText');
  const infoBodyEl = $('infoBody'), helpModal = $('helpModal');
  // Hledání v nápovědě: všechna slova dotazu musí být v položce (nebo v nadpisu sekce), bez ohledu na diakritiku.
  const helpSearchEl = $('helpSearch');
  const helpNorm = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function filterHelp() {
    if (!helpSearchEl) return;
    const body = helpModal.querySelector('.cne-help-body');
    const words = helpNorm(helpSearchEl.value).split(/\s+/).filter(Boolean);
    const quick = body.querySelector('.cne-help-quick'), none = body.querySelector('.cne-help-none');
    if (quick) quick.hidden = words.length > 0;
    let shown = 0;
    body.querySelectorAll('.cne-help-sec').forEach(sec => {
      const head = helpNorm(sec.querySelector('h4').textContent);
      let any = false;
      sec.querySelectorAll('.cne-help-item').forEach(it => {
        if (it.dataset.n === undefined) it.dataset.n = helpNorm(it.textContent);
        const ok = !words.length || words.every(w => it.dataset.n.includes(w) || head.includes(w));
        it.hidden = !ok;
        if (ok) any = true;
      });
      sec.hidden = !any;
      if (any) shown++;
    });
    if (none) none.hidden = shown > 0;
    body.scrollTop = 0;
  }
  if (helpSearchEl) helpSearchEl.addEventListener('input', filterHelp);
  function setInfoOpen(on) {
    if (!infoBodyEl) return;
    infoBodyEl.hidden = !on;
    const t = $('infoToggle'); if (t) t.textContent = (on ? '▾' : '▸') + ' Údaje a nápověda';
    storageSave(STORAGE_INFO, !!on);
    syncScroll();
  }
  if (infoBodyEl) setInfoOpen(storageLoad(STORAGE_INFO) === true);
  let keyHint = null;   // popis právě stisknuté klávesy (přebije nápovědu k řádku na pár sekund)
  let tKeyHint = null;
  function renderHint(an, ln) {
    if (!hintEl) return;
    if (keyHint) { hintEl.innerHTML = `<b>${esc(keyHint.k)}</b> ${esc(keyHint.t)}`; return; }
    const v = editor.value, pos = editor.selectionStart ?? 0;
    const ls = v.lastIndexOf('\n', pos - 1) + 1;
    let le = v.indexOf('\n', pos); if (le < 0) le = v.length;
    const h = lineHint(v.slice(ls, le), pos - ls, { diam: state.xDisplayMode === 'diameter', hasPrevMove: !!moveAtOrBefore(an, ln - 1) });
    const chips = h.items.map(i => `<span class="${i.cur ? 'cur' : ''}"><b>${esc(i.k)}</b> ${esc(i.t)}</span>`);
    const parts = [errMarks.msgHTML(ln), ...(h.comment ? [`<span>${esc(h.comment)}</span>`] : chips)].filter(Boolean);
    if (h.tip) parts.push(`<span class="tip">💡 ${esc(h.tip)}</span>`);
    hintEl.innerHTML = parts.join('');
  }
  /** Po stisku klávesy ukáže její popis (na dotyku nejsou tooltipy). */
  function showKeyHint(btn) {
    const t = btn.getAttribute('title');
    if (!t || !hintEl) return;
    const i = t.search(/\s[–-]\s/);
    keyHint = i > 0 ? { k: t.slice(0, i), t: t.slice(i + 3) } : { k: btn.textContent.trim(), t };
    clearTimeout(tKeyHint);
    tKeyHint = setTimeout(() => { keyHint = null; updateInfo(); }, 4000);
  }
  function updateInfo() {
    if (!infoTextEl) return;
    clearTimeout(tInfo);
    tInfo = setTimeout(() => {
      const an = analysis(), ln = caretLine();
      renderHint(an, ln);
      const mv = an.byLine.get(ln);
      // Každý údaj zvlášť (nelámat „střed X… Z…" uprostřed), mezi nimi zalomit lze.
      const badExpr = an.bad.get(ln);
      if (badExpr) infoTextEl.innerHTML = `<span>⚠ ${esc(badExpr)}</span>` + (mv ? ' · ' + moveInfo(mv, an).map(t => `<span>${esc(t)}</span>`).join(' · ') : '');
      else if (mv) infoTextEl.innerHTML = moveInfo(mv, an).map(t => `<span>${esc(t)}</span>`).join(' · ');
      else {
        const p = moveAtOrBefore(an, ln);
        infoTextEl.textContent = p ? `Řádek bez pohybu · poloha X${f3(p.to.x * an.xs)} Z${f3(p.to.z)}` : 'Řádek bez pohybu';
      }
      if (previewEl && !previewEl.hidden) drawPreview(previewEl, an, { curLine: ln, flipX: state.flipX, flipZ: state.flipZ });
      live?.update(an, ln);
    }, 30);
  }
  function setPreview(on) {
    if (!previewEl) return;
    previewEl.hidden = !on;
    storageSave(STORAGE_PREVIEW, !!on);
    const lb = $('previewLabel');
    if (lb) lb.textContent = on ? 'Skrýt náhled kontury' : 'Náhled kontury';
    syncScroll();
    updateInfo();
  }

  // Úsečka úhlem: z konce řádku s kurzorem (nebo poslední polohy před ním).
  let angleFrom = null, angleLineIdx = 0, anglePrevDir = null, angPrevArc = false;   // angPrevArc: předchozí je oblouk → nabídnout „Tečně"
  // angIncr: v místě kurzoru platí G91 → zapsat přírůstky; angMode polární / od předchozí; angSide vlevo (+) / vpravo (−)
  let angIncr = false, angMode = 'polar', angSide = 1, angRelOk = false, angRelWhy = '';
  // „Od předchozí" a „Tečně" jen když předchozí pohyb má směr: G1 nebo oblouk G2/G3 ve
  // stejné části kódu (kontura / polotovar). Po G0, na prvním řádku a po nulovém pohybu jen polární.
  function syncAngleUi() {
    if (!angRelOk) angMode = 'polar';
    angleModal.querySelectorAll('[data-act="angMode"]').forEach(b => b.classList.toggle('on', b.dataset.mode === angMode));
    angleModal.querySelectorAll('[data-act="angSide"]').forEach(b => b.classList.toggle('on', Number(b.dataset.side) === angSide));
    $('angModeRow').hidden = !angRelOk; $('angTangentBtn').hidden = !(angRelOk && angPrevArc); $('angRelBtn').hidden = angPrevArc;   // za obloukem jen Polární + Tečně
    $('angCompass').hidden = angMode === 'rel'; const tangent = angPrevArc && angMode === 'rel'; $('angTangentBtn').classList.toggle('on', tangent); $('angA').readOnly = tangent; $('angSideRow').hidden = !(angRelOk && angMode === 'rel' && !angPrevArc);   // ✛ jen u polárního úhlu; tečně = odklon pevně 0°
    $('angLabel').textContent = tangent ? 'Tečně °' : angMode === 'rel' ? 'Odklon °' : 'Úhel °';
    $('angSmall').textContent = angMode === 'rel'
      ? (tangent ? `(tečna na konci oblouku – směr ${dirLabel(anglePrevDir, angleView(state), f3)})` : `(od předchozího směru ${f3(anglePrevDir)}°; 0 = rovně dál, 90 = kolmo)`)
      : polarHint(angleView(state)) + (angRelWhy ? ' – ' + angRelWhy : '');
    angleModal.dispatchEvent(new Event('input'));
  }
  // ── Sražení úhel × délka (výpočet v cncJoin.js: chamferByAngle) ──
  const chfModal = $('chfModal');
  let chfAlong = 'first', chfLine = 0;
  function chfResult() {
    const val = k => { const t = $(k).value.trim(); if (!t) return null; const n = safeEvalMath(t); return isFinite(n) ? n : NaN; };
    const L = val('chfL'), A = val('chfA');
    if (L === null || A === null) return { err: '' };
    if (Number.isNaN(L) || Number.isNaN(A)) return { err: 'Neplatné číslo.' };
    return chamferByAngle(editor.value, chfLine, L, A, chfAlong, drawOpts());
  }
  function syncChf() {
    chfModal.querySelectorAll('[data-act="chfAlong"]').forEach(b => b.classList.toggle('on', b.dataset.along === chfAlong));
    const r = chfResult(), xs = analysis().xs;
    $('chfRes').textContent = r.err !== undefined ? (r.err ? '⚠ ' + r.err : '')
      : `→ zkrátit na X${f3(r.a.x * xs)} Z${f3(r.a.z)}, pak G1 X${f3(r.b.x * xs)} Z${f3(r.b.z)}`;
  }
  function openChamferAngle() {
    chfLine = caretLine();
    const an = analysis(), mv = an.byLine.get(chfLine);
    $('chfFrom').textContent = mv && mv.g === 1
      ? `Roh na konci řádku ${chfLine + 1}: X${f3(mv.to.x * an.xs)} Z${f3(mv.to.z)}`
      : '⚠ Kurzor dejte na první ze dvou navazujících úseček (G1).';
    $('chfL').value = '';
    chfModal.style.display = 'flex';
    syncChf();
  }
  function confirmChamferAngle() {
    const r = chfResult();
    if (r.err !== undefined) { $('chfRes').textContent = '⚠ ' + (r.err || 'Zadejte délku a úhel.'); return; }
    chfModal.style.display = 'none';
    const scrollTop = editor.scrollTop, scrollLeft = editor.scrollLeft;
    captureUndoSnapshot('Sražení úhel × délka', $('chfL').value + '×' + $('chfA').value + '°');
    editor.value = r.code;
    const ls = r.code.split(String.fromCharCode(10));
    let pos = 0; for (let i = 0; i <= r.line; i++) pos += ls[i].length + (i < r.line ? 1 : 0);
    editor.selectionStart = editor.selectionEnd = pos;
    editor.scrollTop = scrollTop; editor.scrollLeft = scrollLeft;
    editor.focus({ preventScroll: true });
    onInput();
    showToast('Sražení vloženo ✓');
  }
  if (chfModal) chfModal.addEventListener('input', syncChf);

  // Jedno tlačítko ⌒∩ u kurzoru: sražení/zaoblení na řádku → dráha, jinak spojení úseček v průsečíku.
  function cornerOrJoin() {
    const ln = caretLine();
    const cv = convertCornersToPaths(editor.value, ln);
    if (cv.converted > 0) {
      const scrollTop = editor.scrollTop, scrollLeft = editor.scrollLeft, pos = editor.selectionStart;
      captureUndoSnapshot('Převod sražení/zaoblení');
      editor.value = cv.code;
      editor.selectionStart = editor.selectionEnd = Math.min(pos, editor.value.length);
      editor.scrollTop = scrollTop; editor.scrollLeft = scrollLeft;
      editor.focus({ preventScroll: true });
      onInput();
      showToast('Sražení/zaoblení převedeno na G-kód dráhu ✓');
      return;
    }
    if (cv.skipped > 0) { showToast('⚠ Nepodařilo se převést – zkontrolujte okolní G1 úsečky'); return; }
    const gen = joinAtIntersection(editor.value, ln, drawOpts());
    if (gen.err && /^Kurzor dejte/.test(gen.err)) {
      showToast('Kurzor dejte na řádek se sražením/zaoblením, nebo na druhou ze dvou úseček ke spojení v průsečíku');
      return;
    }
    joinLines();
  }
  // Spojit dvě úsečky v průsečíku (výpočet v cncDrawTools.js: joinAtIntersection).
  function joinLines() {
    const res = joinAtIntersection(editor.value, caretLine(), drawOpts());
    if (res.err) { showToast('⚠ ' + res.err); return; }
    const scrollTop = editor.scrollTop, scrollLeft = editor.scrollLeft;
    captureUndoSnapshot('Spojení v průsečíku', `X${f3(res.point.x * analysis().xs)} Z${f3(res.point.z)}`);
    editor.value = res.code;
    const ls = res.code.split('\n');
    let pos = 0; for (let i = 0; i <= res.line; i++) pos += ls[i].length + (i < res.line ? 1 : 0);
    editor.selectionStart = editor.selectionEnd = pos;
    editor.scrollTop = scrollTop; editor.scrollLeft = scrollLeft;
    editor.focus({ preventScroll: true });
    onInput();
    showToast(`Spojeno v průsečíku X${f3(res.point.x * analysis().xs)} Z${f3(res.point.z)} ✓`);
  }
  function openAngleLine() {
    const an = analysis();
    angleLineIdx = caretLine();
    let p = moveAtOrBefore(an, angleLineIdx);
    // Pohyb z jiné části kódu (kontura × polotovar) není „předchozí" – začíná se od počátku.
    if (p && !!p.stock !== caretInStock()) p = null;
    angleFrom = p ? p.to : { z: 0, x: 0 };
    anglePrevDir = null; angRelWhy = ''; angPrevArc = !!p && (p.g === 2 || p.g === 3); if (angPrevArc) angMode = 'polar';   // „Od předchozí" z minula za obloukem neplatí
    if (!p) angRelWhy = 'předchozí úsečka tu není';
    else if (p.g === 0) angRelWhy = 'předchozí je rychloposuv G0 (start)';
    else {
      anglePrevDir = moveDirDeg(p, an);
      if (anglePrevDir === null) angRelWhy = 'předchozí pohyb nemá směr';
    }
    angRelOk = anglePrevDir !== null;
    angIncr = modeAtLine(editor.value, angleLineIdx) === 91;
    $('angleFrom').textContent = `Z bodu X${f3(angleFrom.x * an.xs)} Z${f3(angleFrom.z)}` + (p ? ` (konec řádku ${p.line + 1})` : ' (počátek)');
    ['angA', 'angL', 'angX', 'angZ'].forEach(k => { $(k).value = ''; });
    syncAngleUi();
    $('angRes').textContent = '';
    angleModal.style.display = 'flex';
  }
  function angleResult() {
    const val = k => { const s = $(k).value.trim(); if (!s) return null; const n = safeEvalMath(s); return isFinite(n) ? n : NaN; };
    const A = val('angA');
    if (A === null || Number.isNaN(A)) return { err: 'Zadejte úhel.' };
    for (const k of ['angL', 'angX', 'angZ']) if (Number.isNaN(val(k))) return { err: 'Neplatné číslo.' };
    const rel = angMode === 'rel';
    if (rel && anglePrevDir === null) return { err: 'Není předchozí úsečka – použijte Polární.' };
    const vw = angleView(state), abs = rel ? relToDialog(anglePrevDir, angSide, A, vw) : polarInputToDialog(A, vw);   // karusel: polární od →, odklon podle obrazovky
    const xs = analysis().xs;
    const res = angleLineEnd(angleFrom, abs, { L: val('angL'), X: val('angX'), Z: val('angZ') }, xs);
    if (res.err) return { err: res.err };
    // V G91 se zapisují přírůstky od začátku úsečky, ne absolutní polohy.
    const out = angIncr ? { x: res.x - angleFrom.x * xs, z: res.z - angleFrom.z } : res;
    // Osa, ve které se nic nepohne (souřadnice shodná s předchozím bodem), se nepíše.
    const wx = f3(res.x - angleFrom.x * xs) !== '0', wz = f3(res.z - angleFrom.z) !== '0';
    if (!wx && !wz) return { err: 'Úsečka by měla nulovou délku (stejný bod jako předchozí).' };
    return { A, abs, rel, inc: angIncr, wx, wz, ...out };
  }
  const g1Text = r => 'G1' + (r.wx ? ' X' + f3(r.x) : '') + (r.wz ? ' Z' + f3(r.z) : '');
  function confirmAngle() {
    const r = angleResult();
    if (r.err) { $('angRes').textContent = '⚠ ' + r.err; return; }
    angleModal.style.display = 'none';
    // Nový řádek hned za řádek, ze kterého úsečka vychází.
    const v = editor.value;
    let pos = 0;
    v.split('\n').slice(0, angleLineIdx + 1).forEach(l => { pos += l.length + 1; });
    editor.selectionStart = editor.selectionEnd = Math.max(0, Math.min(v.length, pos - 1));
    insertLines(`${g1Text(r)} ; ${r.rel && angPrevArc ? '⟿ tečně' : '∠' + f3(r.A) + (r.rel ? '° od předchozí' : '°')}`, 'Úsečka úhlem', `∠${f3(r.abs)}°`, { newLine: true });
  }
  if (angleModal) {
    angleModal.addEventListener('input', () => {
      const r = angleResult();
      $('angRes').textContent = r.err ? '' : `→ ${g1Text(r)}` + (r.inc ? ' (G91 – přírůstky)' : '') + (r.rel ? `  (směr ${dirLabel(r.abs, angleView(state), f3)})` : '');
    });
    angleModal.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmAngle(); } });
    closeOnBackdropClick(angleModal, () => { angleModal.style.display = 'none'; }); wireAngleCompass($('angCompass'), $('angA'), angleModal, () => angleView(state));
  }
  const arcModal = createArcModal({ $, editor, getOpts: drawOpts, caretLine, insertLines, closeOnBackdropClick });   // ⌒ Oblouk (cncArcModal.js)

  function copyText(t, what) {
    if (!t) return;
    // navigator.clipboard chybí mimo HTTPS / ve starších WebView – `?.` by vrátilo
    // undefined a `.then` spadlo; bez schránky jen oznámit.
    if (!navigator.clipboard?.writeText) { showToast('Schránka není v tomto prohlížeči dostupná'); return; }
    navigator.clipboard.writeText(t).then(() => showToast(`Zkopírováno: ${what}`)).catch(() => showToast('Kopírování se nepovedlo'));
  }
  function copyCaretLine() { copyText(editor.value.split('\n')[caretLine()].trim(), 'řádek'); }
  function copyCaretCoord() {
    const an = analysis(), p = moveAtOrBefore(an, caretLine());
    if (!p) { showToast('Na řádku ani před ním není žádný bod'); return; }
    copyText(`X${f3(p.to.x * an.xs)} Z${f3(p.to.z)}`, `X${f3(p.to.x * an.xs)} Z${f3(p.to.z)}`);
  }

  // Průsečíky z plátna – klik vloží souřadnici na kurzor.
  function renderIntersections() {
    if (!isectListEl) return;
    const list = shownIntersections().map(p => {
      const fmt = bridge.formatAbsCoord ? bridge.formatAbsCoord(p.x, p.y) : `X${p.y.toFixed(3)} Z${p.x.toFixed(3)}`;
      return fmt.replace(/([XZ])(-?\d+\.\d+)/g, (_, a, n) => a + String(Number(n)));
    });
    isectListEl.innerHTML = list.length
      ? list.map((t, i) => `<button class="cne-isect" data-isect="${esc(t)}" title="Vložit na kurzor"><b>P${i + 1}</b> ${esc(t)}</button>`).join('')
      : '<div class="cne-fi-empty">Na plátně nejsou průsečíky</div>';
  }

  // G90/G91 jen pro označené řádky (bez výběru se převádí celý kód).
  function convertSelectionMode() {
    const v = editor.value, s = editor.selectionStart, e = editor.selectionEnd;
    const first = v.slice(0, s).split('\n').length - 1;
    const last = v.slice(0, Math.max(s, e - 1)).split('\n').length - 1;
    const mv = analysis().moves.find(m => m.line >= first && m.line <= last);
    if (!mv) { showToast('Ve výběru není žádný pohyb'); return; }
    const target = mv.mode === 91 ? 90 : 91;
    const r = convertLinesMode(v, first, last, target, drawOpts());
    if (!r.changed) return;
    captureUndoSnapshot(`Převod výběru na G${target}`);
    editor.value = r.code;
    onInput();
    showToast(`Převedeno ${r.changed} ř. na G${target}`);
  }

  // ── Boční panely: vlevo soubory, vpravo nástroje editoru ─────
  const sidebarRightEl = $('sidebarRight');
  function toggleSidePanel(el) {
    if (!el) return;
    const open = !el.classList.contains('open');
    sidebarEl.classList.remove('open');
    sidebarRightEl?.classList.remove('open');
    el.classList.toggle('open', open);
    if (open && el === sidebarEl) renderHistoryList();
    root.querySelectorAll('[data-act="sidebar"]').forEach(b => b.classList.toggle('open', sidebarEl.classList.contains('open')));
    root.querySelectorAll('[data-act="sidebarRight"]').forEach(b => b.classList.toggle('open', !!sidebarRightEl?.classList.contains('open')));
    // Klávesnice quickbaru se přes otevřený panel nepotřebuje – ať má panel i ten prostor.
    if (quickbar) quickbar.classList.toggle('cne-hidden-by-sidebar', open);
  }

  // ── Zpět / Vpřed (šipky v oranžové liště) ───────────────────
  // Vlastní historie místo nativního textarea undo: přímé přiřazení
  // editor.value (quickbar, hlavička, přečíslování…) prohlížeči nativní
  // undo zásobník stejně zahodí, takže by fungoval nespolehlivě.
  // Každý záznam = stav PŘED změnou + popis té změny (label, detail, čas) –
  // z nich se skládá seznam „Historie" v levém panelu.
  function updateUndoRedoButtons() {
    if (undoArrowBtn) undoArrowBtn.disabled = !undoStack.length;
    if (redoArrowBtn) redoArrowBtn.disabled = !redoStack.length;
    renderHistoryList();
  }

  // Druh úpravy z nativního psaní do textarey (beforeinput).
  function inputLabel(ev) {
    const t = ev.inputType || '';
    if (t === 'insertFromPaste' || t === 'insertFromDrop') return ['Vloženo ze schránky', ''];
    if (t === 'deleteByCut') return ['Vyjmuto', ''];
    if (t.startsWith('delete')) return ['Mazání', ''];
    if (t === 'insertLineBreak' || t === 'insertParagraph') return ['Psaní', '↵'];
    if (t === 'historyUndo' || t === 'historyRedo') return ['Úprava', ''];
    return ['Psaní', ev.data || ''];
  }

  function captureUndoSnapshot(label = 'Úprava', detail = '') {
    if (label && typeof label === 'object') [label, detail] = inputLabel(label);
    clearTimeout(undoGroupTimer);
    const top = undoStack[undoStack.length - 1];
    // Shluk rychle po sobě jdoucích úprav STEJNÉHO druhu = jeden krok; jiný druh = nový krok.
    if (undoGroupOpen && top && top.label === label) {
      if (detail) top.detail = ((top.detail || '') + detail).slice(-40);
    } else {
      undoStack.push({ value: editor.value, sel: editor.selectionEnd, label, detail: detail.slice(-40), t: Date.now() });
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
    if (entry.restoreFile) { restoreDeletedFile(entry); return; }
    redoStack.push({ value: editor.value, sel: editor.selectionEnd, label: entry.label, detail: entry.detail, t: entry.t });
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
    undoStack.push({ value: editor.value, sel: editor.selectionEnd, label: entry.label, detail: entry.detail, t: entry.t });
    editor.value = entry.value;
    editor.selectionStart = editor.selectionEnd = entry.sel;
    undoGroupOpen = false;
    onInput();
    editor.focus({ preventScroll: true });
    updateUndoRedoButtons();
  }

  // ── Historie změn (levý panel) ──────────────────────────────
  // Nahoře kroky „Vpřed" (šedě), pak aktuální stav, pod ním kroky „Zpět" od
  // nejnovější. Klik = vrátit se do stavu PŘED tou změnou (resp. zopakovat ji).
  const histListEl = $('histList');
  // V seznamu jsou jen VĚTŠÍ změny (smazání většího kusu, nový obrázek z plátna,
  // převody, zkrácení…); drobné psaní/mazání vrací šipky ◀ ▶ krok po kroku.
  const MAJOR_LABELS = new Set(['Načteno z plátna', 'Vymazání editoru', 'Převod výběru na G90', 'Převod výběru na G91', 'Zkrácení kódu', 'Vrácení poznámek', 'Převod na G90',
    'Převod na G91', 'Převod sražení/zaoblení', 'Hlavička programu', 'Přečíslování N', 'Vloženo ze schránky', 'Vyjmuto']);
  function histTime(t) {
    if (!t) return '';
    const d = new Date(t);
    return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()} ` +
      d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  }
  function isMajor(e, before, after) {
    if (e.restoreFile || MAJOR_LABELS.has(e.label)) return true;
    if (e.label !== 'Mazání') return false;
    const removed = before.length - after.length;
    const lines = before.split('\n').length - after.split('\n').length;
    return removed >= 20 || lines >= 2;
  }
  function histRow(e, key, cls, icon, title) {
    const label = e.restoreFile ? `Smazán soubor ${e.restoreFile}`
      : e.label === 'Mazání' ? 'Smazání kódu' : (e.label || 'Úprava');
    return `<div class="cne-hi ${cls}" data-hist="${key}" title="${title}">
      <span class="cne-hi-ic">${icon}</span><span class="cne-hi-txt">${esc(label)}<span class="cne-hi-t">${histTime(e.t)}</span></span></div>`;
  }
  function renderHistoryList() {
    if (!histListEl) return;
    // Chronologicky: stavy u0…un-1, aktuální, pak redo od nejbližšího. Změna k vede
    // ze stavu k do k+1 – podle obou se pozná, jestli šlo o větší smazání.
    const n = undoStack.length, m = redoStack.length;
    const stateAt = k => (k < n ? undoStack[k].value : k === n ? editor.value : redoStack[m - 1 - (k - n - 1)].value) ?? '';
    const rows = [];
    for (let j = 0; j < m; j++) {               // redoStack[j] = stav po změně; nejvzdálenější nahoře
      const k = n + (m - 1 - j);                // změna ze stavu k do k+1
      if (isMajor(redoStack[j], stateAt(k), redoStack[j].value)) rows.push(histRow(redoStack[j], 'r' + j, 'future', '↪', 'Zopakovat až po tuto změnu'));
    }
    rows.push(`<div class="cne-hi current"><span class="cne-hi-ic">●</span><span class="cne-hi-txt">Aktuální stav</span></div>`);
    for (let i = n - 1; i >= 0; i--) {
      if (isMajor(undoStack[i], stateAt(i), stateAt(i + 1)))
        rows.push(histRow(undoStack[i], 'u' + i, '', '↩', 'Vrátit do stavu před touto změnou'));
    }
    if (rows.length === 1) rows.push('<div class="cne-fi-empty">Zatím žádné větší změny – drobné úpravy vrací ◀ ▶</div>');
    histListEl.innerHTML = rows.join('');
  }
  function jumpHistory(key) {
    const file = currentFile;
    if (key[0] === 'u') {
      let n = undoStack.length - parseInt(key.slice(1), 10);
      while (n-- > 0 && undoStack.length && currentFile === file) performUndo();
    } else {
      let n = redoStack.length - parseInt(key.slice(1), 10);
      while (n-- > 0 && redoStack.length) performRedo();
    }
  }

  // ══════════════════════════════════════════════════════════
  // ██  EVENT WIRING  ████████████████████████████████████████
  // ══════════════════════════════════════════════════════════
  editor.addEventListener('input', onInput);
  ['click', 'keyup', 'touchend', 'focus', 'select'].forEach(ev => editor.addEventListener(ev, () => { updateEntryMode(); updateInfo(); }));
  if (previewEl) window.addEventListener('resize', updateInfo);
  editor.addEventListener('scroll', syncScroll); wireTapBelow(editor, () => insertText('\n')); wireCommentTools(editor, root, () => insertText('\n')); wireNumpadToggle(root); wireCurrentLine(editor, backdrop); wireNumpadCalc(numModal, numInput); wireNoKeyboard(root, editor); wireLongDelete(root, editor, { snapshot: captureUndoSnapshot, after: onInput, reveal: ensureCaretVisible }); wireCaretKeys(root, editor, { snapshot: captureUndoSnapshot, after: onInput }); const errMarks = createErrMarks(editor, backdrop, root); if (drawOnClose) wireAutoRedraw(root);   // klik pod text / Enter v poznámce → nový řádek

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

  // Klepnutí mimo otevřený boční panel (do kódu, lišty…) ho zavře; tlačítka ☰
  // panel přepínají sama.
  root.addEventListener('pointerdown', e => {
    const open = [sidebarEl, sidebarRightEl].find(el => el?.classList.contains('open'));
    if (!open || open.contains(e.target)) return;
    if (e.target.closest('[data-act="sidebar"], [data-act="sidebarRight"], .cne-inner-modal')) return;
    toggleSidePanel(open);
  });

  // Delegated clicks
  root.addEventListener('click', e => {
    // Actions
    const ab = e.target.closest('[data-act]');
    if (ab) {
      switch (ab.dataset.act) {
        case 'sidebar':      toggleSidePanel(sidebarEl); break;
        case 'sidebarRight': toggleSidePanel(sidebarRightEl); break;
        case 'fontDown':  changeFontSize(-1); break;
        case 'fontUp':    changeFontSize(1); break;
        case 'clearEditor': clearEditor(); break;
        case 'lineG':     setLineG(ab.dataset.g || nextCoordG(editor)); break;
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
          if (codeBeforeRenum) { captureUndoSnapshot('Přečíslování N', 'vráceno'); editor.value = codeBeforeRenum; codeBeforeRenum = ''; onInput(); }
          $('renumModal').style.display = 'none';
          break;
        case 'convMode':
          // Editor z Kalkulaček: s označeným textem se převedou jen vybrané řádky.
          if (drawOnClose && editor.selectionStart !== editor.selectionEnd) convertSelectionMode();
          else toggleCoordMode();
          closeMenu(); break;
        case 'togglePreview': setPreview(previewEl?.hidden); break;
        case 'angleLine': openAngleLine(); break; case 'arcModal': arcModal.open(); break;
        case 'joinLines': joinLines(); break;
        case 'chfAngle': openChamferAngle(); break;
        case 'chfAlong': chfAlong = ab.dataset.along; syncChf(); break;
        case 'chfOk':    confirmChamferAngle(); break;
        case 'chfCancel': chfModal.style.display = 'none'; break;
        case 'cornerJoin': cornerOrJoin(); break;
        case 'angMode':   if (angPrevArc && angMode === 'rel') $('angA').value = ''; angMode = ab.dataset.mode; syncAngleUi(); break;   // z Tečně zpět: 0 není polární úhel
        case 'angSide':   angSide = Number(ab.dataset.side); syncAngleUi(); break;
        case 'angTangent': angMode = 'rel'; angSide = 1; $('angA').value = '0'; syncAngleUi(); break;
        case 'angleOk':   confirmAngle(); break;
        case 'angleCancel': angleModal.style.display = 'none'; break;
        case 'copyLine':  copyCaretLine(); break;
        case 'copyCoord': copyCaretCoord(); break;
        case 'header':    showHeaderSettings(); closeMenu(); break;
        case 'hdrClose':  readHeaderInputs(); persistHdr(); hdrModal.style.display = 'none'; break;
        case 'hdrApply':  applyHeader(); break;
        case 'cornersToPath': {
          const result = convertCornersToPaths(editor.value);
          if (result.converted > 0) {
            captureUndoSnapshot('Převod sražení/zaoblení');
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
        case 'toggleComments': toggleComments(); break;
        case 'keyboard':  toggleKeyboard(); break;
        case 'stockToggle': toggleEntryMode(); break;
        case 'pickFromCanvas': startCanvasPick(); break;
        case 'menu':      $('menuModal').style.display = 'flex'; break;
        case 'menuClose': $('menuModal').style.display = 'none'; break;
        case 'toCad': {
          // Přenes upravený kód zpět do CAD panelu (odkud kód pochází) a
          // vykresli konturu na canvas. CAD panel čte souřadnice absolutně,
          // takže přírůstkový režim (G91) před odesláním přepočítáme na G90.
          const expr = resolveExpressions(editor.value);
          if (expr.converted > 0) { captureUndoSnapshot('Převod výrazů na čísla'); editor.value = expr.code; onInput(); }
          const pol = polarToXZ(editor.value, drawOpts());
          if (pol.converted > 0) { captureUndoSnapshot('Převod PU/L na X Z'); editor.value = pol.code; onInput(); }
          const tan = tangentToIK(editor.value, drawOpts());
          if (tan.converted > 0) { captureUndoSnapshot('Převod tečných oblouků (T)'); editor.value = tan.code; onInput(); }
          if (coordMode === 'inc') { captureUndoSnapshot('Převod na G90'); editor.value = codeToAbsolute(editor.value); coordMode = 'abs'; onInput(); }
          // Nepřevedené sražení/zaoblení (CHF=/RND=…) by CAD parser G-kódu
          // nerozpoznal – automaticky ho převedeme na skutečnou dráhu (G1/G2/G3).
          const conv = convertCornersToPaths(editor.value);
          if (conv.converted > 0) { captureUndoSnapshot('Převod sražení/zaoblení'); editor.value = conv.code; onInput(); }
          persist();
          const code = editor.value;
          sentToCad = true;
          overlay.remove();
          if (typeof bridge.renderCncCodeToCanvas === 'function') bridge.renderCncCodeToCanvas(code);
          break;
        }
        case 'chamfer':   inputOrNumpad(getChamferPrefix()); break;
        case 'round':     inputOrNumpad(getRoundPrefix()); break;
        case 'numCancel': numModal.style.display = 'none'; break;
        case 'numOk':     confirmNumpad(); break;
        case 'valClose':  valModal.style.display = 'none'; break;
        case 'infoToggle': setInfoOpen(infoBodyEl.hidden); break;
        case 'help':      helpModal.style.display = 'flex'; break;
        case 'helpQ':     { const hs = $('helpSearch'); hs.value = ab.dataset.q; filterHelp(); if (!touchUI) hs.focus({ preventScroll: true }); break; }
        case 'helpClose': helpModal.style.display = 'none'; break;
        case 'cfgClose':  cfgModal.style.display = 'none'; persistCfg(); scheduleValidation(); break;
      }
      // Položka z pravého panelu nástrojů → panel po akci zavřít.
      // (A− / A+ ho nechají otevřený – klepe se na ně víckrát.)
      if (sidebarRightEl?.classList.contains('open') && ab.closest('.cne-sidebar-right') && !/^font/.test(ab.dataset.act)) toggleSidePanel(sidebarRightEl);
      return;
    }
    // Průsečík z pravého panelu → na kurzor
    const isb = e.target.closest('[data-isect]');
    if (isb) { toggleSidePanel(sidebarRightEl); insertText(isb.dataset.isect, 'Průsečík'); return; }
    // Insert
    const ib = e.target.closest('[data-ins]');
    if (ib) { showKeyHint(ib); insertText(ib.dataset.ins); return; }
    // Input modal
    const ip = e.target.closest('[data-inp]');
    if (ip) { showKeyHint(ip); inputOrNumpad(ip.dataset.inp); return; }
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
    // Historie změn → skok do vybraného stavu
    const hr = e.target.closest('[data-hist]');
    if (hr) { jumpHistory(hr.dataset.hist); return; }
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
  numInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmNumpad(); else if (e.key === 'Backspace') { e.preventDefault(); numInput.value = numInput.value.slice(0, -1); } });
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
      clearTimeout(tInfo);
      window.removeEventListener('resize', updateInfo);
      persist();
      obs.disconnect();
    }
  }).observe(document.body, { childList: true });

  // ── Init ───────────────────────────────────────────────────
  if (previewEl) setPreview(storageLoad(STORAGE_PREVIEW) === true);
  if (infoBodyEl) setInfoOpen(storageLoad(STORAGE_INFO) === true);
  renderIntersections();
  applyKeyboardMode();
  applyFontSize();
  ensureFile();

  // Pokud byl předán initialCode, vloží se do souboru CNC_PROGRAM.MPF.
  // Pokud na něm uživatel právě je a obsah se liší od initialCode (kontura
  // byla mezitím v CAD přegenerována), automaticky se načte aktuální kód
  // z CAD (bez dotazu – editor je jen dočasná pracovní kopie CAD kódu).
  // Je-li uživatel rozkoukaný v jiném souboru (např. po "Nový program"), editor
  // ho při návratu nepřepne pryč ani mu ten soubor nepřepíše.
  // Editor z Kalkulaček ukazuje VŽDY to, co je na plátně (i když byl předtím
  // v jiném souboru nebo v něm zůstal smazaný text) – předchozí text zůstává
  // jako krok Zpět (loadHistory).
  // Návrat z „Bod z plátna" (caret) NE: editor pokračuje v souboru, ve kterém byl
  // (uložený currentFile) – jinak by se text jiného souboru zapsal přes CNC_PROGRAM.
  if (drawOnClose && caret === null && typeof initialCode === 'string') {
    programs['CNC_PROGRAM.MPF'] = initialCode;
    currentFile = 'CNC_PROGRAM.MPF';
  }
  const onProgramFile = !programs['CNC_PROGRAM.MPF'] || currentFile === 'CNC_PROGRAM.MPF';
  if (!drawOnClose && onProgramFile && initialCode && typeof initialCode === 'string' && initialCode.trim()) {
    const name = 'CNC_PROGRAM.MPF';
    if (!programs[name] || programs[name].trim() !== initialCode.trim()) {
      programs[name] = initialCode;
      currentFile = name;
    }
  }

  displayFile(currentFile);
  renderMergeList();

  // Návrat z výběru bodu na plátně: kurzor tam, kde byl, a vypsat souřadnice.
  if (caret !== null) {
    const pos = Math.min(caret, editor.value.length);
    editor.selectionStart = editor.selectionEnd = pos;
    if (insert) {
      // Kurzor na konci řádku, který už má kód (typicky konec souboru po otevření
      // bez kliknutí do textu) → bod na nový řádek, ne k cizím souřadnicím.
      const v0 = editor.value;
      const ls0 = v0.lastIndexOf('\n', pos - 1) + 1;
      const atEol = pos >= v0.length || v0[pos] === '\n';
      const ci0 = splitComment(v0.slice(ls0, pos));
      const code0 = (ci0 >= 0 ? v0.slice(ls0, ls0 + ci0) : v0.slice(ls0, pos)).trim();
      if (atEol && code0 && /[XZ]-?\d/i.test(code0)) insertText('\n', 'Bod z plátna');
      insertText(insert, 'Bod z plátna');
      const line = editor.value.slice(0, editor.selectionStart).split('\n').length - 1;
      editor.scrollTop = Math.max(0, (line - 3) * lineH());
      syncScroll();
      if (coordMode === 'inc') showToast('Souřadnice jsou absolutní (G90)');
    }
  }
  // Otevřeno s označenými objekty z plátna → výběr a pohled na první jejich řádek.
  const oc = drawOnClose && caret === null ? openCaret(editor.value) : null;   // kurzor na nový řádek konce kontury
  let idx = -1;
  if (caret === null && hlRe) {
    idx = editor.value.split('\n').findIndex(l => { const ci = l.indexOf(';'); return ci > 0 && hlRe.test(l.substring(ci)); });
    if (idx >= 0) {
      jumpToLine(idx);
      // Jen kurzor na konec řádku (ne označený celý řádek): další zápis – třeba CHF= z klávesy Sraž. –
      // se připíše za kód řádku (insertText ho dá před komentář), místo aby řádek přepsal.
      editor.setSelectionRange(editor.selectionEnd, editor.selectionEnd);
    }
  }
  // Bez výběru (nebo vybraný je poslední prvek kontury – typicky po zavření editoru) → pokračovat v zadávání.
  if (oc && (idx < 0 || editor.value.slice(0, editor.selectionStart).split('\n').length - 1 === editor.value.slice(0, oc.pos).split('\n').length - 1)) {
    editor.selectionStart = editor.selectionEnd = oc.pos;
    if (oc.newline) insertText('\n', 'Nový řádek');
    editor.scrollTop = Math.max(0, (editor.value.slice(0, editor.selectionStart).split('\n').length - 4) * lineH()); syncScroll();
  }
  updateEntryMode();
}
