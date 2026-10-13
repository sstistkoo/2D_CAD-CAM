// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Viditelné hlášení chyb                              ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Neošetřená chyba se dřív zapsala jen do konzole prohlížeče — na mobilu ji
// uživatel nikdy neviděl, jen „něco nefunguje". Teď se ukáže lišta
// „⚠ Něco se pokazilo" s tlačítkem „📋 Zkopírovat pro Clauda": text chyby,
// místo v kódu, verze a prohlížeč — stačí vložit do chatu (13. 10. 2026).
//
// Do hlášení se NEDÁVÁ nic z výkresu ani nastavení — jen chyba a prostředí.

import { APP_VERSION } from './constants.js';

const MAX_ENTRIES = 20;   // víc chyb za sebou je obvykle jedna a táž příčina
const STACK_LINES = 8;

// Hlášky, které nejsou chyba aplikace (prohlížeč, rozšíření, cizí skripty).
const IGNORED = [
  /ResizeObserver loop/i,           // benigní varování layoutu
  /^Script error\.?$/i,             // cizí skript bez detailů (CORS)
];
const IGNORED_SOURCES = /^(chrome|moz|safari)-extension:/i;

/** Zápis jedné chyby z události `error` / `unhandledrejection`, nebo null = ignorovat. */
export function entryFromEvent(e) {
  let err, message, source = '';
  if (e.type === 'unhandledrejection') {
    err = e.reason;
    message = err instanceof Error ? err.message : String(err);
  } else {
    err = e.error;
    message = (err && err.message) || e.message || 'Neznámá chyba';
    if (e.filename) source = `${e.filename}:${e.lineno || 0}:${e.colno || 0}`;
  }
  if (IGNORED.some(re => re.test(message))) return null;
  if (IGNORED_SOURCES.test(e.filename || '') || IGNORED_SOURCES.test((err && err.stack) || '')) return null;
  const stack = err && err.stack ? String(err.stack).split('\n').slice(0, STACK_LINES).join('\n') : '';
  return {
    time: new Date().toLocaleTimeString('cs-CZ'),
    kind: e.type === 'unhandledrejection' ? 'promise' : 'chyba',
    message: String(message),
    source,
    stack,
  };
}

/** Text pro schránku. `info` = { version, url, userAgent, screen }. */
export function buildReport(entries, info) {
  const out = [
    'SKICA – hlášení chyby',
    `Verze: ${info.version}`,
    `Stránka: ${info.url}`,
    `Prohlížeč: ${info.userAgent}`,
    `Obrazovka: ${info.screen}`,
    `Chyby (${entries.length}):`,
  ];
  entries.forEach((en, i) => {
    out.push('', `${i + 1}) [${en.time}] ${en.kind}: ${en.message}`);
    if (en.source) out.push(`   místo: ${en.source}`);
    if (en.stack) out.push(...en.stack.split('\n').map(l => `   ${l.trim()}`));
  });
  return out.join('\n');
}

function envInfo() {
  return {
    version: `v${APP_VERSION}`,
    url: location.origin + location.pathname,   // bez ?query/#hash
    userAgent: navigator.userAgent,
    screen: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio || 1}x`,
  };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    // Záloha pro prohlížeče bez Clipboard API / bez oprávnění.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_e) { ok = false; }
    ta.remove();
    return ok;
  }
}

const CSS = `
.err-report {
  position: fixed; left: 12px; right: 12px; bottom: 84px; margin: 0 auto;
  width: fit-content; max-width: 560px; box-sizing: border-box; z-index: 200000;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 10px 8px 14px; border-radius: 8px;
  background: var(--ctp-mantle, #181825); color: var(--ctp-text, #cdd6f4);
  border: 1px solid var(--ctp-red, #f38ba8);
  box-shadow: 0 6px 24px rgba(0,0,0,0.45);
  font: 13px/1.4 system-ui, sans-serif;
}
.err-report-msg { flex: 1 1 200px; min-width: 0; overflow-wrap: anywhere; }
.err-report-msg b { color: var(--ctp-red, #f38ba8); }
.err-report button {
  border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer;
  font: 600 13px system-ui, sans-serif;
}
.err-report-copy { background: var(--ctp-blue, #89b4fa); color: var(--ctp-base, #1e1e2e); }
.err-report-close { background: var(--ctp-surface1, #45475a); color: var(--ctp-text, #cdd6f4); }
`;

/**
 * Zapne zachytávání neošetřených chyb. Vrací objekt pro testy
 * (`entries`, `report()`, `uninstall()`).
 */
export function installErrorReporter() {
  const entries = [];
  let bar = null, msgEl = null, copyBtn = null;

  function ensureBar() {
    if (bar && bar.isConnected) return;
    if (!document.getElementById('err-report-css')) {
      const st = document.createElement('style');
      st.id = 'err-report-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    bar = document.createElement('div');
    bar.className = 'err-report';
    bar.setAttribute('role', 'alert');
    msgEl = document.createElement('span');
    msgEl.className = 'err-report-msg';
    copyBtn = document.createElement('button');
    copyBtn.className = 'err-report-copy';
    copyBtn.textContent = '📋 Zkopírovat pro Clauda';
    copyBtn.title = 'Zkopíruje popis chyby (bez výkresu) — vložte ho do chatu';
    copyBtn.addEventListener('click', async () => {
      const ok = await copyText(buildReport(entries, envInfo()));
      copyBtn.textContent = ok ? '✓ Zkopírováno' : '✗ Kopírování selhalo';
    });
    const close = document.createElement('button');
    close.className = 'err-report-close';
    close.textContent = '✕';
    close.title = 'Zavřít (chyby se smažou)';
    close.addEventListener('click', () => { entries.length = 0; bar.remove(); });
    bar.append(msgEl, copyBtn, close);
    document.body.appendChild(bar);
  }

  function show() {
    ensureBar();
    const last = entries[entries.length - 1];
    const more = entries.length > 1 ? ` (${entries.length}×)` : '';
    msgEl.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = `⚠ Něco se pokazilo${more}: `;
    msgEl.append(b, document.createTextNode(last.message.slice(0, 160)));
    copyBtn.textContent = '📋 Zkopírovat pro Clauda';
  }

  function onEvent(e) {
    const en = entryFromEvent(e);
    if (!en) return;
    console.error(en.kind === 'promise' ? 'Neošetřený promise rejection:' : 'Neošetřená chyba:', e.error || e.reason || e.message);
    if (entries.length >= MAX_ENTRIES) entries.shift();
    entries.push(en);
    try { show(); } catch (_) { /* hlášení chyby nesmí samo shodit stránku */ }
  }

  window.addEventListener('error', onEvent);
  window.addEventListener('unhandledrejection', onEvent);
  return {
    entries,
    report: () => buildReport(entries, envInfo()),
    uninstall() {
      window.removeEventListener('error', onEvent);
      window.removeEventListener('unhandledrejection', onEvent);
      if (bar) bar.remove();
    },
  };
}
