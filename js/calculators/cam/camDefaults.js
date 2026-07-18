// Výchozí hodnoty CAM parametrů — sdíleno mezi počátečním stavem a tlačítkem
// "🔄 Resetovat vše" (to musí vracet PŘESNĚ stejné výchozí hodnoty, ne jen
// nějakou kopii aktuálních parametrů).
export function _defaultCamParams() {
  return {
    machineType: 'LIMS=2000', mode: 'DIAMON', toolName: 'ROUGHER_T1',
    speed: 200, feed: 0.25, depthOfCut: 2.0, retractDistance: 2.0,
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
    // Na kterou stranu od Natočení se otevírá vrcholový úhel destičky v
    // náhledu (jen kosmetika dialogu Geometrie — nemění interferenční
    // výpočet, který má svůj vlastní, na Natočení symetrický model).
    // false = 2. hrana na Natočení−ε (výchozí), true = na Natočení+ε.
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
    // Auto-doplnění obrysu držáku pod 45° dle l1/tloušťky při „📐 Kreslit na
    // CAD plátně", když uživatel nakreslí jen dvě strany (otevřený obrys).
    // Vypnuto = uloží se přesně nakreslený tvar (i otevřený).
    holderAutoComplete: true,
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
    // Úhel zanoření (ramp-in) — pod tímto úhlem nástroj rampuje do
    // materiálu (nájezd dokončování, zanořování do kapes). Stupně.
    entryAngle: 30,
    // true = úhel zanoření se dopočítává z tvaru destičky (úhel spodní
    // hrany: podélně = natočení; čelně = natočení + ε − 90).
    entryAngleAuto: true,
    // Hlídat boční ostří destičky: hrubovací průchody se zkracují tak,
    // aby destička (natočení + vrcholový úhel) nezajela do kontury,
    // a dokončování přeskočí úseky, kam destička nedosáhne.
    respectInsertGeometry: false,
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
    // Hrubovat po regionech (jen odlitek): každý výstupek polotovaru
    // (mezi „údolími", kde se polotovar blíží kontuře) se vyhrubuje shora
    // dolů SAMOSTATNĚ, mezi regiony rychloposuv nad polotovar. false =
    // původní globální sweep po hloubkách přes celý díl.
    regionRoughing: false,
    // Vůle nad polotovarem pro rychloposuvy v Z. Default 1 mm =
    // dráha rychloposuvu se táhne co nejtěsněji vedle polotovaru.
    // (Legacy jednotná hodnota — viz stockClearX/stockClearZ níže.)
    rapidClearance: 1.0,
    // Vůle nad polotovarem po osách: odsazení hranice pracovního posuvu
    // (a bezpečné zóny pro držák) od polotovaru — radiálně (X) a axiálně
    // (Z), analogicky k Přídavku X/Z u kontury. null = převzít
    // rapidClearance (staré projekty fungují beze změny). Hranice se
    // kreslí tečkovaně kolem polotovaru.
    stockClearX: null,
    stockClearZ: null
  };
}
