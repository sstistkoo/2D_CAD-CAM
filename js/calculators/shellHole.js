// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Díra do pláště (radiální díra) — okno                ║
// ╚══════════════════════════════════════════════════════════════╝
// Nástroj Díra (tools/faceHoleClick.js): klepnutí v NÁRYSU (mimo bokorys)
// → toto okno se Z z klepnutí; klepnutí na existující díru v plášti ji
// otevře k úpravě (uživatel 22. 10. 2026). Zadává se Ø díry, hloubka
// (od pláště / do Ø / skrz stěnu do vývrtu), počet děr po obvodu a úhel C
// první díry — ručně, nebo „Natočit podle" díry v čele (+ odsazení), aby
// radiální díra seděla vůči děrám v čele. Ø pláště a hloubka se ukazují
// z aktuálního profilu. „Do pláště" kreslí přes bridge.drawShellHole
// (faceView/shellHoleDraw.js).
import { showToast } from '../state.js';
import { bridge } from '../bridge.js';
import { makeOverlay } from '../dialogFactory.js';
import { faceHoles, faceLabel } from '../faceView/faceLayer.js';
import { resolveShellHole, shellAngles, shellTapDepth } from '../faceView/shellHoles.js';
import { fmt, numVal as val, numField, selectField, outRow, outWarn } from './calcKit.js';
import { threadFieldHtml, wireThreadField, readThread } from './holeDepthFields.js';

const MODES = [['depth', 'Do hloubky (od pláště)'], ['dia', 'Do Ø'], ['through', 'Skrz stěnu (do vývrtu)']];
const VAL = {
  depth: ['Hloubka od pláště', 'hloubka', 'Hloubka díry měřená od pláště (radiálně)'],
  dia: ['Do Ø', 'Ø dna', 'Díra končí na tomto průměru (např. Ø vývrtu)'],
  through: ['Přesah za stěnu', '0,3·Ø + 1', 'Skrz stěnu až do vývrtu; prázdné = hrot vrtáku 0,3·Ø + 1 mm'],
};
let _last = null;   // { d, mode, value, count } poslední díra

/** Díry v čele jako reference úhlu: [{ key, label, angle }] (bez duplicit). */
export function faceHoleRefs(list = faceHoles()) {
  const seen = new Map();
  list.forEach(({ face, o }) => {
    const x = o.cx - face.origin.x, y = o.cy - face.origin.y;
    if (Math.hypot(x, y) < 1e-6) return;   // díra v ose nemá úhel
    let a = Math.atan2(y, x) * 180 / Math.PI;
    if (a < 0) a += 360;
    a = +a.toFixed(3);
    const d = +(2 * o.r).toFixed(3);
    const key = `${face.id}|${d}|${a}`;
    if (!seen.has(key)) seen.set(key, { key, angle: a, label: `Díra Ø${fmt(d)} · čelo ${faceLabel(face)} · C${fmt(a)}°` });
  });
  return [...seen.values()].sort((p, q) => p.angle - q.angle);
}

/**
 * @param opts { z } předvyplněné Z (klepnutí v nárysu), nebo { edit: objekt díry, z }
 */
