// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Geometrické tolerance: značky ČSN EN ISO 1101       ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Příručka do okna Tolerance: značky, toleranční pole, kontrola u stroje,
// doplňkové značky (Ⓜ, Ⓔ…) a čtení tolerančního rámečku.
// Značky jsou SVG – znaky ⌭ ⌯ ⌰ ⏥ chybí v řadě písem (hlavně Android).

/** Tvary značek ve viewBoxu 24×24 (čára currentColor). */
const ICON = {
  straight: '<line x1="3" y1="12" x2="21" y2="12"/>',
  flat: '<polygon points="8,7 21,7 16,17 3,17"/>',
  round: '<circle cx="12" cy="12" r="8"/>',
  cyl: '<circle cx="12" cy="12" r="5"/><line x1="11.8" y1="22.3" x2="20.8" y2="6.7"/><line x1="3.2" y1="17.3" x2="12.2" y2="1.7"/>',
  lineProf: '<path d="M3 17 A9 9 0 0 1 21 17"/>',
  surfProf: '<path d="M3 17 A9 9 0 0 1 21 17 Z"/>',
  parallel: '<line x1="5" y1="20" x2="11" y2="4"/><line x1="13" y1="20" x2="19" y2="4"/>',
  perp: '<line x1="12" y1="4" x2="12" y2="20"/><line x1="3" y1="20" x2="21" y2="20"/>',
  angle: '<polyline points="18,5 4,19 21,19"/>',
  position: '<circle cx="12" cy="12" r="6"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/>',
  coax: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/>',
  symm: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="7" y1="6.5" x2="17" y2="6.5"/><line x1="7" y1="17.5" x2="17" y2="17.5"/>',
  runout: '<line x1="5" y1="19" x2="16" y2="8"/><polygon class="gdt-fill" points="20,4 11,7 17,13"/>',
  totalRunout: '<polyline points="3,20 15,20"/><line x1="3" y1="20" x2="10.5" y2="10.5"/><line x1="11" y1="20" x2="18.5" y2="10.5"/>' +
    '<polygon class="gdt-fill" points="13,6 6,8.2 11,12.2"/><polygon class="gdt-fill" points="21,6 14,8.2 19,12.2"/>',
};

function icon(key) {
  return '<svg class="gdt-ico" viewBox="0 0 24 24" aria-hidden="true">' + ICON[key] + '</svg>';
}

/**
 * Značky podle ISO 1101 (tab. 2).
 * base: 'ne' | 'ano' | 'ano/ne' – zda tolerance vyžaduje základnu.
 */
