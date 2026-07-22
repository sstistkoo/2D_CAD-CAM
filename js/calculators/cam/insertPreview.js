// Minimální (reálná, v mm) výška těla upichovacího/zapichovacího plátku nad
// aktivním rádiem — sdíleno mezi drawInsertAndHolderPreview(), getInsertAnchorPoints()
// a buildInsertProfileSegments() (📐 Kreslit na CAD plátně), ať plátek v náhledu,
// anchor bodech i reálně nakreslené CAD geometrii vypadá stejně vysoký.
const PARTING_BODY_MIN_H_MM = 15;

// ── Náhled geometrie destičky + držáku (dialog "⚙️ Geometrie") ────
// Samostatná, na S/simulaci nezávislá kreslicí funkce — kreslí vždy v
// kanonické orientaci (bez ohledu na S.flipX/flipZ/roughingSide, což jsou
// vlastnosti pohledu simulace, ne nástroje samotného). Matematika tvaru
// destičky vychází ze stejných vzorců jako vykreslení nástroje během
// simulace (viz draw(), blok "tool position during sim"), zbavená
// flip/mirror větví.
export function drawInsertAndHolderPreview(ctx, w, h, prms, opts) {
  opts = opts || {};
  // uiScale = 1/viewZoom — čáry a markery se násobí jím, aby po zoomu celého
  // kontextu (viz redrawCanvas) zůstaly na obrazovce KONSTANTNĚ tenké.
  // Text se na canvas vůbec nekreslí (rozmazal by se při zoomu) — vrací se
  // v `texts` a vykreslí se jako ostré HTML overlaye (viz positionTexts).
  const us = opts.uiScale || 1;
  const COL = { bg: '#1e1e2e', insert: 'rgba(186,194,222,0.85)', text: '#a6adc8',
    holder: 'rgba(108,112,134,0.35)', holderStroke: 'rgba(166,173,200,0.85)',
    anchor: '#a6e3a1' };
  const labels = {}; // klikatelné anotace úhlů — logické souřadnice (bez zoom/pan volajícího)
  const anchorHits = []; // klikatelné anchor body pro ruční kreslení obrysu (viz opts.showAnchors)
  const handleHits = []; // klikatelné body spodní hrany držáku (editor tvaru, opts.showHolderHandles)
  const texts = [];  // {x, y, text, color, align} v logických souř. → HTML overlaye
  ctx.save();
  if (w <= 0 || h <= 0) { ctx.restore(); return { labels, anchorHits, handleHits, texts }; }

  const toolLen = Math.max(parseFloat(prms.toolLength) || 10, 1);
  const holderW = Math.max(parseFloat(prms.holderWidth) || 0, 0);
  const holderL = Math.max(parseFloat(prms.holderLength) || 0, 0);
  const profile = prms.holderProfile;
  const hasProfile = !!(profile && (
    (profile.sideA && profile.sideA.length) || (profile.sideB && profile.sideB.length)));

  // Vykreslená délka dříku se STROPUJE nezávisle na skutečném l1 (dlouhý
  // držák by jinak zabíral většinu výšky náhledu a zmenšoval destičku pod
  // čitelnou velikost) — reálná délka zůstává v popisce, jen se v náhledu
  // zkrátí a označí standardní značkou přerušení (klikatý zlom). Platí jen
  // pro obdélníkový fallback (bez vlastního nakresleného obrysu).
  const maxShankDrawMM = Math.max(holderW * 1.6, toolLen * 1.5, 12);
  const shankDrawMM = Math.min(holderL, maxShankDrawMM);
  const isShortened = !hasProfile && holderW > 0 && holderL > 0 && holderL > shankDrawMM + 0.01;
  // Mezera mezi špičkou destičky a začátkem držáku — musí být aspoň tak
  // velká, jako destička skutečně "sahá" nahoru (toolLen), jinak její tělo
  // vizuálně přesahuje do hlavy držáku a obě kresby se pletou přes sebe.
  const gapMM = toolLen * 1.3;

  // Pokud existuje vlastní obrys, musí se do maxDim vejít i on (může sahat
  // dál/šířeji než obdélníkový fallback). Faktor je nízký (1,25) — profil
  // má vyplnit náhled; detaily u hrany destičky si uživatel přiblíží zoomem.
  let profileExtentMM = 0;
  if (hasProfile) {
    [...(profile.sideA || []), ...(profile.sideB || [])].forEach(p => {
      profileExtentMM = Math.max(profileExtentMM, Math.abs(p.x), Math.abs(p.z));
    });
  }

  // V kresebním režimu (opts.showAnchors) měřítko fituje na DESTIČKU (ne na
  // držák) — tím je destička velká, min-pixel clampy níže se neaktivují a
  // anchor body sednou přesně na vykreslenou hranu. Držák se v tomto režimu
  // nekreslí (jen destička + anchory + rozpracovaný profil).
  const drawMode = !!opts.showAnchors;
  // hideHolder = záložka „🔩 Destička" — kreslí se jen destička (bez držáku),
  // měřítko fituje na destičku (ne na držák).
  const hideHolder = !!opts.hideHolder;
  const fitInsert = drawMode || hideHolder;
  const insRadiusMM = Math.max(parseFloat(prms.toolRadius) || 0.8, 0.1);
  // V editoru obdélníku (showHolderHandles) se fituje na DESTIČKU + spodní
  // hranu držáku (ne na celé l1=200 → jinak by byla destička mikroskopická).
  const fitProfileExtent = drawMode && !opts.showHolderHandles ? profileExtentMM * 1.25 : 0;
  const maxDim = fitInsert
    ? Math.max(toolLen * 2.6, insRadiusMM * 4.5, fitProfileExtent,
        opts.showHolderHandles ? (Math.max(parseFloat(prms.holderWidth) || 20, 0) * 1.4 + toolLen * 2) : 0, 12)
    : Math.max((gapMM + shankDrawMM) * 1.15, holderW * 1.15, toolLen * 2, profileExtentMM * 1.25, 20);
  const pad = 26;
  const scale = Math.max(Math.min((w - pad * 2) / maxDim, (h - pad * 2) / maxDim), 0.01);
  // Počátek (špička destičky): dole u fallbacku držáku, ale v kresebním režimu
  // výš (~60 %), ať je kolem destičky místo na anchory i na kulatou destičku
  // (ta má počátek ve svém středu → spodní půlka by jinak vypadla z canvasu).
  const ox = w / 2, oy = fitInsert ? h * 0.6 : h - pad - 8;
  const mirror = prms.holderHand === 'L' ? -1 : 1;
  // mm → screen: +z = "nahoru" do držáku (viz gapMM výše), zrcadlení dle ruky.
  const toScr = (x, z) => ({ x: ox + mirror * x * scale, y: oy - z * scale });

  // Natočení CELÉHO NOŽE (destička + držák) — otočí se celý ctx kolem špičky
  // (ox,oy), takže se destička i držák pootočí najednou. HTML popisky/anchory
  // (kreslené mimo ctx) se pak dorovnají přes rotScr().
  // knifeAngle = SMĚR, kterým míří destička od držáku (kompas ukazuje K
  // destičce). Výchozí 270° = svisle dolů = destička dole / držák nahoru
  // (bez pootočení). Vnitřní rotace náhledu R = 270 − knifeAngle.
  const _knifeDir = isFinite(parseFloat(prms.knifeAngle)) ? parseFloat(prms.knifeAngle) : 270;
  const knifeRad = ((270 - _knifeDir) * Math.PI / 180);
  if (knifeRad) { ctx.translate(ox, oy); ctx.rotate(knifeRad); ctx.translate(-ox, -oy); }
  const kc = Math.cos(knifeRad), ks = Math.sin(knifeRad);
  const rotScr = (sx, sy) => knifeRad
    ? { x: ox + (sx - ox) * kc - (sy - oy) * ks, y: oy + (sx - ox) * ks + (sy - oy) * kc }
    : { x: sx, y: sy };

  // ── Těleso držáku (schematicky, kanonická orientace: nahoru = do držáku) ──
  if (!hideHolder && hasProfile) {
    ctx.strokeStyle = COL.holderStroke; ctx.lineWidth = 1.4 * us;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ['sideA', 'sideB'].forEach(key => {
      const pts = profile[key];
      if (!pts || pts.length === 0) return;
      // Obrys začíná na PRVNÍM bodu (anchor na hraně destičky), ne z počátku —
      // jinak by vznikala matoucí spojnice od špičky ke hraně.
      ctx.beginPath();
      const s0 = toScr(pts[0].x, pts[0].z);
      ctx.moveTo(s0.x, s0.y);
      for (let i = 1; i < pts.length; i++) { const s = toScr(pts[i].x, pts[i].z); ctx.lineTo(s.x, s.y); }
      ctx.stroke();
    });
    // Orientační spojnice konců obou stran (zezadu) — jen tečkovaně, není to
    // skutečná hrana, jen naznačení uzavřeného obrysu.
    if (profile.sideA && profile.sideA.length && profile.sideB && profile.sideB.length) {
      const lastA = profile.sideA[profile.sideA.length - 1];
      const lastB = profile.sideB[profile.sideB.length - 1];
      const sA = toScr(lastA.x, lastA.z), sB = toScr(lastB.x, lastB.z);
      ctx.save(); ctx.setLineDash([4 * us, 3 * us]); ctx.strokeStyle = 'rgba(166,173,200,0.5)';
      ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.lineTo(sB.x, sB.y); ctx.stroke();
      ctx.restore();
    }
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  } else if (!hideHolder && !drawMode && holderW > 0 && holderL > 0) {
    const hw2 = (holderW / 2) * scale;
    const nearY = oy - gapMM * scale;
    const farY = nearY - shankDrawMM * scale;

    ctx.fillStyle = COL.holder; ctx.strokeStyle = COL.holderStroke; ctx.lineWidth = 1 * us;
    ctx.beginPath(); ctx.rect(ox - hw2, farY, hw2 * 2, nearY - farY); ctx.fill(); ctx.stroke();

    // Standardní značka přerušení (zlom) uprostřed dříku, když je vykreslená
    // délka zkrácená oproti skutečné l1.
    if (isShortened) {
      const breakY = (nearY + farY) / 2;
      const zig = Math.min(hw2 * 0.5, 8);
      ctx.save();
      ctx.strokeStyle = COL.bg; ctx.lineWidth = 3 * us;
      ctx.beginPath(); ctx.moveTo(ox - hw2 - 1, breakY); ctx.lineTo(ox + hw2 + 1, breakY); ctx.stroke();
      ctx.strokeStyle = COL.holderStroke; ctx.lineWidth = 1.2 * us;
      [-4 * us, 4 * us].forEach(dy => {
        ctx.beginPath();
        ctx.moveTo(ox - hw2 - 2, breakY + dy + zig);
        ctx.lineTo(ox - hw2 * 0.25, breakY + dy - zig);
        ctx.lineTo(ox + hw2 * 0.25, breakY + dy + zig);
        ctx.lineTo(ox + hw2 + 2, breakY + dy - zig);
        ctx.stroke();
      });
      ctx.restore();
    }

    texts.push({ x: ox, y: (farY - 12 > 10 ? farY - 12 : farY + 12), text: `b=${holderW} mm`, color: COL.text, align: 'center' });
    texts.push({ x: ox + hw2 + 14, y: (nearY + farY) / 2, text: `l1=${holderL} mm`, color: COL.text, align: 'left' });
  } else if (!hideHolder && !drawMode) {
    texts.push({ x: ox, y: pad, text: 'Držák se nehlídá (0 mm)', color: COL.text, align: 'center' });
  }


  // ── Destička v referenčním bodě (0,0 = špička/aktivní rádius) ──
  ctx.fillStyle = COL.insert; ctx.strokeStyle = '#cdd6f4'; ctx.lineWidth = 1.2 * us;
  const shape = prms.toolShape;
  // Minimum jen jako pojistka proti degenerovaně malé/nulové velikosti —
  // NESMÍ dominovat nad skutečným měřítkem (dřívější 20 px minimum dělalo
  // destičku vizuálně větší než držák, když byl scale kvůli dlouhému l1 malý).
  const rPix = Math.max((parseFloat(prms.toolRadius) || 0.8) * scale, 2.5);
  ctx.save(); ctx.translate(ox, oy); ctx.scale(mirror, 1);

  if (shape === 'round') {
    ctx.beginPath(); ctx.arc(0, 0, rPix, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (shape === 'threading') {
    const tipAngDeg = parseFloat(prms.toolTipAngle) || 60;
    const half = (tipAngDeg / 2) * (Math.PI / 180);
    const lenPix = Math.max(toolLen * scale, 8);
    const w2 = Math.max(((parseFloat(prms.toolTipFlat) || 0) * scale) / 2, 0.75);
    const dx = Math.sin(half) * lenPix, dy = Math.cos(half) * lenPix;
    ctx.beginPath();
    ctx.moveTo(-w2 - dx, -dy);
    ctx.lineTo(-w2, 0);
    ctx.lineTo(w2, 0);
    ctx.lineTo(w2 + dx, -dy);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    const epsLx = 0, epsLy = -dy - 12;
    texts.push({ x: ox + mirror * epsLx, y: oy + epsLy, text: `ε=${tipAngDeg}°`, color: '#a6e3a1', align: 'center' });
    labels.tipAngle = { x: ox + mirror * epsLx, y: oy + epsLy };
  } else if (shape === 'polygon') {
    const tipAngDeg = parseFloat(prms.toolTipAngle) || 90;
    const effAngleDeg = parseFloat(prms.toolAngle) || 0;
    const lenPix = Math.max(toolLen * scale, 8);
    const rotRad = -effAngleDeg * (Math.PI / 180);
    const tipAng = tipAngDeg * (Math.PI / 180);
    // Na kterou stranu od Natočení se 2. hrana otevírá — dvě geometricky
    // platné možnosti (viz toolTipMirror), ⇄ tlačítko v UI mezi nimi přepíná.
    const a1 = rotRad, a2 = rotRad - tipAng * (prms.toolTipMirror ? -1 : 1);
    const distToCorner = rPix / Math.sin(tipAng / 2);
    const bisector = (a1 + a2) / 2;
    const cornerX = Math.cos(bisector + Math.PI) * distToCorner;
    const cornerY = Math.sin(bisector + Math.PI) * distToCorner;
    const tanLen = Math.min(rPix / Math.tan(tipAng / 2), lenPix * 0.99);
    const t1x = cornerX + Math.cos(a1) * tanLen, t1y = cornerY + Math.sin(a1) * tanLen;
    const t2x = cornerX + Math.cos(a2) * tanLen, t2y = cornerY + Math.sin(a2) * tanLen;
    const angT1 = Math.atan2(t1y, t1x), angT2 = Math.atan2(t2y, t2x);
    const angCorner = bisector + Math.PI;
    const norm = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const angDiff = (a, b) => { let d = norm(a - b); if (d > Math.PI) d -= 2 * Math.PI; return d; };
    const midCCWfalse = angT2 + norm(angT1 - angT2) / 2;
    const midCCWtrue = angT2 - norm(angT2 - angT1) / 2;
    const useCCW = Math.abs(angDiff(midCCWtrue, angCorner)) < Math.abs(angDiff(midCCWfalse, angCorner));
    ctx.beginPath(); ctx.moveTo(t1x, t1y);
    ctx.lineTo(cornerX + Math.cos(a1) * lenPix, cornerY + Math.sin(a1) * lenPix);
    ctx.lineTo(cornerX + Math.cos(a2) * lenPix, cornerY + Math.sin(a2) * lenPix);
    ctx.lineTo(t2x, t2y);
    ctx.arc(0, 0, rPix, angT2, angT1, useCCW);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // Klikatelné popisky ε (vrcholový úhel) a natočení — přibližná poloha,
    // stačí k umístění klikací "hotspot" bubliny nad canvasem.
    const epsDir = bisector + Math.PI;
    const epsLx = Math.cos(epsDir) * (rPix + 14), epsLy = Math.sin(epsDir) * (rPix + 14);
    texts.push({ x: ox + mirror * epsLx, y: oy + epsLy, text: `ε=${tipAngDeg}°`, color: '#a6e3a1', align: 'center' });
    labels.tipAngle = { x: ox + mirror * epsLx, y: oy + epsLy };
    const angLx = Math.cos(a1) * (lenPix * 0.55 + 6), angLy = Math.sin(a1) * (lenPix * 0.55 + 6);
    texts.push({ x: ox + mirror * angLx, y: oy + angLy, text: `∠${effAngleDeg}°`, color: '#f9e2af', align: 'center' });
    labels.toolAngle = { x: ox + mirror * angLx, y: oy + angLy };
  } else if (shape === 'parting') {
    const wPix = Math.max(toolLen * scale, 8);
    const effAngleDeg = parseFloat(prms.toolAngle) || 0;
    const rotRad = -effAngleDeg * (Math.PI / 180);
    const r = Math.min(rPix, wPix / 2);
    const w2 = wPix - 2 * r;
    // Výška těla plátku v mm (PARTING_BODY_MIN_H_MM nad rádiem), převedená na
    // px přes `scale` — dřív byl minimem pevný "+10 px", který se scvrkával
    // s mm-výškou (10 px v mm ubývalo se zoomem), takže tělo bylo při větším
    // přiblížení nesmyslně nízké. Stejná konstanta se používá i v
    // getInsertAnchorPoints() a buildInsertProfileSegments() (📐 Kreslit na
    // CAD plátně), ať plátek vždy vypadá stejně vysoký (~15 mm reálně).
    const bodyH = Math.max(wPix * 0.6, r + PARTING_BODY_MIN_H_MM * scale);
    ctx.save(); ctx.rotate(rotRad);
    ctx.beginPath();
    ctx.moveTo(-r, r - bodyH);
    ctx.lineTo(-r, 0);
    ctx.arc(0, 0, r, Math.PI, Math.PI / 2, true);
    ctx.lineTo(w2, r);
    ctx.arc(w2, 0, r, Math.PI / 2, 0, true);
    ctx.lineTo(w2 + r, r - bodyH);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    const angLx = Math.cos(rotRad) * wPix * 0.5, angLy = Math.sin(rotRad) * wPix * 0.5 - bodyH - 6;
    texts.push({ x: ox + mirror * angLx, y: oy + angLy, text: `∠${effAngleDeg}°`, color: '#f9e2af', align: 'center' });
    labels.toolAngle = { x: ox + mirror * angLx, y: oy + angLy };
  }

  // referenční křížek ve špičce
  const cross = 5 * us;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1 * us;
  ctx.beginPath();
  ctx.moveTo(-cross, 0); ctx.lineTo(cross, 0);
  ctx.moveTo(0, -cross); ctx.lineTo(0, cross);
  ctx.stroke();
  ctx.restore();
  ctx.restore();

  // ── Anchor body pro ruční kreslení obrysu držáku (jen v kresebním režimu) ──
  // Kreslí se AŽ NAD destičkou (jinak by u kulaté destičky ležely přesně na
  // jejím obvodu a byly by kruhem překryté).
  if (opts.showAnchors) {
    getInsertAnchorPoints(prms).forEach(a => {
      // Anchory se kreslí AŽ po ctx.restore (mimo rotaci nože) → screen pozici
      // otočíme ručně přes rotScr, ať sedí na (rotované) hraně destičky.
      const sp = toScr(a.x, a.z);
      const s = rotScr(sp.x, sp.y);
      anchorHits.push({ x: s.x, y: s.y, wx: a.x, wz: a.z, side: a.side, label: a.label });
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5 * us, 0, Math.PI * 2);
      ctx.fillStyle = opts.activeSide === a.side ? COL.anchor : 'rgba(166,227,161,0.5)';
      ctx.strokeStyle = COL.anchor; ctx.lineWidth = 1 * us;
      ctx.fill(); ctx.stroke();
    });
  }

  // ── Klikací body spodní hrany držáku (editor tvaru) — žluté čtverečky ──
  if (opts.showHolderHandles && hasProfile) {
    const sel = opts.selectedHandle;
    holderBottomHandles(profile.sideA).forEach(hnd => {
      const sp = toScr(hnd.x, hnd.z);
      const s = rotScr(sp.x, sp.y);
      handleHits.push({ x: s.x, y: s.y, wx: hnd.x, wz: hnd.z, role: hnd.role, which: hnd.which });
      const isSel = sel && Math.abs(sel.x - hnd.x) < 1e-6 && Math.abs(sel.z - hnd.z) < 1e-6;
      const sz = (hnd.role === 'corner' ? 5 : 4) * us;
      ctx.beginPath();
      ctx.rect(s.x - sz, s.y - sz, sz * 2, sz * 2);
      ctx.fillStyle = isSel ? '#f9e2af' : 'rgba(249,226,175,0.5)';
      ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 1.2 * us;
      ctx.fill(); ctx.stroke();
    });
  }

  // Natočení nože: HTML popisky (ε, ∠, b, l1…) a klikatelné hotspoty leží mimo
  // ctx, takže je dorovnáme do stejné rotace jako kreslenou geometrii.
  if (knifeRad) {
    texts.forEach(t => { const r = rotScr(t.x, t.y); t.x = r.x; t.y = r.y; });
    Object.keys(labels).forEach(k => { const r = rotScr(labels[k].x, labels[k].y); labels[k] = r; });
  }

  return { labels, anchorHits, handleHits, texts };
}

// Klikatelné anchor body na destičce, odkud se dá spustit kreslení jedné
// strany obrysu držáku (viz S.params.holderProfile). Souřadnice v mm, STEJNÝ
// systém jako holderProfile (0,0 = referenční bod destičky, +z = "nahoru"
// do držáku) — bez zrcadlení (to řeší až toScr()/opts v drawInsertAndHolderPreview).
export function getInsertAnchorPoints(prms) {
  const shape = prms.toolShape;
  const pts = [];
  if (shape === 'round') {
    const r = Math.max(parseFloat(prms.toolRadius) || 0.8, 0.1);
    for (let i = 0; i < 8; i++) {
      const deg = i * 45;
      const rad = deg * Math.PI / 180;
      pts.push({ x: Math.cos(rad) * r, z: Math.sin(rad) * r, side: i < 4 ? 'sideA' : 'sideB', label: `${deg}°` });
    }
  } else if (shape === 'polygon') {
    const tipAngDeg = parseFloat(prms.toolTipAngle) || 90;
    const effAngleDeg = parseFloat(prms.toolAngle) || 0;
    const toolLen = Math.max(parseFloat(prms.toolLength) || 10, 1);
    const r = Math.max(parseFloat(prms.toolRadius) || 0.8, 0);
    const rotRad = -effAngleDeg * Math.PI / 180;
    const tipAng = tipAngDeg * Math.PI / 180;
    const a1 = rotRad, a2 = rotRad - tipAng * (prms.toolTipMirror ? -1 : 1);
    // Konec hrany PŘESNĚ tam, kde ji kreslí drawInsertAndHolderPreview:
    // střed rádiusu špičky je posunut o distToCorner podél bisektoru a hrany
    // z něj vybíhají do délky toolLen (viz cornerX/cornerY v draw fci). Bez
    // tohoto offsetu ležel anchor mimo skutečnou hranu.
    const distToCorner = tipAng > 0 ? r / Math.sin(tipAng / 2) : 0;
    const bis = (a1 + a2) / 2 + Math.PI;
    const cx = Math.cos(bis) * distToCorner, cy = Math.sin(bis) * distToCorner;
    pts.push({ x: cx + Math.cos(a1) * toolLen, z: -(cy + Math.sin(a1) * toolLen), side: 'sideA', label: 'Hrana A' });
    pts.push({ x: cx + Math.cos(a2) * toolLen, z: -(cy + Math.sin(a2) * toolLen), side: 'sideB', label: 'Hrana B' });
  } else if (shape === 'threading') {
    // Stejná matematika jako drawInsertAndHolderPreview (shape === 'threading'),
    // jen bez scale — vrchní (širší) hrana lichoběžníku, kde plátek sedí
    // proti držáku, dá tři cíle pro Upravit obdélník: levý/pravý roh + střed.
    const tipAngDeg = parseFloat(prms.toolTipAngle) || 60;
    const half = (tipAngDeg / 2) * Math.PI / 180;
    const toolLen = Math.max(parseFloat(prms.toolLength) || 4, 0.1);
    const flat2 = Math.max((parseFloat(prms.toolTipFlat) || 0) / 2, 0);
    const dx = Math.sin(half) * toolLen, dz = Math.cos(half) * toolLen;
    pts.push({ x: -(flat2 + dx), z: dz, side: 'sideA', label: 'Hrana A (vlevo)' });
    pts.push({ x: 0, z: dz, side: 'top', label: 'Vrch – střed' });
    pts.push({ x: flat2 + dx, z: dz, side: 'sideB', label: 'Hrana B (vpravo)' });
  } else if (shape === 'parting') {
    // Stejná matematika jako buildInsertProfileSegments (shape === 'parting',
    // v CAD Kreslit na CAD plátně) — vrchní hrana těla plátku (u držáku).
    const toolLen = Math.max(parseFloat(prms.toolLength) || 5, 1);
    const R = Math.max(parseFloat(prms.toolRadius) || 0.8, 0.05);
    const r = Math.min(R, toolLen / 2);
    const w2 = toolLen - 2 * r;
    const bodyH = Math.max(toolLen * 0.6, r + PARTING_BODY_MIN_H_MM);
    const rotRad = -(parseFloat(prms.toolAngle) || 0) * Math.PI / 180;
    const rot = (x, y) => ({
      x: x * Math.cos(rotRad) - y * Math.sin(rotRad),
      z: -(x * Math.sin(rotRad) + y * Math.cos(rotRad)),
    });
    const topL = rot(-r, r - bodyH), topR = rot(w2 + r, r - bodyH);
    pts.push({ x: topL.x, z: topL.z, side: 'sideA', label: 'Hrana A (vlevo)' });
    pts.push({ x: (topL.x + topR.x) / 2, z: (topL.z + topR.z) / 2, side: 'top', label: 'Vrch – střed' });
    pts.push({ x: topR.x, z: topR.z, side: 'sideB', label: 'Hrana B (vpravo)' });
  }
  // Střed rádiusu / referenční bod destičky (0,0) — cíl pro přesun držáku.
  // side:'center' → NENÍ strana obrysu, slouží jen jako cíl přesunu (viz editor).
  pts.push({ x: 0, z: 0, side: 'center', label: 'Střed R' });
  return pts;
}

// ── Plný obrys destičky (profil {x,z}: 0,0 = špička, +z = k držáku) ──
// Segmenty uzavřeného obrysu destičky pro daný tvar (round/polygon/parting).
// SDÍLENO s buildInsertProfileSegments() v camSimulator.js (📐 Kreslit na CAD
// plátně) — musí zůstat MATEMATICKY shodné (stejné vzorce jako kreslení nože
// v draw()/drawInsertAndHolderPreview). Slouží i jako zdroj obrysu pro
// sjednocenou zakázanou oblast nástroje (toolEnvelope.insertWorldLoop, Fáze
// 2b/3 migrace). Threading → [] (V-profil se do kolizní obálky nepočítá).
export function buildInsertProfileSegments(prms) {
  const shape = prms.toolShape;
  const R = Math.max(parseFloat(prms.toolRadius) || 0.8, 0.05);
  const segs = [];
  if (shape === 'round') {
    segs.push({ type: 'circle', cx: 0, cz: 0, r: R });
    return segs;
  }
  if (shape === 'polygon') {
    const tipAng = (parseFloat(prms.toolTipAngle) || 90) * Math.PI / 180;
    const rotRad = -(parseFloat(prms.toolAngle) || 0) * Math.PI / 180;
    const toolLen = Math.max(parseFloat(prms.toolLength) || 10, 1);
    const a1 = rotRad, a2 = rotRad - tipAng * (prms.toolTipMirror ? -1 : 1);
    const distToCorner = R / Math.sin(tipAng / 2);
    const bis = (a1 + a2) / 2;
    const cX = Math.cos(bis + Math.PI) * distToCorner;
    const cY = Math.sin(bis + Math.PI) * distToCorner;
    const tanLen = Math.min(R / Math.tan(tipAng / 2), toolLen * 0.99);
    const P = (ang, len) => ({ x: cX + Math.cos(ang) * len, z: -(cY + Math.sin(ang) * len) });
    const t1 = P(a1, tanLen), t2 = P(a2, tanLen);
    const farA = P(a1, toolLen), farB = P(a2, toolLen);
    segs.push({ type: 'line', from: t1, to: farA });
    segs.push({ type: 'line', from: farA, to: farB });
    segs.push({ type: 'line', from: farB, to: t2 });
    segs.push({ type: 'arc', cx: 0, cz: 0, r: R, from: t2, to: t1 });
    return segs;
  }
  if (shape === 'parting') {
    const toolLen = Math.max(parseFloat(prms.toolLength) || 5, 1);
    const rotRad = -(parseFloat(prms.toolAngle) || 0) * Math.PI / 180;
    const r = Math.min(R, toolLen / 2);
    const w2 = toolLen - 2 * r;
    const bodyH = Math.max(toolLen * 0.6, r + PARTING_BODY_MIN_H_MM);
    const rot = (x, y) => ({
      x: x * Math.cos(rotRad) - y * Math.sin(rotRad),
      z: -(x * Math.sin(rotRad) + y * Math.cos(rotRad)),
    });
    const pTopL = rot(-r, r - bodyH);
    const pBotL = rot(-r, 0);
    const pTopArcL = rot(0, r);
    const pFlatEnd = rot(w2, r);
    const pTopR = rot(w2 + r, r - bodyH);
    segs.push({ type: 'line', from: pTopL, to: pBotL });
    segs.push({ type: 'arc', cx: rot(0, 0).x, cz: rot(0, 0).z, r, from: pBotL, to: pTopArcL });
    segs.push({ type: 'line', from: pTopArcL, to: pFlatEnd });
    segs.push({ type: 'arc', cx: rot(w2, 0).x, cz: rot(w2, 0).z, r, from: pFlatEnd, to: pTopR });
    segs.push({ type: 'line', from: pTopR, to: pTopL });
    return segs;
  }
  return segs;
}

// ── Editor tvaru držáku (náhled) — čisté geometrické funkce ──────────
// Výchozí obdélníkový obrys držáku (uzavřený) v profilu {x,z}: šířka =
// holderWidth (osa x), délka = holderLength (osa z), spodní hrana u z=0
// (u destičky). Index 0=levý spodní roh (BL), 1=pravý spodní (BR).
export function holderRectProfile(prms) {
  const hw = Math.max(parseFloat(prms.holderWidth) || 20, 0.1);
  const l1 = Math.max(parseFloat(prms.holderLength) || 200, 1);
  // Spodní hrana NAD destičkou (z0 > 0), ať střední bod (0,z0) nekryje anchor
  // „Střed R" v (0,0) a ať je obdélník vizuálně nad destičkou.
  const toolLen = Math.max(parseFloat(prms.toolLength) || 10, 1);
  const r = Math.max(parseFloat(prms.toolRadius) || 0.8, 0.1);
  const z0 = Math.max(toolLen, r, 4);
  const bl = { x: -hw / 2, z: z0 }, br = { x: hw / 2, z: z0 };
  return [bl, br, { x: hw / 2, z: z0 + l1 }, { x: -hw / 2, z: z0 + l1 }, { x: bl.x, z: bl.z }];
}

// Vykreslí obrys DRŽÁKU (za destičkou) v hlavním simulačním náhledu — VOLAT
// uvnitř ctx.translate(pt.x, pt.y) + zrcadlení strany obrábění, PŘED
// natočením specifickým pro tvar destičky (toolAngle u polygonu/upichováku),
// stejně jako v dialogu "⚙️ Geometrie" (tam knifeAngle otáčí držák nezávisle
// na natočení destičky). Použije stejná profilová data (holderProfile.sideA/
// sideB, {x,z} vůči referenčnímu bodu destičky, +z = k držáku) jako
// getInsertAnchorPoints/holderRectProfile — bez vlastního obrysu prostý
// obdélník Délka × Tloušťka. holderWidth/holderLength ≤ 0 = držák se nehlídá.
export function drawHolderProfileLocal(ctx, prms, scale) {
  const profile = prms.holderProfile;
  const hasProfile = profile && ((profile.sideA && profile.sideA.length > 1) || (profile.sideB && profile.sideB.length > 1));
  if (!hasProfile && (Math.max(parseFloat(prms.holderWidth) || 0, 0) <= 0 || Math.max(parseFloat(prms.holderLength) || 0, 0) <= 0)) return;
  const sides = hasProfile ? [profile.sideA, profile.sideB] : [holderRectProfile(prms)];
  ctx.save();
  ctx.fillStyle = 'rgba(108,112,134,0.35)';
  ctx.strokeStyle = 'rgba(166,173,200,0.85)';
  ctx.lineWidth = 1;
  sides.forEach(pts => {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const lx = p.x * scale, ly = -p.z * scale;
      if (i === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
    });
    const closed = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z) < 1e-6;
    if (closed) { ctx.closePath(); ctx.fill(); }
    ctx.stroke();
  });
  ctx.restore();
}

