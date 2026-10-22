// Panel POHLED NA ČELO + editor operací poháněných nástrojů v CAM simulátoru.
//
// Tlačítko ◎ v liště plátna přepíná jako ◎ Čelo v CAD: řez → řez + pohled na
// čelo (vpravo, na výšku dole) → ◉ jen pohled na čelo → řez. Pohled je podél
// osy proti sklíčidlu / upínací desce. V hlavičce
// pohledu: ▶ / ⏸ obrábění poháněnými nástroji (liveMachining.js: úběr
// v pohledu i v řezu, čas × rychlost přehrávače; po dojetí soustružení
// v přehrávači CAM se spustí samo a pohled sleduje obráběné čelo), 🛠 Operace otevře editor
// (vrtání do čela / do pláště, kapsa, drážka; přepínač NC výstupu SPOS /
// osa C / TRANSMIT; cykly × rozepsané pohyby; M-kódy stroje), Z↔ schová /
// ukáže lištu řezu (liveCutBar.js: rovina Z posuvníkem, strana pohledu;
// značka řezu i v řezu vlevo), ⤢ maximalizuje pohled přes celé okno.
// Editor operací potřebuje místo — otevře se v maximalizovaném pohledu
// (náhled nahoře / vlevo, formulář pod ním / vpravo) a po zavření se vrátí.
//
// Vrtání děr z výkresu je operace Vrtání (ops/drill.js generuje blok do
// programu své části, cam/sim/machTabTool.js přepne nástroj a část);
// 🔩 Vyvrtat = záložka Vrtání + ▶ simulace (liveDrillUi.js). Úpravy operací
// v části s Vrtáním program přegenerují. Ruční cesta (liveProgram.js):
// „📝 Zapsat do programu" vloží blok mezi značky před konec programu
// soustružení; je-li tam, každá další úprava operací ho přepíše sama.
//
// camSimulator.js volá jen initLiveTools() a drawCanvas.js liveAfterDraw().
import { showToast } from '../../../state.js';
import { safeEvalMath } from '../../../utils.js';
import {
  liveSettings, newLiveOp, normalizeLiveOp, getLiveOps, liveOpOn,
} from './liveModel.js';
import { drawFaceView, livePartGeometry, faceViewHit } from './liveFaceView.js';
import { drawLiveSectionLayer } from './liveSection.js';
import { LIVE_CSS } from './liveStyles.js';
import { liveOpsFromCad } from './liveFromCad.js';
import { cadSyncOps } from './liveCadSync.js';
import { createLiveProgram } from './liveProgram.js';
import { createDrillUi } from './liveDrillUi.js';
import { settingsTitle } from './liveSettingsUi.js';
import { cadDrawingsForCam } from '../../../faceView/cadForCam.js';
import { liveProfile, liveCutAt, autoSide, drawCutMark } from './liveCut.js';
import { createCutBar } from './liveCutBar.js';
import { attachFaceNav, defaultNav, isDefaultNav } from './liveFaceNav.js';
import { createLivePlayer, buildLiveTimeline, liveStateAt } from './liveMachining.js';
import { opCard } from './liveOpForm.js';
import { checkLiveOps } from './liveChecks.js';
import { liveCodeLine, liveMotionText, showLiveCodeLine, livePathSegments, drawLivePaths } from './liveNcSync.js';

const CTRL = new WeakMap();   // S → ovladač otevřeného simulátoru
const VIEW_KEY = 'skica-cam-live-view';   // '0' řez, '1' řez + čelo, '2' jen čelo
const BAR_KEY = 'skica-cam-live-bar';     // '0' = lišta řezu schovaná
const MODES = ['off', 'both', 'solo'];
const TITLES = {
  off: 'Řez — klik: řez + pohled na čelo (proti sklíčidlu / upínací desce) a poháněné nástroje',
  both: 'Řez + pohled na čelo — klik: jen pohled na čelo',
  solo: 'Jen pohled na čelo — klik: zpět jen řez',
};

/**
 * Běží (nebo stojí rozjeté) vrtání / frézování ◎? drawToolpath.js pak nekreslí
 * nástroj soustružení — v řezu je jen nástroj, který vrtá (uživatel 21. 10. 2026).
 */
