// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Nástroj: Textová anotace                         ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, showToast, withUndoBatch } from '../state.js';
import { addObject } from '../objects.js';
import { COLORS } from '../constants.js';
import { showTextDialog } from '../dialogs/textDialog.js';
import { findObjectAt } from '../geometry.js';
import { renderHersheyText } from '../lib/hersheyFont.js';

/**
 * Kliknutí při aktivním nástroji "text".
 * Automaticky detekuje objekt pod kurzorem (úsečku/oblouk) a přednastaví path-mode.
 * Pokud klik není na objektu, použije případný existující výběr.
 */
export function handleTextClick(wx, wy) {
  const dialogOpts = {};

  // 1) Zjisti, jestli klik je přímo na úsečce/oblouku/kružnici
  const clickedIdx = findObjectAt(wx, wy);
  if (clickedIdx != null) {
    const clickedObj = state.objects[clickedIdx];
    if (clickedObj && (clickedObj.type === 'line' || clickedObj.type === 'constr')) {
      dialogOpts.pathMode = 'line';
      dialogOpts.pathObjectId = clickedIdx;
    } else if (clickedObj && clickedObj.type === 'arc') {
      dialogOpts.pathMode = 'arc';
      dialogOpts.pathObjectId = clickedIdx;
    } else if (clickedObj && clickedObj.type === 'circle') {
      dialogOpts.pathMode = 'circle';
      dialogOpts.pathObjectId = clickedIdx;
    }
  }

  // 2) Pokud klik nebyl na objektu, zkus existující výběr
  if (!dialogOpts.pathMode && state.selected != null) {
    const selObj = state.objects[state.selected];
    if (selObj && (selObj.type === 'line' || selObj.type === 'constr')) {
      dialogOpts.pathMode = 'line';
      dialogOpts.pathObjectId = state.selected;
    } else if (selObj && selObj.type === 'arc') {
      dialogOpts.pathMode = 'arc';
      dialogOpts.pathObjectId = state.selected;
    } else if (selObj && selObj.type === 'circle') {
      dialogOpts.pathMode = 'circle';
      dialogOpts.pathObjectId = state.selected;
    }
  }

  showTextDialog(dialogOpts, (result) => {
    if (result.hershey) {
      // Single-line CNC gravura: vyrenderovat text jako sadu otevřených
      // polylines (každé písmeno 1+ tahů středovou čarou).
      const polys = renderHersheyText(
        result.text, result.fontSize, wx, wy, result.rotation, result.hersheyFont,
      );
      if (polys.length === 0) {
        showToast('Hershey font nezná žádný znak v zadaném textu');
        return;
      }
      const baseName = `Gravura "${result.text.substring(0, 16)}"`;
      withUndoBatch(() => {
        polys.forEach((p, i) => {
          addObject({
            type: 'polyline',
            vertices: p.vertices,
            bulges: p.bulges,
            closed: false,
            name: polys.length === 1 ? baseName : `${baseName} #${i + 1}`,
            color: COLORS.textSecondary,
          });
        });
      });
      showToast(`Gravura: ${polys.length} tah${polys.length === 1 ? '' : 'ů'} přidán${polys.length === 1 ? '' : 'o'}`);
      return;
    }

    addObject({
      type: 'text',
      x: wx,
      y: wy,
      text: result.text,
      fontSize: result.fontSize,
      fontFamily: result.fontFamily,
      rotation: result.rotation,
      textAlign: result.textAlign,
      bold: result.bold,
      italic: result.italic,
      letterSpacing: result.letterSpacing,
      pathMode: result.pathMode,
      pathObjectId: result.pathObjectId,
      pathOffset: result.pathOffset,
      name: `Text "${result.text.substring(0, 20)}"`,
      color: COLORS.textSecondary,
    });
    showToast('Text přidán');
  });
}
