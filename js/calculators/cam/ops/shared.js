// ╔════════════════════════════════════════════════════════╗
// ║  Sdílené meze a pomocníci hrubovacích operací                    ║
// ╚════════════════════════════════════════════════════════╝
//
// Používá je Čelní i podélné hrubování (ops/roughFace.js, ops/roughLong.js).
// Volný prostor (mm) mezi držákem a vůlí-posunutou siluetou polotovaru
// („tečkovanou" offsetovou čarou v náhledu) při hledání stropu vjezdu —
// viz holderEntryCapZ v genLongPasses.
export const HOLDER_STOCK_GAP = 1.0;
// Bezpečnostní odstup DRŽÁKU od offsetové čáry polotovaru při hledání kotvy
// zanoření (přání uživatele 10. 8. 2026: „ať je držák tak 2 mm od té čáry").
export const HOLDER_ENTRY_STOCK_GAP = 2.0;
// Kolik vnoření spodní hrany držáku (mm², sken po DZ_CAP) se ještě NEPOČÍTÁ
// jako kolize.
//
// Proč 2,0 a ne 0,5 jako u validátoru: tenhle sken je hrubší model (povrch po
// Z + profil spodní hrany) než polygonový průnik, kterým měří validátor
// i HolderGouge, a systematicky NADHODNOCUJE. Změřeno proti přesnému modelu:
//   part-13-zleva-flange  sken 0,63 mm²  → polygon 0
//   part-17-long-parting  sken 1,09/0,61 → polygon 0,12 (a HEAD tam nemá kolizi)
// Skutečné vady přitom vycházejí o řád výš:
//   díl uživatele Z 41,2  sken 6,58 mm²  → polygon 9,29
//   part-11-zleva         sken 26,16 mm² → polygon 131,67
// Práh 2,0 tedy leží 2× nad stropem změřených artefaktů a 3× pod nejmenší
// skutečnou vadou. S 0,5 padly na part-17 zbytečně 4,4 % úběru.
export const HOLDER_FIT_TOL = 2.0;
// Jak daleko se smí posunout NÁJEZD průchodu, aby se vedle něj vešel držák
// (order-aware kontrola v hloubkové smyčce genLongPasses). Strop je tu proto,
// že daleký posun mění i PŘÍJEZDOVOU cestu k vjezdu: bez něj se na
// `range-end-leadout` objevilo sedm nových průchodů na Z≈173 a s nimi zdvih
// „Výjezd nad konturu" skrz kůru odlitku — 1 100 mm² kolizí, které tam
// předtím nebyly. Nenajde-li se v tomhle okně místo, vjezd zůstane, jak byl.
export const ENTRY_SHIFT_MAX = 3.0;
// Práh pro vnoření DRŽÁKU při VJEZDU průchodu [mm²]. Stejný jako
// `RESIDUAL_FIT_TOL`, tedy jako u validatorů — přísnější práh zamítá vjezdy,
// které žádné měřítko nehlásí, a platí se za ně materiálem: při 0,1 mm²
// (zkoušeno 27. 8. 2026) přišla sada o 103,6 mm² úběru a čtyři díly o celý
// průchod, aniž by ubyla jediná kolize — v obou standardech polotovaru.
export const ENTRY_FIT_TOL = 0.5;
// Nejmenší SMYSLUPLNÁ vrstva, jako zlomek Hloubky záběru. Skim vrstvy nad
// nakresleným vrcholem/čelem (viz `planTopX` a `planEdgeZ`) se přidávají proto,
// že materiál může sahat až na offsetovou čáru — jenže při malém Přídavku
// polotovaru zbude pod skimem jen tenoučký zbytek a ten by jel jako plný
// průchod naprázdno (Přídavek 0,05 při ap 3 → vrstva 0,05 mm, změřeno na
// `part-1`). Zbytek tenčí než tenhle zlomek se proto NEODDĚLUJE a sebere ho
// sousední průchod najednou.
//
// Je to VĚDOMÉ, OHRANIČENÉ přetížení: ten průchod vezme `ap + zbytek`, tedy
// nejvýš `1,1 × ap`. Hloubka záběru není tvrdý strop, ale cíl s tolerancí —
// 10 % je pod rozptylem, se kterým se stejně řeže. Bez toho by platila volba
// „buď průchod naprázdno, nebo posun celé mřížky hloubek", a posun mřížky je
// změřeně horší (viz krok 2 v docs/cam-sjednoceni-polotovaru.md: `part-8`
// −5 průchodů a −337 mm² úběru).
export const SKIM_MIN_LAYER = 0.1;


