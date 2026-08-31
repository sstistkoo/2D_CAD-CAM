// ╔═══════════════════════════════════╗
// ║  OPERACE: EMISE DOKONČOVÁNÍ            ║
// ╚═══════════════════════════════════╝
// Vyňato z `cam/gcodeEmit.js` (rozdělení podle OPERACÍ, plán §3.A).
// Dokončovací PRŮCHOD po hotovní kontuře — běží AŽ ZA hrubováním, v témže
// programu a od téže polohy nástroje.
//
// PROČ JEDEN PARAMETR `E` A NE DVACET: emise je jedna souvislá procedura.
// Dokončování sdílí s hrubováním živou polohu nástroje (`cur`/`setPos`),
// číslování bloků (`addN`), model zbytkového polotovaru (`rapidStock`)
// i počítadlo simulačních bodů. Kdyby se to rozpadlo na samostatné
// parametry, byla by z toho dvacetiprvková signatura, která stejně jen
// maskuje, že ta vazba existuje. `E` je tedy sdílené EMISNÍ PROSTŘEDÍ,
// ne náhodný pytel.
//
// `cur` je objekt mutovaný `setPos()` — předává se referencí. `simCounter`
// se bere jako VSTUPNÍ hodnota (musí navazovat na hrubování) a zpět se
// nevrací: za dokončováním už ho nikdo nečte.

import { StockModel, polyArea, polyDifference, polyOffset, toolSweep } from '../../../geom/geomCore.js';
import { segEndPoint, segStartPoint } from '../camMath.js';
import { holderWorldLoop } from '../collisionValidator.js';
import { offsetSilhouetteLoop } from '../toolEnvelope.js';
import { roughingKey } from '../calculatePipeline.js';

/**
 * @param E  sdílené emisní prostředí z `generateAutoGCode()`
 */
