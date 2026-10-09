// Výchozí hodnoty CAM parametrů — sdíleno mezi počátečním stavem a tlačítkem
// "🔄 Resetovat vše" (to musí vracet PŘESNĚ stejné výchozí hodnoty, ne jen
// nějakou kopii aktuálních parametrů).
export function _defaultCamParams() {
  return {
    machineType: 'LIMS=2000', mode: 'DIAMON', toolName: 'ROUGHER_T1',
    speed: 200, feed: 0.25, depthOfCut: 2.0, retractDistance: 2.0,
    // Rychloposuv G0 [mm/min] — jen pro odhad času a přehrávání simulace
    // v reálném čase (do G-kódu se nezapisuje, ten G0 rychlost neuvádí).
    rapidFeed: 6000,
    // Úhel odskoku po řezu (°): 90 = svisle v X, 45 = klasická diagonála.
    // X-složka odskoku je vždy retractDistance; Z-složka = rDist/tan(úhel).
    retractAngle: 45,
    allowanceX: 0.5, allowanceZ: 0.1, toolRadius: 0.8,
    // Přídavek na hotovo: přičítá se k Rádiusu (R) i k Přídavku X/Z —
    // hrubovací offset = R + Přídavek X/Z + Přídavek na hotovo,
    // dokončovací offset = jen R.
    finishAllowance: 0,
    doFinishing: true, roughingStrategy: 'longitudinal',
    // Jen dokončení (záložka „Hot."): vynechá hrubovací průchody a objede
    // konturu jediným dokončovacím průchodem (offset = R). Používá se, když
    // hrubování dělá jiný nástroj/operace a tady se dělá pouze načisto.
    finishOnly: false,
    // Směr hrubování: 'right' = zprava doleva (standard), 'left' = zleva
    // doprava (druhá strana — zprava nelze, narazil by držák/destička).
    // Kombinuje se s roughingStrategy (podélně/čelně).
    roughingSide: 'right',
    stockMode: 'cylinder', stockMargin: 5.0, stockDiameter: 100,
    stockLength: 100, stockFace: 2.0, safeX: 150, safeZ: 5,
    machineStructure: 'lathe', controlSystem: 'sinumerik', autoProfile: true,
    toolShape: 'round', toolLength: 10, toolAngle: 15, toolTipAngle: 90,
    // Na kterou stranu od Natočení se otevírá vrcholový úhel destičky.
    // false = 2. hrana na Natočení−ε (výchozí), true = na Natočení+ε.
    // POZOR: není to jen kosmetika náhledu (jak tu stálo do 6. 9. 2026) —
    // stranu čte buildInsertProfileSegments → insertWorldLoop, takže mění
    // úběr, kolize i mezní čáry (změřeno na part-19-face-tilted-insert).
    toolTipMirror: false,
    toolVbdCode: '', toolClearanceAngle: 0,
    // Držák plátku — svislé těleso nad destičkou (kolmé upnutí, jako na
    // revolveru): pás šířky holderWidth v ose Z, délky holderLength v ose X.
    // Hlídání geometrie destičky pak neomezuje zanoření nekonečnou hranou
    // destičky: hrana platí jen do délky Délka hrany (toolLength), hlouběji
    // rozhoduje držák — do širší kapsy tak nástroj smí sjet podstatně
    // hlouběji (mezní čára se lomí a pokračuje svisle podél stěny držáku).
    // holderWidth/holderLength ≤ 0 = držák se nehlídá (staré chování).
    holderWidth: 20,    // tloušťka držáku [mm] (v ose Z)
    holderLength: 200,  // délka držáku [mm] (v ose X — max. hloubka zanoření)
    // Ruka držáku (R/L) — při otevření dialogu Geometrie se odvodí ze směru
    // hrubování (roughingSide), pak ji lze tlačítkem ručně přepnout.
    holderHand: 'R',
    // Ručně nakreslený obrys držáku kolem destičky (dialog "⚙️ Geometrie" →
    // Držák → ✏️ Kreslit obrys), buď klikáním v náhledu, nebo přenesením z
    // hlavního CAD plátna. null = žádný vlastní obrys, náhled kreslí prostý
    // obdélník (holderWidth × holderLength). Souřadnice v mm ve stejném
    // systému jako uvnitř drawInsertAndHolderPreview PŘED scale/mirror
    // (0,0 = referenční bod destičky, +z = "nahoru" do držáku).
    // Tvar: { sideA: [{x,z}, ...], sideB: [{x,z}, ...] }
    holderProfile: null,
    // Natočení celého nože (destička + držák) v náhledu [°] — na rozdíl od
    // toolAngle (jen destička) otáčí obojím najednou. Hodnota = SMĚR, kterým
    // míří destička od držáku (kompas ukazuje k destičce). 270° = svisle dolů
    // = výchozí (destička dole, držák nahoru, bez pootočení). Jen náhled.
    knifeAngle: 270,
    // POZOR, DVA OSIŘELÉ KLÍČE V ULOŽENÝCH SOUBORECH (nález 15. 9. 2026):
    //   `holderAutoComplete` — auto-doplnění obrysu držáku pod 45° při
    //     „📐 Kreslit na CAD plátně". Z kódu ODSTRANĚNO v `7d0ae64`
    //     (27. 8. 2026), ale komentář tu po něm zůstal viset a četl se jako
    //     dokumentace k `holderInflate` níž — to jsou DVĚ RŮZNÉ věci.
    //   `guideOnlyRegions` — v `js/` nebyl NIKDY (`git log -S` nenajde nic).
    //   `regionRoughing`, `booleanRoughing`, `pathGenerator` — přepínače
    //     generátoru, zrušené 24. 9. 2026 (jeden generátor: regiony a
    //     booleovské intervaly platí vždy, pokusný „nový generátor" smazán).
    // Všechny se pořád vozí ve starších `.camprog` (a tedy i v `S.params`), ale
    // NIKDO JE NEČTE a žádné zaškrtávátko pro ně v `index.html` není.
    // Nepřidávat je zpátky bez rozhodnutí, co mají dělat — jsou to ghosty,
    // ne vypnuté funkce.
    //
    // VIRTUÁLNÍ ZVĚTŠENÍ DRŽÁKU [mm]: o kolik se jeho obrys nafoukne pro
    // všechna hlídání kolize i pro plánování drah — nástroj pak drží od
    // obrobku větší mezeru, aniž by se překresloval nůž. 0 (výchozí) =
    // obrys přesně jak je nakreslený, dosavadní chování.
    holderInflate: 0,
    // Kam se nafukuje: false (výchozí) = JEN K OBROBENÉ STRANĚ, tedy tam,
    // kde držák dojede k čelu; true = kolem CELÉHO držáku. Jednostranné je
    // výchozí proto, že přídavek U ŠPIČKY a PŘED ní překáží — destička na
    // držák navazuje. Viz inflateHolderLoop v collisionValidator.js.
    holderInflateAll: false,
    // Spodní strana závitového plátku [mm] — šířka rovné špičky (lichoběžník).
    // Metrické/palcové ~0,1; lichoběžníkové (Tr/Acme) ≈ 0,366×P (dno profilu).
    toolTipFlat: 0.1,
    // Upichnutí (part-off) upichovákem: Z roviny řezu (null = neaktivní,
    // jede se běžné hrubování/zapichování). Zápich jde v X od povrchu na 0.
    partOffZ: null,
    // Posl. mm nájezdu posuvem: při peckingu se jede rychloposuvem zpět dolů
    // až na tuto vzdálenost nad dno předchozího řezu, pak posuvem F.
    partingApproachFeed: 1.0,
    // Upichnutí plynule (true) = hlavní zápich jde jedním posuvem F na dno,
    // bez peckování (výjezdů pro lámání třísky). false = peckovaný cyklus.
    partOffSmooth: false,
    // Start X (radiální poloha SPODNÍ HRANY, kde ZAČNE posuvem zapichování):
    // z povrchu polotovaru se sem dojede RYCHLOPOSUVEM (kapsa/volno) a teprve
    // odtud jede posuv. 0 = neaktivní (zápich začíná od povrchu polotovaru).
    partOffStartX: 0,
    finishingSlot: null,  // index do toolMagazine pro dokončování (null = stejný nástroj)
    // ── Závitování (záložka „Závit") ──
    // Aktivní = generuje se závitovací cyklus (G33/G32 průchody) místo
    // hrubování/dokončování — stejný vzor jako upichnutí (partOffZ).
    threadActive: false,
    threadName: '',        // označení (M20, G 1/2, …) — jen popisné
    threadType: 'mc',      // klíč typu (mc/mf/tr/g/bspt/npt/unc/unf/bsw/acme) → profil/hloubka
    threadDiameter: 20,    // jmenovitý ⌀ D [mm]
    threadPitch: 2.5,      // stoupání P [mm]
    threadAngle: 60,       // vrcholový úhel profilu [°] — jen popis/vizualizace
    threadDepth: 1.534,    // hloubka profilu H [mm] (radiálně) — auto z P, lze přepsat
    threadExternal: true,  // vnější (true) / vnitřní (false) závit
    threadZStart: 0,       // Z začátku závitu (odtud se řeže směrem k threadZEnd)
    threadZEnd: -20,       // Z konce závitu
    threadRunIn: 3,        // náběh před závitem [mm] (rozběh posuvu, ve směru od konce)
    threadRunOut: 0,       // výběh za koncem [mm] (0 = končí přesně na Z konec, např. v zápichu)
    threadPasses: 0,       // počet průchodů (0 = auto podle hloubky, degresivní přísuv)
    threadSpringPasses: 1, // jiskřící průchody (ap=0) na konci
    // Kuželový závit: kuželovitost 1:k (0 = válcový; 16 = trubkový BSPT/NPT
    // 1:16; kladné = ⌀ roste směrem řezu k Z konci, záporné = klesá).
    threadTaperRatio: 0,
    // Způsob přísuvu: 'radial' = kolmý (obě strany profilu řežou),
    // 'flank' = boční po boku profilu (posun Z o hloubka·tan(ε/2)),
    // 'alternate' = střídavý cik-cak (boky se střídají — rovnoměrné opotřebení).
    threadInfeed: 'radial',
    // ── Vrtání (záložka „Vrtání", nástroj ⌀ vrták) ──
    // Aktivní = generuje se vrtací cyklus v ose (X0) místo hrubování —
    // stejný vzor jako závit (threadActive). Viz ops/drill.js.
    drillActive: false,
    drillZStart: null,       // Z čela, kde díra začíná (od něj se měří hloubka); null = čelo dílu (drillAutoFaceZ)
    drillDepth: 20,          // hloubka díry [mm] (kladná, od Z čela)
    drillDepthFullDia: false, // true = hloubka na plný ⌀ (+ délka špičky), false = na špičku
    drillClearance: 2,       // bezpečná vzdálenost před čelem — odtud jede posuv
    drillPeck: 5,            // hloubka záběru Q [mm]; 0 = na jeden zátah bez výjezdů
    drillChipMode: 'clear',  // 'clear' = vyjíždění z díry (G83), 'break' = lámání třísky (G73)
    drillRetract: 1,         // lámání: odskok po záběru; vyjíždění: rychloposuvem zpět až sem nad dno
    drillDwell: 0,           // prodleva na dně [s] (0 = bez prodlevy)
    // ── VYVRTÁVÁNÍ (záložka Vyvrtávání) — pravidlo 13: zrcadlo vnějšího
    // hrubování v ose X. Samostatná operace jako vrtání, viz ops/bore.js.
    // První verze: podélné hrubování válcové díry ⌀ × délka od Z čela.
    boreActive: false,
    borePreDrill: false,     // vyvrtávání z plného: nejdřív vrtání vrtákem (ops/borePreDrill.js)
    borePreDrillSlot: null,  // vrták ze 🔧 Zásobníku (index); null = vybere se sám
    borePreTip: 0,           // kužel špičky předvrtání [mm] — dopočítá applyPreDrillPlan
    boreSource: 'cylinder',  // 'cylinder' = válec ⌀ × délka níž, 'cad' = díra nakreslená ve výkresu
    boreFinish: false,       // po hrubování dokončit stěnu díry (vnější dokončení v zrcadle, týmž nástrojem)
    boreZStart: 0,           // Z čela, kde díra začíná
    boreDiameter: 30,        // ⌀ díry po vyvrtání (hotový bez přídavku X)
    boreDepth: 20,           // délka díry od Z čela [mm]
    borePreDiameter: 20,     // ⌀ předvrtání (z Vrtání nebo zadaný)
    borePreDepth: 25,        // hloubka předvrtání [mm] (≥ délka díry)
    // Úhel zanoření (ramp-in) — pod tímto úhlem nástroj rampuje do
    // materiálu (nájezd dokončování, zanořování do kapes). Stupně.
    entryAngle: 30,
    // true = úhel zanoření se dopočítává z tvaru destičky (úhel spodní
    // hrany: podélně = natočení; čelně = natočení + ε − 90).
    entryAngleAuto: true,
    // Hlídat geometrii (destička + DRŽÁK): hrubovací průchody se zkracují
    // tak, aby destička ani držák nezajely do kontury/polotovaru, a
    // dokončování přeskočí úseky, kam nástroj nedosáhne. VÝCHOZÍ ZAPNUTO
    // (uživatel 1. 10. 2026): na čistém prohlížeči (mobil) bylo vypnuté a
    // dokončování zprava sjelo po levém čele k ose — držák skrz díl.
    respectInsertGeometry: true,
    // Zanořování: podélné hrubování smí rampou (pod úhlem zanoření)
    // sjet i do kapes/zápichů v kontuře, ne jen do otevřeného řezu.
    plungeRoughing: false,
    // Dobrat kapsu najednou: jakmile rampa narazí na kapsu, dobere ji
    // celou (všechny zákroky ap po sobě), místo aby se dotahovala
    // postupně spolu s hloubkou zbytku dílu. false = původní chování
    // (postupné dotahování v dalších průchodech).
    pocketFinishAtOnce: false,
    // Bez schodků: po dojezdu hrubovacího průchodu na offset nástroj
    // dál sleduje konturu (G1/G2/G3) až na hloubku dalšího průchodu,
    // místo okamžitého 45° odskoku — schody mezi kroky se obrobí
    // přímo po obrysu.
    noStepRoughing: false,
    // Stejné chování i pro čelní (X) hrubování.
    noStepRoughingFace: false,
    // Hlídání držáku podle POŘADÍ obrábění (docs/cam-order-aware-holder.md).
    // Vjezd kapsového zákroku se posuzuje proti ZBYTKU, který v tu chvíli
    // opravdu stojí (`ResidualTracker` + `holderAreaAlongResidual`), ne jen
    // proti výškovému poli `cutFloorTab`. To pole neumí popsat TUNEL — když
    // zanoření podjede pod stojícím materiálem, srazí celý sloupec na hloubku
    // tunelu (na `part-8` změřeně až 11,2 mm pod realitou).
    //
    // VÝCHOZÍ ZAPNUTO od 26. 8. 2026. Změřeno na 25 fixtures × 2 variantách
    // držáku: kolize s nakresleným nožem 4 / 33,4 mm² → 0 za 328 mm² úběru
    // (−0,43 %), a mění se JEDINÝ díl (part-8) — ten zákrok vjížděl držákem
    // 30,1 mm² do stojícího materiálu, takže ho zahodit je správně; uživatel
    // se to dozví z hlášení „úsek polotovaru zůstal NEOBROBEN". Přepočet
    // +0 až +25 % (na part-8 −12 %).
    //
    // Vypnout = dosavadní chování (jen statická obálka `makeHolderClamp`).
    orderAwareHolder: true,
    // Vůle nad polotovarem pro rychloposuvy v Z. Default 1 mm =
    // dráha rychloposuvu se táhne co nejtěsněji vedle polotovaru.
    // (Legacy jednotná hodnota — viz stockClearX/stockClearZ níže.)
    rapidClearance: 1.0,
    // Odstup, ve kterém rychloposuv nad plánovací (offsetovou) čarou KONČÍ
    // a dál se jede pracovním posuvem. Bez něj se nos zastavil PŘESNĚ na té
    // čáře (`rapidStopX` = Vůle + R), takže příjezd končil už v ní — a odlitek
    // až u čáry reálně být může. 0 = dosavadní chování.
    rapidFeedGap: 1.0,
    // Vůle nad polotovarem po osách: odsazení hranice pracovního posuvu
    // (a bezpečné zóny pro držák) od polotovaru — radiálně (X) a axiálně
    // (Z), analogicky k Přídavku X/Z u kontury. null = převzít
    // rapidClearance (staré projekty fungují beze změny). Hranice se
    // kreslí tečkovaně kolem polotovaru.
    stockClearX: null,
    stockClearZ: null
  };
}

