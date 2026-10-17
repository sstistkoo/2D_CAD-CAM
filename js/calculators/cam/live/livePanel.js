// Panel POHLED NA ČELO + editor operací poháněných nástrojů v CAM simulátoru.
//
// Tlačítko ◎ v liště plátna rozdělí plochu: vlevo dosavadní řez, vpravo
// (na výšku dole) pohled podél osy proti sklíčidlu / upínací desce. V hlavičce
// pohledu: ▶ přehraje pořadí vrtání/frézování, 🛠 Operace otevře editor
// (vrtání do čela / do pláště, kapsa, drážka; přepínač NC výstupu SPOS /
// osa C / TRANSMIT; cykly × rozepsané pohyby; M-kódy stroje).
//
// Program: „📝 Zapsat do programu" vloží blok mezi značky (liveMarkers.js)
// před konec programu; je-li blok už v programu, každá další úprava operací
// ho přepíše sama. Zápis jde přes textarea programu (událost input) — stejná
// cesta jako ruční úprava, takže platí ochrana ručních zásahů, uložení i ↩.
//
// camSimulator.js volá jen initLiveTools() a drawCanvas.js liveAfterDraw().
import { showToast } from '../../../state.js';
import { safeEvalMath } from '../../../utils.js';
import {
  LIVE_MODES, liveSettings, newLiveOp, normalizeLiveOp, getLiveOps, liveOpProblems, liveOpSummary,
} from './liveModel.js';
import { buildLiveBlock } from './liveGcode.js';
import { insertLiveBlock, removeLiveBlock, findLiveBlock, liveBlockTag } from './liveMarkers.js';
import { drawFaceView, livePartGeometry, liveAnimSteps } from './liveFaceView.js';
import { drawLiveSectionLayer } from './liveSection.js';
import { LIVE_CSS } from './liveStyles.js';

const CTRL = new WeakMap();   // S → ovladač otevřeného simulátoru
const VIEW_KEY = 'skica-cam-live-view';

/** Volá drawCanvas.js po vykreslení řezu. */
export function liveAfterDraw(f) {
  drawLiveSectionLayer(f);
  const c = CTRL.get(f.S);
  if (c) c.redraw();
}

/**
 * @param deps { S, root, canvasWrap, toolbar, draw, pushHistory, saveState }
 */
