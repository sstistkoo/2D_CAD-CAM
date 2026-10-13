// Tlačítka generování drah v CAM simulátoru (js/calculators/cam/genButtons.js):
// u programu z úseků je vidět BUĎ „🔄 Dráhy", NEBO „✂ Po úsecích" — podle
// strategie v panelu (nález uživatele 13. 10. 2026).
import { describe, it, expect, vi } from 'vitest';
import { genButtonsHidden, regenWholeProgram } from '../js/calculators/cam/genButtons.js';

const base = { hasParts: false, allView: false, fromSections: false, face: false, sectionsOk: false };
const h = (o) => genButtonsHidden({ ...base, ...o });

describe('genButtonsHidden', () => {
  it('bez částí: Dráhy vždy, Po úsecích jen když plán má úseky, Reset ne', () => {
    expect(h({ sectionsOk: true })).toEqual({ refresh: false, section: false, reset: true });
    expect(h({})).toEqual({ refresh: false, section: true, reset: true });
  });

  it('čelně se Po úsecích nikdy neukáže (úseky nemá, klik by skončil chybou)', () => {
    expect(h({ face: true, sectionsOk: true }).section).toBe(true);
    expect(h({ hasParts: true, fromSections: true, face: true }).section).toBe(true);
  });

  it('celý program z úseků, podélně: jen Po úsecích', () => {
    const r = h({ hasParts: true, allView: true, fromSections: true });
    expect(r).toEqual({ refresh: true, section: false, reset: false });
  });

  it('celý program z úseků, čelně: jen Dráhy (nahradí části jedním programem)', () => {
    const r = h({ hasParts: true, allView: true, fromSections: true, face: true });
    expect(r).toEqual({ refresh: false, section: true, reset: false });
  });

  it('celý program z ➕ Operace: Dráhy skryté (generuje se v části)', () => {
    expect(h({ hasParts: true, allView: true }).refresh).toBe(true);
  });

  it('v části z úseků: Dráhy vidět; Po úsecích jen podélně', () => {
    expect(h({ hasParts: true, fromSections: true })).toEqual({ refresh: false, section: false, reset: false });
    expect(h({ hasParts: true, fromSections: true, face: true }).section).toBe(true);
  });
});

describe('regenWholeProgram', () => {
  const deps = (ok, log) => ({
    confirm: async () => ok,
    busy: async (_t, fn) => fn(),
    pushHistory: () => log.push('history'),
    restoreBaseFromLive: () => log.push('base'),
    regen: () => log.push('regen'),
    toast: vi.fn(),
  });

  it('po potvrzení: historie → základ z panelu → bez částí → generování', async () => {
    const log = [];
    const S = { opParts: [{}, {}], activePart: 1 };
    const d = deps(true, log);
    d.regen = () => log.push(`regen parts=${S.opParts.length}`);
    await regenWholeProgram(S, d);
    expect(log).toEqual(['history', 'base', 'regen parts=0']);
    expect(S.activePart).toBe(0);
    expect(d.toast).toHaveBeenCalled();
  });

  it('bez potvrzení se nic nemění', async () => {
    const log = [];
    const S = { opParts: [{}, {}], activePart: 1 };
    await regenWholeProgram(S, deps(false, log));
    expect(log).toEqual([]);
    expect(S.opParts).toHaveLength(2);
  });
});
