// Fanuc komentář = text v závorkách; první `)` ho ukončí a středník není
// komentář. Vnořená závorka („HRUBOVANI (CELNI)") nebo natvrdo psané
// `; text` by zbytek řádku poslaly řízení jako kód → alarm.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runCamProg } from './helpers/camHeadless.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/cam/${name}`, import.meta.url), 'utf8'));

describe('Fanuc: komentáře v G-kódu', () => {
  // face-casting = hlavička „HRUBOVANI (CELNI)", part-1 = přejezd materiálem posuvem
  for (const name of ['face-casting.camprog', 'part-1.camprog']) {
    it(`${name}: bez vnořených závorek a bez středníku`, async () => {
      const prog = fixture(name);
      prog.params = { ...prog.params, controlSystem: 'fanuc' };
      const { gcode } = await runCamProg(prog);
      const lines = gcode.split('\n');
      expect(lines.filter(l => /\([^)]*\(/.test(l))).toEqual([]);
      expect(lines.filter(l => l.includes(';'))).toEqual([]);
    }, 120000);
  }
});
