// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Hershey single-line font pro CNC gravuru          ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Renderuje text jako pole SKICA polylines (otevřené, single-stroke).
// Každé písmeno má jeden nebo více tahů — frézka projíždí každý tah
// jedním průchodem, žádný vnější/vnitřní obrys jako u outline fontů.
//
// Hershey font „futural" (Sans 1-stroke) je ASCII 32–126 (95 znaků).
// Souřadnice jsou v Hershey jednotkách (~21 jednotek na výšku majuskule),
// Y dolů. Pro SKICA Y-up se Y neguje.

import futuralFont from './hershey/futural.json' with { type: 'json' };

// Měřítko: typická výška kapitálky v Hershey ≈ 21 jednotek → požadovaný fontSize
const HERSHEY_CAP_HEIGHT = 21;
// Hershey kerning multiplier (převod glyph.o → reálný advance v Hershey jednotkách).
// Originál hersheytextjs používá 1.68 pro Hershey fonty (1.0 pro SVG fonty).
const HERSHEY_ADVANCE_MULT = 1.68;

/**
 * Parsuje Hershey `d` string (mini SVG-path) na pole tahů.
 * Format: "M x,y L x,y x,y M x,y L x,y" – M začíná nový tah, L pokračuje.
 * Implicitní lineTo: za posledním souřadnicovým páerem mohou následovat
 * další páry bez explicitního L.
 *
 * @returns {Array<Array<{x:number, y:number}>>} pole tahů, každý = pole bodů
 */
function parseHersheyD(d) {
  if (!d) return [];
  const strokes = [];
  let current = null;
  // Hershey tokens jsou např. "M9,1" / "L1,22" / "17,22" – M/L může být
  // prefix přímo nalepený na souřadnice. Rozdělíme bíkém znakem a pro
  // každý token zjistíme příkaz a hodnoty.
  const tokens = d.split(/\s+/).filter(t => t.length > 0);
  for (const tok of tokens) {
    let cmd = '';
    let coords = tok;
    const first = tok[0];
    if (first === 'M' || first === 'L') {
      cmd = first;
      coords = tok.slice(1);
    }
    const [xs, ys] = coords.split(',');
    const x = parseFloat(xs), y = parseFloat(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (cmd === 'M' || !current) {
      current = [];
      strokes.push(current);
    }
    current.push({ x, y });
  }
  return strokes.filter(s => s.length >= 2);
}

// Šířka mezery v Hershey jednotkách (mezera nemá vlastní glyph,
// futural používá ~10 jednotek = polovina běžné kapitálky).
const SPACE_ADVANCE = 10 * HERSHEY_ADVANCE_MULT;

/**
 * Renderuje jeden znak (ASCII 33–126) na pole SKICA polylines.
 * Mapování: `chars[code - 33]` (Hershey začíná na ASCII 33 = '!'),
 * mezera (ASCII 32) se řeší separátně. Souřadnice jsou v Hershey
 * jednotkách relativně ke středu glyphu (X=0) a baseline (Y=0).
 * Y se neguje (Hershey má Y dolů).
 *
 * @param {string} char        jeden ASCII znak
 * @returns {{strokes:Array<Array<{x:number,y:number}>>, advance:number}}
 *           advance = šířka glyphu v Hershey jednotkách (= 2 × o)
 */
function renderGlyph(char) {
  const code = char.charCodeAt(0);
  if (code === 32) return { strokes: [], advance: SPACE_ADVANCE };
  if (code < 33 || code > 126) return { strokes: [], advance: 0 };
  const glyph = futuralFont.chars[code - 33];
  if (!glyph) return { strokes: [], advance: 0 };
  const strokes = parseHersheyD(glyph.d).map(stroke =>
    stroke.map(p => ({ x: p.x, y: -p.y })),  // Hershey Y-dolů → Y-up
  );
  // Reálný advance je `o * 1.68` (kerning multiplier použitý v originál
  // hersheytextjs). Glyph se posune o cursorX bez dalšího centrování –
  // souřadnice glyphu jsou již položené tak, že sousední znaky jen mírně
  // překrývají v očekávané kerning oblasti.
  const advance = (glyph.o || 0) * HERSHEY_ADVANCE_MULT;
  return { strokes, advance };
}

/**
 * Renderuje text jako pole SKICA polylines.
 * Výsledné polylines jsou *open* (jednotlivé tahy), Y už upravená.
 *
 * @param {string} text          řetězec ASCII
 * @param {number} fontSize      cílová výška kapitálky v mm
 * @param {number} cx            X počátku (levý okraj prvního znaku)
 * @param {number} cy            Y baseline
 * @param {number} [rotation=0]  rotace okolo (cx, cy) v radiánech
 * @returns {Array<{vertices:{x:number,y:number}[], bulges:number[], closed:boolean}>}
 */
export function renderHersheyText(text, fontSize, cx = 0, cy = 0, rotation = 0) {
  if (!text || !fontSize) return [];
  const scale = fontSize / HERSHEY_CAP_HEIGHT;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const out = [];

  let cursorX = 0;
  for (const ch of String(text)) {
    if (ch === '\n') {
      // Nový řádek: posun dolů o 1.4 × fontSize, cursor reset
      // (zatím nepodporujeme – jednoduchý single-line text)
      continue;
    }
    const { strokes, advance } = renderGlyph(ch);
    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      const vertices = stroke.map(p => {
        // Glyph souřadnice jsou v Hershey jednotkách; posun glyphu = cursorX.
        const localX = p.x * scale + cursorX;
        const localY = p.y * scale;
        // Rotace okolo (0,0) a translace na (cx, cy)
        const rx = localX * cosR - localY * sinR;
        const ry = localX * sinR + localY * cosR;
        return { x: cx + rx, y: cy + ry };
      });
      out.push({
        vertices,
        bulges: vertices.map(() => 0),
        closed: false,
      });
    }
    cursorX += advance * scale;
  }
  return out;
}

/**
 * Spočítá rozměry vykresleného textu (bez vytváření polyline objektů).
 * @returns {{width:number, height:number}}
 */
export function measureHersheyText(text, fontSize) {
  if (!text || !fontSize) return { width: 0, height: fontSize || 0 };
  const scale = fontSize / HERSHEY_CAP_HEIGHT;
  let width = 0;
  for (const ch of String(text)) {
    if (ch === '\n') continue;
    const code = ch.charCodeAt(0);
    if (code === 32) { width += SPACE_ADVANCE * scale; continue; }
    if (code < 33 || code > 126) continue;
    const glyph = futuralFont.chars[code - 33];
    if (glyph) width += (glyph.o || 0) * HERSHEY_ADVANCE_MULT * scale;
  }
  return { width, height: fontSize };
}

export { futuralFont };
