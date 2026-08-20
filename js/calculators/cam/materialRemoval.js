// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – vizuální úběr materiálu při simulaci (Fáze 1          ║
// ║  migrace na Clipper2, viz docs/geometry-libs-migration.md)   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Polotovar se drží jako polygon (StockModel) a s postupem simulace se
// od něj odečítá stopa nástroje (Minkowského suma obrysu špičky podél
// projetých ŘEZNÝCH úseků simPath — rychloposuvy G0 materiál neberou).
// Simulátor pak zbývající polygon použije jako ořez (clip) vybarvení
// polotovaru, takže červená výplň vizuálně mizí tam, kudy nástroj projel.
//
// Souřadnice: stejné jako simPath — {x = poloměr [mm], z = axiálně [mm]},
// nezávislé na flipX/flipZ i machineStructure (to řeší až toScreen).

import { StockModel, toolSweep, polySimplify, polyOffset, polyUnion } from '../../geom/geomCore.js';
import { stockClearances, stockClearanceIsZero } from './camMath.js';
import { buildInsertProfileSegments } from './insertPreview.js';

/**
 * Zásah těla destičky v ose Z (od programovaného bodu k UŽ OBROBENÉ
 * straně) pro ČELNÍ hrubování. Podélně vrací 0 — tam se sousední
 * průchody skládají v ose X a hřebínky mezi nimi kryje radiální
 * prodloužení „stadionu" (viz toolFootprint níž), takže se model
 * nemění.
 *
 * Čelně se ale průchody skládají v ose Z s roztečí ap: pouhý půlkruh
 * špičky (šířka 2R) nechá mezi nimi stát hřebínek ap − 2R, který
 * fyzicky odstřihne tělo destičky. Bez tohohle prodloužení zůstávaly
 * hřebínky v modelu, držák jimi „projížděl" (oranžová stopa vnoření
 * přes celý díl) a rychloposuvy je braly jako materiál → zbytečný
 * výjezd nad polotovar před KAŽDÝM čelním průchodem.
 *
 * Rozsah: u upichováku šířka plátku od aktivního rádiusu (w − R) —
 * fyzická šířka břitu, kterou používá i hlídání upichováku
 * v roughingStrategies.js. U ostatních tvarů hloubka záběru (ap):
 * přesně dosáhne na střed rádiusu předchozího průchodu (překryv R),
 * dál se tělo destičky nemodeluje, aby se nezakrývaly reálné kolize.
 *
 * Sdílené i s hlídáním držáku v `roughingStrategies.js` (genFacePasses):
 * tenhle pás si destička vyčistí sama, takže se v něm držák nehlídá.
 *
 * @returns {number} kladný zásah v +z (0 = žádné prodloužení)
 */
export function insertBodyZ(prms, r = Math.max(parseFloat(prms.toolRadius) || 0.8, 0.05)) {
  if ((prms.roughingStrategy || 'longitudinal') !== 'face') return 0;
  if (prms.toolShape === 'parting') {
    const w = parseFloat(prms.toolLength) || 0;
    return w > 0 ? Math.max(w - r, 0) : 0;
  }
  return Math.max(parseFloat(prms.depthOfCut) || 0, 0);
}

/**
 * Plný obrys DESTIČKY ve SVĚTOVÝCH souřadnicích relativně ke špičce, jako
 * uzavřená smyčka {x,z}. Navzorkuje buildInsertProfileSegments (profil
 * {x,z}: 0,0 = špička, +z = k držáku) a mapuje do světa STEJNĚ jako
 * holderWorldLoop: profil.z → svět.x (radiálně), profil.x → svět.z·dir
 * (axiálně, backside zrcadlí). Round = kruh R, polygon/parting = tělo
 * destičky (šířka b). Null, když tvar nedává obrys (threading / degenerace).
 */