// Spodní (u destičky) klikací body obrysu: 2 vrcholy s nejmenším z (rohy) +
// jejich střed. Vrací [{x,z,role:'corner'|'mid', which:'L'|'R'}].
export function holderBottomHandles(profile) {
  if (!profile || profile.length < 2) return [];
  const pts = profile.slice();
  if (Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z) < 1e-6) pts.pop();
  if (pts.length < 2) return [];
  const minZ = Math.min(...pts.map(p => p.z));
  const tol = Math.max(0.5, (Math.max(...pts.map(p => p.z)) - minZ) * 0.02);
  const bottom = pts.filter(p => p.z - minZ <= tol);
  if (bottom.length < 2) return bottom.map(p => ({ x: p.x, z: p.z, role: 'corner' }));
  const left = bottom.reduce((a, b) => (b.x < a.x ? b : a));
  const right = bottom.reduce((a, b) => (b.x > a.x ? b : a));
  return [
    { x: left.x, z: left.z, role: 'corner', which: 'L' },
    { x: (left.x + right.x) / 2, z: (left.z + right.z) / 2, role: 'mid' },
    { x: right.x, z: right.z, role: 'corner', which: 'R' },
  ];
}

// Posune celý obrys (obě strany) o (dx,dz).
export function translateHolderProfile(profile, dx, dz) {
  const move = arr => (arr || []).map(p => ({ x: p.x + dx, z: p.z + dz }));
  return { sideA: move(profile.sideA), sideB: move(profile.sideB) };
}

