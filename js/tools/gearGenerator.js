// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Generátor profilů ozubení (spur, internal, rack,  ║
// ║          sprocket)                                          ║
// ╚══════════════════════════════════════════════════════════════╝

/**
 * Vypočítá základní rozměry ozubeného kola.
 * @param {number} m  modul
 * @param {number} z  počet zubů
 * @param {number} alpha  úhel záběru [°]
 * @param {number} x  koeficient posunutí profilu
 */
export function calculateGearDimensions(m, z, alpha, x = 0) {
  const aRad = alpha * Math.PI / 180;
  const rp = (m * z) / 2;                          // roztečný poloměr
  const rb = rp * Math.cos(aRad);                  // základní poloměr
  const ra = m * (z + 2 + 2 * x) / 2;              // hlavový poloměr
  const rf = m * (z - 2.5 + 2 * x) / 2;            // patní poloměr
  const ha = m * (1 + x);                           // výška hlavy zubu
  const hf = m * (1.25 - x);                        // výška paty zubu
  const p = Math.PI * m;                            // rozteč
  const s = p / 2;                                  // tloušťka zubu na roztečné kružnici

  return { rp, rb, ra, rf, ha, hf, p, s, aRad };
}

/**
 * Involuntní funkce: inv(φ) = tan(φ) − φ
 */
function inv(phi) {
  return Math.tan(phi) - phi;
}

/**
 * Úhel involuntní křivky při daném poloměru r.
 * @param {number} rb  základní poloměr
 * @param {number} r   aktuální poloměr
 * @returns {number}    involuntní úhel (0 na základní kružnici)
 */
function involuteAngleAt(rb, r) {
  if (r <= rb) return 0;
  const phi = Math.acos(rb / r);
  return Math.tan(phi) - phi;
}

/**
 * Vygeneruje kompletní profil ozubeného kola jako pole vrcholů uzavřené polyline.
 * Používá polární souřadnice pro přesné umístění involut.
 *
 * @param {number} m  modul
 * @param {number} z  počet zubů
 * @param {number} alpha  úhel záběru [°]
 * @param {number} x  koeficient posunutí
 * @param {number} steps  počet bodů na jednu stranu involuty
 * @param {number} cx  X středu
 * @param {number} cy  Y středu
 * @returns {{vertices: {x:number,y:number}[], bulges: number[]}}
 */
