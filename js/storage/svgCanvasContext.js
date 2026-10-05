// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – „canvas", který kreslí do SVG                      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Napodobí podmnožinu CanvasRenderingContext2D, kterou používá kreslení kót
// a textu v render.js (drawDimensionOn / drawAutoDimensionOn / drawTextOn),
// a místo kreslení zapisuje SVG prvky. Kóty se tak do SVG kreslí TÍMTÉŽ
// kódem jako na plátno a do PNG – žádná další kopie (šipky, popisky,
// vyhýbání popisků…).
//
// Podporováno: save/restore, translate/rotate/scale, beginPath/moveTo/
// lineTo/arc/rect/closePath, stroke/fill, fillText, measureText,
// setLineDash/getLineDash a vlastnosti fillStyle, strokeStyle, lineWidth,
// font, textAlign, textBaseline, globalAlpha. Cokoli dalšího je no-op.

const NS = 'http://www.w3.org/2000/svg';
const TAU = 2 * Math.PI;
const fmt = (v) => String(Math.round(v * 1000) / 1000);

const ANCHOR = { start: 'start', left: 'start', center: 'middle', right: 'end', end: 'end' };
const BASELINE = {
  top: 'text-before-edge', hanging: 'hanging', middle: 'central',
  bottom: 'text-after-edge', ideographic: 'ideographic',
};

/** Rozloží CSS font („italic bold 17px Consolas") na části pro SVG. */
function parseFont(font) {
  const m = /(?:(italic|oblique)\s+)?(?:(bold|bolder|lighter|\d{3})\s+)?([\d.]+)px\s+(.+)$/i.exec(font || '');
  if (!m) return { size: 10, family: 'sans-serif', weight: null, style: null };
  let family = m[4].trim();
  if (!/,/.test(family) && !/^(serif|sans-serif|monospace)$/i.test(family)) {
    family += /consolas|courier|mono/i.test(family) ? ', monospace' : ', sans-serif';
  }
  return { size: parseFloat(m[3]), family, weight: m[2] || null, style: m[1] || null };
}

export class SvgCanvasContext {
  /**
   * @param {Document} doc dokument, do kterého se prvky vytvářejí
   * @param {Element} parent kam se prvky připojují
   */
  constructor(doc, parent) {
    this._doc = doc;
    this._parent = parent;
    this._st = {
      m: [1, 0, 0, 1, 0, 0], fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
      font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
      dash: [], globalAlpha: 1,
    };
    this._stack = [];
    this._path = [];
    this._cur = null;
    this._start = null;
    this._measure = document.createElement('canvas').getContext('2d');
    /** Rozsah všeho nakresleného (v souřadnicích SVG prvků) */
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  }

  // ── Vlastnosti ──
  get fillStyle() { return this._st.fillStyle; }
  set fillStyle(v) { this._st.fillStyle = v; }
  get strokeStyle() { return this._st.strokeStyle; }
  set strokeStyle(v) { this._st.strokeStyle = v; }
  get lineWidth() { return this._st.lineWidth; }
  set lineWidth(v) { this._st.lineWidth = v; }
  get font() { return this._st.font; }
  set font(v) { this._st.font = v; }
  get textAlign() { return this._st.textAlign; }
  set textAlign(v) { this._st.textAlign = v; }
  get textBaseline() { return this._st.textBaseline; }
  set textBaseline(v) { this._st.textBaseline = v; }
  get globalAlpha() { return this._st.globalAlpha; }
  set globalAlpha(v) { this._st.globalAlpha = v; }

  // ── Stav a transformace ──
  save() { this._stack.push({ ...this._st, m: [...this._st.m], dash: [...this._st.dash] }); }
  restore() { if (this._stack.length) this._st = this._stack.pop(); }
  _mul(a, b, c, d, e, f) {
    const [A, B, C, D, E, F] = this._st.m;
    this._st.m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
  }
  translate(x, y) { this._mul(1, 0, 0, 1, x, y); }
  rotate(t) { const c = Math.cos(t), s = Math.sin(t); this._mul(c, s, -s, c, 0, 0); }
  scale(x, y) { this._mul(x, 0, 0, y, 0, 0); }
  setLineDash(arr) { this._st.dash = Array.isArray(arr) ? [...arr] : []; }
  getLineDash() { return [...this._st.dash]; }

  _pt(x, y) {
    const [a, b, c, d, e, f] = this._st.m;
    return [a * x + c * y + e, b * x + d * y + f];
  }
  _k() { const [a, b] = this._st.m; return Math.hypot(a, b); }
  _grow(x, y) {
    const bb = this.bounds;
    if (x < bb.minX) bb.minX = x; if (x > bb.maxX) bb.maxX = x;
    if (y < bb.minY) bb.minY = y; if (y > bb.maxY) bb.maxY = y;
  }