// Počet úseček uloženého obrysu držáku (0, pokud žádný vlastní obrys není)
// — stejná data (holderProfile.sideA/sideB), ať vznikla přesunem/sražením
// obdélníku (🔧 Upravit obdélník) nebo importem z CAD (📐 Kreslit na CAD
// plátně / captureHolderProfile) — obě cesty píší do stejné struktury bodů.
export function holderProfileSegCount(profile) {
  const n = arr => Math.max((arr || []).length - 1, 0);
  return n(profile && profile.sideA) + n(profile && profile.sideB);
}

// Čitelný výpis obrysu držáku (bod-po-bodu, v profilových souřadnicích —
// 0,0 = referenční bod destičky, +z = k držáku) pro rozbalovací sekci
// "Tvar držáku". Později poslouží jako zdroj dat pro hlídání kolizí při
// generování drah (potřebuje tvar držáku + jeho polohu vůči destičce).
export function holderShapeInfoHTML(prms) {
  const profile = prms.holderProfile;
  const hasProfile = profile && ((profile.sideA && profile.sideA.length > 1) || (profile.sideB && profile.sideB.length > 1));
  if (!hasProfile) {
    return `<div style="font-size:11px;color:#6c7086;padding:2px 0">Zatím bez vlastního obrysu — počítá se prostý obdélník
      Délka × Tloušťka (výše). Vlastní obrys vznikne přes 🔧 Upravit obdélník nebo 📐 Kreslit na CAD plátně.</div>`;
  }
  const segRows = (pts, label) => {
    if (!pts || pts.length < 2) return '';
    let rows = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const ang = Math.atan2(b.z - a.z, b.x - a.x) * 180 / Math.PI;
      rows += `<tr>
        <td style="padding:2px 6px">${label}${i + 1}</td>
        <td style="padding:2px 6px;font-family:monospace">${a.x.toFixed(1)}, ${a.z.toFixed(1)}</td>
        <td style="padding:2px 6px;font-family:monospace">${b.x.toFixed(1)}, ${b.z.toFixed(1)}</td>
        <td style="padding:2px 6px">${len.toFixed(1)} mm</td>
        <td style="padding:2px 6px">${ang.toFixed(0)}°</td>
      </tr>`;
    }
    return rows;
  };
  return `<table style="width:100%;font-size:10px;border-collapse:collapse">
    <thead><tr style="color:#a6adc8;text-align:left">
      <th style="padding:2px 6px">Úsek</th><th style="padding:2px 6px">Od (X,Z)</th><th style="padding:2px 6px">Do (X,Z)</th>
      <th style="padding:2px 6px">Délka</th><th style="padding:2px 6px">Úhel</th>
    </tr></thead>
    <tbody>${segRows(profile.sideA, 'A')}${segRows(profile.sideB, 'B')}</tbody>
  </table>`;
}

