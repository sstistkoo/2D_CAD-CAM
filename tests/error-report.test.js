// @vitest-environment happy-dom
// Viditelné hlášení chyb (js/errorReport.js): neošetřená chyba ukáže lištu
// „⚠ Něco se pokazilo" a „📋 Zkopírovat pro Clauda" dá do schránky popis
// chyby + verzi + prohlížeč (bez výkresu).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { installErrorReporter, entryFromEvent, buildReport } from '../js/errorReport.js';
import { APP_VERSION } from '../js/constants.js';

let rep = null;
afterEach(() => { rep?.uninstall(); rep = null; vi.restoreAllMocks(); });

const fire = (err, extra = {}) => window.dispatchEvent(new ErrorEvent('error', { error: err, message: err?.message, filename: 'http://localhost/js/x.js', lineno: 12, colno: 3, ...extra }));

describe('errorReport', () => {
  it('neošetřená chyba ukáže lištu s textem chyby', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    rep = installErrorReporter();
    fire(new Error('S is not defined'));
    const bar = document.querySelector('.err-report');
    expect(bar).not.toBeNull();
    expect(bar.textContent).toContain('Něco se pokazilo');
    expect(bar.textContent).toContain('S is not defined');
    expect(bar.querySelector('.err-report-copy').textContent).toContain('Zkopírovat pro Clauda');
  });

  it('další chyby se počítají v jedné liště, ✕ ji zavře a smaže', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    rep = installErrorReporter();
    fire(new Error('první'));
    fire(new Error('druhá'));
    expect(document.querySelectorAll('.err-report')).toHaveLength(1);
    expect(document.querySelector('.err-report').textContent).toContain('(2×)');
    document.querySelector('.err-report-close').click();
    expect(document.querySelector('.err-report')).toBeNull();
    expect(rep.entries).toHaveLength(0);
  });

  it('kopírování: verze, místo a stack, žádný ?query z adresy', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    rep = installErrorReporter();
    fire(new Error('boom'));
    document.querySelector('.err-report-copy').click();
    await new Promise(r => setTimeout(r, 0));
    const text = writeText.mock.calls[0][0];
    expect(text).toContain(`Verze: v${APP_VERSION}`);
    expect(text).toContain('chyba: boom');
    expect(text).toContain('místo: http://localhost/js/x.js:12:3');
    expect(text).not.toContain('?');
    expect(document.querySelector('.err-report-copy').textContent).toContain('Zkopírováno');
  });

  it('promise rejection se hlásí taky', () => {
    const en = entryFromEvent({ type: 'unhandledrejection', reason: new Error('async fail') });
    expect(en).toMatchObject({ kind: 'promise', message: 'async fail' });
  });

  it('šum prohlížeče a rozšíření se ignoruje', () => {
    expect(entryFromEvent({ type: 'error', message: 'ResizeObserver loop completed with undelivered notifications.' })).toBeNull();
    expect(entryFromEvent({ type: 'error', message: 'Script error.' })).toBeNull();
    expect(entryFromEvent({ type: 'error', message: 'x', filename: 'chrome-extension://abc/content.js' })).toBeNull();
  });

  it('buildReport čísluje chyby a odsadí stack', () => {
    const txt = buildReport([{ time: '7:00:00', kind: 'chyba', message: 'a', source: '', stack: 'Error: a\n    at f (x.js:1:1)' }],
      { version: 'v9', url: 'u', userAgent: 'ua', screen: 's' });
    expect(txt).toContain('1) [7:00:00] chyba: a');
    expect(txt).toContain('   at f (x.js:1:1)');
  });
});
