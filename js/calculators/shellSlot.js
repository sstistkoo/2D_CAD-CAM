// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Drážka pro pero do pláště — okno                     ║
// ╚══════════════════════════════════════════════════════════════╝
// Nástroj Drážka (tools/slotClick.js): klepnutí v NÁRYSU na díl → toto okno
// se Z z klepnutí (střed drážky); klepnutí na existující drážku pro pero ji
// otevře k úpravě (uživatel 22. 10. 2026). Zadává se délka (vnější vč.
// zaoblení), šířka (= Ø frézy), hloubka od pláště / do Ø, počet drážek po
// obvodu a úhel C první — ručně nebo „Natočit podle" díry v čele (+ odsazení).
// Okno ukáže Ø pláště, hloubku a Z konců; „Do pláště" kreslí přes
// bridge.drawShellSlot (faceView/shellHoleDraw.js). „Ovál (obecně)" otevře
// původní oválnou drážku (2D kresba, bez CAM).
import { showToast } from '../state.js';
import { bridge } from '../bridge.js';
import { makeOverlay } from '../dialogFactory.js';
import { resolveShellSlot, shellSlotSpan } from '../faceView/shellSlots.js';
import { shellAngles } from '../faceView/shellHoles.js';
import { faceHoleRefs } from './shellHole.js';
import { fmt, numVal as val, numField, selectField, outRow, outWarn } from './calcKit.js';

const MODES = [['depth', 'Do hloubky (od pláště)'], ['dia', 'Do Ø (dno drážky)']];
let _last = null;   // { w, len, mode, value, count }

/**
 * @param opts { z } střed drážky z klepnutí, nebo { edit: objekt drážky }
 * @param onOval otevřít obecnou oválnou drážku (2D) místo drážky pro pero
 */