/**
 * Parametry, které VLASTNÍ KÓD, ne uložený soubor.
 *
 * `orderAwareHolder` nemá (a nikdy neměl) ovládací prvek v UI — je to interní
 * příznak bezpečnostního modelu, jehož výchozí hodnota se 26. 8. 2026 překlopila
 * na `true`. Jenže `S.params` se ukládá CELÉ (localStorage, `.camprog`, záznam
 * části), takže každý projekt uložený před tím datem si v sobě veze `false`
 * a `Object.assign` s ním při načtení novou výchozí hodnotu přepíše.
 *
 * Důsledek: bezpečnostní oprava nasazená jako „výchozí zapnuto" byla ve VŠECH
 * starších projektech tiše vypnutá — uživatel dál viděl kolizi držáku, kterou
 * ta oprava odstraňuje, a neměl jak ji zapnout (nález 26. 8. 2026).
 *
 * Takové klíče se proto z načtených parametrů vyhazují a platí výchozí hodnota
 * z kódu. Stejný vzor jako flipX/flipZ, které se taky berou odjinud než
 * z localStorage.
 */
export const CODE_OWNED_PARAMS = ['orderAwareHolder'];

/** Kopie `loaded` bez klíčů, které vlastní kód (viz CODE_OWNED_PARAMS). */
export function stripCodeOwnedParams(loaded) {
  if (!loaded) return loaded;
  const out = { ...loaded };
  for (const k of CODE_OWNED_PARAMS) delete out[k];
  return out;
}

