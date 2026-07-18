// ── ZÁVITOVÁNÍ: sdílené výpočty ───────────────────────────────────────────
// Hloubka profilu závitu [mm, radiálně] podle typu (stejné vzorce jako
// kalkulačka Závity v CAD — detailMetric/detailG/detailTr/… v thread.js).
export function threadProfileDepth(typeKey, P, external) {
  if (typeKey === 'tr' || typeKey === 'acme') return 0.5 * P + 0.25;           // lichoběžník: H1 + vůle ac
  if (typeKey === 'g' || typeKey === 'bspt' || typeKey === 'bsw') return 0.6403 * P; // Whitworth 55°
  return external ? 0.6134 * P : 0.5413 * P;                                   // ISO / UN 60°
}

// Rozdělení přísuvů na průchody — kumulativní hloubky [mm]. Degresivně
// (konstantní průřez třísky, ∝ √(i/n)). Auto počet průchodů: průměrný
// záběr ~0,12 mm (M×1 → 6, M×1,5 → 8, M×2 → 11, M×2,5 → 15, M×3 → 16),
// první záběr omezen na 0,4 mm — odpovídá běžné CNC praxi / CYCLE97,
// na rozdíl od konzervativní ruční tabulky v CAD kalkulačce Závity.
export function computeThreadPassCuts(totalDepth, forcedPasses) {
  const H = Math.max(0.01, totalDepth);
  let n = forcedPasses > 0 ? Math.min(200, Math.round(forcedPasses)) : Math.max(4, Math.ceil(H / 0.12));
  if (!(forcedPasses > 0)) {
    while (H * Math.sqrt(1 / n) > 0.4 && n < 50) n++;
  }
  const cuts = [];
  for (let i = 1; i <= n; i++) cuts.push(i === n ? H : H * Math.sqrt(i / n));
  return cuts;
}

// ── UPICHNUTÍ (part-off): sdílená geometrie ───────────────────────────────
// Spočítá polohy plátku pro zápich po svislé úsečce v Z=partOffZ. Používá se
// jak v generování G-kódu (generateAutoGCode), tak ve vykreslení (draw), aby
// dráhy a vizualizace odpovídaly. Referenční bod plátku = STŘED pracovního
// rádiusu; spodní (řezná) hrana je o rIns blíž k ose. Viz komentář u
// partOffActive v generateAutoGCode pro sémantiku přídavků.
export function partOffGeom(prms, calc) {
  const pz = parseFloat(prms.partOffZ);
  const shape = prms.toolShape;
  const R = Math.max(0, parseFloat(prms.toolRadius) || 0);
  const wIns = Math.max(0, parseFloat(prms.toolLength) || 0);
  // Pracovní rádius: kulatý plátek = R; upichovák = rohový rádius (≤ půl šířky).
  const rIns = shape === 'parting' ? Math.min(R, wIns > 0 ? wIns / 2 : R) : R;
  const allowX = parseFloat(prms.allowanceX) || 0;          // Dojezd X (spodní hrana)
  // Přídavek Z = TRVALÝ přídavek v ose Z — poslední/jediná dráha ho nechá stát
  // (NEodebírá se dokončováním). Přídavek na hotovo = přídavek NA HOTOVO, který
  // odebere až dokončovací (plynulá) dráha, pokud je zapnutá.
  const allowZ = parseFloat(prms.allowanceZ) || 0;
  const finAllow = parseFloat(prms.finishAllowance) || 0;
  const dir = (prms.roughingSide === 'left') ? -1 : 1;      // strana těla plátku
  const xStockTop = Math.max(parseFloat(calc && calc.stockTopX) || 0, 0.1);
  const xCenterTop = xStockTop + rIns;                       // střed: spodní hrana na povrchu
  const xCenterTarget = allowX + rIns;                      // střed: spodní hrana na dojezdu
  // Start X = kam se dojede rychloposuvem a odtud teprve jede posuv. Musí ležet
  // mezi dojezdem a povrchem; 0/neplatné/nad povrch = od povrchu polotovaru.
  const startXRaw = parseFloat(prms.partOffStartX);
  const xCenterStart = (isFinite(startXRaw) && startXRaw > allowX)
    ? Math.max(xCenterTarget, Math.min(startXRaw + rIns, xCenterTop))
    : xCenterTop;
  const zFinal = pz + dir * (rIns + allowZ);               // finální rovina (Přídavek Z zůstává)
  const zRough = zFinal + dir * finAllow;                   // hrubovací rovina (o Přídavek na hotovo dál)
  const doFinish = !!prms.doFinishing && finAllow > 1e-6;   // plynulá dokončovací dráha (jen s Přídavkem na hotovo)
  let canCut = true, reason = '';
  if (shape !== 'round' && shape !== 'parting') {
    canCut = false; reason = '! Upichnutí podporuje jen kulatý / upichovací plátek – dráhy nevygenerovány.';
  } else if (allowX >= xStockTop - 1e-4) {
    canCut = false; reason = '! Dojezd (Dojezd X) leží nad polotovarem – nic k obrobení.';
  }
  return { pz, shape, rIns, allowX, allowZ, finAllow, dir, xStockTop, xBottomEdge: allowX,
           startEdgeX: xCenterStart - rIns,   // spodní hrana v místě startu posuvu (=povrch, když neaktivní)
           xCenterTop, xCenterStart, xCenterTarget, zRough, zFinal, doFinish, canCut, reason };
}
