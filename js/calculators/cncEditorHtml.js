// ╔══════════════════════════════════════════════════════════════╗
// ║  CNC Editor – HTML šablony (okno, rychlá lišta, menu, kreslení) ║
// ╚══════════════════════════════════════════════════════════════╝
// Vyčleněno z cncEditor.js 10. 11. 2026 beze změny obsahu: čisté šablony,
// na stav editoru nesahají (čtou jen state.xDisplayMode a řídicí systém).

import { state } from '../state.js';
import { esc, getControlSystem, digitKeysHTML, digitPadHTML, numpadHTML } from './gcodeEditorShared.js';
import { ARC_MODAL_HTML } from './cncArcModal.js';
import { helpHTML } from './cncHints.js';

export function getControlSystemBarText(programName, fromCalc = false) {
  // Editor z Kalkulaček je na kreslení a zjišťování údajů, ne na programy –
  // místo řídicího systému ukazuje, v čem je na plátně osa X (průměr / poloměr).
  if (fromCalc) {
    const diam = state.xDisplayMode === 'diameter';
    return `CAD G-kód kreslení<span class="cne-sn-mode${diam ? ' diam' : ''}" title="Hodnoty X (i I) se zadávají jako ${diam ? 'průměr' : 'poloměr'} – podle nastavení X displej">X = ${diam ? '⌀ průměr' : 'poloměr'}</span>`;
  }
  const ctrl = getControlSystem();
  const names = { sinumerik: 'SINUMERIK', fanuc: 'FANUC', heidenhain: 'HEIDENHAIN' };
  // „kal." = editor otevřený z Kalkulaček (kreslicí) – odliší ho od ostatních dvou editorů.
  return `${names[ctrl] || names.sinumerik} (CAD${fromCalc ? ' kal.' : ''}) &mdash; ${esc(programName || '')}`;
}

// Proužek akcí s řádkem nad klávesnicí (tlačítko ≡, cncLineTools.js).
const linebarHTML = () => `<div class="cne-linebar" hidden>
    <button class="cne-qb" data-line-act="selmode" title="Výběr – šipky označují text (kotva zůstane, druhý konec jede); znovu = konec výběru">⬚ Výběr</button>
    <button class="cne-qb" data-line-act="sel" title="Označit celý řádek (nebo všechny řádky výběru)">▤ Řádek</button>
    <button class="cne-qb" data-line-act="dup" title="Kopie řádku pod něj (na počítači Alt+Shift+↓)">⧉ Kopie</button>
    <button class="cne-qb" data-line-act="up" title="Posunout řádek nahoru (Alt+↑)">⇡</button>
    <button class="cne-qb" data-line-act="down" title="Posunout řádek dolů (Alt+↓)">⇣</button>
    <button class="cne-qb del" data-line-act="del" title="Smazat celý řádek (nebo řádky výběru)">✕ ř.</button>
  </div>`;

