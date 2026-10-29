// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Parser G-kódu → objekty výkresu (🔄 Vykreslit)       ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Vyjmuto ze storage/fileIO.js beze změny chování (fileIO.js je obří soubor,
// do kterého se nepřidává). Čte kanonický G-kód a skládá z něj line/arc.

import { state } from '../state.js';
import { arcFromEndpointsRadius, safeEvalMath } from '../utils.js';

// G-kódy, které nesou X/Z, ale NEJSOU pohybem po kontuře (prodleva G04 X2.5,
// reference G28/G30, strojní souřadnice G53, cykly G70–G76). Dřív se z nich
// nakreslila falešná úsečka do bodu X/Z.
const NON_MOTION_SILENT = new Set([4, 10, 28, 30, 53, 70, 71, 72, 73, 74, 75, 76]);
// Totéž, ale mění nulový bod – další souřadnice pak v náhledu neplatí, tak se to hlásí.
const NON_MOTION_ORIGIN = new Set([50, 52, 92]);

export function parseGcodeToObjects(code) {
  const isKarusel = state.machineType === 'karusel';
  const isDiam = state.xDisplayMode === 'diameter';
  // soustruh: Z = canvas x, X = canvas y (poloměr)
  // karusel:  X = canvas x, Z = canvas y
  function toCanvas(gZ, gX) {
    // X je v průměru u soustruhu i karuselu (export: displayX na osu X v obou
    // případech) – dřív se u karuselu nepůlilo a překreslení zdvojnásobilo X.
    const xRaw = isDiam ? gX / 2 : gX;
    return isKarusel ? { x: xRaw, y: gZ } : { x: gZ, y: xRaw };
  }

  // Bezpečné vyhodnocení aritmetického výrazu (CSP-safe, bez eval/new Function)
  function evalExpr(s) {
    if (s == null) return null;
    s = String(s).replace(/[[\]]/g, '').trim();
    if (!s) return null;
    const v = safeEvalMath(s);
    return isFinite(v) ? v : null;
  }

  // Extrakce číselné hodnoty adresy (X, Z, R, I, K…) z řádku.
  // Podporuje: čísla, znaménka, výrazy (X10+5, X10/2), mezery (X 10), rovnítko (X=10).
  function getAddr(line, letter) {
    const re = new RegExp(
      '(?:^|[^A-Za-z])' + letter +
      '\\s*=?\\s*([+\\-]?\\s*(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+\\-]?\\d+)?' +
      '(?:\\s*[+\\-\\*\\/]\\s*(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+\\-]?\\d+)?)*)',
      'i'
    );
    const m = re.exec(line);
    return m ? evalExpr(m[1]) : null;
  }

  const objs = [];
  // Řádky, které appka geometricky nedovede sestrojit (typicky R menší než
  // půlka tětivy) – vrací se volajícímu, aby o nich šlo uživatele
  // informovat. Dřív se takový řádek tiše zahodil a poloha „teleportovala"
  // na cíl bez viditelné čáry, beze stopy po tom, že se něco nepovedlo.
  const warnings = [];
  let lineNo = 0;
  let cx = 0, cy = 0;     // aktuální poloha v canvas souřadnicích
  let gMode = 90;          // 90=absolutní, 91=inkrementální (modální – platí dokud není změněno)
  let motionCode = 0;      // poslední pohybový kód (modální G0/1/2/3)
  let inStock = false;
  let inchWarned = false;
  let lastComment = '';    // poslední komentářový řádek (pro pojmenování objektů)

  // Extrakce prvního čísla z komentáře (pro číslo objektu)
  function commentNum() {
    const m = lastComment.match(/\b(\d+)\b/);
    return m ? m[1] : null;
  }

  for (const rawLine of code.split('\n')) {
    lineNo += 1;
    // Detekce STOCK markerů před odstraněním komentářů
    if (/STOCK_START/i.test(rawLine)) { inStock = true; continue; }
    if (/STOCK_END/i.test(rawLine))   { inStock = false; continue; }

    // Ulož čistý komentářový řádek pro pojmenování dalšího objektu
    const rtrim = rawLine.trim();
    if (rtrim.startsWith(';')) lastComment = rtrim;

    // Odstraň komentáře: (text) Fanuc styl, ; do konce řádku
    let line = rawLine
      .replace(/\([^)]*\)/g, ' ')
      .replace(/;.*$/, '')
      .trim();

    if (!line || line === '%') continue;         // oddělovač programu
    if (/#\d/.test(line)) continue;              // Fanuc makro proměnné #1, #100 …
    line = line.replace(/\[([^\]]*)\]/g, '$1');  // [výraz] → výraz (aritmetika)
    line = line.replace(/^\s*N\s*\d+\s*/i, '').trim(); // číslo bloku N10, N0020
    line = line.replace(/(\d),(?=\d)/g, '$1.');        // desetinná čárka X10,5 (jinak by se četlo jen X10)

    // Zpracuj G-slova na řádku (G0=G00, G1=G01 atd.)
    const gs = [];
    const reG = /\bG\s*(0*\d{1,2})(?!\d)/gi;
    let gm;
    while ((gm = reG.exec(line)) !== null) gs.push(parseInt(gm[1], 10));

    // Aktualizace modálních stavů (platí dokud nejsou přepsány)
    if (gs.includes(90)) gMode = 90;
    if (gs.includes(91)) gMode = 91;
    if (gs.some(g => g === 0)) motionCode = 0;
    if (gs.some(g => g === 1)) motionCode = 1;
    if (gs.some(g => g === 2)) motionCode = 2;
    if (gs.some(g => g === 3)) motionCode = 3;

    if (gs.includes(20) && !inchWarned) {
      inchWarned = true;
      warnings.push({ line: lineNo, text: rtrim, kept: true, reason: 'G20 (palce) – náhled počítá v mm, rozměry se nepřepočítají' });
    }
    const skipG = gs.find(g => NON_MOTION_SILENT.has(g) || NON_MOTION_ORIGIN.has(g));
    if (skipG !== undefined) {
      if (NON_MOTION_ORIGIN.has(skipG)) {
        warnings.push({ line: lineNo, text: rtrim, kept: true, reason: `G${skipG} mění nulový bod – náhled s tím nepočítá, další souřadnice nemusí sedět` });
      }
      continue;
    }

    // Aktuální poloha zpět v jednotkách kódu (X v průměru u soustruhu i karuselu,
    // toCanvas ho pak zase půlí).
    const curGZ = isKarusel ? cy : cx;
    const curXr = isKarusel ? cx : cy;
    const curGX = isDiam ? curXr * 2 : curXr;

    // Zjisti souřadnice na řádku. U/W = přírůstek (Fanuc, systém A) od aktuální
    // polohy – dřív se řádek s U/W bez X/Z tiše přeskočil.
    let gZval = getAddr(line, 'Z');
    let gXval = getAddr(line, 'X');
    const uVal = getAddr(line, 'U');
    const wVal = getAddr(line, 'W');
    if (gXval === null && uVal !== null) gXval = gMode === 91 ? uVal : curGX + uVal;
    if (gZval === null && wVal !== null) gZval = gMode === 91 ? wVal : curGZ + wVal;

    // Efektivní pohybový G-kód: explicitní na tomto řádku nebo poslední modální
    const thisMotion = gs.find(g => g <= 3) ?? motionCode;
    if (gZval === null && gXval === null) {
      if (thisMotion >= 2 && /(?:^|[^A-Za-z])[IK]\s*=?\s*[-+.\d]/i.test(line)) {
        warnings.push({ line: lineNo, text: rtrim, reason: 'kružnice (G2/G3 bez X/Z) se nekreslí – zadej koncový bod oblouku' });
      }
      continue;
    }

    // Výpočet cílového bodu v canvas souřadnicích
    let tx, ty;
    if (gMode === 91) {
      // Inkrementální: přičti zadané osy, nezadaná osa má přírůstek 0. Dřív se
      // přičítání podmiňovalo „x ⇔ Z, y ⇔ X" – to platí jen pro soustruh; na
      // karuselu (x = X, y = Z) se tím G91 Z-10 vůbec nepohnulo a X šlo do Z.
      const dPt = toCanvas(gZval ?? 0, gXval ?? 0);
      tx = cx + dPt.x;
      ty = cy + dPt.y;
    } else {
      // Absolutní: nezadaná osa zůstane na aktuální poloze
      const absPt = toCanvas(gZval ?? curGZ, gXval ?? curGX);
      tx = absPt.x;
      ty = absPt.y;
    }

    if (thisMotion === 0) { cx = tx; cy = ty; continue; } // G00 rapid

    if (thisMotion === 1) {
      const len = Math.hypot(tx - cx, ty - cy);
      if (len > 1e-4) {
        const num = commentNum();
        const name = num ? `Úsečka ${num}` : 'Úsečka';
        objs.push({ type: 'line', id: state.nextId++, name, x1: cx, y1: cy, x2: tx, y2: ty, isStock: inStock });
      }
      lastComment = '';
      cx = tx; cy = ty;
      continue;
    }

    if (thisMotion === 2 || thisMotion === 3) {
      const gRval = getAddr(line, 'R');
      const gIval = getAddr(line, 'I');  // offset středu v X od aktuální polohy
      const gKval = getAddr(line, 'K');  // offset středu v Z od aktuální polohy
      // Smysl oblouku ve světě: G2/G3 v textu jsou při zrcadlení jedné osy
      // prohozené (flipArc v runCncExport, numerické zadání) – zpět se otočí,
      // jinak by se oblouk po „Vykreslit" vrátil na plátno zrcadlově.
      const arcCcw = (thisMotion === 3) !== (state.flipX !== state.flipZ);
      let acx, acy;

      if (gIval !== null || gKval !== null) {
        // Formát I/K: střed = aktuální poloha + (I=ΔX, K=ΔZ)
        // I je vždy POLOMĚR (Fanuc/Sinumerik), i když je X v průměru – proto ne toCanvas (ten X půlí).
        const off = isKarusel ? { x: gIval ?? 0, y: gKval ?? 0 } : { x: gKval ?? 0, y: gIval ?? 0 };
        acx = cx + off.x;
        acy = cy + off.y;
      } else if (gRval !== null) {
        // Formát R: R<0 = velký oblouk (>180°), R>0 = malý oblouk
        const rArc = arcFromEndpointsRadius(
          { x: cx, y: cy }, { x: tx, y: ty },
          Math.abs(gRval), arcCcw, { longArc: gRval < 0 },
        );
        if (!rArc) {
          const chord = Math.hypot(tx - cx, ty - cy);
          warnings.push({
            line: lineNo, text: rtrim,
            reason: `R${Math.abs(gRval).toFixed(3)} je moc malý pro tuto vzdálenost bodů (${chord.toFixed(3)} mm) – potřeba aspoň R${(chord / 2).toFixed(3)}`,
          });
          lastComment = ''; cx = tx; cy = ty; continue;
        }
        acx = rArc.cx;
        acy = rArc.cy;
      } else {
        warnings.push({ line: lineNo, text: rtrim, reason: 'oblouk nemá R ani I/K – nelze sestrojit' });
        lastComment = ''; cx = tx; cy = ty; continue;
      }

      const R = Math.hypot(cx - acx, cy - acy);
      if (R < 1e-6) { lastComment = ''; cx = tx; cy = ty; continue; }
      // U I/K nic nezaručuje, že koncový bod leží na kružnici (u R ano) – oblouk
      // by se nakreslil, ale nedojel by tam, kam program jede.
      const endR = Math.hypot(tx - acx, ty - acy);
      if ((gIval !== null || gKval !== null) && Math.abs(endR - R) > Math.max(0.01, R * 1e-4)) {
        warnings.push({
          line: lineNo, text: rtrim, kept: true,
          reason: `I/K nesedí – koncový bod je ${endR.toFixed(3)} mm od středu, začátek ${R.toFixed(3)} mm`,
        });
      }
      const startA = Math.atan2(cy - acy, cx - acx);
      const endA   = Math.atan2(ty - acy, tx - acx);
      const arcNum = commentNum();
      const arcName = arcNum ? `Oblouk ${arcNum}` : 'Oblouk';
      objs.push({ type: 'arc', id: state.nextId++, name: arcName,
        cx: acx, cy: acy, r: R, startAngle: startA, endAngle: endA,
        ccw: arcCcw, isStock: inStock });
      lastComment = '';
      cx = tx; cy = ty;
    }
  }
  return { objs, warnings };
}
