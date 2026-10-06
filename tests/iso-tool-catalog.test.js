// 📚 ISO katalog nožů (js/calculators/isoToolCatalog.js) — z typu držáku,
// dříku a destičky se staví celý nůž pro CAM. Hlídá se: každá kombinace dá
// platný obrys držáku, který nezasahuje do řezné části destičky; natočení
// destičky odpovídá úhlu nastavení κr; kódy ISO 5608 / 1832; záznam nese
// všechna pole nože (CAM_TOOL_KEYS), takže jde do CAM stejnou cestou jako
// uložený nůž z knihovny.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ISO_HOLDER_TYPES, ISO_SHANKS, ISO_THREAD_INSERTS, isoVariants, isoSizes, isoRadii, isoGrooveWidths,
  buildIsoKnife, isoCatalogCount, isoKnifeSvg, upgradeIsoHolderProfile, parseIsoKnifeName,
} from '../js/calculators/isoToolCatalog.js';
import { buildInsertProfileSegments } from '../js/calculators/cam/insertPreview.js';
import { CAM_TOOL_KEYS, DEFAULT_TOOL_MAGAZINE } from '../js/calculators/cam/camToolPicker.js';
import { paramsFromMagSlot } from '../js/calculators/cam/toolSlotPreview.js';
import { knifeThumbSvg } from '../js/calculators/knifeThumb.js';
import { ISO_DEFAULT_SET, isoDefaultKnives, migrateLegacyMagazine, sameKnifeGeometry, isoDefaultsAddedSince, MAGAZINE_DEFAULTS_REV } from '../js/calculators/magazineDefaults.js';
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
    ['RS', { shank: '2525', size: '20' }, 'SRSCR2525M20', 'RCMT2006M0', 7],
    ['RG', { shank: '1616', hand: 'L', size: '08' }, 'SRGCL1616H08', 'RCMT0803M0', 7],
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

  it('velikosti destiček v nabídce jdou podle IC (09 před 12)', () => {
    const t = ISO_HOLDER_TYPES.find((x) => x.id === 'CL');
    expect(isoSizes(t, 'neg', '2525')).toEqual(['09', '12', '16', '19']);
    expect(isoSizes(ISO_HOLDER_TYPES.find((x) => x.id === 'RS'), 'pos', '2525')).toEqual(['08', '10', '12', '16', '20', '25']);
  });

  it('kulatá v rohu dříku (SRSCR, SRGCR): držák nikde vlevo od středu destičky — dojede k čelu', () => {
    for (const id of ['RS', 'RG']) {
      for (const sh of ISO_SHANKS) {
        for (const size of isoSizes(ISO_HOLDER_TYPES.find((x) => x.id === id), 'pos', sh.code)) {
          const p = buildIsoKnife(id, { shank: sh.code, size }).tool;
          const xs = p.holderProfile.sideA.map((q) => q.x);
          expect(Math.min(...xs), `${id} ${sh.code} ${size}`).toBe(0);   // destička vyčnívá o celé R
          expect(Math.max(...xs), `${id} ${sh.code} ${size}`).toBe(sh.b);
        }
      }
    }
  });

  it('závitový SER: rovný dřík šířky b, levý bok v rovině s rohem destičky, zub vyčnívá přes čelo', () => {
    for (const sh of ISO_SHANKS) {
      const p = buildIsoKnife('TH', { shank: sh.code }).tool;
      const pts = p.holderProfile.sideA;
      const xs = pts.map((q) => q.x), zs = pts.map((q) => q.z);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(sh.b, 6);
      expect(Math.min(...xs)).toBeCloseTo(-8.5, 6);                    // destička 16ER: roh v −8, vůle 0,5
      expect(Math.min(...zs)).toBeGreaterThan(5);                      // čelo dříku nad zubem
    }
  });

  it('f1 = zadní strana dříku → špička: PSBNR 2525 = 22 (Sandvik DSBNR), PSSNR 2525 = 32', () => {
    const tipX = (p) => Math.min(...buildInsertProfileSegments(p).slice(3).flatMap((s) => {
      const out = [];
      for (let i = 0; i <= 32; i++) {
        const a0 = Math.atan2(s.from.z - s.cz, s.from.x - s.cx);
        let d = Math.atan2(s.to.z - s.cz, s.to.x - s.cx) - a0;
        while (d <= -Math.PI) d += 2 * Math.PI; while (d > Math.PI) d -= 2 * Math.PI;
        out.push(s.cx + s.r * Math.cos(a0 + d * i / 32));
      }
      return out;
    }));
    for (const [id, f1] of [['SB', 22], ['CB', 22], ['SS', 32], ['CL', 32], ['SK', 32], ['TG', 32]]) {
      const p = buildIsoKnife(id, { shank: '2525' }).tool;
      const back = Math.max(...p.holderProfile.sideA.filter((q) => q.z === 150).map((q) => q.x));
      expect(back - tipX(p), id).toBeCloseTo(f1, 1);
    }
  });

  it('v2 (hlava 1 mm za břitem, úleva +3°) se převede na aktuální (úleva +20°, f1 ke špičce)', () => {
    const v2 = buildIsoKnife('SB', { shank: '2525', holderVersion: 2 });
    expect(upgradeIsoHolderProfile(v2.name, v2.vbdCode, v2.tool.holderProfile))
      .toEqual(buildIsoKnife('SB', { shank: '2525' }).tool.holderProfile);
    const n = buildIsoKnife('DN', { shank: '2525', holderVersion: 2 });   // neutrální — beze změny
    expect(upgradeIsoHolderProfile(n.name, n.vbdCode, n.tool.holderProfile)).toBeNull();
  });

  it('dřík leží podle f1: špička o f1 − b vlevo od dříku (PCLNR 2525 → f1 ≈ 32)', () => {
    const p = buildIsoKnife('CL', { shank: '2525' }).tool;
    const xs = p.holderProfile.sideA.filter((q) => q.z === 150).map((q) => q.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(25, 6);
    expect(Math.max(...xs)).toBeGreaterThan(30);
    expect(Math.max(...xs)).toBeLessThan(33);
  });
});

