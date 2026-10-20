// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – POHÁNĚNÉ NÁSTROJE (cam/live/): vrtání a frézování s C  ║
// ╚══════════════════════════════════════════════════════════════╝
// Blok mezi značkami `>>> / <<< POHANENE NASTROJE`:
//  - vkládá se před konec programu, opakovaný zápis ho přepíše na místě;
//  - simulace soustružení ho přeskakuje (díra na rozteči není rotační řez);
//  - úprava operací nemění otisk vstupů drah (nepřepočítává soustružení).
import { describe, it, expect } from 'vitest';
import { buildLiveBlock } from '../js/calculators/cam/live/liveGcode.js';
import { newLiveOp, livePositions, millMoves, depthLevels, liveSettings } from '../js/calculators/cam/live/liveModel.js';
import { insertLiveBlock, removeLiveBlock, findLiveBlock } from '../js/calculators/cam/live/liveMarkers.js';
import { parseManualGCodeToPath } from '../js/calculators/cam/gcodeParser.js';
import { pathInputsKey } from '../js/calculators/cam/gcodeSync.js';

const drill = (o = {}) => ({ ...newLiveOp('drill', { faceZ: 0, outerD: 100 }, 1), pcd: 60, count: 3, ...o });
// Testy NC výstupu počítají s nástrojem VPRAVO (toolAt 0 — úhel v NC = úhel
// díry); výchozí poloha nahoře (soustruh, 90°) má vlastní test níž.
const prms = (o = {}) => ({ controlSystem: 'sinumerik', mode: 'DIAMON', safeX: 150, safeZ: 5, liveOps: [drill()], ...o, live: { toolAt: 0, ...(o.live || {}) } });

describe('model', () => {
  it('rozteč: 3 díry po 120°, poloměr = Ø/2', () => {
    const p = livePositions(drill());
    expect(p.map(h => h.a)).toEqual([0, 120, 240]);
    expect(p[1].r).toBe(30);
    expect(p[1].x).toBeCloseTo(-15, 6);
    expect(p[1].y).toBeCloseTo(25.98, 2);
  });
  it('seznam bodů „úhel; poloměr" i s desetinnou čárkou', () => {
    const p = livePositions(drill({ pattern: 'points', points: '90; 12,5\n\n-90 10' }));
    expect(p.map(h => [h.a, h.r])).toEqual([[90, 12.5], [270, 10]]);
  });
  it('hloubkové hladiny končí plnou hloubkou', () => {
    expect(depthLevels(10, 3)).toEqual([3, 6, 9, 10]);
    expect(depthLevels(10, 0)).toEqual([10]);
  });
  it('kapsa: dráha zůstává uvnitř Ø kapsy minus poloměr frézy', () => {
    const op = { ...newLiveOp('mill', null, 1), pattern: 'points', points: '0; 0', holeD: 30, toolD: 10, depth: 4, stepDown: 2 };
    const r = millMoves(op).filter(m => m.k !== 'rapid').map(m => Math.hypot(m.x, m.y));
    expect(Math.max(...r)).toBeCloseTo(10, 6);
  });
});

describe('poloha poháněného nástroje (kus se natáčí k nástroji)', () => {
  it('soustruh: nástroj nahoře (X+) — SPOS = úhel díry − 90°', () => {
    const P = { controlSystem: 'sinumerik', mode: 'DIAMON', safeX: 150, safeZ: 5, liveOps: [drill()] };
    expect(liveSettings(P).toolAt).toBe(90);
    const L = buildLiveBlock(P);
    // díry 0°, 120°, 240° → 270, 30, 150 (díra na 90° by byla pod nástrojem při C0)
    expect(L).toContain('SPOS=270');
    expect(L).toContain('SPOS=30');
    expect(L).toContain('SPOS=150');
    expect(L.some(l => /natočí osou C/.test(l))).toBe(true);
  });
  it('karusel: nástroj vpravo (0°); nastavení toolAt má přednost', () => {
    expect(liveSettings({ machineStructure: 'carousel' }).toolAt).toBe(0);
    expect(liveSettings({ live: { toolAt: 180 } }).toolAt).toBe(180);
    expect(liveSettings({ live: { toolAt: 45 } }).toolAt).toBe(90);   // jen 0 / 90 / 180 / 270
  });
  it('TRANSMIT s nástrojem nahoře: bod pod nástrojem (90°) jde na X+ stroje', () => {
    const P = { controlSystem: 'sinumerik', mode: 'DIAMON', safeX: 150, safeZ: 5, live: { mode: 'transmit' },
      liveOps: [drill({ pattern: 'points', points: '90; 30' })] };
    expect(buildLiveBlock(P).some(l => l.startsWith('G0 X30 Y0'))).toBe(true);
  });
});

