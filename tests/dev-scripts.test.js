// Vývojářské skripty v scripts/ — jinak je žádný test nespouští, takže se po
// přesunech kódu ze simulátoru do modulů rozbily nepozorovaně (zjištěno
// 13. 10. 2026: cam_debug, cam_face_debug i cam_gcode_repro padaly už před
// rozdělením camSimulator.js a při pádu nechávaly v scripts/ dočasné soubory).
//
// Každý se spustí stejně jako ručně (`node scripts/…`) a musí doběhnout,
// vypsat své oddíly a nenechat v scripts/ nic navíc. cam_gcode_repro jede
// přes tests/helpers/camHeadless.mjs — `test:cad` tak zachytí i rozbití
// headless běhu CAM (jinak ho hlídají jen CAM testy v plné sadě).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Spustí skript; při nenulovém kódu vyhodí chybu s koncem stderr. */
function run(script, args = [], env = {}) {
  try {
    return execFileSync(process.execPath, [join('scripts', script), ...args], {
      cwd: root, encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CAMDBG: '', CAMSVG: '', ...env },
    });
  } catch (e) {
    throw new Error(`${script} spadl (kód ${e.status}):\n${String(e.stderr || e.message).slice(-1500)}`);
  }
}
/** Dočasné / výstupní soubory skriptů, které v scripts/ nemají zůstat. */
const leftovers = () => readdirSync(join(root, 'scripts')).filter(f => /^_cam.*\.(mjs|svg)$/.test(f)).sort();

describe('vývojářské skripty v scripts/ jdou spustit', () => {
  it('cam_debug.mjs — offsety a kontura po přemostění', () => {
    const before = leftovers();
    const out = run('cam_debug.mjs');
    for (const section of ['=== contourSegments', '=== roughing offsetPath', '=== machinableContour', '--- roughing offsetPath na machinable (ON) ---'])
      expect(out, section).toContain(section);
    expect(leftovers()).toEqual(before);
  });

  it('cam_face_debug.mjs — čelní hrubování nad scripts/user_face.camprog', () => {
    const before = leftovers();
    const out = run('cam_face_debug.mjs');
    for (const section of ['=== interferenceGuides', '=== machinableContour'])
      expect(out, section).toContain(section);
    expect(leftovers()).toEqual(before);
  });

  it('cam_gcode_repro.mjs — G-kód i ladicí výpis (CAMDBG) přes camHeadless', () => {
    const before = leftovers();
    const out = run('cam_gcode_repro.mjs', ['tests/fixtures/cam/part-1.camprog'], { CAMDBG: '1' });
    for (const section of ['=== offsetPath ===', '=== passes ===', '; Vygenerovaný kód SINUMERIK 840D'])
      expect(out, section).toContain(section);
    expect(out.split('\n').filter(l => /^N\d+ G[0-3]\b/.test(l)).length).toBeGreaterThan(50);
    expect(leftovers()).toEqual(before);
  });
});
