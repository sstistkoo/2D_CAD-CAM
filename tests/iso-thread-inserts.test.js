// Závitové destičky 📚 ISO katalogu (js/calculators/isoThreadInserts.js):
// zub dosáhne do hloubky závitu v celém rozsahu stoupání destičky, plný
// profil Tr/Acme má špičku = dno závitu, destička se vejde do dříku,
// automatický výběr nože hlídá stoupání a rada řekne, kterou destičku přidat.
// K tomu hloubka Tr podle ISO 2904 (vůle ac podle stoupání).
import { describe, it, expect } from 'vitest';
import {
  ISO_THREAD_INSERTS, isoThreadInsertsFor, isoThreadTooth, isoThreadInsertByCode, isoThreadShanksFor,
  threadInsertFitsPitch, isoThreadInsertHint, threadInsertFitsSide,
} from '../js/calculators/isoThreadInserts.js';
import { isoThreadInsertsForBar, isoThreadBarsFor, isoInternalThreadHint, isoBarFitsHole } from '../js/calculators/isoInternalTools.js';
import { buildIsoKnife, ISO_SHANKS } from '../js/calculators/isoToolCatalog.js';
import { threadProfileDepth } from '../js/calculators/cam/threadHelpers.js';
import { buildInsertOutlineSegments, threadingInsertEdgeMM } from '../js/calculators/cam/insertPreview.js';
import { mCoarse, mFine, uncThreads, unfThreads, gThreads, trThreads, acmeThreads, trClearanceAc } from '../js/calculators/threadData.js';

const typeOf = (ins) => (ins.kind === 'partial' ? (ins.angle === 55 ? 'bsw' : 'mc') : ins.kind);
const pitchOf = (t) => (t.P !== undefined ? t.P : 25.4 / t.tpi);

