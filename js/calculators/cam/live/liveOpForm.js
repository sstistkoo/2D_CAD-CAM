// Formulář jedné operace poháněného nástroje v editoru 🛠 Operace (HTML).
// Pole nesou data-k = klíč operace; změny čte livePanel.js (událost change).
// Vyňato z livePanel.js (velikost souboru).
import { liveOpProblems } from './liveModel.js';

export function opForm(op) {
  const f = (k, t, v, wide) => `<label class="cam-live-f${wide ? ' wide' : ''}"><span>${t}</span><input data-k="${k}" type="text" inputmode="decimal" value="${esc(v)}"></label>`;
  const txt = (k, t, v) => `<label class="cam-live-f"><span>${t}</span><input data-k="${k}" type="text" value="${esc(v)}"></label>`;
  const sel = (k, t, v, opts) => `<label class="cam-live-f"><span>${t}</span><select data-k="${k}">${opts.map(([val, lbl]) => `<option value="${val}"${val === v ? ' selected' : ''}>${lbl}</option>`).join('')}</select></label>`;
  const radial = op.kind === 'drill' && op.side === 'radial';
  const slot = op.kind === 'mill' && op.millType === 'slot';
  let h = '<div class="cam-live-grid">';
  h += txt('name', 'Název', op.name);
  h += sel('kind', 'Druh', op.kind, [['drill', 'Vrtání'], ['mill', 'Frézování']]);
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
  if (!radial) h += sel('faceDir', 'Strana čela', String(op.faceDir === -1 ? -1 : 1), [['1', '◀ zprava (vrtá k −Z)'], ['-1', '▶ zleva (vrtá k +Z)']]);
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

export function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
