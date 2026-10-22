// Karta a formulář jedné operace poháněného nástroje v editoru 🛠 Operace
// (HTML). Pole nesou data-k = klíč operace; změny čte livePanel.js (událost
// change). Pod formulářem chyby zadání (liveOpProblems) a nálezy kontroly
// proti dílu (liveChecks.js), u karty tečka nálezu. Vyňato z livePanel.js.
import { liveOpProblems, liveOpSummary, isKeyway } from './liveModel.js';

/**
 * Karta operace: hlavička (barva druhu, název, souhrn, nález) + formulář vybrané.
 * @param chk výsledek checkLiveOp (nebo null)
 */
export function opCard(op, i, sel, chk) {
  const dot = op.kind === 'mill' ? '#cba6f7' : (op.side === 'radial' ? '#94e2d5' : '#fab387');
  const flag = chk && chk.sev
    ? `<span class="cam-live-flag ${chk.sev}" title="${esc(chk.issues.map(x => x.text).join('\n'))}"></span>` : '';
  return `<div class="cam-live-card${sel ? ' sel' : ''}" data-op="${i}">
    <div class="cam-live-card-h" data-live="sel">
      <span class="cam-live-dot" style="background:${dot}"></span>
      <span class="t"><b>${i + 1}. ${esc(op.name)}${op.fromCad ? ' <span title="Načteno z CAD (◎ Čelo)">📐</span>' : ''}</b><small>${esc(liveOpSummary(op))}</small></span>
      ${flag}<button data-live="up" title="Dřív">▲</button><button data-live="down" title="Později">▼</button>
      <button data-live="del" title="Smazat operaci">✕</button>
    </div>
    ${sel ? `<div class="cam-live-card-b">${opForm(op, chk)}</div>` : ''}
  </div>`;
}

export function opForm(op, chk) {
  const f = (k, t, v, wide) => `<label class="cam-live-f${wide ? ' wide' : ''}"><span>${t}</span><input data-k="${k}" type="text" inputmode="decimal" value="${esc(v)}"></label>`;
  const txt = (k, t, v) => `<label class="cam-live-f"><span>${t}</span><input data-k="${k}" type="text" value="${esc(v)}"></label>`;
  const sel = (k, t, v, opts) => `<label class="cam-live-f"><span>${t}</span><select data-k="${k}">${opts.map(([val, lbl]) => `<option value="${val}"${val === v ? ' selected' : ''}>${lbl}</option>`).join('')}</select></label>`;
  const kw = isKeyway(op);   // drážka pro pero v plášti
  const radial = (op.kind === 'drill' && op.side === 'radial') || kw;
  const slot = op.kind === 'mill' && op.millType === 'slot';
  let h = '<div class="cam-live-grid">';
  h += txt('name', 'Název', op.name);
  h += sel('kind', 'Druh', op.kind, [['drill', 'Vrtání'], ['mill', 'Frézování']]);
  if (op.kind === 'drill') h += sel('side', 'Kam', op.side, [['face', 'Do čela (osa Z)'], ['radial', 'Do pláště (osa X)']]);
  else h += sel('millType', 'Frézování', op.millType, [['pocket', 'Kruhová kapsa'], ['slot', 'Drážka (přímá)'], ['keyway', 'Drážka pro pero (plášť)']]);
  if (!slot) {
    h += sel('pattern', 'Rozmístění', op.pattern, [['pcd', radial ? 'Po obvodu' : 'Roztečná kružnice'], ['points', 'Seznam bodů']]);
    if (op.pattern === 'pcd') {
      if (!radial) h += f('pcd', 'Ø rozteče', op.pcd);
      h += f('count', 'Počet', op.count) + f('startAngle', 'Počáteční úhel °', op.startAngle);
      if (radial && !kw) h += f('zPos', 'Z děr', op.zPos);
    } else {
      h += `<label class="cam-live-f wide"><span>Body – řádek = „úhel${kw ? '' : `; ${radial ? 'Z' : 'poloměr'}`}"</span><textarea data-k="points">${esc(op.points)}</textarea></label>`;
    }
    if (kw) h += f('kz1', 'Z konce drážky', op.kz1) + f('kz2', 'Z druhého konce', op.kz2);
  } else {
    h += f('slot.x1', 'X1', op.slot.x1) + f('slot.y1', 'Y1', op.slot.y1) + f('slot.x2', 'X2', op.slot.x2) + f('slot.y2', 'Y2', op.slot.y2);
  }
  h += radial ? f('xTop', 'Ø pláště', op.xTop) : f('zTop', 'Z čela', op.zTop);
  if (!radial) h += sel('faceDir', 'Strana čela', String(op.faceDir === -1 ? -1 : 1), [['1', '◀ zprava (vrtá k −Z)'], ['-1', '▶ zleva (vrtá k +Z)']]);
  if (op.kind === 'drill') {
    h += f('holeD', 'Ø díry', op.holeD) + f('depth', 'Hloubka', op.depth);
    h += f('peck', 'Krok vrtání (0 = naráz)', op.peck) + f('dwell', 'Prodleva dole [s]', op.dwell);
    if (op.peck > 0) {
      h += sel('chipMode', 'Tříska mezi záběry', op.chipMode, [['clear', '⇡ Vyjíždění (odvod)'], ['break', '↯ Lámání (odskok)']]);
      if (op.chipMode === 'break') h += f('chipBack', 'Odskok [mm]', op.chipBack);
    }
  } else {
    if (!slot && !kw) h += f('holeD', 'Ø kapsy', op.holeD);
    h += f('toolD', slot || kw ? 'Ø frézy = šířka' : 'Ø frézy', op.toolD) + f('depth', 'Hloubka', op.depth) + f('stepDown', 'Krok do hloubky', op.stepDown);
  }
  h += f('safe', 'Bezpečná vzdálenost', op.safe) + f('retract', 'Odjezd nad plochu', op.retract);
  h += txt('toolName', 'Nástroj', op.toolName) + f('toolNo', 'Číslo T', op.toolNo);
  h += f('rpm', 'Otáčky [1/min]', op.rpm) + f('feed', 'Posuv [mm/min]', op.feed);
  h += '</div>';
  const probs = liveOpProblems(op);
  if (probs.length) h += `<div class="cam-live-prob">${probs.map(esc).join('<br>')}</div>`;
  const found = chk ? chk.issues : [];
  if (found.length) {
    h += `<div class="cam-live-chk"><b>Kontrola proti dílu</b>${found.map(x =>
      `<div class="${x.sev}">${x.sev === 'error' ? '⛔' : '⚠'} ${esc(x.text)}</div>`).join('')}</div>`;
  }
  return h;
}

export function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
