// Vnitřní nože 📚 katalogu (js/calculators/isoInternalTools.js) — vyvrtávací
// tyče a vnitřní závitový nůž SNR. Hlídá se: každá kombinace dá platný obrys
// tyče mimo řeznou část destičky, tyč nesahá ke stěně díry (pod špičku),
// celý nůž se vejde do nejmenší díry Dmin, natočení destičky odpovídá κr,
// kódy tyče / destičky a záznam nese všechna pole nože (CAM_TOOL_KEYS).
import { describe, it, expect } from 'vitest';
import {
  ISO_INTERNAL_TYPES, ISO_BARS, isoInternalBars, isoInternalVariants, isoInternalSizes,
  buildIsoInternalKnife, isoInternalCount, isoThreadInsertsForBar,
} from '../js/calculators/isoInternalTools.js';
import { isoRadii } from '../js/calculators/isoToolCatalog.js';
import { isoThreadTooth, isoThreadInsertByCode } from '../js/calculators/isoThreadInserts.js';
import { buildInsertProfileSegments, buildInsertOutlineSegments, threadingToothSegments } from '../js/calculators/cam/insertPreview.js';
import { CAM_TOOL_KEYS } from '../js/calculators/cam/camToolPicker.js';
import { holderProfileLoop } from '../js/calculators/cam/collisionValidator.js';
import { segPoints } from '../js/calculators/knifeThumb.js';
import { polyIntersect, polyArea } from '../js/geom/geomCore.js';

function allCombos() {
  const out = [];
  for (const t of ISO_INTERNAL_TYPES) {
    for (const b of isoInternalBars(t)) {
      if (t.special === 'threading') { isoThreadInsertsForBar(b.d).forEach((th) => out.push([t.id, { bar: b.d, thread: th.id }])); continue; }
      for (const variant of isoInternalVariants(t, b.d)) {
        for (const size of isoInternalSizes(t, variant, b.d)) {
          isoRadii(t, size).forEach((radius) => out.push([t.id, { bar: b.d, variant, size, radius }]));
        }
      }
    }
  }
  return out;
}

function selfIntersects(loop) {
  const o = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const n = loop.length - 1;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, d] = [loop[i], loop[i + 1], loop[j], loop[j + 1]];
      if (o(a, b, c) * o(a, b, d) < -1e-12 && o(c, d, a) * o(c, d, b) < -1e-12) return true;
    }
  }
  return false;
}

const cutPoints = (tool) => (tool.toolShape === 'threading'
  ? threadingToothSegments(tool).map((s) => s.from)
  : segPoints(buildInsertProfileSegments(tool)));

