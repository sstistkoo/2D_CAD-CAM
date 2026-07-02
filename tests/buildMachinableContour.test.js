// ╔══════════════════════════════════════════════════════════════╗
// ║  Charakterizace buildMachinableContour — 4 topologie přemostění ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Přímé jednotkové testy čisté funkce buildMachinableContour (mimo pipeline).
// Zamykají chování KAŽDÉ větve přemostění zvlášť, aby šlo ty tři topologie
// v bridgeFromContourToStock bezpečně sjednotit / opravit (např. latentní
// loc.at bug) s okamžitou zpětnou vazbou. Fixture snapshoty kryjí jen to, co
// reálné díly zrovna trefí; tohle kryje větve cíleně.
import { describe as vdescribe, it, expect, beforeAll } from 'vitest';
import { loadCamInternals, line, guide, describe } from './helpers/camInternals.mjs';

let H;
beforeAll(async () => { H = await loadCamInternals(); });

const build = (segs, guides) => describe(H.buildMachinableContour(segs.map(s => ({ ...s })), guides));

vdescribe('buildMachinableContour — topologie přemostění', () => {
  it('bez čar → kontura beze změny', () => {
    const segs = [line(10, 30, 10, 20), line(10, 20, 10, 0)];
    expect(build(segs, [])).toEqual([
      'L (10.00,30.00)->(10.00,20.00)', 'L (10.00,20.00)->(10.00,0.00)',
    ]);
  });

  it('oba konce na kontuře → výběžek nahrazen přímým mostem', () => {
    const segs = [line(10, 30, 10, 20), line(10, 20, 15, 15), line(15, 15, 10, 10), line(10, 10, 10, 0)];
    expect(build(segs, [guide(10, 20, 10, 10)])).toEqual([
      'L (10.00,30.00)->(10.00,20.00)',
      'L (10.00,20.00)->(10.00,10.00) {ins}',   // most přes výběžek
      'L (10.00,10.00)->(10.00,0.00)',
    ]);
  });

  it('downOnStock → zakončení kontury na hraně polotovaru (zahodí čelo k ose)', () => {
    const segs = [line(10, 30, 10, 20), line(10, 20, 10, 10), line(10, 10, 0, 10)]; // poslední = čelo k ose
    expect(build(segs, [guide(8, 5, 10, 10, { downOnStock: true })])).toEqual([
      'L (10.00,30.00)->(10.00,20.00)',
      'L (10.00,20.00)->(10.00,10.00)',
      'L (10.00,10.00)->(8.00,5.00) {ins}',     // čelo (->0,10) zahozeno, most k polotovaru
    ]);
  });

  it('prodloužení k okraji → kontura protažena mostem k blízkému off bodu', () => {
    const segs = [line(10, 30, 10, 20), line(10, 20, 10, 10)];
    expect(build(segs, [guide(10, 10, 8, 8, { downOnStock: false })])).toEqual([
      'L (10.00,30.00)->(10.00,20.00)',
      'L (10.00,20.00)->(10.00,10.00)',
      'L (10.00,10.00)->(8.00,8.00) {ins}',     // prodloužení
    ]);
  });

  it('náběhový stín → úsek ve stínu nahrazen mostem + konektor, ocas zachován', () => {
    const segs = [line(20, 30, 20, 25), line(20, 25, 10, 20), line(10, 20, 10, 10), line(10, 10, 20, 5), line(20, 5, 20, 0)];
    expect(build(segs, [guide(20, 25, 25, 8, { downOnStock: false })])).toEqual([
      'L (20.00,30.00)->(20.00,25.00)',
      'L (20.00,25.00)->(25.00,8.00) {ins}',    // most podél čáry
      'L (25.00,8.00)->(20.00,5.00) {ins}',     // konektor zpět na ocas
      'L (20.00,5.00)->(20.00,0.00)',
    ]);
  });

  // ── párování kapes (mergePocketGuides): 'zanoreni' + 'dojezd' čára tvořící V ──
  // POZN.: reálné fixtures vydávají jen 'zanoreni' čáry, takže tuhle větev
  // pokrývají POUZE tyto přímé testy.
  it('V-kapsa (zanoreni + dojezd) → recess nahrazen „V" v průsečíku čar', () => {
    const segs = [line(20, 30, 20, 20), line(20, 20, 10, 15), line(10, 15, 20, 10), line(20, 10, 20, 0)];
    const guides = [
      guide(20, 20, 11, 16, { kind: 'zanoreni' }),
      guide(20, 10, 11, 14, { kind: 'dojezd' }),
    ];
    expect(build(segs, guides)).toEqual([
      'L (20.00,30.00)->(20.00,20.00)',
      'L (20.00,20.00)->(8.75,15.00) {ins}',    // roh A → dno V (průsečík čar)
      'L (8.75,15.00)->(20.00,10.00) {ins}',    // dno V → roh B
      'L (20.00,10.00)->(20.00,0.00)',
    ]);
  });

  it('mergePocketGuides přímo: spáruje a spotřebuje obě čáry', async () => {
    const segs = [line(20, 30, 20, 20), line(20, 20, 10, 15), line(10, 15, 20, 10), line(20, 10, 20, 0)];
    const guides = [
      guide(20, 20, 11, 16, { kind: 'zanoreni' }),
      guide(20, 10, 11, 14, { kind: 'dojezd' }),
    ];
    const r = H.mergePocketGuides(segs.map(s => ({ ...s })), guides);
    expect([...r.consumed].sort()).toEqual([0, 1]);
  });
});
