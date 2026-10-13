// Varování kolizí v CAM simulátoru: ⛔ validátor drah (hlášky v panelu,
// okno „Nástroj je v materiálu") a oranžová/červená stopa vnoření držáku
// při simulaci. Vyňato z camSimulator.js (bloky „Validace kolizí
// držáku/destičky" a „Kolize držáku s materiálem", docs/plan-rozdeleni-
// cam-simulatoru.md). Stav simulátoru a jeho funkce se předávají parametrem;
// vnitřní stav (debounce, cache klíče, instance HolderGouge) drží továrna.
import { validateToolpath } from '../collisionValidator.js';
import { startInMaterial } from '../startCheck.js';
import { HolderGouge } from '../holderGouge.js';

/**
 * Validace kolizí držáku/destičky (Fáze 2 migrace na Clipper2).
 * @returns {{ scheduleCollisionValidation: () => void }}
 */
export function createCollisionValidation({ S, showSidebar, renderTab, sidebar, showErrors, roughingKey, toolMirrored, boreSimFor, preDrillPhase, boreRealIssues, borePhases }) {
  // Nezávislá křížová kontrola vygenerovaných drah: běží debounced po
  // fullUpdate(), výsledky přidává do S.errors (⚠ panel). Broad-phase je
  // AABB — SAT přes Detect-Collisions odtud 26. 8. 2026 zmizel, protože
  // na složitém obrysu TIŠE ZAHAZOVAL kolize (viz makeBroadPhase
  // v collisionValidator.js) a přitom byl pomalejší než AABB.
  let _validateTimer = null;
  let _validatedKey = null;
  function scheduleCollisionValidation() {
    if (_validateTimer) clearTimeout(_validateTimer);
    _validateTimer = setTimeout(runCollisionValidation, 600);
  }
  let _lastIssues = [];
  /** Kontrola kolizí se zastavila před koncem dráhy: null | 'blocks' | 'issues' (viz validateToolpath). */
  let _issuesTruncated = null;
  let _startHitActive = false;
  /** Okno „nástroj je v počátečním bodě v materiálu" + rychlý odkaz na Bezpečnou polohu. */
  function showStartPopup(st) {
    if (document.querySelector('.cam-start-popup')) return;
    const ov = document.createElement('div');
    ov.className = 'cam-confirm-overlay cam-start-popup';
    ov.innerHTML = `
      <div class="cam-confirm-box">
        <div class="cam-confirm-msg"><strong>⛔ Nástroj je v materiálu</strong><br><br>
          V počátečním bodu (Bezpečná poloha X${S.params.safeX} Z${S.params.safeZ}) leží ${st.what}
          — průnik ~${st.area.toFixed(1)} mm². Nástroj má začínat mimo materiál.</div>
        <div class="cam-confirm-btns">
          <button class="cam-confirm-cancel" data-r="close">Zavřít</button>
          <button class="cam-confirm-ok" data-r="set">⚙ Nastavit počáteční bod</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector('[data-r="close"]').addEventListener('click', close);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('[data-r="set"]').addEventListener('click', () => {
      close();
      S.activeTab = 'params';
      S.safetyConfigOpen = true;
      showSidebar();
      renderTab();
      const input = sidebar.querySelector('[data-p="safeX"]');
      if (input) {
        input.scrollIntoView({ block: 'center', behavior: 'smooth' });
        input.focus();
        const box = input.closest('.cam-sim-row') || input;
        box.style.transition = 'background-color .6s';
        box.style.backgroundColor = 'rgba(249,226,175,0.25)';
        setTimeout(() => { box.style.backgroundColor = ''; }, 1500);
      }
    });
    ov.querySelector('[data-r="set"]').focus();
  }
  function runCollisionValidation() {
    _validateTimer = null;
    const calc = S._cachedCalc;
    if (!S.params.respectInsertGeometry || !calc || !calc.simPath || calc.simPath.length < 2) {
      _validatedKey = null;
      _lastIssues = [];
      if (S.errors.some(e => e && e.collision)) {
        S.errors = S.errors.filter(e => !(e && e.collision));
        showErrors();
      }
      return;
    }
    // Klíč vstupů — plná validace jen při změně; jinak se jen znovu
    // připojí nasbírané problémy (calculate() přepisuje S.errors od nuly).
    const p = S.params;
    const key = [
      S.manualGCode, p.boreActive, p.boreDiameter, p.boreDepth, p.boreZStart, p.borePreDiameter, p.borePreDepth,
      p.borePreDrill, p.borePreTip, p.borePreDrillSlot,
      p.toolRadius, p.depthOfCut, p.toolLength,
      p.holderWidth, p.holderLength, p.holderInflate, p.holderInflateAll,
      JSON.stringify(p.holderProfile || null),
      p.stockMode, p.stockDiameter, p.stockLength, p.stockFace,
      roughingKey(), toolMirrored(), (calc.stockPathSegments || []).length,
    ].join('');
    if (key !== _validatedKey) {
      _validatedKey = key;
      let trunc = null;
      const tr = (a) => { if (a && a.truncated && trunc !== 'blocks') trunc = a.truncated; return a; };
      try {
        // Vyvrtávání: validuje se v zrcadle drah (viz boreSimFor), souřadnice
        // nálezů se překlopí zpátky.
        const bs = boreSimFor(calc);
        // Vyvrtávání z plného: úsek vrtání se validuje ve skutečném světě vrtákem.
        const pre = bs ? preDrillPhase(calc) : null;
        const drillIssues = pre
          ? tr(validateToolpath(calc.simPath.slice(0, pre.iSplit + 1), pre.params, calc.stockPathSegments, { backside: toolMirrored(), planStock: true }))
          : [];
        _lastIssues = bs
          ? drillIssues.concat(tr(boreRealIssues(bs, calc)).map(it => ({ kind: it.kind, lineIdx: it.lineIdx, x: it.x, z: it.z, area: it.area })), borePhases(bs).flatMap(b => tr(validateToolpath(b.calcM.simPath, b.params, b.calcM.stockPathSegments, { backside: false, planStock: true }))
            .map(it => ({ ...it, x: b.g.rRef - it.x }))))
          : tr(validateToolpath(calc.simPath, p, calc.stockPathSegments, {
            backside: toolMirrored(),
            // POLOTOVAR KONČÍ AŽ NA OFFSETOVÉ ČÁŘE — dráhy se proti ní plánují
            // a náhled ji vybarvuje; ⛔ panel byl poslední, kdo měřil jen
            // nakreslený obrys.
            planStock: true,
          }));
        _issuesTruncated = trunc;
        // Nástroj nesmí začínat v materiálu (cam/startCheck.js) — okno s odkazem
        // na Bezpečnou polohu se ukáže jen při změně vstupů, ne při každém překreslení.
        const st = bs ? null : startInMaterial(p, calc, { backside: toolMirrored() });
        if (st) {
          _lastIssues = _lastIssues.concat([{ kind: 'start', lineIdx: null, x: st.x, z: st.z, area: st.area, what: st.what }]);
          // Okno jen při PŘECHODU „mimo → v materiálu" — při ladění Bp (psaní čísla)
          // by jinak vyskakovalo po každé změně.
          if (!_startHitActive) showStartPopup(st);
        }
        _startHitActive = !!st;
      } catch (err) {
        _lastIssues = [];
        _issuesTruncated = null;
        console.warn('CAM: validace kolizí selhala:', err);
      }
    }
    const issues = _lastIssues;
    S.errors = S.errors.filter(e => !(e && e.collision));
    const lines = S.manualGCode.split('\n');
    const lineLabel = (idx) => {
      const m = idx != null && lines[idx] ? lines[idx].match(/^\s*(N\d+)/) : null;
      return m ? m[1] : (idx != null ? `řádek ${idx + 1}` : 'dráha');
    };
    for (const it of issues) {
      const where = `X${(it.x * 2).toFixed(1)} Z${it.z.toFixed(1)}`;
      S.errors.push({
        collision: true,
        msg: it.kind === 'start'
          ? `⛔ Nástroj je v počátečním bodu (Bp X${S.params.safeX} Z${S.params.safeZ}) v materiálu (${it.what}) — průnik ~${it.area.toFixed(1)} mm². Změň Bezpečnou polohu.`
          : it.kind === 'rapid'
          ? `⛔ Rychloposuv materiálem (${lineLabel(it.lineIdx)}, ${where}) — průnik ~${it.area.toFixed(1)} mm².`
          : `⛔ Držák v kolizi se zbývajícím materiálem (${lineLabel(it.lineIdx)}, ${where}) — průnik ~${it.area.toFixed(1)} mm².`,
      });
    }
    if (_issuesTruncated) {
      S.errors.push({
        collision: true,
        msg: _issuesTruncated === 'blocks'
          ? '⚠ Program je delší než limit kontroly kolizí (6000 bloků) — zkontrolován je jen začátek, zbytek NENÍ ověřen.'
          : `⚠ Zobrazeno prvních ${issues.length} nálezů — kontrola se zastavila, další kolize mohou být dál v programu.`,
      });
    }
    showErrors();
  }
  return { scheduleCollisionValidation };
}

/**
 * Kolize držáku s materiálem (oranžové varování) pro kreslení simulace.
 * @returns {{ getHolderGouge: (calc) => ({ hard, band } | null) }}
 */
export function createHolderGougeView({ S, boreSimFor, inPreDrill, borePhases, boreLocalIdx, toolMirrored }) {
  // AKUMULOVANÁ stopa vnoření: stopa obrysu držáku podél projeté dráhy ×
  // zbývající materiál v daném okamžiku (HolderGouge). Na rozdíl od okamžité
  // kontroly oblast ZŮSTANE oranžová i po přejetí — je to záznam, kde všude
  // se držák do materiálu vnořil. Instance se váže na konkrétní calc (identita)
  // stejně jako _removal. Vrací pole smyček v SIM souřadnicích {x,z} (kresli
  // přes toScreen), nebo null.
  let _holderGouge = null;
  let _holderGougeCalcRef = null;
  // Vrací { hard, band } — `hard` = vnoření do MATERIÁLU (oranžové, jako dosud),
  // `band` = vjezd do PÁSU mezi syrovým obrysem a offsetovou čarou (červené).
  // Odlitek může být až u té čáry, takže držák za ní je na nadměrném kusu
  // kolize — na nakresleném odlitku se předtím nevybarvilo nic (nález uživatele
  // 19. 8. 2026). Oba záznamy jsou disjunktní (pás = offset MÍNUS syrový obrys).
  function getHolderGouge(calc) {
    if (S.simProgress <= 0 || !calc || !calc.simPath || calc.simPath.length < 2) {
      return null;
    }
    const bs = boreSimFor(calc);
    if (bs) {
      if (inPreDrill(calc)) return null;   // vrták: pouzdro jede jen v ose (⛔ hlídá validátor)
      const hardB = [], bandB = [];
      for (const b of borePhases(bs)) {
        if (!b.holderGouge) b.holderGouge = new HolderGouge(b.params, b.calcM.stockPathSegments, false, { band: true });
        const hg = b.holderGouge;
        if (!hg.valid) continue;
        hg.advanceTo(b.calcM.simPath, boreLocalIdx(b));
        if (hg.gouge.length) hardB.push(...b.un(hg.gouge));
        if (hg.gougeBand.length) bandB.push(...b.un(hg.gougeBand));
      }
      return (hardB.length || bandB.length) ? { hard: hardB.length ? hardB : null, band: bandB.length ? bandB : null } : null;
    }
    if (!_holderGouge || _holderGougeCalcRef !== calc) {
      _holderGouge = new HolderGouge(S.params, calc.stockPathSegments, toolMirrored(), { band: true });
      _holderGougeCalcRef = calc;
    }
    if (!_holderGouge.valid) return null;
    const fIdx = S.simProgress * (calc.simPath.length - 1);
    _holderGouge.advanceTo(calc.simPath, fIdx);
    const hard = _holderGouge.gouge.length ? _holderGouge.gouge : null;
    const band = _holderGouge.gougeBand.length ? _holderGouge.gougeBand : null;
    return (hard || band) ? { hard, band } : null;
  }
  return { getHolderGouge };
}