describe('📚 katalog — vnitřní nože (vyvrtávací tyče)', () => {
  const combos = allCombos();

  it('počet kombinací sedí s isoInternalCount() a každý typ má aspoň tři tyče', () => {
    expect(combos.length).toBe(isoInternalCount());
    for (const t of ISO_INTERNAL_TYPES) expect(isoInternalBars(t).length, t.id).toBeGreaterThanOrEqual(3);
  });

  it('každá kombinace: uzavřený jednoduchý obrys tyče, mimo řeznou část, ne pod špičkou, vejde se do Dmin', () => {
    const bad = [];
    for (const [id, opts] of combos) {
      const rec = buildIsoInternalKnife(id, opts);
      if (!rec) { bad.push(`${id} ${JSON.stringify(opts)}: null`); continue; }
      const t = rec.tool, loop = t.holderProfile.sideA;
      const first = loop[0], last = loop[loop.length - 1];
      if (loop.length < 4 || first.x !== last.x || first.z !== last.z) bad.push(`${rec.name}: neuzavřený`);
      if (selfIntersects(loop)) bad.push(`${rec.name}: samoprotnutí`);
      if (!holderProfileLoop(t)) bad.push(`${rec.name}: CAM obrys nepřijme`);
      const cut = cutPoints(t);
      const overlap = Math.abs(polyArea(polyIntersect([loop.slice(0, -1)], [cut])));
      if (overlap > 0.05) bad.push(`${rec.name} ${rec.vbdCode}: tyč v řezné části ${overlap.toFixed(3)} mm²`);
      // Stěna díry leží na úrovni špičky — tyč k ní nesmí (jen destička).
      const zTip = Math.min(...cut.map((p) => p.z));
      if (Math.min(...loop.map((p) => p.z)) <= zTip + 0.2) bad.push(`${rec.name}: tyč u stěny díry`);
      // Celý nůž (tyč i destička) od stěny díry napříč < Dmin.
      const zAll = Math.max(...loop.map((p) => p.z), ...segPoints(buildInsertOutlineSegments(t)).map((p) => p.z));
      if (zAll - zTip >= rec.iso.dmin) bad.push(`${rec.name}: přes celou díru ${(zAll - zTip).toFixed(1)} ≥ Dmin ${rec.iso.dmin}`);
    }
    expect(bad).toEqual([]);
  });

  it('závitová tyč: zub dosáhne do hloubky dřív, než se stěny dotkne tyč', () => {
    for (const b of ISO_BARS) {
      for (const th of isoThreadInsertsForBar(b.d)) {
        const t = buildIsoInternalKnife('BTH', { bar: b.d, thread: th.id }).tool;
        const reach = Math.cos((th.angle / 2) * Math.PI / 180) * isoThreadTooth(th).flank;
        expect(Math.min(...t.holderProfile.sideA.map((p) => p.z)), `⌀${b.d} ${th.id}`).toBeGreaterThan(reach);
      }
    }
  });

  it('záznam nese celý nůž (CAM_TOOL_KEYS), tyč ⌀d × l1 a označení vnitřního nože', () => {
    for (const t of ISO_INTERNAL_TYPES) {
      const rec = buildIsoInternalKnife(t.id, {});
      for (const k of CAM_TOOL_KEYS) expect(rec.tool[k], `${rec.name}.${k}`).not.toBeUndefined();
      expect(rec.iso.internal).toBe(true);
      expect(rec.tool.holderWidth).toBe(rec.iso.bar);
      const zs = rec.tool.holderProfile.sideA.map((p) => p.z);
      expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThanOrEqual(rec.iso.bar - 1e-3);
    }
  });

  it.each([
    ['BCL', {}, 'S20S-PCLNR09', 'CNMG09T308', 0, 5],
    ['BCL', { bar: 10 }, 'S10K-SCLCR06', 'CCMT060204', 7, 5],
    ['BCL', { bar: 25, hand: 'L', variant: 'pos', size: '12', radius: '04' }, 'S25T-SCLCL12', 'CCMT120404', 7, 5],
    ['BDU', { bar: 32 }, 'S32U-PDUNR15', 'DNMG150608', 0, 32],
    ['BDQ', { bar: 16 }, 'S16Q-SDQCR11', 'DCMT11T304', 7, 17.5],
    ['BTF', { bar: 12 }, 'S12M-STFCR11', 'TCMT110204', 7, 29],
    ['BVU', { bar: 25, size: '16' }, 'S25T-SVUBR16', 'VBMT160408', 5, 52],
    ['BTH', { bar: 16 }, 'SNR0016Q16', '16IRAG60', 0, 0],
    ['BTH', { bar: 32, hand: 'L', thread: 'TR5' }, 'SNL0032U22', '22IL5.0TR', 0, 0],
  ])('%s %j → %s + %s', (id, opts, name, insert, alpha, theta) => {
    const rec = buildIsoInternalKnife(id, opts);
    expect(rec.name).toBe(name);
    expect(rec.vbdCode).toBe(insert);
    expect(rec.tool.toolClearanceAngle).toBe(alpha);
    expect(rec.tool.toolAngle).toBeCloseTo(theta, 6);
  });

  it('vnitřní závitová destička se z kódu pozná (IR) a má stejný zub jako vnější', () => {
    const rec = buildIsoInternalKnife('BTH', { bar: 25, thread: 'N60' });
    expect(isoThreadInsertByCode(rec.vbdCode).id).toBe('N60');
    expect(rec.tool.toolLength).toBe(isoThreadTooth(isoThreadInsertByCode('22ERN60')).flank);
  });

  it('negativní destička (páčka) až od tyče ⌀20, V destička až od ⌀16', () => {
    const bcl = ISO_INTERNAL_TYPES.find((t) => t.id === 'BCL');
    expect(isoInternalVariants(bcl, 16)).toEqual(['pos']);
    expect(isoInternalVariants(bcl, 20)).toEqual(['neg', 'pos']);
    const bvu = ISO_INTERNAL_TYPES.find((t) => t.id === 'BVU');
    expect(isoInternalBars(bvu)[0].d).toBe(16);
    expect(isoInternalSizes(bvu, 'pos', 20)).toEqual(['11']);   // V16 by z ⌀20 vyčnívala
  });
});
