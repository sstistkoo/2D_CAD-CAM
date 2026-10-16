// Harness pro testy UI výkresu (js/ui.js) v happy-dom.
//
// ui.js má přes 700 ř. kódu, který běží při načtení (listenery tlačítek,
// registrace do `bridge`, MutationObserver, počáteční stav tlačítek). Před
// rozdělením do js/ui/*.js (docs/plan-refaktoringu-ui.md) je potřeba umět
// změřit, CO přesně se při importu stane a V JAKÉM POŘADÍ — přesun nesmí
// listener ztratit ani přehodit (záleží na tom u `document` click/focusin).
//
// Použití (test musí mít v hlavičce `// @vitest-environment happy-dom`):
//   const { ui, effects } = await importUiRecorded();
//   effects.listeners  → ['ui #btnUndo click', …] v pořadí registrace
//   effects.bridgeKeys → klíče `bridge`, které nastavil kód z ui
//   effects.observers  → MutationObserver.observe(…) z ui
//   effects.domChanges → prvky z index.html, které ui při načtení změnilo
//
// Původ volání se pozná ze zásobníku: 'ui' = js/ui.js nebo js/ui/*.js (po
// rozdělení se tedy snímek nezmění), jinak cesta k souboru (js/canvas.js…).
// DOM je stejný jako u simulátoru (installSimDom: <body> z index.html,
// záznamník 2D kontextu) — moduly aplikace hledají prvky už při importu.
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';
import { installSimDom, settle } from './simUi.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const SELF_REL = relative(REPO, fileURLToPath(import.meta.url)).replace(/\\/g, '/');

/** DOM jako v aplikaci (volat před prvním importem modulů aplikace). */
export function installUiDom() {
  installSimDom();
}

/** Odkud se volá: 'ui' pro js/ui.js a js/ui/*, jinak cesta od kořene repa. */
function callerOrigin() {
  const frames = new Error().stack.split('\n').slice(1);
  for (const f of frames) {
    // i Windows: file:///C:/…, C:\… nebo C:/… (písmeno disku se dvojtečkou)
    const m = f.match(/((?:file:\/\/\/?)?(?:[A-Za-z]:)?[\\/][^\s():]+\.m?js):\d+:\d+/);
    if (!m) continue;
    const file = m[1].startsWith('file:') ? fileURLToPath(m[1]) : m[1];
    const rel = relative(REPO, file).replace(/\\/g, '/');
    if (rel === SELF_REL) continue;
    if (rel === 'js/ui.js' || rel.startsWith('js/ui/')) return 'ui';
    return rel;
  }
  return '?';
}

/** Čitelný popis cíle listeneru / observeru. */
export function describeTarget(t) {
  if (t === window) return 'window';
  if (t === document) return 'document';
  if (t === document.body) return 'body';
  if (!t || !t.tagName) return String(t);
  if (t.id) return '#' + t.id;
  let d = t.tagName.toLowerCase();
  if (t.dataset?.tool) d += `[data-tool=${t.dataset.tool}]`;
  else if (t.className && typeof t.className === 'string') d += '.' + t.className.trim().split(/\s+/).join('.');
  return d;
}

// Prototypy, na kterých addEventListener opravdu leží (happy-dom má vlastní
// třídy — globální EventTarget.prototype prvky nedědí).
function listenerOwners() {
  const owners = new Set();
  for (const o of [document, window, document.createElement('div')]) {
    let p = o;
    while (p && !Object.prototype.hasOwnProperty.call(p, 'addEventListener')) p = Object.getPrototypeOf(p);
    if (p) owners.add(p);
  }
  return [...owners];
}

// Popis prvku z index.html pro diff DOM: id, jinak cesta od nejbližšího
// předka s id (počítá se PŘED importem, takže přidané prvky ji neposunou).
function elementPath(el) {
  const parts = [];
  let e = el;
  while (e && e !== document.documentElement) {
    if (e.id) { parts.unshift('#' + e.id); break; }
    const parent = e.parentElement;
    const idx = parent ? [...parent.children].indexOf(e) + 1 : 1;
    parts.unshift(`${e.tagName.toLowerCase()}:${idx}`);
    e = parent;
  }
  if (!e || e === document.documentElement) parts.unshift('html');
  return parts.join('>');
}