describe('🔧 Zásobník — výchozí ISO nože místo provizorních', () => {
  // Záznam katalogu → slot zásobníku (jen pole, která migrace a náhled čtou;
  // v aplikaci to dělá _buildMagSlotFromTool).
  const toSlot = (rec, num) => {
    const t = rec.tool;
    return { slot: num, name: rec.name, vbdCode: rec.vbdCode, shape: t.toolShape, radius: t.toolRadius,
      tipAngle: t.toolTipAngle, toolAngle: t.toolAngle, clearanceAngle: t.toolClearanceAngle, toolLength: t.toolLength,
      tipFlat: t.toolTipFlat, holderWidth: t.holderWidth, holderLength: t.holderLength, holderHand: t.holderHand,
      knifeAngle: t.knifeAngle, holderProfile: t.holderProfile, vc: rec.vc, f: rec.f, ap: rec.ap };
  };
  const copy = (o) => JSON.parse(JSON.stringify(o));

  it('každý starý výchozí nůž má ISO náhradu ve stejné roli a pořadí', () => {
    const knives = isoDefaultKnives();
    expect(ISO_DEFAULT_SET.map((s) => s.legacy)).toEqual(DEFAULT_TOOL_MAGAZINE.map((d) => d.name));
    expect(knives.map((r) => r.name)).toEqual(['PSKNR2525M12', 'PSBNR2525M12', 'PDJNR2525M15', 'SRSCR2525M20', 'SER2525M16', 'MGEHR2525-5']);
    knives.forEach((r, i) => expect(r.tool.toolShape, r.name).toBe(DEFAULT_TOOL_MAGAZINE[i].shape));
    // Kde to jde, táž geometrie jako dřív: čelní čtverec κr 75°, hrubovací čtverec
    // natočený 15° (κr 75°), kulatá R10, upichovák š 5 / R 0,8.
    expect([knives[0].tool.toolAngle, knives[0].tool.toolTipAngle]).toEqual([-15, 90]);
    expect([knives[1].tool.toolAngle, knives[1].tool.toolTipAngle]).toEqual([15, 90]);
    expect(knives[3].tool.toolRadius).toBe(10);
    expect([knives[5].tool.toolLength, knives[5].tool.toolRadius]).toEqual([5, 0.8]);
  });

  it('migrace: nezměněné staré nože nahradí na místě, upravený nechá, shodnou kopii odebere', () => {
    const mine = { slot: 7, name: 'Můj nůž', shape: 'round', radius: 2 };
    const psbnrCopy = toSlot(isoDefaultKnives()[1], 8);                 // z 📚 katalogu dřív
    const mag = [...copy(DEFAULT_TOOL_MAGAZINE), mine, psbnrCopy];
    mag[2].toolAngle = 30;                                             // Šlicht upravený uživatelem
    const r = migrateLegacyMagazine(mag, toSlot);
    expect(r.magazine.map((s) => s.name)).toEqual(
      ['PSKNR2525M12', 'PSBNR2525M12', 'Šlicht', 'SRSCR2525M20', 'SER2525M16', 'MGEHR2525-5', 'Můj nůž']);
    expect(r.magazine.map((s) => s.slot)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.replaced).toEqual([0, 1, 3, 4, 5]);
    expect(r.dropped).toBe(1);
    expect(r.map).toEqual([0, 1, 2, 3, 4, 5, 6, 1]);                   // kopie PSBNR → T2
    expect(r.magazine[6]).toBe(mine);
    // Podruhé už není co nahrazovat.
    const again = migrateLegacyMagazine(r.magazine, toSlot);
    expect([again.replaced.length, again.dropped]).toEqual([0, 0]);
  });

  it('revize výchozí sady: zásobník z rev 1 dostane jednou PSBNR, aktuální nic', () => {
    expect(isoDefaultsAddedSince(1).map((r) => r.name)).toEqual(['PSBNR2525M12']);
    expect(isoDefaultsAddedSince(0).map((r) => r.name)).toEqual(['PSBNR2525M12']);
    expect(isoDefaultsAddedSince(MAGAZINE_DEFAULTS_REV)).toEqual([]);
  });

  it('sameKnifeGeometry: řezné podmínky a ruka se nesrovnávají, obrys držáku ano', () => {
    const a = copy(DEFAULT_TOOL_MAGAZINE[1]);
    expect(sameKnifeGeometry(a, { ...a, vc: 999, holderHand: 'L' })).toBe(true);
    const b = copy(a); b.holderProfile.sideA[2].x += 0.5;
    expect(sameKnifeGeometry(a, b)).toBe(false);
  });

  it('náhled v řádku jde nakreslit pro staré i nové výchozí nože, bez obrysu i otočené', () => {
    const slots = [
      ...DEFAULT_TOOL_MAGAZINE,
      ...isoDefaultKnives().map((r, i) => toSlot(r, i + 1)),
      { ...DEFAULT_TOOL_MAGAZINE[1], holderProfile: null },             // náhradní obdélník
      { ...DEFAULT_TOOL_MAGAZINE[2], knifeAngle: 180, holderHand: 'L' },
      { ...DEFAULT_TOOL_MAGAZINE[3], holderWidth: 0, holderLength: 0, holderProfile: null },  // držák se nehlídá
    ];
    for (const s of slots) {
      const svg = knifeThumbSvg(paramsFromMagSlot(s), 36);
      expect(svg, s.name).toMatch(/^<svg class="knife-svg" viewBox="(-?[\d.]+ ){3}-?[\d.]+"[\s\S]*<\/svg>$/);
      expect(svg, s.name).not.toMatch(/NaN|Infinity/);
    }
  });
});