export function openShellHoleCalc(opts = {}) {
  const old = document.querySelector('.calc-overlay[data-type="shellHole"]');
  if (old) old.remove();
  const edit = opts.edit && opts.edit.shellHole ? opts.edit : null;
  const s = edit ? edit.shellHole : null;
  const refs = faceHoleRefs();
  const body =
    '<div class="cnc-fields">' +
      numField('z', 'Z díry', 'mm', 'Z', ' value="' + fmt(opts.z ?? 0) + '"') +
      numField('d', 'Ø díry', 'mm', 'Ø', s ? ' value="' + fmt(s.d) + '"' : _last ? ' value="' + fmt(_last.d) + '"' : '') +
      selectField('mode', 'Hloubka díry', MODES) +
      numField('val', VAL.depth[0], 'mm', VAL.depth[1]) +
      threadFieldHtml('sh') +
      numField('n', 'Počet po obvodu', 'ks', '1', ' value="' + (s ? s.count : _last ? _last.count : 1) + '"') +
      (refs.length ? selectField('ref', 'Natočit podle', [['', 'Ručně (úhel C)'], ...refs.map(r => [r.key, r.label])]) : '') +
      numField('a', 'Úhel C první díry', '°', '0', ' value="' + fmt(s ? s.angle : 90) + '"') +
      (refs.length ? numField('off', 'Odsazení od díry v čele', '°', '0', ' value="0"') : '') +
    '</div>' +
    '<div class="calc-out" data-shell="out"></div>' +
    '<div class="cnc-actions"><button class="cnc-btn" data-shell-draw style="background:var(--ctp-surface1);color:#94e2d5">'
      + (edit ? '✔ Upravit díru' : '⊥ Do pláště') + '</button></div>' +
    '<div class="calc-note">Díra se kreslí do nárysu jako osa napříč osou vřetena; Ø pláště a hloubka se berou z profilu v Z díry. ' +
      'C 0° = X bokorysu, C 90° = Y (svisle) — jako díry v čele; v bokorysu se radiální díry ukážou jako paprsky od obvodu. ' +
      'Víc děr podél osy: Lin.pole. V CAM se načtou jako vrtání do pláště (osa X).</div>';

  const overlay = makeOverlay('shellHole', edit ? '⊥ Upravit díru v plášti' : '⊥ Díra do pláště', body);
  if (!overlay) return null;
  const q = id => overlay.querySelector('[data-id="' + id + '"]');
  const inp = { z: q('z'), d: q('d'), mode: q('mode'), val: q('val'), n: q('n'), a: q('a'), ref: q('ref'), off: q('off'), thread: q('shthread') };
  if (s && s.thread && inp.thread) inp.thread.value = s.thread.name;
  wireThreadField(overlay, 'sh', inp.d);
  const out = overlay.querySelector('[data-shell="out"]');

  const dep0 = s ? s.depth : _last ? { mode: _last.mode, value: _last.value } : { mode: 'depth', value: null };
  inp.mode.value = dep0.mode;
  if (dep0.value != null) inp.val.value = fmt(dep0.value);

  const syncMode = () => {
    const [label, ph, tip] = VAL[inp.mode.value] || VAL.depth;
    const span = inp.val.closest('label').querySelector('span');
    span.innerHTML = label + ' <small>mm</small>';
    inp.val.placeholder = ph;
    inp.val.title = tip;
  };
  // Natočit podle díry v čele: úhel = její C + odsazení (pole úhlu se zamkne).
  const syncRef = () => {
    if (!inp.ref) return;
    const r = refs.find(x => x.key === inp.ref.value);
    inp.a.disabled = !!r;
    inp.off.closest('label').style.display = r ? '' : 'none';
    if (r) inp.a.value = fmt(((r.angle + (val(inp.off) || 0)) % 360 + 360) % 360);
  };

  const read = () => {
    const z = val(inp.z), d = val(inp.d), v = val(inp.val), n = val(inp.n), a = val(inp.a);
    if (z === null || Number.isNaN(z)) return { error: 'Zadej Z díry' };
    if (!(d > 0)) return { error: 'Zadej Ø díry' };
    if (Number.isNaN(v)) return { error: 'Neplatná hodnota u hloubky' };
    const mode = inp.mode.value;
    if (mode === 'depth' && !(v > 0)) return { error: 'Zadej hloubku díry (> 0)' };
    if (mode === 'dia' && !(v >= 0)) return { error: 'Zadej Ø, do kterého se vrtá' };
    if (mode === 'through' && v !== null && v < 0) return { error: 'Přesah musí být ≥ 0' };
    if (!(n >= 1) || Math.round(n) !== n) return { error: 'Počet po obvodu = celé číslo ≥ 1' };
    if (a === null || Number.isNaN(a)) return { error: 'Zadej úhel C' };
    const r = inp.ref && refs.find(x => x.key === inp.ref.value);
    const thread = readThread(overlay, 'sh');
    return {
      z, spec: {
        d, depth: { mode, value: v }, count: n, angle: a,
        ...(thread ? { thread } : {}),
        ...(r ? { ref: `${r.label}${val(inp.off) ? ` ${val(inp.off) > 0 ? '+' : ''}${fmt(val(inp.off))}°` : ''}` } : {}),
      },
    };
  };

  const update = () => {
    syncRef();
    const r = read();
    if (r.error) { out.innerHTML = ''; return; }
    const res = resolveShellHole(r.spec, r.z);
    const angs = shellAngles(r.spec).map(x => fmt(x) + '°').join(' · ');
    out.innerHTML = (res.xTop ? outRow('Ø pláště v Z díry', 'Ø' + fmt(res.xTop) + (res.inner > 1e-6 ? ` (vývrt Ø${fmt(2 * res.inner)})` : '')) : '')
      + (res.error ? outWarn('⚠ ' + res.error) : outRow('Hloubka radiálně', fmt(res.depth) + ' mm (dno na Ø' + fmt(res.xTop - 2 * res.depth) + ')'))
      + (r.spec.thread && !res.error ? (() => {
        const t = shellTapDepth(r.spec, res);
        return t ? outRow('Závit ' + r.spec.thread.name, 'hloubka ' + fmt(t) + ' mm') : outWarn('⚠ díra je na závit ' + r.spec.thread.name + ' příliš mělká');
      })() : '')
      + outRow('Úhly C', angs);
  };

  syncMode();
  if (inp.ref) {
    // Úprava díry natočené podle díry v čele: najít ji znovu podle popisu.
    if (s && s.ref) { const r = refs.find(x => s.ref.startsWith(x.label)); if (r) { inp.ref.value = r.key; inp.off.value = fmt((((s.angle - r.angle) % 360) + 540) % 360 - 180); } }
    inp.ref.addEventListener('change', update);
  }
  inp.mode.addEventListener('change', () => { syncMode(); update(); });
  if (inp.thread) inp.thread.addEventListener('change', update);
  Object.values(inp).forEach(i => i && i.tagName === 'INPUT' && i.addEventListener('input', update));
  update();

  overlay.querySelector('[data-shell-draw]').addEventListener('click', () => {
    const r = read();
    if (r.error) { showToast(r.error); return; }
    const ok = bridge.drawShellHole && bridge.drawShellHole(r.spec, r.z, edit);
    if (!ok) return;
    _last = { d: r.spec.d, mode: r.spec.depth.mode, value: r.spec.depth.value, count: r.spec.count };
    overlay.remove();
  });
  if (!(val(inp.d) > 0)) inp.d.focus();
  return overlay;
}