// ── Build HTML ─────────────────────────────────────────────────
// Rychlá lišta. Kreslicí varianta (editor z Kalkulaček) má jen to, co čte kreslicí
// parser G-kódu: G, X, Z, R + G0/G1 jako velká tlačítka s popiskem.
function quickbarHTML(drawMode) {
  // X se zapisuje podle nastavení „X displej" (Radius / Průměr) – stejně jako export.
  const xWord = state.xDisplayMode === 'diameter' ? 'průměr' : 'poloměr';
  if (drawMode) return `
  <div class="cne-quickbar cne-quickbar--draw">${linebarHTML()}${digitKeysHTML()}
    <button class="cne-qb c12" data-inp="R" title="R – poloměr / parametr">R</button>
    <button class="cne-qb c12" data-inp="I" title="I &ndash; st&#345;ed oblouku (posun v X, v&#382;dy polom&#283;r)">I<small class="cne-qb-axis">(x)</small></button>
    <button class="cne-qb c12" data-inp="K" title="K &ndash; st&#345;ed oblouku (posun v Z)">K<small class="cne-qb-axis">(z)</small></button><button class="cne-qb blue c12" data-inp="G" title="G-kód – otevře číselník se seznamem G-kódů">G</button>
    <button class="cne-qb accent cne-qb-arc c12" data-act="arcModal" title="Oblouk – G2 / G3, tečné napojení, úhel rozevření"><span>⌒</span><small>oblouk</small></button>

    <button class="cne-qb accent cne-qb-big c12" data-ins="G0 " title="G0 – Rychloposuv na počáteční bod"><span>G0</span><small>start</small></button>
    <button class="cne-qb accent cne-qb-big c12" data-ins="G1 " title="G1 – Lineární interpolace (úsečka)"><span>G1</span><small>úsečka</small></button>
    <button class="cne-qb cne-qb-big c12" data-inp="X" title="Osa X (${xWord})"><span>X</span><small>${xWord}</small></button>
    <button class="cne-qb cne-qb-big c12" data-inp="Z" title="Osa Z (délka)"><span>Z</span><small>délka</small></button>
    <button class="cne-qb accent cne-qb-big c12" data-act="angleLine" title="Úsečka úhlem – polárně od osy Z, nebo od předchozí úsečky"><span>∠</span><small>úsečka</small></button>

    <button class="cne-qb cne-qb-mode c12" data-act="stockToggle" data-el="stockToggleBtn" title="Co právě zadávám: kontura (K) nebo polotovar (P). Klik vloží značku ; STOCK_START / ; STOCK_END na kurzor.">✎<b>K</b></button>
    <button class="cne-qb accent c12" data-act="chamfer" title="Sražení hrany (CHF= / C / CHF – dle řídicího systému)">Sraž.</button>
    <button class="cne-qb accent c12" data-act="round" title="Zaoblení hrany (RND= / R / RND R – dle řídicího systému)">Zaobl.</button>
    <button class="cne-qb blue c12" data-act="lineG" data-el="lineGBtn" title="Platný režim G90 / G91 – klik zapíše na řádek s kurzorem ten druhý">G90</button>
    <button class="cne-qb del c12" data-act="backspace" title="Smazat znak">⌫</button>

    <button class="cne-qb cne-qb-caret c8" data-caret="home" title="Na začátek řádku">⇤</button>
    <button class="cne-qb cne-qb-caret c8" data-caret="up" title="Kurzor o řádek nahoru (podržet = opakovat)">▲</button>
    <button class="cne-qb cne-qb-caret c8" data-caret="end" title="Na konec řádku">⇥</button>
    <button class="cne-qb gray c8" data-ins=";" title="Středník (komentář)">;</button>
    <button class="cne-qb cne-kb-btn c8" data-act="keyboard" data-el="kbBtn" title="Zobrazit / skrýt klávesnici telefonu">⌨</button>
    <button class="cne-qb green c8" data-act="pickFromCanvas" title="Zavře editor, naklikněte bod na plátně – editor se otevře a souřadnice se vypíšou na místo kurzoru">🎯</button>
    <button class="cne-qb green c12 cne-qb-enter" data-ins="\\n" title="Nový řádek">↵</button>

    <button class="cne-qb cne-qb-caret c8" data-caret="left" title="Kurzor o znak doleva (podržet = opakovat)">◀</button>
    <button class="cne-qb cne-qb-caret c8" data-caret="down" title="Kurzor o řádek dolů (podržet = opakovat)">▼</button>
    <button class="cne-qb cne-qb-caret c8" data-caret="right" title="Kurzor o znak doprava (podržet = opakovat)">▶</button>
    <button class="cne-qb cne-qb-line c8" data-line-act="bar" title="Řádek: výběr šipkami, kopie, posun nahoru / dolů, smazání">≡</button>
    <button class="cne-qb gray cne-qb-wide cne-qb-num c8" data-inp="" title="Zadat číslo">123</button>
    <button class="cne-qb gray cne-qb-wide c8" data-ins=" " title="Mezera">␣</button>
  </div>`;
  return `
  <div class="cne-quickbar">${digitPadHTML()}
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
    <button class="cne-qb red" data-act="toggleComments" title="Zkrátit kód o poznámky za středníkem a prázdné řádky – další klik je vrátí">;✂</button>
    <button class="cne-qb accent" data-ins="STOPRE" title="STOPRE – Zastavit předzpracování">STOP</button>
    <button class="cne-qb gray" data-act="copy" title="Kopírovat kód">📋</button>
    <button class="cne-qb blue" data-act="convMode" data-el="convModeBtn" title="Přepnout G90 (absolutní) / G91 (přírůstkové)">G90</button>
    <button class="cne-qb cne-kb-btn" data-act="keyboard" title="Zobrazit klávesnici">⌨</button>
  </div>`;
}

