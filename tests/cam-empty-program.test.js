// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – program bez jediného řezného pohybu se MUSÍ ohlásit    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Dílčí hlášení emise mluví o „N vynechaných úsecích". Že jich bylo VŠECHNO
// a vznikl program, který nic neobrobí, z nich poznat nejde — hlavička,
// `--- DOKONCOVANI ---` i M30 se vypíšou úplně stejně jako u pořádného
// programu, takže by odjel na stroj.
//
// Reálný nález 26. 8. 2026: „jen dokončovací operace" (záložka Hot.) nad
// NEOBROBENÝM odlitkem vynechá všech 17 dokončovacích úseků — na dráze stojí
// víc materiálu než hloubka třísky, takže je strop hloubky dokončovacího řezu
// všechny zahodí. Je to správné rozhodnutí (jedním průchodem by to nešlo
// uříznout), ale výsledek musí být vidět.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = join(__dirname, 'fixtures', 'cam');

const loadFx = (name) => JSON.parse(readFileSync(join(fxDir, name + '.camprog'), 'utf8'));
/** Řezné pohyby v programu (G1/G2/G3 s N-číslem; G0 se nepočítá). */
const cutMoves = (gcode) => gcode.split('\n').filter(l => /^\s*N\d+\s+G0?[123]\b/.test(l)).length;
const emptyNote = (run) => (run.S.genNotes || []).find(n => /ŽÁDNÝ ŘEZNÝ POHYB/.test(n.msg));

describe('CAM: prázdný program (bez řezných pohybů)', () => {
  it('„jen dokončení" nad neobrobeným odlitkem: nic se neobrobí a hlásí se to', async () => {
    const prog = loadFx('part-1');
    prog.params.finishOnly = true;
    const run = await runCamProg(prog);

    // Program vypadá hotově — hlavička i sekce dokončování tam jsou…
    expect(run.gcode).toContain('DOKONCOVANI');
    // …ale neobsahuje jediný řezný pohyb.
    expect(cutMoves(run.gcode)).toBe(0);
    // …a přesně tohle musí být v ⚠ panelu, ne jen „N úseků vynecháno".
    const note = emptyNote(run);
    expect(note, 'chybí hlášení o prázdném programu').toBeTruthy();
    // Text u „jen dokončení" musí poradit, co s tím (polotovar po hrubování).
    expect(note.msg).toMatch(/vyhrubovan|➕ Operace/);
  });

  it('týž díl s hrubováním: řezné pohyby jsou a nic se nehlásí', async () => {
    const run = await runCamProg(loadFx('part-1'));
    expect(cutMoves(run.gcode)).toBeGreaterThan(50);
    expect(emptyNote(run)).toBeFalsy();
  });

  it('„jen dokončení" nad polotovarem PO hrubování projede normálně', async () => {
    // Válec těsně kolem dílu = co po sobě nechala předchozí operace.
    const prog = loadFx('part-1');
    Object.assign(prog.params, {
      finishOnly: true, stockMode: 'cylinder', stockDiameter: 85,
      stockMargin: 0.5, stockLength: 260, stockFace: 0.5,
    });
    prog.stockPoints = [];
    const run = await runCamProg(prog);
    expect(cutMoves(run.gcode)).toBeGreaterThan(0);
    expect(emptyNote(run)).toBeFalsy();
  });
});
