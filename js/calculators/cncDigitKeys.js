/** Číselné klávesy 0–9, „.“ a „-“ (po třech, jako numerická klávesnice) do kreslicí lišty – vidět jen naležato (viz landscape-mobile.css). */
export function digitKeysHTML() {
  return '789456123.0-'.split('').map(function(c) {
    return '<button class="cne-qb cne-qb-digit c20" data-ins="' + c + '">' + c + '</button>';
  }).join('') + '<span class="cne-digit-sep"></span>';
}
