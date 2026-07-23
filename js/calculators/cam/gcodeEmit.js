// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – emise G-kódu (auto-generace + převod řídicího systému)  ║
// ╚══════════════════════════════════════════════════════════════╝
// Vytaženo z camSimulator.js (Fáze B). generateAutoGCode(S, calc) je bývalé
// generateAutoGCode(calc); ctrlCmt/buildControl*/renumber/convert jsou sdílené
// pomocníky hlavičky/závěru a převodu mezi systémy. V camSimulator.js zůstávají
// tenké wrappery pod původními jmény.
// POZOR: ctrlCmt MUSÍ zůstat function declaration (ne const) — headless test
// harness ho zachytává přes hoisting (viz tests/helpers/camHeadless.mjs).

import { StockModel, polyArea, polyOffset, polySimplify, toolSweep } from '../../geom/geomCore.js';
import { getEffectivePlungeAngle, intersectVerticalLineArc, intersectVerticalLineSegment, isAngleBetween, segEndPoint, segStartPoint, stockClearances } from './camMath.js';
import { segmentHitsPath } from './contourBuild.js';
import { buildStockLoop, toolFootprint } from './materialRemoval.js';
import { ROUGHING_STRATEGIES } from './roughingStrategies.js';
import { computeThreadPassCuts, partOffGeom, threadProfileDepth } from './threadHelpers.js';
import { roughingKey } from './calculatePipeline.js';

export function generateGCode(S, calc) {
  return S.manualGCode.split('\n').map((line, idx) => ({ text: line, simIdx: idx }));
}

// ── Hlavička/závěr programu podle řídicího systému ────────────
// Sdíleno mezi generateAutoGCode() (čerstvé generování z kontury) a
// convertGCodeControlSystem() (rychlý převod existujícího — i ručně
// upraveného — kódu při přepnutí řídicího systému v panelu Parametry).
// Jediné místo, kde se hlavičky/závěry jednotlivých systémů definují.
// Function declaration (ne const) — musí být hoistnutá i přes early-return
// capture v headless test harnessu (tests/helpers/camHeadless.mjs), který
// vrací hned po zachycení referencí, ještě před vykonáním const inicializací.
export function ctrlCmt(ctrl) {
  return (text) => ctrl === 'fanuc' ? `( ${text} )` : `; ${text}`;
}

export function buildControlHeaderLines(ctrl, prms, flipX, flipZ) {
  const cmt = ctrlCmt(ctrl);
  const note = (text) => ` ${cmt(text)}`;
  const names = { sinumerik: 'SINUMERIK 840D', fanuc: 'FANUC', heidenhain: 'HEIDENHAIN ISO' };
  const lines = [];
  lines.push(cmt(`Vygenerovaný kód ${names[ctrl] || names.sinumerik}`));
  lines.push(cmt(`Datum: ${new Date().toLocaleDateString()}`));
  if (flipX) lines.push(cmt('Obrábění zespodu (X+ dolů) – G2/G3 prohozeny'));
  if (flipZ) lines.push(cmt('Otočená osa Z (Z+ vlevo) – G2/G3 prohozeny'));

  if (ctrl === 'fanuc') {
    lines.push(`G21${note('Metrický vstup')}`, `G40${note('Zrušení kompenzace')}`);
    lines.push(`G99${note('Posuv mm/ot')}`, `G18${note('Rovina ZX')}`);
    lines.push(`G28 U0 W0${note('Referenční bod')}`, `G50 S2000${note('Max otáčky')}`);
    lines.push(`G96 S${prms.speed} M3${note('Konst. řezná rychlost')}`);
    lines.push(`T0101${note('Nástroj 1 / Korekce 1')}`, `M8${note('Chlazení ZAP')}`);
  } else if (ctrl === 'heidenhain') {
    lines.push(`G18${note('Rovina ZX')}`, `G90${note('Absolutní')}`);
    lines.push(`G71${note('Metrický systém')}`, `G54${note('Nulový bod')}`);
    lines.push(`G96 S${prms.speed} M3${note('Řezná rychlost')}`);
    lines.push(`T1 M6${note('Nástroj')}`, 'M8');
  } else {
    lines.push(`G18${note('Rovina ZX')}`, `G90${note('Absolutní programování')}`);
    lines.push(`G54${note('Posunutí počátku')}`, `G95${note('Posuv na otáčku')}`);
    lines.push(`G75 X${prms.safeX}${note('Nájezd do ref. bodu')}`, `G75 Z${prms.safeZ}`);
    lines.push(`LIMS=2000${note('Limit otáček')}`);
    lines.push(`G96 S${prms.speed} ${prms.machineType}${note('Konst. řezná rychlost')}`);
    lines.push(`${prms.mode === 'DIAMON' ? 'DIAMON' : 'DIAMOF'}${note(prms.mode === 'DIAMON' ? 'Programování průměru' : 'Programování poloměru')}`);
    lines.push(`T="${prms.toolName}" D1 M6${note('Výměna nástroje')}`);
    lines.push(`M3${note('Vřeteno CW')}`, `M8${note('Chlazení ZAP')}`);
  }
  return lines;
}

export function buildControlTailLines(ctrl) {
  const cmt = ctrlCmt(ctrl);
  if (ctrl === 'fanuc') return ['M9', 'M5', 'G28 U0 W0', `M30 ${cmt('Konec programu')}`];
  if (ctrl === 'heidenhain') return ['M9', 'M5', 'M30'];
  return [`M30 ${cmt('Konec programu')}`];
}

export function controlArcFormatter(ctrl) {
  return ctrl === 'sinumerik'
    ? (r => `CR=${(parseFloat(r) || 0).toFixed(3)}`)
    : (r => `R${(parseFloat(r) || 0).toFixed(3)}`);
}

// Přečísluje N-bloky (stejná konvence jako "Přečíslovat N-bloky" v CAM
// Editoru) — řádkům bez N doplní, komentáře nechá beze změny.
export function renumberGCodeLines(lines, start, step) {
  let n = start;
  return lines.map(line => {
    const t = line.trim();
    if (!t || t.startsWith(';') || t.startsWith('(')) return line;
    if (/^\s*N\d+/i.test(line)) {
      line = line.replace(/^\s*N\d+/i, 'N' + n);
      n += step;
    } else if (/^[A-Z0-9]/i.test(t) && !t.toUpperCase().startsWith('MSG')) {
      line = 'N' + n + ' ' + line;
      n += step;
    }
    return line;
  });
}

