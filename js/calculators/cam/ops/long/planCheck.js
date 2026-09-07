// ╔══════════════════════════════════════════════════════════╗
// ║  ZÁVĚREČNÁ KONTROLA PLÁNU — hlásí porušení pravidel drah       ║
// ╚══════════════════════════════════════════════════════════╝
//
// PROČ TENHLE SOUBOR EXISTUJE (7. 9. 2026, na pokyn uživatele)
//
// Pravidla v `docs/cam-pravidla-drah.md` jsou vlastnosti CELÉHO programu
// („nejdřív celá pravá strana až na dno", „neřezat vzduch"). V kódu je ale
// nikdo NEVLASTNÍ — vznikají jako vedlejší produkt hloubkové smyčky a pak
// na hotové průchody sahá dalších ~36 míst v šesti souborech (hlídání
// destičky, držáku, dojezdy, dorampování, přeskupení). Každé z nich řeší
// svůj legitimní problém a žádné už nekontroluje, jestli tím pravidlo
// neporušilo.
//
// Důsledek byl měřitelný: za tři měsíce práce na drahách našel uživatel
// OČIMA v G-kódu vadu za vadou, přičemž plán byl pokaždé správný a rozbil
// ho až některý z těch pozdějších zásahů. Dvě z 7. 9. 2026:
//
//   • dorampování strmé stěny jelo Z 205,142 → −5,000, tedy 210 mm přes
//     celý díl a přes obě hranice úseků (plán říkal „skonči na 196,1"),
//   • hlídání boční hrany destičky posunulo průchod o 9,3 mm doleva do
//     údolí, kde odlitek má r 17,74 — dráha pak jela 16 mm vzduchem.
//
// Obě by tady spadly okamžitě. Tenhle modul dráhy NEMĚNÍ — jen je po všech
// zásazích projede a co nesedí, vydá jako ⚠ hlášku s konkrétním r/Z. Cílem
// je, aby další vadu hlásil stroj, ne uživatel po dvou dnech.
//
// Kontroly NESMÍ mít falešné poplachy: každá je psaná jako skutečný
// invariant a výjimky (dojezd nese hodnotu i bez řezu — §7.2) jsou v ní
// vypsané. Kdyby některá začala hlásit i to, co je v pořádku, patří sem
// výjimka s doloženým důvodem, ne vypnutí kontroly.

/**
 * Projede hotové průchody a vrátí seznam porušení jako pole hlášek.
 * Nic nemění.
 *
 * @param passes         finální pole průchodů (po VŠECH zásazích)
 * @param regions        okna úseků z computeRegions()
 * @param edgeDissolved  (surf, kind, zEdge, depthX, szD) => bool
 * @param stockZRangeAt  (X) => {zMin,zMax} | null
 * @param hasStock       (X, zHi, zLo) => bool  (intervalHasStock)
 * @param dzScan         krok skenu = práh „nic neuřízne"
 */
export function checkPlanInvariants({ passes, regions, edgeDissolved, stockZRangeAt, hasStock, dzScan }) {
  const msgs = [];
  if (!Array.isArray(passes) || passes.length === 0) return msgs;
  const tol = Math.max(dzScan, 0.1);
  const fmt = (p) => `r ${p.x.toFixed(3)} Z ${p.zStart.toFixed(3)}…${p.zEnd.toFixed(3)}`;

  // ── A) PRŮCHOD ŘEŽE VZDUCH ────────────────────────────────────────────
  // Průchod, nad kterým na jeho hloubce nikde nestojí materiál, nemůže nic
  // odebrat. VÝJIMKA: dojezd/nájezd po kontuře (`contourLeadOut/In`) —
  // hodnota takového kroku je právě v dojezdu, ne v řezu, a plošný ořez
  // dojezdů je doložená mez (§7.2). Krátké průchody neřeší, ty zahazuje
  // emise sama.
  const air = [];
  for (const p of passes) {
    if (p.type !== 'long' || !Number.isFinite(p.zStart) || !Number.isFinite(p.zEnd)) continue;
    if (p.contourLeadOut || p.contourLeadIn) continue;
    if (!(p.zStart - p.zEnd > dzScan)) continue;
    if (hasStock(p.x, p.zStart, p.zEnd, p.ramp)) continue;   // rampa je taky řez
    air.push(p);
  }
  if (air.length > 0) {
    msgs.push(`Kontrola plánu: ${air.length} průchod(ů) jede VZDUCHEM — na té hloubce nad nimi nikde nestojí materiál (${air.slice(0, 3).map(fmt).join('; ')}${air.length > 3 ? '; …' : ''}). Dráhy jsou vydané, ale nic neodeberou.`);
  }

  // ── B) PRŮCHOD VYJEL Z OKNA SVÉHO ÚSEKU ───────────────────────────────
  // Hranice úseku znamená „za tohle se z téhle strany nesmí" (§6.0). Průchod
  // ji smí mít jako KONEC, ne ji přejet. Bere se jen hranice, která na dané
  // hloubce skutečně platí — v kůře dna údolí se úseky spojují a tam hranice
  // není (proto `edgeDissolved`).
  const bounds = [];
  for (const r of (regions || [])) {
    if (r && Number.isFinite(r.zLo)) bounds.push({ z: r.zLo, surf: r.zLoSurf, kind: r.zLoKind });
  }
  const crossed = [];
  if (bounds.length > 0) {
    for (const p of passes) {
      if (p.type !== 'long' || !Number.isFinite(p.zStart) || !Number.isFinite(p.zEnd)) continue;
      const sz = stockZRangeAt(p.x);
      if (!sz) continue;
      for (const b of bounds) {
        if (edgeDissolved(b.surf, b.kind, b.z, p.x, sz)) continue;
        if (b.z > p.zEnd + tol && b.z < p.zStart - tol) {
          crossed.push({ p, z: b.z });
          break;
        }
      }
    }
  }
  if (crossed.length > 0) {
    msgs.push(`Kontrola plánu: ${crossed.length} průchod(ů) PŘEJELO hranici svého úseku (${crossed.slice(0, 3).map(c => `${fmt(c.p)} přes Z ${c.z.toFixed(3)}`).join('; ')}${crossed.length > 3 ? '; …' : ''}). Podmínka „nepřejíždět, dokud není celá strana hotová" (docs/cam-pravidla-drah.md §6.0) je porušená.`);
  }

  return msgs;
}