export function insertWorldLoop(prms, backside = false) {
  const segs = buildInsertProfileSegments(prms);
  if (!segs || segs.length === 0) return null;
  const dir = backside ? -1 : 1;
  const toWorld = (p) => ({ x: p.z, z: p.x * dir });
  const loop = [];
  const push = (p) => {
    const l = loop[loop.length - 1];
    if (!l || Math.hypot(l.x - p.x, l.z - p.z) > 1e-6) loop.push(p);
  };
  for (const s of segs) {
    if (s.type === 'circle') {
      const n = 48;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 2 * Math.PI;
        push(toWorld({ x: s.cx + Math.cos(a) * s.r, z: s.cz + Math.sin(a) * s.r }));
      }
    } else if (s.type === 'line') {
      push(toWorld(s.from)); push(toWorld(s.to));
    } else if (s.type === 'arc') {
      // Kratší úhlová cesta from→to (stejně jako kreslení: |d| ≤ π).
      const aF = Math.atan2(s.from.z - s.cz, s.from.x - s.cx);
      let aT = Math.atan2(s.to.z - s.cz, s.to.x - s.cx);
      let d = aT - aF;
      while (d <= -Math.PI) d += 2 * Math.PI;
      while (d > Math.PI) d -= 2 * Math.PI;
      const steps = Math.max(2, Math.ceil(s.r * Math.abs(d) / 0.3));
      for (let k = 0; k <= steps; k++) {
        const a = aF + d * (k / steps);
        push(toWorld({ x: s.cx + Math.cos(a) * s.r, z: s.cz + Math.sin(a) * s.r }));
      }
    }
  }
  // Uzavřít (odstranit shodný poslední bod).
  while (loop.length >= 2
    && Math.hypot(loop[0].x - loop[loop.length - 1].x, loop[0].z - loop[loop.length - 1].z) < 1e-6) loop.pop();
  return loop.length >= 3 ? loop : null;
}

/**
 * Obrys řezné části nástroje RELATIVNĚ k programovanému bodu dráhy
 * (= střed rádiusové kružnice špičky — viz kreslení plátku v draw()).
 *
 * PLÁNOVACÍ obrys — „stadion": spodní půlkruh rádiusu R +
 * obdélník nahoru (+x, k držáku) výšky max(2·ap, 3 mm) — u ní je půlkruh
 * přesný obrys a obdélník modeluje tělo nad ním. Prodloužení pokrývá tenké
 * hřebínky mezi sousedními průchody (rozteč ap > 2R), které by čistá
 * kružnice vizuálně nechávala stát — fyzicky je odstřihne tělo destičky.
 *
 * Čelně se stadion navíc protahuje v ose Z k obrobené straně (zprava
 * +Z, zleva −Z) o zásah těla destičky — viz insertBodyZ výš.
 */
export function toolFootprint(prms) {
  const r = Math.max(parseFloat(prms.toolRadius) || 0.8, 0.05);
  const H = Math.max((parseFloat(prms.depthOfCut) || 0) * 2, 3);
  const zBody = insertBodyZ(prms, r);
  const loop = [];
  // Tělo k obrobené straně (rovné dno na úrovni středu rádiusu — táž
  // konzervativní aproximace jako u hlídání upichováku).
  if (zBody > r) { loop.push({ x: H, z: zBody }); loop.push({ x: 0, z: zBody }); }
  else loop.push({ x: H, z: r });
  const n = 12;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI;    // 0..π přes spodek špičky
    loop.push({ x: -Math.sin(a) * r, z: Math.cos(a) * r });
  }
  loop.push({ x: H, z: -r });
  // Čelně zleva je obrobená strana na −Z: zrcadlit a OBRÁTIT pořadí,
  // ať smyčka drží stejnou orientaci (polyOffset ve `toolFootprintSlim`
  // by u obrácené smyčky zúžení otočil na rozšíření).
  if (zBody > r && prms.roughingSide === 'left')
    return loop.map(p => ({ x: p.x, z: -p.z })).reverse();
  return loop;
}

/**
 * PŘESNÝ obrys destičky pro VIZUÁLNÍ úběr (simulace).
 *
 * `toolFootprint` je plánovací aproximace (stadion) — u nekulaté destičky
 * proto zůstávaly po odebrání rádiusy i tam, kde řeže rovná hrana („mám
 * čtvereček, ale po odebrání vidím rádius"). Vizualizace může jít po
 * skutečném obrysu (`insertWorldLoop`) sjednoceném s obdélníkem nahoru
 * (tělo nad břitem, odstřihne hřebínky mezi průchody).
 *
 * PROČ NE I PRO PLÁNOVÁNÍ: skutečný obrys nakloněné destičky visí až
 * o (b·sin|natočení|) POD programovaným bodem — u b 10 mm a −15° je to
 * 3,2 mm. Rychloposuvy i validátor s tím dnes nepočítají (`rapidStopX`
 * zná jen vůli + rádius nosu), takže samotná výměna obrysu jen VYROBÍ
 * hlášení kolizí, které plánovač neumí obejít (změřeno: 0 → 12 nálezů,
 * 12 mm² na dílu uživatele). Nejdřív musí `rapidStopX` a hlídání
 * geometrie umět spodní hranu destičky; teprve pak sem.
 */
