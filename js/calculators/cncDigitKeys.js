/** Číselné klávesy 0–9, „.“ a „-“ (po třech, jako numerická klávesnice) do kreslicí lišty – vidět jen naležato (viz landscape-mobile.css). */
export function digitKeysHTML() {
  return '789456123.0-'.split('').map(function(c) {
    return '<button class="cne-qb cne-qb-digit c20" data-ins="' + c + '">' + c + '</button>';
  }).join('') + '<span class="cne-digit-sep"></span>';
}

/** Totéž pro běžnou lištu CNC editoru (7 sloupců) – číslice ve vlastní mřížce po třech přes celou šířku. */
export function digitPadHTML() {
  return '<div class="cne-digit-pad">' + '789456123.0-'.split('').map(function(c) {
    return '<button class="cne-qb cne-qb-digit" data-ins="' + c + '">' + c + '</button>';
  }).join('') + '</div>';
}

/** Jsou číslice v liště právě vidět? (CSS je ukazuje jen naležato.) Pak se číselník k písmenům neotevírá. */
export function digitKeysVisible(root) {
  const b = root && root.querySelector('.cne-qb-digit');
  return !!b && b.getClientRects().length > 0;
}

/** Písmeno osy vložené přímo (bez číselníku): když kurzor stojí hned za slovem, oddělí ho mezerou. */
export function spacedPrefix(editor, prefix) {
  const prev = editor ? editor.value[editor.selectionStart - 1] : '';
  return (prev && !/\s/.test(prev) ? ' ' : '') + prefix;
}
