// Brána pravidel CAM (audit 21. 11. 2026): počet porušení docs/cam-pravidla.md
// na díl a pravidlo nesmí vzrůst proti scripts/cam-rules-baseline.json.
// Dřív kontrola hlásila 1584 porušení na 76 dílech a nová regrese mezi nimi
// zapadla. Po zlepšení baseline snížit:
//   node scripts/cam_rules_check.mjs --fixtures --save-baseline
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { join } from 'path';

describe('pravidla CAM proti baseline', () => {
  it('žádný díl nemá víc porušení než v baseline', () => {
    const r = spawnSync(process.execPath, [join(__dirname, '..', 'scripts', 'cam_rules_check.mjs'), '--fixtures', '--check-baseline'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const out = (r.stdout || '') + (r.stderr || '');
    const report = out.split('\n').filter(l => /REGRESE|·|díl chybí|Baseline OK|Error/.test(l)).join('\n');
    expect(r.status, report).toBe(0);
    expect(out).toMatch(/Baseline OK/);
  }, 900000);
});