export function emitFinish(E) {
  const {
    S, calc, prms, addCmt, addN, note, arcR, flipArc, xDia, clipZGc,
    safeRapidTo, setPos, cur, rapidStock, rapidFoot, residualTopXAtZ,
    maxXOnSegsAt, entryRadGc,
  } = E;
  let simCounter = E.simCounter;
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
// ── Držák vs. NEVYHRUBOVANÝ ZBYTEK polotovaru ─────────────────────
// Pipeline hlídá u dokončování držák proti FINÁLNÍ kontuře: geometrická
// dosažitelnost hotového tvaru, která nezná pořadí obrábění. Co po
// hrubování navíc zůstalo stát (klín za bossem, kam se destička
// nedostala; úseky mimo rozsah Z), ví až dynamický model `rapidStock`.
// Úseky, kde by držák jel v TOMHLE zbytku, se zahodí těsně před emisí —
// jinak je jako kolizi najde až validátor drah (⛔ panel) na hotovém
// programu.
//
// Testuje se JEN zbytek NAD hotovým tvarem (rapidStock − kontura
// rozšířená o přídavek), ne celý zbývající materiál. Obojí by se totiž
// překrývalo s kontrolou v pipeline a přidalo její falešné poplachy:
// u čelního obrábění k ose leží nakreslený držák těsně nad špičkou a
// s TĚLEM DÍLU se protíná principiálně (inherentní kolize modelu, viz
// hrubovací průchody u čela) — dokončování čela by tím zmizelo celé,
// přestože o zbytek polotovaru vůbec nejde.
//
// Model se v průběhu KLONU odebírá: dokončovací úsek sundá svůj materiál
// a další úsek řetězu ho tedy už nevidí. Skutečný `rapidStock` zůstává
// netknutý — rychloposuvy uvnitř dokončování tak dál plánují proti stavu
// po hrubování (konzervativní strana).
if ((prms.doFinishing || prms.finishOnly) && prms.respectInsertGeometry && rapidStock) {
  const holderLoop = holderWorldLoop(prms, finBackside);
  const holderShrunk = holderLoop ? (polyOffset([holderLoop], -0.05)[0] || holderLoop) : null;
  const partLoop = offsetSilhouetteLoop(calc.contourSegments);
  if (holderShrunk && partLoop) {
    // Hotový tvar + přídavek = materiál, který tam po hrubování BÝT MÁ.
    const alw = Math.max(parseFloat(prms.allowanceX) || 0, parseFloat(prms.allowanceZ) || 0)
      + (parseFloat(prms.finishAllowance) || 0) + 0.05;
    let leftover = [];
    try {
      leftover = polyDifference(rapidStock.loops, polyOffset([partLoop], alw, 'miter'));
    } catch { leftover = []; }
    const finStock = new StockModel(leftover);
    const segPts = (s) => {
      if (s.type === 'line') return [{ x: s.p1.x, z: s.p1.z }, { x: s.p2.x, z: s.p2.z }];
      let sA = s.startAngle, eA = s.endAngle;
      if (s.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
      if (s.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
      const n = Math.max(2, Math.min(48, Math.ceil(s.r * Math.abs(eA - sA) / 0.5)));
      const pts = [];
      for (let k = 0; k <= n; k++) {
        const a = sA + (eA - sA) * (k / n);
        pts.push({ x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r });
      }
      return pts;
    };
    const kept = [];
    let breakNext = false, finStockDropped = 0;
    for (const seg of finPath) {
      if (seg.isDegenerate) continue;
      const pts = segPts(seg);
      let area = 0;
      try { area = Math.abs(polyArea(finStock.collide(toolSweep(holderShrunk, pts)))); } catch { area = 0; }
      if (area > 0.5) { breakNext = true; finStockDropped++; continue; }
      try { finStock.cut(toolSweep(rapidFoot, pts)); } catch { /* model je jen pro plánování */ }
      const out = { ...seg };
      if (breakNext) { out.chainBreak = true; breakNext = false; }
      kept.push(out);
    }
    if (finStockDropped > 0) {
      finPath = kept;
      // Hlášení z EMISE (ne z calculate) — fullUpdate() ho po přepočtu
      // připojí zpět do ⚠ panelu, viz S.genNotes v camSimulator.js.
      S.genNotes.push({ type: 'warning', msg: `Hlídání geometrie (držák): dokončování vynechá ${finStockDropped} úsek(ů) — vedou přes NEVYHRUBOVANÝ zbytek polotovaru (držák by do něj narazil). Vyhrubujte ho z druhé strany / jiným nástrojem.` });
    }
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
  // Nájezd pod úhlem entryAngle (úhel spodní strany destičky) —
  // G0 na přibližovací bod 2 mm v X a rampDz v Z mimo konturu,
  // G1 posuvem do startovního bodu kontury (gentle dotek).
  const finishApproachDx = 2;
  const finishRampDz = finishApproachDx / Math.tan(entryRadGc);
  // Poloměr, na který špička ŘEŽE, je o rádius destičky pod středem —
  // střed jede po offsetu (kontura + R), materiál se odebírá po X−R.
  const finTipR = Math.max(parseFloat(prms.toolRadius) || 0, 0);
  // Strop záběru ROVNÉHO PRŮMĚRU: ten materiál nad hotovým tvarem ubírat
  // MÁ (proto vzniká), ale nejvýš o jednu hloubku třísky — nad ní už to
  // není dokončování, ale hrubování do neobrobené oblasti, a ta patří
  // druhému upnutí/nástroji.
  const finMaxCut = Math.abs(parseFloat(prms.depthOfCut) || 0) || 1;
  // Strop záběru NÁJEZDOVÉ RAMPY je jiný: ta má do plochy jen jemně
  // dosednout, takže smí ukrojit pouze přídavkovou slupku, kterou
  // dokončování stejně sundává. Kdyby platil strop rovného průměru,
  // projede rampa klínem, který po sobě nechalo zanoření hrubování
  // (nález uživatele: N2460 „zajelo se mi to do materiálu" — přes 1,2 mm
  // třísky celou délkou rampy).
  const finRampCut = Math.max(parseFloat(prms.allowanceX) || 0, parseFloat(prms.allowanceZ) || 0)
    + (parseFloat(prms.finishAllowance) || 0) + 0.05;
  // Tolerance pro otázku „stojí tu ještě materiál?". Zbytkový model
  // (`rapidStock`) se plní z průchodů (`noteCutPass`), a u těch, které
  // sledují konturu, registruje řez, jako by nástroj jel po HOTOVNÍ čáře,
  // ne po hrubovací offsetové — povrch pak hlásí až o přídavek níž, než
  // po hrubování reálně zůstal (naměřeno 27,044 místo 27,441 na oblouku
  // R6 dílu uživatele, rozdíl = přesně přídavek X). Bez téhle tolerance
  // rovný průměr skončí (nebo vůbec nezačne) o kus dřív, než má.
  const finTopEps = finRampCut;
  // Směr řezu: u backsidu se trasuje doprava (+Z), jinak doleva (−Z).
  const finDirZ = finBackside ? 1 : -1;
  // Hotovní offset kontury (obrobitelný i nedosažitelný dohromady) = mez,
  // kam smí STŘED špičky při dokončování. Nájezdová rampa i rovný výjezd
  // se o ni musí zastavit, jinak zajedou do hotového dílu (kontura, která
  // se za koncem řetězu nebo před jeho začátkem zvedá).
  const finProfileXAt = (z) => maxXOnSegsAt(
    [...(calc.finishOffsetPath || []), ...(calc.finishUnreachablePath || [])], z);
  const finAlw = Math.max(parseFloat(prms.allowanceX) || 0, parseFloat(prms.allowanceZ) || 0)
    + (parseFloat(prms.finishAllowance) || 0);
  // „Stojí před nástrojem na téhle Z-souřadnici ještě materiál?"
  // Měřeno z HOTOVNÍ KONTURY + PŘÍDAVKU, tedy z toho, co tam po hrubování
  // být MÁ — ne ze zbytkového modelu. Ten se u průchodů sledujících
  // konturu mýlí o přídavek (viz finTopEps), takže rovný průměr podle něj
  // končil dřív, než materiál doopravdy končí (na oblouku R6 dílu
  // uživatele o 1,3 mm před jeho offsetovou čárou). Kde kontura není
  // (za čelem dílu, za koncem polotovaru), rozhoduje zbytkový model.
  const finHasStockAt = (z, xTool) => {
    const prof = finProfileXAt(z);
    if (prof !== null) return prof > xTool - finAlw;
    const top = residualTopXAtZ(z);
    return top !== null && top > xTool - finTipR - finTopEps;
  };
  // Koridor nájezdové rampy je volný? Rampa jde ŠIKMO shora do plochy —
  // kdyby v ní stál materiál (kraj nedosažitelné oblasti, nevyhrubovaný
  // klín), vjela by do něj plnou hloubkou; a kdyby zasahovala pod hotovní
  // offset, zajela by do už obrobené plochy.
  // POZOR na cílový bod (t = 1): ten LEŽÍ na kontuře, takže materiál v jeho
  // Z-rovině je z definice — u čela k ose dokonce celé tělo dílu. Testovat
  // ho nemá smysl a zablokovalo by to úplně každý nájezd na čelo.
  const finRampClear = (x0, z0, x1, z1) => {
    if (!rapidStock) return false;
    const N = 16;
    for (let k = 0; k < N; k++) {
      const t = k / N;
      const xMid = x0 + (x1 - x0) * t, zMid = z0 + (z1 - z0) * t;
      const prof = finProfileXAt(zMid);
      if (prof !== null && prof > xMid + 0.02) return false;
      const top = residualTopXAtZ(zMid);
      if (top !== null && top > xMid - finTipR + finRampCut) return false;
    }
    return true;
  };
  // ROVNÝ PRŮMĚR NA ZAČÁTKU ŘETĚZU (zrcadlo `finRunOut`). Řetěz začíná tam,
  // kde předchozí kus kontury nešel udělat celý; před ním ale často ještě
  // stojí materiál. Místo šikmé rampy do bodu startu se dráha natáhne PROTI
  // směru řezu na téže hloubce, dokud z materiálu nevyjede — nástroj pak do
  // dílu vjede jeho HRANOU a rovným průměrem, přesně jak se soustruží ručně.
  // Jen u VÁLCOVÉHO úseku (přímka rovnoběžná se Z): rovný průměr je
  // pokračování válce. U oblouku nebo čela by vznikl cizí válcový pahýl,
  // tam zůstává rampa. Vrací Z začátku, nebo null (nedá se).
  const finRunInZ = (seg, tx, tz) => {
    if (!rapidStock || seg.type !== 'line' || Math.abs(seg.p2.x - seg.p1.x) > 0.05) return null;
    const xCut = tx - finTipR;
    for (let d = 0.5; d <= 400; d += 0.5) {
      const zRaw = tz - finDirZ * d;
      const z = clipZGc(zRaw);
      if (Math.abs(z - zRaw) > 1e-6) return null;                // useknuto limitem
      const prof = finProfileXAt(z);
      if (prof !== null && prof > tx + 0.02) return null;         // kontura se zvedá
      const top = residualTopXAtZ(z);
      if (top !== null && top > xCut + finMaxCut) return null;    // moc velký záběr
      if (!finHasStockAt(z, tx)) return d < 0.7 ? null : z;        // hrana materiálu
    }
    return null;
  };
  // NÁJEZD NA ZAČÁTEK ŘETĚZU. Svislý dosednutí v X (dřívější chování pro
  // navazující řetězy) končí bodovým dotykem na hotové ploše — v reálu tam
  // zůstane ryska. Najíždí se proto rampou ZE STRANY, ODKUD SE ŘEŽE (u
  // backsidu zleva), aby nástroj do materiálu vjel ve směru řezu. Když
  // koridor rampy volný není, zůstává svislý dojezd (bezpečnost > povrch).
  const finLeadIn = (seg, tx, tz, withFeed) => {
    const zIn = finRunInZ(seg, tx, tz);
    if (zIn !== null) {
      // Cíl leží ZA hranou materiálu (vzduch), takže se tam smí rychloposuv.
      safeRapidTo(tx, zIn, false, !withFeed);
      simCounter += 1;
      addN(`G1 X${xDia(tx)} Z${tz.toFixed(3)}${withFeed ? ` F${finFeed}` : ''}${note('', 'Rovný průměr (nájezd hranou materiálu)')}`, simCounter);
      setPos(tx, tz);
      return;
    }
    return finLeadInRamp(tx, tz, withFeed);
  };
  const finLeadInRamp = (tx, tz, withFeed) => {
    const zApp = clipZGc(tz - finDirZ * finishRampDz);
    const xApp = tx + finishApproachDx;
    if (finRampClear(xApp, zApp, tx, tz)) {
      // Nájezd na přibližovací bod s kontrolou kolize — přímá diagonála
      // z bezpečné polohy může u členité kontury proříznout offset.
      safeRapidTo(xApp, zApp, false, !withFeed);
      simCounter += 1;
      addN(`G1 X${xDia(tx)} Z${tz.toFixed(3)}${withFeed ? ` F${finFeed}` : ''}`, simCounter);
      setPos(tx, tz);
      return;
    }
    // touch: cíl leží na kontuře — poslední vůli dojet posuvem.
    // forceUp: VŽDY výjezd nad polotovar + přejezd Z + najetí, nikdy
    // diagonála přes hlídanou zónu (rampa se zahodila právě proto, že
    // koridor k cíli není čistý).
    safeRapidTo(tx, tz, true, true);
    if (withFeed) { simCounter += 1; addN(`G1 X${xDia(tx)} Z${tz.toFixed(3)} F${finFeed}`, simCounter); setPos(tx, tz); }
  };
  // ROVNÝ PRŮMĚR NA KONCI ŘETĚZU. Řetěz končí tam, kde další kus kontury
  // není celý dosažitelný — a ten se podle pravidla „celý, nebo vůbec"
  // vynechává. Zbylý materiál před nástrojem se místo toho dobere přímým
  // pohybem v ose Z na téže hloubce: vznikne rovný průměr, ne pahýl
  // uprostřed rádiusu. Jede se, dokud před nástrojem stojí materiál a
  // dokud se pod dráhou nezvedá kontura (zajetí do hotového dílu).
  //
  // CELÝ, NEBO VŮBEC i tady: rovný průměr má smysl jen tehdy, když z
  // materiálu skutečně VYJEDE. Zastavení o strop záběru nebo o limit
  // rozsahu by po sobě nechalo pahýl uprostřed materiálu — horší než
  // neudělat nic. Proto se celá trasa nejdřív prověří a teprve pak emituje.
  const finRunOut = () => {
    if (!rapidStock || cur.x === null) return;
    const x = cur.x, xCut = cur.x - finTipR;
    let zEnd = null;
    for (let d = 0.5; d <= 400; d += 0.5) {
      const zRaw = cur.z + finDirZ * d;
      const z = clipZGc(zRaw);
      if (Math.abs(z - zRaw) > 1e-6) return;                    // useknuto limitem
      const prof = finProfileXAt(z);
      if (prof !== null && prof > x + 0.02) return;             // kontura se zvedá
      const top = residualTopXAtZ(z);
      if (top !== null && top > xCut + finMaxCut) return;        // moc velký záběr
      if (!finHasStockAt(z, x)) { zEnd = z; break; }             // vyjel z materiálu
    }
    if (zEnd === null || Math.abs(zEnd - cur.z) < 0.2) return;
    simCounter += 1;
    addN(`G1 X${xDia(x)} Z${zEnd.toFixed(3)}${note('', 'Rovný průměr (zbytek nejde dokončit celý)')}`, simCounter);
    setPos(x, zEnd);
  };
  // ── STROP HLOUBKY DOKONČOVACÍHO ŘEZU ──────────────────────────────
  // Dokončovací dráha jede po hotovní čáře a počítá s tím, že hrubování
  // před ní nechalo jen přídavek. Kde hrubování NEDOSÁHLO (konec průchodů
  // u nedosažitelné oblasti, klín mezi schody), stojí materiálu mnohem víc
  // a dokončovací úsek ho projede plnou hloubkou: na dílu uživatele
  // ubral jeden válec 68,6 mm² místo očekávaných ~40, z toho 29 mm² na
  // posledních 4 mm — tříska až 14 mm dokončovacím nožem. A odjezd z
  // takového konce pak musí ven skrz materiál posuvem.
  // Úsek se proto uřízne tam, kde materiál překročí hloubku třísky (ap):
  // dokončí se to, co je připravené, zbytek patří další operaci.
  const finDeepCut = (s) => {
    const pts = [], N = s.type === 'line'
      ? Math.max(2, Math.ceil(Math.hypot(s.p2.x - s.p1.x, s.p2.z - s.p1.z) / 0.5))
      : 24;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      if (s.type === 'line') pts.push({ t, x: s.p1.x + (s.p2.x - s.p1.x) * t, z: s.p1.z + (s.p2.z - s.p1.z) * t });
      else {
        let sA = s.startAngle, eA = s.endAngle;
        if (s.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
        if (s.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
        const a = sA + (eA - sA) * t;
        pts.push({ t, x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r });
      }
    }
    for (const p of pts) {
      const top = residualTopXAtZ(p.z);
      if (top !== null && top > p.x - finTipR + finMaxCut) return p;
    }
    return null;
  };
  if (rapidStock) {
    const kept = [];
    let breakNext = false, finDeepTrimmed = 0;
    for (const seg of finPath) {
      if (seg.isDegenerate) continue;
      const hit = finDeepCut(seg);
      const out = { ...seg };
      if (breakNext) { out.chainBreak = true; breakNext = false; }
      if (!hit) { kept.push(out); continue; }
      finDeepTrimmed++;
      breakNext = true;
      // Oblouk se nepůlí (pravidlo „celý, nebo vůbec"), přímka se zkrátí
      // na poslední místo, kde je tříska ještě v mezích.
      if (seg.type !== 'line' || hit.t < 1e-6) continue;
      const t = Math.max(0, hit.t - 0.5 / Math.max(1, Math.hypot(seg.p2.x - seg.p1.x, seg.p2.z - seg.p1.z)));
      const p2 = { x: seg.p1.x + (seg.p2.x - seg.p1.x) * t, z: seg.p1.z + (seg.p2.z - seg.p1.z) * t };
      if (Math.hypot(p2.x - seg.p1.x, p2.z - seg.p1.z) < 0.2) continue;   // zbyl by pahýl
      out.p2 = p2;
      kept.push(out);
    }
    if (finDeepTrimmed > 0) {
      finPath = kept;
      S.genNotes.push({ type: 'warning', msg: `Dokončování: ${finDeepTrimmed} úsek(ů) zkráceno/vynecháno — hrubování tam nechalo víc materiálu než hloubku třísky (ap ${finMaxCut} mm), dokončovací nůž by ho bral naráz. Dohrubujte to (jiné upnutí/nástroj) a pusťte dokončování znovu.` });
    }
  }
  const finSegs = finPath.filter(s => !s.isDegenerate);
  finSegs.forEach((seg, idx) => {
    // chainBreak = samostatný řetěz (mezi konturami nic nenavazuje) —
    // najet na jeho začátek místo řezného přejezdu mezerou.
    if (idx === 0 || seg.chainBreak) {
      const sp = segStartPoint(seg);
      finLeadIn(seg, sp.x, sp.z, idx === 0);
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
    // Konec řetězu (další úsek je samostatný ostrov, nebo už žádný není).
    const next = finSegs[idx + 1];
    if (!next || next.chainBreak) finRunOut();
  });
  // Odjezd z dílu VŽDY přes výjezd v X a teprve pak přejezd v Z (`forceUp`),
  // nikdy diagonálou — stejný důvod jako u konce hrubování: je to poslední
  // pohyb programu a šikmý pohyb přes celý díl je zbytečné riziko.
  safeRapidTo((parseFloat(prms.safeX) || 0) / (prms.mode === 'DIAMON' ? 2 : 1),
    parseFloat(prms.safeZ) || 0, false, true);
}
}
