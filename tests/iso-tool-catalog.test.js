// 📚 ISO katalog nožů (js/calculators/isoToolCatalog.js) — z typu držáku,
// dříku a destičky se staví celý nůž pro CAM. Hlídá se: každá kombinace dá
// platný obrys držáku, který nezasahuje do řezné části destičky; natočení
// destičky odpovídá úhlu nastavení κr; kódy ISO 5608 / 1832; záznam nese
// všechna pole nože (CAM_TOOL_KEYS), takže jde do CAM stejnou cestou jako
// uložený nůž z knihovny.
import { describe, it, expect } from 'vitest';
import {
  ISO_HOLDER_TYPES, ISO_SHANKS, ISO_THREAD_INSERTS, isoVariants, isoSizes, isoRadii, isoGrooveWidths,
  buildIsoKnife, isoCatalogCount, isoKnifeSvg,
} from '../js/calculators/isoToolCatalog.js';
import { buildInsertProfileSegments } from '../js/calculators/cam/insertPreview.js';
import { CAM_TOOL_KEYS } from '../js/calculators/cam/camToolPicker.js';
import { holderProfileLoop } from '../js/calculators/cam/collisionValidator.js';
import { polyIntersect, polyArea } from '../js/geom/geomCore.js';

function allCombos() {
  const out = [];
  for (const t of ISO_HOLDER_TYPES) {
    for (const sh of ISO_SHANKS) {
      if (t.special === 'parting') isoGrooveWidths(sh.code).forEach((g) => out.push([t.id, { shank: sh.code, width: g.w }]));
      else if (t.special === 'threading') ISO_THREAD_INSERTS.forEach((th) => out.push([t.id, { shank: sh.code, thread: th.id }]));
      else {
        for (const variant of isoVariants(t, sh.code)) {
          for (const size of isoSizes(t, variant, sh.code)) {
            const radii = isoRadii(t, size);
            (radii.length ? radii : [undefined]).forEach((radius) => out.push([t.id, { shank: sh.code, variant, size, radius }]));
          }
        }
      }
    }
  }
  return out;
}

// Body řezné části destičky (oblouky navzorkované kratší cestou).
function cutLoop(tool) {
  const pts = [];
  for (const s of buildInsertProfileSegments(tool)) {
    if (s.type === 'circle') {
      for (let i = 0; i < 64; i++) pts.push({ x: s.cx + s.r * Math.cos(i * Math.PI / 32), z: s.cz + s.r * Math.sin(i * Math.PI / 32) });
    } else if (s.type === 'arc') {
      const a0 = Math.atan2(s.from.z - s.cz, s.from.x - s.cx);
      let d = Math.atan2(s.to.z - s.cz, s.to.x - s.cx) - a0;
      while (d <= -Math.PI) d += 2 * Math.PI;
      while (d > Math.PI) d -= 2 * Math.PI;
      for (let i = 0; i <= 16; i++) pts.push({ x: s.cx + s.r * Math.cos(a0 + d * i / 16), z: s.cz + s.r * Math.sin(a0 + d * i / 16) });
    } else {
      pts.push(s.from, s.to);
    }
  }
  return pts;
}

function selfIntersects(loop) {
  const o = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const cross = (a, b, c, d) => {
    const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
    return d1 * d2 < -1e-12 && d3 * d4 < -1e-12;
  };
  const n = loop.length - 1;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (!(i === 0 && j === n - 1) && cross(loop[i], loop[i + 1], loop[j], loop[j + 1])) return true;
    }
  }
  return false;
}