describe('závitové destičky katalogu', () => {
  it('id jsou jedinečná a destička se z kódu VBD pozná zpět (R i L, s mezerami)', () => {
    expect(new Set(ISO_THREAD_INSERTS.map((x) => x.id)).size).toBe(ISO_THREAD_INSERTS.length);
    for (const ins of ISO_THREAD_INSERTS) {
      expect(isoThreadInsertByCode(`${ins.size}ER${ins.code}`)).toBe(ins);
      expect(isoThreadInsertByCode(`${ins.size}EL ${ins.code}`)).toBe(ins);
    }
    expect(isoThreadInsertByCode('CNMG120408')).toBeNull();
  });

  it('zub dosáhne do hloubky vnějšího závitu i pro největší stoupání destičky', () => {
    for (const ins of ISO_THREAD_INSERTS) {
      const { flank } = isoThreadTooth(ins);
      const reach = Math.cos((ins.angle / 2) * Math.PI / 180) * flank;
      expect(reach, ins.id).toBeGreaterThanOrEqual(threadProfileDepth(typeOf(ins), ins.pMax, true));
    }
  });

  it('plný profil: špička = dno vnějšího závitu (Tr 20×4: 0,366·4 − 0,536·0,25 = 1,33; Tr P 6 s ac 0,5)', () => {
    expect(isoThreadTooth(ISO_THREAD_INSERTS.find((x) => x.id === 'TR4')).flat).toBeCloseTo(1.33, 2);
    expect(isoThreadTooth(ISO_THREAD_INSERTS.find((x) => x.id === 'TR6')).flat).toBeCloseTo(0.36603 * 6 - 0.5359 * 0.5, 2);
    expect(isoThreadTooth(ISO_THREAD_INSERTS.find((x) => x.id === 'ACME8')).flat).toBeCloseTo(0.37069 * 3.175 - 0.51724 * 0.25, 2);
  });

  it('do dříku jde jen destička s hranou do šířky dříku; každý dřík má 16ER AG60', () => {
    for (const sh of ISO_SHANKS) {
      const fit = isoThreadInsertsFor(sh.code);
      expect(fit.some((x) => x.id === 'AG60')).toBe(true);
      for (const ins of fit) expect(ins.size, `${sh.code} ${ins.id}`).toBeLessThanOrEqual(sh.b);
    }
  });

  it('nůž z katalogu: držák a destička podle velikosti, celá destička se kreslí ve své velikosti', () => {
    const rec = buildIsoKnife('TH', { shank: '3232', thread: 'Q60' });
    expect(rec.name).toBe('SER3232P27');
    expect(rec.vbdCode).toBe('27ERQ60');
    expect(threadingInsertEdgeMM(rec.tool)).toBe(27);
    const xs = buildInsertOutlineSegments(rec.tool).map((s) => s.from.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(20);   // 16ER by měla ~14
    // Destička, která do dříku nejde, se nepostaví — vezme se výchozí AG60.
    expect(buildIsoKnife('TH', { shank: '2020', thread: 'Q60' }).vbdCode).toBe('16ERAG60');
    // Plný profil: posuv = stoupání destičky.
    expect(buildIsoKnife('TH', { shank: '2525', thread: 'TR5' }).f).toBe(5);
  });

  it('levý bok dříku je za celou destičkou i u lichoběžníkových rohových zubů (Tr 6, Acme 4)', () => {
    for (const sh of ISO_SHANKS) {
      for (const ins of isoThreadInsertsFor(sh.code)) {
        const t = buildIsoKnife('TH', { shank: sh.code, thread: ins.id }).tool;
        const xIns = Math.min(...buildInsertOutlineSegments(t).map((s) => s.from.x));
        const xHolder = Math.min(...t.holderProfile.sideA.map((p) => p.x));
        expect(xIns - xHolder, `${sh.code} ${ins.id}`).toBeGreaterThanOrEqual(0.5 - 1e-3);   // obrys držáku je zaokrouhlený na µm
      }
    }
  });

  it('hrana kresby: kód 11/16/22/27 ER/IR, jinak 16', () => {
    expect(threadingInsertEdgeMM({ toolVbdCode: '22ERN60' })).toBe(22);
    expect(threadingInsertEdgeMM({ toolVbdCode: '11 IR A60' })).toBe(11);
    expect(threadingInsertEdgeMM({ toolVbdCode: '' })).toBe(16);
    expect(threadingInsertEdgeMM({ toolVbdCode: 'CNMG120408' })).toBe(16);
    expect(threadingInsertEdgeMM({})).toBe(16);
  });
});

describe('výběr závitového nože podle stoupání', () => {
  it('částečný profil = rozsah, plný profil = jedno stoupání, nůž mimo katalog vždy', () => {
    expect(threadInsertFitsPitch('16ERAG60', 3)).toBe(true);
    expect(threadInsertFitsPitch('16ERAG60', 25.4 / 8)).toBe(true);   // UNC 8 z/″
    expect(threadInsertFitsPitch('16ERAG60', 3.5)).toBe(false);
    expect(threadInsertFitsPitch('22ER4.0TR', 4)).toBe(true);
    expect(threadInsertFitsPitch('22EL 4.0TR', 5)).toBe(false);
    expect(threadInsertFitsPitch('', 5)).toBe(true);
    expect(threadInsertFitsPitch('MUJ-ZAVITAK', 12)).toBe(true);
  });

  it('rada: destička do nejvíc dříků, u velkých i dřík; mimo katalog null', () => {
    expect(isoThreadInsertHint(60, 1.5)).toBe('16ER AG60');
    expect(isoThreadInsertHint(30, 4)).toBe('22ER 4.0TR (dřík 25×25, 32×32)');
    expect(isoThreadInsertHint(29, 25.4 / 4)).toBe('27ER 4ACME (dřík 32×32)');
    expect(isoThreadInsertHint(30, 8)).toBeNull();
    expect(isoThreadInsertHint(60, 0.35)).toBeNull();
  });

  it('závity z tabulek aplikace mají destičku: M/UN/G od P 0,5, Tr do P 6, Acme od 4 z/″', () => {
    const miss = [];
    const check = (rows, angle, ok) => rows.forEach((t) => {
      const P = pitchOf(t);
      if (ok(P) && !isoThreadInsertHint(angle, P)) miss.push(`${angle}° P ${P}`);
    });
    check([...mCoarse, ...mFine, ...uncThreads, ...unfThreads], 60, (P) => P >= 0.5 && P <= 6.35);
    check(gThreads, 55, () => true);
    check(trThreads, 30, (P) => P <= 6);
    check(acmeThreads, 29, (P) => P <= 6.35 + 1e-6);
    expect(miss).toEqual([]);
  });

  it('vnější závit = destička ER, vnitřní = IR; nůž mimo katalog na obě strany', () => {
    expect(threadInsertFitsSide('16ERAG60', true)).toBe(true);
    expect(threadInsertFitsSide('16ERAG60', false)).toBe(false);
    expect(threadInsertFitsSide('16IL AG60', false)).toBe(true);
    expect(threadInsertFitsSide('22IR4.0TR', true)).toBe(false);
    expect(threadInsertFitsSide('', false)).toBe(true);
    expect(threadInsertFitsSide('MUJ-ZAVITAK', true)).toBe(true);
  });

  it('rada pro vnitřní závit: IR destička a jen tyče, které se vejdou do díry', () => {
    expect(isoInternalThreadHint(60, 2)).toEqual({ hint: '16IR AG60 (tyč ⌀16, 20, 25, 32)' });
    // M20×2,5: díra ⌀17,3 — A60 jen do P 1,5, AG60 v nejmenší tyči ⌀16 chce díru od ⌀20.
    expect(isoInternalThreadHint(60, 2.5, 17.3)).toEqual({ hint: null, holeMin: 20 });
    expect(isoInternalThreadHint(60, 1.5, 14)).toEqual({ hint: '11IR A60 (tyč ⌀10)' });
    expect(isoInternalThreadHint(30, 4, 36)).toEqual({ hint: '22IR 4.0TR (tyč ⌀25)' });
    expect(isoInternalThreadHint(30, 8, 100)).toBeNull();
    // Tyč ze zásobníku: ⌀20 (Dmin 25) do díry ⌀17,3 ne, do ⌀26 ano; tyč mimo katalog vždy.
    expect(isoBarFitsHole(20, 17.3)).toBe(false);
    expect(isoBarFitsHole(20, 26)).toBe(true);
    expect(isoBarFitsHole(18, 5)).toBe(true);
    expect(isoBarFitsHole(20, 0)).toBe(true);
  });

  it('isoThreadBarsFor odpovídá isoThreadInsertsForBar', () => {
    for (const ins of ISO_THREAD_INSERTS) {
      for (const d of [10, 12, 16, 20, 25, 32, 40]) {
        expect(isoThreadBarsFor(ins).includes(d)).toBe(isoThreadInsertsForBar(d).includes(ins));
      }
    }
  });

  it('isoThreadShanksFor odpovídá isoThreadInsertsFor', () => {
    for (const ins of ISO_THREAD_INSERTS) {
      for (const sh of ISO_SHANKS) {
        expect(isoThreadShanksFor(ins).includes(sh.code)).toBe(isoThreadInsertsFor(sh.code).includes(ins));
      }
    }
  });
});

describe('hloubka Tr závitu podle ISO 2904 (vůle ac podle stoupání)', () => {
  it.each([[1.5, 0.15, 0.9], [2, 0.25, 1.25], [5, 0.25, 2.75], [6, 0.5, 3.5], [12, 0.5, 6.5]])(
    'Tr P %s → ac %s, h3 %s', (P, ac, h3) => {
      expect(trClearanceAc(P)).toBe(ac);
      expect(threadProfileDepth('tr', P, true)).toBeCloseTo(h3, 9);
    });

  it('Acme beze změny: 0,5·P + 0,25', () => {
    expect(threadProfileDepth('acme', 5.08, true)).toBeCloseTo(2.79, 9);
  });
});
