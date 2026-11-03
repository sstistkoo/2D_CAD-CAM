// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – 🛠 Úpravy výkresu (tlačítko v liště místo Smaž vše)   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 3. 11. 2026: okno s úpravami a kontrolou nákresu — uzavřít tvar
// kontury (po osách) a polotovaru (ke kontuře), kontrola mezer a nepřesností
// s opravou (contourCheck.js), normalizace barev kontura/polotovar a
// zvýraznění vodorovných/svislých čar. Výpočty: drawingEditOps.js.
// 🗑 Smazat výkres zůstává v Nastavení (#btnClearAll je v liště skryté).

import { state, pushUndo, showToast, STOCK_LAYER_ID } from '../state.js';
import { bridge } from '../bridge.js';
import { renderAll } from '../render.js';
import { calculateAllIntersections } from '../geometry.js';
import { makeInputOverlay } from '../dialogFactory.js';
import { inheritedProps } from '../objects.js';
import { updateObjectList, deleteObjectsByIndices } from '../ui.js';
import { findContourDuplicates } from '../stockTools.js';
import { contourDefaultColor, stockDefaultColor, setDrawColorPrefs, drawLineWeight, setDrawLineWeight } from '../drawColorPrefs.js';
import {
  closeContourToAxes, closeStockToContour, planColorNormalize, applyColorNormalize, classifyStraightLines,
} from './drawingEditOps.js';

const STYLE_ID = 'drawingEditsStyle';
const CSS = `
.dedit-dialog { max-width: 420px; }
.dedit-list { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; max-height: 62vh; overflow-y: auto; }
.dedit-btn { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left;
  padding: 8px 10px; border: 1px solid var(--ctp-surface1); border-radius: 8px;
  background: var(--ctp-surface0); color: var(--ctp-text); font-size: 14px; cursor: pointer; }
.dedit-btn:hover { border-color: var(--ctp-blue); }
.dedit-btn.active { border-color: var(--ctp-green); background: color-mix(in srgb, var(--ctp-green) 18%, var(--ctp-surface0)); }
.dedit-btn small { color: var(--ctp-subtext0); font-size: 12px; line-height: 1.3; }
.dedit-sec { color: var(--ctp-blue); font-size: 12px; margin: 6px 0 0; }
.dedit-style { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 6px 10px;
  border: 1px solid var(--ctp-surface1); border-radius: 8px; font-size: 13px; color: var(--ctp-subtext0); }
.dedit-style label { display: flex; align-items: center; gap: 4px; }
.dedit-style input[type="color"] { width: 36px; height: 26px; padding: 0; border: none; background: none; }
.dedit-weight { display: flex; gap: 4px; }
.dedit-weight button { padding: 4px 10px; border: 1px solid var(--ctp-surface1); border-radius: 6px;
  background: var(--ctp-surface0); color: var(--ctp-text); font-size: 13px; cursor: pointer; }
.dedit-weight button.active { border-color: var(--ctp-green); background: var(--ctp-green); color: var(--ctp-base); }
`;

function _ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
}

function _refresh() {
  updateObjectList();
  calculateAllIntersections();   // průsečíky + CNC kód z upraveného výkresu
  if (bridge.updateLayerList) bridge.updateLayerList();
  renderAll();
}

/**
 * Přidá úsečky jedním krokem Zpět; vzhled (vrstva, typ čáry, polotovar)
 * převezmou z `from`. Úsečka na ose (`onAxis`) je pomocná čára s konci
 * (`constr` + `finite`, `axisClose`) v barvě kontury/polotovaru — tvar je na
 * plátně uzavřený, ale do kontury ani CAM nevstupuje.
 */
function _addLines(lines, from) {
  pushUndo();
  const props = from ? inheritedProps(from) : {};
  delete props.finite;
  for (const { onAxis, ...l } of lines) {
    const obj = { type: 'line', ...props, ...l, id: state.nextId++ };
    if (onAxis) {
      Object.assign(obj, { type: 'constr', finite: true, axisClose: true, lineStyle: 'solidThin', dashed: false });
      delete obj.isStock;
    }
    state.objects.push(obj);
  }
  _refresh();
}