// Srazí (zkosí) roh nejbližší bodu cornerPt. `dist` = délka první nohy (podél
// hrany k předchozímu bodu), `angleDeg` = úhel sražení vůči této hraně (45° =
// symetrické pro pravý úhel). Druhá noha se dopočte ze sinové věty podle
// vnitřního úhlu rohu. Vrací nové pole bodů dané strany (uzavřené, když bylo).
export function chamferProfileCorner(sidePts, cornerPt, dist, angleDeg = 45) {
  if (!sidePts || sidePts.length < 3) return sidePts;
  const closed = Math.hypot(sidePts[0].x - sidePts[sidePts.length - 1].x, sidePts[0].z - sidePts[sidePts.length - 1].z) < 1e-6;
  const pts = closed ? sidePts.slice(0, -1) : sidePts.slice();
  const n = pts.length;
  let idx = -1, bd = Infinity;
  pts.forEach((p, i) => { const d = Math.hypot(p.x - cornerPt.x, p.z - cornerPt.z); if (d < bd) { bd = d; idx = i; } });
  if (idx < 0) return sidePts;
  const prev = pts[(idx - 1 + n) % n], cur = pts[idx], next = pts[(idx + 1) % n];
  const unit = (from, to) => { const dx = to.x - from.x, dz = to.z - from.z; const l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l, len: Math.hypot(dx, dz) }; };
  const uPrev = unit(cur, prev), uNext = unit(cur, next);
  // Vnitřní úhel rohu γ (mezi hranami) a úhel sražení β vůči hraně k `prev`.
  const gamma = Math.acos(Math.max(-1, Math.min(1, uPrev.x * uNext.x + uPrev.z * uNext.z)));
  let beta = (parseFloat(angleDeg) || 45) * Math.PI / 180;
  beta = Math.max(0.02, Math.min(beta, Math.max(0.02, Math.PI - gamma - 0.02)));
  const dP = Math.min(dist, uPrev.len * 0.9);
  const denom = Math.sin(gamma + beta);
  // Sinová věta v trojúhelníku roh-P1-P2: dN = dP·sin β / sin(γ+β).
  let dN = Math.abs(denom) < 1e-6 ? dP : dP * Math.sin(beta) / denom;
  dN = Math.max(0, Math.min(dN, uNext.len * 0.9));
  const p1 = { x: cur.x + uPrev.x * dP, z: cur.z + uPrev.z * dP };
  const p2 = { x: cur.x + uNext.x * dN, z: cur.z + uNext.z * dN };
  pts.splice(idx, 1, p1, p2);
  if (closed) pts.push({ x: pts[0].x, z: pts[0].z });
  return pts;
}