describe('NC výstup', () => {
  it('Sinumerik SPOS: natočení + CYCLE83, X v průměru', () => {
    const L = buildLiveBlock(prms());
    expect(L[0]).toContain('>>> POHANENE NASTROJE [sinumerik/spos]');
    expect(L).toContain('SPOS=120');
    expect(L).toContain('G0 X60 ; díra 1: úhel 0°');
    expect(L.filter(l => l.startsWith('CYCLE83(')).length).toBe(3);
    expect(L[L.length - 1]).toContain('<<< POHANENE NASTROJE');
  });
  it('Sinumerik TRANSMIT: kartézsky X/Y, DIAMOF … TRAFOOF, DIAMON', () => {
    const L = buildLiveBlock(prms({ live: { mode: 'transmit' } }));
    const i = L.indexOf('TRANSMIT');
    expect(i).toBeGreaterThan(0);
    expect(L[i - 1]).toMatch(/^DIAMOF/);
    expect(L.some(l => l.startsWith('G0 X-15 Y25.981'))).toBe(true);
    expect(L.indexOf('TRAFOOF')).toBeGreaterThan(i);
    expect(L[L.indexOf('TRAFOOF') + 1]).toBe('DIAMON');
  });
  it('rozepsané pohyby bez cyklů', () => {
    const L = buildLiveBlock(prms({ live: { cycles: false } }));
    expect(L.some(l => l.startsWith('CYCLE'))).toBe(false);
    expect(L).toContain('G1 Z-10 F120');
  });
  it('Fanuc: G83 s osou C, další díry jen polohou, G80', () => {
    const L = buildLiveBlock(prms({ controlSystem: 'fanuc', mode: 'RADIUS' }));
    expect(L.some(l => /^G83 X30 C0 Z-10 R-3 Q3000 F120/.test(l))).toBe(true);
    expect(L.some(l => l.startsWith('X30 C120'))).toBe(true);
    expect(L).toContain('G80');
    expect(L[0]).toMatch(/^\( >>> POHANENE NASTROJE \[fanuc\//);
  });
  it('radiální vrtání Fanuc G87', () => {
    const L = buildLiveBlock(prms({ controlSystem: 'fanuc', liveOps: [drill({ side: 'radial', count: 2, zPos: -15, xTop: 100 })] }));
    expect(L.some(l => /^G87 Z-15 C0 X80 /.test(l))).toBe(true);
  });
  it('první najetí: nejdřív Z (venku na bezpečné X), pak X', () => {
    const L = buildLiveBlock(prms());
    expect(L.indexOf('G0 Z5')).toBeLessThan(L.indexOf('G0 X60 ; díra 1: úhel 0°'));
  });
  it('Fanuc: závorka v názvu neukončí komentář', () => {
    const L = buildLiveBlock(prms({ controlSystem: 'fanuc', liveOps: [drill({ name: 'Vrtání (M8)', toolName: 'VRTAK (8)' })] }));
    L.filter(l => l.includes('(')).forEach(l => expect(l.match(/\(/g).length).toBe(1));
  });
  it('chybné zadání se do NC nezapíše', () => {
    const L = buildLiveBlock(prms({ liveOps: [drill({ depth: -5 })] }));
    expect(L.some(l => l.startsWith('CYCLE'))).toBe(false);
    expect(L.some(l => l.includes('VYNECHÁNO'))).toBe(true);
  });
  it('radiální díry v jiné výšce: nejdřív ven na bezpečnou X', () => {
    const L = buildLiveBlock(prms({ liveOps: [drill({ side: 'radial', pattern: 'points', points: '0; -10\n90; -30', xTop: 100 })] }));
    const i = L.findIndex(l => l.startsWith('G0 Z-30'));
    expect(L.slice(i - 3, i)).toContain('G0 X150');
  });
  it('čelo zleva: vrtá se k +Z (cyklus i rozepsaně), Fanuc R kladné', () => {
    const op = drill({ zTop: -50, faceDir: -1 });
    const L = buildLiveBlock(prms({ liveOps: [op] }));
    expect(L).toContain('CYCLE83(-55, -50, 2, -40, , -47, , 0, 0, 0, 1, 1)');
    const E = buildLiveBlock(prms({ liveOps: [op], live: { cycles: false } }));
    expect(E).toContain('G1 Z-40 F120');
    expect(E).toContain('G0 Z-55');
    const F = buildLiveBlock(prms({ controlSystem: 'fanuc', liveOps: [op] }));
    expect(F.some(l => /^G83 .* Z-40 R3 /.test(l))).toBe(true);
  });
  it('CYCLE83: DAM = 0 (stálý záběr), FDEP absolutně, dno s prodlevou', () => {
    const L = buildLiveBlock(prms({ liveOps: [drill({ dwell: 0.5 })] }));
    expect(L).toContain('CYCLE83(5, 0, 2, -10, , -3, , 0, 0.5, 0, 1, 1)');
  });
  it('Sinumerik: vřeteno nástroje podle čísla, SPCOF na konci operace', () => {
    const L = buildLiveBlock(prms({ live: { spindle: 3 } }));
    expect(L).toContain('S3=2000 M3=3 ; poháněný nástroj – dle stroje');
    expect(L).toContain('M3=5 ; stop poháněného nástroje');
    expect(L.some(l => l.startsWith('SPCOF'))).toBe(true);
    expect(L.some(l => l.startsWith('M70'))).toBe(false);     // SPOS nepotřebuje osu
  });
  it('TRANSMIT i osa C zapnou vřeteno do osy (M70)', () => {
    expect(buildLiveBlock(prms({ live: { mode: 'transmit' } })).some(l => l.startsWith('M70'))).toBe(true);
    expect(buildLiveBlock(prms({ live: { mode: 'caxis' } })).some(l => l.startsWith('M70'))).toBe(true);
  });
  it('prázdné pole M-kódu = výchozí hodnota', () => {
    const L = buildLiveBlock(prms({ live: { mode: 'caxis', m: { sinumerik: { cOn: '  ', toolOn: '' } } } }));
    expect(L.some(l => l.startsWith('M70'))).toBe(true);
    expect(L.some(l => l.startsWith('S2=2000 M2=3'))).toBe(true);
  });
  it('jméno osy C: C=DC(…) / Fanuc C1…', () => {
    const L = buildLiveBlock(prms({ live: { mode: 'caxis', cName: 'C1' } }));
    expect(L).toContain('G0 C1=DC(120)');
    const F = buildLiveBlock(prms({ controlSystem: 'fanuc', live: { cName: 'C2' } }));
    expect(F.some(l => l.startsWith('X60 C2120'))).toBe(true);
  });
  it('kalibrace úhlu: směr − a posun nuly (SPOS, TRANSMIT, Fanuc)', () => {
    const cal = { angleDir: -1, angleOffset: 10 };
    const L = buildLiveBlock(prms({ live: cal }));
    expect(L).toContain('SPOS=10');                        // 0°  → 10 + (−1)·0
    expect(L).toContain('SPOS=250');                       // 120° → 10 − 120 = −110 → 250
    expect(L.some(l => l.includes('Kalibrace úhlu: směr −, nula 10 st.'))).toBe(true);
    const T = buildLiveBlock(prms({ live: { ...cal, mode: 'transmit' } }));
    expect(T.some(l => l.startsWith('G0 X29.544 Y5.209'))).toBe(true);   // R30 pod 10°
    const F = buildLiveBlock(prms({ controlSystem: 'fanuc', live: cal }));
    expect(F.some(l => /^G83 X60 C10 Z-10/.test(l))).toBe(true);   // DIAMON → X v průměru
  });
  it('frézování v TRANSMIT: zrcadlený směr úhlu obrací smysl oblouku (G3 → G2)', () => {
    const mill = { ...newLiveOp('mill', null, 1), pattern: 'points', points: '0; 20', holeD: 16, toolD: 10, depth: 2, stepDown: 2 };
    const norm = buildLiveBlock(prms({ liveOps: [mill], live: { mode: 'transmit' } }));
    const mirr = buildLiveBlock(prms({ liveOps: [mill], live: { mode: 'transmit', angleDir: -1 } }));
    expect(norm.some(l => l.startsWith('G3 '))).toBe(true);
    expect(norm.some(l => l.startsWith('G2 '))).toBe(false);
    expect(mirr.some(l => l.startsWith('G2 '))).toBe(true);
    expect(mirr.some(l => l.startsWith('G3 '))).toBe(false);
  });
  it('Heidenhain: poháněný nástroj M3 / M5 (standard TNC)', () => {
    const L = buildLiveBlock(prms({ controlSystem: 'heidenhain' }));
    expect(L.some(l => /^S2000 M3 /.test(l))).toBe(true);
    expect(L.some(l => /^M5 /.test(l) && l.includes('stop poháněného'))).toBe(true);
  });
  it('bez operací žádný blok', () => {
    expect(buildLiveBlock(prms({ liveOps: [] }))).toEqual([]);
  });
});

describe('vložení do programu a simulace', () => {
  const prog = 'G18\nG0 X100 Z5\nG1 X80 Z-20 F0.2\nM30 ; Konec programu';
  it('vloží před M30, podruhé přepíše na místě', () => {
    const blk = buildLiveBlock(prms());
    const a = insertLiveBlock(prog, blk);
    const L = a.split('\n');
    const b = findLiveBlock(L);
    expect(L[b.end + 1]).toMatch(/^M30/);
    const again = insertLiveBlock(a, buildLiveBlock(prms({ liveOps: [drill({ count: 4 })] })));
    expect(again.split('>>> POHANENE').length).toBe(2);
    expect(again).toContain('SPOS=270');
    expect(removeLiveBlock(again)).toBe(prog);
  });
  it('Fanuc: blok před M9/M5/G28 závěru', () => {
    const f = 'G0 X100 Z5\nM9\nM5\nG28 U0 W0\nM30';
    const L = insertLiveBlock(f, ['( >>> POHANENE NASTROJE )', 'X1', '( <<< POHANENE NASTROJE )']).split('\n');
    expect(L.slice(1, 4)).toEqual(['( >>> POHANENE NASTROJE )', 'X1', '( <<< POHANENE NASTROJE )']);
  });
  it('M2=5 (vřeteno 2) není konec programu', () => {
    const L = insertLiveBlock('G0 X100\nM2=5\nG0 X120\nM30', ['; >>> POHANENE NASTROJE', '; <<< POHANENE NASTROJE']).split('\n');
    expect(L.indexOf('; >>> POHANENE NASTROJE')).toBe(3);
  });
  it('blok bez koncové značky simulace nepřeskakuje (zbytek programu nezmizí)', () => {
    const p = { mode: 'DIAMON', safeX: 150, safeZ: 5 };
    const broken = 'G0 X100 Z5\n; >>> POHANENE NASTROJE\nG1 X80 Z-20 F0.2\nM30';
    expect(parseManualGCodeToPath(broken, p, false).some(q => q.z === -20)).toBe(true);
  });
  it('simulace soustružení blok přeskočí (stejná dráha s blokem i bez)', () => {
    const p = { mode: 'DIAMON', safeX: 150, safeZ: 5 };
    const strip = path => path.map(q => [q.type, +q.x.toFixed(4), +q.z.toFixed(4)]);
    const without = parseManualGCodeToPath(prog, p, false);
    const withBlk = parseManualGCodeToPath(insertLiveBlock(prog, buildLiveBlock(prms())), p, false);
    expect(strip(withBlk)).toEqual(strip(without));
  });
  it('úprava operací nemění otisk vstupů drah', () => {
    const S = { params: { a: 1 }, contourPoints: [], stockPoints: [], zLimits: {}, xLimits: {}, guideLines: [] };
    const k0 = pathInputsKey(S);
    S.params.liveOps = [drill()]; S.params.live = { mode: 'caxis' };
    expect(pathInputsKey(S)).toBe(k0);
  });
});
