// @vitest-environment happy-dom
// Referenční příručky Fanuc a Heidenhain (kalkulačky → tlačítka Fanuc / Heidenhain).
// Hlídá úplnost dat (každé jméno ve skupině má kartu, žádné duplicity) a funkci oken.
import { describe, it, expect, afterEach } from 'vitest';
import { fanucGGroups, fanucGItems, fanucMGroups, fanucMItems } from '../js/calculators/fanucRefData.js';
import { fanucMacroGroups, fanucMacroItems, fanucExamples } from '../js/calculators/fanucRefMacro.js';
import { hhKlartextGroups, hhKlartextItems, hhIsoGroups, hhIsoItems, hhMGroups, hhMItems } from '../js/calculators/heidenhainRefData.js';
import { hhQGroups, hhQItems, hhCycleGroups, hhCycleItems, hhExamples } from '../js/calculators/heidenhainRefCycles.js';
import { snAlarmGroups, snAlarmItems } from '../js/calculators/sinumerikAlarms.js';
import { fanucAlarmGroups, fanucAlarmItems } from '../js/calculators/fanucAlarms.js';
import { hhAlarmGroups, hhAlarmItems } from '../js/calculators/heidenhainAlarms.js';
import { snToolGroups, snToolItems } from '../js/calculators/sinumerikTools.js';
import { fanucOffsetGroups, fanucOffsetItems } from '../js/calculators/fanucOffsets.js';
import { hhToolGroups, hhToolItems } from '../js/calculators/heidenhainTools.js';
import { openSinumerikHub } from '../js/calculators/sinumerikHub.js';
import { openFanucHub } from '../js/calculators/fanucHub.js';
import { openHeidenhainHub } from '../js/calculators/heidenhainHub.js';

const SETS = {
  'Fanuc G': [fanucGGroups, fanucGItems],
  'Fanuc M': [fanucMGroups, fanucMItems],
  'Fanuc makro': [fanucMacroGroups, fanucMacroItems],
  'Heidenhain Klartext': [hhKlartextGroups, hhKlartextItems],
  'Heidenhain ISO': [hhIsoGroups, hhIsoItems],
  'Heidenhain M': [hhMGroups, hhMItems],
  'Heidenhain Q': [hhQGroups, hhQItems],
  'Heidenhain cykly': [hhCycleGroups, hhCycleItems],
  'Sinumerik alarmy': [snAlarmGroups, snAlarmItems],
  'Sinumerik nástroje': [snToolGroups, snToolItems],
  'Fanuc korekce': [fanucOffsetGroups, fanucOffsetItems],
  'Heidenhain nástroje': [hhToolGroups, hhToolItems],
  'Fanuc alarmy': [fanucAlarmGroups, fanucAlarmItems],
  'Heidenhain chyby': [hhAlarmGroups, hhAlarmItems]
};

describe('data příruček', () => {
  for (const [label, [groups, items]] of Object.entries(SETS)) {
    it(`${label}: položky jsou úplné a bez duplicit`, () => {
      const names = items.map(i => i.name);
      expect(new Set(names).size, 'duplicitní jména').toBe(names.length);
      for (const i of items) {
        expect(i.syntax, i.name).toBeTruthy();
        expect(i.description, i.name).toBeTruthy();
      }
    });
    it(`${label}: každé jméno ve skupině má kartu a každá karta je ve skupině`, () => {
      const names = new Set(items.map(i => i.name));
      const grouped = Object.values(groups).flat();
      for (const g of grouped) expect(names.has(g), `skupina odkazuje na neexistující „${g}“`).toBe(true);
      for (const n of names) expect(grouped.includes(n), `„${n}“ není v žádné skupině`).toBe(true);
    });
  }
  it('Sinumerik Nástroje: opotřebení je hlavní (první) skupina a odpovídá na „−0,2“', () => {
    expect(Object.keys(snToolGroups)[0]).toBe('Opotřebení (hlavní)');
    const hlavni = snToolItems.find(i => i.name === 'Co dělá −0,2');
    expect(hlavni.syntax).toContain('PRŮMĚR');
    expect(snToolItems.find(i => i.name === 'Test −0,2')).toBeTruthy();
  });
  it('Fanuc: kód v příkladech nemá „;“ (u Fanuca konec bloku) ani G91 (systém A)', () => {
    const codes = [...fanucGItems, ...fanucMItems, ...fanucMacroItems, ...fanucAlarmItems, ...fanucOffsetItems]
      .flatMap(i => i.examples.map(e => e.code)).concat(fanucExamples.map(e => e.code));
    for (const c of codes) {
      expect(c, c).not.toContain(';');
      expect(c, c).not.toMatch(/\bG91\b/);
    }
  });
  it('ukázky mají titulek a kód', () => {
    for (const ex of [...fanucExamples, ...hhExamples]) {
      expect(ex.title).toBeTruthy();
      expect(ex.code.length).toBeGreaterThan(10);
    }
  });
});