export function generateFullGearProfile(m, z, alpha = 20, x = 0, steps = 20, cx = 0, cy = 0) {
  if (z < 1) return { vertices: [], bulges: [] };
  const dim = calculateGearDimensions(m, z, alpha, x);
  const { rp, rb, ra, rf, aRad } = dim;

  const angularPitch = (2 * Math.PI) / z;

  // Polovina úhlové tloušťky zubu na roztečné kružnici
  const halfThickAngle = (Math.PI + 4 * x * Math.tan(aRad)) / (2 * z);

  // inv(α) na roztečném poloměru
  const invAlpha = inv(aRad);

  // Efektivní patní poloměr (ochrana proti záporným hodnotám)
  const effRf = Math.max(rf, m * 0.1);

  const vertices = [];
  const bulges = [];

  /** Přidá vertex, pokud není duplicitní s předchozím */
  function addVert(vx, vy, bulge) {
    const n = vertices.length;
    if (n > 0) {
      const prev = vertices[n - 1];
      const dx = vx - prev.x, dy = vy - prev.y;
      if (dx * dx + dy * dy < 1e-10) return; // skip duplicitní bod
    }
    vertices.push({ x: vx, y: vy });
    bulges.push(bulge);
  }

  for (let tooth = 0; tooth < z; tooth++) {
    const tc = tooth * angularPitch;
    const rightBase = tc - halfThickAngle - invAlpha;
    const leftBase = tc + halfThickAngle + invAlpha;

    // ── Parametry tip oblouku ──
    const tipInv = involuteAngleAt(rb, ra);
    const rightTipA = rightBase + tipInv;
    const leftTipA = leftBase - tipInv;
    let tipSweep = leftTipA - rightTipA;
    while (tipSweep < 0) tipSweep += 2 * Math.PI;
    const tipBulge = (tipSweep > 0.001 && tipSweep < angularPitch)
      ? Math.tan(tipSweep / 4) : 0;

    // ── Parametry root oblouku ──
    const nextRightBase = ((tooth + 1) * angularPitch) - halfThickAngle - invAlpha;
    const rootStartA = effRf < rb ? leftBase : leftBase - involuteAngleAt(rb, effRf);
    const rootEndA = effRf < rb ? nextRightBase : nextRightBase + involuteAngleAt(rb, effRf);
    let rootSweep = rootEndA - rootStartA;
    while (rootSweep < 0) rootSweep += 2 * Math.PI;
    const rootBulge = (rootSweep > 0.001 && rootSweep < angularPitch)
      ? Math.tan(rootSweep / 4) : 0;

    // ── Patní bod (pravá strana) ──
    if (effRf < rb) {
      addVert(cx + effRf * Math.cos(rightBase), cy + effRf * Math.sin(rightBase), 0);
    }

    // ── Pravá involuta (od základní kružnice k hlavové) ──
    for (let i = 0; i <= steps; i++) {
      const r = rb + (ra - rb) * (i / steps);
      const ia = involuteAngleAt(rb, r);
      const a = rightBase + ia;
      // Poslední bod dostane tip bulge (oblouk k levé involutě)
      const b = (i === steps) ? tipBulge : 0;
      addVert(cx + r * Math.cos(a), cy + r * Math.sin(a), b);
    }

    // ── Levá involuta (od hlavové kružnice zpět k základní) ──
    for (let i = steps; i >= 0; i--) {
      const r = rb + (ra - rb) * (i / steps);
      const ia = involuteAngleAt(rb, r);
      const a = leftBase - ia;
      addVert(cx + r * Math.cos(a), cy + r * Math.sin(a), 0);
    }

    // ── Patní přechod s root bulge ──
    if (effRf < rb) {
      // Patní bod levá strana – oblouk k dalšímu zubu
      addVert(cx + effRf * Math.cos(leftBase), cy + effRf * Math.sin(leftBase), rootBulge);
    } else {
      // effRf >= rb: explicitní body na patní kružnici
      addVert(cx + effRf * Math.cos(rootStartA), cy + effRf * Math.sin(rootStartA), rootBulge);
      addVert(cx + effRf * Math.cos(rootEndA), cy + effRf * Math.sin(rootEndA), 0);
    }
  }

  // Pro uzavřenou polyline: bulges.length === vertices.length
  while (bulges.length > vertices.length) bulges.pop();
  while (bulges.length < vertices.length) bulges.push(0);

  return { vertices, bulges };
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  Ozubený hřeben (Rack)                                     ║
// ╚══════════════════════════════════════════════════════════════╝

/**
 * Vypočítá rozměry ozubeného hřebenu.
 */
export function calculateRackDimensions(m, alpha, x = 0) {
  const aRad = alpha * Math.PI / 180;
  const ha = m * (1 + x);
  const hf = m * (1.25 - x);
  const h = ha + hf;
  const p = Math.PI * m;
  const s = p / 2;
  const tanA = Math.tan(aRad);
  return { ha, hf, h, p, s, aRad, tanA };
}

/**
 * Vygeneruje profil ozubeného hřebenu.
 * Hřeben je rovný (lineární) – zuby lichoběžníkového tvaru.
 * Profil se generuje podél osy X, střed na pozici cx, cy.
 *
 * @param {number} m  modul
 * @param {number} zCount  počet zubů
 * @param {number} alpha  úhel záběru [°]
 * @param {number} x  korekce
 * @param {number} cx  X levého okraje
 * @param {number} cy  Y roztečné čáry (střed výšky zubu)
 * @returns {{vertices: {x:number,y:number}[], bulges: number[], closed: boolean}}
 */
export function generateRackProfile(m, zCount, alpha = 20, x = 0, cx = 0, cy = 0) {
  const dim = calculateRackDimensions(m, alpha, x);
  const { ha, hf, p, tanA } = dim;

  const totalLen = zCount * p;
  // Vystředit hřeben na pozici kliknutí
  const startX = cx - totalLen / 2;

  const yTip = cy - ha;       // vrchol zubu (nahoru)
  const yRoot = cy + hf;      // pata zubu (dolů)
  const yBase = yRoot + m;    // spodek tělesa hřebenu

  // Polovina tloušťky zubu na roztečné čáře
  const halfW = p / 4;
  // Zúžení/rozšíření zubu od roztečné čáry k hlavě/patě
  const tipNarrow = ha * tanA;   // zúžení na každé straně (nahoru)
  const rootWiden = hf * tanA;   // rozšíření na každé straně (dolů)

  const vertices = [];
  const bulges = [];

  // Levý okraj na úrovni paty
  vertices.push({ x: startX, y: yRoot });
  bulges.push(0);

  for (let i = 0; i < zCount; i++) {
    // Osa zubu uprostřed rozteče
    const tcx = startX + (i + 0.5) * p;

    // Levá pata (rozšíření pod roztečnou čárou)
    vertices.push({ x: tcx - halfW - rootWiden, y: yRoot });
    bulges.push(0);
    // Levý roh hlavy (zúžení nad roztečnou čárou)
    vertices.push({ x: tcx - halfW + tipNarrow, y: yTip });
    bulges.push(0);
    // Pravý roh hlavy
    vertices.push({ x: tcx + halfW - tipNarrow, y: yTip });
    bulges.push(0);
    // Pravá pata
    vertices.push({ x: tcx + halfW + rootWiden, y: yRoot });
    bulges.push(0);
  }

  // Pravý okraj na úrovni paty
  vertices.push({ x: startX + totalLen, y: yRoot });
  bulges.push(0);
  // Spodek tělesa – pravý
  vertices.push({ x: startX + totalLen, y: yBase });
  bulges.push(0);
  // Spodek tělesa – levý
  vertices.push({ x: startX, y: yBase });
  bulges.push(0);

  return { vertices, bulges, closed: true };
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  Vnitřní ozubení (Internal Gear)                           ║
// ╚══════════════════════════════════════════════════════════════╝

/**
 * Vypočítá rozměry vnitřního ozubeného kola.
 * U vnitřního kola zuby směřují dovnitř – hlavová kružnice je menší než roztečná.
 */
export function calculateInternalGearDimensions(m, z, alpha, x = 0) {
  const aRad = alpha * Math.PI / 180;
  const rp = (m * z) / 2;
  const rb = rp * Math.cos(aRad);
  // Vnitřní: hlavová je MENŠÍ (zuby jdou dovnitř)
  const ra = rp - m * (1 + x);   // hlavový poloměr (vnitřní)
  const rf = rp + m * (1.25 - x); // patní poloměr (vnější)
  const ha = m * (1 + x);
  const hf = m * (1.25 - x);
  const p = Math.PI * m;
  const s = p / 2;
  return { rp, rb, ra, rf, ha, hf, p, s, aRad };
}

/**
 * Vygeneruje profil vnitřního ozubeného kola.
 * Profil je jedna uzavřená polyline – vnější obrys na rf (patní kružnice)
 * s hustými body tvoří hladký kruh, drážky z něj jdou dovnitř k ra.
 *
 * Oproti vnějšímu kolu:
 *  - Base úhly mají opačné znaménko invAlpha (groove width = tooth width at rp)
 *  - Evolventy mají opačný směr (-ia/+ia) → konkávní boky drážky
 */
export function generateInternalGearProfile(m, z, alpha = 20, x = 0, steps = 10, cx = 0, cy = 0) {
  const dim = calculateInternalGearDimensions(m, z, alpha, x);
  const { rp, rb, ra, rf, aRad } = dim;

  const angularPitch = (2 * Math.PI) / z;
  const halfThickAngle = (Math.PI + 4 * x * Math.tan(aRad)) / (2 * z);
  const invAlpha = inv(aRad);

  const vertices = [];
  const bulges = [];

  function addVert(vx, vy) {
    const n = vertices.length;
    if (n > 0) {
      const prev = vertices[n - 1];
      if ((vx - prev.x) ** 2 + (vy - prev.y) ** 2 < 1e-10) return;
    }
    vertices.push({ x: vx, y: vy });
    bulges.push(0);
  }

  for (let tooth = 0; tooth < z; tooth++) {
    const tc = tooth * angularPitch;
    // Base úhly – invAlpha je OBRÁCENÉ oproti vnějšímu kolu,
    // aby šířka drážky na roztečné kružnici = šířka zubu vnějšího kola
    const rightBase = tc - halfThickAngle + invAlpha;
    const leftBase  = tc + halfThickAngle - invAlpha;

    // ── Pravý bok drážky: rf → ra (dovnitř) ──
    // Involuta −ia: konkávní bok (drážka se rozevírá k rf)
    for (let i = 0; i <= steps; i++) {
      const r = rf - (rf - ra) * (i / steps);
      const ia = involuteAngleAt(rb, r);
      addVert(cx + r * Math.cos(rightBase - ia), cy + r * Math.sin(rightBase - ia));
    }

    // ── Dno drážky na ra ──
    addVert(cx + ra * Math.cos(tc), cy + ra * Math.sin(tc));

    // ── Levý bok drážky: ra → rf (ven) ──
    // Involuta +ia: konkávní bok (drážka se rozevírá k rf)
    for (let i = 0; i <= steps; i++) {
      const r = ra + (rf - ra) * (i / steps);
      const ia = involuteAngleAt(rb, r);
      addVert(cx + r * Math.cos(leftBase + ia), cy + r * Math.sin(leftBase + ia));
    }

    // ── Tělo zubu na rf – oblouk s bulge k další drážce ──
    const aEnd = leftBase + involuteAngleAt(rb, rf);
    const nextTc = ((tooth + 1) % z) * angularPitch;
    const nextRight = nextTc - halfThickAngle + invAlpha;
    const aStart = nextRight - involuteAngleAt(rb, rf);

    let span = aStart - aEnd;
    if (span < 0) span += 2 * Math.PI;

    if (span > 0.001 && span < angularPitch) {
      // Bulge na posledním bodu levého boku → oblouk na rf ke další drážce
      const lastIdx = vertices.length - 1;
      if (lastIdx >= 0) bulges[lastIdx] = Math.tan(span / 4);
    }
  }

  while (bulges.length > vertices.length) bulges.pop();
  while (bulges.length < vertices.length) bulges.push(0);

  return { vertices, bulges };
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  Řetězové kolo (Sprocket) – ISO 606 / DIN 8187             ║
// ╚══════════════════════════════════════════════════════════════╝

/** Standardní řetězy (rozteč p, průměr válečku d1) v mm */
export const CHAIN_STANDARDS = [
  { id: '04B', p: 6.0,   d1: 4.0,   label: '04B (6mm)' },
  { id: '05B', p: 8.0,   d1: 5.0,   label: '05B (8mm)' },
  { id: '06B', p: 9.525, d1: 6.35,  label: '06B (3/8\")' },
  { id: '08B', p: 12.7,  d1: 8.51,  label: '08B (1/2\")' },
  { id: '10B', p: 15.875,d1: 10.16, label: '10B (5/8\")' },
  { id: '12B', p: 19.05, d1: 12.07, label: '12B (3/4\")' },
  { id: '16B', p: 25.4,  d1: 15.88, label: '16B (1\")' },
  { id: '20B', p: 31.75, d1: 19.56, label: '20B (1¼\")' },
  { id: '24B', p: 38.1,  d1: 25.4,  label: '24B (1½\")' },
  { id: '28B', p: 44.45, d1: 27.94, label: '28B (1¾\")' },
  { id: '32B', p: 50.8,  d1: 29.21, label: '32B (2\")' },
];

/**
 * Vypočítá rozměry řetězového kola dle ISO 606.
 * @param {number} p   rozteč řetězu [mm]
 * @param {number} z   počet zubů
 * @param {number} d1  průměr válečku [mm]
 */
export function calculateSprocketDimensions(p, z, d1) {
  if (z < 1) z = 1;
  const dp = p / Math.sin(Math.PI / z);        // roztečný průměr
  const rp = dp / 2;
  const ri = (dp - d1) / 2;                     // poloměr sedla (dno zubu)
  const re = p * (0.625 + 1 / (5.2 * Math.cos(Math.PI / z))); // vnější poloměr zubu (approx)
  // Max poloměr hlavy zubu
  const ra = rp + 0.3 * p / z + 0.03 * d1;      // zjednodušená hlavová kružnice
  const da = dp + 1.25 * p - d1;                 // hlavový průměr (ISO recomm.)
  const raISO = da / 2;

  return { dp, rp, ri, d1, ra: raISO, p: p, z };
}

/**
 * Vygeneruje profil řetězového kola.
 * Profil zubu: sedlový oblouk (poloměr ≈ d1/2) + přechodové oblouky k hlavě.
 *
 * @param {number} pChain  rozteč řetězu
 * @param {number} z       počet zubů
 * @param {number} d1      průměr válečku
 * @param {number} steps   body na oblouk
 * @param {number} cx      X středu
 * @param {number} cy      Y středu
 */
export function generateSprocketProfile(pChain, z, d1, steps = 8, cx = 0, cy = 0) {
  if (z < 1) return { vertices: [], bulges: [] };
  const dim = calculateSprocketDimensions(pChain, z, d1);
  const { rp, ra } = dim;
  const rRoller = d1 / 2;

  const angularPitch = (2 * Math.PI) / z;
  // Poloměr sedla (mírně větší než váleček pro vůli)
  const rSeat = rRoller * 1.005;

  // Úhel sedla: omezený na rozumnou hodnotu pro hezký profil
  // ISO 606: α_max = 140° − 90°/z, ale pro vizuální účely omezíme
  const seatAngleDeg = Math.min(130, 140 - 90 / z);
  const seatHalf = (seatAngleDeg / 2) * Math.PI / 180;

  const vertices = [];
  const bulges = [];

  function addVert(vx, vy, bulge) {
    const n = vertices.length;
    if (n > 0) {
      const prev = vertices[n - 1];
      const dx = vx - prev.x, dy = vy - prev.y;
      if (dx * dx + dy * dy < 1e-10) return;
    }
    vertices.push({ x: vx, y: vy });
    bulges.push(bulge);
  }

  for (let tooth = 0; tooth < z; tooth++) {
    const tc = tooth * angularPitch;

    // Střed válečku (na roztečné kružnici)
    const rcx = rp * Math.cos(tc);
    const rcy = rp * Math.sin(tc);

    // ── Sedlový oblouk (spodek zubu) ──
    const seatStartA = tc + Math.PI - seatHalf;
    const seatEndA   = tc + Math.PI + seatHalf;
    const seatSweep = seatEndA - seatStartA; // = 2 * seatHalf

    // Počáteční bod sedla s bulge pro oblouk
    const seatBulge = Math.tan(seatSweep / 4);
    addVert(
      cx + rcx + rSeat * Math.cos(seatStartA),
      cy + rcy + rSeat * Math.sin(seatStartA),
      seatBulge
    );
    // Koncový bod sedla
    addVert(
      cx + rcx + rSeat * Math.cos(seatEndA),
      cy + rcy + rSeat * Math.sin(seatEndA),
      0
    );

    // ── Hrot zubu (tip) uprostřed k dalšímu sedlu ──
    const tipAngle = tc + angularPitch / 2;
    addVert(cx + ra * Math.cos(tipAngle), cy + ra * Math.sin(tipAngle), 0);
  }

  while (bulges.length > vertices.length) bulges.pop();
  while (bulges.length < vertices.length) bulges.push(0);

  return { vertices, bulges };
}