  // ── Cesta ──
  beginPath() { this._path = []; this._cur = null; this._start = null; }
  moveTo(x, y) {
    const [X, Y] = this._pt(x, y);
    this._path.push(`M${fmt(X)} ${fmt(Y)}`);
    this._cur = this._start = [X, Y];
    this._grow(X, Y);
  }
  lineTo(x, y) {
    if (!this._cur) { this.moveTo(x, y); return; }
    const [X, Y] = this._pt(x, y);
    this._path.push(`L${fmt(X)} ${fmt(Y)}`);
    this._cur = [X, Y];
    this._grow(X, Y);
  }
  closePath() {
    if (!this._cur) return;
    this._path.push('Z');
    this._cur = this._start;
  }
  rect(x, y, w, h) {
    this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h);
    this.closePath();
  }
  /** Oblouk se sémantikou canvasu (úhly v px prostoru, anticlockwise). */
  arc(cx, cy, r, a0, a1, anticlockwise = false) {
    let sweep = anticlockwise ? a0 - a1 : a1 - a0;
    const full = sweep >= TAU - 1e-9;
    if (!full) sweep = ((sweep % TAU) + TAU) % TAU;
    const dir = anticlockwise ? -1 : 1;
    const at = (a) => this._pt(cx + r * Math.cos(a), cy + r * Math.sin(a));
    const [X0, Y0] = at(a0);
    if (this._cur) this.lineTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
    else { this._path.push(`M${fmt(X0)} ${fmt(Y0)}`); this._cur = this._start = [X0, Y0]; this._grow(X0, Y0); }
    const R = r * this._k();
    const [a, b, c, d] = this._st.m;
    let flag = anticlockwise ? 0 : 1;
    if (a * d - b * c < 0) flag = 1 - flag; // zrcadlení mění smysl
    // Plná kružnice = dva půloblouky (jeden SVG oblouk ji neumí)
    const parts = full ? [Math.PI, Math.PI] : [sweep];
    let ang = a0;
    for (const p of parts) {
      ang += dir * p;
      const [X, Y] = at(ang);
      this._path.push(`A${fmt(R)} ${fmt(R)} 0 ${p > Math.PI ? 1 : 0} ${flag} ${fmt(X)} ${fmt(Y)}`);
      this._cur = [X, Y];
    }
    // Rozsah: vzorky po oblouku
    const n = Math.max(2, Math.ceil((full ? TAU : sweep) / (Math.PI / 8)));
    for (let i = 0; i <= n; i++) {
      const [X, Y] = at(a0 + dir * (full ? TAU : sweep) * i / n);
      this._grow(X, Y);
    }
  }

  // ── Výstup ──
  _el(tag, attrs) {
    const el = this._doc.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
    this._parent.appendChild(el);
    return el;
  }
  stroke() {
    if (!this._path.length) return;
    const k = this._k();
    const dash = this._st.dash.length ? this._st.dash.map(v => fmt(v * k)).join(' ') : null;
    this._el('path', {
      d: this._path.join(' '), fill: 'none', stroke: this._st.strokeStyle,
      'stroke-width': fmt(this._st.lineWidth * k), 'stroke-dasharray': dash,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      opacity: this._st.globalAlpha < 1 ? fmt(this._st.globalAlpha) : null,
    });
  }
  fill() {
    if (!this._path.length) return;
    this._el('path', {
      d: this._path.join(' '), fill: this._st.fillStyle, stroke: 'none',
      opacity: this._st.globalAlpha < 1 ? fmt(this._st.globalAlpha) : null,
    });
  }
  measureText(text) {
    this._measure.font = this._st.font;
    return this._measure.measureText(text);
  }
  fillText(text, x, y) {
    const f = parseFont(this._st.font);
    const [a, b, c, d] = this._st.m;
    const [e, g] = this._pt(x, y);
    const el = this._el('text', {
      x: 0, y: 0,
      transform: `matrix(${[a, b, c, d, e, g].map(fmt).join(' ')})`,
      fill: this._st.fillStyle,
      'font-size': fmt(f.size), 'font-family': f.family,
      'font-weight': f.weight, 'font-style': f.style,
      'text-anchor': ANCHOR[this._st.textAlign] || 'start',
      'dominant-baseline': BASELINE[this._st.textBaseline] || null,
      opacity: this._st.globalAlpha < 1 ? fmt(this._st.globalAlpha) : null,
    });
    el.setAttribute('xml:space', 'preserve');
    el.textContent = String(text);
    // Rozsah textu: obdélník šířka × výška písma podle zarovnání, transformovaný
    const w = this.measureText(String(text)).width, h = f.size;
    const x0 = { middle: -w / 2, end: -w }[ANCHOR[this._st.textAlign]] ?? 0;
    const y0 = { top: 0, hanging: 0, middle: -h / 2 }[this._st.textBaseline] ?? -h;
    for (const [px, py] of [[x0, y0], [x0 + w, y0], [x0, y0 + h], [x0 + w, y0 + h]]) {
      this._grow(a * px + c * py + e, b * px + d * py + g);
    }
  }
}
