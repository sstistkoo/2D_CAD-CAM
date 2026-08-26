// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM: interní příznaky se z uloženého projektu NEBEROU        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// `orderAwareHolder` nemá ovládací prvek v UI — je to interní příznak
// bezpečnostního modelu (hlídání držáku podle pořadí obrábění), jehož výchozí
// hodnota se 26. 8. 2026 překlopila na `true`.
//
// Jenže `S.params` se ukládá CELÉ: do localStorage, do `.camprog` i do záznamu
// části. Každý projekt uložený PŘED tím datem si v sobě veze `false` a
// `Object.assign(S.params, uložené)` s ním novou výchozí hodnotu přepsal —
// takže bezpečnostní oprava nasazená jako „výchozí zapnuto" neběžela v žádném
// existujícím projektu a uživatel neměl jak ji zapnout (nález 26. 8. 2026:
// oranžová stopa držáku, kterou ta oprava odstraňuje, byla pořád vidět).
import { describe, it, expect } from 'vitest';
import {
  _defaultCamParams, stripCodeOwnedParams, CODE_OWNED_PARAMS,
} from '../js/calculators/cam/camDefaults.js';

describe('CAM: parametry, které vlastní kód', () => {
  it('výchozí hodnoty obsahují každý klíč ze seznamu', () => {
    const def = _defaultCamParams();
    for (const k of CODE_OWNED_PARAMS) expect(def, `chybí výchozí hodnota ${k}`).toHaveProperty(k);
  });

  it('hlídání držáku podle pořadí je výchozí ZAPNUTÉ', () => {
    expect(_defaultCamParams().orderAwareHolder).toBe(true);
  });

  it('starý projekt s vypnutým příznakem výchozí hodnotu NEPŘEPÍŠE', () => {
    // Přesně to, co dělá načtení .camprog / localStorage.
    const saved = { ..._defaultCamParams(), orderAwareHolder: false, depthOfCut: 3 };
    const loaded = Object.assign(_defaultCamParams(), stripCodeOwnedParams(saved));
    expect(loaded.orderAwareHolder).toBe(true);
    // …a ostatní uložené hodnoty se přitom zachovají.
    expect(loaded.depthOfCut).toBe(3);
  });

  it('strip nemění originál a snese i prázdný vstup', () => {
    const saved = { orderAwareHolder: false, feed: 0.3 };
    const out = stripCodeOwnedParams(saved);
    expect(out).not.toHaveProperty('orderAwareHolder');
    expect(saved.orderAwareHolder).toBe(false);   // originál beze změny
    expect(out.feed).toBe(0.3);
    expect(stripCodeOwnedParams(null)).toBe(null);
  });
});