// Sdílený markup pro tvar destičky (Rádius/tlačítka tvaru + podmíněná pole) —
// používá jak hlavní panel "Nástroj", tak modal "⚙️ Geometrie", aby obě UI
// zůstala vizuálně i datově identická (stejné klíče data-p/data-tshape).
// Pole polárního úhlu s tlačítkem ✛ pro rychlou volbu po 45° (stejný vzor
// jako 🔢 Číselné zadání objektu v CAD — viz wireAngleCompass()).
export function _polarAngleFieldHTML(dataP, value, titleAttr) {
  return `<div class="cam-sim-field"><label title="${titleAttr || 'Natočení plátku (polární úhel) vůči ose Z; 0° = vodorovně. Tlačítkem ✛ lze rychle zvolit násobky 45°.'}">natočeni PU(°)</label>
    <div style="display:flex;gap:2px">
      <input type="number" data-p="${dataP}" value="${value}" style="flex:1;min-width:0">
      <button type="button" class="compass-trigger-btn" data-compass-for="${dataP}" title="Rychlá volba úhlu" style="font-size:13px;padding:2px 5px;flex-shrink:0">✛</button>
    </div>
  </div>`;
}

// Napojí ✛ tlačítko na kompasový popup pro rychlou volbu úhlu (0/45/90/…)
// — vzor převzatý z js/dialogs/numericalInput.js (wireAngleCompass), sdílí
// stejné CSS třídy (.angle-compass-popup/.compass-grid/.compass-arrow).
// onPick(angleDeg) se zavolá navíc k vyplnění inputEl (pro data-p pole to
// stačí nechat na 'change' listeneru přes dispatchEvent; onPick je pro
// místa mimo data-p mechanismus, např. showRotateToolPopup).
export function wireAngleCompass(triggerBtn, inputEl, onPick) {
  if (!triggerBtn) return;
  triggerBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const existing = document.querySelector('.angle-compass-popup');
    if (existing) existing.remove();
    const popup = document.createElement('div');
    popup.className = 'angle-compass-popup';
    popup.innerHTML = `<div class="compass-grid">
      <button type="button" data-ang="135" class="compass-arrow" style="grid-area:tl">↖</button>
      <button type="button" data-ang="90" class="compass-arrow" style="grid-area:tc">↑</button>
      <button type="button" data-ang="45" class="compass-arrow" style="grid-area:tr">↗</button>
      <button type="button" data-ang="180" class="compass-arrow" style="grid-area:ml">←</button>
      <button type="button" class="compass-close" style="grid-area:mc">✕</button>
      <button type="button" data-ang="0" class="compass-arrow" style="grid-area:mr">→</button>
      <button type="button" data-ang="225" class="compass-arrow" style="grid-area:bl">↙</button>
      <button type="button" data-ang="270" class="compass-arrow" style="grid-area:bc">↓</button>
      <button type="button" data-ang="315" class="compass-arrow" style="grid-area:br">↘</button>
    </div>`;
    document.body.appendChild(popup);
    const rect = triggerBtn.getBoundingClientRect();
    popup.style.position = 'fixed';
    // Musí být NAD modalem Geometrie (z-index 300) i nad side/rotate popupy
    // (320), jinak by kompas zůstal schovaný za jejich celoobrazovkovým
    // backdropem a klik by na něj nedosáhl (to byl důvod „nereaguje").
    popup.style.zIndex = '600';
    popup.style.left = Math.max(Math.min(rect.left - 60, window.innerWidth - 150), 6) + 'px';
    popup.style.top = Math.max(rect.top - 150, 6) + 'px';
    popup.querySelectorAll('.compass-arrow').forEach(ab => {
      ab.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const ang = parseFloat(ab.dataset.ang);
        if (inputEl) { inputEl.value = ang; inputEl.dispatchEvent(new Event('change', { bubbles: true })); }
        if (onPick) onPick(ang);
        popup.remove();
      });
    });
    popup.querySelector('.compass-close').addEventListener('click', () => popup.remove());
    setTimeout(() => {
      function outsideClick(ev) {
        if (!popup.contains(ev.target) && ev.target !== triggerBtn) { popup.remove(); document.removeEventListener('mousedown', outsideClick); }
      }
      document.addEventListener('mousedown', outsideClick);
    }, 50);
  });
}

