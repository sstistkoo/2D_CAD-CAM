// ╔═══════════════════════════════════════════╗
// ║  ČELNÍ HRUBOVÁNÍ — hlídání DRŽÁKU                ║
// ╚═══════════════════════════════════════════╝
// Vyňato z `ops/roughFace.js` (rozdělení generátoru, plán §3.A).
// Post-proces nad hotovým polem `passes` — pořadí volání v generátoru
// je závazné: destička → hloubka vrstev → doběh úseku → držák.

import { topXOnLoop } from '../../camMath.js';
import { insertBodyZ } from '../../materialRemoval.js';
import { HOLDER_CLAMP_MARGIN, holderBottomProfile } from '../../toolEnvelope.js';

export function makeHolderGuardFace(deps) {
  const {
    prms, passes, foundErrors, faceLeft, step, zListAll, xTouchAt,
    offsetXAt, castingOuterOrNull, clrXFC, planLoopFC,
  } = deps;
// ── Hlídání DRŽÁKU (čelně) ────────────────────────────────────────
// Čelní průchod jede radiálně k ose a držák se veze na UŽ OBROBENÉ
// straně (zprava +Z, zleva −Z); jeho spodní hrana stoupá od špičky pod
// úhlem hřbetu (holderBottomProfile). Průchod proto smí jít jen tak
// hluboko, aby pod držákem prošlo všechno, co na té straně stojí:
//   (a) KONTURA dílu (offsetová čára — trvalá překážka),
//   (b) DNA sousedních, dřív hotových průchodů (schodiště). Clamp jen
//       proti statické kontuře si schody sám vyrábí a kolize po
//       zkrácení ROSTOU — poučení z makeHolderClamp (viz
//       docs/geometry-libs-migration.md, Fáze 3a).
// Pás, který si vyčistí sama destička (insertBodyZ), se přeskakuje —
// tam držák jede v kerfu po vlastním řezu.
//
// Důsledek je fyzikální, ne konzervativní odhad: nástroj se může
// zanořovat nejvýš pod úhlem hřbetu držáku. Kde kontura klesá strměji
// (stěna, kužel), se průchody zkrátí a materiál pod nimi zůstane —
// ta oblast se čelně zprava tímhle nožem obrobit NEDÁ (hlásí ⚠).
// Volá se DVAKRÁT (před doběhem úseků i za ním, viz níž). `report` říká, jestli
// se mají vypsat varování — jen z posledního volání, jinak by se pushla dvakrát.
// Opakování je bezpečné ze stejného důvodu jako u `enforceLayerDepth()`: clamp
// hloubku jen ZVEDÁ (`need > p.xEnd`), takže se střídavým voláním nerozhoupou.
// Počítadla jsou MIMO funkci: druhé volání už obvykle nemá co zvedat (clamp je
// idempotentní), takže s počítadly vevnitř by varování „Materiál pod mezí obrobte
// jinou strategií“ z prvního volání zmizelo úplně (změřeno: 30 zkrácených,
// 16 vynechaných průchodů uživateli přestalo hlásit ⚠).
let holderAdjusted = 0, holderDropped = 0, holderTrimmed = 0;
const holderGuardFace = (report) => {
  if (!prms.respectInsertGeometry || globalThis.__DISABLE_HOLDER_CLAMP__) return;
  const hb = holderBottomProfile(prms);
  const faceArr = hb ? passes.filter(p => p.type === 'face') : [];
  if (hb && faceArr.length > 0) {
    const dirM = faceLeft ? -1 : 1;           // směr k obrobené straně
    const kerf = Math.max(insertBodyZ(prms), 0);
    const hStep = Math.max(0.2, hb.reach / 60);
    // Schodiště: rovné dno nechává jen průchod BEZ dojezdu (s dojezdem
    // „bez schodků" jde dno po kontuře, tu pokrývá offsetXAt) a průchod
    // vynechaný — tam stojí SYROVÝ polotovar (`raw`, vzorkuje se až
    // v dotazu: přes šířku pásu se obrys odlitku může zlomit o desítky
    // mm — reálný nález, hrana Ø129 uprostřed pásu jinak propadla).
    const stair = [];                          // { zLo, zHi, x } | { zLo, zHi, raw }
    const stairAt = (zq) => {
      let top = null;
      for (const s of stair) {
        if (zq < s.zLo - 1e-9 || zq > s.zHi + 1e-9) continue;
        // SYROVÝ pás se měří na OFFSETOVÉ ČÁŘE, ne na povrchu: přídavek X/Z
        // (polo.) je v zadání právě proto, že odlitek MŮŽE být až u té čáry.
        // Bez toho držák „projde“ 0,1 mm nad syrovým povrchem a přitom je
        // 1 mm v pásu — nález uživatele 20. 8. 2026 na dojezdu prvního
        // průchodu nového úseku (`N3530 G1 X18.043 Z175.932`: spodek držáku
        // X16,85 proti povrchu 16,743, ale offsetová čára je 17,74).
        // HOTOVÉ dno průchodu zůstává svým `x` — to je skutečný povrch,
        // žádný přídavek tam nepatří (táž dělba jako u `enforceLayerDepth`).
        //
        // Čte se PŘÍMO plánovací smyčka, ne „syrový povrch + Vůle X“: to
        // druhé je svislý posun, kdežto offset se posouvá KOLMO k hranici
        // (týž antivzor jako u `rapidStartXAt` výš, viz offsetStockLoop).
        // Před SVISLÝM ČELEM je rozdíl řádový: offsetová čára tam leží
        // o Vůli Z PŘED čelem v celé jeho výšce, takže svislice těsně před
        // přírubou protne plánovací obrys až na jejím vnějším průměru.
        // Změřeno na part-16: v pásu Z 175,93–195,93 sahá plánovací obrys
        // do X(r) 65,3, ale „povrch + Vůle X“ tam vydá 17,74 — držák tudy
        // projel a validátor to hlásil jako 11,9 mm².
        let x;
        if (s.raw) {
          x = planLoopFC ? topXOnLoop(planLoopFC, zq) : null;
          if (x === null) {
            const surf = castingOuterOrNull(zq);
            x = surf === null ? null : surf + clrXFC;
          }
        } else x = s.x;
        if (x !== null && (top === null || x > top)) top = x;
      }
      return top;
    };
    // Z-pásy BEZ průchodu se do evidence schodů nedostanou jinudy: `faceArr`
    // je nezná (vypadly už v generování — mimo polotovar, nulový řez) a clamp
    // by pod nimi viděl jen konturu, tedy vzduch. Stojí tam přitom SYROVÝ
    // polotovar v plné výšce a právě do něj najel držák prvního průchodu pod
    // takovým pásem (reálný nález: 30 mm neobrobené stěny, 91 mm² kolize).
    {
      const have = new Set(faceArr.map(p => p.z.toFixed(3)));
      for (const z of zListAll) {
        if (have.has(z.toFixed(3))) continue;
        const zB = z + dirM * step;
        stair.push({ zLo: Math.min(z, zB), zHi: Math.max(z, zB), raw: true });
      }
    }
    // Nejmenší programovaná hloubka (X) na Z, při které držák projde.
    // POZOR na soustavy: `offsetXAt` je dráha STŘEDU špičky, materiál pod
    // ní leží o rádius níž (offset = kontura + R + přídavek), a držák míjí
    // MATERIÁL, ne dráhu. Bez odečtení R je clamp o celý rádius přísnější,
    // než je fyzikálně nutné, a to už se pozná na dokončování (bere pak
    // víc než přídavek). `stairAt` naopak vrací rovné dno = skutečný
    // povrch (tělo destičky ho zarovnává v úrovni programovaného bodu),
    // takže se z něj NEODEČÍTÁ.
    const tipR = Math.max(parseFloat(prms.toolRadius) || 0, 0);
    const minTipX = (z) => {
      let need = -Infinity;
      for (let d = kerf; d <= hb.reach + 1e-9; d += hStep) {
        const hx = hb.bottomAt(d);
        if (hx === null) continue;
        const zq = z + dirM * d;
        const oc = offsetXAt(zq);
        let floor = oc === null ? null : oc - tipR;
        const st = stairAt(zq);
        if (st !== null && (floor === null || st > floor)) floor = st;
        if (floor === null) continue;
        const cand = floor - hx + HOLDER_CLAMP_MARGIN;
        if (cand > need) need = cand;
      }
      return need;
    };
    // Odskok po řezu jede o `rDist` v X a `rDistZ` v Z K OBROBENÉ STRANĚ —
    // tam se okno držáku posune o rDistZ dál, takže konec průchodu musí
    // projít i v té poloze (o rDist výš). Bez toho průchod dosedne na mez
    // a teprve odskok zaveze držák do stěny (reálný nález: 50 mm² na
    // odskoku, když samotný řez byl čistý).
    const rDist = Math.max(parseFloat(prms.retractDistance) || 0, 0);
    const rAngDeg = Math.max(5, Math.min(90, parseFloat(prms.retractAngle) || 45));
    const rDistZ = rAngDeg >= 89.95 ? 0 : rDist / Math.tan(rAngDeg * Math.PI / 180);
    const minTipXFull = (z) => rDistZ > 1e-9
      ? Math.max(minTipX(z), minTipX(z + dirM * rDistZ) - rDist)
      : minTipX(z);
    // Dojezd „bez schodků" šplhá po kontuře k obrobené straně — přesně
    // tam, kde se veze držák. Ořízne se v prvním bodě, kde by narazil.
    const trimLeadOut = (p) => {
      if (!p.contourLeadOut) return false;
      const keep = [];
      let clipped = false;
      for (const s of p.contourLeadOut) {
        if (s.x2 + 1e-9 >= minTipX(s.z2)) { keep.push(s); continue; }
        // Úsek mez držáku PROTÍNÁ. Zahodit ho celý znamená zastavit dojezd
        // už na začátku úseku, i když po něm ještě kus volně projede —
        // na strmém čele (jeden úsek přes 23 mm v X) tím zůstal schodek,
        // ačkoli držák brání až dole (nález uživatele 19. 8. 2026: dojezd
        // končil na X39,48, mez držáku je přitom až na X21,60).
        // Úsečka se proto USEKNE v místě, kde mez protne; oblouk se dál
        // řeší celý (ořez oblouku by změnil jeho střed i poloměr).
        if (s.type !== 'line') break;
        let tOk = 0;
        const N = Math.max(20, Math.ceil(Math.hypot(s.x2 - s.x1, s.z2 - s.z1) / 0.05));
        for (let k = 1; k <= N; k++) {
          const t = k / N;
          const x = s.x1 + (s.x2 - s.x1) * t, z = s.z1 + (s.z2 - s.z1) * t;
          if (x + 1e-9 < minTipX(z)) break;
          tOk = t;
        }
        if (tOk > 1e-6) { keep.push({ ...s, x2: s.x1 + (s.x2 - s.x1) * tOk, z2: s.z1 + (s.z2 - s.z1) * tOk }); clipped = true; }
        break;
      }
      // POZOR: porovnávat jen POČTY nestačí. Když se ořízne poslední úsek a
      // žádný nevypadne, je počet stejný jako předtím — a ořez by se tiše
      // zahodil. Proto vlastní příznak.
      if (!clipped && keep.length === p.contourLeadOut.length) return false;
      if (keep.length > 0) p.contourLeadOut = keep; else delete p.contourLeadOut;
      return true;
    };
    const drop = new Set();
    for (const p of faceArr) {
      const need = minTipXFull(p.z);
      if (need > p.xEnd + 0.01) {
        // Zvednutí NAD mez dotyku nosu je stejné vynechání jako zvednutí nad
        // nájezdovou X — průchod by jen projel vzduchem nad polotovarem
        // (a dojel by tam, kde držák stejně nemá místo). Bez téhle větve
        // zůstal v programu „řez", který nic neodebral, ale kolidoval.
        // `need >= xTouchAt` = na TOMHLE Z už nos na materiál nedosáhne. U DOBĚHU
        // to ale neznamená řez vzduchem: plátek je široký a řeže svou VZDÁLENOU
        // stranou nad materiálem, který stojí dál — právě proto doběh existuje.
        // Lokální mez dotyku by ho zahodila.
        if (need >= p.xStart - 0.05 || (need >= xTouchAt(p.z) - 0.01 && !p.runOut)) {
          drop.add(p);
          holderDropped++;
        } else {
          p.xEnd = need;
          p.holderClamped = true;
          holderAdjusted++;
          // Dojezd byl spočítaný pro hlubší (původní) dno — po zvednutí
          // by sledoval konturu POD mezí držáku.
          if (p.contourLeadOut) delete p.contourLeadOut;
        }
      } else if (trimLeadOut(p)) {
        holderTrimmed++;
      }
      // Evidence schodu pro další (hlubší, více vlevo) průchody.
      const zA = p.z, zB = p.z + dirM * step;
      const entry = { zLo: Math.min(zA, zB), zHi: Math.max(zA, zB) };
      // Doběh nad povrchem nechává na svém Z syrový povrch (viz výš) — do
      // schodiště držáku patří jako `raw`. Doběh na hraně materiálu ale řeže,
      // ten platí svým dnem; jinak držák nad ním vidí syrový kus a zahodí
      // následující průchod po offsetové čáře.
      const roAir = p.runOut && p.xEnd >= xTouchAt(p.z) - 0.01;
      if (drop.has(p) || roAir) stair.push({ ...entry, raw: true });
      else if (!p.contourLeadOut) stair.push({ ...entry, x: p.xEnd });
    }
    if (drop.size > 0) {
      for (let i = passes.length - 1; i >= 0; i--) if (drop.has(passes[i])) passes.splice(i, 1);
    }
    if (!report) return;
    if (holderAdjusted + holderDropped > 0) {
      foundErrors.push({ type: 'warning', msg: `Hlídání držáku (čelně): ${holderAdjusted} průchodů zkráceno`
        + (holderDropped > 0 ? `, ${holderDropped} vynecháno` : '')
        + ` — hlouběji by držák (šířka ${hb.reach.toFixed(0)} mm) narazil do materiálu na obrobené straně. Materiál pod mezí obrobte jinou strategií (podélně / zleva) nebo štíhlejším nožem.` });
    } else if (holderTrimmed > 0) {
      foundErrors.push({ type: 'warning', msg: `Hlídání držáku (čelně): ${holderTrimmed} dojezdů zkráceno, aby držák nenarazil do stoupající kontury.` });
    }
  }
};
// POŘADÍ: hlídání držáku MUSÍ běžet UŽ PŘED doběhem. Doběh se rozhoduje podle
// toho, jestli na dalším Z ještě průchod JE („úsek pokračuje sám“) — a právě ty
// průchody držák zahazuje. Když běžel doběh první, viděl konce úseků o vrstvu
// (i o několik) dál, než kam se reálně dojede, a na ty skutečné konce se pak už
// nikdo nevrátil (nález uživatele 19. 8. 2026 s upichovákem: tři nedojeté konce —
// čelo příruby, konec úseku, levý konec). U natočené destičky to vycházelo
// náhodou: `enforceLayerDepth()` (polygon-only) ty průchody zahodilo dřív, takže
// doběh viděl správný konec úseku; u upichováku hloubka vrstev neběží vůbec.
// Druhé volání není kosmetika: průchod přidaný ZA držákem bez jeho kontroly jsou
// změřené 3 kolize (rapid@X66,2 Z195,0; holder@X62,0 Z195,0; rapid@X64,0
// Z197,0), takže přidané průchody musí jít držákem zkontrolovat ještě jednou.
holderGuardFace(false);
  return holderGuardFace;
}