export function toolFootprintVisual(prms) {
  if (prms.toolShape === 'round') return toolFootprint(prms);
  const body = insertWorldLoop(prms, prms.roughingSide === 'left');
  if (!body || body.length < 3) return toolFootprint(prms);
  const H = Math.max((parseFloat(prms.depthOfCut) || 0) * 2, 3);
  const zMax = Math.max(...body.map(p => p.z)), zMin = Math.min(...body.map(p => p.z));
  const cap = [{ x: H, z: zMax }, { x: H, z: zMin }, { x: 0, z: zMin }, { x: 0, z: zMax }];
  const merged = polyUnion([body], [cap]);
  return (merged.length === 1 && merged[0].length >= 3) ? merged[0] : body;
}

/**
 * Týž obrys jako `toolFootprint`, jen ZÚŽENÝ o „bezpečnostní" hodnotu
 * (default 0,05 mm) — pro TESTY DOTYKU (rychloposuv × zbytek, kolize).
 * Bez zúžení hlásí každé legitimní dojetí na hranu materiálu falešný dotyk.
 *
 * Dělba (ÚKLID bod 3, 10. 8. 2026 — dřív se zúžení počítalo zvlášť
 * v `gcodeEmit.js` jako `rapidFootSlim` a v `collisionValidator.js` jako
 * `footShrunk`, obojí `polyOffset(-0,05)`, takže to VYPADALO jako dva různé
 * modely nástroje; ve skutečnosti jsou obrysy jen DVA):
 *   - PLNÝ obrys (`toolFootprint`) = čím se ODEBÍRÁ materiál,
 *   - ZÚŽENÝ (`toolFootprintSlim`) = čím se TESTUJE dotyk.
 * Obě strany (emise i validátor) tuhle dvojici používají shodně.
 *
 * Zbytkové nálezy 0,6–3 mm² tedy NEJSOU rozdílem obrysů: emise si zbytek
 * vede z PLÁNOVANÉ geometrie průchodů (`noteCutPass`), validátor z reálně
 * projeté `simPath`. Zúžit rozdíl lze jen menším `shrink`, což vrátí falešné
 * poplachy.
 */
export function toolFootprintSlim(prms, shrink = 0.05) {
  const foot = toolFootprint(prms);
  return polyOffset([foot], -shrink)[0] || foot;
}

/**
 * NAKRESLENÝ obrys polotovaru: válec = obdélník od osy, odlitek =
 * navzorkované stockPathSegments uzavřené k ose X=0 (otevřený profil
 * polotovaru končí na ose — viz stockTools.js). Vrací null, když
 * polotovar není k dispozici.
 *
 * ⚠ `Raw` v názvu je záměrné VAROVÁNÍ: pro PLÁNOVÁNÍ drah polotovar končí až
 * na offsetové čáře (Přídavek X/Z je v zadání proto, že odlitek MŮŽE být
 * větší), takže tam patří `stockPlanLoop` níž. Tenhle obrys odpovídá jen na
 * otázky „co je nakreslené / co tam FYZICKY stojí": validátor v syrovém
 * standardu, úběr pro další část programu (`opParts`), pás v `HolderGouge`.
 * Dřív se helper jmenoval `buildStockLoop` a bylo snadné sáhnout po něm
 * omylem — proto přejmenování (docs/cam-sjednoceni-polotovaru.md, krok 8).
 */