// Položky menu „Nástroje editoru" – v běžném editoru v modalu pod ⋮, v editoru
// z Kalkulaček v pravém vysouvacím panelu (☰ vpravo).
function menuItemsHTML(drawMode = false) {
  // Editor z Kalkulaček je na kreslení – místo nového programu vymazání editoru
  // a velikost textu (A− / A+).
  return (drawMode ? `
        <div class="cne-menu-item cne-fs-row"><span class="cne-mi-icon">🔠</span><span class="cne-mi-text"><b>Velikost textu</b></span>
          <button class="cne-fs-btn" data-act="fontDown" title="Zmenšit text v editoru">A−</button>
          <button class="cne-fs-btn" data-act="fontUp" title="Zvětšit text v editoru">A+</button></div>
        <button class="cne-menu-item" data-act="clearEditor"><span class="cne-mi-icon red">🗑</span><span class="cne-mi-text"><b>Vymazat editor</b><small>Smaže celý kód (◀ Zpět ho vrátí)</small></span></button>
        <button class="cne-menu-item" data-act="togglePreview"><span class="cne-mi-icon">📐</span><span class="cne-mi-text"><b data-el="previewLabel">Náhled kontury</b><small>Malý náhled nad kódem, řádek s kurzorem žlutě</small></span></button>
        <button class="cne-menu-item" data-act="chfAngle"><span class="cne-mi-icon">⌐</span><span class="cne-mi-text"><b>Sražení úhel × délka</b><small>Např. 3×30° – kurzor na 1. úsečce rohu</small></span></button>
        <button class="cne-menu-item" data-act="joinLines"><span class="cne-mi-icon">∩</span><span class="cne-mi-text"><b>Spojit v průsečíku</b><small>Dvě úsečky se oříznou v místě křížení a spojí do kontury</small></span></button>
        <button class="cne-menu-item" data-act="help"><span class="cne-mi-icon">❓</span><span class="cne-mi-text"><b>Nápověda k zápisu</b><small>Co a jak se zapisuje (G0, G1, G2, X, Z, R, I, K…)</small></span></button>
        <button class="cne-menu-item" data-act="angleLine"><span class="cne-mi-icon">∠</span><span class="cne-mi-text"><b>Úsečka úhlem</b><small>Úhel + délka / X / Z → G1</small></span></button>`
    : `
        <button class="cne-menu-item" data-act="new"><span class="cne-mi-icon green">＋</span><span class="cne-mi-text"><b>Nový program</b><small>Vytvořit nový CNC soubor</small></span></button>`) + `
        <button class="cne-menu-item" data-act="search"><span class="cne-mi-icon">🔍</span><span class="cne-mi-text"><b>Hledat v kódu</b><small>Rychlé vyhledávání textu</small></span></button>
        <button class="cne-menu-item" data-act="copy"><span class="cne-mi-icon">📋</span><span class="cne-mi-text"><b>Kopírovat</b><small>Zkopírovat kód do schránky</small></span></button>
        <button class="cne-menu-item" data-act="download"><span class="cne-mi-icon">⬇</span><span class="cne-mi-text"><b>Stáhnout</b><small>Stáhnout aktuální soubor</small></span></button>
${drawMode ? '' : `
        <button class="cne-menu-item" data-act="import"><span class="cne-mi-icon">📂</span><span class="cne-mi-text"><b>Import balíčku</b><small>Načíst soubory z balíčku</small></span></button>
        <button class="cne-menu-item" data-act="export"><span class="cne-mi-icon">📦</span><span class="cne-mi-text"><b>Export balíčku</b><small>Exportovat všechny soubory</small></span></button>`}
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
        <button class="cne-menu-item" data-act="settings"><span class="cne-mi-icon">⚙</span><span class="cne-mi-text"><b>Nastavení validace</b><small>Pravidla kontroly programu</small></span></button>`;
}