// Napojí všechna ✛ tlačítka (data-compass-for) uvnitř containeru na jejich
// odpovídající data-p pole.
export function wireAllAngleCompasses(container) {
  container.querySelectorAll('[data-compass-for]').forEach(btn => {
    const inp = container.querySelector(`[data-p="${btn.dataset.compassFor}"]`);
    wireAngleCompass(btn, inp);
  });
}

export function _renderInsertShapeFieldsHTML(prms) {
  let html = `${(prms.toolShape === 'threading' || prms.toolShape === 'polygon') ? '' : `<div class="cam-sim-row">
    <div class="cam-sim-field"><label title="Rádius zaoblení špičky plátku (mm). U kulatého plátku určuje celý poloměr destičky.">Rádius (R)</label><input type="number" step="0.1" data-p="toolRadius" value="${prms.toolRadius}"></div>
  </div>`}
  <div style="margin-top:4px"><label style="font-size:10px;color:#6c7086">Tvar destičky</label></div>
  <div class="cam-sim-tool-shape-row">
    <button data-tshape="round" class="${prms.toolShape === 'round' ? 'cam-sim-active' : ''}" title="Kulatý plátek (RCMT/RCGT) — celá kruhová břitová destička definovaná pouze rádiusem (R)">⬤</button>
    <button data-tshape="polygon" class="${prms.toolShape === 'polygon' ? 'cam-sim-active' : ''}" title="Polygonální plátek (kosočtverec/trojúhelník/kosodélník…) — definovaný délkou hrany, polárním úhlem, vrcholovým úhlem (ε) a rádiusem špičky">◼</button>
    <button data-tshape="parting" class="${prms.toolShape === 'parting' ? 'cam-sim-active' : ''}" title="Upichovací / zapichovací plátek">▮</button>
    <button data-tshape="threading" class="${prms.toolShape === 'threading' ? 'cam-sim-active' : ''}" title="Závitový plátek (profil V dle úhlu závitu)">▽</button>
  </div>`;
  if (prms.toolShape === 'polygon') {
    html += `<div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Délka jedné hrany plátku (mm) — velikost polygonální destičky">Délka hrany</label><input type="number" data-p="toolLength" value="${prms.toolLength}"></div>
      ${_polarAngleFieldHTML('toolAngle', prms.toolAngle)}
      <div class="cam-sim-field"><label title="Vrcholový úhel špičky (ε) mezi hranami plátku — např. 80° (C), 55° (D), 35° (V), 60° (trojúhelník)">Vrch. úhel (ε)</label><input type="number" data-p="toolTipAngle" value="${prms.toolTipAngle}"></div>
      <div class="cam-sim-field"><label title="Rádius zaoblení špičky plátku (mm)">Rádius (R)</label><input type="number" step="0.1" data-p="toolRadius" value="${prms.toolRadius}"></div>
    </div>
    <div class="cam-sim-row">
      <button data-act="toggle-tip-mirror" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:3px 8px;font-size:11px" title="Vrcholový úhel (ε) jde od Natočení otevřít na dvě strany — pokud náhled ukáže destičku obráceně, přehoďte ji tímto tlačítkem místo přepočítávání úhlů">⇄ Přehodit stranu</button>
    </div>`;
  } else if (prms.toolShape === 'parting') {
    html += `<div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Šířka upichovacího plátku — odpovídá délce hrany">Šířka plátku</label><input type="number" data-p="toolLength" value="${prms.toolLength}"></div>
      ${_polarAngleFieldHTML('toolAngle', prms.toolAngle, 'Polární úhel plátku; 0° = vodorovně s osou Z')}
    </div>`;
  } else if (prms.toolShape === 'threading') {
    html += `<div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Vrcholový úhel V-profilu plátku — musí odpovídat úhlu závitu (M/UN 60°, G/BSW 55°, Tr 30°, Acme 29°). Výběr závitu (🧵 Závity) ho nastaví automaticky.">Úhel profilu (ε)</label><input type="number" data-p="toolTipAngle" value="${prms.toolTipAngle}" min="10" max="90" step="0.5"></div>
      <div class="cam-sim-field"><label title="Délka zobrazené hrany plátku (jen vizualizace)">Délka hrany</label><input type="number" data-p="toolLength" value="${prms.toolLength}"></div>
      <div class="cam-sim-field"><label title="Šířka rovné špičky plátku (lichoběžník). Metrické/palcové ~0,1 mm; Tr/Acme ≈ 0,366×P — výběr závitu (🧵 Závity) nastaví automaticky. Nahrazuje Rádius (R), který se u závitového plátku nepoužívá.">Spodní strana</label><input type="number" data-p="toolTipFlat" value="${prms.toolTipFlat ?? 0.1}" min="0" step="0.05"></div>
    </div>`;
  }
  return html;
}