export function buildStockLoopRaw(prms, stockPathSegments) {
  if (prms.stockMode === 'cylinder') {
    const sRad = (parseFloat(prms.stockDiameter) || 0) / 2;
    const sLen = parseFloat(prms.stockLength) || 0;
    const sFace = parseFloat(prms.stockFace) || 0;
    if (sRad <= 0 || sLen + sFace <= 0) return null;
    return [
      { x: 0, z: sFace }, { x: sRad, z: sFace },
      { x: sRad, z: -sLen }, { x: 0, z: -sLen },
    ];
  }
  const segs = stockPathSegments || [];
  if (segs.length === 0) return null;
  const pts = [];
  const push = (p) => {
    const l = pts[pts.length - 1];
    if (!l || Math.hypot(l.x - p.x, l.z - p.z) > 1e-6) pts.push({ x: p.x, z: p.z });
  };
  for (const seg of segs) {
    if (seg.type === 'line') {
      push(seg.p1); push(seg.p2);
    } else if (seg.type === 'arc') {
      let sA = seg.startAngle, eA = seg.endAngle;
      if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
      if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
      const steps = Math.max(2, Math.min(48, Math.ceil(seg.r * Math.abs(eA - sA) / 0.4)));
      for (let j = 0; j <= steps; j++) {
        const a = sA + (eA - sA) * (j / steps);
        push({ x: seg.cx + Math.sin(a) * seg.r, z: seg.cz + Math.cos(a) * seg.r });
      }
    }
  }
  if (pts.length < 2) return null;
  // Uzavřít profil k ose soustružení (x = 0)
  const first = pts[0], last = pts[pts.length - 1];
  if (Math.abs(last.x) > 1e-6) pts.push({ x: 0, z: last.z });
  if (Math.abs(first.x) > 1e-6) pts.push({ x: 0, z: first.z });
  return pts;
}

/**
 * PLÁNOVACÍ (pesimistický) obrys polotovaru = silueta posunutá o Přídavek
 * X/Z polotovaru — táž „tečkovaná" čára, jakou kreslí náhled a na které
 * začíná posuv. Jediná implementace pro celý CAM (ÚKLID 8. 8. 2026, viz
 * docs/geometry-libs-migration.md): dřív byla zkopírovaná v gcodeEmit.js
 * i roughingStrategies.js.
 *
 * Proč OFFSET a ne syrový obrys: Přídavek polotovaru je v zadání právě
 * proto, že odlitek MŮŽE být větší — materiál až k té čáře tedy reálně
 * existovat může a dráhy se musí plánovat pesimisticky. Syrový obrys
 * zůstává jen pro otázky „narazil jsem FYZICKY?" (collisionValidator)
 * a „co je vidět" (MaterialRemoval níž).
 *
 * Posouvá se přes `polyOffset` (Clipper), ne po-bodovou normálou: ta by na
 * ostrých hranách/schodech siluete (odlitek s bosem/zápichem) zkreslovala
 * roh lineární interpolací mezi posunutými vrcholy místo skutečného
 * zaobleného přechodu. VůleX ≠ VůleZ (anizotropní) se řeší měřítkem osy Z
 * (poměr VůleX/VůleZ), izotropním offsetem o VůleX a měřítkem zpět —
 * ekvivalentní eliptickému posunu (ΔX/VůleX)² + (ΔZ/VůleZ)² = 1.
 *
 * POZOR (známá mez): z výsledku se bere jen komponenta `[0]`, takže
 * u složitého obrysu odlitku, který se offsetem rozpadne na víc kusů,
 * může minout ten správný. Dnes to nikde neškodí (spotřebitelé dopřesňují
 * půlením), ale je to jediné místo, kde to jde opravit.
 *
 * @returns {Array<{x:number,z:number}>|null} posunutá smyčka, null při selhání
 */
export function offsetStockLoop(loop, prms) {
  if (!loop) return null;
  // Přídavek X/Z (polo.) = 0 → žádná offsetová čára se nehledá, plánovacím
  // obrysem JE polotovar tak, jak je nakreslený (vědomé zadání uživatele
  // „polotovar je přesně tady"). Degenerovaný případ, ve kterém obě čáry
  // splývají — viz stockClearanceIsZero v camMath.js.
  if (stockClearanceIsZero(prms)) return loop;
  const { x: clrX, z: clrZ } = stockClearances(prms);
  if (Math.abs(clrX - clrZ) < 1e-6) return polyOffset([loop], clrX)[0] || null;
  const kZ = clrX / clrZ;
  const scaled = loop.map(p => ({ x: p.x, z: p.z * kZ }));
  const off = polyOffset([scaled], clrX)[0];
  return off ? off.map(p => ({ x: p.x, z: p.z / kZ })) : null;
}

/**
 * POLOTOVAR PRO PLÁNOVÁNÍ = nakreslený obrys posunutý o Přídavek X/Z, tedy
 * „tečkovaná" offsetová čára z náhledu. Tam polotovar KONČÍ (rozhodnutí
 * uživatele 20. 8. 2026: *„obrobek je celý i s tou offsetovou čarou"*).
 *
 * Zkratka za `offsetStockLoop(buildStockLoopRaw(…))` s fallbackem na syrový
 * obrys, když Clipper selže. Ta dvojice se dřív psala ad hoc na čtyřech
 * místech (`planLoopFC`, validátor, tečkovaná čára v náhledu, MaterialRemoval)
 * a pokaždé se musel znovu ošetřit null.
 *
 * Nulový Přídavek X i Z → `offsetStockLoop` vrací vstup, obě čáry splývají.
 *
 * @returns {Array<{x:number,z:number}>|null} null, když polotovar není
 */
