// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Hershey single-line fonty pro CNC gravuru         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Renderuje text jako pole SKICA polylines (otevřené, single-stroke).
// Každé písmeno má jeden nebo více tahů — frézka projíždí každý tah
// jedním průchodem, žádný vnější/vnitřní obrys jako u outline fontů.
//
// Dostupné fonty (každý ASCII 33–126):
//   - 'futural' (Sans, default)
//   - 'futuram' (Sans bold)
//   - 'timesr'  (Serif)
//   - 'scripts' (Handwriting script)
//
// Souřadnice glyphů jsou v Hershey jednotkách (~21 jednotek na výšku
// kapitálky), Y dolů. Pro SKICA Y-up se Y neguje při renderingu.

import futuralFont from './hershey/futural.json' with { type: 'json' };
import futuramFont from './hershey/futuram.json' with { type: 'json' };
import timesrFont  from './hershey/timesr.json'  with { type: 'json' };
import scriptsFont from './hershey/scripts.json' with { type: 'json' };

// Registry dostupných fontů + jejich UI labelů
const FONTS = {
  futural: { font: futuralFont, label: 'Sans 1-stroke' },
  futuram: { font: futuramFont, label: 'Sans bold' },
  timesr:  { font: timesrFont,  label: 'Serif' },
  scripts: { font: scriptsFont, label: 'Script' },
};
const DEFAULT_FONT = 'futural';

/** @returns {Array<{id:string, label:string}>} */
export function listHersheyFonts() {
  return Object.entries(FONTS).map(([id, v]) => ({ id, label: v.label }));
}

function getFontData(fontName) {
  return (FONTS[fontName] && FONTS[fontName].font) || FONTS[DEFAULT_FONT].font;
}

// Měřítko: typická výška kapitálky v Hershey ≈ 21 jednotek → požadovaný fontSize
const HERSHEY_CAP_HEIGHT = 21;
// Hershey kerning multiplier (převod glyph.o → reálný advance v Hershey jednotkách).
// Originál hersheytextjs používá 1.68 pro Hershey fonty.
const HERSHEY_ADVANCE_MULT = 1.68;
// Šířka mezery v Hershey jednotkách (mezera nemá vlastní glyph,
// futural používá ~10 jednotek = polovina běžné kapitálky).
const SPACE_ADVANCE = 10 * HERSHEY_ADVANCE_MULT;

/**
 * Parsuje Hershey `d` string na pole tahů. Podporuje DVA formáty:
 *
 *   Starý (původní hersheytext.json):
 *     "M9,1 L1,22 M9,1 L17,22 M4,15 L14,15"
 *     M začíná nový tah, L pokračuje (volitelné). Prefix přilepený na číslo.
 *
 *   Nový (komprimovaný, scripts/compressHershey.js):
 *     "9,1;1,22|9,1;17,22|4,15;14,15"
 *     '|' odděluje tahy, ';' body uvnitř tahu. Bez M/L tokenů.
 *
 * @returns {Array<Array<{x:number, y:number}>>}
 */
function parseHersheyD(d) {
  if (!d) return [];

  // Detekce nového formátu: obsahuje '|' nebo ';' (a žádné M/L)
  const isCompact = (d.indexOf('|') >= 0 || d.indexOf(';') >= 0) && d.indexOf('M') < 0;
  if (isCompact) {
    const strokes = [];
    for (const seg of d.split('|')) {
      const pts = [];
      for (const xy of seg.split(';')) {
        if (!xy) continue;
        const [xs, ys] = xy.split(',');
        const x = parseFloat(xs), y = parseFloat(ys);
        if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
      }
      if (pts.length >= 2) strokes.push(pts);
    }
    return strokes;
  }

  // Starý formát – M/L tokeny
  const strokes = [];
  let current = null;
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

/**
 * Vrátí { d, o } pro daný glyph bez ohledu na formát uložení.
 * Nový kompaktní formát: tuple [o, d]. Starý: objekt { d, o }.
 */
function readGlyph(glyph) {
  if (Array.isArray(glyph)) return { o: glyph[0] || 0, d: glyph[1] || '' };
  return { o: glyph.o || 0, d: glyph.d || '' };
}

/**
 * Renderuje jeden znak z daného fontu na pole tahů.
 * Mapování: `chars[ASCII - 33]` (Hershey začíná na '!'), mezera (32) se
 * řeší separátně. Y se neguje (Hershey má Y dolů).
 */
function renderGlyph(char, fontData) {
  const code = char.charCodeAt(0);
  if (code === 32) return { strokes: [], advance: SPACE_ADVANCE };
  if (code < 33 || code > 126) return { strokes: [], advance: 0 };
  const raw = fontData.chars[code - 33];
  if (!raw) return { strokes: [], advance: 0 };
  const { d, o } = readGlyph(raw);
  const strokes = parseHersheyD(d).map(stroke =>
    stroke.map(p => ({ x: p.x, y: -p.y })),
  );
  const advance = o * HERSHEY_ADVANCE_MULT;
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
 * @param {string} [fontName='futural']  id fontu (viz listHersheyFonts)
 * @returns {Array<{vertices:{x:number,y:number}[], bulges:number[], closed:boolean}>}
 */
export function renderHersheyText(text, fontSize, cx = 0, cy = 0, rotation = 0, fontName = DEFAULT_FONT) {
  if (!text || !fontSize) return [];
  const fontData = getFontData(fontName);
  const scale = fontSize / HERSHEY_CAP_HEIGHT;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const out = [];

  let cursorX = 0;
  for (const ch of String(text)) {
    if (ch === '\n') continue; // newlines zatím nepodporujeme
    const { strokes, advance } = renderGlyph(ch, fontData);
    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      const vertices = stroke.map(p => {
        const localX = p.x * scale + cursorX;
        const localY = p.y * scale;
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
export function measureHersheyText(text, fontSize, fontName = DEFAULT_FONT) {
  if (!text || !fontSize) return { width: 0, height: fontSize || 0 };
  const fontData = getFontData(fontName);
  const scale = fontSize / HERSHEY_CAP_HEIGHT;
  let width = 0;
  for (const ch of String(text)) {
    if (ch === '\n') continue;
    const code = ch.charCodeAt(0);
    if (code === 32) { width += SPACE_ADVANCE * scale; continue; }
    if (code < 33 || code > 126) continue;
    const raw = fontData.chars[code - 33];
    if (raw) width += readGlyph(raw).o * HERSHEY_ADVANCE_MULT * scale;
  }
  return { width, height: fontSize };
}

// Zpětná kompatibilita
export { futuralFont };
