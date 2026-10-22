// Blok poháněných nástrojů v NC PROGRAMU simulátoru (mezi značkami
// liveMarkers.js, před koncem programu). Vyňato z livePanel.js.
//
// Vrtání děr z výkresu je operace Vrtání — blok GENERUJE ops/drill.js do
// programu své části (🔄 Dráhy), žádné vkládání textu. Tenhle modul obsluhuje
// jen ruční cestu v 🛠 Operace: 📝 Zapsat do programu (blok na konec
// soustružení — zápis přes textarea, událost input = stejná cesta jako ruční
// úprava, platí ochrana ručních zásahů, uložení i ↩) a 🗑 Z programu.
// Blok patří na KONEC celku: v částech programu do poslední části.
import { liveSettings } from './liveModel.js';
import { buildLiveBlock } from './liveGcode.js';
import { insertLiveBlock, removeLiveBlock, findLiveBlock, liveBlockTag } from './liveMarkers.js';

/**
 * @param d { S, root, pushHistory, toast }
 */
export function createLiveProgram(d) {
  const { S, root } = d;
  const ta = () => root.querySelector('.cam-sim-manual-ta');
  const text = () => String(S.manualGCode || '');
  const lines = () => text().replace(/\r\n/g, '\n').split('\n');
  const multi = () => !!(S.opParts && S.opParts.length > 1);
  const last = () => (multi() ? S.opParts.length - 1 : 0);

  // Volá se při každém snímku simulace — pamatovat pro stejné znění programu.
  let memo = { t: null, v: false };
  function has() {
    const t = text();
    if (memo.t !== t) memo = { t, v: !!findLiveBlock(lines()) };
    return memo.v;
  }

  /**
   * Operace Vrtání má v programu jiný blok, než dávají operace (výběr děr se
   * změnil v jiné části — díry jsou společné dílu)? Jednou na znění programu
   * a operací, ať se nepřegenerovávalo pořád dokola (ruční úpravy).
   */
  let staleKey = '';
  function stale() {
    if (!S.params.drillActive || S.gcodeDirty || S.opView === 'all') return false;
    const k = `${text().length}|${JSON.stringify(S.params.liveOps)}|${JSON.stringify(S.params.live || {})}|${S.params.drillSource || ''}`;
    if (k === staleKey) return false;
    staleKey = k;
    const ls = lines(), b = findLiveBlock(ls);
    return buildLiveBlock(S.params).join('\n') !== (b ? ls.slice(b.start, b.end + 1).join('\n') : '');
  }

  /** Stav pro editor operací: { cls, text }. */
  function blockState() {
    const ls = lines();
    const b = findLiveBlock(ls);
    if (S.params.drillActive && S.params.liveKind === 'mill') {
      return b ? { cls: 'ok', text: '✔ Operace Frézování: program této části je frézování z výkresu (generuje 🔄 Dráhy, úpravy operací ho přegenerují).' }
        : { cls: 'warn', text: '⚠ Operace Frézování nemá v programu nic z výkresu — zkontrolujte výběr (⚙ Parametry → Frézování) a 🔄 Dráhy.' };
    }
    if (S.params.drillActive) {
      return b ? { cls: 'ok', text: '✔ Operace Vrtání: program této části je vrtání děr z výkresu (generuje 🔄 Dráhy, úpravy operací ho přegenerují).' }
        : { cls: 'warn', text: '⚠ Operace Vrtání nemá v programu díry z výkresu — zkontrolujte výběr děr (⚙ Parametry → Vrtání) a 🔄 Dráhy.' };
    }
    if (!b) return { cls: '', text: 'Vrtání a frézování jsou samostatné operace: ⚙ Parametry → Obrábění → Vrtání / Frézování (nebo 🔩 Vyvrtat). Do programu soustružení je lze vložit i ručně 📝.' };
    const tag = liveBlockTag(ls);
    const same = buildLiveBlock(S.params).join('\n') === ls.slice(b.start, b.end + 1).join('\n');
    if (same) return { cls: 'ok', text: '✔ Blok je v programu a odpovídá operacím (úpravy se do něj zapisují samy).' };
    const set = liveSettings(S.params);
    if (tag && (tag.ctrl !== (S.params.controlSystem || 'sinumerik') || tag.mode !== set.mode))
      return { cls: 'warn', text: `⚠ Blok v programu je pro ${tag.ctrl}/${tag.mode} — klikněte na 📝 Zapsat.` };
    return { cls: 'warn', text: '⚠ Blok v programu neodpovídá operacím — klikněte na 📝 Zapsat.' };
  }

  /** Zapsat / přepsat blok; false = nejde (hláška, když ne `quiet`) nebo beze změny. */
  function write(withHistory, quiet = false) {
    const t = ta();
    if (!t) return false;
    if (t.readOnly) { if (!quiet) d.toast('Celý program je jen náhled — přepněte na část programu (poslední operaci)'); return false; }
    // V jiné než poslední části by po bloku další soustružení jelo se
    // zastaveným vřetenem, posuvem mm/min a poháněným nástrojem v revolveru.
    if (multi() && S.activePart !== last()) {
      if (!quiet) d.toast('Blok poháněných nástrojů patří do POSLEDNÍ části programu — přepněte na ni', 4000);
      return false;
    }
    const block = buildLiveBlock(S.params);
    const code = t.value;
    const next = block.length ? insertLiveBlock(code, block) : removeLiveBlock(code);
    if (next === code) return false;
    if (withHistory) d.pushHistory();
    t.value = next;
    t.dispatchEvent(new Event('input'));
    return true;
  }

  /** Odebrat blok (s historií). */
  function unwrite() {
    const t = ta();
    if (!t || t.readOnly) return false;
    const next = removeLiveBlock(t.value);
    if (next === t.value) return false;
    d.pushHistory(); t.value = next; t.dispatchEvent(new Event('input'));
    return true;
  }

  return { text, has, blockState, write, unwrite, stale };
}
