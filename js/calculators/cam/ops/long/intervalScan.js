// ╔══════════════════════════════════════════════╗
// ║  Hledání INTERVALŮ na hloubce (podélné hrubování)           ║
// ╚══════════════════════════════════════════════╝
// Vyňato z `ops/roughLong.js` (rozdělení generátoru, plán §3.A) BEZE ZMĚNY
// CHOVÁNÍ — otisk G-kódu 26 fixtures zůstal bajt po bajtu stejný.
//
// „Kde se na hloubce X dá řezat?" — od vjezdu přes ořez obálkou držáku až po
// hledání intervalů. Jede se VŽDY booleovsky (`scan`); klasický sken
// (`scanIntervals`) je jen pojistka, když chybí polotovar/offset.

import { sampleOffsetRegion, buildResidual, layerZIntervalsAtX } from '../../booleanRoughing.js';
import { HOLDER_CLAMP_MARGIN } from '../../toolEnvelope.js';
import { depthKey } from './segUtils.js';

/**
 * @param blockedAt           (X, z) => stojí tam překážka?
 * @param refineEngageZ       zpřesnění Z, kde dráha najíždí do materiálu
 * @param holderBlockedDepths ŽIVÁ množina hloubek, které obálka zastavila
 * @param counters            vrací se ven — `partingWallDropped` jde do poznámek
 */
