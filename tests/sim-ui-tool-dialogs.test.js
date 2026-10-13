// @vitest-environment happy-dom
// Okna nožů v simulátoru (Fáze 4 rozdělení camSimulator.js — bloky „magazine
// dialog", „Modal ⚙️ Geometrie", „thread picker"): 🔧 Zásobník (rozbalení
// karty, pole, ✅ Použít, ▲▼, ＋, 🗑, tvar, ↩), 🔪 Geometrie (pole, ⇄ ruka,
// ✏️ Upravit → po zavření zpět do slotu), 🧵 výběr závitu. Program je
// „ručně upravený" — změny nože nespouští generátor drah. Test prošel na
// starém kódu před přestěhováním.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installSimDom, openSim, loadFixture, settle } from './helpers/simUi.mjs';

const CONTOUR = [
  { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 40, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 40, z: -62.4, r: 0, mode: 'ABS' },
];

let sim;
beforeAll(async () => {
  installSimDom();
  sim = await openSim(loadFixture('cam/part-1.camprog'));
  const { S } = sim;
  Object.assign(S.params, { mode: 'DIAMON', stockMode: 'cylinder', stockDiameter: 66, stockLength: 66, stockFace: 2, partOffZ: null, threadActive: false, drillActive: false, boreActive: false });
  S.contourPoints = structuredClone(CONTOUR);
  S.manualGCode = ['N10 G0 X100 Z10', 'N20 G1 X40 Z5 F0.2', 'N30 G1 X40 Z-60', 'N40 G0 X100 Z10'].join('\n');
  S.gcodeDirty = true;
  sim.fullUpdate();
});
afterAll(async () => {
  document.querySelector('.cam-geom-overlay [data-act="geom-close"]')?.click();
  document.querySelector('.cam-mag-overlay [data-act="mag-close"]')?.click();
  await sim?.close();
});

const mag = () => document.querySelector('.cam-mag-overlay');
const geom = () => document.querySelector('.cam-geom-overlay');
const inMag = (sel) => mag().querySelector(sel);
const inGeom = (sel) => geom().querySelector(sel);
const clickEl = async (el) => { expect(el).not.toBeNull(); el.click(); await settle(5); };
const changeEl = async (el, v) => { expect(el).not.toBeNull(); el.value = String(v); el.dispatchEvent(new Event('change')); await settle(5); };
const names = () => sim.S.toolMagazine.map(s => `T${s.slot} ${s.name}`);

async function openMagazine() {
  const { S } = sim;
  S.toolConfigOpen = true;
  sim.q('[data-tab="params"]').click();
  await settle(5);
  await clickEl(sim.root.querySelector('[data-act="open-magazine"]'));
  expect(mag()).not.toBeNull();
}

describe('🔧 Zásobník', () => {
  it('otevře se se všemi noži', async () => {
    await openMagazine();
    expect(mag().querySelectorAll('.cam-sim-mag-slot').length).toBe(sim.S.toolMagazine.length);
    expect(names()).toMatchInlineSnapshot(`
      [
        "T1 PSKNR2525M12",
        "T2 PSBNR2525M12",
        "T3 PDJNR2525M15",
        "T4 SRSCR2525M20",
        "T5 SER2525M16",
        "T6 MGEHR2525-5",
        "T7 Vrtak HSS D20",
      ]
    `);
  });

  it('karta: rozbalení, změna Vc (krok historie), ↩ vrátí', async () => {
    const { S } = sim;
    await clickEl(inMag('[data-act="mag-toggle"][data-magidx="1"]'));
    expect(S.editingMagazineSlot).toBe(1);
    const vc0 = S.toolMagazine[1].vc;
    const past = S.past.length;
    await changeEl(inMag('[data-mf="vc"][data-magidx="1"]'), 123);
    expect(S.toolMagazine[1].vc).toBe(123);
    expect(S.past.length).toBe(past + 1);
    await clickEl(inMag('[data-act="mag-undo"]'));
    expect(S.toolMagazine[1].vc).toBe(vc0);
  });

  it('✅ Použít nastaví nůž jako aktivní nástroj', async () => {
    const { S } = sim;
    await clickEl(inMag('[data-act="mag-apply"][data-magidx="1"]'));
    expect(S.activeMagazineSlot).toBe(1);
    expect([S.params.toolName, S.params.toolShape]).toEqual([S.toolMagazine[1].name, S.toolMagazine[1].shape]);
  });

  it('▼ prohodí nože (čísla T zůstanou v pořadí), ＋ přidá, 🗑 smaže, tvar karty', async () => {
    const { S } = sim;
    const before = names();
    await clickEl(inMag('[data-act="mag-down"][data-magidx="0"]'));
    const after = names();
    expect(after.map(n => n.split(' ')[0])).toEqual(before.map(n => n.split(' ')[0]));
    expect(after[0].split(' ').slice(1)).toEqual(before[1].split(' ').slice(1));
    expect(after[1].split(' ').slice(1)).toEqual(before[0].split(' ').slice(1));
    await clickEl(inMag('[data-act="mag-up"][data-magidx="1"]'));
    expect(names()).toEqual(before);

    const n = S.toolMagazine.length;
    await clickEl(mag().querySelector('#mag-dlg-add'));
    expect(S.toolMagazine.length).toBe(n + 1);
    expect(S.editingMagazineSlot).toBe(n);
    await clickEl(inMag(`[data-mshape="parting"][data-magidx="${n}"]`));
    expect(S.toolMagazine[n].shape).toBe('parting');
    await clickEl(inMag(`[data-act="mag-delete"][data-magidx="${n}"]`));
    await clickEl(document.querySelector('.cam-confirm-ok'));
    expect(S.toolMagazine.length).toBe(n);
  });
});