describe('ISO katalog — všechny kombinace', () => {
  const combos = allCombos();

  it('počet kombinací sedí s isoCatalogCount()', () => {
    expect(combos.length).toBe(isoCatalogCount());
    expect(combos.length).toBeGreaterThan(400);
  });

  it('každá kombinace dá nůž s uzavřeným, jednoduchým obrysem držáku mimo řeznou část', () => {
    const bad = [];
    for (const [id, opts] of combos) {
      const rec = buildIsoKnife(id, opts);
      if (!rec) { bad.push(`${id} ${JSON.stringify(opts)}: null`); continue; }
      const loop = rec.tool.holderProfile.sideA;
      const first = loop[0], last = loop[loop.length - 1];
      if (loop.length < 4 || first.x !== last.x || first.z !== last.z) bad.push(`${rec.name}: neuzavřený`);
      if (loop.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z))) bad.push(`${rec.name}: NaN`);
      if (selfIntersects(loop)) bad.push(`${rec.name}: samoprotnutí`);
      if (!holderProfileLoop(rec.tool)) bad.push(`${rec.name}: CAM obrys nepřijme`);
      if (rec.tool.toolShape !== 'threading') {
        const overlap = Math.abs(polyArea(polyIntersect([loop.slice(0, -1)], [cutLoop(rec.tool)])));
        if (overlap > 0.05) bad.push(`${rec.name} ${rec.vbdCode}: držák v řezné části ${overlap.toFixed(3)} mm²`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('záznam nese celý nůž (všechna pole CAM_TOOL_KEYS) a náhled', () => {
    for (const t of ISO_HOLDER_TYPES) {
      const rec = buildIsoKnife(t.id, { shank: '2525' });
      for (const k of CAM_TOOL_KEYS) expect(rec.tool[k], `${rec.name}.${k}`).not.toBeUndefined();
      expect(rec.tool.knifeAngle).toBe(270);
      expect(isoKnifeSvg(rec)).toMatch(/^<svg[\s\S]*<\/svg>$/);
    }
  });
});

describe('natočení destičky z úhlu nastavení κr', () => {
  it.each([
    ['CL', 80, 5], ['WL', 80, 5], ['TG', 60, 30], ['CB', 80, 25], ['SB', 90, 15],
    ['DJ', 55, 32], ['DN', 55, 62.5], ['VJ', 35, 52], ['VV', 35, 72.5], ['SS', 90, 45],
    ['SK', 90, -15], ['TF', 60, 0],
  ])('%s: ε %s° → natočení %s°', (id, eps, theta) => {
    const rec = buildIsoKnife(id, { shank: '2525' });
    expect(rec.tool.toolTipAngle).toBe(eps);
    expect(rec.tool.toolAngle).toBeCloseTo(theta, 6);
  });
});

describe('kódy ISO 5608 / ISO 1832', () => {
  it.each([
    ['CL', { shank: '2525' }, 'PCLNR2525M12', 'CNMG120408', 0],
    ['CL', { shank: '2525', variant: 'pos', size: '09', radius: '04' }, 'SCLCR2525M09', 'CCMT09T304', 7],
    ['CL', { shank: '2020', hand: 'L', radius: '04' }, 'PCLNL2020K12', 'CNMG120404', 0],
    ['DJ', { shank: '2525' }, 'PDJNR2525M15', 'DNMG150608', 0],
    ['VJ', { shank: '2525', variant: 'pos' }, 'SVJBR2525M16', 'VBMT160408', 5],
    ['VV', { shank: '2020' }, 'MVVNN2020K16', 'VNMG160408', 0],
    ['TG', { shank: '2525' }, 'PTGNR2525M16', 'TNMG160408', 0],
    ['RD', { shank: '2525' }, 'SRDCN2525M12', 'RCMT1204M0', 7],
    ['GR', { shank: '2525' }, 'MGEHR2525-3', 'MGMN300-M', 0],
    ['TH', { shank: '2525', hand: 'L', thread: 'AG55' }, 'SEL2525M16', '16ELAG55', 0],
  ])('%s %j → %s + %s', (id, opts, holder, insert, alpha) => {
    const rec = buildIsoKnife(id, opts);
    expect(rec.name).toBe(holder);
    expect(rec.vbdCode).toBe(insert);
    expect(rec.tool.toolVbdCode).toBe(insert);
    expect(rec.tool.toolClearanceAngle).toBe(alpha);
  });

  it('kulatá RCMT 1204M0 = R 6, zapichovací MGMN300 = šířka 3', () => {
    expect(buildIsoKnife('RD', { shank: '2525', size: '12' }).tool.toolRadius).toBe(6);
    const g = buildIsoKnife('GR', { shank: '2525', width: 3 }).tool;
    expect([g.toolShape, g.toolLength]).toEqual(['parting', 3]);
  });

  it('dřík bez vhodné destičky typ nenabízí (zapichovací 5 mm na 16×16)', () => {
    expect(isoGrooveWidths('1616').map((g) => g.w)).toEqual([2, 3]);
    expect(buildIsoKnife('GR', { shank: '1616', width: 5 }).tool.toolLength).toBe(3);
  });
});

describe('tvar hlavy držáku', () => {
  it('neutrální držáky jsou souměrné podle osy špičky', () => {
    for (const id of ['DN', 'VV', 'SD', 'RD']) {
      const pts = buildIsoKnife(id, { shank: '2525' }).tool.holderProfile.sideA.slice(0, -1);
      const key = (p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`;
      const set = new Set(pts.map(key));
      for (const p of pts) expect(set.has(key({ x: -p.x, z: p.z })), `${id} ${key(p)}`).toBe(true);
    }
  });

  it('κr ≥ 90°: hlava nevyčnívá přes prodloužení hlavní hrany (osazení)', () => {
    for (const id of ['CL', 'WL', 'TG', 'DJ', 'VJ']) {
      const rec = buildIsoKnife(id, { shank: '2525' });
      const p = rec.tool;
      const FB = buildInsertProfileSegments(p)[1].to;
      const a = (p.toolAngle + p.toolTipAngle) * Math.PI / 180;
      for (const q of p.holderProfile.sideA) {
        if (q.z < FB.z || q.z > 1.3 * p.holderWidth) continue;
        // kladné = vlevo od hlavní hrany (do osazení); obrys je zaokrouhlený na 0,001 mm
        const side = Math.cos(a) * (q.z - FB.z) - Math.sin(a) * (q.x - FB.x);
        expect(side, `${rec.name} (${q.x}, ${q.z})`).toBeLessThan(1e-3);
      }
    }
  });

  it('dřík leží podle f1: špička o f1 − b vlevo od dříku (PCLNR 2525 → f1 ≈ 32)', () => {
    const p = buildIsoKnife('CL', { shank: '2525' }).tool;
    const xs = p.holderProfile.sideA.filter((q) => q.z === 150).map((q) => q.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(25, 6);
    expect(Math.max(...xs)).toBeGreaterThan(30);
    expect(Math.max(...xs)).toBeLessThan(33);
  });
});
