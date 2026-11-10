// Hlavička programu v CAM/CNC Editoru (js/calculators/gcodeEditorHeader.js).
// Do 10. 11. 2026 měl každý editor shodnou kopii a nic ji netestovalo; kód se
// přesunul doslova, tyhle očekávané řádky zamykají jeho výstup.
import { describe, it, expect, vi } from 'vitest';

// gcodeEditorShared.js → geometry.js → render.js sahá na DOM (jako gcode-editor-corners).
vi.mock('../js/render.js', () => ({ renderAll: vi.fn(), renderAllDebounced: vi.fn() }));
import { buildHeaderLines, insertHeader, headerSettingsHTML, headerTitle, readHeaderInputs } from '../js/calculators/gcodeEditorHeader.js';
import { defaultHeaderConfig } from '../js/calculators/gcodeEditorShared.js';

const g96 = () => { const h = defaultHeaderConfig(); h.spindle.mode = 'G96'; return h; };

describe('buildHeaderLines', () => {
  it('Sinumerik: STOPRE před výměnou i na konci, T/D na dvou řádcích', () => {
    expect(buildHeaderLines(defaultHeaderConfig(), 'sinumerik')).toEqual([
      'N10 M41', 'N20 STOPRE', 'N30 M80', 'N40 T1', '      D1', 'N50 G54 G95 G90', 'N60 G97 S500 M4', 'N70 STOPRE',
    ]);
  });

  it('Sinumerik G96: LIMS ve stejném bloku', () => {
    expect(buildHeaderLines(g96(), 'sinumerik')).toContain('N60 G96 LIMS=2000 S500 M4');
  });

  it('Fanuc: T0101, bez STOPRE, G96 s G50 S před ním', () => {
    expect(buildHeaderLines(defaultHeaderConfig(), 'fanuc')).toEqual([
      'N10 M41', 'N20 M80', 'N30 T0101', 'N40 G54 G95 G90', 'N50 G97 S500 M4',
    ]);
    expect(buildHeaderLines(g96(), 'fanuc').slice(-2)).toEqual(['N50 G50 S2000', 'N60 G96 S500 M4']);
  });

  it('Heidenhain: T.. M6, bez LIMS i u G96', () => {
    expect(buildHeaderLines(g96(), 'heidenhain')).toEqual([
      'N10 M41', 'N20 M80', 'N30 T1 M6', 'N40 G54 G95 G90', 'N50 G96 S500 M4',
    ]);
  });

  it('vypnuté položky se nepíšou; G90 zůstává vždy', () => {
    const h = defaultHeaderConfig();
    for (const k of Object.keys(h)) h[k].active = false;
    expect(buildHeaderLines(h, 'fanuc')).toEqual(['N10 G90']);
    expect(buildHeaderLines(h, 'sinumerik')).toEqual(['N10 STOPRE', 'N20 G90', 'N30 STOPRE']);
  });
});

describe('insertHeader', () => {
  it('na začátek programu, za úvodní MSG', () => {
    expect(insertHeader('G0 X1', ['N10 G90'])).toBe('N10 G90\nG0 X1');
    expect(insertHeader('MSG("DIL")\nG0 X1', ['N10 G90'])).toBe('MSG("DIL")\nN10 G90\nG0 X1');
  });
});

describe('formulář', () => {
  it('nadpis podle řízení (neznámé = Sinumerik)', () => {
    expect(headerTitle('fanuc')).toBe('Generovat hlavičku programu (FANUC)');
    expect(headerTitle('?')).toBe('Generovat hlavičku programu (SINUMERIK)');
  });

  it('HTML nese hodnoty a výběr z konfigurace', () => {
    const html = headerSettingsHTML(g96());
    expect(html).toMatch(/data-hdr="gear" checked/);
    expect(html).toMatch(/<option value="G96" selected>G96 \(konst\. řez\.\)/);
    expect(html).toMatch(/data-hdr-v="spindle\.lims" value="2000"/);
  });

  it('readHeaderInputs zapíše zaškrtnutí i hodnoty do konfigurace', () => {
    const cfg = defaultHeaderConfig();
    const els = {
      '[data-hdr]': [{ dataset: { hdr: 'door' }, checked: false }, { dataset: { hdr: 'nic' }, checked: true }],
      '[data-hdr-v]': [{ dataset: { hdrV: 'tool.t' }, value: '7' }, { dataset: { hdrV: 'spindle.mode' }, value: 'G96' }],
    };
    readHeaderInputs({ querySelectorAll: (sel) => els[sel] }, cfg);
    expect(cfg.door.active).toBe(false);
    expect(cfg.tool.t).toBe('7');
    expect(cfg.spindle.mode).toBe('G96');
    expect(cfg.nic).toBeUndefined();
  });
});