export function openShellSlotCalc(opts = {}, onOval = null) {
  const old = document.querySelector('.calc-overlay[data-type="shellSlot"]');
  if (old) old.remove();
  const edit = opts.edit && opts.edit.shellSlot ? opts.edit : null;
  const s = edit ? edit.shellSlot : null;
  const span = edit ? shellSlotSpan(edit) : null;
  const zMid = span ? (span.z1 + span.z2) / 2 : (opts.z ?? 0);
  const len = span ? span.z1 - span.z2 : (_last ? _last.len : 40);
  const refs = faceHoleRefs();
  const body =
    '<div class="cnc-fields">' +
      numField('z', 'Z středu drážky', 'mm', 'Z', ' value="' + fmt(zMid) + '"') +
      numField('len', 'Délka (vnější)', 'mm', 'L', ' value="' + fmt(len) + '"') +
      numField('w', 'Šířka = Ø frézy', 'mm', 'b', s ? ' value="' + fmt(s.w) + '"' : _last ? ' value="' + fmt(_last.w) + '"' : '') +
      selectField('mode', 'Hloubka', MODES) +
      numField('val', 'Hloubka od pláště', 'mm', 't₁') +
      numField('n', 'Počet po obvodu', 'ks', '1', ' value="' + (s ? s.count : _last ? _last.count : 1) + '"') +
      (refs.length ? selectField('ref', 'Natočit podle', [['', 'Ručně (úhel C)'], ...refs.map(r => [r.key, r.label])]) : '') +
      numField('a', 'Úhel C drážky', '°', '0', ' value="' + fmt(s ? s.angle : 90) + '"') +
      (refs.length ? numField('off', 'Odsazení od díry v čele', '°', '0', ' value="0"') : '') +
    '</div>' +
    '<div class="calc-out" data-slot="out"></div>' +
    '<div class="cnc-actions"><button class="cnc-btn" data-slot-draw style="background:var(--ctp-surface1);color:#cba6f7">'
      + (edit ? '✔ Upravit drážku' : '⊐ Do pláště') + '</button>'
      + (onOval && !edit ? '<button class="cnc-btn" data-slot-oval title="Obecná oválná drážka (2D kresba, do CAM nejde)">Ovál (obecně)</button>' : '')
      + '</div>' +
    '<div class="calc-note">Drážka pro pero podél osy vřetena: v nárysu úsečka na plášti mezi konci drážky, obrys skrytou čarou; ' +
      'v bokorysu na svém úhlu C. Plášť musí být po celé délce stejný. V CAM: frézování Drážka pro pero — kus stojí na úhlu C, ' +
      'fréza Ø = šířka zanoří v X a jede v Z po vrstvách.</div>';

  const overlay = makeOverlay('shellSlot', edit ? '⊐ Upravit drážku pro pero' : '⊐ Drážka pro pero do pláště', body);
  if (!overlay) return null;
  const q = id => overlay.querySelector('[data-id="' + id + '"]');
  const inp = { z: q('z'), len: q('len'), w: q('w'), mode: q('mode'), val: q('val'), n: q('n'), a: q('a'), ref: q('ref'), off: q('off') };
  const out = overlay.querySelector('[data-slot="out"]');

  const dep0 = s ? s.depth : _last ? { mode: _last.mode, value: _last.value } : { mode: 'depth', value: null };
  inp.mode.value = dep0.mode;
  if (dep0.value != null) inp.val.value = fmt(dep0.value);
  const syncMode = () => {
    const span2 = inp.val.closest('label').querySelector('span');
    span2.innerHTML = (inp.mode.value === 'dia' ? 'Ø dna drážky' : 'Hloubka od pláště') + ' <small>mm</small>';
    inp.val.placeholder = inp.mode.value === 'dia' ? 'Ø' : 't₁';
  };
  const syncRef = () => {
    if (!inp.ref) return;
    const r = refs.find(x => x.key === inp.ref.value);
    inp.a.disabled = !!r;
    inp.off.closest('label').style.display = r ? '' : 'none';
    if (r) inp.a.value = fmt(((r.angle + (val(inp.off) || 0)) % 360 + 360) % 360);
  };

  const read = () => {
    const z = val(inp.z), L = val(inp.len), w = val(inp.w), v = val(inp.val), n = val(inp.n), a = val(inp.a);
    if (z === null || Number.isNaN(z)) return { error: 'Zadej Z středu drážky' };
    if (!(w > 0)) return { error: 'Zadej šířku drážky (Ø frézy)' };
    if (!(L >= w)) return { error: 'Délka musí být aspoň šířka drážky' };
    if (Number.isNaN(v)) return { error: 'Neplatná hodnota u hloubky' };
    const mode = inp.mode.value;
    if (mode === 'depth' && !(v > 0)) return { error: 'Zadej hloubku drážky (> 0)' };
    if (mode === 'dia' && !(v >= 0)) return { error: 'Zadej Ø dna drážky' };
    if (!(n >= 1) || Math.round(n) !== n) return { error: 'Počet po obvodu = celé číslo ≥ 1' };
    if (a === null || Number.isNaN(a)) return { error: 'Zadej úhel C' };
    const r = inp.ref && refs.find(x => x.key === inp.ref.value);
    return {
      z1: z + L / 2, z2: z - L / 2,
      spec: {
        w, depth: { mode, value: v }, count: n, angle: a,
        ...(r ? { ref: `${r.label}${val(inp.off) ? ` ${val(inp.off) > 0 ? '+' : ''}${fmt(val(inp.off))}°` : ''}` } : {}),
      },
    };
  };

  const update = () => {
    syncRef();
    const r = read();
    if (r.error) { out.innerHTML = ''; return; }
    const res = resolveShellSlot(r.spec, r.z1, r.z2);
    out.innerHTML = (res.xTop ? outRow('Ø pláště', 'Ø' + fmt(res.xTop)) : '')
      + (res.error ? outWarn('⚠ ' + res.error) : outRow('Hloubka radiálně', fmt(res.depth) + ' mm (dno na Ø' + fmt(res.xTop - 2 * res.depth) + ')'))
      + outRow('Konce drážky', 'Z' + fmt(r.z1) + ' … Z' + fmt(r.z2))
      + outRow('Úhly C', shellAngles(r.spec).map(x => fmt(x) + '°').join(' · '));
  };

  syncMode();
  if (inp.ref) {
    if (s && s.ref) { const r = refs.find(x => s.ref.startsWith(x.label)); if (r) { inp.ref.value = r.key; inp.off.value = fmt((((s.angle - r.angle) % 360) + 540) % 360 - 180); } }
    inp.ref.addEventListener('change', update);
  }
  inp.mode.addEventListener('change', () => { syncMode(); update(); });
  Object.values(inp).forEach(i => i && i.tagName === 'INPUT' && i.addEventListener('input', update));
  update();

  overlay.querySelector('[data-slot-draw]').addEventListener('click', () => {
    const r = read();
    if (r.error) { showToast(r.error); return; }
    const ok = bridge.drawShellSlot && bridge.drawShellSlot(r.spec, r.z1, r.z2, edit);
    if (!ok) return;
    _last = { w: r.spec.w, len: r.z1 - r.z2, mode: r.spec.depth.mode, value: r.spec.depth.value, count: r.spec.count };
    overlay.remove();
  });
  const ovalBtn = overlay.querySelector('[data-slot-oval]');
  if (ovalBtn) ovalBtn.addEventListener('click', () => { overlay.remove(); onOval(); });
  if (!(val(inp.w) > 0)) inp.w.focus();
  return overlay;
}