function _close(kind) {
  const res = kind === 'stock' ? closeStockToContour(state.objects, state.layers) : closeContourToAxes(state.objects, state.layers);
  if (!res.lines.length) { showToast(res.why || 'Není co uzavřít'); return; }
  _addLines(res.lines, res.from);
  const what = kind === 'stock' ? 'Polotovar uzavřen ke kontuře' : 'Kontura uzavřena po osách';
  const axis = res.lines.filter(l => l.onAxis).length;
  showToast(`🔒 ${what} (+${res.lines.length} ${res.lines.length === 1 ? 'úsečka' : 'úsečky'}${axis ? `, z toho ${axis} na ose jako pomocná – do CAM nejde` : ''}) — Zpět vrátí`, 4500);
}

function _check() {
  if (bridge.offerDrawingFixes && bridge.offerDrawingFixes({ all: true })) return;
  const dups = findContourDuplicates();
  if (dups.length && bridge.offerContourDuplicates) { bridge.offerContourDuplicates(dups); return; }
  showToast('Kontrola výkresu: nic k opravě ✓');
}

function _normalize() {
  const plan = planColorNormalize(state.objects, state.layers, {
    contourLayer: 0, stockLayer: STOCK_LAYER_ID,
    contourColor: contourDefaultColor(), stockColor: stockDefaultColor(), weight: drawLineWeight(),
  });
  const n = plan.objs.length + plan.layers.length;
  if (n === 0) { showToast('Barvy a tloušťka čar kontury a polotovaru jsou v pořádku ✓'); return; }
  pushUndo();
  applyColorNormalize(plan);
  _refresh();
  const w = plan.objs.filter(it => it.weight).length;
  showToast(`🎨 Sjednoceno: ${plan.objs.length} objektů${w ? ` (tloušťka u ${w})` : ''}${plan.layers.length ? `, ${plan.layers.length} vrstvy` : ''} — Zpět vrátí`, 3500);
}

function _toggleStraight(btn) {
  state.straightCheck = !state.straightCheck;
  btn.classList.toggle('active', state.straightCheck);
  btn.querySelector('.dedit-state').textContent = state.straightCheck ? 'ZAP' : 'VYP';
  renderAll();
  if (!state.straightCheck) { showToast('Kontrola rovných čar vypnuta – původní barvy'); return; }
  const list = classifyStraightLines(state.objects, state.layers);
  const near = list.filter(s => s.kind === 'near').length;
  showToast(near
    ? `📏 Rovné: ${list.length - near} zeleně · skoro rovné: ${near} červeně (opraví Kontrola a oprava)`
    : `📏 Rovné čáry: ${list.length} zeleně, žádná skoro rovná ✓`, 4500);
}

function _deleteConstr() {
  const idx = state.objects.map((o, i) => (o.type === 'constr' && !o.isDimension && !o.axisClose ? i : -1)).filter(i => i >= 0);
  if (idx.length === 0) { showToast('Ve výkresu nejsou pomocné čáry'); return; }
  pushUndo();
  deleteObjectsByIndices(idx);
  _refresh();
  showToast(`🧹 Smazáno pomocných čar: ${idx.length} — Zpět vrátí`, 3500);
}

