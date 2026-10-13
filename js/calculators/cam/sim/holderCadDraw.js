// „📐 Kreslit držák na CAD plátně" z okna 🔪 Geometrie: plátno CAD se dočasně
// vyčistí (se zálohou), destička se vygeneruje jako zamčená geometrie, obrys
// držáku se kreslí běžnými CAD nástroji a po ✓ Potvrdit se zřetězí zpět do
// S.params.holderProfile (✕ Zrušit vrátí výkres). Vyňato z toolGeometryDialog.js
// (docs/plan-rozdeleni-cam-simulatoru.md) — okno a stav se předávají parametrem.
import { state, showToast } from '../../../state.js';
import { bridge } from '../../../bridge.js';
import { renderAll } from '../../../render.js';
import { centerViewOn, resizeCanvases } from '../../../canvas.js';
import { calculateAllIntersections } from '../../../geometry.js';
import { setTool, updateLayerList, updateObjectList } from '../../../ui.js';
import { buildInsertOutlineSegments } from '../insertPreview.js';

/**
 * Vytvoří se při otevření okna (nastaví bridge.confirmHolderDraw / cancelHolderDraw).
 * @param ctx { S, overlay, toolUi, dlg, geomUi }
 * @returns { startHolderCadDraw }
 */
export function createHolderCadDraw({ S, overlay, toolUi, dlg, geomUi }) {
  // ── „📐 Kreslit držák na CAD plátně" — plnohodnotné CAD kreslení ────
  // Na rozdíl od zahozeného prvního pokusu (overlay-vodítko v render.js) se
  // destička vygeneruje jako REÁLNÉ zamčené CAD objekty (jde na ně snapovat)
  // a držák se kreslí běžnými CAD nástroji. Režim drží state.holderDrawMode
  // a PŘEŽÍVÁ přepnutí nástroje (není svázán se state._toolCleanup). Ruší se
  // jen dolní lištou ✕ Zrušit / ✓ Potvrdit (bridge.confirm/cancelHolderDraw).

  // Mapování profil destičky {x,z} (0,0 = špička, +z do držáku) ↔ CAD svět.
  // holderProfile je JEN pro náhled (drawInsertAndHolderPreview): toScr kreslí
  // x vodorovně, +z SVISLE NAHORU (do držáku). Aby to, co uživatel nakreslí
  // na CAD plátně, vypadalo v náhledu STEJNĚ orientované, musí obrazovkové
  // „nahoru" (CAD wy) = profil z, a obrazovkové „vodorovně" (CAD wx) = profil x.
  // (Nezávisí na machineType — obrazovková orientace je stejná pro soustruh
  // i karusel; dřívější prohození os kreslilo držák naležato místo nastojato.)
  function profToWorld(px, pz) { return { x: px, y: pz }; }
  function worldToProf(wx, wy) { return { x: wx, z: wy }; }

  // Obrys destičky v profilu {x,z} (z nahoru) — SDÍLENÝ
  // buildInsertOutlineSegments() z cam/insertPreview.js. Dřív tu byla
  // jeho kopie a obě verze se rozcházely (u upichováku chyběl pravý bok);
  // matematika musí zůstat shodná s getInsertAnchorPoints/
  // drawInsertAndHolderPreview (canvas y dolů → z=-y), aby nakreslená
  // destička v CADu ležela přesně tam, kde ji čeká náhled — zpětně sejmutý
  // obrys držáku pak v náhledu sedí kolem destičky.

  // Převede profil-segmenty na reálné CAD objekty (červené, zamčené, na
  // vrstvě Plátek). isToolInsert = per-objekt výjimka pro snap (viz snapPt) —
  // na zamčenou vrstvu se normálně nesnapuje, na destičku ano.
  function buildInsertObjects(prms, layerId) {
    const RED = '#f38ba8';
    // CELÁ destička (u polygonu i zadní půlka v lůžku) — držák se kreslí
    // kolem ní; výpočet dál bere řeznou část (buildInsertProfileSegments).
    const segs = buildInsertOutlineSegments(prms);
    const objs = [];
    for (const s of segs) {
      if (s.type === 'circle') {
        const c = profToWorld(s.cx, s.cz);
        objs.push({ type: 'circle', cx: c.x, cy: c.y, r: s.r });
      } else if (s.type === 'line') {
        const p1 = profToWorld(s.from.x, s.from.z), p2 = profToWorld(s.to.x, s.to.z);
        objs.push({ type: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      } else if (s.type === 'arc') {
        const c = profToWorld(s.cx, s.cz);
        const wf = profToWorld(s.from.x, s.from.z), wt = profToWorld(s.to.x, s.to.z);
        const startAngle = Math.atan2(wf.y - c.y, wf.x - c.x);
        const endAngle = Math.atan2(wt.y - c.y, wt.x - c.x);
        let d = endAngle - startAngle;
        while (d <= -Math.PI) d += 2 * Math.PI;
        while (d > Math.PI) d -= 2 * Math.PI;
        objs.push({ type: 'arc', cx: c.x, cy: c.y, r: s.r, startAngle, endAngle, ccw: d >= 0 });
      }
    }
    objs.forEach(o => {
      o.id = state.nextId++;
      o.layer = layerId;
      o.color = RED;
      o.isToolInsert = true;
      o.locked = true;
      o.name = (o.type === 'circle' ? 'Destička ⌀' : o.type === 'arc' ? 'Destička ⌒' : 'Destička —') + ` ${o.id}`;
    });
    return objs;
  }

  // Znovu vytvoří DŘÍVE uložený obrys držáku jako NORMÁLNÍ (editovatelné,
  // odemčené) úsečky na vrstvě Držák — aby šel při opětovném „📐 Kreslit na
  // CAD plátně" dokreslit/upravit, ne kreslit od nuly. profToWorld je inverzí
  // worldToProf použitého při snímání (captureHolderProfile).
  function buildHolderObjectsFromProfile(profile, layerId) {
    if (!profile) return [];
    const objs = [];
    ['sideA', 'sideB'].forEach(key => {
      const pts = profile[key];
      if (!pts || pts.length < 2) return;
      for (let i = 0; i < pts.length - 1; i++) {
        const w1 = profToWorld(pts[i].x, pts[i].z);
        const w2 = profToWorld(pts[i + 1].x, pts[i + 1].z);
        objs.push({ type: 'line', x1: w1.x, y1: w1.y, x2: w2.x, y2: w2.y });
      }
    });
    objs.forEach(o => {
      o.id = state.nextId++;
      o.layer = layerId; // odemčená vrstva Držák → jde editovat/mazat/snapovat
      o.name = `Držák ${o.id}`;
    });
    return objs;
  }

  // ── Zřetězení nakreslených objektů držáku do posloupnosti world bodů ──
  function _objChainPoints(o) {
    if (o.type === 'line') {
      const pts = [{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }];
      return { pts };
    }
    if (o.type === 'arc') {
      let d = o.endAngle - o.startAngle;
      if (o.ccw) { while (d < 0) d += 2 * Math.PI; } else { while (d > 0) d -= 2 * Math.PI; if (d === 0) d = -2 * Math.PI; }
      const n = 10, pts = [];
      for (let i = 0; i <= n; i++) {
        const a = o.startAngle + d * i / n;
        pts.push({ x: o.cx + o.r * Math.cos(a), y: o.cy + o.r * Math.sin(a) });
      }
      return { pts };
    }
    if (o.type === 'polyline') {
      return { pts: o.vertices.map(v => ({ x: v.x, y: v.y })) };
    }
    return null;
  }

  // Spoji nakreslene objekty do retezcu bodu. Vraci VSECHNY retezy — co se
  // nespoji, se NEZAHAZUJE (drive se bral jen prvni retez a zbytek kresby
  // tise zmizel).
  function chainHolderPoints(objs) {
    const segs = objs.map(_objChainPoints).filter(Boolean);
    if (!segs.length) return [];
    const TOL = 0.05; // mm
    const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) <= TOL;
    const used = new Array(segs.length).fill(false);
    const chains = [];
    for (let start = 0; start < segs.length; start++) {
      if (used[start]) continue;
      used[start] = true;
      let chain = segs[start].pts.slice();
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = 0; i < segs.length; i++) {
          if (used[i]) continue;
          const pts = segs[i].pts;
          const a = pts[0], b = pts[pts.length - 1];
          const head = chain[0], tail = chain[chain.length - 1];
          if (near(tail, a)) { chain = chain.concat(pts.slice(1)); used[i] = true; changed = true; }
          else if (near(tail, b)) { chain = chain.concat(pts.slice().reverse().slice(1)); used[i] = true; changed = true; }
          else if (near(head, b)) { chain = pts.slice(0, -1).concat(chain); used[i] = true; changed = true; }
          else if (near(head, a)) { chain = pts.slice().reverse().slice(0, -1).concat(chain); used[i] = true; changed = true; }
        }
      }
      chains.push(chain);
    }
    return chains;
  }

  // Sejme obrys držáku z vrstvy Držák → holderProfile {sideA, sideB}.
  // Uloží se PŘESNĚ to, co je nakreslené — nic se nedoplňuje, neuzavírá ani
  // netvaruje. (Do 27. 8. 2026 se otevřený obrys „auto-doplnil“ pod 45° na
  // l1/tloušťku — uživateli to přikreslovalo držák, který nenakreslil.)
  // Nespojené části: první řetěz = strana A, druhý = strana B; víc jich model
  // držáku (sideA/sideB) neunese — pak se to řekne, ať nic nezmizí potichu.
  function captureHolderProfile(mode) {
    const holderObjs = state.objects.filter(o => o.layer === mode.holderLayerId
      && (o.type === 'line' || o.type === 'arc' || o.type === 'polyline'));
    if (holderObjs.length === 0) return null;
    const chains = chainHolderPoints(holderObjs).filter(c => c && c.length >= 2);
    if (!chains.length) return null;
    const prof = (c) => c.map(p => worldToProf(p.x, p.y));
    if (chains.length > 2) {
      chains.sort((a, b) => b.length - a.length);
      showToast(`Obrys má ${chains.length} nespojených částí — uloží se dvě největší`);
    }
    return { sideA: prof(chains[0]), sideB: chains[1] ? prof(chains[1]) : [] };
  }



  // Záloha CAD před vstupem do režimu (obnoví se při ✕ i ✓).
  function backupCad() {
    return {
      objects: state.objects, layers: state.layers, activeLayer: state.activeLayer,
      nextLayerId: state.nextLayerId, nextId: state.nextId,
      zoom: state.zoom, panX: state.panX, panY: state.panY, tool: state.tool,
      undoStack: state.undoStack, redoStack: state.redoStack, manualGCode: S.manualGCode,
    };
  }
  function restoreCad(b) {
    state.objects = b.objects; state.layers = b.layers; state.activeLayer = b.activeLayer;
    state.nextLayerId = b.nextLayerId; state.nextId = b.nextId;
    state.zoom = b.zoom; state.panX = b.panX; state.panY = b.panY;
    state.undoStack = b.undoStack; state.redoStack = b.redoStack;
    state.selected = null; state.multiSelected.clear(); state.selectedPoint = null;
  }

  function startHolderCadDraw() {
    if (state.holderDrawMode) { showToast('Kreslení držáku už běží'); return; }
    const prms = S.params;
    const backup = backupCad();
    const plateLayerId = 0, holderLayerId = 1;
    state.objects = [];
    state.selected = null; state.multiSelected.clear(); state.selectedPoint = null;
    state.undoStack = []; state.redoStack = [];
    state.layers = [
      { id: plateLayerId, name: 'Plátek', color: '#f38ba8', visible: true, locked: true },
      { id: holderLayerId, name: 'Držák', color: '#89b4fa', visible: true, locked: false },
    ];
    state.activeLayer = holderLayerId;
    state.nextLayerId = 2;
    const insertObjs = buildInsertObjects(prms, plateLayerId);
    state.objects.push(...insertObjs);
    // Dřív uložený obrys držáku znovu vygenerovat jako editovatelné úsečky,
    // aby šel dokreslit/upravit (ne kreslit od nuly).
    const holderObjs = buildHolderObjectsFromProfile(prms.holderProfile, holderLayerId);
    state.objects.push(...holderObjs);
    const hadHolder = holderObjs.length > 0;
    state.holderDrawMode = {
      backup, insertIds: insertObjs.map(o => o.id),
      plateLayerId, holderLayerId,
    };
    overlay.style.display = 'none';
    dlg.style.display = 'none';
    // openCamSimulator schoval pravý panel (#sidebar) — pro kreslení držáku
    // ho zase ukázat, ať jsou vidět a přepínatelné vrstvy Plátek/Držák.
    // Musí být PŘED resizeCanvases(), aby canvas počítal se šířkou panelu.
    const sidebarEl = document.getElementById('sidebar');
    if (sidebarEl) sidebarEl.style.display = '';
    setTool('line');
    resizeCanvases();
    // Rozsah pohledu ať pokryje i (případný) načtený obrys držáku.
    let holderExtent = 0;
    const prof = prms.holderProfile;
    if (prof) [...(prof.sideA || []), ...(prof.sideB || [])].forEach(p =>
      { holderExtent = Math.max(holderExtent, Math.abs(p.x), Math.abs(p.z)); });
    const span = Math.max((parseFloat(prms.toolLength) || 10) * 4, (parseFloat(prms.toolRadius) || 1) * 8,
      (parseFloat(prms.holderWidth) || 20) * 3, holderExtent * 2.2, 40);
    centerViewOn(0, 0, span);
    calculateAllIntersections();
    updateObjectList();
    updateLayerList();
    renderAll();
    if (bridge.updateHolderDrawButtons) bridge.updateHolderDrawButtons();
    // Obrys na vrstvě Plátek je CELÁ destička (buildInsertOutlineSegments),
    // od 1. 10. 2026 i u závitového (trojúhelník se zuby). Prázdný zůstane
    // jen u tvaru, který obrys nemá — pak upozornit, jinak to vypadá jako
    // prázdné plátno „bez důvodu".
    const noInsertRef = insertObjs.length === 0;
    showToast(noInsertRef
      ? 'Tvar destičky nemá obrys — kreslete držák vůči počátku 0,0 = špička'
      : hadHolder
        ? 'Držák načten pro úpravu (vrstva Držák), pak dole ✓ Potvrdit'
        : 'Nakreslete držák (vrstva Držák) kolem destičky, pak dole ✓ Potvrdit');
  }

  function finishHolderCadDraw(result) {
    const mode = state.holderDrawMode;
    if (!mode) return;
    if (result) S.params.holderProfile = result;
    restoreCad(mode.backup);
    const prevTool = mode.backup.tool;
    state.holderDrawMode = null;
    setTool(prevTool || 'select');
    // Zpět do CAM: pravý panel zase schovat (CAM overlay ho stejně překryje,
    // ale ať je stav konzistentní s openCamSimulator).
    const sidebarEl = document.getElementById('sidebar');
    if (sidebarEl) sidebarEl.style.display = 'none';
    calculateAllIntersections();
    updateObjectList();
    updateLayerList();
    resizeCanvases();
    renderAll();
    if (bridge.updateHolderDrawButtons) bridge.updateHolderDrawButtons();
    overlay.style.display = '';
    dlg.style.display = '';
    geomUi.activeGeomTab = 'holder';
    if (toolUi.toolGeomModalRefresh) toolUi.toolGeomModalRefresh();
    showToast(result ? 'Obrys držáku uložen 📐' : 'Kreslení držáku zrušeno');
  }

  bridge.confirmHolderDraw = () => {
    const mode = state.holderDrawMode;
    if (!mode) return;
    const res = captureHolderProfile(mode);
    if (!res) { showToast('Nakreslete držák (aspoň jednu úsečku na vrstvě Držák)'); return; }
    finishHolderCadDraw(res);
  };
  bridge.cancelHolderDraw = () => finishHolderCadDraw(null);

  return { startHolderCadDraw };
}
