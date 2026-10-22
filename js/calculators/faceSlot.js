// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Drážka do čela (ovál) — okno                          ║
// ╚══════════════════════════════════════════════════════════════╝
// Nástroj Drážka (tools/slotClick.js): klepnutí do BOKORYSU → toto okno se
// středem drážky v místě klepnutí (vůči středu čela); klepnutí na existující
// drážku čela ji otevře k úpravě (uživatel 22. 10. 2026). Délka (vnější,
// vč. zaoblení), šířka (libovolná — širší než fréza CAM vyfrézuje víc
// průjezdy), úhel osy (↻ radiálně / ⟂ tečně ke středu), hloubka jako díry
// (holeDepthFields.js: skrz / hloubka / do Z, u skrz i polotovar). „◎ Do čela"
// kreslí přes bridge.drawFaceSlot (faceView/facePattern.js).
import { showToast } from '../state.js';
import { bridge } from '../bridge.js';
import { makeOverlay } from '../dialogFactory.js';
import { getFaceLayers } from '../faceView/faceLayer.js';
import { stadiumOf } from '../faceView/faceSlots.js';
import { holePolar } from './singleHole.js';
import { depthFieldsHtml, wireDepthFields, readDepth } from './holeDepthFields.js';
import { fmt, numVal as val, numField, outRow } from './calcKit.js';

const P = 'fsl_';
let _last = null;   // { len, w, mode, value, mat }

/** Údaje existující drážky (polylina čela) pro okno: střed, délka, šířka, úhel. */
export function faceSlotSpec(o, origin) {
  const s = stadiumOf(o);
  if (!s) return null;
  const cx = (s.x1 + s.x2) / 2 - origin.x, cy = (s.y1 + s.y2) / 2 - origin.y;
  const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  let a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180 / Math.PI;
  if (a < 0) a += 180;
  if (a >= 180) a -= 180;
  return { cx, cy, len: L + s.w, w: s.w, angle: L > 1e-9 ? a : 0 };
}

/**
 * @param opts { x, y } střed vůči středu čela (klepnutí do bokorysu), nebo { edit: polylina drážky }
 */