export function liveBusy(S) {
  const c = CTRL.get(S);
  return !!(c && c.busy());
}

/** Volá drawCanvas.js po vykreslení řezu. */
export function liveAfterDraw(f) {
  const c = CTRL.get(f.S);
  if (c) c.sync();
  const mach = c ? c.mach() : null;
  // Při vrtání a frézování soustružení (dráhy, nůž) ztlumit — vidět je vrták.
  if (mach && mach.active) { f.ctx.save(); f.ctx.fillStyle = 'rgba(30,30,46,0.6)'; f.ctx.fillRect(0, 0, f.w, f.h); f.ctx.restore(); }
  if (c) c.nc(f, mach);
  drawLiveSectionLayer(f, mach);
  if (c) { c.mark(f); c.redraw(); }
}

/**
 * @param deps { S, root, canvasWrap, toolbar, draw, pushHistory, saveState,
 *               isoMagSlot(rec, T) — slot zásobníku ze záznamu 📚 (vrták na Ø díry),
 *               applyChange(opts) — přegenerovat program (operace Vrtání děr z výkresu) }
 */
export function initLiveTools(deps) {
  const { S, root, canvasWrap, toolbar } = deps;
  if (!document.getElementById('cam-live-css')) {
    const st = document.createElement('style');
    st.id = 'cam-live-css'; st.textContent = LIVE_CSS;
    document.head.appendChild(st);
  }
  const st = {
    mode: 'off', open: false, editor: false, selected: 0, key: '', edKey: '', turnDone: false, wasRunning: false,
    nav: defaultNav(), max: false, autoMax: false, bar: true, cutZ: null, cutSide: null, sideManual: false, prof: null, profKey: '', profN: 0,
  };
  try { st.bar = localStorage.getItem(BAR_KEY) !== '0'; } catch (_) { /* bez úložiště */ }

  // ── DOM: řada [řez | pohled na čelo] ──
  const row = document.createElement('div');
  row.className = 'cam-live-row';
  canvasWrap.parentNode.insertBefore(row, canvasWrap);
  row.appendChild(canvasWrap);
  const pane = document.createElement('div');
  pane.className = 'cam-live-pane';
  pane.hidden = true;
  pane.innerHTML = `
    <div class="cam-live-head">
      <span class="cam-live-title">◎ <span class="cam-live-long">Pohled na </span>čelo</span>
      <button data-live="play" title="Obrábění vrtáním a frézováním: ▶ spustit / ⏸ pozastavit (rychlost jako přehrávač CAM; po soustružení se spustí samo)">▶</button>
      <button data-live="drill" title="Vyvrtat: operace Vrtání s vrtákem podle děr z výkresu (je-li v části soustružení, jako nová část programu) a ▶ simulace">🔩 Vyvrtat</button>
      <button data-live="editor" title="Operace poháněnými nástroji: vrtání do čela a pláště, frézování kapes a drážek, NC výstup">🛠<span class="cam-live-long"> Operace</span></button>
      <button data-live="bar" title="Lišta řezu (rovina Z posuvníkem, strana pohledu) — ukázat / schovat">Z↔</button>
      <button data-live="max" title="Maximalizovat pohled přes celé okno">⤢</button>
      <button data-live="close" title="Zavřít pohled na čelo">✕</button>
    </div>
    <div class="cam-live-barhost"></div>
    <div class="cam-live-body">
      <div class="cam-live-cv"><canvas></canvas>
        <button class="cam-live-fit" data-live="fit" hidden title="Vycentrovat pohled (dvojklik / dvojí ťuknutí)">🎯</button></div>
      <div class="cam-live-ed" hidden></div>
    </div>`;
  row.appendChild(pane);
  const cvWrap = pane.querySelector('.cam-live-cv');
  const cv = cvWrap.querySelector('canvas');
  const ed = pane.querySelector('.cam-live-ed');
  const playBtn = pane.querySelector('[data-live="play"]');
  const edBtn = pane.querySelector('[data-live="editor"]');
  const barBtn = pane.querySelector('[data-live="bar"]');
  const maxBtn = pane.querySelector('[data-live="max"]');
  const body = pane.querySelector('.cam-live-body');

  // Tlačítko v liště plátna (vždy viditelné, i ve sbalené liště »«).
  const btn = document.createElement('button');
  btn.dataset.live = 'toggle';
  btn.textContent = '◎';
  btn.title = TITLES.off;
  toolbar.insertBefore(btn, toolbar.querySelector('[data-act="toggle-controls"]'));
  // Tři kroky jako v CAD: řez → řez + čelo → jen čelo → řez.
  btn.addEventListener('click', () => setMode(MODES[(MODES.indexOf(st.mode) + 1) % MODES.length]));

  const ro = new ResizeObserver(() => {
    const w = cvWrap.clientWidth, h = cvWrap.clientHeight;
    if (w > 0 && h > 0 && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
    redraw(true);
  });
  ro.observe(cvWrap);
  // Zoom kolečkem / dvěma prsty a posun tažením jako v nárysu.
  // Klepnutí na díru vybere / zruší její skupinu k vrtání (liveDrillUi.js).
  const nav = attachFaceNav(cv, st.nav, () => redraw(true), (x, y) => {
    const oi = faceViewHit(st.view, getLiveOps(S.params), x, y);
    if (oi >= 0) drillUi.toggle(oi);
  });
  const fitBtn = pane.querySelector('[data-live="fit"]');
  // Lišta plátna se zalamuje (»«, mobil) — v režimu jen čelo pod ní posunout
  // hlavičku. Široký panel (maximalizovaný na desktopu) dá editor vedle náhledu.
  const ro2 = new ResizeObserver(() => {
    soloInset();
    pane.classList.toggle('cam-live-wide', pane.clientWidth > 640 && pane.clientWidth > pane.clientHeight * 1.15);
  });
  ro2.observe(toolbar); ro2.observe(pane);

  function setMode(mode) {
    const on = mode !== 'off';
    st.mode = mode; st.open = on;
    pane.hidden = !on;
    btn.textContent = mode === 'solo' ? '◉' : '◎';
    btn.title = TITLES[mode];
    btn.classList.toggle('cam-sim-active', mode === 'both');
    btn.classList.toggle('cam-live-solo-btn', mode === 'solo');
    root.classList.toggle('cam-live-on', on);
    root.classList.toggle('cam-live-solo', mode === 'solo');
    try { localStorage.setItem(VIEW_KEY, String(MODES.indexOf(mode))); } catch (_) { /* soukromé okno */ }
    if (!on) { stopAnim(); if (st.max) setMax(false); }
    soloInset();
    // Plátno řezu změnilo šířku — vycentrovat (🎯 i ve sbalené liště).
    if (mode !== 'solo') toolbar.querySelector('[data-act="fit"]')?.click();
    if (on) { if (st.editor) renderEditor(); redraw(true); }
  }
  // Jen čelo: řez je skrytý a lišta plátna leží přes horní okraj pohledu.
  function soloInset() {
    if (st.mode !== 'solo' || st.max) { pane.style.paddingTop = ''; return; }
    const tb = toolbar.getBoundingClientRect(), pr = pane.getBoundingClientRect();
    pane.style.paddingTop = tb.height > 0 ? `${Math.max(0, Math.ceil(tb.bottom - pr.top) + 4)}px` : '';
  }

  function setMax(on, auto = false) {
    st.max = on; st.autoMax = on && auto;
    root.classList.toggle('cam-live-max', on);
    maxBtn.textContent = on ? '⤡' : '⤢';
    maxBtn.title = on ? 'Zmenšit zpět na plátno' : 'Maximalizovat pohled přes celé okno';
    maxBtn.classList.toggle('cam-sim-active', on);
    soloInset();
    redraw(true);
  }
  function setBar(on) {
    st.bar = on; bar.el.hidden = !on;
    barBtn.classList.toggle('cam-sim-active', on);
    try { localStorage.setItem(BAR_KEY, on ? '1' : '0'); } catch (_) { /* soukromé okno */ }
  }

  // ── řez v rovině Z (lišta) ──
  function profile() {
    const k = JSON.stringify([S.contourPoints, S.stockPoints, S.params.mode, S.params.stockMode]);
    if (k !== st.profKey) { st.profKey = k; st.prof = liveProfile(S); st.profN++; }
    return st.prof;
  }
  /** Rovina a strana pohledu; bez zadání pravý konec dílu (čelo zprava). */
  function cutState() {
    const prof = profile();
    if (prof.empty) return null;
    // Běžící obrábění: pohled sleduje čelo obráběné operace (díry do pláště ne).
    const m = player.running ? machState() : null;
    const op = m && m.active && getLiveOps(S.params)[m.active.op];
    if (op && op.side !== 'radial') return { prof, z: op.zTop, side: op.faceDir === -1 ? 'left' : 'right' };
    const z = Number.isFinite(st.cutZ) ? st.cutZ : prof.max;
    return { prof, z, side: st.cutSide || autoSide(prof, z) };
  }
  let cutMemo = { k: null, v: null };
  function cutView(c) {
    const k = JSON.stringify([st.profKey, c.z, c.side]);
    if (cutMemo.k !== k) cutMemo = { k, v: liveCutAt(c.prof, c.z, c.side) };
    return cutMemo.v;
  }
  // Řez vlevo (značka řezu, úběr) — překreslit nejvýš jednou za snímek.
  let drawQueued = false;
  function queueDraw() {
    if (!drawQueued) { drawQueued = true; requestAnimationFrame(() => { drawQueued = false; deps.draw(); }); }
  }
  function cutChanged() { bar.update(); redraw(true); queueDraw(); }
  const bar = createCutBar(pane.querySelector('.cam-live-barhost'), {
    get: () => {
      const prof = profile(), c = cutState();
      const zs = new Set(prof.zsAll);   // osazení, konce polotovaru + čela operací do čela
      getLiveOps(S.params).forEach(op => { if (op.side !== 'radial' && Number.isFinite(op.zTop)) zs.add(+op.zTop.toFixed(3)); });
      return { z: c ? c.z : 0, side: c ? c.side : 'right', min: prof.lo, max: prof.hi, ticks: [...zs].sort((a, b) => a - b) };
    },
    setZ: (z, o = {}) => {
      if (o.resetSide) st.sideManual = false;
      st.cutZ = +(+z).toFixed(3);
      // Strana podle osazení, dokud ji uživatel nepřepnul ručně (jako v CAD).
      if (!st.sideManual) st.cutSide = autoSide(profile(), st.cutZ, st.cutSide || 'right');
      cutChanged();
    },
    toggleSide: () => {
      const c = cutState();
      st.cutSide = c && c.side === 'left' ? 'right' : 'left'; st.sideManual = true;
      cutChanged();
    },
    toast: showToast,
  });
  setBar(st.bar);

  // ── kreslení ──
  function viewKey() {
    const p = S.params;
    return JSON.stringify([p.liveOps, p.stockMode, p.stockDiameter, p.mode, p.machineStructure,
      S.contourPoints, S.stockPoints, cv.width, cv.height, st.selected, machMemo.k,
      st.cutZ, st.cutSide, st.nav]);
  }
  function redraw(force) {
    if (!st.open) return;
    if (!document.body.contains(pane)) { stopAnim(); return; }
    const mach = machState();
    const k = viewKey();
    if (!force && k === st.key) { syncEditor(); return; }
    st.key = k;
    const ops = getLiveOps(S.params);
    const c = cutState();
    st.view = drawFaceView(cv, {
      prms: S.params, geo: livePartGeometry(S), ops,
      selected: st.editor && ops.length ? st.selected : null,
      mach, cut: c ? cutView(c) : null, nav: st.nav, checks: checkLiveOps(profile(), ops),
    });
    fitBtn.hidden = isDefaultNav(st.nav);
    bar.update();
    syncEditor();
  }
  // Po ↩/↪ se operace mohly změnit pod rukama — přerenderovat editor, pokud
  // v něm uživatel zrovna nepíše.
  function syncEditor() {
    if (!st.editor) return;
    if (edKey() === st.edKey) return;
    if (ed.contains(document.activeElement)) return;
    renderEditor();
  }
  // Volá se při každém snímku simulace — jen levné vstupy (délka programu
  // místo porovnání bloku: 🔄 Dráhy blok z programu vyhodí → délka se změní).
  function edKey() {
    return JSON.stringify([S.params.liveOps, S.params.live, S.params.controlSystem, st.selected,
      String(S.manualGCode || '').length, st.profN]);
  }

  // ── obrábění poháněnými nástroji (liveMachining.js) ──
  const player = createLivePlayer({
    getOps: () => getLiveOps(S.params), getPrms: () => S.params,
    getSpeed: () => S.simSpeed || 1,   // stejná rychlost jako přehrávač soustružení
    onFrame: () => {
      if (!document.body.contains(pane)) { player.stop(); return; }
      syncPlayBtns();
      redraw(true); queueDraw();
    },
    onEnd: () => { syncPlayBtns(); },
  });
  function stopAnim() { player.stop(); syncPlayBtns(); }
  /** ▶/⏸ v pohledu na čelo i v přehrávači programu podle přehrávání vrtání. */
  function syncPlayBtns() {
    playBtn.textContent = player.running ? '⏸' : '▶';
    const main = !S.simRunning && root.querySelector('.cam-sim-player-bar [data-act="play"]');
    if (main && st.turnDone) main.textContent = player.running ? '⏸' : '▶';
  }
  /**
   * Stav pro kreslení: přehrávané obrábění; po dojetí soustružení (přehrávač
   * CAM na konci) vše obrobeno; jinak null = jen plán.
   */
  let machMemo = { k: null, v: null };
  function machState() {
    let k, make;
    if (player.active) {
      k = `p${player.serial}:${player.t}:${player.running}`;
      make = () => ({ ...player.state(), paused: !player.running && !player.finished });
    } else if (st.turnDone && getLiveOps(S.params).some(liveOpOn) && prog.has()) {
      k = `d${JSON.stringify(S.params.liveOps)}:${S.params.rapidFeed}`;
      make = () => { const tl = buildLiveTimeline(getLiveOps(S.params), S.params); return liveStateAt(tl, tl.total); };
    } else { machMemo = { k: 'plan', v: null }; return null; }
    if (machMemo.k !== k) machMemo = { k, v: make() };
    return machMemo.v;
  }
  // Přehrávač CAM: soustružení dojelo přehráváním → plynule navázat vrtáním
  // a frézováním (pohled se otevře); posun zpět → díry zase neobrobené.
  // Navázat jen tehdy, když přehrávaný PROGRAM vrtání obsahuje (blok
  // poháněných nástrojů — operace Vrtání děr z výkresu nebo 📝 Zapsat).
  function sync() {
    if (deps.applyChange && prog.stale()) requestAnimationFrame(() => deps.applyChange({ cycle: true }));
    const done = (S.simProgress || 0) >= 1 - 1e-9;
    if (done !== st.turnDone) {
      st.turnDone = done;
      if (!done) { if (player.active) stopAnim(); }
      else if ((st.wasRunning || st.playArmed) && prog.has() && getLiveOps(S.params).some(liveOpOn)) requestAnimationFrame(autoStart);
      if (done) st.playArmed = false;
    }
    st.wasRunning = !!S.simRunning;
  }
  function autoStart() {
    if (!document.body.contains(pane) || !st.turnDone) return;
    if (!st.open) setMode('both');
    const drillOnly = S.params.drillActive;
    if (player.start()) showToast(drillOnly ? 'Vrtání děr z výkresu — kus se natáčí k nástroji (◎ pohled na čelo)' : 'Soustružení hotovo — pokračuje vrtání a frézování (◎ pohled na čelo)', 3000);
  }
  // ▶ v přehrávači (zachytit dřív než simulátor): rozjíždí se program — po
  // jeho konci navázat obráběním, i když je to krátký program jen s vrtáním.
  const simBar = root.querySelector('.cam-sim-player-bar');
  if (simBar) simBar.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    // Program dojel a běží (nebo stojí) vrtání ◎ → ▶/⏸ ho pozastaví / pustí
    // dál; dřív simulátor program přetočil na začátek (uživatel 21. 10. 2026).
    if (a.dataset.act === 'play' && !S.simRunning && st.turnDone && player.active && !player.finished) {
      e.stopPropagation(); e.preventDefault();
      if (player.running) player.pause(); else player.resume();
      syncPlayBtns();
      return;
    }
    if (a.dataset.act === 'play' && !S.simRunning) { st.playArmed = true; st.turnDone = false; }
    else if (a.dataset.act === 'stop') st.playArmed = false;
  }, true);
  /** ▶ simulace programu (🔩 Vyvrtat). */
  function playProgram() {
    if (S.simRunning) return;
    const b = simBar && simBar.querySelector('[data-act="play"]');
    if (b) setTimeout(() => b.click(), 60);   // po přegenerování
  }
  playBtn.addEventListener('click', () => {
    if (player.running) player.pause();
    else if (player.active && !player.finished) player.resume();
    else if (!player.start()) { showToast('Žádné operace — přidejte je přes 🛠 Operace'); return; }
    syncPlayBtns();
    redraw(true); queueDraw();
  });

  // ── program: blok mezi značkami (liveProgram.js) ──
  const prog = createLiveProgram({ S, root, pushHistory: deps.pushHistory, saveState: deps.saveState, toast: showToast });

  // ── úpravy operací ──
  function commit(mutate) {
    stopAnim();   // kroky přehrávání se počítaly z původních operací
    deps.pushHistory();
    mutate(S.params);
    deps.saveState();
    // Vrták první vybrané skupiny = nástroj části (cam/sim/machTabTool.js);
    // přepnutí nástroje program přegeneruje samo.
    const switched = S.opView !== 'all' && S.params.drillActive && S._syncLiveDrill ? S._syncLiveDrill() : false;
    // Operace Vrtání (díry z výkresu) → přegenerovat program; blok vložený
    // ručně (📝 Zapsat) do soustružení → přepsat ho (bez položky historie).
    // V náhledu „Celý program" nic — přegeneroval by se jeden program z panelu
    // místo složených částí; část s Vrtáním se srovná sama (prog.stale), až
    // na ni uživatel přepne.
    if (S.opView === 'all' || switched) { /* jen náhled celku / přegenerováno */ }
    else if (S.params.drillActive && deps.applyChange) deps.applyChange({ cycle: true });
    else if (prog.has()) prog.write(false, true);   // bez hlášek (jiná než poslední část)
    deps.draw();
    renderEditor();
    redraw(true);
  }
  function opsCopy() { return getLiveOps(S.params).map(o => JSON.parse(JSON.stringify(o))); }
  // Výběr děr k vrtání a sekce v záložce Vrtání (liveDrillUi.js).
  const drillUi = createDrillUi({
    S, root, toast: showToast, commit, saveState: deps.saveState, isoMagSlot: deps.isoMagSlot,
    openView: () => { if (!st.open) setMode('both'); },
    play: () => { renderEditor(); if (!st.open) setMode('both'); playProgram(); },
  });

  pane.addEventListener('click', e => {
    const b = e.target.closest('[data-live]');
    if (!b || b === btn) return;
    const act = b.dataset.live;
    const card = b.closest('[data-op]');
    const oi = card ? +card.dataset.op : -1;
    if (act === 'editor') {
      st.editor = !st.editor; ed.hidden = !st.editor; edBtn.classList.toggle('cam-sim-active', st.editor);
      body.classList.toggle('ed-on', st.editor);
      if (st.editor) renderEditor();
      // Editor potřebuje místo: otevřít v maximalizovaném pohledu, po zavření vrátit.
      if (st.editor && !st.max) setMax(true, true);
      else if (!st.editor && st.autoMax) setMax(false);
      redraw(true);
    } else if (act === 'max') setMax(!st.max);
    else if (act === 'fit') nav.reset();
    else if (act === 'bar') setBar(!st.bar);
    else if (act === 'close') setMode('off');
    else if (act === 'nc-settings') {
      // Pravý panel ⚙ Parametry; nastavení je v záložce Vrtání (pod seznamem děr).
      root.querySelector('[data-code="show-sidebar"]')?.click();
      root.querySelector('[data-tab="params"]')?.click();
      const nc = root.querySelector('.cam-livedrill-nc');
      if (nc) { nc.open = true; nc.scrollIntoView({ block: 'nearest' }); } else showToast('⚙ Parametry → Obrábění → Vrtání → Výstup NC', 4000);
    }
    else if (act === 'add-drill' || act === 'add-mill') {
      const ops = opsCopy();
      const geo = livePartGeometry(S);
      ops.push(newLiveOp(act === 'add-mill' ? 'mill' : 'drill', geo, ops.length + 1));
      st.selected = ops.length - 1;
      commit(p => { p.liveOps = ops; });
    } else if (act === 'from-cad') {
      const res = liveOpsFromCad(cadDrawingsForCam(), livePartGeometry(S), getLiveOps(S.params));
      if (!res.holes && !res.slots) {
        showToast('V CAD nejsou díry — do čela: ◎ (bokorys), kružnice = díra, úsečka = drážka; do pláště: nástroj Díra, klepnout v nárysu na díl', 5000);
        return;
      }
      st.selected = res.ops.length - 1;
      commit(p => { p.liveOps = res.ops; });
      showToast(`Z CAD: ${res.holes} děr, ${res.slots} drážek${res.skipped ? ` (přeskočeno ${res.skipped} jiných objektů)` : ''} — doplňte hloubku a nástroj`, 5000);
    } else if (act === 'drill') drillUi.drillAll();
    else if (act === 'write') {
      if (!getLiveOps(S.params).length) { showToast('Nejdřív přidejte operaci'); return; }
      if (prog.write(true)) showToast('Blok poháněných nástrojů zapsán do programu (před konec programu)');
      else if (prog.has()) showToast('Blok v programu už je aktuální');
      renderEditor();
    } else if (act === 'unwrite') {
      showToast(prog.unwrite() ? 'Blok poháněných nástrojů odebrán z programu' : 'Blok v programu není');
      renderEditor();
    } else if (act === 'sel' && oi >= 0) {
      st.selected = st.selected === oi ? -1 : oi; renderEditor(); redraw(true);
    } else if ((act === 'up' || act === 'down') && oi >= 0) {
      const ops = opsCopy(), j = act === 'up' ? oi - 1 : oi + 1;
      if (j < 0 || j >= ops.length) return;
      [ops[oi], ops[j]] = [ops[j], ops[oi]]; st.selected = j;
      commit(p => { p.liveOps = ops; });
    } else if (act === 'del' && oi >= 0) {
      const ops = opsCopy(); ops.splice(oi, 1);
      st.selected = Math.min(st.selected, ops.length - 1);
      commit(p => { p.liveOps = ops; });
    }
    e.stopPropagation();
  });

  const NUM_KEYS = new Set(['faceDir', 'pcd', 'count', 'startAngle', 'zTop', 'xTop', 'zPos', 'holeD', 'depth', 'peck',
    'dwell', 'safe', 'retract', 'toolD', 'stepDown', 'toolNo', 'rpm', 'feed', 'chipBack', 'slot.x1', 'slot.y1', 'slot.x2', 'slot.y2', 'kz1', 'kz2']);
  ed.addEventListener('change', e => {
    const el = e.target;
    const k = el.dataset.k;
    const card = el.closest('[data-op]');
    if (!k || !card) return;
    const oi = +card.dataset.op;
    let v = el.value;
    if (NUM_KEYS.has(k)) {
      v = safeEvalMath(v);
      if (!Number.isFinite(v)) { showToast('Neplatné číslo'); renderEditor(); return; }
    }
    const ops = opsCopy();
    if (k.startsWith('slot.')) ops[oi].slot[k.slice(5)] = v;
    else if (['toolNo', 'toolName', 'rpm', 'feed'].includes(k)) { ops[oi][k] = v; ops[oi].autoTool = false; }   // ručně → vrták se už nedoplňuje
    else ops[oi][k] = v;
    ops[oi] = normalizeLiveOp(ops[oi]);
    commit(p => { p.liveOps = ops; });
  });

  // ── editor ──
  function renderEditor() {
    if (!st.editor) return;
    const ops = getLiveOps(S.params);
    const set = liveSettings(S.params);
    const ctrl = S.params.controlSystem || 'sinumerik';
    const bs = prog.blockState();
    // Výstup NC se nastavuje jen v pravém panelu (⚙ Parametry → Vrtání, liveDrillUi.js).
    let h = `<div class="cam-live-note">${settingsTitle(ctrl)} · ${({ spos: 'SPOS', caxis: 'osa C', transmit: 'TRANSMIT' })[set.mode]}${set.cycles ? ', cykly' : ''} — nastavení v pravém panelu <button data-live="nc-settings" class="cam-sim-btn cam-sim-btn-gray">⚙ Parametry → Vrtání</button></div>` + `
      <div class="cam-live-btns">
        <button data-live="add-drill">➕ Vrtání</button>
        <button data-live="add-mill">➕ Frézování</button>
        <button data-live="from-cad" title="Načíst díry (kružnice) a drážky (úsečky) nakreslené v CAD v pohledu ◎ Čelo. Nahradí dřív načtené z CAD, ručně přidané operace zůstanou.">📥 Z CAD</button>
        <button data-live="write" title="Vloží blok poháněných nástrojů do programu před jeho konec (M30), nebo přepíše ten, který už tam je">📝 Zapsat do programu</button>
        <button data-live="unwrite" title="Odebere ručně zapsaný blok poháněných nástrojů z programu">🗑 Z programu</button>
      </div>
      <div class="cam-live-status ${bs.cls}">${bs.text}</div>`;
    if (!ops.length) h += '<div class="cam-live-note">Zatím žádné operace. Přidejte vrtání nebo frézování.</div>';
    const chk = checkLiveOps(profile(), ops);   // kontrola proti tvaru dílu
    ops.forEach((op, i) => { h += opCard(op, i, i === st.selected, chk && chk[i]); });
    ed.innerHTML = h;
    st.edKey = edKey();
  }

  // Díry a drážky nakreslené v CAD (◎ bokorys) se přenesou samy jako 📥 Z CAD
  // (liveCadSync.js); blok v programu se přepíše, je-li tam.
  const fromCad = cadSyncOps(S.params, livePartGeometry(S));
  if (fromCad) {
    S.params.liveOps = fromCad.ops;
    deps.saveState();
    // Operace Vrtání děr z výkresu → přegenerovat (až po sestavení okna).
    if (S.params.drillActive && S.opView !== 'all' && deps.applyChange) setTimeout(() => deps.applyChange({ cycle: true }), 0);
    else if (prog.has()) prog.write(false, true);
    showToast(`Z CAD přeneseno: ${fromCad.holes} děr, ${fromCad.slots} drážek → ◎ Pohled na čelo, 🛠 Operace (doplňte nástroj)`, 6000);
  }
  try {
    const m = MODES[+localStorage.getItem(VIEW_KEY)];
    if (m && m !== 'off') setMode(m);
  } catch (_) { /* bez úložiště */ }
  CTRL.set(S, {
    redraw: () => redraw(false),
    sync,
    mach: () => machState(),
    // Blok v programu: dráhy v řezu; při přehrávání řádek G-kódu a údaj nad
    // časem (liveNcSync.js) — soustružení blok přeskakuje.
    nc: (f, mach) => {
      if (!prog.has()) return;
      const ops = getLiveOps(S.params);
      drawLivePaths(f.ctx, f.toScreen, livePathSegments(ops, S.params), S.showSimPath || 'all');
      if (!player.active || !mach || !mach.active) return;
      const m = liveMotionText(ops, mach);
      if (m && f.motionOverlay) { f.motionOverlay.textContent = m.text; f.motionOverlay.classList.toggle('cam-sim-motion-rapid', m.rapid); }
      const lines = prog.text().replace(/\r\n/g, '\n').split('\n');
      const li = liveCodeLine(lines, ops, mach);
      if (li != null) showLiveCodeLine(root, li, lines, deps.renderCodeMini);
    },
    // Běží / stojí vrtání ◎ — nástroj soustružení se nekreslí (drawToolpath).
    busy: () => player.active && !player.finished,
    mark: f => {
      if (!st.open || st.mode === 'solo') return;
      const c = cutState();
      if (c) drawCutMark(f, c.z, c.side, livePartGeometry(S).stockR);
    },
  });
}