export function stockPlanLoop(prms, stockPathSegments) {
  const raw = buildStockLoopRaw(prms, stockPathSegments);
  return raw ? (offsetStockLoop(raw, prms) || raw) : null;
}

/**
 * Stav úběru pro jeden výpočet drah (calc.simPath). Drží zbývající
 * polotovar a index, kam až je dráha „projetá"; advanceTo() dořeže
 * jen nový úsek (inkrementálně), při přetočení zpět přepočítá od nuly.
 */
export class MaterialRemoval {
  /**
   * @param {object} prms parametry CAM
   * @param {Array} stockPathSegments silueta odlitku (u válce se ignoruje)
   * @param {{planningOutline?: boolean}} [opts] `planningOutline` = základem
   *   je OFFSETOVÁ (vůlí-posunutá) čára, ne syrový obrys. Odlitek může být
   *   až u té čáry — pro uživatele je to taky materiál na obrábění
   *   („polotovar končí až kde je offsetová čára“, 19. 8. 2026), takže
   *   náhled s tímhle příznakem ukáže i pás mezi oběma čárami. Odpověď na
   *   otázku „narazil jsem FYZICKY?“ (`validateToolpath`) i úběr pro další
   *   část programu (`opParts`) zůstávají na SYROVÉM obrysu — tam se
   *   příznak nepoužívá.
   */
  constructor(prms, stockPathSegments, opts = {}) {
    const raw = buildStockLoopRaw(prms, stockPathSegments);
    this.rawLoop = raw;
    this.baseLoop = (opts.planningOutline && raw) ? (offsetStockLoop(raw, prms) || raw) : raw;
    this.foot = toolFootprintVisual(prms);
    this.reset();
  }

  get valid() { return !!this.baseLoop; }

  reset() {
    this.model = this.baseLoop ? new StockModel([this.baseLoop]) : null;
    this.upto = 0;      // float index v simPath, kam až je odřezáno
    this._cuts = 0;     // počítadlo řezů kvůli periodickému simplify
  }

  /**
   * Posune úběr na `floatIndex` (= S.simProgress * (simPath.length − 1)).
   * Vrací StockModel zbývajícího materiálu (nebo null, když není polotovar).
   */
  advanceTo(simPath, floatIndex) {
    if (!this.model || !simPath || simPath.length < 2) return this.model;
    if (floatIndex < this.upto - 1e-9) this.reset();          // přetočení zpět
    if (floatIndex <= this.upto + 1e-9) return this.model;    // nic nového

    const last = simPath.length - 1;
    const pointAt = (fi) => {
      const i = Math.min(Math.floor(fi), last - 1);
      const t = fi - i;
      const a = simPath[i], b = simPath[i + 1];
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    };

    // Souvislé řezné běhy (G1/G2/G3…) mezi upto a floatIndex; G0 běh utne.
    const runs = [];
    let run = null;
    const i0 = Math.floor(this.upto);
    const i1 = Math.min(Math.floor(floatIndex), last - 1);
    for (let i = i0; i <= i1; i++) {
      const a = Math.max(i, this.upto), b = Math.min(i + 1, floatIndex);
      if (b - a < 1e-12) continue;
      if ((simPath[i + 1].type || 'G0') === 'G0') { run = null; continue; }
      const pa = pointAt(a), pb = pointAt(b);
      if (!run) { run = [pa]; runs.push(run); }
      const lastPt = run[run.length - 1];
      if (Math.hypot(pb.x - lastPt.x, pb.z - lastPt.z) > 1e-9) run.push(pb);
    }

    const cutLoops = [];
    for (const r of runs) {
      if (r.length >= 2) cutLoops.push(...toolSweep(this.foot, r));
    }
    if (cutLoops.length > 0) {
      this.model.cut(cutLoops);
      // Rozdíly postupně přidávají vrcholy — periodicky zjednodušit,
      // ať kreslení i další řezy zůstanou rychlé (ε hluboko pod tolerancí).
      if (++this._cuts % 24 === 0)
        this.model.loops = polySimplify(this.model.loops, 0.002);
    }
    this.upto = floatIndex;
    return this.model;
  }
}
