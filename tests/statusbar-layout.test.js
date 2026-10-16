// Stavový řádek na desktopu nesmí mít obsah pod pravým panelem. #sidebar je
// od 901 px position: fixed přes celou výšku a překrývá i stavový řádek —
// tlačítka (Nastavení, Editor, VK) pod ním při užším okně mizela (nález č. 9
// v docs/plan-refaktoringu-ui.md). Rozložení ověřeno v prohlížeči; tady jen
// stráž, že pravidlo v CSS zůstane (happy-dom styly nenačítá).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(import.meta.dirname, '..', 'css', 'style.css'), 'utf8');
const px = (v) => parseFloat(v);

describe('stavový řádek vs. pravý panel (desktop)', () => {
  it('obsah stavového řádku končí u levého okraje fixního panelu a nepřetéká pod něj', () => {
    const blocks = [...css.matchAll(/@media \(min-width: 901px\) \{([\s\S]*?)\n\}/g)].map(m => m[1]);
    const sidebarW = blocks.map(b => b.match(/#sidebar \{[^}]*position: fixed;[^}]*width: (\d+)px/)).find(Boolean)?.[1];
    expect(sidebarW, '#sidebar fixed s šířkou v desktopovém bloku').toBeTruthy();
    const sb = blocks.map(b => b.match(/#statusbar \{([^}]*)\}/)).filter(Boolean).map(m => m[1]).join('\n');
    expect(px(sb.match(/padding-right: (\d+)px/)?.[1])).toBeGreaterThanOrEqual(px(sidebarW));
    expect(sb).toMatch(/flex-wrap: wrap/);
    // desktopový blok musí být ZA základním #statusbar (jinak ho `padding` přebije)
    const base = css.indexOf('#statusbar {\n  background');
    const desk = css.indexOf('#statusbar {\n    padding-right');
    expect(base).toBeGreaterThan(-1);
    expect(desk).toBeGreaterThan(base);
  });
});