/**
 * Rádius (R), který se dosadí při PŘEPNUTÍ tvaru plátku — v hlavním panelu,
 * v okně Geometrie i ve slotu zásobníku (uživatel 30. 9. 2026: „kulatý R10,
 * polygonální R1,2, upichovák R0,5"). Jen předvolba: pole Rádius jde hned
 * přepsat a VBD dekodér dosazuje R z kódu až po přepnutí. Závitový tu není —
 * rádius nepoužívá (applyShapeChange mu dává 0).
 */
export const SHAPE_PRESET_RADIUS = { round: 10, polygon: 1.2, parting: 0.5, drill: 10 };

/**
 * Výchozí vrták při přepnutí tvaru na ⌀ (panel, Geometrie, slot zásobníku):
 * HSS ⌀20 118° jako v 📚 katalogu (isoDrills.js — DIN 345, vyložení 145,
 * redukční pouzdro MK2 ⌀40 × 80). Rádius (⌀/2) je v SHAPE_PRESET_RADIUS.
 * Orientační hodnoty — uživatel je hned přepíše.
 */
export const DRILL_PRESET = { toolLength: 145, toolTipAngle: 118, holderWidth: 40, holderLength: 80 };

/**
 * Odhad řezných podmínek podle tvaru plátku: vc [m/min], f [mm/ot], ap [mm].
 * Při PŘEPNUTÍ tvaru (panel, Geometrie, slot zásobníku) se dosadí vc a f
 * (uživatel 30. 9. 2026: „přednastavit posuv a otáčky"), ap zůstává —
 * u závitového jen vc: pole F je posuv HRUBOVÁNÍ a závit jede F = stoupání.
 * Import nožů ze souborů do zásobníku bere všechny tři (f závitového =
 * stoupání jako u výchozího nože „Zavit").
 */