// Ořízne „bez schodků" dojezd (leadOut) tak, aby VODOROVNÉ čelo (konstantní Z)
// nepřejelo za sousední (mělčí) hloubku maxX — tam je materiál obroben už mělčím
// průchodem. Segmenty drží x1/z1 (vyšší Z) → x2/z2 (nižší Z). Šikmé úseky se
// nechávají (ty ořezal findLeadOutEndZ v ose Z); mění se pole na místě.
//
// `minX` (volitelně) = hloubka průchodu, ze které dojezd začíná. Čelo vydá
// traceOffsetPath CELÉ, tedy i od osy (part-1 dojezd X25,94 → [0 → 28,94]);
// emise jede od konce průchodu, ale model dráhy (pravidlo 9, realStock.js)
// bral, že dojezd přejel celé čelo až od osy — další průchody pod ním pak
// vyšly „nic neuberou" a zahodily se (audit CAM 26. 11. 2026). Začátek
// vodorovného úseku ven od osy se proto ořízne na `minX`.
export function clipLeadOutToDepth(segs, maxX, minX = -Infinity) {
  const eps = 0.02;
  const out = [];
  for (let s of segs) {
    if (s.type === 'line' && Math.abs(s.z1 - s.z2) < 1e-6) {
      if (out.length === 0 && s.x2 > s.x1 && s.x1 < minX - eps && s.x2 > minX) s = { ...s, x1: minX };
      if (s.x1 > maxX + eps && s.x2 > maxX + eps) break;         // celé čelo za sousedem
      if (s.x2 > maxX + eps && s.x2 > s.x1) { out.push({ ...s, x2: maxX }); break; } // ven přes souseda
      out.push(s);
    } else {
      out.push(s);
    }
  }
  segs.length = 0;
  segs.push(...out);
}

// Nejvyšší X úseku dojezdu bez počátečního bodu: úsečka = konec, oblouk =
// i jeho vnitřek. Oblouk přes nízký hrb začne i skončí skoro na hloubce
// vrstvy a nad ní je jen vrchol (part-1 X34,979 → 34,986, vrchol 35,059) —
// měřený jen konci vypadá jako „dip" pod hloubku (audit 22. 11. 2026).
export function segPeakX(s) {
  let m = s.x2;
  if (s.type === 'arc' && Number.isFinite(s.startAngle) && Number.isFinite(s.endAngle)) {
    for (let k = 1; k < 16; k++) {
      const a = s.startAngle + (s.endAngle - s.startAngle) * (k / 16);
      m = Math.max(m, s.cx + Math.sin(a) * s.r);
    }
  }
  return m;
}

// Utne dojezd (x1/z1 → x2/z2, směr k nižšímu Z) v místě, kde naposledy
// SESTOUPÍ na hloubku X: koncové úseky celé na X nebo pod ní zahodí, úsek,
// který hloubku protíná shora dolů, zkrátí na průsečík. Vrací NOVÉ pole, nebo
// null, když dojezd nad X vůbec nebyl. Oblouk se krátí po úhlu (bod
// x = cx + sin(a)·r, z = cz + cos(a)·r, jako všude v dojezdech).
export function cutLeadOutAtDepth(segs, X, eps = 0.02) {
  let k = segs.length;
  while (k > 0 && Math.max(segs[k - 1].x1, segPeakX(segs[k - 1])) <= X + eps) k--;
  if (k === 0) return null;
  const s = segs[k - 1];
  const out = segs.slice(0, k - 1);
  if (s.x2 >= X - eps) { out.push(s); return out; }
  if (s.type === 'arc' && Number.isFinite(s.startAngle) && Number.isFinite(s.endAngle)) {
    const angAt = (t) => s.startAngle + (s.endAngle - s.startAngle) * t;
    const xAt = (t) => s.cx + Math.sin(angAt(t)) * s.r;
    // Poslední vzorek nad X → půlení mezi ním a dalším (oblouk může nad X
    // vystoupit a zase klesnout, i když začíná pod ní).
    const N = 32;
    let lo = 0;
    for (let i = N; i >= 0; i--) { if (xAt(i / N) > X) { lo = i / N; break; } }
    let hi = Math.min(1, lo + 1 / N);
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (xAt(m) > X) lo = m; else hi = m;
    }
    const a = angAt((lo + hi) / 2);
    out.push({ ...s, x2: X, z2: s.cz + Math.cos(a) * s.r, endAngle: a });
    return out;
  }
  const dx = s.x2 - s.x1;
  const z = Math.abs(dx) < 1e-9 ? s.z2 : s.z1 + (X - s.x1) / dx * (s.z2 - s.z1);
  out.push({ ...s, x2: X, z2: z });
  return out;
}

// ČELNÍ HRUBOVÁNÍ (od povrchu polotovaru −X k ose / kontuře).
