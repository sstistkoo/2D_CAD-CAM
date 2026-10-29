// Vrácení kontury ze simulátoru na plátno CAD (✕ → „📐 Zachovat a přenést"):
// kontura, polotovar (válec / vlastní tvar), konstrukční čáry a skrytá
// poznámka s programem drah. Vyňato z camSimulator.js (blok „Vrátit konturu
// zpět na plátno", docs/plan-rozdeleni-cam-simulatoru.md) — stav simulátoru
// a jeho akce se předávají parametrem.
import { state, pushUndo, showToast, STOCK_LAYER_ID } from '../../../state.js';
import { renderAll } from '../../../render.js';
import { autoCenterView } from '../../../canvas.js';
import { calculateAllIntersections } from '../../../geometry.js';
import { updateObjectList } from '../../../ui.js';
import { getArcParams } from '../camMath.js';
import { resolvePointsToAbsolute } from '../contourBuild.js';
import { guidePolyPoints } from '../interferenceGuides.js';

// Kontura jde vždy do vrstvy Kontura, ne do aktivní: s aktivní Konstrukcí
// (nebo čelem bokorysu) se vracela do ní a 🗑 Konstrukce ji smazal i
// s konstrukčními čarami (uživatel 29. 10. 2026). Výkres se tu celý nahrazuje.
const CONTOUR_LAYER_ID = 0;

/**
 * Smaže výkres CAD a vloží do něj konturu/polotovar/konstrukční čáry ze
 * simulátoru, pak simulátor zavře. Ptá se volající (✕ → camCloseConfirm);
 * tlačítko „📐 Kreslit" uživatel 13. 10. 2026 nechal odstranit.
 * @param ctx.S                stav simulátoru
 * @param ctx.setOpView        přepnutí náhledu část × celý program
 * @param ctx.getAllGuideLines ruční + automatické konstrukční čáry
 * @param ctx.overlay          okno simulátoru (zavře se)
 */