/** Otevře okno Úpravy výkresu. */
export function openDrawingEditsDialog() {
  _ensureStyle();
  const constrN = state.objects.filter(o => o.type === 'constr' && !o.axisClose).length;
  const overlay = makeInputOverlay(`
    <div class="input-dialog dedit-dialog">
      <h3>🛠 Úpravy výkresu</h3>
      <div class="dedit-list">
        <div class="dedit-sec">Uzavřít tvar</div>
        <button type="button" class="dedit-btn" data-act="closeContour">🔒 Uzavřít konturu
          <small>Volné konce se spojí po osách X a Z (přes počátek 0,0). Čáry na ose jsou pomocné – do CAM nejdou.</small></button>
        <button type="button" class="dedit-btn" data-act="closeStock">🔒 Uzavřít polotovar
          <small>Konce polotovaru se po ose napojí na nejbližší bod kontury – vznikne obrys materiálu k obrobení.</small></button>
        <div class="dedit-sec">Kontrola</div>
        <button type="button" class="dedit-btn" data-act="check">🔧 Kontrola a oprava
          <small>Mezery, konce u osy, skoro rovné čáry (např. o 0,001), zdvojené čáry – stejná kontrola jako při přechodu do CAM, s opravou.</small></button>
        <button type="button" class="dedit-btn${state.straightCheck ? ' active' : ''}" data-act="straight">📏 Rovné čáry: <span class="dedit-state">${state.straightCheck ? 'ZAP' : 'VYP'}</span>
          <small>Vodorovné a svislé úsečky zeleně, skoro rovné červeně s odchylkou. Vypnutím se vrátí původní barvy.</small></button>
        <div class="dedit-sec">Barvy, tloušťka a úklid</div>
        <div class="dedit-style" title="Výchozí barva vrstev Kontura a Polotovar a tloušťka čar pro normalizaci (pamatuje si zařízení, stejné jako v Nastavení → Zobrazení)">
          <label>Kontura <input type="color" id="deditContourColor" value="${contourDefaultColor()}"></label>
          <label>Polotovar <input type="color" id="deditStockColor" value="${stockDefaultColor()}"></label>
          <span class="dedit-weight">
            <button type="button" data-weight="thin" class="${drawLineWeight() === 'thin' ? 'active' : ''}">Tenká</button>
            <button type="button" data-weight="thick" class="${drawLineWeight() === 'thick' ? 'active' : ''}">Tlustá</button>
          </span>
        </div>
        <button type="button" class="dedit-btn" data-act="normalize">🎨 Normalizovat barvy a tloušťku
          <small>Kontura i polotovar v barvě vrstvy a jedné tloušťce (souvislá čára); polotovar do vrstvy Polotovar.</small></button>
        <button type="button" class="dedit-btn" data-act="constr">🧹 Smazat pomocné čáry (${constrN})
          <small>Konstrukční a pomocné čáry (mimo konturu a CAM); uzávěry na ose zůstanou.</small></button>
      </div>
      <div class="btn-row">
        <button type="button" class="btn-cancel btn-cancel-overlay">Zavřít</button>
      </div>
    </div>`);
  const close = () => overlay.remove();
  const acts = {
    closeContour: () => { close(); _close('contour'); },
    closeStock: () => { close(); _close('stock'); },
    check: () => { close(); _check(); },
    straight: (btn) => _toggleStraight(btn),
    normalize: () => { close(); _normalize(); },
    constr: () => { close(); _deleteConstr(); },
  };
  overlay.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => acts[btn.dataset.act](btn)));
  // Barvy vrstev se mění hned (jako v Nastavení), tloušťka platí pro Normalizovat.
  const cInp = overlay.querySelector('#deditContourColor');
  const sInp = overlay.querySelector('#deditStockColor');
  const recolor = () => { if (bridge.updateLayerList) bridge.updateLayerList(); renderAll(); };
  cInp.addEventListener('change', () => { setDrawColorPrefs({ contour: cInp.value }); recolor(); });
  sInp.addEventListener('change', () => { setDrawColorPrefs({ stock: sInp.value }); recolor(); });
  const wBtns = [...overlay.querySelectorAll('[data-weight]')];
  wBtns.forEach(b => b.addEventListener('click', () => {
    setDrawLineWeight(b.dataset.weight);
    wBtns.forEach(x => x.classList.toggle('active', x === b));
  }));
  return overlay;
}

if (typeof document !== 'undefined') {
  document.getElementById('btnDrawingEdits')?.addEventListener('click', openDrawingEditsDialog);
}