export function initLiveTools(deps) {
  const { S, root, canvasWrap, toolbar } = deps;
  if (!document.getElementById('cam-live-css')) {
    const st = document.createElement('style');
    st.id = 'cam-live-css'; st.textContent = LIVE_CSS;
    document.head.appendChild(st);
  }
  const st = { open: false, editor: false, selected: 0, anim: null, timer: null, key: '', edKey: '' };

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
      <span class="cam-live-title">◎ Pohled na čelo</span>
      <button data-live="play" title="Přehrát pořadí vrtání / frézování">▶</button>
      <button data-live="editor" title="Operace poháněnými nástroji: vrtání do čela a pláště, frézování kapes a drážek, NC výstup">🛠 Operace</button>
      <button data-live="close" title="Zavřít pohled na čelo">✕</button>
    </div>
    <div class="cam-live-cv"><canvas></canvas></div>
    <div class="cam-live-ed" hidden></div>`;
  row.appendChild(pane);
  const cvWrap = pane.querySelector('.cam-live-cv');
  const cv = cvWrap.querySelector('canvas');
  const ed = pane.querySelector('.cam-live-ed');
  const playBtn = pane.querySelector('[data-live="play"]');
  const edBtn = pane.querySelector('[data-live="editor"]');

  // Tlačítko v liště plátna (vždy viditelné, i ve sbalené liště »«).
  const btn = document.createElement('button');
  btn.dataset.live = 'toggle';
  btn.textContent = '◎';
  btn.title = 'Pohled na čelo (proti sklíčidlu / upínací desce) vedle řezu + poháněné nástroje';
  toolbar.insertBefore(btn, toolbar.querySelector('[data-act="toggle-controls"]'));
  btn.addEventListener('click', () => setOpen(!st.open));

  const ro = new ResizeObserver(() => {
    const w = cvWrap.clientWidth, h = cvWrap.clientHeight;
    if (w > 0 && h > 0 && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
    redraw(true);
  });
  ro.observe(cvWrap);

  function setOpen(on) {
    st.open = on;
    pane.hidden = !on;
    btn.classList.toggle('cam-sim-active', on);
    root.classList.toggle('cam-live-on', on);
    try { localStorage.setItem(VIEW_KEY, on ? '1' : '0'); } catch (_) { /* soukromé okno */ }
    if (!on) stopAnim();
    // Plátno řezu změnilo šířku — vycentrovat (🎯 i ve sbalené liště).
    toolbar.querySelector('[data-act="fit"]')?.click();
    if (on) { if (st.editor) renderEditor(); redraw(true); }
  }

  // ── kreslení ──
  function viewKey() {
    const p = S.params;
    return JSON.stringify([p.liveOps, p.stockMode, p.stockDiameter, p.mode, p.machineStructure,
      S.contourPoints, S.stockPoints, cv.width, cv.height, st.selected, st.anim && st.anim.step]);
  }
  function redraw(force) {
    if (!st.open) return;
    if (!document.body.contains(pane)) { stopAnim(); return; }
    const k = viewKey();
    if (!force && k === st.key) { syncEditor(); return; }
    st.key = k;
    const ops = getLiveOps(S.params);
    drawFaceView(cv, {
      prms: S.params, geo: livePartGeometry(S), ops,
      selected: st.editor && ops.length ? st.selected : null,
      anim: st.anim, steps: st.anim ? st.anim.steps : null,
    });
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
      String(S.manualGCode || '').length]);
  }

  // ── přehrávání ──
  function stopAnim() {
    if (st.timer) clearTimeout(st.timer);
    st.timer = null; st.anim = null; playBtn.textContent = '▶';
  }
  function tick() {
    if (!st.anim || !document.body.contains(pane)) { stopAnim(); return; }
    const s = st.anim.steps[st.anim.step];
    redraw(true);
    if (st.anim.step >= st.anim.steps.length - 1) {
      st.timer = setTimeout(() => { stopAnim(); redraw(true); }, 1500);
      return;
    }
    st.timer = setTimeout(() => { st.anim.step++; tick(); }, s.kind === 'hole' ? 450 : 60);
  }
  playBtn.addEventListener('click', () => {
    if (st.anim) { stopAnim(); redraw(true); return; }
    const steps = liveAnimSteps(getLiveOps(S.params));
    if (!steps.length) { showToast('Žádné operace — přidejte je přes 🛠 Operace'); return; }
    st.anim = { steps, step: 0 };
    playBtn.textContent = '⏸';
    tick();
  });

  // ── program: blok mezi značkami ──
  function programText() { return String(S.manualGCode || ''); }
  function programBlockState() {
    const lines = programText().replace(/\r\n/g, '\n').split('\n');
    const b = findLiveBlock(lines);
    if (!b) return { cls: '', text: 'Blok poháněných nástrojů zatím není v programu.' };
    const tag = liveBlockTag(lines);
    const want = buildLiveBlock(S.params);
    const same = want.join('\n') === lines.slice(b.start, b.end + 1).join('\n');
    if (same) return { cls: 'ok', text: '✔ Blok je v programu a odpovídá operacím (úpravy se do něj zapisují samy).' };
    const set = liveSettings(S.params);
    if (tag && (tag.ctrl !== (S.params.controlSystem || 'sinumerik') || tag.mode !== set.mode))
      return { cls: 'warn', text: `⚠ Blok v programu je pro ${tag.ctrl}/${tag.mode} — klikněte na 📝 Zapsat.` };
    return { cls: 'warn', text: '⚠ Blok v programu neodpovídá operacím — klikněte na 📝 Zapsat.' };
  }
  function writeBlock(withHistory) {
    const ta = root.querySelector('.cam-sim-manual-ta');
    if (!ta) return false;
    if (ta.readOnly) { showToast('Celý program je jen náhled — přepněte na část programu (poslední operaci)'); return false; }
    // Části programu (➕ Operace / Po úsecích): blok patří na KONEC celku. V jiné
    // než poslední části by po něm další soustružení jelo se zastaveným
    // vřetenem, posuvem mm/min a poháněným nástrojem v revolveru.
    if (S.opParts && S.opParts.length > 1 && S.activePart !== S.opParts.length - 1) {
      showToast('Blok poháněných nástrojů patří do POSLEDNÍ části programu — přepněte na ni', 4000);
      return false;
    }
    const block = buildLiveBlock(S.params);
    const code = ta.value;
    const next = block.length ? insertLiveBlock(code, block) : removeLiveBlock(code);
    if (next === code) return false;
    if (withHistory) deps.pushHistory();
    ta.value = next;
    ta.dispatchEvent(new Event('input'));
    return true;
  }

  // ── úpravy operací ──
  function commit(mutate) {
    stopAnim();   // kroky přehrávání se počítaly z původních operací
    deps.pushHistory();
    mutate(S.params);
    deps.saveState();
    // Blok už v programu je → přepsat ho (bez další položky historie).
    if (findLiveBlock(programText().split('\n'))) writeBlock(false);
    deps.draw();
    renderEditor();
    redraw(true);
  }
  function opsCopy() { return getLiveOps(S.params).map(o => JSON.parse(JSON.stringify(o))); }

  pane.addEventListener('click', e => {
    const b = e.target.closest('[data-live]');
    if (!b || b === btn) return;
    const act = b.dataset.live;
    const card = b.closest('[data-op]');
    const oi = card ? +card.dataset.op : -1;
    if (act === 'editor') {
      st.editor = !st.editor; ed.hidden = !st.editor; edBtn.classList.toggle('cam-sim-active', st.editor);
      if (st.editor) renderEditor();
      redraw(true);
    } else if (act === 'close') setOpen(false);
    else if (act === 'add-drill' || act === 'add-mill') {
      const ops = opsCopy();
      const geo = livePartGeometry(S);
      ops.push(newLiveOp(act === 'add-mill' ? 'mill' : 'drill', geo, ops.length + 1));
      st.selected = ops.length - 1;
      commit(p => { p.liveOps = ops; });
    } else if (act === 'write') {
      if (!getLiveOps(S.params).length) { showToast('Nejdřív přidejte operaci'); return; }
      if (writeBlock(true)) showToast('Blok poháněných nástrojů zapsán do programu (před konec programu)');
      else showToast('Blok v programu už je aktuální');
      renderEditor();
    } else if (act === 'unwrite') {
      const ta = root.querySelector('.cam-sim-manual-ta');
      if (!ta || ta.readOnly) return;
      const next = removeLiveBlock(ta.value);
      if (next === ta.value) { showToast('Blok v programu není'); return; }
      deps.pushHistory(); ta.value = next; ta.dispatchEvent(new Event('input'));
      showToast('Blok poháněných nástrojů odebrán z programu');
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

  const NUM_KEYS = new Set(['pcd', 'count', 'startAngle', 'zTop', 'xTop', 'zPos', 'holeD', 'depth', 'peck',
    'dwell', 'safe', 'retract', 'toolD', 'stepDown', 'toolNo', 'rpm', 'feed', 'slot.x1', 'slot.y1', 'slot.x2', 'slot.y2']);
  ed.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.g) {
      const g = el.dataset.g;
      const ctrl = S.params.controlSystem || 'sinumerik';
      commit(p => {
        const live = JSON.parse(JSON.stringify(p.live || {}));
        if (g === 'mode') live.mode = el.value;
        else if (g === 'cycles') live.cycles = el.checked;
        else if (g.startsWith('m.')) {
          live.m = live.m || {}; live.m[ctrl] = { ...(live.m[ctrl] || {}), [g.slice(2)]: el.value.trim() };
        }
        p.live = live;
      });
      return;
    }
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
    const bs = programBlockState();
    const modeOpts = Object.entries(LIVE_MODES).map(([k, t]) => `<option value="${k}"${k === set.mode ? ' selected' : ''}>${t}</option>`).join('');
    const mf = (k, t) => `<label class="cam-live-f"><span>${t}</span><input data-g="m.${k}" type="text" value="${esc(set.m[k])}"></label>`;
    let h = `
      <h4>Výstup NC (${ctrl === 'fanuc' ? 'Fanuc' : ctrl === 'heidenhain' ? 'Heidenhain' : 'Sinumerik'})</h4>
      <div class="cam-live-grid">
        <label class="cam-live-f"><span>Polohování / interpolace</span><select data-g="mode">${modeOpts}</select></label>
        <label class="cam-live-f" title="Vrtací cykly (CYCLE82/83, G83/G87). Vypnuto = rozepsané G0/G1 pohyby. Heidenhain vždy rozepsané."><span>Vrtací cykly</span><input data-g="cycles" type="checkbox"${set.cycles ? ' checked' : ''}></label>
      </div>
      <details class="cam-live-note"><summary>M-kódy stroje (osa C, poháněný nástroj) – ověřte v příručce stroje</summary>
        <div class="cam-live-grid">${mf('cOn', 'Osa C zap')}${mf('cOff', 'Osa C vyp')}${mf('toolOn', 'Nástroj start')}${mf('toolOff', 'Nástroj stop')}${mf('toolS', 'Adresa otáček')}</div>
      </details>
      <div class="cam-live-note">${modeNote(set.mode, ctrl)}</div>
      <div class="cam-live-btns">
        <button data-live="add-drill">➕ Vrtání</button>
        <button data-live="add-mill">➕ Frézování</button>
        <button data-live="write" title="Vloží blok poháněných nástrojů do programu před jeho konec (M30), nebo přepíše ten, který už tam je">📝 Zapsat do programu</button>
        <button data-live="unwrite" title="Odebere blok poháněných nástrojů z programu">🗑 Z programu</button>
      </div>
      <div class="cam-live-status ${bs.cls}">${bs.text}</div>`;
    if (!ops.length) h += '<div class="cam-live-note">Zatím žádné operace. Přidejte vrtání nebo frézování.</div>';
    const dotCol = op => op.kind === 'mill' ? '#cba6f7' : (op.side === 'radial' ? '#94e2d5' : '#fab387');
    ops.forEach((op, i) => {
      const sel = i === st.selected;
      h += `<div class="cam-live-card${sel ? ' sel' : ''}" data-op="${i}">
        <div class="cam-live-card-h" data-live="sel">
          <span class="cam-live-dot" style="background:${dotCol(op)}"></span>
          <span class="t"><b>${i + 1}. ${esc(op.name)}</b><small>${esc(liveOpSummary(op))}</small></span>
          <button data-live="up" title="Dřív">▲</button><button data-live="down" title="Později">▼</button>
          <button data-live="del" title="Smazat operaci">✕</button>
        </div>
        ${sel ? `<div class="cam-live-card-b">${opForm(op)}</div>` : ''}
      </div>`;
    });
    ed.innerHTML = h;
    st.edKey = edKey();
  }

  try { if (localStorage.getItem(VIEW_KEY) === '1') setOpen(true); } catch (_) { /* bez úložiště */ }
  CTRL.set(S, { redraw: () => redraw(false) });
}

function modeNote(mode, ctrl) {
  if (ctrl === 'heidenhain') return 'Heidenhain: díry polohuje osa C, pohyby se rozepíší (G0/G1); frézování po krátkých G1 v X + C.';
  if (mode === 'spos') return 'SPOS: vřeteno se natočí na úhel díry a vrtá se v poloze nástroje (+X). Frézování mimo osu jde přes osu C.';
  if (mode === 'caxis') return 'Osa C: díry se polohují C=úhel. Frézování se rozloží na krátké G1 v X + C.';
  return ctrl === 'fanuc'
    ? 'G12.1: frézování v polární interpolaci (X = Ø, C = Y). Vrtání G83/G87 s osou C.'
    : 'TRANSMIT: na čele kartézsky X/Y (v poloměru). Radiální díry se polohují osou C.';
}

function opForm(op) {
  const f = (k, t, v, wide) => `<label class="cam-live-f${wide ? ' wide' : ''}"><span>${t}</span><input data-k="${k}" type="text" inputmode="decimal" value="${esc(v)}"></label>`;
  const txt = (k, t, v) => `<label class="cam-live-f"><span>${t}</span><input data-k="${k}" type="text" value="${esc(v)}"></label>`;
  const sel = (k, t, v, opts) => `<label class="cam-live-f"><span>${t}</span><select data-k="${k}">${opts.map(([val, lbl]) => `<option value="${val}"${val === v ? ' selected' : ''}>${lbl}</option>`).join('')}</select></label>`;
  const radial = op.kind === 'drill' && op.side === 'radial';
  const slot = op.kind === 'mill' && op.millType === 'slot';
  let h = '<div class="cam-live-grid">';
  h += txt('name', 'Název', op.name);
  if (op.kind === 'drill') h += sel('side', 'Kam', op.side, [['face', 'Do čela (osa Z)'], ['radial', 'Do pláště (osa X)']]);
  else h += sel('millType', 'Frézování', op.millType, [['pocket', 'Kruhová kapsa'], ['slot', 'Drážka (přímá)']]);
  if (!slot) {
    h += sel('pattern', 'Rozmístění', op.pattern, [['pcd', radial ? 'Po obvodu' : 'Roztečná kružnice'], ['points', 'Seznam bodů']]);
    if (op.pattern === 'pcd') {
      if (!radial) h += f('pcd', 'Ø rozteče', op.pcd);
      h += f('count', 'Počet', op.count) + f('startAngle', 'Počáteční úhel °', op.startAngle);
      if (radial) h += f('zPos', 'Z děr', op.zPos);
    } else {
      h += `<label class="cam-live-f wide"><span>Body – řádek = „úhel; ${radial ? 'Z' : 'poloměr'}"</span><textarea data-k="points">${esc(op.points)}</textarea></label>`;
    }
  } else {
    h += f('slot.x1', 'X1', op.slot.x1) + f('slot.y1', 'Y1', op.slot.y1) + f('slot.x2', 'X2', op.slot.x2) + f('slot.y2', 'Y2', op.slot.y2);
  }
  h += radial ? f('xTop', 'Ø pláště', op.xTop) : f('zTop', 'Z čela', op.zTop);
  if (op.kind === 'drill') {
    h += f('holeD', 'Ø díry', op.holeD) + f('depth', 'Hloubka', op.depth);
    h += f('peck', 'Krok vrtání (0 = naráz)', op.peck) + f('dwell', 'Prodleva dole [s]', op.dwell);
  } else {
    if (!slot) h += f('holeD', 'Ø kapsy', op.holeD);
    h += f('toolD', slot ? 'Ø frézy = šířka' : 'Ø frézy', op.toolD) + f('depth', 'Hloubka', op.depth) + f('stepDown', 'Krok do hloubky', op.stepDown);
  }
  h += f('safe', 'Bezpečná vzdálenost', op.safe) + f('retract', 'Odjezd nad plochu', op.retract);
  h += txt('toolName', 'Nástroj', op.toolName) + f('toolNo', 'Číslo T', op.toolNo);
  h += f('rpm', 'Otáčky [1/min]', op.rpm) + f('feed', 'Posuv [mm/min]', op.feed);
  h += '</div>';
  const probs = liveOpProblems(op);
  if (probs.length) h += `<div class="cam-live-prob">${probs.map(esc).join('<br>')}</div>`;
  return h;
}

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