describe('hlava držáku za břitem (verze 2) a převod starých obrysů', () => {
  const combos = allCombos();

  it('polygon: hlava začíná ≥ 1 mm od obou řezných hran; kulatá ≥ 0,5 mm od kružnice', () => {
    const bad = [];
    for (const [id, opts] of combos) {
      const p = buildIsoKnife(id, opts).tool;
      const loop = p.holderProfile.sideA;
      if (p.toolShape === 'polygon') {
        const cut = buildInsertProfileSegments(p);
        const dist = (q, P, deg) => Math.abs(Math.cos(deg * Math.PI / 180) * (q.z - P.z) - Math.sin(deg * Math.PI / 180) * (q.x - P.x));
        const dA = dist(loop[0], cut[0].to, p.toolAngle);                       // začátek hlavy u hrany A
        const FB = cut[1].to;
        const nearB = loop.reduce((b, q) => (Math.hypot(q.x - FB.x, q.z - FB.z) < Math.hypot(b.x - FB.x, b.z - FB.z) ? q : b));
        const dB = dist(nearB, FB, p.toolAngle + p.toolTipAngle);               // konec hlavy u hrany B
        // Hrana B je u čelních stylů (F, K) vedlejší — k hotovému čelu, kde držák
        // míjí čelo o celou šířku destičky; tam se odsazení nevyžaduje.
        const faceStyle = ISO_HOLDER_TYPES.find((t) => t.id === id).face;
        if (dA < 0.999 || (!faceStyle && dB < 0.999)) bad.push(`${id} ${JSON.stringify(opts)}: A ${dA.toFixed(3)} B ${dB.toFixed(3)}`);
      } else if (p.toolShape === 'round') {
        const gap = Math.min(...loop.map((q) => Math.hypot(q.x, q.z))) - p.toolRadius;
        if (gap < 0.49) bad.push(`${id} ${JSON.stringify(opts)}: ${gap.toFixed(3)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('starý obrys (verze 1) se pozná a nahradí aktuálním; aktuální, upravený a cizí ne', () => {
    let n = 0;
    for (const [id, opts] of combos) {
      const old = buildIsoKnife(id, { ...opts, holderVersion: 1 });
      if (old.tool.toolShape !== 'polygon' && old.tool.toolShape !== 'round') continue;
      const cur = buildIsoKnife(id, opts);
      expect(upgradeIsoHolderProfile(old.name, old.vbdCode, old.tool.holderProfile), old.name).toEqual(cur.tool.holderProfile);
      expect(upgradeIsoHolderProfile(cur.name, cur.vbdCode, cur.tool.holderProfile)).toBeNull();
      n++;
    }
    expect(n).toBeGreaterThan(700);
    const old = buildIsoKnife('SK', { shank: '2525', holderVersion: 1 });
    const edited = JSON.parse(JSON.stringify(old.tool.holderProfile));
    edited.sideA[1].x += 1;
    expect(upgradeIsoHolderProfile(old.name, old.vbdCode, edited)).toBeNull();
    expect(upgradeIsoHolderProfile('Hrubovaci', '', DEFAULT_TOOL_MAGAZINE[1].holderProfile)).toBeNull();
    expect(parseIsoKnifeName('SVJBR2525M16', 'VBMT160404')).toEqual(
      { id: 'VJ', opts: { shank: '2525', variant: 'pos', size: '16', radius: '04', hand: 'R' } });
  });

  it('projekt uživatele (PSKNR, obrys verze 1) se při načtení převede', () => {
    const p = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam-cases', 'face-psknr-axis.camprog'), 'utf8')).params;
    const up = upgradeIsoHolderProfile(p.toolName, p.toolVbdCode, p.holderProfile);
    expect(up).toEqual(buildIsoKnife('SK', { shank: '2525', size: '12', radius: '08' }).tool.holderProfile);
  });
});