const shallowSig = (el) => {
  const attrs = [...el.attributes].map(a => `${a.name}=${a.value}`).sort().join(' ');
  const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).filter(Boolean).join('|');
  const sig = `${attrs}${text ? ` "${text}"` : ''}`;
  return sig.length > 200 ? sig.slice(0, 200) + '…' : sig;
};

function domSnapshot() {
  const snap = new Map();
  for (const el of [document.documentElement, ...document.documentElement.querySelectorAll('*')]) {
    snap.set(el, { path: elementPath(el), sig: shallowSig(el), kids: el.children.length });
  }
  return snap;
}

function domDiff(before) {
  const out = [];
  for (const [el, b] of before) {
    if (!el.isConnected) { out.push(`${b.path}: odebrán`); continue; }
    const sig = shallowSig(el);
    if (sig !== b.sig) out.push(`${b.path}: ${sig}`);
    if (el.children.length !== b.kids) out.push(`${b.path}: dětí ${b.kids} → ${el.children.length}`);
  }
  return out;
}

/**
 * Importuje js/ui.js (jen jednou na test soubor — moduly se cachují)
 * a zaznamená, co kód při načtení udělal. `settleMs` = jak dlouho po importu
 * ještě sledovat asynchronní dozvuky (zapisují se s předponou 'async ').
 */
export async function importUiRecorded({ settleMs = 50 } = {}) {
  installUiDom();
  const { bridge } = await import('../../js/bridge.js');
  const effects = { listeners: [], bridgeKeys: [], observers: [], domChanges: [] };
  let phase = '';

  // ── listenery ──
  const restore = [];
  for (const proto of listenerOwners()) {
    const orig = proto.addEventListener;
    proto.addEventListener = function (type, fn, opts) {
      const origin = callerOrigin();
      const capture = typeof opts === 'boolean' ? opts : !!opts?.capture;
      effects.listeners.push(`${phase}${origin} ${describeTarget(this)} ${type}${capture ? ' capture' : ''}`);
      return orig.call(this, type, fn, opts);
    };
    restore.push(() => { proto.addEventListener = orig; });
  }

  // ── MutationObserver ──
  const moProto = MutationObserver.prototype;
  const origObserve = moProto.observe;
  moProto.observe = function (target, opts) {
    effects.observers.push(`${phase}${callerOrigin()} ${describeTarget(target)} ${JSON.stringify(opts)}`);
    return origObserve.call(this, target, opts);
  };
  restore.push(() => { moProto.observe = origObserve; });

  // ── bridge: existující klíče přes accessor, nové přes Proxy v prototypu ──
  const noteBridge = (k) => {
    const origin = callerOrigin();
    if (origin === 'ui') effects.bridgeKeys.push(`${phase}${String(k)}`);
  };
  const ownKeys = Object.keys(bridge);
  for (const k of ownKeys) {
    let val = bridge[k];
    Object.defineProperty(bridge, k, {
      configurable: true, enumerable: true,
      get: () => val,
      set: (v) => { noteBridge(k); val = v; },
    });
  }
  const origProto = Object.getPrototypeOf(bridge);
  Object.setPrototypeOf(bridge, new Proxy(origProto, {
    set(_t, k, v, recv) {
      noteBridge(k);
      Object.defineProperty(recv, k, { value: v, writable: true, enumerable: true, configurable: true });
      return true;
    },
  }));
  restore.push(() => {
    Object.setPrototypeOf(bridge, origProto);
    for (const k of ownKeys) {
      Object.defineProperty(bridge, k, { value: bridge[k], writable: true, enumerable: true, configurable: true });
    }
  });

  const before = domSnapshot();
  let ui;
  try {
    ui = await import('../../js/ui.js');
    phase = 'async ';
    await settle(settleMs);
  } finally {
    for (const r of restore) r();
  }
  effects.domChanges = domDiff(before);
  return { ui, bridge, effects };
}