const SYMBOLS = [
  { group: 'Tvar', items: [
    { k: 'straight', name: 'Přímost', base: 'ne',
      zone: 'Dvě rovnoběžné přímky ve vzdálenosti t. S ⌀ před hodnotou (osa) je to válec ⌀t.',
      check: 'Číselník nebo pravítko podél površky. Přímost osy (⌀t) spolehlivě jen na měřicím stroji.' },
    { k: 'flat', name: 'Rovinnost', base: 'ne',
      zone: 'Dvě rovnoběžné roviny ve vzdálenosti t; celá plocha musí ležet mezi nimi.',
      check: 'Díl na měřicí desce na třech bodech, číselník přes celou plochu: max − min ≤ t.' },
    { k: 'round', name: 'Kruhovitost', base: 'ne',
      zone: 'V každém příčném řezu dvě soustředné kružnice s rozdílem poloměrů t.',
      check: 'Mikrometr (dvoubodově) zachytí jen ovalitu – lichou hranatost (trojhran) ne; na ni prizma nebo kruhoměr.' },
    { k: 'cyl', name: 'Válcovitost', base: 'ne',
      zone: 'Dva souosé válce s rozdílem poloměrů t – zahrnuje kruhovitost, přímost i kuželovitost.',
      check: 'Kruhovitost v několika řezech + rozdíl průměrů po délce (kužel) + přímost površky.' },
  ] },
  { group: 'Profil', items: [
    { k: 'lineProf', name: 'Tvar profilu (čáry)', base: 'ano/ne',
      zone: 'Pás šířky t obalený kružnicemi ⌀t se středy na teoreticky přesném profilu (v každém řezu).',
      check: 'Šablona, projektor nebo měřicí stroj. Profil je dán teoreticky přesnými rozměry v rámečku.' },
    { k: 'surfProf', name: 'Tvar plochy', base: 'ano/ne',
      zone: 'Vrstva šířky t obalená koulemi ⌀t se středy na teoreticky přesné ploše.',
      check: 'Měřicí stroj (3D). Se základnou hlídá i polohu plochy, bez ní jen tvar.' },
  ] },
  { group: 'Orientace', items: [
    { k: 'parallel', name: 'Rovnoběžnost', base: 'ano',
      zone: 'Dvě roviny (přímky) ve vzdálenosti t rovnoběžné se základnou. S ⌀ u osy válec ⌀t.',
      check: 'Díl položený základnou na desku, číselník přes plochu: max − min ≤ t.' },
    { k: 'perp', name: 'Kolmost', base: 'ano',
      zone: 'Dvě roviny ve vzdálenosti t kolmé na základnu. S ⌀ u osy válec ⌀t kolmý na základnu.',
      check: 'Čelo kolmé na osu (základna = osa): číselník po celém čele při otáčení – jako celkové axiální házení.' },
    { k: 'angle', name: 'Sklon', base: 'ano',
      zone: 'Dvě roviny ve vzdálenosti t pod teoreticky přesným úhlem (v rámečku) k základně.',
      check: 'Sinusové pravítko nastavené na jmenovitý úhel, pak jako rovnoběžnost.' },
  ] },
  { group: 'Poloha', items: [
    { k: 'position', name: 'Poloha', base: 'ano/ne',
      zone: 'S ⌀: válec ⌀t v teoreticky přesné poloze (rozměry v rámečku). Bez ⌀: dvě roviny vzdálené t.',
      check: 'Změř odchylky Δx, Δy od jmenovité polohy: ⌀ = 2·√(Δx² + Δy²) ≤ t.' },
    { k: 'coax', name: 'Souosost / soustřednost', base: 'ano',
      zone: 'Souosost (osa): válec ⌀t souosý se základní osou. Soustřednost (bod v řezu): kružnice ⌀t.',
      check: 'Výstřednost e: ⌀ = 2·e ≤ t. Číselník při otáčení ukáže 2·e plus chybu tvaru – vychází přísněji.' },
    { k: 'symm', name: 'Souměrnost', base: 'ano',
      zone: 'Dvě roviny ve vzdálenosti t souměrné podle základní střední roviny (osy).',
      check: 'Drážka: vzdálenosti a, b obou boků od základny – posun středu (a − b)/2 ≤ t/2, tj. |a − b| ≤ t.' },
  ] },
  { group: 'Házení', items: [
    { k: 'runout', name: 'Házení kruhové', base: 'ano',
      zone: 'Radiální: v každém řezu dvě soustředné kružnice vzdálené t, střed na základní ose. Axiální: na každém poloměru čela pás šířky t.',
      check: 'Díl se otáčí kolem základny, číselník stojí: max − min za 1 otáčku ≤ t, v každém místě zvlášť.' },
    { k: 'totalRunout', name: 'Házení celkové', base: 'ano',
      zone: 'Radiální: dva souosé válce vzdálené t. Axiální: dvě roviny vzdálené t kolmé na základní osu.',
      check: 'Jako kruhové, ale číselník během otáčení přejede celou plochu – max − min za celou plochu ≤ t.' },
  ] },
];

const MODIFIERS = [
  ['<span class="gdt-mod">⌀</span>', 'Válcové / kruhové pole', 'Před hodnotou: pole je válec (kruh). Bez ⌀ jsou to dvě rovnoběžné roviny.'],
  ['<span class="gdt-mod">S⌀</span>', 'Kulové pole', 'Poloha bodu (např. středu koule) v kouli ⌀t.'],
  ['<span class="gdt-mod gdt-circ">M</span>', 'Maximum materiálu', 'Tolerance se smí zvětšit o to, o kolik je prvek vzdálen od maxima materiálu. Díra Ø20 H7 (20,000–20,021) s polohou ⌀0,1 <span class="gdt-mod gdt-circ">M</span>: při Ø20,021 platí ⌀0,121.'],
  ['<span class="gdt-mod gdt-circ">L</span>', 'Minimum materiálu', 'Totéž obráceně – bonus od minima materiálu; hlídá např. nejmenší tloušťku stěny.'],
  ['<span class="gdt-mod gdt-circ">E</span>', 'Obálka', 'Za rozměrem (Ø50 h6 <span class="gdt-mod gdt-circ">E</span>): prvek nesmí přesáhnout dokonalý válec o rozměru maxima materiálu (hřídel Ø max, díra Ø min) – tvar se vejde do tolerance rozměru.'],
  ['<span class="gdt-mod gdt-circ">P</span>', 'Promítnuté pole', 'Pole platí mimo díl v uvedené délce – např. osa závitové díry tam, kde bude šroub.'],
  ['<span class="gdt-mod gdt-circ">F</span>', 'Volný stav', 'Nepoddajné díly (tenké stěny): platí bez upnutí, po uvolnění.'],
  ['<span class="gdt-mod">CZ</span>', 'Společné pole', 'Několik prvků musí ležet v jednom společném poli (např. dvě čela v jedné rovině).'],
  ['<span class="gdt-ted">50</span>', 'Teoreticky přesný rozměr', 'Rozměr v rámečku nemá toleranci; odchylku hlídá geometrická tolerance (poloha, sklon, profil).'],
  ['<span class="gdt-datum">A</span>', 'Základna', 'Trojúhelník s písmenem na prvku. V rámečku A | B | C = primární, sekundární, terciální; A-B = společná základna (např. dva čepy).'],
];

