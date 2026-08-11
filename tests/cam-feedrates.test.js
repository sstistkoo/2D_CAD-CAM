import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RAPID_FEED, machineLimitRpm, rapidFeedMmMin,
  spindleRpmAt, moveRateMmMin, pathTimeSeconds, advanceAlongPath,
  buildTimeProfile, elapsedAtProgress, fmtClock, fmtDuration
} from '../js/calculators/cam/feedRates.js';
import { parseManualGCodeToPath } from '../js/calculators/cam/gcodeParser.js';

const prms = () => ({
  machineType: 'LIMS=2000', mode: 'DIAMON', speed: 200, feed: 0.25,
  rapidFeed: 6000, safeX: 150, safeZ: 5
});

describe('feedRates – reálné rychlosti pohybu', () => {
  it('rychloposuv bere z parametru, jinak 6000 mm/min', () => {
    expect(rapidFeedMmMin(prms())).toBe(6000);
    expect(rapidFeedMmMin({})).toBe(DEFAULT_RAPID_FEED);
    expect(rapidFeedMmMin({ rapidFeed: 12000 })).toBe(12000);
    expect(machineLimitRpm({ machineType: 'LIMS=3500' })).toBe(3500);
  });

  it('G96: n = Vc·1000/(π·⌀), u osy omezeno LIMS', () => {
    // Vc 200 m/min na ⌀100 (poloměr 50) → 636,6 ot/min
    expect(spindleRpmAt(50, prms(), { spindleMode: 'G96' })).toBeCloseTo(636.6, 1);
    // blízko osy by n rostlo nade vše → limit otáček stroje
    expect(spindleRpmAt(0.1, prms(), { spindleMode: 'G96' })).toBe(2000);
  });

  it('G97 (závit): S je rovnou v ot/min', () => {
    expect(spindleRpmAt(20, prms(), { spindleMode: 'G97', spindleVal: 800 })).toBe(800);
  });

  it('posuv na otáčku se přepočte na mm/min, G0 jede rychloposuvem', () => {
    const p = prms();
    // 0,25 mm/ot × 636,6 ot/min ≈ 159 mm/min
    expect(moveRateMmMin({ type: 'G1', feed: 0.25, feedMode: 'G95', spindleMode: 'G96' }, 50, p)).toBeCloseTo(159.15, 1);
    expect(moveRateMmMin({ type: 'G0' }, 50, p)).toBe(6000);
    // G94 = přímo mm/min
    expect(moveRateMmMin({ type: 'G1', feed: 300, feedMode: 'G94' }, 50, p)).toBe(300);
    // řezný posuv nemůže překročit rychloposuv stroje
    expect(moveRateMmMin({ type: 'G1', feed: 99, feedMode: 'G95', spindleMode: 'G96' }, 50, p)).toBe(6000);
  });

  it('čas dráhy = součet délka/rychlost (100 mm posuvem + 100 mm rychloposuvem)', () => {
    const path = [
      { x: 50, z: 0, type: 'G0' },
      { x: 50, z: -100, type: 'G1', feed: 0.25, feedMode: 'G95', spindleMode: 'G96' },
      { x: 150, z: -100, type: 'G0' }
    ];
    const { seconds, length } = pathTimeSeconds(path, prms());
    expect(length).toBeCloseTo(200, 6);
    // řez: 100 mm / 159,15 mm/min = 0,628 min = 37,7 s; rapid: 100/6000 min = 1 s
    expect(seconds).toBeCloseTo(37.7 + 1.0, 1);
  });

  it('přehrávání postupuje strojním časem, ne po bodech dráhy', () => {
    // Dvě části dráhy stejné délky (100 mm), ale zcela jiné rychlosti:
    // rychloposuv 6000 mm/min (1 s) a řez 159,15 mm/min (37,7 s).
    const path = [
      { x: 50, z: 100, type: 'G0' },
      { x: 50, z: 0, type: 'G0' },
      { x: 50, z: -100, type: 'G1', feed: 0.25, feedMode: 'G95', spindleMode: 'G96' }
    ];
    const p = prms();
    // po 1 s je hotový rychloposuv = přesně první z dvou segmentů
    expect(advanceAlongPath(path, 0, 1.0, p)).toBeCloseTo(0.5, 3);
    // dalších 18,85 s = půlka řezu → 3/4 dráhy v indexech
    expect(advanceAlongPath(path, 0.5, 18.85, p)).toBeCloseTo(0.75, 2);
    // celý program (38,7 s) doběhne do konce a nepřeteče
    expect(advanceAlongPath(path, 0, 60, p)).toBe(1);
    // oblouk rozsekaný na hodně bodů se NEZPOMALÍ: 30 mikro-segmentů
    // stejné celkové délky jako jeden dlouhý musí trvat stejně dlouho
    const arcLike = [{ x: 50, z: 0, type: 'G1', feed: 0.25, feedMode: 'G95', spindleMode: 'G96' }];
    for (let i = 1; i <= 30; i++) arcLike.push({ x: 50, z: -100 * i / 30, type: 'G1', feed: 0.25, feedMode: 'G95', spindleMode: 'G96' });
    expect(pathTimeSeconds(arcLike, p).seconds).toBeCloseTo(37.7, 1);
    expect(advanceAlongPath(arcLike, 0, 18.85, p)).toBeCloseTo(0.5, 2);
  });

  it('ubíhající čas odpovídá tomu, co se z dráhy ujelo', () => {
    const path = [
      { x: 50, z: 100, type: 'G0' },                                                    // 100 mm rapidem = 1 s
      { x: 50, z: 0, type: 'G0' },
      { x: 50, z: -100, type: 'G1', feed: 0.25, feedMode: 'G95', spindleMode: 'G96' }   // 100 mm řezem = 37,7 s
    ];
    const p = prms();
    const prof = buildTimeProfile(path, p);
    expect(prof[1]).toBeCloseTo(1.0, 3);
    expect(prof[2]).toBeCloseTo(38.7, 1);
    expect(elapsedAtProgress(prof, 0)).toBe(0);
    expect(elapsedAtProgress(prof, 0.5)).toBeCloseTo(1.0, 3);      // konec rychloposuvu
    expect(elapsedAtProgress(prof, 0.75)).toBeCloseTo(19.85, 1);   // půlka řezu
    expect(elapsedAtProgress(prof, 1)).toBeCloseTo(pathTimeSeconds(path, p).seconds, 6);
  });

  it('fmtDuration / fmtClock', () => {
    expect(fmtDuration(380)).toBe('6m 20s');
    expect(fmtDuration(20)).toBe('20s');
    expect(fmtClock(65)).toBe('1:05');
    expect(fmtClock(9)).toBe('0:09');
    expect(fmtClock(3750)).toBe('1:02:30');
  });
});

