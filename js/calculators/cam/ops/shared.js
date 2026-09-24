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
export function clipLeadOutToDepth(segs, maxX) {
  const eps = 0.02;
  const out = [];
  for (const s of segs) {
    if (s.type === 'line' && Math.abs(s.z1 - s.z2) < 1e-6) {
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

// ČELNÍ HRUBOVÁNÍ (od povrchu polotovaru −X k ose / kontuře).