describe('okna příruček', () => {
  afterEach(() => document.querySelectorAll('.calc-overlay').forEach(o => o.remove()));
  const tiles = () => [...document.querySelectorAll('.sn-tile')];

  for (const [label, open, count] of [['Sinumerik', openSinumerikHub, 9], ['Fanuc', openFanucHub, 6], ['Heidenhain', openHeidenhainHub, 8]]) {
    it(`${label}: rozcestník otevře každou dlaždici a zavře sám sebe`, () => {
      for (let i = 0; i < count; i++) {
        open();
        expect(tiles().length).toBe(count);
        tiles()[i].click();
        expect(document.querySelector('.sn-grid'), 'rozcestník zůstal otevřený').toBeNull();
        const win = document.querySelector('.calc-overlay');
        expect(win, `dlaždice ${i} neotevřela okno`).toBeTruthy();
        // Sinumerik má i dlaždice bez karet (Zkratky, Nápověda) – jejich okna jsou starší moduly
        if (label !== 'Sinumerik') expect(win.querySelectorAll('.gc-card').length).toBeGreaterThan(0);
        win.remove();
      }
    });
  }

  it('Sinumerik: dlaždice Alarmy otevře seznam alarmů s popiskem „Detail:“', () => {
    openSinumerikHub();
    const idx = tiles().findIndex(t => t.querySelector('.sn-tile-title').textContent === 'Alarmy');
    expect(idx).toBeGreaterThanOrEqual(0);
    tiles()[idx].click();
    const win = document.querySelector('.calc-overlay[data-type="sinumerik-alarms"]');
    expect(win.querySelectorAll('.gc-card').length).toBe(snAlarmItems.length);
    expect(win.querySelector('.gc-syntax-label').textContent).toBe('Detail:');
    expect(win.querySelector('.gc-note')).toBeTruthy();
  });

  it('hledání a filtr kategorie filtrují karty, klik otevře detail', () => {
    openFanucHub();
    tiles()[0].click();
    const win = document.querySelector('.calc-overlay');
    const all = win.querySelectorAll('.gc-card').length;
    const search = win.querySelector('.gc-search');
    search.value = 'g76';
    search.dispatchEvent(new Event('input'));
    const hit = win.querySelectorAll('.gc-card');
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.length).toBeLessThan(all);
    hit[0].click();
    expect(hit[0].classList.contains('gc-card-open')).toBe(true);
    search.value = 'zzzz-nic';
    search.dispatchEvent(new Event('input'));
    expect(win.querySelector('.gc-empty')).toBeTruthy();
    search.value = '';
    search.dispatchEvent(new Event('input'));
    win.querySelector('.gc-chip[data-cat="Závity"]').click();
    expect(win.querySelectorAll('.gc-card').length).toBe(fanucGGroups['Závity'].length);
  });

  it('HTML ve vstupu se escapuje (syntaxe „<“ a „>“ nerozbije stránku)', () => {
    openHeidenhainHub();
    tiles()[1].click();
    const win = document.querySelector('.calc-overlay');
    expect(win.querySelector('script')).toBeNull();
  });
});