describe('parser – modální F/S do bodů dráhy', () => {
  it('přebírá G96 S, LIMS, G95 F a přepnutí na G97 u závitu', () => {
    const code = [
      'LIMS=1500',
      'G95',
      'G96 S180 LIMS=1500',
      'G0 X100 Z2',
      'G1 X100 Z-50 F0.3',
      'G97 S900',
      'G33 Z-70 K2'
    ].join('\n');
    const path = parseManualGCodeToPath(code, prms(), false);
    const cut = path.find(p => p.type === 'G1' && p.z === -50);
    expect(cut.feed).toBe(0.3);
    expect(cut.feedMode).toBe('G95');
    expect(cut.spindleMode).toBe('G96');
    expect(cut.spindleVal).toBe(180);
    expect(cut.lims).toBe(1500);
    // G33 → simulovaný G1, otáčky konstantní, posuv = stoupání
    const thr = path.find(p => p.z === -70);
    expect(thr.spindleMode).toBe('G97');
    expect(thr.spindleVal).toBe(900);
    expect(thr.feed).toBe(2);
    expect(moveRateMmMin(thr, 20, prms())).toBeCloseTo(1800, 6);   // 2 mm/ot × 900
  });

  it('G4 F… je prodleva, ne posuv; Fanuc G50 S… je limit otáček', () => {
    const code = ['G99', 'G50 S2500', 'G96 S150 M3', 'G1 X40 Z-10 F0.2', 'G4 F2.5', 'G1 Z-20'].join('\n');
    const path = parseManualGCodeToPath(code, { ...prms(), machineType: '' }, false);
    const last = path[path.length - 1];
    expect(last.feed).toBe(0.2);          // G4 F2.5 posuv nepřepsalo
    expect(last.feedMode).toBe('G95');    // Fanuc G99 = mm/ot
    expect(last.lims).toBe(2500);
    expect(last.spindleVal).toBe(150);
  });
});
