// SKICA – render: 📏 Kontrola rovných čar (Úpravy výkresu → Rovné čáry)
// Vodorovné a svislé úsečky zeleně, skoro rovné (odchylka pod 3°) červeně
// s rozdílem souřadnic konců. Jen překryv – barvy objektů se nemění, vypnutím
// se výkres ukáže v původních barvách (uživatel 3. 11. 2026).

import { ctx, worldToScreen } from '../canvas.js';
import { COLORS } from '../constants.js';
import { state } from '../state.js';
import { classifyStraightLines } from '../dialogs/drawingEditOps.js';

const fmtOff = (v) => (v < 0.001 ? v.toExponential(1) : v.toFixed(3)).replace('.', ',');

export function drawStraightCheck() {
  if (!state.straightCheck) return;
  const list = classifyStraightLines(state.objects, state.layers);
  if (list.length === 0) return;
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  const fontSize = Math.round(Math.min(18, Math.max(11, 8 + state.zoom * 4)));
  ctx.font = `bold ${fontSize}px Consolas`;
  ctx.textBaseline = 'alphabetic';
  for (const s of list) {
    const [a, b] = worldToScreen(s.x1, s.y1), [c, d] = worldToScreen(s.x2, s.y2);
    const color = s.kind === 'exact' ? COLORS.dimension : COLORS.delete;
    ctx.strokeStyle = color;
    if (s.kind === 'near') {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
    if (s.kind === 'near') {
      ctx.fillStyle = color;
      ctx.fillText(`${s.dir === 'h' ? '↕' : '↔'} ${fmtOff(s.off)}`, (a + c) / 2 + 8, (b + d) / 2 - 8);
    }
  }
  ctx.restore();
}