export function openFaceSlotCalc(opts = {}) {
  const old = document.querySelector('.calc-overlay[data-type="faceSlot"]');
  if (old) old.remove();
  const edit = opts.edit || null;
  const face = edit ? getFaceLayers().find(l => l.id === edit.layer) : null;
  const e = edit && face ? faceSlotSpec(edit, face.origin) : null;
  const x0 = e ? e.cx : (opts.x ?? 0), y0 = e ? e.cy : (opts.y ?? 0);
  // Výchozí osa radiálně (k ose vřetena) — nejčastější drážka na čele.
  const a0 = e ? e.angle : (Math.hypot(x0, y0) > 1e-6 ? holePolar(x0, y0).angle % 180 : 0);
  const body =
    '<div class="cnc-fields">' +
      numField('x', 'X středu', 'mm (C 0°)', '0', ' value="' + fmt(x0) + '"') +
      numField('y', 'Y středu', 'mm (C 90°)', '0', ' value="' + fmt(y0) + '"') +
      numField('len', 'Délka (vnější)', 'mm', 'L', ' value="' + fmt(e ? e.len : _last ? _last.len : 30) + '"') +
      numField('w', 'Šířka', 'mm', 'b', e ? ' value="' + fmt(e.w) + '"' : _last ? ' value="' + fmt(_last.w) + '"' : '') +
      numField('a', 'Úhel osy', '°', '0', ' value="' + fmt(a0) + '"') +
      depthFieldsHtml(P, { thread: false }) +
    '</div>' +
    '<div class="cnc-actions"><button class="cnc-btn" data-fs="rad" title="Osa drážky míří ke středu čela">↻ Radiálně</button>' +
      '<button class="cnc-btn" data-fs="tan" title="Osa drážky kolmo k paprsku (po obvodu)">⟂ Tečně</button></div>' +
    '<div class="calc-out" data-fs="out"></div>' +
    '<div class="cnc-actions"><button class="cnc-btn" data-fs="draw" style="background:var(--ctp-surface1);color:var(--ctp-peach)">'
      + (edit ? '✔ Upravit drážku' : '◎ Do čela') + '</button></div>' +
    '<div class="calc-note">X0 Y0 = osa vřetena (střed bokorysu). Drážka se nakreslí obrysem do aktuálního čela; ' +
      'v CAM frézování Drážka — širší než fréza se vyfrézuje víc průjezdy kolem osy. Hloubka se spočte z profilu při přenosu do CAM.</div>';

  const overlay = makeOverlay('faceSlot', edit ? '◎ Upravit drážku v čele' : '◎ Drážka do čela', body);
  if (!overlay) return null;
  const q = id => overlay.querySelector('[data-id="' + id + '"]');
  const inp = { x: q('x'), y: q('y'), len: q('len'), w: q('w'), a: q('a') };
  const out = overlay.querySelector('[data-fs="out"]');
  const dep = edit ? edit.holeDepth : _last;
  if (dep) {
    q(P + 'depthMode').value = dep.mode;
    if (dep.value != null) q(P + 'depthVal').value = fmt(dep.value);
    if (dep.stock || dep.mat === 'stock') q(P + 'depthMat').value = 'stock';
  }
  wireDepthFields(overlay, P);

  const update = () => {
    const x = val(inp.x) ?? 0, y = val(inp.y) ?? 0, L = val(inp.len), w = val(inp.w), a = val(inp.a) ?? 0;
    if ([x, y, a].some(Number.isNaN)) { out.innerHTML = ''; return; }
    const p = holePolar(x, y);
    let h = outRow('Střed polárně (osa C)', 'Ø' + fmt(p.dia) + ' · C ' + fmt(p.angle) + '°');
    if (L > 0 && w > 0 && L >= w) {
      const t = a * Math.PI / 180, hh = (L - w) / 2;
      const r1 = Math.hypot(x - Math.cos(t) * hh, y - Math.sin(t) * hh), r2 = Math.hypot(x + Math.cos(t) * hh, y + Math.sin(t) * hh);
      h += outRow('Osa drážky (středy konců)', 'Ø' + fmt(2 * Math.min(r1, r2)) + ' … Ø' + fmt(2 * Math.max(r1, r2)));
    }
    out.innerHTML = h;
  };
  Object.values(inp).forEach(i => i.addEventListener('input', update));
  overlay.querySelector('[data-fs="rad"]').addEventListener('click', () => {
    const x = val(inp.x) ?? 0, y = val(inp.y) ?? 0;
    inp.a.value = fmt(Math.hypot(x, y) > 1e-6 ? holePolar(x, y).angle % 180 : 0); update();
  });
  overlay.querySelector('[data-fs="tan"]').addEventListener('click', () => {
    const x = val(inp.x) ?? 0, y = val(inp.y) ?? 0;
    inp.a.value = fmt(((Math.hypot(x, y) > 1e-6 ? holePolar(x, y).angle : 0) + 90) % 180); update();
  });
  update();

  overlay.querySelector('[data-fs="draw"]').addEventListener('click', () => {
    const x = val(inp.x) ?? 0, y = val(inp.y) ?? 0, L = val(inp.len), w = val(inp.w), a = val(inp.a) ?? 0;
    if (!(w > 0)) { showToast('Zadej šířku drážky'); inp.w.focus(); return; }
    if (!(L >= w)) { showToast('Délka musí být aspoň šířka drážky'); return; }
    if ([x, y, a].some(Number.isNaN)) { showToast('Neplatná poloha nebo úhel'); return; }
    const d = readDepth(overlay, P);
    if (d.error) { showToast(d.error); return; }
    const ok = bridge.drawFaceSlot && bridge.drawFaceSlot({ cx: x, cy: y, len: L, w, angle: a, depth: d.spec }, edit);
    if (!ok) return;
    _last = { len: L, w, mode: d.spec.mode, value: d.spec.value ?? null, mat: d.spec.stock ? 'stock' : 'part' };
    overlay.remove();
  });
  if (!(val(inp.w) > 0)) inp.w.focus();
  return overlay;
}