/** Rámeček tolerance z buněk (HTML). */
function frame(cells) {
  return '<span class="gdt-frame">' + cells.map(function(c) { return '<span>' + c + '</span>'; }).join('') + '</span>';
}

/** HTML sbalitelné sekce pro okno Tolerance. */
export function gdtSectionHTML() {
  var h = '';
  for (var g = 0; g < SYMBOLS.length; g++) {
    var grp = SYMBOLS[g];
    h += '<div class="gdt-group">' + grp.group + '</div>';
    for (var i = 0; i < grp.items.length; i++) {
      var s = grp.items[i];
      var baseCls = s.base === 'ano' ? 'gdt-base-yes' : s.base === 'ne' ? 'gdt-base-no' : 'gdt-base-opt';
      var baseTxt = s.base === 'ano' ? 'se základnou' : s.base === 'ne' ? 'bez základny' : 'se základnou i bez';
      h += '<div class="gdt-item">' + icon(s.k) +
        '<div class="gdt-txt"><div class="gdt-name">' + s.name +
        ' <span class="gdt-base ' + baseCls + '">' + baseTxt + '</span></div>' +
        '<div class="gdt-zone">' + s.zone + '</div>' +
        '<div class="gdt-check"><b>Kontrola:</b> ' + s.check + '</div></div></div>';
    }
  }

  var mods = '';
  for (var m = 0; m < MODIFIERS.length; m++) {
    mods += '<div class="gdt-mrow"><span class="gdt-msym">' + MODIFIERS[m][0] + '</span>' +
      '<div class="gdt-txt"><div class="gdt-name">' + MODIFIERS[m][1] + '</div>' +
      '<div class="gdt-zone">' + MODIFIERS[m][2] + '</div></div></div>';
  }

  var read =
    '<div class="gdt-ex">' + frame([icon('runout'), '0,02', 'A']) +
      '<div class="gdt-zone">Kruhové házení nejvýše 0,02 mm vůči ose základny A. ' +
      'Šipka rámečku ukazuje na tolerovanou plochu.</div></div>' +
    '<div class="gdt-ex">' + frame([icon('position'), '⌀0,1 <span class="gdt-mod gdt-circ">M</span>', 'A', 'B', 'C']) +
      '<div class="gdt-zone">Osa díry ve válci ⌀0,1 v poloze dané teoreticky přesnými rozměry od základen ' +
      'A, B, C (v tomto pořadí); bonus z maxima materiálu.</div></div>' +
    '<div class="gdt-ex">' + frame([icon('flat'), '0,05']) +
      '<div class="gdt-zone">Rovinnost 0,05 mm – tvar, bez základny.</div></div>';

  return '<details class="tol-free"><summary>Geometrické tolerance – značky ČSN EN ISO 1101</summary>' +
    '<div class="gdt">' +
      '<div class="gdt-note">Rámeček: <b>značka | hodnota t (mm) a doplňky | základny</b>. ' +
        'Pole tolerance = prostor, ve kterém musí ležet celý tolerovaný prvek.</div>' +
      read +
      h +
      '<div class="gdt-group">Doplňkové značky</div>' + mods +
      '<div class="gdt-note"><b>Na karuselu / soustruhu:</b> měření v upnutí se vztahuje k ose stolu (vřetena). ' +
        'K základně A platí jen tehdy, když je A obrobena ve stejném upnutí, nebo je díl na A vystředěn.</div>' +
      '<div class="gdt-note"><b>ISO 8015 (princip nezávislosti):</b> rozměr a geometrie se kontrolují zvlášť – ' +
        'mikrometr v toleranci neříká nic o tvaru. Spojení jen přes <span class="gdt-mod gdt-circ">E</span>. Netolerované geometrie: ISO 2768-2 výše.</div>' +
    '</div></details>';
}
