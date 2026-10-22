// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Díra do čela (jedna díra)                            ║
// ╚══════════════════════════════════════════════════════════════╝
// Nástroj Díra (tools/faceHoleClick.js): klepnutí do bokorysu → toto okno
// s polohou díry vůči středu čela (X0 Y0 = osa vřetena), Ø díry a hloubkou
// (holeDepthFields.js — Skrz / Do hloubky / Do Z, u Skrz i polotovar).
// „◎ Do čela" ji nakreslí přes bridge.drawHolesToFace stejně jako
// ◎ Rozmístění děr — jen jedna díra, bez roztečné kružnice (uživatel
// 20. 10. 2026). Ø a hloubka se pamatují pro další díru.
import { showToast } from '../state.js';
import { bridge } from '../bridge.js';
import { makeOverlay } from '../dialogFactory.js';
import { FACE_BTN } from './holePattern.js';
import { depthFieldsHtml, wireDepthFields, readDepth } from './holeDepthFields.js';
import { fmt, numVal as val, numField, outRow } from './calcKit.js';

const P = 'sh_';
let _last = null;   // { d, mode, value, mat } poslední nakreslená díra

/** Poloha díry polárně (pro osu C): Ø kružnice středu a úhel od +X. */
export function holePolar(x, y) {
  const r = Math.hypot(x, y);
  let a = Math.atan2(y, x) * 180 / Math.PI;
  if (a < 0) a += 360;
  return { dia: 2 * r, angle: r > 1e-9 ? a : 0 };
}

/**
 * @param [opts] { x, y } předvyplněná poloha vůči středu čela (klepnutí do
 *   bokorysu). Klik na tlačítko předá Event — ten se ignoruje.
 */
export function openSingleHoleCalc(opts) {
  const pre = opts && Number.isFinite(opts.x) && Number.isFinite(opts.y) ? opts : null;
  const old = document.querySelector('.calc-overlay[data-type="singleHole"]');
  if (old) old.remove();
  const body =
    '<div class="cnc-fields">' +
      numField('x', 'X', 'mm (C 0°)', '0', ' value="' + (pre ? fmt(pre.x) : 0) + '"') +
      numField('y', 'Y', 'mm (C 90°)', '0', ' value="' + (pre ? fmt(pre.y) : 0) + '"') +
      numField('d', 'Ø díry', 'mm', 'Ø', _last ? ' value="' + fmt(_last.d) + '"' : '') +
      depthFieldsHtml(P) +
    '</div>' +
    '<div class="calc-out" data-sh="out"></div>' +
    '<div class="cnc-actions">' + FACE_BTN + '</div>' +
    '<div class="calc-note">X0 Y0 = osa vřetena (střed bokorysu), X = C 0°, Y = C 90°. ' +
      '◎ Do čela nakreslí díru do aktuálního čela; hloubka se spočte z profilu při 📥 Z CAD.</div>';

  const overlay = makeOverlay('singleHole', '◎ Díra do čela', body);
  if (!overlay) return null;
  const q = id => overlay.querySelector('[data-id="' + id + '"]');
  const inp = { x: q('x'), y: q('y'), d: q('d') };
  const out = overlay.querySelector('[data-sh="out"]');

  if (_last) {
    q(P + 'depthMode').value = _last.mode;
    if (_last.value != null) q(P + 'depthVal').value = fmt(_last.value);
    if (_last.mat) q(P + 'depthMat').value = _last.mat;
  }
  wireDepthFields(overlay, P);

  const update = () => {
    const x = val(inp.x) ?? 0, y = val(inp.y) ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) { out.innerHTML = ''; return; }
    const p = holePolar(x, y);
    out.innerHTML = outRow('Polárně (osa C)', 'Ø' + fmt(p.dia) + ' · C ' + fmt(p.angle) + '°');
  };
  [inp.x, inp.y].forEach(i => i.addEventListener('input', update));
  update();

  overlay.querySelector('[data-face-draw]').addEventListener('click', () => {
    const d = val(inp.d), x = val(inp.x) ?? 0, y = val(inp.y) ?? 0;
    if (!(d > 0)) { showToast('Zadej Ø díry'); inp.d.focus(); return; }
    if (Number.isNaN(x) || Number.isNaN(y)) { showToast('Neplatná poloha díry'); return; }
    const dep = readDepth(overlay, P);
    if (dep.error) { showToast(dep.error); return; }
    const n = bridge.drawHolesToFace && bridge.drawHolesToFace({ holes: [{ x, y }], d, depth: dep.spec, thread: dep.thread });
    if (!n) return;
    _last = { d, mode: dep.spec.mode, value: dep.spec.value ?? null, mat: dep.spec.stock ? 'stock' : 'part' };
    overlay.remove();
  });
  if (!(val(inp.d) > 0)) inp.d.focus();
  return overlay;
}