export const SHAPE_CUT_DEFAULTS = {
  round: { vc: 180, f: 0.15, ap: 1.5 },
  polygon: { vc: 200, f: 0.25, ap: 2.5 },
  parting: { vc: 120, f: 0.08, ap: 2 },
  threading: { vc: 100, f: 1.5, ap: 0.1 },
  // HSS vrták do oceli: Vc 25 m/min, f 0,2 mm/ot (⌀ 16–25); ap = záběr Q.
  drill: { vc: 25, f: 0.2, ap: 5 },
};

/**
 * Nástroj ze slotu 🔧 Zásobníku jako parametry CAM (geometrie, držák, řezné
 * podmínky) — pro operaci, která v programu mění nástroj sama (vyvrtávání
 * z plného: vrták, ops/borePreDrill.js). Kód drah se na tvar neptá, jen
 * převezme slot (cam-insert-isolation).
 */
export function slotToolParams(slot) {
  const s = slot || {};
  const out = {
    toolName: s.name || '', toolVbdCode: s.vbdCode || '', toolShape: s.shape,
    toolRadius: s.radius, toolTipAngle: s.tipAngle, toolAngle: s.toolAngle ?? 0,
    toolClearanceAngle: s.clearanceAngle ?? 0, toolLength: s.toolLength, toolTipMirror: s.tipMirror === true,
    holderInflate: s.holderInflate ?? 0, holderInflateAll: s.holderInflateAll === true,
    holderProfile: s.holderProfile ? JSON.parse(JSON.stringify(s.holderProfile)) : null,
  };
  if (s.tipFlat !== undefined) out.toolTipFlat = s.tipFlat;
  if (s.vc !== undefined) out.speed = s.vc;
  if (s.f !== undefined) out.feed = s.f;
  for (const [k, from] of [['holderLength', 'holderLength'], ['holderWidth', 'holderWidth'], ['holderHand', 'holderHand'], ['knifeAngle', 'knifeAngle']]) {
    if (s[from] !== undefined) out[k] = s[from];
  }
  return out;
}