export function makeIntervalScan({
  prms, offsetXAt, holderClampZEnd,
  stockLoopL, stockLoopOffsetL, planTopX, noseLiftX = 0,
  isParting, wInsL, rInsL,
  dzScan, blockedAt, refineEngageZ, holderBlockedDepths,
}) {
  // ── Vjezd průchodu tam, kde SKUTEČNĚ začíná polotovar ─────────────────
  // Okno REGIONU (odlitek, viz níž) i rozsah obrábění 📐 můžou začínat ve
  // VZDUCHU — nad údolím odlitku nebo v mezeře mezi hrby. Průchod pak „vjížděl"
  // desítky mm mimo materiál: emise ten kus sice přeletí rychloposuvem
  // (dynamický rapidStock v gcodeEmit.js), ale obálka DRŽÁKU posuzovala vjezd
  // v místě, kam nástroj vůbec nesjede — a fyzicky v pořádku průchod zahodila
  // (reálný nález na díle uživatele: celá vrstva u NEJVĚTŠÍHO průměru vypadla).
  // Region bez materiálu na dané hloubce navíc vydával prázdný průchod, z něhož
  // v G-kódu zbyl jen dojezd = „trojúhelník" uprostřed údolí.
  //
  // Měří se na VŮLÍ-POSUNUTÉ siluetě (stockLoopOffsetL — tečkovaná hranice
  // v náhledu, přesně tam začíná posuv, viz planTopXAtZ v
  // gcodeEmit.js). Syrový obrys by vjezd posadil až ZA vůli a průchod by u
  // šikmé stěny začal řezat o vůli později → klínek stojícího materiálu
  // (ověřeno na holder-region-roughing). Bez posunuté siluety fallback na
  // průsečíky syrového obrysu (sz.all).
  // Parita: obrys je uzavřený, takže lichý počet průsečíků NAD zHi znamená, že
  // zHi leží v materiálu. Null = v okně na téhle hloubce materiál není.
  const stockCrossingsAt = (X, sz) => {
    if (!stockLoopOffsetL) return (sz && sz.all) || [];
    // `X` je poloha DRÁHY (střed nosu), silueta je POVRCH — ptát se musí
    // o `noseLiftX` níž (u kulaté destičky rádius nosu, jinde 0). Bez toho se
    // vjezd hledal tam, kde je kraj materiálu na hloubce STŘEDU nosu, ačkoli
    // BŘIT je pod povrchem už dávno předtím. Nález uživatele 7. 9. 2026:
    // na válci r 21,803 začaly průchody 24,545 / 27,045 / 29,545 až na kuželu
    // (Z ≈ 282) a přes celý válec se pak přejelo JEDINÝM průchodem na
    // r 22,045 — tříska 9,76 mm místo ap 2,5 (`N1310 G1 Z251.257`).
    const zs = [];
    const n = stockLoopOffsetL.length;
    const xs = X - noseLiftX;
    for (let i = 0; i < n; i++) {
      const a = stockLoopOffsetL[i], b = stockLoopOffsetL[(i + 1) % n];
      if ((a.x <= xs && b.x > xs) || (b.x <= xs && a.x > xs))
        zs.push(a.z + (b.z - a.z) * ((xs - a.x) / (b.x - a.x)));
    }
    if (zs.length < 2) return (sz && sz.all) || [];
    zs.sort((p, q) => q - p);
    return zs;
  };
  const passEntryZ = (zHiRaw, zLo, sz, X) => {
    if (prms.stockMode !== 'casting') return zHiRaw;
    const all = stockCrossingsAt(X, sz);
    if (all.length < 2) return zHiRaw;
    let above = 0;
    for (const z of all) if (z > zHiRaw + 1e-9) above++;
    if (above % 2 === 1) {                                 // vjezd je v materiálu
      if (!blockedAt(X, zHiRaw)) return zHiRaw;
      // NEDOSAŽITELNÝ KUS NA HRANICI ÚSEKU (24. 9. 2026). Hranice podle
      // pravidla 1 leží na patě čáry zanoření — materiál hned pod ní (pod
      // čarou) zprava vzít nejde, `blockedAt` to ví. Dřív se vjezd přesto
      // nechal na hranici, rampa se tam nevešla a vypadla CELÁ vrstva, i když
      // o kus vlevo materiál začíná ze vzduchu. Nález uživatele 24. 9. 2026
      // (polygon, úsek Z −9…107,2): vrstvy X 34,6 / 32,1 chyběly a další
      // vrstva brala třísku 6,5–7,5 mm. Nedosažitelný kus se přeskočí
      // (zůstane stát, kontrola ho nahlásí) a vjezd je na prvním místě,
      // kde materiál začíná ze vzduchu a nic ho neblokuje.
      let inMat = true;
      for (const z of all) {
        if (z > zHiRaw + 1e-9) continue;
        if (z <= zLo + 1e-9) break;
        inMat = !inMat;
        if (inMat && !blockedAt(X, z)) return z;
      }
      return zHiRaw;
    }
    for (const z of all) {
      if (z > zHiRaw + 1e-9 || z <= zLo + 1e-9) continue;
      // Materiál začíná až ZA stěnou kontury (offset nad hloubkou průchodu):
      // vjet se tam nedá, ale průchod má pořád smysl jako dojezd „bez schodků"
      // po stěně. Vjezd je na prvním VOLNÉM místě vpravo od stěny (+1 mm
      // vzduchu), ne na kraji okna: hranice úseku podle pravidla 1 může
      // ležet desítky mm vpravo, kde držák narazí do zbytku sousedního
      // úseku a celá hloubka se zahodí. Nález 24. 9. 2026 (kulatá R 10,
      // úsek Z 101,9…195,3): vjezd na Z 195,3 zamítl držák, otevřená část
      // vrstvy vypadla a dojezd po kontuře pak rychloposuvem vjel do
      // šikmého polotovaru Z 142…146, který měla vzít ona (kolize 13 mm²).
      if (!blockedAt(X, z)) return z;
      // Upichovák: hranice úseku leží u paty stěny sama (pravidlo 1) a tělo
      // plátku `blockedAt` nezná — posunutý vjezd ho zapíchl do stěny
      // (part-18-parting-90-ramp, 0,16 mm²). Platí kraj okna, jako dřív.
      if (isParting) return zHiRaw;
      let zFree = z;
      while (zFree < zHiRaw && blockedAt(X, zFree)) zFree += dzScan;
      return Math.min(zHiRaw, zFree + 1);
    }
    return null;
  };
  // Skenem zprava doleva najde všechny volné intervaly (offset nepřekračuje
  // X) v Z∈[zLoBound,zHiBound]. První interval (od pravé hrany polotovaru) =
  // klasický otevřený vjezd. Každý další interval je kapsa za "bossem"
  // kontury. Sdíleno hlavní smyčkou hloubek X i dobíráním kapsy najednou.
  // Obálka držáku (Fáze 3a, Clipper2) — společné post-zpracování intervalů
  // pro obě cesty hledání (scan-line i booleovskou). Špička nesmí vjet do
  // zakázané oblasti (silueta offsetu ⊕ −držák): interval se zkrátí na první
  // vstup do ní. U hlavního otevřeného vjezdu navíc schodová podmínka
  // (mainStair) — držák nesmí najet do materiálu, který nechaly stát zkrácené
  // MĚLČÍ průchody. holderClamped potlačí sledování kontury z konce průchodu
  // (leadOut). Bez definovaného držáku vrací vstup beze změny.
  const applyHolderClamp = (intervals, firstOpen, X, mainScan) => {
    // ORDER-AWARE ZBYTEK SEM NEPATŘÍ — ZMĚŘENO 26. 8. 2026.
    // Plán chtěl tímhle ořezem nahradit obálku. Vyšlo to špatně ve třech
    // po sobě jdoucích variantách:
    //   • náhrada obálky        úběr 76 664 → 65 979 mm² (−14 %), kolize 4 → 67
    //   • složení s obálkou     prakticky totéž (zbytek je dominantní)
    //   • jen zkrácení, ne zrušení + odečtený vlastní řez
    //                           úběr +1 482 mm², ale `part-10-zapich-casting`
    //                           +1 457 mm² a 3 nálezy / 2 578 mm² NAVÍC
    // Důvod je pořád tentýž: zkrácený nebo zahozený interval materiál
    // NEODEBERE, jen ho nechá stát — a další, hlubší průchod ho pak vezme
    // najednou a projede držákem skrz (part-17: průchodů 53 → 44, ale úběr
    // 4 933 → 10 183 mm² a 26 nálezů). Správná odpověď na „nevejde se teď"
    // je PŘEPLÁNOVAT POŘADÍ, což je vědomě mimo rozsah plánu.
    //
    // Zbytek se místo toho ptá u VJEZDU zákroku (`residEntryArea` výš) —
    // tam díra opravdu je a tam se to změřeně vyplácí: `part-8` 4 nálezy /
    // 33,4 mm² → 0 za 328 mm² úběru, `part-10` beze změny.
    if (!holderClampZEnd) return { intervals, firstOpen };
    const clampAt = (X2, zS, zE, mainStair) => holderClampZEnd(X2, zS, zE, { mainStair });
    const out = [];
    let firstSurvived = firstOpen;
    for (let k = 0; k < intervals.length; k++) {
      const iv = intervals[k];
      if (k === 0 && firstOpen) {
        // OTEVŘENÝ vjezd: zakázaný start = nelze bezpečně vjet → vynechat;
        // jinak jen zkrátit hluboký konec (+ schodová podmínka).
        let nz = clampAt(X, iv.zStart, iv.zEnd, mainScan);
        // ZAKÁZANÝ JEN ZAČÁTEK, NE CELÝ KUS (24. 9. 2026). Vjezd na hranici
        // úseku podle pravidla 1 může ležet u stěny, kde držák přečnívá nad
        // hrb sousedního úseku — a dřív se tím zahodil CELÝ první kus vrstvy,
        // i když byl 86 mm dlouhý a o pár mm dál se držák vejde (part-17,
        // upichovák u stěny Z 205: 26 hloubek pryč, neobrobený krk i boss).
        // Začátek se posune doleva na první místo, kde držák projde; kus
        // u stěny zůstane stát a hlásí se jako dřív.
        if (nz === null && mainScan && iv.zStart - iv.zEnd > 4 * dzScan) {
          const stepS = Math.max(dzScan, 0.5);
          for (let zS = iv.zStart - stepS; zS > iv.zEnd + dzScan; zS -= stepS) {
            const nz2 = clampAt(X, zS, iv.zEnd, mainScan);
            if (nz2 !== null) { iv.zStart = zS; iv.entryShifted = true; nz = nz2; holderBlockedDepths.add(depthKey(X)); break; }
          }
        }
        if (nz === null) {
          firstSurvived = false;
          if (mainScan && iv.zStart - iv.zEnd >= dzScan) holderBlockedDepths.add(depthKey(X));
          continue;
        }
        // Rezerva obálky (HOLDER_CLAMP_MARGIN) patří DRŽÁKU, ne špičce:
        // clamp vrací „první vstup do zakázané oblasti + rezerva", a protože
        // tou oblastí je i samotná silueta offsetu, vyšlo to i tam, kde
        // průchod stejně končí — na STĚNĚ KONTURY. Každý zablokovaný průchod
        // pak končil o rezervu (0,1 mm) dřív, než kam na offsetovou čáru
        // dojet smí (reálný nález na díle uživatele: dráhy u čela nedojely
        // k offsetové čáře a nechávaly 0,1 mm navíc). Zkrátit se proto smí,
        // jen když MÍSTO překážky (nz − rezerva) leží ZA koncem intervalu, a
        // to o víc než řezná tolerance (0,01 mm jako v blockedAt — hranice
        // zakázané oblasti a offsetová silueta se po Clipperu liší v řádu
        // 1e-3 mm). Uvnitř tolerance jde o TUTÉŽ stěnu → konec zůstane přesný.
        if (nz - HOLDER_CLAMP_MARGIN > iv.zEnd + 0.01) { iv.zEnd = nz; iv.blocked = true; iv.holderClamped = true; }
        if (iv.zStart - iv.zEnd < dzScan) { firstSurvived = false; continue; }
      }
      // KAPSY (k>0 / zanoření) OBÁLKA NEOŘEZÁVÁ: lomené mezní čáry guides v2
      // („stěna − holderWidth") už drží držák uvnitř kapsy a jsou zapracované
      // do obrobitelné kontury. Druhá (statická) restrikce přes span by přes
      // přídavkovou slupku zkracovala rampy a bránila digu na dno (široká
      // kapsa, cam-holder test). Nájezd/výjezd kapes hlídá holderTrimLeadIn/Out;
      // zbytek pokryje validátor (⚠ panel).
      //
      // Ani ORDER-AWARE ořez sem nepomohl: po odečtení vlastního řezu byl na
      // všech 25 fixtures INERTNÍ (identický výsledek se zapnutým i vypnutým),
      // a bez něj bral úběr. Zbylá vada na `part-8` se řeší u VJEZDU zákroku
      // (`residEntryArea`), ne ořezem intervalu.
      out.push(iv);
    }
    return { intervals: out, firstOpen: firstSurvived };
  };
  // ŠÍŘKA UPICHOVACÍHO PLÁTKU U STĚNY (27. 8. 2026).
  // Upichovák řeže CELOU spodní hranou šířky b: když začne průchod těsně pod
  // stoupající stěnou, jeho ZADNÍ část (b − R za špičkou) leží UŽ V TÉ STĚNĚ —
  // tedy v HOTOVÉM díle. Sken intervalů zná jen bod špičky, takže vjezdy seděly
  // přesně na konturu a tělo plátku ji ujdalo (nález uživatele 27. 8. 2026:
  // `N2710 G1 X34.545 Z115.088 ; Rampa 90.0°` a všechny podobné pod ní).
  //
  // Začátek intervalu se proto odsune o šířku těla, ale JEN když ho shora
  // ohraničuje kontura (`blockedAt` těsně nad ním). Když interval začíná ve
  // vzduchu (konec polotovaru, hranice rozsahu), plátek nemá do čeho narazit
  // a nic se nemění. Materiál, který tím u stěny zůstane, je fyzikální mez
  // širokého plátku — dobere ho dokončovací nástroj, ne zajezd do dílu.
  const partingBodyZ = isParting ? Math.max(0, wInsL - rInsL) : 0;
  const counters = { partingWallClamps: 0, partingWallDropped: 0 };
  // STĚNU NEMUSÍ BÝT VIDĚT HNED VEDLE ŠPIČKY. Test jediným bodem 0,05 mm nad
  // začátkem intervalu vyhodnotí MÍRNOU šikminu jako volno: na kuželu ~10° od
  // osy stoupne offset za těch 0,05 mm o 0,009 mm, tedy POD řeznou tolerancí
  // 0,01 mm — a tělo plátku přitom o 4,2 mm dál leží 0,75 mm v kontuře.
  // Reálný nález uživatele 1. 9. 2026 (`N1770 G1 X40.545 Z133.314 ; Rampa
  // 90.0°`): špička sedí na offsetu přesně (40,545 = 40,545), test minul
  // stěnu o 1,1 µm (40,5539 proti prahu 40,555) a obrys plátku ukrojil
  // 0,18 mm² z HOTOVÉHO dílu na Z 129,1.
  //
  // Ptá se proto CELÉ OKNO TĚLA — přesně jak zní pravidlo v `inserts/parting.js`:
  // „Kdykoli se počítá obálka nebo se někam ZAPICHUJE, musí se brát maximum
  // předlohy přes celé to okno, ne jen bod špičky." Detekce se tím jen
  // ROZŠIŘUJE (bod 0,05 mm v okně zůstává), takže dosud chytané případy
  // se nemění; velikost odsunu (celá šířka těla) zůstává taky.
  const bodyHitsWall = (X, z0) => {
    const step = Math.min(dzScan, 0.2);
    for (let d = 0.05; d < partingBodyZ; d += step) if (blockedAt(X, z0 + d)) return true;
    return blockedAt(X, z0 + partingBodyZ);
  };
  const clampPartingBody = (intervals, X) => {
    if (partingBodyZ <= 0) return intervals;
    const out = [];
    for (const iv of intervals) {
      if (!bodyHitsWall(X, iv.zStart)) { out.push(iv); continue; }
      const zs = iv.zStart - partingBodyZ;
      if (zs - iv.zEnd < dzScan) { counters.partingWallDropped++; continue; }
      counters.partingWallClamps++;
      out.push({ ...iv, zStart: zs, partingWallClamped: true });
    }
    return out;
  };

  const scanIntervals = (X, zHiBound, zLoBound, mainScan = false) => {
    const intervals = [];
    let zScan = zHiBound;
    let inRun = !blockedAt(X, zScan);
    const firstOpen = inRun;
    let runStartZ = zScan;
    while (zScan > zLoBound + dzScan) {
      zScan -= dzScan;
      const blocked = blockedAt(X, zScan);
      if (inRun && blocked) {
        intervals.push({ zStart: runStartZ, zEnd: refineEngageZ(X, zScan + dzScan, zScan), blocked: true });
        inRun = false;
      } else if (!inRun && !blocked) {
        runStartZ = zScan;
        inRun = true;
      }
    }
    if (inRun) intervals.push({ zStart: runStartZ, zEnd: zLoBound, blocked: false });
    return applyHolderClamp(clampPartingBody(intervals, X), firstOpen, X, mainScan);
  };

  // ── Booleovská cesta hledání intervalů (migrace Fáze 3, za příznakem) ──
  // Zbytkový materiál = polotovar − oblast dílce (offset kontury uzavřený
  // k ose, booleanRoughing.js). Řezné intervaly na hloubce X = průnik zbytku
  // s vodorovnou čárou x=X, oříznuté na [zLoBound, zHiBound] (rozsah obrábění
  // / region / polotovar). blocked/firstOpen se klasifikují STEJNÝMI helpery
  // (blockedAt) jako scan-line, takže navazující emise (rampy, leadIn/Out,
  // obálka držáku) funguje beze změny. Spočte se JEDNOU (memoizace zbytku).
  let _residualLoops = null;
  const getResidualLoops = () => {
    if (_residualLoops !== null) return _residualLoops;
    // Z-rozpětí obalu se bere z VŮLÍ-POSUNUTÉ siluety — polotovar končí až na
    // offsetové čáře, takže `planTopX` (X) a tenhle Z-rozsah musí mluvit
    // o TÉŽE čáře. Se syrovým rozpětím obal končil o Vůli Z dřív než dno
    // průchodu (`effZMin`) a interval se o ten kus zkrátil: na dílu uživatele
    // 11. 9. 2026 dojel levý konec na Z −8,000 (kůra odlitku) místo Z −9,000.
    const stockLoop = stockLoopOffsetL || stockLoopL;
    if (!stockLoop) { _residualLoops = []; return _residualLoops; }
    // Z-rozsah z obrysu polotovaru; radiální rozsah do maxStockX (vrch
    // polotovaru). Zbytek se počítá proti PLNÉMU obdélníkovému POLOTOVAROVÉMU
    // OBALU [0..maxStockX] × [zMin..zMax], NE proti skutečné siluetě odlitku:
    // scan-line záměrně obrys polotovaru IGNORUJE („Stopuje JEN kontura",
    // rychloposuv vzduchem tam, kde odlitek chybí) — proti siluetě by se
    // intervaly u úzkých míst rozpadly na nesmyslné vnitřní „kapsy", které
    // emise neobrobí → zůstal by stát materiál. Oblast dílce vzorkuje offsetXAt
    // (přesně jako scan-line blockedAt) → intervaly SEDÍ se scan-line.
    let zMax = -Infinity, zMin = Infinity;
    for (const p of stockLoop) { if (p.z > zMax) zMax = p.z; if (p.z < zMin) zMin = p.z; }
    const envelope = [
      { x: 0, z: zMax }, { x: planTopX, z: zMax },
      { x: planTopX, z: zMin }, { x: 0, z: zMin },
    ];
    const region = sampleOffsetRegion(offsetXAt, zMax, zMin, dzScan);
    _residualLoops = buildResidual(envelope, region);
    return _residualLoops;
  };
  const booleanScanIntervals = (X, zHiBound, zLoBound, mainScan = false) => {
    const residual = getResidualLoops();
    // Pojistka: bez zbytku (chybí polotovar/offset) zpět na scan-line.
    if (!residual || residual.length === 0) return scanIntervals(X, zHiBound, zLoBound, mainScan);
    const eps = 1e-4;
    const intervals = [];
    for (const iv of layerZIntervalsAtX(residual, X)) {
      const zHi = Math.min(iv.zStart, zHiBound);
      const zLo = Math.max(iv.zEnd, zLoBound);
      if (zHi - zLo < dzScan) continue;
      // blocked = levý konec bounduje kontura (nedosáhl spodní meze rozsahu) —
      // stejná sémantika jako u scan-line (jen poslední otevřený běh je false).
      intervals.push({ zStart: zHi, zEnd: zLo, blocked: zLo > zLoBound + eps });
    }
    const firstOpen = !blockedAt(X, zHiBound);
    return applyHolderClamp(clampPartingBody(intervals, X), firstOpen, X, mainScan);
  };
  // Jediná cesta (24. 9. 2026, sjednocení generátorů): booleovské intervaly.
  // Scan-line zůstává jen jako pojistka uvnitř `booleanScanIntervals`.
  // Změřeno na dílech uživatele: bez booleovské cesty tříska 19,9 mm
  // (kulatá) a kolmé zanoření 90° u polygonu.
  const scan = booleanScanIntervals;

  return { stockCrossingsAt, passEntryZ, scanIntervals, scan, counters };
}