// ── Rychlý převod existujícího G-kódu mezi řídicími systémy ──────
// Volá se při přepnutí "Řídicí systém" v panelu Parametry: hlavička a
// závěr programu (M30 blok) se přegenerují pro nový systém, střední
// část — skutečné dráhy, posuvy, i ruční úpravy uživatele — zůstává
// beze změny, jen se převede styl komentářů (; ↔ ( )) a zápis oblouku
// (CR=... ↔ R...) na řádcích s G2/G3. Chce-li uživatel dráhy přegenerovat
// od nuly z kontury, použije tlačítko "🔄 Dráhy" jako dřív.
export function convertGCodeControlSystem(code, oldCtrl, newCtrl, prms, flipX, flipZ) {
  if (!code || !code.trim() || oldCtrl === newCtrl) return code;
  const lines = code.replace(/\r\n/g, '\n').split('\n');

  // Konec hlavičky: dělicí komentář "--- ... ---" (obě varianty stylu),
  // jinak záložně první řezný/kruhový pohyb G1/G2/G3.
  let bodyStart = lines.findIndex(l => /^\s*[;(]\s*-{2,}/.test(l));
  if (bodyStart === -1) {
    bodyStart = lines.findIndex(l => /\bG[123]\b/i.test(l.replace(/^\s*N\d+\s*/i, '').replace(/[;(].*$/, '')));
    if (bodyStart === -1) bodyStart = lines.length;
  }
  const body = lines.slice(bodyStart);

  // Konec programu: poslední M30 + bezprostředně předcházející M5/M9/G28
  // (typický závěrečný blok — viz buildControlTailLines).
  let tailStart = -1;
  for (let i = body.length - 1; i >= 0; i--) {
    if (/^\s*(N\d+\s*)?M30\b/i.test(body[i])) { tailStart = i; break; }
  }
  const tailEnd = tailStart === -1 ? -1 : tailStart + 1;
  while (tailStart > 0) {
    const prevClean = body[tailStart - 1].replace(/^\s*N\d+\s*/i, '').replace(/[;(].*$/, '').trim().toUpperCase();
    if (/^M[59]$/.test(prevClean) || /^G28\b/.test(prevClean)) tailStart--;
    else break;
  }
  const hasTail  = tailStart !== -1;
  const middle   = hasTail ? body.slice(0, tailStart) : body;
  const trailing = hasTail ? body.slice(tailEnd) : [];

  const convLine = (line) => {
    let out = line;
    if (oldCtrl !== 'fanuc' && newCtrl === 'fanuc') {
      out = out.replace(/;\s*(.*)$/, (_, t) => t.trim() ? `( ${t.trim()} )` : '');
    } else if (oldCtrl === 'fanuc' && newCtrl !== 'fanuc') {
      out = out.replace(/\(\s*(.*?)\s*\)\s*$/, (_, t) => t.trim() ? `; ${t.trim()}` : '');
    }
    if (/\bG0?[23]\b/i.test(out)) {
      if (oldCtrl === 'sinumerik' && newCtrl !== 'sinumerik') out = out.replace(/\bCR=(-?[\d.]+)/i, 'R$1');
      else if (oldCtrl !== 'sinumerik' && newCtrl === 'sinumerik') out = out.replace(/\bR(-?[\d.]+)\b/i, 'CR=$1');
    }
    return out;
  };

  const newHeader = buildControlHeaderLines(newCtrl, prms, flipX, flipZ);
  const newTail = hasTail ? buildControlTailLines(newCtrl) : [];

  const assembled = [...newHeader, ...middle.map(convLine), ...newTail, ...trailing.map(convLine)];
  return renumberGCodeLines(assembled, 10, 10).join('\n');
}

// ── Auto G-Code Generator (z aktuální kontury/parametrů) ─────
// Volá se jen z tlačítka "🔄 Autorefresh drah" — výsledek přepíše
// S.manualGCode (a tedy i editor a simulační dráhu).
export function generateAutoGCode(S, calc) {
  const prms = S.params;
  const lines = [];
  const add = (text, simIdx = null) => lines.push({ text, simIdx });
  const cmt = ctrlCmt(prms.controlSystem);
  const addCmt = (text) => add(cmt(text), null);
  let blockNum = 10;
  const N = () => { const s = `N${blockNum} `; blockNum += 10; return s; };
  const addN = (text, simIdx = null) => add(`${N()}${text}`, simIdx);
  const note = (cmd, text) => ` ${cmd}${cmt(text)}`;
  let arcR = controlArcFormatter(prms.controlSystem);
  // Při otočení svislé osy X (X+ dolů) je program psán pro nástroj zespodu –
  // smysl rotace se obrací, takže G02↔G03 ve výstupu prohazujeme.
  // Totéž platí pro flipZ; G2/G3 se prohazují při lichém počtu překlopení (XOR).
  const flipArc = (code) => {
    if (S.flipX === S.flipZ) return code;
    const c = String(code).trim().toUpperCase();
    if (c === 'G2' || c === 'G02') return code.includes('02') ? 'G03' : 'G3';
    if (c === 'G3' || c === 'G03') return code.includes('03') ? 'G02' : 'G2';
    return code;
  };

  buildControlHeaderLines(prms.controlSystem, prms, S.flipX, S.flipZ).forEach(line => {
    if (line.startsWith(';') || line.startsWith('(')) add(line, null);
    else addN(line, null);
  });

  let simCounter = 0;
  addN(`G0 X${prms.safeX} Z${prms.safeZ}${note('', 'Rychloposuv')}`, 0);
  const rDist = calc.retractDist || 2.0;
  // Úhel odskoku (°): X-složka je vždy rDist, Z-složka = rDist/tan(úhel).
  // 45° = klasická diagonála (Z = rDist), 90° = svisle jen v X (Z = 0).
  const rAngDeg = Math.max(5, Math.min(90, parseFloat(prms.retractAngle) || 45));
  // zaokrouhlení na 1e-9 → tan(45°)=0.999…99 nerozhodí výstup (Z1.901 vs 1.902)
  const rDistZ = rAngDeg >= 89.95 ? 0 : Math.round(rDist / Math.tan(rAngDeg * Math.PI / 180) * 1e9) / 1e9;

  // ── ZÁVITOVÁNÍ (záložka Závit) ── průchody G33 (Sinumerik/Heidenhain)
  // / G32 (Fanuc) s degresivním radiálním přísuvem (√(i/n) — konstantní
  // průřez třísky) + jiskřící průchody. Vnější závit: přísuv z ⌀D dolů na
  // ⌀(D−2H); vnitřní: z předvrtané díry ⌀(D−2H) nahoru na ⌀D. Otáčky se
  // pro závitování přepnou na konstantní (G97) — G96 by měnil otáčky s X
  // a stoupání by „uteklo".
  if (prms.threadActive) {
    const P = Math.max(0.01, parseFloat(prms.threadPitch) || 1);
    const Dnom = Math.max(0.1, parseFloat(prms.threadDiameter) || 10);
    const H = Math.max(0.01, parseFloat(prms.threadDepth) || threadProfileDepth(prms.threadType, P, prms.threadExternal !== false));
    const ext = prms.threadExternal !== false;
    const zStart = parseFloat(prms.threadZStart) || 0;
    const zEnd = isFinite(parseFloat(prms.threadZEnd)) ? parseFloat(prms.threadZEnd) : zStart - 10;
    const runIn = Math.max(0, parseFloat(prms.threadRunIn) || 0);
    const runOut = Math.max(0, parseFloat(prms.threadRunOut) || 0);
    const spring = Math.max(0, Math.round(parseFloat(prms.threadSpringPasses)) || 0);
    const cuts = computeThreadPassCuts(H, parseFloat(prms.threadPasses) || 0);
    const xd = (v) => prms.mode === 'DIAMON' ? (v * 2).toFixed(3) : v.toFixed(3);
    // Směr řezu: od zStart k zEnd (typicky zprava doleva, Z klesá).
    const dirZ = zEnd < zStart ? -1 : 1;
    const z0 = zStart - dirZ * runIn;        // start s náběhem (rozběh posuvu)
    const zCut = zEnd + dirZ * runOut;       // konec s výběhem
    // Kuželový závit 1:k — poloměr povrchu se mění podél dráhy řezu:
    // slopeR = Δr na 1 mm (Δ⌀ = 1/k na 1 mm). Průchod jede G33 s X i Z
    // (synchronizovaná kuželová interpolace), stoupání zůstává podél Z.
    const taper = parseFloat(prms.threadTaperRatio) || 0;
    const slopeR = taper !== 0 ? 1 / (2 * taper) : 0;
    const distOf = (z) => (z - zStart) / dirZ;                 // vzdálenost podél řezu od Z startu
    const rBase = ext ? Dnom / 2 : Dnom / 2 - H;               // povrch (vnější) / předvrtaná díra (vnitřní) na Z startu
    const rSurfAt = (z) => rBase + slopeR * distOf(z);
    // Konstantní otáčky pro závit: n = Vc·1000/(π·D), omezeno LIMS.
    const lims = parseInt((prms.machineType || '').match(/LIMS=(\d+)/)?.[1]) || 2000;
    const rpm = Math.max(10, Math.min(lims, Math.round((parseFloat(prms.speed) || 100) * 1000 / (Math.PI * Dnom))));
    const clr = Math.max(0.5, stockClearances(prms).x) + 1;
    const rMinor = Dnom / 2 - H;             // poloměr dna profilu (vnější) / předvrtané díry (vnitřní)
    // Odskok mezi průchody musí minout povrch po CELÉ délce (u kužele
    // rozhoduje větší/menší konec).
    const rSurfMax = Math.max(rSurfAt(z0), rSurfAt(zCut));
    const rSurfMin = Math.min(rSurfAt(z0), rSurfAt(zCut));
    const rClear = ext ? rSurfMax + clr : Math.max(0.2, rSurfMin - clr);
    // Způsob přísuvu: radiální (kolmý) / boční po boku profilu / střídavý.
    // Boční = start průchodu se posune v Z o hloubka·tan(ε/2) — G33 drží
    // synchronizaci se vřetenem, takže posun startu posouvá řez v drážce
    // na bok profilu (řeže jen jedna strana špičky). Střídavý znaménko
    // posunu střídá — boky se řežou střídavě (rovnoměrné opotřebení).
    const infeed = prms.threadInfeed === 'flank' || prms.threadInfeed === 'alternate' ? prms.threadInfeed : 'radial';
    const infTan = Math.tan(((parseFloat(prms.threadAngle) || 60) / 2) * Math.PI / 180);
    const zShiftOf = (cum, i) => infeed === 'radial' ? 0
      : infeed === 'flank' ? cum * infTan
      : (i % 2 === 0 ? 1 : -1) * cum * infTan;
    // G33/G32: stoupání K (Sinumerik/Heidenhain ISO) vs. F (Fanuc);
    // kuželový průchod má v bloku i cílové X.
    const thrLine = (z, rTo) => {
      const xWord = taper !== 0 ? ` X${xd(rTo)}` : '';
      return prms.controlSystem === 'fanuc'
        ? `G32 Z${z.toFixed(3)}${xWord} F${P}`
        : `G33 Z${z.toFixed(3)}${xWord} K${P}`;
    };
    const infeedLabel = { radial: 'radialni prisuv', flank: 'bocni prisuv', alternate: 'stridavy prisuv' }[infeed];
    addCmt(`--- ZAVITOVANI ${prms.threadName || `⌀${Dnom}×${P}`} (${ext ? 'vnejsi' : 'vnitrni'}, H=${H.toFixed(3)}, ${cuts.length} pruchodu, ${infeedLabel}${taper !== 0 ? `, kuzel 1:${Math.abs(taper)}` : ''}) ---`);
    if (!ext && rMinor <= 0.05) {
      addCmt(`! Vnitrni zavit: prumer diry ⌀${(rMinor * 2).toFixed(3)} <= 0 — zkontroluj ⌀D a hloubku H. Drahy nevygenerovany.`);
    } else {
      addN(`G97 S${rpm}${note('', 'Konstantní otáčky pro závit')}`);
      simCounter += 1; addN(`G0 X${xd(rClear)} Z${z0.toFixed(3)}${note('', 'Nájezd před závit (náběh)')}`, simCounter);
      let prevCum = 0;
      // Jeden průchod: přejezd na start (Z s bočním posunem), přísuv v X
      // (na kuželu dle povrchu v místě startu), G33 na konec, odskok.
      const onePass = (cum, zShift, label) => {
        const z0i = z0 - dirZ * zShift;
        const rFrom = ext ? rSurfAt(z0i) - cum : rSurfAt(z0i) + cum;
        const rTo = ext ? rSurfAt(zCut) - cum : rSurfAt(zCut) + cum;
        simCounter += 1; addN(`G0 Z${z0i.toFixed(3)}`, simCounter);
        simCounter += 1; addN(`G0 X${xd(rFrom)}${note('', label)}`, simCounter);
        simCounter += 1; addN(thrLine(zCut, rTo), simCounter);
        simCounter += 1; addN(`G0 X${xd(rClear)}${note('', 'Odskok')}`, simCounter);
      };
      cuts.forEach((cum, i) => {
        onePass(cum, zShiftOf(cum, i), `Průchod ${i + 1}/${cuts.length} (ap ${(cum - prevCum).toFixed(3)})`);
        prevCum = cum;
      });
      // Jiskřící průchody na plné hloubce — boční posun jako poslední
      // řezný průchod, ať jedou ve stejné stopě.
      const springShift = zShiftOf(H, cuts.length - 1);
      for (let s = 0; s < spring; s++) onePass(H, springShift, `Jiskřící průchod ${s + 1}`);
      addN(`G0 X${prms.safeX} Z${prms.safeZ}${note('', 'Bezpečná poloha')}`);
      addN(`G96 S${prms.speed}${note('', 'Zpět konst. řezná rychlost')}`);
      buildControlTailLines(prms.controlSystem).forEach(line => addN(line));
    }
    addCmt('--- KONTURA (Pro referenci) ---');
    S.contourPoints.forEach(p => {
      const cmd = (p.type === 'G2' || p.type === 'G3') ? flipArc(p.type) : p.type;
      let line = `${cmd} X${(parseFloat(p.x) || 0)} Z${(parseFloat(p.z) || 0)}`;
      if (p.type === 'G2' || p.type === 'G3') line += ` ${arcR(p.r)}`;
      addCmt(line);
    });
    return lines;
  }

  // ── UPICHNUTÍ (part-off) ── zápich plátkem po SVISLÉ ÚSEČCE v Z=partOffZ.
  // Nově se upich chová jako obrábění syntetické (svislé) kontury plátkem
  // s korekcí rádiusu a přídavky (viz partOffGeom níže) — ne jako „hloupý"
  // radiální zápich na osu. Podporovány jen KULATÝ a UPICHOVACÍ plátek.
  //
  //  • Přídavek X (allowanceX) = DOJEZD: cílová radiální poloha SPODNÍ HRANY
  //    plátku (allowanceX=0 → hrana na X0; =10 → hrana na X10). Referenční
  //    bod plátku = střed pracovního rádiusu ⇒ cíl středu = allowanceX + R.
  //  • Přídavek Z (allowanceZ) + Přídavek na hotovo (finishAllowance) =
  //    přídavek jen v ose Z; hrubování odsazeno o (allowanceZ+finishAllowance)
  //    od roviny řezu, dokončení jede přesně na partOffZ.
  //  • Strana (roughingSide) určuje znaménko Z-offsetu (tělo plátku sedí do
  //    už obrobené zóny).
  // Peck (lámání třísky) zachován: po hloubce „Vyjezd" (retractDistance) plátek
  // vyjede, rychloposuvem zpět až partingApproachFeed mm nad dno, pak posuvem F.
  const partOffActive = prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ));
  if (partOffActive) {
    const geom = partOffGeom(prms, calc);   // společná geometrie (i pro vizualizaci)
    const xd = (v) => prms.mode === 'DIAMON' ? (v * 2).toFixed(3) : v.toFixed(3);
    const pz = geom.pz;
    const peck = Math.max(0.1, parseFloat(prms.retractDistance) || 2);
    const af = Math.max(0, parseFloat(prms.partingApproachFeed));
    const clr = Math.max(0.5, stockClearances(prms).x);
    const xCenterStart = geom.xCenterStart;  // odkud jede posuv (rychloposuv sem)
    const xCenterTarget = geom.xCenterTarget; // střed plátku, spodní hrana na dojezdu
    const xClear = geom.xCenterTop + clr;
    addCmt('--- UPICHNUTI ---');
    if (!geom.canCut) {
      addCmt(geom.reason);
    } else {
      // Jeden zápichový cyklus (peck) na dané Z rovině, střed jede k xTarget.
      // Posuv začíná od Start X (xCenterStart) — z povrchu se sem dojede G0.
      const peckPlunge = (zc, label) => {
        simCounter += 1; addN(`G0 Z${zc.toFixed(3)}${note('', label)}`, simCounter);
        simCounter += 1; addN(`G0 X${xd(xClear)}`, simCounter);
        let depth = xCenterStart;
        let guard = 0;
        while (depth > xCenterTarget + 1e-4 && guard++ < 10000) {
          const nextDepth = Math.max(xCenterTarget, depth - peck);
          // rychloposuv zpět na af mm nad aktuální dno (u prvního na Start X)
          simCounter += 1; addN(`G0 X${xd(depth + af)}`, simCounter);
          simCounter += 1; addN(`G1 X${xd(nextDepth)} F${prms.feed}${note('', 'Zápich')}`, simCounter);
          depth = nextDepth;
          // Výjezd pro uvolnění třísek jen na Start X (xCenterStart), ne nad
          // celý polotovar — v kapse zůstane nástroj blízko a šetří čas.
          if (depth > xCenterTarget + 1e-4) { simCounter += 1; addN(`G0 X${xd(xCenterStart)}${note('', 'Vyjezd – uvolnění třísek')}`, simCounter); }
        }
        simCounter += 1; addN(`G0 X${xd(xClear)}${note('', 'Vyjezd')}`, simCounter);
      };
      // Plynulý zápich = jeden posuv F na dno, bez peckování (výjezdů).
      // Rychloposuvem na Start X, odtud posuvem na dno.
      const smoothPlunge = (zc, label, cutCmt = 'Zápich') => {
        simCounter += 1; addN(`G0 Z${zc.toFixed(3)}${note('', label)}`, simCounter);
        simCounter += 1; addN(`G0 X${xd(xCenterStart)}`, simCounter);
        simCounter += 1; addN(`G1 X${xd(xCenterTarget)} F${prms.feed}${note('', cutCmt)}`, simCounter);
        simCounter += 1; addN(`G0 X${xd(xClear)}${note('', 'Vyjezd')}`, simCounter);
      };
      // Hlavní (hrubovací / jediný) zápich: plynule nebo peckovaně dle volby.
      const mainPlunge = prms.partOffSmooth ? smoothPlunge : peckPlunge;
      // Hlavní zápich VŽDY na zRough (nechá Přídavek Z i Přídavek na hotovo).
      // Dokončovací (plynulá) dráha jede jen se zapnutou „Dokončovací operace"
      // — odebere Přídavek na hotovo až na finální rovinu (zFinal).
      mainPlunge(geom.zRough, geom.doFinish ? 'Rovina upichnutí – hrubování' : 'Rychloposuv na rovinu upichnutí');
      if (geom.doFinish) {
        smoothPlunge(geom.zFinal, 'Dokončení – rovina řezu (plynule)', 'Dokončovací zápich');
      }
      addN(`G0 X${prms.safeX} Z${prms.safeZ}${note('', 'Bezpečná poloha')}`);
      buildControlTailLines(prms.controlSystem).forEach(line => addN(line));
    }
    addCmt('--- KONTURA (Pro referenci) ---');
    S.contourPoints.forEach(p => {
      const cmd = (p.type === 'G2' || p.type === 'G3') ? flipArc(p.type) : p.type;
      let line = `${cmd} X${(parseFloat(p.x) || 0)} Z${(parseFloat(p.z) || 0)}`;
      if (p.type === 'G2' || p.type === 'G3') line += ` ${arcR(p.r)}`;
      addCmt(line);
    });
    return lines;
  }

  if (!prms.finishOnly)
    addCmt(`--- HRUBOVANI (${(ROUGHING_STRATEGIES[roughingKey(S)] || ROUGHING_STRATEGIES.longitudinal).label}) ---`);
  // Vůle nad polotovarem po osách + úhel nájezdové rampy (ladí s calculate()).
  const { x: rapidClrGc, z: rapidClrZGc } = stockClearances(prms);
  // Zastavení rychloposuvu: vůle se měří od HRANY nástroje — nos špičky
  // (rádius R) předbíhá střed, takže střed staví o R dál. Jinak by při
  // vůli < R nos při příjezdu „na vůli“ už škrtal o polotovar.
  const tipRGc = parseFloat(prms.toolRadius) || 0;
  const rapidStopX = rapidClrGc + tipRGc;
  const rapidStopZ = rapidClrZGc + tipRGc;
  const entryAngleDegGc = getEffectivePlungeAngle(prms);
  const entryRadGc = entryAngleDegGc * Math.PI / 180;
  // Helper: ořezat Z na aktivní čelisti/koník limity (G-kód generace).
  const gcChuckZ = (S.zLimits.chuckActive && typeof S.zLimits.chuck === 'number' && isFinite(S.zLimits.chuck)) ? S.zLimits.chuck : null;
  const gcTailZ  = (S.zLimits.tailActive  && typeof S.zLimits.tail  === 'number' && isFinite(S.zLimits.tail))  ? S.zLimits.tail  : null;
  const clipZGc = (z) => {
    let v = z;
    if (gcTailZ  !== null && v > gcTailZ)  v = gcTailZ;
    if (gcChuckZ !== null && v < gcChuckZ) v = gcChuckZ;
    return v;
  };

  // ── Bezpečné rychloposuvy ──
  // Sledujeme reálnou polohu nástroje (X = rádius) a každý přejezd G0
  // testujeme proti offsetové kontuře (hrubovací i dokončovací offset).
  // Pokud by přímý přejezd konturu protnul, nejdřív se vyjede v X nad
  // polotovar/konturu, přejede v Z a teprve pak sjede na cíl.
  const rapidBlockers = [...(calc.offsetPath || []), ...(calc.finishOffsetPath || []), ...(calc.finishUnreachablePath || [])].filter(s => !s.isDegenerate);
  let rapidTopX = calc.stockTopX || 0;
  rapidBlockers.forEach(s => {
    if (s.type === 'line') rapidTopX = Math.max(rapidTopX, s.p1.x, s.p2.x);
    else rapidTopX = Math.max(rapidTopX, s.cx + s.r);
  });
  // ── Fáze 4: dynamický zbytkový polotovar pro rychloposuvy ────────
  // Statické blockery (offsety) nevidí POŘADÍ obrábění: přejezd nad
  // místem, které se obrobí až později, vede skrz stojící materiál.
  // Model polotovaru se proto během emise průběžně „obrábí" (noteCutPass
  // po každém průchodu) a přímé rychloposuvy se testují stopou destičky
  // proti aktuálnímu zbytku — při kontaktu se jede nahoru přes polotovar
  // (stejný vzor jako u statických blockerů).
  let rapidStock = null;
  let rapidFoot = null;
  let rapidFootSlim = null;
  let rapidStockCuts = 0;
  let stockLoop0Ref = null;   // původní (neobrobená) silueta odlitku — referenční „kde je materiál"
  let stockLoop0OffsetRef = null;   // silueta posunutá o Vůli X/Z (tečkovaná hranice v náhledu)
  try {
    const stockLoop0 = buildStockLoop(prms, calc.stockPathSegments);
    if (stockLoop0) {
      stockLoop0Ref = stockLoop0;
      rapidStock = new StockModel([stockLoop0]);
      rapidFoot = toolFootprint(prms);
      rapidFootSlim = polyOffset([rapidFoot], -0.05)[0] || rapidFoot;
      // Vůlí-posunutá silueta (stejná tečkovaná hranice jako v náhledu,
      // camSimulator.js) — přes polyOffset (Clipper), ne per-bodovou normálu:
      // ta by na ostrých hranách/schodech siluety (odlitek s bosem/zápichem)
      // zkreslovala roh lineární interpolací mezi posunutými vrcholy místo
      // skutečného zaobleného přechodu. VůleX ≠ VůleZ (anizotropní) se řeší
      // měřítkem osy Z (poměr VůleX/VůleZ), izotropním offsetem o VůleX a
      // měřítkem zpět — ekvivalentní eliptickému posunu (ΔX/VůleX)²+(ΔZ/VůleZ)²=1.
      const { x: clrXOff, z: clrZOff } = stockClearances(prms);
      if (Math.abs(clrXOff - clrZOff) < 1e-6) {
        stockLoop0OffsetRef = polyOffset([stockLoop0], clrXOff)[0] || null;
      } else {
        const kZ = clrXOff / clrZOff;
        const scaled = stockLoop0.map(p => ({ x: p.x, z: p.z * kZ }));
        const off = polyOffset([scaled], clrXOff)[0];
        stockLoop0OffsetRef = off ? off.map(p => ({ x: p.x, z: p.z / kZ })) : null;
      }
    }
  } catch (err) {
    console.warn('CAM: dynamický model polotovaru pro rychloposuvy selhal:', err);
    rapidStock = null;
  }
  const rapidHitsStock = (x1, z1, x2, z2) => {
    if (!rapidStock) return false;
    try {
      const sweep = toolSweep(rapidFootSlim, [{ x: x1, z: z1 }, { x: x2, z: z2 }]);
      return Math.abs(polyArea(rapidStock.collide(sweep))) > 0.5;
    } catch { return false; }
  };
  // Horní hrana (max X) zbytkového polotovaru na axiální souřadnici `z` — povrch,
  // který nástroj při radiálním sjezdu (klesající X) potká první. null = na tomto
  // z zbytek žádný materiál nemá (vzduch). Slouží k zastavení rychloposuvu na
  // povrchu odlitku, když nájezdová vůle je „vzduch" jen vůči kontuře, ne vůči
  // plnému obalu odlitku (viz descendTo v safeRapidTo).
  const residualTopXAtZ = (z) => {
    if (!rapidStock) return null;
    let top = null;
    for (const loop of rapidStock.loops) {
      const n = loop.length;
      for (let i = 0; i < n; i++) {
        const a = loop[i], b = loop[(i + 1) % n];
        if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) {
          const x = a.x + (b.x - a.x) * ((z - a.z) / (b.z - a.z));
          if (top === null || x > top) top = x;
        }
      }
    }
    return top;
  };
  // Povrch (max X) PŮVODNÍ siluety odlitku na axiální z — reference „kde odlitek
  // vůbec je". Na rozdíl od residualTopXAtZ (dynamický zbytek) se nemění řezáním,
  // takže označuje jen TRVALÝ vzduch nad odlitkem (drážky, nižší místa siluety),
  // ne už obrobené oblasti. Slouží k rozsekání podélného řezu na rapid(vzduch)/
  // posuv(materiál): nad drážkou odlitku, kam díl nesahá, nemá co řezat.
  const castingTopXAtZ = (z) => {
    if (!stockLoop0Ref) return null;
    let top = null;
    const n = stockLoop0Ref.length;
    for (let i = 0; i < n; i++) {
      const a = stockLoop0Ref[i], b = stockLoop0Ref[(i + 1) % n];
      if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) {
        const x = a.x + (b.x - a.x) * ((z - a.z) / (b.z - a.z));
        if (top === null || x > top) top = x;
      }
    }
    return top;
  };
  // Totéž jako castingTopXAtZ, ale nad siluetou posunutou o Vůli X/Z
  // (stockLoop0OffsetRef — stejná tečkovaná hranice jako v náhledu). Používá
  // se pro RAMPU (diagonální zanoření): posuv (G1) má sahat až k téhle
  // vůlí-posunuté hranici, ne k holé kůře odlitku — konzistentní s tím, kde
  // podle náhledu končí rychloposuv.
  const castingTopXAtZOffset = (z) => {
    if (!stockLoop0OffsetRef) return null;
    let top = null;
    const n = stockLoop0OffsetRef.length;
    for (let i = 0; i < n; i++) {
      const a = stockLoop0OffsetRef[i], b = stockLoop0OffsetRef[(i + 1) % n];
      if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) {
        const x = a.x + (b.x - a.x) * ((z - a.z) / (b.z - a.z));
        if (top === null || x > top) top = x;
      }
    }
    return top;
  };
  // Z-souřadnice, kde silueta odlitku protíná hloubku x (hrany, kde povrch
  // odlitku přechází přes x = přechody vzduch↔materiál na této hloubce), v [zLo,zHi].
  const castingCrossZ = (x, zLo, zHi) => {
    if (!stockLoop0Ref) return [];
    const zs = new Set();
    const n = stockLoop0Ref.length;
    for (let i = 0; i < n; i++) {
      const a = stockLoop0Ref[i], b = stockLoop0Ref[(i + 1) % n];
      if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x)) {
        const z = a.z + (b.z - a.z) * ((x - a.x) / (b.x - a.x));
        if (z > zLo + 1e-4 && z < zHi - 1e-4) zs.add(+z.toFixed(4));
      }
    }
    return [...zs];
  };
  const noteCutPts = (pts) => {
    if (!rapidStock || pts.length < 2) return;
    try {
      rapidStock.cut(toolSweep(rapidFoot, pts));
      if (++rapidStockCuts % 24 === 0) rapidStock.loops = polySimplify(rapidStock.loops, 0.002);
    } catch { /* model je jen pro rychloposuvy — pokračovat bez řezu */ }
  };
  // Odebere z modelu materiál celého průchodu (řezné pohyby v pořadí
  // emise: leadIn → rampa/vjezd → dno → leadOut). Rychloposuvy a odskoky
  // se nezapočítávají — falešný „řez" by model podřezal a pustil
  // rychloposuv skutečným materiálem.
  const noteCutPass = (pass) => {
    if (!rapidStock) return;
    const pts = [];
    const push = (x, z) => {
      const l = pts[pts.length - 1];
      if (Number.isFinite(x) && Number.isFinite(z)
        && (!l || Math.hypot(l.x - x, l.z - z) > 1e-6)) pts.push({ x, z });
    };
    if (pass.type === 'face') {
      push(pass.xStart, pass.z);
      push(pass.xEnd, pass.z);
    } else {
      const li = pass.contourLeadIn || [];
      if (li.length > 0) {
        for (const s of li) { push(s.x1, s.z1); push(s.x2, s.z2); }
      } else if (pass.rampFeedFrom) {
        push(pass.rampFeedFrom.x, pass.rampFeedFrom.z);
      } else if (pass.ramp) {
        push(pass.ramp.x0, pass.ramp.z0);
      }
      push(pass.x, pass.zStart);
      push(pass.x, pass.zEnd);
      if (pass.contourLeadOut) {
        for (const s of pass.contourLeadOut) { push(s.x1, s.z1); push(s.x2, s.z2); }
      }
    }
    noteCutPts(pts);
  };
  const xDia = (v) => prms.mode === 'DIAMON' ? (v * 2).toFixed(3) : v.toFixed(3);
  // Max X hrubovacího offsetu na svislici Z (pro kontrolu odskoku u stěny).
  const gcOffsetXAt = (z) => {
    let m = null;
    for (const s of (calc.offsetPath || [])) {
      if (s.isDegenerate) continue;
      if (s.type === 'line') {
        const x = intersectVerticalLineSegment(z, s.p1, s.p2);
        if (x !== null && (m === null || x > m)) m = x;
      } else {
        for (const x of intersectVerticalLineArc(z, { x: s.cx, z: s.cz }, s.r)) {
          const a = Math.atan2(x - s.cx, z - s.cz);
          if (isAngleBetween(a, s.startAngle, s.endAngle, s.dir === 'G2') && (m === null || x > m)) m = x;
        }
      }
    }
    return m;
  };
  const cur = { x: null, z: null };
  const setPos = (x, z) => { cur.x = x; cur.z = z; };
  // Výchozí poloha = bezpečná poloha z úvodního G0 (programované souř.).
  setPos((parseFloat(prms.safeX) || 0) / (prms.mode === 'DIAMON' ? 2 : 1), parseFloat(prms.safeZ) || 0);
  // touch = true: cíl leží na kontuře/materiálu — poslední úsek sjezdu
  // (Vůle nad polotovarem) se jede pracovním posuvem, ne rychloposuvem.
  // forceUp = vždy vyjet NAD polotovar, přejet v Z a teprve najet (nikdy
  // diagonála mezi dvěma body kontury). Dokončování ho zapíná pro přejezd
  // mezi nedosažitelnými „ostrovy": rychloposuv podél čela je sice offsetově
  // 0,8 mm nad plochou (segmentHitsPath ho nevidí jako kolizi), ale vede
  // šikmo přes hlídanou zónu — dráha tam nesmí (jen kontura↔polotovar).
  // feedThroughStock: povolit exit-split (výjezd skrz stojící zbytek POSUVEM).
  // Default true pro order-dependent podélné retrakty (výjezd z hluboké kapsy/
  // zápichu skrz odlitkovou kůru). Čelní PŘEJEZDY ho vypínají (false) — tam je
  // dotyk se sousedním neobrobeným Z INHERENTNÍ šířkou nosu, ne order-dependent
  // kolize, a konverze na posuv by jen nafoukla čas (viz Fáze 4, face-casting).
  const safeRapidTo = (tx, tz, touch = false, forceUp = false, feedThroughStock = true) => {
    const sameX = Math.abs(tx - cur.x) < 1e-6;
    const sameZ = Math.abs(tz - cur.z) < 1e-6;
    if (sameX && sameZ) { setPos(tx, tz); return; }
    const emit = (txt) => { simCounter += 1; addN(txt, simCounter); };
    // Sjezd v X na cíl: s touch zastaví rychloposuv o vůli výš a dojede G1.
    const descendTo = (fromX) => {
      // Fáze 4: sjezd na hloubku v SOLIDNÍM odlitku posuvem, ne rychloposuvem.
      // Nájezdová vůle (zApprox) je „vzduch" jen vůči KONTUŘE — odlitkový obal
      // tam může být ještě plný, takže rychloposuv na cílovou hloubku vjede do
      // materiálu (na part-10-zapich ~13 mm² grazing). Když sjezd reálně naráží
      // na zbytek (STEJNÝ práh `rapidHitsStock` jako jinde → skin-grazing pod
      // prahem se nechytá, part-1..9 beze změny), zastav rapid na povrchu
      // zbytku + vůle a zbytek dojeď posuvem (radiální zápich).
      if (fromX - tx > 1e-6 && rapidHitsStock(fromX, tz, tx, tz)) {
        const surf = residualTopXAtZ(tz);
        if (surf !== null) {
          const floorX = Math.min(fromX, Math.max(tx, surf + rapidStopX));
          if (fromX - floorX > 1e-6) emit(`G0 X${xDia(floorX)}`);
          if (floorX - tx > 1e-6) emit(`G1 X${xDia(tx)} F${prms.feed}`);
          return;
        }
      }
      if (touch && fromX - tx > 1e-6) {
        if (fromX - tx > rapidStopX + 1e-6) emit(`G0 X${xDia(tx + rapidStopX)}`);
        emit(`G1 X${xDia(tx)} F${prms.feed}`);
      } else if (Math.abs(fromX - tx) > 1e-6) {
        emit(`G0 X${xDia(tx)}`);
      }
    };
    // Rychloposuvová část cíle: s touch končí rapid o vůli výš (zbytek
    // sjede posuvem) — proti zbytkovému polotovaru se testuje jen ona.
    const rTx = touch ? tx + rapidStopX : tx;
    if (forceUp || segmentHitsPath({ x: cur.x, z: cur.z }, { x: tx, z: tz }, rapidBlockers)
        || rapidHitsStock(cur.x, cur.z, rTx, tz)) {
      const xUp = Math.max(rapidTopX + rapidStopX, cur.x, tx);
      // Diagnostický seam (guarded, v produkci no-op — stejný vzor jako
      // `__REGION_LOG__`): svislý zdvih „Výjezd nad konturu" v X předpokládá nad
      // nástrojem vzduch, ale u odlitku (kůra nad zápichem / sousední neobrobené
      // Z u čela) může vést stojícím materiálem. Nastav `globalThis.__RAPID_LIFT
      // _LOG__ = []` a spusť pipeline v IZOLOVANÉM procesu (per fixture — singleton
      // S kontaminuje!) → plocha každého zdvihu skrz `rapidStock`. Změřené baseliny
      // a metoda: docs/geometry-libs-migration.md (Fáze 4). part-10 ~16 mm² =
      // order-dependent cíl budoucího plánovače, face-casting ~267 = inherentní.
      if (globalThis.__RAPID_LIFT_LOG__ && rapidStock && xUp > cur.x + 1e-6) {
        try {
          const sweep = toolSweep(rapidFootSlim, [{ x: cur.x, z: cur.z }, { x: xUp, z: cur.z }]);
          const a = Math.abs(polyArea(rapidStock.collide(sweep)));
          if (a > 0.3) globalThis.__RAPID_LIFT_LOG__.push({ fromX: +cur.x.toFixed(2), toX: +xUp.toFixed(2), z: +cur.z.toFixed(2), area: +a.toFixed(1) });
        } catch { /* seam je jen pro měření — chybu spolknout */ }
      }
      // Fáze 4 — exit-split (zrcadlo `descendTo`): svislý zdvih „Výjezd nad
      // konturu" (radiálně ven) předpokládá nad nástrojem vzduch, ale u odlitku
      // může vést stojící kůrou nad zápichem (order-dependent — materiál nad
      // nástrojem se ještě neobrobil; viz seam výše). Když zdvih reálně naráží na
      // zbytek (STEJNÝ práh `rapidHitsStock` jako descendTo → skin-grazing pod
      // prahem se nechytá, cylindry/part-1..9 bez konfliktu beze změny), vyjeď
      // POSUVEM až nad povrch zbytku (+ vůle), teprve pak zbytek rychloposuvem
      // vzduchem. Endpoint (xUp) i následný přejezd v Z beze změny — mění se jen
      // JAK se k xUp dojede (posuv místo rapidu skrz materiál).
      if (xUp > cur.x + 1e-6) {
        const surf = feedThroughStock && rapidStock && rapidHitsStock(cur.x, cur.z, xUp, cur.z)
          ? residualTopXAtZ(cur.z) : null;
        if (surf !== null && surf > cur.x + 1e-6) {
          const feedTop = Math.min(xUp, surf + rapidStopX);
          emit(`G1 X${xDia(feedTop)} F${prms.feed}${note('', 'Výjezd materiálem posuvem')}`);
          if (xUp > feedTop + 1e-6) emit(`G0 X${xDia(xUp)}${note('', 'Výjezd nad konturu')}`);
        } else if (surf !== null) {
          // Zbytek zdvih protíná, ale povrch na tomto Z je neznámý/pod nástrojem
          // → celý zdvih konzervativně posuvem (feed vzduchem je jen pomalý).
          emit(`G1 X${xDia(xUp)} F${prms.feed}${note('', 'Výjezd materiálem posuvem')}`);
        } else {
          emit(`G0 X${xDia(xUp)}${note('', 'Výjezd nad konturu')}`);
        }
      }
      if (Math.abs(tz - cur.z) > 1e-6) emit(`G0 Z${tz.toFixed(3)}`);
      // Fáze 4: čistě-Z přejezd, který se musel kvůli materiálu zvednout, se
      // NESMÍ sjet zpět na původní X — to X je přes tento Z právě to nebezpečné
      // (proto zvednutí), sjezd zpět by projel stojícím materiálem (odlitek za
      // zápichem) a hned by ho další nájezd zase zvedl. Nástroj zůstane nahoře;
      // navazující přejezd sjede rovnou na skutečnou hloubku (bod „nikdy
      // nejezdit dolů do materiálu, když se má jen přejet v Z“).
      if (sameX && xUp > tx + 1e-6) { setPos(xUp, tz); return; }
      descendTo(xUp);
    } else if (sameX) {
      emit(`G0 Z${tz.toFixed(3)}`);
    } else if (sameZ) {
      descendTo(cur.x);
    } else if (touch && cur.x - tx > 1e-6) {
      // Diagonální sjezd k materiálu: rychloposuvem jen na vůli nad cíl.
      if (cur.x - tx > rapidStopX + 1e-6) {
        emit(`G0 X${xDia(tx + rapidStopX)} Z${tz.toFixed(3)}`);
        emit(`G1 X${xDia(tx)} F${prms.feed}`);
      } else {
        emit(`G1 X${xDia(tx)} Z${tz.toFixed(3)} F${prms.feed}`);
      }
    } else {
      emit(`G0 X${xDia(tx)} Z${tz.toFixed(3)}`);
    }
    setPos(tx, tz);
  };

  calc.passes.forEach((pass, i) => {
    addCmt(`Průchod ${i + 1}${pass.pocketClean ? ' (dokončení kapsy)' : pass.pocketReposition ? ' (zanoření v kapse)' : pass.ramp ? ' (oblouk G3)' : pass.contourLeadIn ? ' (kapsa po kontuře)' : pass.contourLeadOut ? ' (bez schodků)' : ''}`);
    if (pass.type === 'long' && (pass.contourLeadIn || pass.ramp || pass.pocketClean)) {
      // Kapsa za bossem kontury: namísto odskoku a rychloposuvu přes
      // vršek polotovaru se kopíruje samotná kontura (G1/G2/G3) až k
      // bodu, kde její sklon dosáhne úhlu zanoření, odtud rampa pod
      // tímto úhlem na aktuální zaběr, dno kapsy a odskok.
      const li = pass.contourLeadIn || [];
      const entry = li.length > 0
        ? { x: li[0].x1, z: li[0].z1 }
        : (pass.ramp ? { x: pass.ramp.x0, z: pass.ramp.z0 } : { x: pass.x, z: pass.zStart });
      if (pass.pocketReposition) {
        // Dobrat kapsu najednou — návrat v kapse na pokračování rampy:
        //   1) ODSKOK pod 45° pryč od kontury o vzdálenost Odskok (stejně
        //      jako mimo kapsu) — zvednutí z řezu do už vyříznutého vzduchu,
        //   2) přejezd v ose Z NAD bod, kde má rampa pokračovat
        //      (rampFeedFrom = vršek minulého zápichu / konec minulé rampy),
        //   3) přísun v ose X na ten bod
        // a odtud pracovní rampa řeže jen nový úsek pod ním. Žádný výjezd
        // nad polotovar ani na roh (ten by jel skrz boss nad zápichem).
        const tgt = pass.rampFeedFrom || entry;
        const odskokZ = clipZGc(cur.z + rDistZ);
        simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)} Z${odskokZ.toFixed(3)}`, simCounter); setPos(cur.x + rDist, odskokZ);
        if (Math.abs(cur.z - tgt.z) > 1e-6) { simCounter += 1; addN(`G0 Z${tgt.z.toFixed(3)}`, simCounter); setPos(cur.x, tgt.z); }
        simCounter += 1; addN(`G0 X${xDia(tgt.x)}`, simCounter); setPos(tgt.x, tgt.z);
      } else if (pass.pocketClean) {
        const needMove = Math.abs(cur.x - entry.x) > 1e-6 || Math.abs(cur.z - entry.z) > 1e-6;
        if (pass.cleanApproach && needMove) {
          // Dokončení navazuje na poslední zanořovací zákrok: horní stěnu už
          // obrobily rampy, takže se jen ODSKOČÍ ode dna, přejede v Z nad
          // začátek nedobraného zbytku a přisune se k němu — žádný výjezd nad
          // boss ani přejezd přes už obrobenou stěnu.
          const odskokZ = clipZGc(cur.z + rDistZ);
          simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)} Z${odskokZ.toFixed(3)}`, simCounter); setPos(cur.x + rDist, odskokZ);
          if (Math.abs(cur.z - entry.z) > 1e-6) { simCounter += 1; addN(`G0 Z${entry.z.toFixed(3)}`, simCounter); setPos(cur.x, entry.z); }
          if (Math.abs(cur.x - entry.x) > 1e-6) { simCounter += 1; addN(`G0 X${xDia(entry.x)}`, simCounter); setPos(entry.x, entry.z); }
        } else if (needMove) {
          // Dokončení kapsy bez navázání: nájezd na začátek kontury (roh u
          // náběhu) musí jít BEZPEČNĚ NAD bossem — z dna kapsy přímo nahoru
          // by se řezalo skrz materiál. safeRapidTo zvedne v X nad konturu,
          // přejede v Z a teprve pak sjede k rohu.
          safeRapidTo(entry.x, entry.z, true);
        }
      } else if (Math.abs(cur.x - entry.x) > 1e-6 || Math.abs(cur.z - entry.z) > 1e-6) {
        // Sem se dostaneme jen když cur ≠ entry, tj. NEJDE o plynulé navázání
        // na předchozí otevřený řez (u toho by cur == entry a podmínka výše je
        // nepravdivá). Je to skok z odjezdu předchozího průchodu → nájezd musí
        // jít BEZPEČNĚ NAD konturou (safeRapidTo), ne řezným G1 přímo na entry —
        // ten by protnul konturu („kapsa po kontuře" projíždí konturou).
        safeRapidTo(entry.x, entry.z, true);
      }
      for (const seg of li) {
        if (seg.type === 'line') {
          simCounter += 1; addN(`G1 X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
        } else {
          simCounter += 1; addN(`${flipArc(seg.dir)} X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} ${arcR(seg.r)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
        }
      }
      if (pass.ramp) {
        // Rampa je DIAGONÁLNÍ feed (X i Z zároveň) pod úhlem zanoření — na
        // rozdíl od svislého řezu výše ji silueta odlitku může křížit VÍCKRÁT
        // podél délky (materiál-vzduch-materiál u odlitku s údolím pod rampou).
        // Vzorkuje se po ~0,2 mm (konvence dzScan) podél přímky (x0,z0)→(pass.x,
        // pass.zStart), segmenty stejného druhu (rapid/posuv) se slévají →
        // diagonální G0/G1 (stejný vzor jako safeRapidTo). Bez křížení siluety
        // (rampa celá v materiálu) vydá PŘESNĚ původní jeden `G1 X.. Z..`.
        const x0 = cur.x, z0 = cur.z, x1 = pass.x, z1 = pass.zStart;
        // Musí rampa DOLETĚT přesně na (pass.x, pass.zStart)? Jen když na ni
        // navazuje tělový řez (zStart≠zEnd) nebo leadOut — ty čtou `cur` a
        // potřebují přesnou polohu. Landing-only rampa (degenerovaná, žádný
        // leadOut, noRetract) nemá NIC, co by na přesném doletu záviselo —
        // příští průchod si stejně najede vlastním safeRapidTo odjinud
        // (jiná kapsa), takže dojíždět zbytek diagonály VZDUCHEM nad
        // drážkou je zbytečné: zkrátit na konec posledního řezného úseku.
        const needsExactLanding = pass.zStart - pass.zEnd > 1e-6 || !!pass.contourLeadOut;
        if (Math.abs(z1 - z0) < 1e-6) {
          simCounter += 1; addN(`G1 X${xDia(x1)} Z${z1.toFixed(3)}${note('', `Rampa ${entryAngleDegGc.toFixed(1)}°`)}`, simCounter); setPos(x1, z1);
        } else {
          const steps = Math.max(4, Math.ceil(Math.abs(z1 - z0) / 0.2));
          const pts = [];
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            pts.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t });
          }
          let segs = [];
          for (let s = 1; s < pts.length; s++) {
            const midX = (pts[s - 1].x + pts[s].x) / 2, midZ = (pts[s - 1].z + pts[s].z) / 2;
            // Hranice pro touch = silueta POSUNUTÁ o Vůli X/Z (stejná tečkovaná
            // hranice jako v náhledu), ne holá kůra odlitku — diagonální posuv
            // sahá až k vůli-zóně kolem materiálu (souhlasí s tím, kde končí
            // rychloposuv jinde: descendTo/safeRapidTo, exit-split u increment 1).
            const ct = castingTopXAtZOffset(midZ);
            const air = !(ct !== null && (midX - tipRGc) <= ct + 1e-4);
            const kind = air ? 'G0' : 'G1';
            if (segs.length && segs[segs.length - 1].kind === kind) segs[segs.length - 1].pt = pts[s];
            else segs.push({ kind, pt: pts[s] });
          }
          const g1RunCount = segs.filter(s => s.kind === 'G1').length;
          if (needsExactLanding && g1RunCount > 1) {
            // Reálná mezera v odlitku (materiál-vzduch-materiál), ne jen
            // vzorkovací šum na konci — diagonální rapid mezerou by vedl přes
            // 3D geometrii, kterou per-Z obálka (castingTopXAtZOffset) nevidí.
            // Dojet k PRVNÍMU dotyku, pak vyjet nad konturu (stejný vzor jako
            // jinde — „Výjezd nad konturu") a bezpečně najet na cíl (x1,z1)
            // přes safeRapidTo — místo hádání zbytku diagonály. Tahle větev
            // běží JEN když opravdu něco navazujícího čte přesnou polohu
            // (tělový řez/leadOut) — landing-only rampa (viz níž) nikdy dál
            // nejede, natož skáče jinam.
            const firstG1Idx = segs.findIndex(s => s.kind === 'G1');
            const headSegs = segs.slice(0, firstG1Idx + 1);
            headSegs.forEach((s, idx) => {
              simCounter += 1;
              const cmt = idx === firstG1Idx ? note('', `Rampa ${entryAngleDegGc.toFixed(1)}°`) : '';
              addN(s.kind === 'G0'
                ? `G0 X${xDia(s.pt.x)} Z${s.pt.z.toFixed(3)}${cmt}`
                : `G1 X${xDia(s.pt.x)} Z${s.pt.z.toFixed(3)}${cmt}`, simCounter);
              setPos(s.pt.x, s.pt.z);
            });
            safeRapidTo(x1, z1, true, true);
          } else {
            if (!needsExactLanding) {
              // Landing-only rampa (žádný tělový řez, žádný leadOut,
              // noRetract) — nic dál nepotřebuje přesnou polohu (x1,z1).
              // Zkrátit VŽDY na konec PRVNÍHO řezného úseku (ne posledního a
              // NIKDY jízdou/rychloposuvem přes safeRapidTo jinam) —
              // pokračovat dál diagonálou (nebo přeskočit na vzdálený cíl
              // x1/z1) by porušilo jednotné odebírání po vrstvách a
              // přejíždělo/dobíralo materiál, který patří JINÉMU, pozdějšímu
              // průchodu (reálný nález na díle uživatele — nechtěný skok na
              // vzdálenou kapsu uprostřed hrubování čela, navíc s kolizním
              // „upichovacím" doletem).
              const firstG1Idx = segs.findIndex(s => s.kind === 'G1');
              segs = firstG1Idx >= 0 ? segs.slice(0, firstG1Idx + 1) : [];
            } else if (segs.length && segs[segs.length - 1].kind === 'G0') {
              // Musí doletět přesně: poslední VZOREK (~0,2 mm krok z `pts`) vždy
              // posuv (touch), i vyjde-li vzduch — pass.x/zStart je cíl z PROFILU
              // dílu (offsetXAt), ne ze siluety odlitku, může padnout do „díry" v
              // odlitku. Navazující tělový řez/leadOut (vždy G1) by jinak splynul
              // přes hranici run s TÍMTO rapidem v jeden „dip". Cena je jen
              // poslední vzorkovací krok — pracuje se přímo s `pts`, ne se
              // smergovaným segmentem (ten může sahat přes víc kroků vzduchu).
              const lastPt = segs[segs.length - 1].pt; // == pts[pts.length - 1]
              const preLandPt = pts[pts.length - 2];
              const segStart = segs.length > 1 ? segs[segs.length - 2].pt : pts[0];
              const canShorten = Math.abs(segStart.x - preLandPt.x) > 1e-9 || Math.abs(segStart.z - preLandPt.z) > 1e-9;
              if (canShorten) {
                segs[segs.length - 1].pt = preLandPt;
                segs.push({ kind: 'G1', pt: lastPt });
              } else {
                segs[segs.length - 1].kind = 'G1';
              }
            }
            // Komentář „Rampa" patří na první ŘEZNÝ (G1) úsek, ne na vedoucí
            // rapid — jinak by na rapid řádku matoucně naznačoval řezání.
            const labelIdx = segs.findIndex(s => s.kind === 'G1');
            segs.forEach((s, idx) => {
              simCounter += 1;
              const cmt = idx === (labelIdx >= 0 ? labelIdx : segs.length - 1) ? note('', `Rampa ${entryAngleDegGc.toFixed(1)}°`) : '';
              addN(s.kind === 'G0'
                ? `G0 X${xDia(s.pt.x)} Z${s.pt.z.toFixed(3)}${cmt}`
                : `G1 X${xDia(s.pt.x)} Z${s.pt.z.toFixed(3)}${cmt}`, simCounter);
              setPos(s.pt.x, s.pt.z);
            });
          }
        }
      }
      if (pass.zStart - pass.zEnd > 1e-6) {
        simCounter += 1; addN(`G1 Z${pass.zEnd.toFixed(3)} F${prms.feed}`, simCounter); setPos(pass.x, pass.zEnd);
      }
      if (pass.contourLeadOut) {
        // Bez schodků / dokončení kapsy: po dně dál po kontuře (G1/G2/G3)
        // místo odskoku — druhá stěna se obrobí přímo po obrysu.
        for (const seg of pass.contourLeadOut) {
          if (seg.type === 'line') {
            simCounter += 1; addN(`G1 X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
          } else {
            simCounter += 1; addN(`${flipArc(seg.dir)} X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} ${arcR(seg.r)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
          }
        }
      }
      if (!pass.noRetract) {
        const zRetractVal = clipZGc(cur.z + rDistZ);
        simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)} Z${zRetractVal.toFixed(3)}`, simCounter); setPos(cur.x + rDist, zRetractVal);
      }
    } else if (pass.type === 'long' && pass.backside) {
      // Druhá strana (zleva): záběr VŽDY zleva, řez ve směru +Z (doprava).
      // Z pravé strany se najet nedá (narazil by držák / geometrie destičky).
      // Čistý přejezd bez kolizí — zvednout nad polotovar, přejet v Z na
      // levou hranu, zanořit, řez doprava, odskok doleva od kontury:
      //   G0 X<nad polotovar>          ; zvednout (čistý přejezd v Z)
      //   G0 Z<zEnd>                   ; přejezd k záběru (levá hrana)
      //   G0 X<hloubka+vůle> / G1 X<hloubka> ; zanoření
      //   G1 Z<zStart> F               ; řez +Z (doprava)
      //   G1 X<+odskok> Z<−odskok>     ; odskok DOLEVA od kontury
      const zEng = pass.zEnd;                 // záběr = levá hrana řezu
      const xSafe = rapidTopX + rapidStopX;   // X bezpečně nad polotovarem
      const emitB = (txt) => { simCounter += 1; addN(txt, simCounter); };
      if (cur.x < xSafe - 1e-6) { emitB(`G0 X${xDia(xSafe)}`); setPos(xSafe, cur.z); }
      if (Math.abs(cur.z - zEng) > 1e-6) { emitB(`G0 Z${zEng.toFixed(3)}`); setPos(cur.x, zEng); }
      if (cur.x - pass.x > rapidStopX + 1e-6) emitB(`G0 X${xDia(pass.x + rapidStopX)}`);
      emitB(`G1 X${xDia(pass.x)} F${prms.feed}`); setPos(pass.x, zEng);
      emitB(`G1 Z${pass.zStart.toFixed(3)} F${prms.feed}`); setPos(pass.x, pass.zStart);
      if (!pass.noRetract) {
        const zRetractVal = clipZGc(cur.z - rDistZ);
        emitB(`G1 X${xDia(cur.x + rDist)} Z${zRetractVal.toFixed(3)}`); setPos(cur.x + rDist, zRetractVal);
      }
    } else if (pass.type === 'long') {
      // Standardní podélné hrubování (vpravo → vlevo). Přijezd (sjezd v X) jde na
      // ZAČÁTEK POLOTOVARU — na Z, kde silueta odlitku reálně dosáhne hloubky
      // pass.x — NE na pass.zStart, který může ležet uprostřed drážky (intervaly
      // z obdélníkového obalu ignorují siluetu odlitku). Nad drážkou by se jinak
      // sjíždělo do vzduchu a teprve pak najíždělo k materiálu.
      //   G0 Z<hrana polotovaru + clearance>  ; rapid v Z nad ZAČÁTEK polotovaru
      //   G0 X<hloubka>                         ; sjezd k průměru U POLOTOVARU
      //   G1 Z<hrana> ; ... ; G1 Z<zEnd>        ; bezpečný dotek + řez (segmentovaný)
      //   G1 X<hloubka+odskok> Z<zEnd+odskok>   ; retract pod 45°
      // Řez zStart→zEnd navíc rozseká vnitřní drážky odlitku na rapid(vzduch)/
      // posuv(materiál). Bez drážek (řez celý v materiálu) = PŘESNĚ původní
      // `G1 Z zStart` + `G1 Z zEnd` → snapshoty bez drážek beze změny.
      const dir = pass.zEnd < pass.zStart ? -1 : 1;
      const zLo = Math.min(pass.zStart, pass.zEnd), zHi = Math.max(pass.zStart, pass.zEnd);
      // Práh = dosah STOPY nástroje, ne střed: nos (rádius tipRGc) sahá o R
      // hlouběji, takže řeže i když je střed pass.x kousek nad povrchem odlitku.
      const xReach = pass.x - tipRGc;
      const cross = castingCrossZ(xReach, zLo, zHi).filter(z => z > zLo + 1e-6 && z < zHi - 1e-6);
      let pts = [pass.zStart, ...cross, pass.zEnd].sort((p, q) => dir * (p - q));
      pts = pts.filter((z, i) => i === 0 || Math.abs(z - pts[i - 1]) > 1e-3);
      // Rapid jen VÝRAZNÝ vzduch ≥0,5 mm (drobné crossingy z tesselovaných oblouků
      // siluety neřež), sousední stejného typu slij → čistý výstup.
      const segs = [];
      for (let i = 1; i < pts.length; i++) {
        const ct = castingTopXAtZ((pts[i - 1] + pts[i]) / 2);
        const air = !(ct !== null && xReach <= ct + 1e-4) && Math.abs(pts[i] - pts[i - 1]) >= 0.5;
        const kind = air ? 'G0' : 'G1';
        if (segs.length && segs[segs.length - 1].kind === kind) segs[segs.length - 1].z = pts[i];
        else segs.push({ kind, z: pts[i] });
      }
      // Vedoucí vzduch (segs[0]=='G0') se NEřeže ani nepřejíždí uprostřed drážky —
      // přijede se rovnou na jeho konec = HRANA POLOTOVARU. Bez vedoucího vzduchu
      // je hrana = pass.zStart (původní chování, snapshoty beze změny).
      const leadAir = segs.length > 0 && segs[0].kind === 'G0';
      const firstCutZ = leadAir ? segs[0].z : pass.zStart;
      const emitSegs = leadAir ? segs.slice(1) : segs;
      const zApproachVal = clipZGc(firstCutZ + rapidStopZ);
      // Přejezd v Z nad začátek polotovaru + sjezd v X (s kontrolou kolize —
      // po zanoření do kapsy může nástroj stát hluboko, přímý přejezd by řízl stěnu).
      safeRapidTo(cur.x, zApproachVal);
      safeRapidTo(pass.x, zApproachVal);
      // Bezpečný dotek: sjezd přes clearance na hranu polotovaru pracovním posuvem.
      simCounter += 1; addN(`G1 Z${firstCutZ.toFixed(3)} F${prms.feed}`, simCounter); setPos(pass.x, firstCutZ);
      for (const s of emitSegs) {
        simCounter += 1;
        addN(s.kind === 'G0' ? `G0 Z${s.z.toFixed(3)}` : `G1 Z${s.z.toFixed(3)} F${prms.feed}`, simCounter);
        setPos(pass.x, s.z);
      }
      // Fáze 4: výjezd z materiálu do vzduchu — posuvem ještě o Vůli Z
      // za konec řezu, teprve pak odskok/rychloposuv. Jen u otevřeného
      // konce, za kterým skutečně NENÍ materiál (hrana polotovaru; stěnu
      // ani hranici rozsahu ověří test proti zbytkovému modelu).
      if (!pass.blocked && !pass.contourLeadOut && rapidStock) {
        const zExit = clipZGc(pass.zEnd - rapidClrZGc);
        if (zExit < pass.zEnd - 1e-6 && !rapidHitsStock(pass.x, pass.zEnd, pass.x, zExit)) {
          simCounter += 1; addN(`G1 Z${zExit.toFixed(3)} F${prms.feed}`, simCounter); setPos(pass.x, zExit);
        }
      }
      if (pass.contourLeadOut) {
        // Bez schodků: dál po kontuře (G1/G2/G3) až na hloubku dalšího
        // průchodu místo okamžitého odskoku — schod se obrobí přímo.
        for (const seg of pass.contourLeadOut) {
          if (seg.type === 'line') {
            simCounter += 1; addN(`G1 X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
          } else {
            simCounter += 1; addN(`${flipArc(seg.dir)} X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} ${arcR(seg.r)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
          }
        }
      }
      if (!pass.noRetract) {
        const zRetractVal = clipZGc(cur.z + rDistZ);
        simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)} Z${zRetractVal.toFixed(3)}`, simCounter); setPos(cur.x + rDist, zRetractVal);
      }
    } else {
      // Čelní hrubování (vzor shodný se sim cestou). Per-Z hodnoty:
      //   xStart = lokální casting outer + rapidClr (rapid-safe v tomto Z)
      //   xSurface = lokální casting outer (povrch polotovaru tady)
      //   G0 X<xStart>           ; rapid za polotovar v X (per-Z clearance)
      //   G0 Z<z>                ; rapid na cílovou hloubku
      //   G1 X<xSurface>         ; sjezd přes clearance na povrch polotovaru
      //                            už pracovním posuvem (bezpečný dotek)
      //   G1 X<xEnd> F<f>        ; čelní řez −X k bloku kontury
      //   G1 X<xEnd+odskok> Z<z+odskok>  ; retract pod 45°
      // Přejezdy s kontrolou kolize: nejdřív v X za polotovar, pak v Z.
      // feedThroughStock=false: čelní graze sousedního Z je inherentní (šířka
      // nosu), ne order-dependent — zůstává rychloposuvem (viz safeRapidTo).
      safeRapidTo(pass.xStart, cur.z, false, false, false);
      safeRapidTo(pass.xStart, pass.z, false, false, false);
      simCounter += 1; addN(`G1 X${xDia(pass.xSurface)} F${prms.feed}`, simCounter); setPos(pass.xSurface, pass.z);
      simCounter += 1; addN(`G1 X${xDia(pass.xEnd)} F${prms.feed}`, simCounter); setPos(pass.xEnd, pass.z);
      if (pass.contourLeadOut) {
        // Bez schodků: dál po kontuře (G1/G2/G3) v pásu Z∈[z−ap, z]
        // místo okamžitého odskoku — schod se obrobí přímo po obrysu.
        for (const seg of pass.contourLeadOut) {
          if (seg.type === 'line') {
            simCounter += 1; addN(`G1 X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
          } else {
            simCounter += 1; addN(`${flipArc(seg.dir)} X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} ${arcR(seg.r)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
          }
        }
      }
      // Retract pod úhlem odskoku do už obrobené strany: zprava +Z,
      // zleva −Z (drží pass.faceLeft). Když by diagonála zajela do kontury
      // NEBO do materiálu, který sousední (mělčí/zkrácený) průchod nechal
      // stát (stěna kapsy, hlídání destičky) → vyjet svisle jen v X.
      const dirZR = pass.faceLeft ? -1 : 1;
      // Sklon diagonály: na Z-posun dz připadá X-zdvih dz·(rDist/rDistZ);
      // u 90° (rDistZ=0) je odskok svislý a kontrola bezpředmětná.
      const rTan = rDistZ > 1e-9 ? rDist / rDistZ : Infinity;
      let retractGouges = false;
      for (let i = 1; i <= 8 && rDistZ > 1e-9 && !retractGouges; i++) {
        const dz = rDistZ * i / 8;
        const ox = gcOffsetXAt(cur.z + dirZR * dz);
        if (ox !== null && ox > cur.x + dz * rTan - 0.02) retractGouges = true;
      }
      // Zbytek materiálu na sousedních čelních rovinách (xEnd > offset).
      if (!retractGouges && rDistZ > 1e-9) {
        for (const p2 of calc.passes) {
          if (p2.type !== 'face') continue;
          const dz = dirZR * (p2.z - cur.z);
          if (dz <= 1e-6 || dz > rDistZ + 1e-6) continue;
          if (p2.xEnd > cur.x + dz * rTan - 0.02) { retractGouges = true; break; }
        }
      }
      if (retractGouges) {
        simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)}${note('', 'Výjezd v X (stěna)')}`, simCounter); setPos(cur.x + rDist, cur.z);
      } else {
        const zRetractVal = clipZGc(cur.z + (pass.faceLeft ? -rDistZ : rDistZ));
        simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)} Z${zRetractVal.toFixed(3)}`, simCounter); setPos(cur.x + rDist, zRetractVal);
      }
    }
    // Fáze 4: průchod je odsimulovaný — odebrat jeho materiál z modelu,
    // ať další rychloposuvy počítají s aktuálním zbytkem polotovaru.
    noteCutPass(pass);
  });

  // Návrat na bezpečnou polohu s kontrolou kolize (po zanoření do kapsy
  // by přímá diagonála mohla proříznout stěnu/konturu).
  safeRapidTo((parseFloat(prms.safeX) || 0) / (prms.mode === 'DIAMON' ? 2 : 1), parseFloat(prms.safeZ) || 0);

  // Dokončování: u druhé strany (zleva) se kontura trasuje OPAČNĚ —
  // zleva doprava (zprava nelze, narazil by držák / geometrie destičky),
  // stejně jako hrubování. Otočí se pořadí segmentů, u oblouků směr (G2↔G3)
  // a krajní úhly; napojení (chainBreak) se přepočítá.
  const finBackside = roughingKey(S) === 'backside';
  let finPath = calc.finishOffsetPath;
  if (finBackside) {
    finPath = calc.finishOffsetPath.slice().reverse().map(s => s.type === 'line'
      ? { ...s, p1: s.p2, p2: s.p1, chainBreak: false }
      : { ...s, dir: s.dir === 'G2' ? 'G3' : 'G2', startAngle: s.endAngle, endAngle: s.startAngle, p1: s.p2, p2: s.p1, refP1: s.refP2, refP2: s.refP1, chainBreak: false });
    for (let i = 1; i < finPath.length; i++) {
      const prevEnd = segEndPoint(finPath[i - 1]);
      const curStart = segStartPoint(finPath[i]);
      finPath[i].chainBreak = Math.hypot(curStart.x - prevEnd.x, curStart.z - prevEnd.z) > 1e-4;
    }
  }
  const firstGcFinSeg = finPath.find(s => !s.isDegenerate);
  // Výměna nástroje pro dokončování — jen pokud je nastaven jiný nástroj ze zásobníku
  const finSlotIdx = (prms.finishingSlot !== null && prms.finishingSlot !== undefined) ? prms.finishingSlot : null;
  const finSlotData = (finSlotIdx !== null && S.toolMagazine[finSlotIdx]) ? S.toolMagazine[finSlotIdx] : null;
  const finFeed  = finSlotData ? finSlotData.f  : prms.feed;
  const finSpeed = finSlotData ? finSlotData.vc : prms.speed;
  if ((prms.doFinishing || prms.finishOnly) && firstGcFinSeg) {
    addCmt('--- DOKONCOVANI ---');
    if (finSlotData) {
      // Bezpečná poloha před výměnou
      addN(`G0 X${prms.safeX} Z${prms.safeZ}${note('', 'Výjezd do bezpečné polohy')}`);
      if (prms.controlSystem === 'sinumerik') {
        addN(`T="${finSlotData.name}" D1 M6${note('', `Výměna na dokončovací nástroj T${finSlotData.slot}`)}`);
        addN(`G96 S${finSpeed} ${prms.machineType}${note('', 'Řezná rychlost – dokončování')}`);
      } else if (prms.controlSystem === 'fanuc') {
        const tNum = String(finSlotData.slot).padStart(2, '0');
        addN(`T${tNum}${tNum}${note('', `Výměna na T${finSlotData.slot} – dokončování`)}`);
        addN(`G96 S${finSpeed} M3${note('', 'Řezná rychlost – dokončování')}`);
      } else {
        addN(`T${finSlotData.slot} M6${note('', `Výměna na dokončovací nástroj T${finSlotData.slot}`)}`);
        addN(`G96 S${finSpeed} M3${note('', 'Řezná rychlost – dokončování')}`);
      }
      addN(`M3${note('', 'Vřeteno CW')}`);
    }
    const startSeg = firstGcFinSeg;
    const sX = startSeg.type === 'line' ? startSeg.p1.x : (startSeg.cx + Math.sin(startSeg.startAngle) * startSeg.r);
    const sZ = startSeg.type === 'line' ? startSeg.p1.z : (startSeg.cz + Math.cos(startSeg.startAngle) * startSeg.r);
    const sX_out = prms.mode === 'DIAMON' ? (sX * 2).toFixed(3) : sX.toFixed(3);
    // Nájezd pod úhlem entryAngle (úhel spodní strany destičky) —
    // G0 na přibližovací bod 2 mm v X a rampDz v Z mimo konturu,
    // G1 posuvem do startovního bodu kontury (gentle dotek).
    const finishApproachDx = 2;
    const finishRampDz = finishApproachDx / Math.tan(entryRadGc);
    // Rapid přibližovací bod ořežeme na čelisti/koník když jsou aktivní —
    // jinak by ramp s mělkým úhlem překročil limit (collision risk).
    // U backsidu se trasuje doprava, takže nájezdová ramp je z levé strany
    // (−Z), aby nájezd nešel proti směru řezu.
    const sZ_approachVal = clipZGc(sZ + (finBackside ? -finishRampDz : finishRampDz));
    // Nájezd na přibližovací bod s kontrolou kolize — přímá diagonála
    // z bezpečné polohy může u členité kontury proříznout offset.
    safeRapidTo(sX + finishApproachDx, sZ_approachVal);
    simCounter += 1; addN(`G1 X${sX_out} Z${sZ.toFixed(3)} F${finFeed}`, simCounter); setPos(sX, sZ);
    finPath.forEach(seg => {
      if (seg.isDegenerate) return;
      // chainBreak = samostatný řetěz (mezi konturami nic nenavazuje) —
      // najet rychloposuvem na jeho začátek místo řezného přejezdu mezerou.
      if (seg.chainBreak) {
        const sp = segStartPoint(seg);
        // touch: cíl leží na kontuře — poslední vůli dojet posuvem.
        // forceUp: mezi dosažitelnými ostrovy VŽDY výjezd nad polotovar +
        // přejezd Z + najetí — nikdy diagonála přes hlídanou zónu.
        safeRapidTo(sp.x, sp.z, true, true);
      }
      if (seg.type === 'line') {
        const eX = prms.mode === 'DIAMON' ? (seg.p2.x * 2).toFixed(3) : seg.p2.x.toFixed(3);
        simCounter += 1; addN(`G1 X${eX} Z${seg.p2.z.toFixed(3)}`, simCounter); setPos(seg.p2.x, seg.p2.z);
      } else {
        simCounter += 10;
        const eXv = seg.cx + Math.sin(seg.endAngle) * seg.r;
        const eZv = seg.cz + Math.cos(seg.endAngle) * seg.r;
        addN(`${flipArc(seg.dir)} X${xDia(eXv)} Z${eZv.toFixed(3)} ${arcR(seg.r)}`, simCounter);
        setPos(eXv, eZv);
      }
    });
    safeRapidTo((parseFloat(prms.safeX) || 0) / (prms.mode === 'DIAMON' ? 2 : 1), parseFloat(prms.safeZ) || 0);
  }

  buildControlTailLines(prms.controlSystem).forEach(line => addN(line));
  addCmt('--- KONTURA (Pro referenci) ---');
  S.contourPoints.forEach(p => {
    const cmd = (p.type === 'G2' || p.type === 'G3') ? flipArc(p.type) : p.type;
    let line = `${cmd} X${(parseFloat(p.x) || 0)} Z${(parseFloat(p.z) || 0)}`;
    if (p.type === 'G2' || p.type === 'G3') line += ` ${arcR(p.r)}`;
    addCmt(line);
  });
  return lines;
}