// Horní lišta editoru z Kalkulaček: ☰ soubory | ⌒ G90/G91 🔍 🔢 ✓ A− A+ | 🔄 ☰ nástroje.
function drawToolbarHTML() {
  return `
  <div class="cne-toolbar cne-toolbar--draw">
    <button class="cne-tb-btn cne-tb-sidebar" data-act="sidebar" title="Soubory, R-parametry">☰</button>
    <span class="cne-filename" data-el="filename" hidden>—</span>
    <div class="cne-toolbar-mid">
      <button class="cne-tb-btn" data-act="cornerJoin" title="Na řádku s kurzorem: převést sražení/zaoblení (CHF/RND) na skutečnou dráhu G1/G2/G3 – nebo, když je kurzor na druhé z dvou křížících se úseček (před ní G0 na její začátek), je oříznout v průsečíku a spojit do jedné kontury">🔗</button>
      <button class="cne-tb-btn cne-conv" data-el="convModeBtn" data-act="convMode" title="Přepočítat kód G90 (absolutní) ↔ G91 (přírůstkové)">G90</button>
      <button class="cne-tb-btn" data-act="search" title="Hledat v kódu (Ctrl+F)">🔍</button>
      <button class="cne-tb-btn" data-act="calc" title="Kalkulačka">🔢</button>
      <button class="cne-tb-btn cne-status" data-act="validate" data-el="statusBtn" title="Validace">●</button>
    </div>
    <button class="cne-tb-btn cne-cam-btn" data-act="toCad" title="Vykreslit v CAD (přenést úpravy)" aria-label="Vykreslit v CAD">🔄</button>
    <button class="cne-tb-btn cne-tb-sidebar" data-act="sidebarRight" title="Nástroje editoru">☰</button>
  </div>`;
}