describe('🔧 Zásobník — ☰ menu a 💾 Uložit aktuální nástroj', () => {
  it('💾 → Do zásobníku: nový slot s názvem, aktivní; ☰ → 🔄 Seřadit vrátí výchozí nože na T1…', async () => {
    const { S } = sim;
    const n = S.toolMagazine.length;
    await clickEl(mag().querySelector('#mag-dlg-save-current'));
    const menu = () => [...document.querySelectorAll('.input-overlay')].find(o => o.querySelector('.cam-mag-menu'));
    expect(menu()).toBeTruthy();
    menu().querySelector('[data-act="save-name"]').value = 'Můj nůž';
    await clickEl(menu().querySelector('[data-mi="0"]'));   // 🔧 Do zásobníku
    expect(S.toolMagazine.length).toBe(n + 1);
    expect(S.toolMagazine[n].name).toBe('Můj nůž');
    expect(S.activeMagazineSlot).toBe(n);
    // Nový nůž na začátek, ať je co řadit: ▲ až na T1.
    for (let i = n; i > 0; i--) await clickEl(inMag(`[data-act="mag-up"][data-magidx="${i}"]`));
    expect(S.toolMagazine[0].name).toBe('Můj nůž');
    await clickEl(inMag('[data-act="mag-menu"]'));
    await clickEl(menu().querySelector('[data-mi="1"]'));   // 🔄 Seřadit dle výchozích
    expect(names()).toMatchInlineSnapshot(`
      [
        "T1 PSKNR2525M12",
        "T2 PSBNR2525M12",
        "T3 PDJNR2525M15",
        "T4 SRSCR2525M20",
        "T5 SER2525M16",
        "T6 MGEHR2525-5",
        "T7 Vrtak HSS D20",
        "T8 Můj nůž",
      ]
    `);
    // úklid: vlastní nůž (teď poslední) pryč
    const last = S.toolMagazine.length - 1;
    if (S.editingMagazineSlot !== last) await clickEl(inMag(`[data-act="mag-toggle"][data-magidx="${last}"]`));
    await clickEl(inMag(`[data-act="mag-delete"][data-magidx="${last}"]`));
    await clickEl(document.querySelector('.cam-confirm-ok'));
    expect(S.toolMagazine.length).toBe(n);
  });
});

describe('🔪 Geometrie', () => {
  it('z hlavičky zásobníku: pole držáku → S.params, přepnutí záložky, ✕ zavře', async () => {
    const { S } = sim;
    await clickEl(inMag('[data-act="mag-geometry"]'));
    expect(geom()).not.toBeNull();
    const tabBtn = inGeom('[data-act="geom-tab-toggle"]');
    if (!inGeom('[data-p="holderWidth"]')) await clickEl(tabBtn);
    await changeEl(inGeom('[data-p="holderWidth"]'), 27);
    expect(S.params.holderWidth).toBe(27);
    await clickEl(inGeom('[data-act="geom-close"]'));
    expect(geom()).toBeNull();
  });

  it('✏️ Upravit: změna v Geometrii se po zavření zapíše do slotu; ruka jen když se přepnula', async () => {
    const { S } = sim;
    await clickEl(inMag('[data-act="mag-toggle"][data-magidx="2"]'));
    await clickEl(inMag('[data-act="mag-edit"][data-magidx="2"]'));
    expect(S.activeMagazineSlot).toBe(2);
    expect(geom()).not.toBeNull();
    const handBefore = S.toolMagazine[2].holderHand;
    if (!inGeom('[data-p="holderWidth"]')) await clickEl(inGeom('[data-act="geom-tab-toggle"]'));
    await changeEl(inGeom('[data-p="holderWidth"]'), 31);
    await clickEl(inGeom('[data-act="geom-close"]'));
    expect(S.toolMagazine[2].holderWidth).toBe(31);
    expect(S.toolMagazine[2].holderHand).toBe(handBefore);   // ruku nikdo nepřepnul

    await clickEl(inMag('[data-act="mag-edit"][data-magidx="2"]'));
    if (!inGeom('[data-act="geom-toggle-hand"]')) await clickEl(inGeom('[data-act="geom-tab-toggle"]'));
    await clickEl(inGeom('[data-act="geom-toggle-hand"]'));
    const handNow = S.params.holderHand;
    expect(handNow).not.toBe(handBefore);
    await clickEl(inGeom('[data-act="geom-close"]'));
    expect(S.toolMagazine[2].holderHand).toBe(handNow);
    await clickEl(inMag('[data-act="mag-close"]'));
    expect(mag()).toBeNull();
  });
});

describe('🧵 výběr závitu', () => {
  it('klik na řádek tabulky nastaví závit do parametrů', async () => {
    const { S } = sim;
    S.machiningConfigOpen = true; S.machiningSubTab = 'zavit';
    sim.q('[data-tab="params"]').click();
    await settle(5);
    await clickEl(sim.root.querySelector('[data-act="open-threads"], [data-act="thread-pick"]'));
    const row = document.querySelector('[data-thridx="3"]');
    expect(row).not.toBeNull();
    await clickEl(row);
    expect({ name: S.params.threadName, type: S.params.threadType, D: S.params.threadDiameter, P: S.params.threadPitch }).toMatchInlineSnapshot(`
      {
        "D": 1.4,
        "P": 0.3,
        "name": "M1.4",
        "type": "mc",
      }
    `);
    document.querySelector('#thr-pick-close')?.click();
  });
});
