// cam_rules_check P6: dotek bokem není zanoření. Karusel od obvodu, ap 10,
// PSBNR (díl uživatele 12. 11. 2026): sjezd posuvem na vrstvu vedle hrany
// odlitku (`G0 Z59.860` → `G1 Z56.000` na X897.266) škrtl šikmou hlavní
// hranou o roh 0,12 mm² NAD začátkem sjezdu — pod nosem nic. Kontrola to
// hlásila 5× jako „90° (smí 15°)".
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('cam_rules_check P6 — dotek bokem', () => {
  it('sjezd vedle hrany odlitku není zanoření', () => {
    const out = execFileSync(process.execPath, [join(ROOT, 'scripts/cam_rules_check.mjs'),
      join(ROOT, 'tests/fixtures/cam-cases/carousel-rim-side-touch.camprog')], { encoding: 'utf8', maxBuffer: 1 << 24 });
    expect(out).toMatch(/P6 zanoření strměji než dovoleno: 0/);
    expect(out).toMatch(/P2 kolize: 0/);
  }, 120000);
});
