// Úprava drah přímo v G-kódu (CAM simulátor): uzly a úsečky dráhy pod
// kurzorem, zápis souřadnic do řádků, smazání a vložení pohybu. Vyňato
// z camSimulator.js (část bývalého bloku „SNAP MEZNÍCH ČAR", docs/plan-
// rozdeleni-cam-simulatoru.md) — stav simulátoru a jeho funkce se předávají
// parametrem.

/**
 * @param ctx { S, canvas, _gToScreen, markGCodeEdited, recalcNow, generateGCode,
 *              renderCodeArea, draw, scheduleFrame, saveState }
 * @returns {{ getGNodes, getGNodeAt, getGSegmentAt, writeGLines, writeGLine, deleteGLine, insertGMove }}
 */
export function createGcodeNodes({ S, canvas, _gToScreen, markGCodeEdited, recalcNow, generateGCode, renderCodeArea, draw, scheduleFrame, saveState }) {
  // Uzly = koncové body pohybů (poslední bod skupiny se stejným
  // originalLineIdx; u oblouku tedy koncový bod oblouku). Tažením uzlu se
  // přepíšou souřadnice X/Z příslušného řádku G-kódu.
  function getGNodes() {
    const calc = S._cachedCalc;
    if (!calc || !calc.simPath) return [];
    const sp = calc.simPath;
    const nodes = [];
    for (let i = 0; i < sp.length; i++) {
      const li = sp[i].originalLineIdx;
      if (li == null) continue;
      if (i + 1 >= sp.length || sp[i + 1].originalLineIdx !== li)
        nodes.push({ simIdx: i, lineIdx: li, x: sp[i].x, z: sp[i].z, type: sp[i].type });
    }
    return nodes;
  }
  function getGNodeAt(clientX, clientY, force = false) {
    if ((!S.gcodeEditEnabled && !force) || S.simRunning) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const nodes = getGNodes();
    let best = null, minD = Infinity;
    for (const n of nodes) {
      const pt = _gToScreen(n.x, n.z);
      const d = Math.hypot(pt.x - mx, pt.y - my);
      if (d < 10 && d < minD) { minD = d; best = n; }
    }
    return best;
  }
  // Úsečkové pohyby (G0/G1) jako celé úsečky — pro tažení celé dráhy.
  // `includeArcs` přibere i OBLOUKY (G2/G3) — jen pro NAJITÍ řádku, ne pro
  // tažení (vrací se bez p1/p2, viz níž).
  function getGSegmentAt(clientX, clientY, force = false, includeArcs = false) {
    if ((!S.gcodeEditEnabled && !force) || S.simRunning) return null;
    const calc = S._cachedCalc;
    if (!calc || !calc.simPath) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const sp = calc.simPath;
    const distSeg = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay;
      const L2 = dx * dx + dy * dy;
      let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    };
    let best = null, minD = Infinity;
    for (let i = 1; i < sp.length; i++) {
      const li = sp[i].originalLineIdx;
      if (li == null) continue;
      if (sp[i].type !== 'G0' && sp[i].type !== 'G1') continue;   // jen úsečky
      if (sp[i - 1].originalLineIdx === li) continue;             // ne vnitřek oblouku
      const a = _gToScreen(sp[i - 1].x, sp[i - 1].z);
      const b = _gToScreen(sp[i].x, sp[i].z);
      const d = distSeg(mx, my, a.x, a.y, b.x, b.y);
      // u koncových bodů má přednost uzel — drž se dál od konců
      const dA = Math.hypot(a.x - mx, a.y - my), dB = Math.hypot(b.x - mx, b.y - my);
      if (d < 6 && d < minD && dA > 9 && dB > 9) {
        minD = d;
        best = { simIdx: i, lineIdx: li, type: sp[i].type, startIdx: sp[i - 1].originalLineIdx,
                 p1: { x: sp[i - 1].x, z: sp[i - 1].z }, p2: { x: sp[i].x, z: sp[i].z } };
      }
    }
    // OBLOUKY (G2/G3): v simPath je oblouk ŘETĚZ bodů se stejným
    // `originalLineIdx`, takže ho smyčka výš minula dvakrát — filtrem na
    // G0/G1 i podmínkou „ne vnitřek oblouku". Klik doprostřed oblouku proto
    // nenašel nic a v G-kódu se nezvýraznil žádný řádek, ačkoli u úseček to
    // fungovalo (nález uživatele 1. 9. 2026). Hit-test = vzdálenost od lomené
    // čáry celého řetězu (včetně vstupního bodu = počátku oblouku).
    //
    // Vrací se BEZ `p1`/`p2` a s `isArc: true`: tažení oblouku by muselo
    // přepočítat i poloměr (CR/I,K), takže se sem tahání schválně nepouští —
    // volající si oblouk vezme jen pro `_gcodeFocusLine`.
    if (includeArcs) {
      for (let i = 1; i < sp.length; i++) {
        const li = sp[i].originalLineIdx;
        if (li == null) continue;
        const t = sp[i].type;
        if (t !== 'G2' && t !== 'G3') continue;
        if (sp[i - 1].originalLineIdx === li) continue;   // jen začátek řetězu
        let j = i;
        while (j < sp.length && sp[j].originalLineIdx === li) j++;
        let a = _gToScreen(sp[i - 1].x, sp[i - 1].z);
        let d = Infinity;
        for (let k = i; k < j; k++) {
          const b = _gToScreen(sp[k].x, sp[k].z);
          d = Math.min(d, distSeg(mx, my, a.x, a.y, b.x, b.y));
          a = b;
        }
        if (d < 6 && d < minD) {
          minD = d;
          best = { simIdx: j - 1, lineIdx: li, type: t, isArc: true };
        }
        i = j - 1;
      }
    }
    return best;
  }
  // Přepíše souřadnici (X/U nebo Z/W) v řádku G-kódu na novou hodnotu;
  // pokud na řádku není, vloží ji (před případný komentář).
  function setGLineCoord(line, letters, val) {
    const v = (Math.round(val * 1000) / 1000).toFixed(3);
    const re = new RegExp(`([${letters}])(-?\\d*\\.?\\d+)`);
    if (re.test(line)) return line.replace(re, `${letters[0]}${v}`);
    const word = `${letters[0]}${v}`;
    // Vlož za G-slovo (G0/G1/...) – přirozené pořadí G X Z F.
    const gm = line.match(/\bG0?[0-3]\b/);
    if (gm) {
      const at = gm.index + gm[0].length;
      return line.slice(0, at) + ` ${word}` + line.slice(at);
    }
    const ci = line.search(/[;(]/);
    if (ci >= 0) return line.slice(0, ci).replace(/\s+$/, '') + ` ${word} ` + line.slice(ci);
    return line.replace(/\s+$/, '') + ` ${word}`;
  }
  // Zapíše nové souřadnice (svět: x=poloměr, z) na jeden či více řádků
  // a přepočítá + překreslí. edits = [{lineIdx, wx, wz}].
  function writeGLines(edits) {
    const lines = S.manualGCode.split('\n');
    for (const ed of edits) {
      if (ed.lineIdx == null || ed.lineIdx < 0 || ed.lineIdx >= lines.length) continue;
      let line = lines[ed.lineIdx];
      if (ed.wx != null) line = setGLineCoord(line, 'XU', S.params.mode === 'DIAMON' ? ed.wx * 2 : ed.wx);
      if (ed.wz != null) line = setGLineCoord(line, 'ZW', ed.wz);
      lines[ed.lineIdx] = line;
    }
    S.manualGCode = lines.join('\n');
    markGCodeEdited();   // ruční úprava dráhy — automatika ji už nepřepíše
    // Během tažení uzlu/úsečky (Dráhy) sloučit přepočet+překreslení do jednoho
    // snímku a NEpřekreslovat G-kód panel (přestavba DOM podkladu + zvýraznění
    // je drahá a běžela by na každý snímek) — panel se obnoví až po puštění
    // (handleMouseUp). Mimo tažení (klik Prodl/Ořez) provést rovnou.
    const commit = () => {
      recalcNow();
      S.generatedCode = generateGCode(S._cachedCalc);
      if (!S.isDragging) renderCodeArea();   // renderCodeArea volá i backdrop+highlight
      draw();
    };
    if (S.isDragging) scheduleFrame(commit); else commit();
  }
  function writeGLine(lineIdx, wx, wz) { writeGLines([{ lineIdx, wx, wz }]); }

  // Smaže pohyb (řádek) z G-kódu a přepočítá.
  function deleteGLine(lineIdx) {
    const lines = S.manualGCode.split('\n');
    if (lineIdx == null || lineIdx < 0 || lineIdx >= lines.length) return;
    lines.splice(lineIdx, 1);
    S.manualGCode = lines.join('\n');
    markGCodeEdited();   // ruční úprava dráhy — automatika ji už nepřepíše
    recalcNow();
    S.generatedCode = generateGCode(S._cachedCalc);
    renderCodeArea(); draw(); saveState();
  }
  // Vloží nový pohyb (řádek) ZA daný řádek. move = {type:'G1', x, z, cr}.
  // x,z jsou ve světě (x=poloměr); CR jen pro G2/G3.
  function insertGMove(afterLineIdx, move) {
    const lines = S.manualGCode.split('\n');
    if (afterLineIdx == null || afterLineIdx < 0) return;
    const xOut = S.params.mode === 'DIAMON' ? move.x * 2 : move.x;
    const fmt = v => (Math.round(v * 1000) / 1000).toFixed(3);
    // N-číslo mezi sousedními (cosmetika) — když nejde, bez N.
    const nOf = s => { const m = (s || '').match(/^\s*N(\d+)/); return m ? parseInt(m[1], 10) : null; };
    const nHere = nOf(lines[afterLineIdx]);
    const nNext = nOf(lines[afterLineIdx + 1]);
    let nStr = '';
    if (nHere != null) {
      const nNew = (nNext != null && nNext - nHere > 1) ? Math.floor((nHere + nNext) / 2) : nHere + 1;
      nStr = `N${nNew} `;
    }
    let line = `${nStr}${move.type} X${fmt(xOut)} Z${fmt(move.z)}`;
    if ((move.type === 'G2' || move.type === 'G3') && move.cr) line += ` CR=${fmt(move.cr)}`;
    if (move.type !== 'G0') line += ` F${S.params.feed}`;   // řezné pohyby = posuv
    lines.splice(afterLineIdx + 1, 0, line);
    S.manualGCode = lines.join('\n');
    markGCodeEdited();   // ruční úprava dráhy — automatika ji už nepřepíše
    recalcNow();
    S.generatedCode = generateGCode(S._cachedCalc);
    S._gcodeFocusLine = afterLineIdx + 1;
    renderCodeArea(); draw(); saveState();
  }
  return { getGNodes, getGNodeAt, getGSegmentAt, writeGLines, writeGLine, deleteGLine, insertGMove };
}