export function buildEditorHTML(drawMode = false) {
  return `
<div class="cne-layout">
  <div class="cne-sn-bar">
    <button class="cne-sn-arrow" data-el="undoArrowBtn" data-act="editorUndo" title="Zpět (Ctrl+Z)" disabled>◀</button>
    <button class="cne-sn-arrow" data-el="redoArrowBtn" data-act="editorRedo" title="Vpřed (Ctrl+Y)" disabled>▶</button><button class="cne-sn-arrow cne-sn-numtog" data-numpadtog>123</button>${drawMode ? '<button class="cne-sn-arrow cne-sn-numtog" data-autodraw>AUTO</button><button class="cne-sn-arrow cne-sn-numtog" data-hidecom>;👁</button>' : ''}
    <span class="cne-sn-text" data-el="snBar"></span>
    <button class="cne-sn-close" data-act="closeEditor" title="Zavřít editor">✕</button>
  </div>
  ${drawMode ? drawToolbarHTML() : `<div class="cne-toolbar">
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
      <button class="cne-tb-btn cne-cam-btn" data-act="toCad" title="Vykreslit v CAD (přenést úpravy)" aria-label="Vykreslit v CAD">🔄</button>
    </div>
  </div>`}

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
          <div class="cne-hist-list" data-el="histList"></div>
        </div>
      </div>
      <div class="cne-sb-section">
        <div class="cne-sb-title" data-act="toggleSection"><span class="cne-sb-arrow">▾</span> Program</div>
        <div class="cne-sb-content">
          <div class="cne-file-list" data-el="fileList"></div>
          <button class="cne-sb-btn green" data-act="download" title="Uložit aktuální program do zařízení (.MPF)">💾 Uložit G-kód</button>
          <button class="cne-sb-btn" data-act="mergeLoad" title="Načíst .MPF/.SPF nebo uložený projekt .camprog (vytáhne se jeho G-kód) – do fronty pro spojení">📂 Načíst program</button>
          <div class="cne-merge-list" data-el="mergeList"></div>
          <button class="cne-sb-btn accent" data-act="mergeJoin" data-el="mergeJoinBtn" disabled>🔗 Spojit do jednoho</button>
        </div>
      </div>
      ${drawMode ? '' : `<div class="cne-sb-section">
        <div class="cne-sb-title" data-act="toggleSection"><span class="cne-sb-arrow">▾</span> R-Parametry</div>
        <div class="cne-sb-content">
          <div class="cne-param-list" data-el="paramList"></div>
        </div>
      </div>`}
    </div>

    <div class="cne-editor-wrap${drawMode ? ' cne-editor-wrap--col' : ''}">
      ${drawMode ? '<canvas class="cne-preview" data-el="preview" hidden></canvas>' : ''}
      <div class="cne-editor-container">
        <div class="cne-backdrop" data-el="backdrop"><div data-el="highlights"></div></div>
        <textarea class="cne-textarea" data-el="editor" spellcheck="false"
                  placeholder="Zde pište CNC kód…"></textarea>
      </div>
    </div>
    ${drawMode ? `<div class="cne-sidebar cne-sidebar-right" data-el="sidebarRight">
      <div class="cne-sb-title">Nástroje editoru</div>
      <div class="cne-menu-list">${menuItemsHTML(true)}</div>
      <div class="cne-sb-title">Průsečíky na plátně</div>
      <div class="cne-isect-list" data-el="isectList"></div>
    </div>` : ''}
  </div>

  ${drawMode ? `<div class="cne-info" data-el="infoBar">
    <div class="cne-info-body" data-el="infoBody" hidden>
      <span class="cne-info-text" data-el="infoText"></span>
      <div class="cne-hint" data-el="hintText" aria-live="polite"></div>
    </div>
    <div class="cne-info-head">
      <button class="cne-info-toggle" data-act="infoToggle" data-el="infoToggle" title="Rozbalit / sbalit údaje o řádku a nápovědu k zápisu">▸ Údaje a nápověda</button>
      <div class="cne-info-btns">
        <button class="cne-info-btn" data-act="copy" title="Kopírovat celý kód do schránky">📋 vše</button>
        <button class="cne-info-btn" data-act="copyLine" title="Kopírovat řádek s kurzorem">📋ř</button>
        <button class="cne-info-btn" data-act="copyCoord" title="Kopírovat koncový bod řádku (X… Z…)">📋XZ</button>
      </div>
    </div>
  </div>` : ''}

  ${quickbarHTML(drawMode)}

  ${drawMode ? `<!-- Úsečka úhlem -->
  <div class="cne-inner-modal" data-el="angleModal" style="display:none">
    <div class="cne-im-card">
      <div class="cne-im-title">∠ Úsečka úhlem<button class="cne-im-close" data-act="angleCancel" title="Zavřít">✕</button></div>
      <div class="cne-ang-from" data-el="angleFrom"></div>
      <div class="cne-ang-modes" data-el="angModeRow">
        <button class="cne-ang-mode on" data-act="angMode" data-mode="polar" title="Úhel od osy +Z">Polární</button>
        <button class="cne-ang-mode" data-el="angRelBtn" data-act="angMode" data-mode="rel" title="Úhel od směru předchozí úsečky">Od předchozí</button>
        <button class="cne-ang-mode" data-el="angTangentBtn" data-act="angTangent" title="Pokračovat tečně: úsečka přesně ve směru konce předchozí úsečky / oblouku (odklon 0°)">⟿ Tečně</button>
      </div>
      <div class="cne-ang-modes" data-el="angSideRow" hidden>
        <button class="cne-ang-mode on" data-act="angSide" data-side="1" title="Odklon od předchozího směru doleva (proti směru hodin)">↺ vlevo</button>
        <button class="cne-ang-mode" data-act="angSide" data-side="-1" title="Odklon od předchozího směru doprava (po směru hodin)">↻ vpravo</button>
      </div>
      <label class="cne-ang-row"><span data-el="angLabel">Úhel °</span> <small data-el="angSmall">(od osy +Z, proti směru hodin; 180 = směr −Z)</small>
        <span class="cne-ang-inrow"><input class="cne-im-input" data-el="angA" type="text" inputmode="decimal" autocomplete="off"><button type="button" class="compass-trigger-btn" data-el="angCompass" title="Rychlá volba směru (šipky podle obrazovky)">✛</button></span></label>
      <div class="cne-ang-hint">a jeden z údajů:</div>
      <div class="cne-ang-grid">
        <label>Délka L<input class="cne-im-input" data-el="angL" type="text" inputmode="decimal" autocomplete="off"></label>
        <label>nebo X<input class="cne-im-input" data-el="angX" type="text" inputmode="decimal" autocomplete="off"></label>
        <label>nebo Z<input class="cne-im-input" data-el="angZ" type="text" inputmode="decimal" autocomplete="off"></label>
      </div>
      <div class="cne-ang-res" data-el="angRes"></div>
      <div class="cne-im-actions">
        <button class="cne-im-btn cancel" data-act="angleCancel">Zrušit</button>
        <button class="cne-im-btn ok" data-act="angleOk">Vložit G1</button>
      </div>
    </div>
  </div>` : ''}${drawMode ? ARC_MODAL_HTML : ''}

  ${drawMode ? `<!-- Sražení úhel × délka -->
  <div class="cne-inner-modal" data-el="chfModal" style="display:none">
    <div class="cne-im-card">
      <div class="cne-im-title">⌐ Sražení úhel × délka<button class="cne-im-close" data-act="chfCancel" title="Zavřít">✕</button></div>
      <div class="cne-ang-from" data-el="chfFrom"></div>
      <div class="cne-ang-modes">
        <button class="cne-ang-mode on" data-act="chfAlong" data-along="first" title="Délka se měří od rohu po první úsečce (té, na které je kurzor)">po 1. úsečce</button>
        <button class="cne-ang-mode" data-act="chfAlong" data-along="second" title="Délka se měří od rohu po druhé úsečce (další pohyb)">po 2. úsečce</button>
      </div>
      <div class="cne-ang-grid cne-chf-grid">
        <label>Délka L<input class="cne-im-input" data-el="chfL" type="text" inputmode="decimal" autocomplete="off"></label>
        <label>Úhel °<small>vůči té úsečce</small><input class="cne-im-input" data-el="chfA" type="text" inputmode="decimal" autocomplete="off" value="45"></label>
      </div>
      <div class="cne-ang-res" data-el="chfRes"></div>
      <div class="cne-im-actions">
        <button class="cne-im-btn cancel" data-act="chfCancel">Zrušit</button>
        <button class="cne-im-btn ok" data-act="chfOk">Použít</button>
      </div>
    </div>
  </div>` : ''}

  <!-- Menu modal (mobile full actions) -->
  <div class="cne-inner-modal" data-el="menuModal" style="display:none">
    <div class="cne-im-card cne-menu-card">
      <div class="cne-im-title">Nástroje editoru<button class="cne-im-close" data-act="menuClose" title="Zavřít">✕</button></div>
      <div class="cne-menu-list">${drawMode ? '' : menuItemsHTML()}
      </div>
      <button class="cne-im-btn cancel" data-act="menuClose" style="margin-top:10px;width:100%">Zavřít</button>
    </div>
  </div>

  <!-- Numpad modal -->
  <div class="cne-inner-modal" data-el="numModal" style="display:none">
    ${numpadHTML()}
  </div>

  ${drawMode ? `<!-- Nápověda k zápisu -->
  <div class="cne-inner-modal" data-el="helpModal" style="display:none">
    <div class="cne-im-card cne-val-card">
      <div class="cne-im-title">Nápověda k zápisu<button class="cne-im-close" data-act="helpClose" title="Zavřít">✕</button></div>
      <div class="cne-help-searchrow">
        <input class="cne-im-input cne-help-search" data-el="helpSearch" type="search" inputmode="search" autocomplete="off" placeholder="🔍 Hledat: G2, oblouk, tečný…">
      </div>
      <div class="cne-help-body">${helpHTML()}</div>
      <button class="cne-im-btn cancel" data-act="helpClose" style="margin-top:8px;width:100%">Zavřít</button>
    </div>
  </div>` : ''}

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