export async function handleSendToCanvas({ S, setOpView, getAllGuideLines, overlay }) {
  // Na plátno (a do skryté poznámky s G-kódem) patří dráhy JEDNÉ části —
  // z náhledu celého programu by se zpátky vrátil složený kód jako část.
  if (S.opView === 'all') setOpView('part');
  const pts = resolvePointsToAbsolute(S.contourPoints);
  if (pts.length < 2) { alert('Kontura nemá dostatek bodů.'); return; }

  // Uložit undo, smazat stávající objekty
  pushUndo();
  state.objects.length = 0;
  state.selected = null;

  const isDia = S.params.mode === 'DIAMON';
  // Osy výkresu určuje typ stroje v CAD (tím se kontura do CAM i poslala,
  // runCncExport). „Karusel" v CAM je jen pohled — podle něj se výkres při
  // rozdílném nastavení vracel přetočený (svět x ↔ y).
  const isKarusel = state.machineType === 'karusel';
  // Mapování: CNC X,Z → canvas x,y
  // soustruh: canvas.x = Z, canvas.y = X
  // karusel:  canvas.x = X, canvas.y = Z
  const toCanvas = (cncX, cncZ) => isKarusel
    ? { x: cncX, y: cncZ }
    : { x: cncZ, y: cncX };

  // Vykreslí řetězec absolutních CNC bodů do state.objects.
  // isStock=true označí segmenty jako polotovar (isStock příznak).
  const emitChain = (chainPts, isStock) => {
    for (let i = 0; i < chainPts.length - 1; i++) {
      const p1 = chainPts[i], p2 = chainPts[i + 1];
      // Přepočet z průměru na poloměr pokud je DIAMON mód
      const x1 = isDia ? p1.xAbs / 2 : p1.xAbs;
      const x2 = isDia ? p2.xAbs / 2 : p2.xAbs;
      const c1 = toCanvas(x1, p1.zAbs);
      const c2 = toCanvas(x2, p2.zAbs);

      if (p2.type === 'G0') {
        // G0 = mezera mezi nesouvisejícími entitami — nevytvářet úsečku
        // tam, kde v CADu nic nebylo nakresleno.
        continue;
      } else if (p2.type === 'G1') {
        const id = state.nextId++;
        const obj = {
          type: 'line', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y,
          name: `Úsečka ${id}`, id, layer: isStock ? STOCK_LAYER_ID : CONTOUR_LAYER_ID,
        };
        if (isStock) obj.isStock = true;
        state.objects.push(obj);
      } else if (p2.type === 'G2' || p2.type === 'G3') {
        const arc = getArcParams(
          { x: x1, z: p1.zAbs },
          { x: x2, z: p2.zAbs },
          p2.rVal, p2.type
        );
        if (arc.error) continue;
        const cc = toCanvas(arc.cx, arc.cz);
        // Nastavit ccw + zachovat start/end body podle p1→p2 směru (BEZ swapu).
        // Mapování CAM G2/G3 → CAD ccw:
        //   G3 (CCW v CAMu = svět CCW) → ccw=true
        //   G2 (CW  v CAMu = svět CW ) → ccw=false
        // Bez správného ccw renderer kresí default (true), což pro G2 znamená
        // dlouhý oblouk přes druhou stranu středu. Při dalším exportu pak
        // cross-product produkoval jiný G2/G3 → round-trip oblouky obracel.
        // Karusel: svět (x = X, y = Z) je vůči rovině CAM (Z, X) převrácený,
        // takže CCW v CAM je ve výkresu CW (jinak by se kreslil doplněk).
        const startAngle = Math.atan2(c1.y - cc.y, c1.x - cc.x);
        const endAngle   = Math.atan2(c2.y - cc.y, c2.x - cc.x);
        const id = state.nextId++;
        const obj = {
          type: 'arc', cx: cc.x, cy: cc.y, r: arc.r,
          startAngle, endAngle,
          ccw: (p2.type === 'G3') !== isKarusel,
          name: `Oblouk ${id}`, id, layer: isStock ? STOCK_LAYER_ID : CONTOUR_LAYER_ID,
        };
        if (isStock) obj.isStock = true;
        state.objects.push(obj);
      }
    }
  };

  // Kontura
  emitChain(pts, false);

  // Polotovar — válcový (rectangle z stockDiameter/stockLength/stockFace)
  // nebo tvarový (stockPoints řetězec).
  const prms = S.params;
  if (prms.stockMode === 'cylinder') {
    const sRad = (parseFloat(prms.stockDiameter) || 0) / 2;
    const sLen = parseFloat(prms.stockLength) || 0;
    const sFace = parseFloat(prms.stockFace) || 0;
    if (sRad > 0 && sLen > 0) {
      // 4 rohy v CNC X (poloměr), Z; obejdou rectangle.
      // Použijeme syntetické body s xAbs jako průměr v DIAMON režimu,
      // aby emitChain udělal /2 zpětně na poloměr.
      const xDia = isDia ? sRad * 2 : sRad;
      const stockChain = [
        { type: 'G0', xAbs: 0,    zAbs: sFace },
        { type: 'G1', xAbs: xDia, zAbs: sFace },
        { type: 'G1', xAbs: xDia, zAbs: -sLen },
        { type: 'G1', xAbs: 0,    zAbs: -sLen },
        { type: 'G1', xAbs: 0,    zAbs: sFace },
      ];
      emitChain(stockChain, true);
    }
  } else {
    const stockPts = resolvePointsToAbsolute(S.stockPoints);
    if (stockPts.length >= 2) emitChain(stockPts, true);
  }

  // Konstrukční čáry (ruční pomocné + automatické hranice nájezdu/výjezdu)
  // — souřadnice g.x1/z1/x2/z2 jsou již v reálných (poloměrových) jednotkách,
  // takže se předávají do toCanvas přímo bez přepočtu DIAMON → RADIUS.
  const guideLines = getAllGuideLines();
  for (const g of guideLines) {
    // Lomená čára (hlídání držáku) → každý úsek jako samostatná čára.
    const pts = guidePolyPoints(g);
    for (let k = 0; k + 1 < pts.length; k++) {
      const c1 = toCanvas(pts[k].x, pts[k].z);
      const c2 = toCanvas(pts[k + 1].x, pts[k + 1].z);
      const id = state.nextId++;
      state.objects.push({
        type: 'constr', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y,
        // finite: konce jsou už oříznuté (mezní/tečná čára), v editoru se
        // nekreslí donekonečna, ale jen mezi koncovými body — jako v CAM.
        finite: true,
        name: `Konstrukční čára ${id}`, id, layer: 1,
      });
    }
  }

  // Skrytá poznámka s ručně upraveným G-kódem drah — nevykresluje se,
  // ale při příštím otevření CAM se z ní obnoví editor (viz openCamSimulator),
  // takže ruční úpravy drah přežijí cestu CAM → CAD → CAM.
  state.objects.push({
    type: 'camNote', id: state.nextId++, isCamPathNote: true,
    // I s příznakem ruční úpravy — jinak by se ochrana ztratila cestou
    // přes CAD a první auto-regenerace by úpravy beze slova přepsala.
    gcode: S.manualGCode, gcodeDirty: S.gcodeDirty, gcodeKey: S.gcodeKey,
    layer: CONTOUR_LAYER_ID
  });

  calculateAllIntersections();
  updateObjectList();
  autoCenterView();
  renderAll();

  // Zavřít CAM simulátor
  overlay.remove();
  // Na mobilu zavřít sidebar
  if (window.innerWidth <= 900) {
    const mainSidebar = document.getElementById('sidebar');
    if (mainSidebar) mainSidebar.classList.remove('mobile-open');
    const sideOverlay = document.getElementById('sidebarOverlay');
    if (sideOverlay) sideOverlay.style.display = 'none';
  }
  const guideMsg = guideLines.length ? ` + ${guideLines.length} konstr. čar` : '';
  showToast(`Kontura + polotovar vloženy (${state.objects.length} objektů${guideMsg})`);
}
