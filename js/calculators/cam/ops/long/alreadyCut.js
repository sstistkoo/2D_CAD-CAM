// ╔════════════════════════════════════════════════════════════╗
// ║  UŽ VYŘÍZNUTO? — kolik by průchod uřízl NAVÍC proti dřívějším drahám  ║
// ╚════════════════════════════════════════════════════════════╝
// Podlaha `cutFloorTab` (ops/long/depthTabs.js) je v souřadnicích DRÁHY:
// v každém sloupci Z nejnižší střed nosu, který tudy projel. Materiál ale
// ubírá celý NOS, tedy kružnice o poloměru `noseLiftX` kolem té dráhy — a ta
// sahá i do sousedních sloupců. Sloupcové srovnání „dráha × dráha" proto
// u kulaté destičky nestačí: dojezd, který skončí na kraji polotovaru,
// vybere nosem i výběh za ním, ale v podlaze po něm zůstane jen jeden sloupec.
//
// Nález uživatele 23. 9. 2026 (kulatá R 10, levý konec dílu): vrstva
// X 39,566 sjede dojezdem po 45° na X 37,347 Z −7,997 a nos tím vybere celý
// výběh Z −8 … −9. Zbytek intervalu se přesto vydal jako „kapsa po kontuře"
// a kvůli ní se znovu objela celá plošina Z 9,5 … −4,4 — o vrstvu níž
// podruhé. Polygon (`noseLiftX = 0`) tohle nedělá.
//
// PTÁ SE NA CELÝ PRŮCHOD, ne jen na interval: u „kapsy po kontuře" často
// bere materiál právě NÁJEZD (šikmý sjezd po stěně), kdežto tělo leží
// v projetém. Kontrola jen těla to na `part-4/6/8/9` zahodila a stálo to
// 4–7 mm² na díl (změřeno 23. 9. 2026).
//
// Vrací PLOCHU (mm²) materiálu, který by dráha `segs` uřízla a který žádná
// dřívější dráha nevzala. Materiál = pod offsetovou čarou polotovaru
// (`stockTopTab`), tedy týž plánovací obrys jako všude jinde.

export function makeAlreadyCut({ T, noseLiftX }) {
  const R = Math.max(noseLiftX || 0, 0);
  const floorTab = () => {
    if (T.activeFloorTab) return T.activeFloorTab;
    T.syncCutFloor();
    return T.cutFloorTab;
  };
  // Spodní bod nosu se středem ve výšce x0 ve vodorovné vzdálenosti d.
  // Dosah je aspoň PŮL SLOUPCE: u polygonu (R = 0) by jinak bod dráhy, který
  // neleží přesně na sloupci tabulky, nezasáhl žádný a dráha by „nic
  // neuřízla" — tak vyšlo 0 mm² u průchodu, který na `part-8` bere 4 mm².
  const reachZ = Math.max(R, T.DZ_CAP / 2);
  const noseLow = (x0, d) => (d > reachZ + 1e-9 ? null : x0 - Math.sqrt(Math.max(R * R - d * d, 0)));

  // Body dráhy po nejvýš `h` — oblouk po úhlu (tětiva by u R 10 vedla pod
  // oblouk), úsečka lineárně.
  const samplePath = (segs, h) => {
    const pts = [];
    for (const s of segs) {
      if (s.type === 'arc' && Number.isFinite(s.startAngle) && Number.isFinite(s.endAngle)
          && Number.isFinite(s.cx) && Number.isFinite(s.r)) {
        const n = Math.max(1, Math.ceil(Math.abs(s.endAngle - s.startAngle) * s.r / h));
        for (let k = 0; k <= n; k++) {
          const a = s.startAngle + (s.endAngle - s.startAngle) * (k / n);
          pts.push({ x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r });
        }
      } else if ([s.x1, s.z1, s.x2, s.z2].every(Number.isFinite)) {
        const n = Math.max(1, Math.ceil(Math.hypot(s.x2 - s.x1, s.z2 - s.z1) / h));
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          pts.push({ x: s.x1 + (s.x2 - s.x1) * t, z: s.z1 + (s.z2 - s.z1) * t });
        }
      }
    }
    return pts;
  };

  const newCutArea = (segs) => {
    const tab = floorTab();
    const { capZ0, DZ_CAP, stockTopTab } = T;
    if (!tab || !Number.isFinite(capZ0) || !Array.isArray(segs) || segs.length === 0) return Infinity;
    const pts = samplePath(segs, DZ_CAP / 2);
    if (pts.length === 0) return Infinity;
    const iOf = (z) => Math.round((z - capZ0) / DZ_CAP);
    // Nejnižší bod nosu NOVÉ dráhy v každém sloupci, kam dosáhne.
    const rem = new Map();
    for (const p of pts) {
      const iA = Math.max(0, iOf(p.z - reachZ)), iB = Math.min(tab.length - 1, iOf(p.z + reachZ));
      for (let i = iA; i <= iB; i++) {
        const low = noseLow(p.x, Math.abs(capZ0 + i * DZ_CAP - p.z));
        if (low === null) continue;
        const cur = rem.get(i);
        if (cur === undefined || low < cur) rem.set(i, low);
      }
    }
    const reach = Math.ceil(reachZ / DZ_CAP);
    let area = 0;
    for (const [i, r] of rem) {
      const top = stockTopTab(capZ0 + i * DZ_CAP);
      if (top === null || r >= top) continue;
      // Kam až už ve sloupci dřívější dráhy vybraly (nejnižší bod jejich nosů).
      let cut = Infinity;
      for (let j = Math.max(0, i - reach); j <= Math.min(tab.length - 1, i + reach); j++) {
        if (!Number.isFinite(tab[j])) continue;
        const low = noseLow(tab[j], Math.abs(j - i) * DZ_CAP);
        if (low !== null && low < cut) cut = low;
      }
      const thick = Math.min(top, cut) - r;
      if (thick > 0) area += thick * DZ_CAP;
    }
    return area;
  };
  return { newCutArea };
}
