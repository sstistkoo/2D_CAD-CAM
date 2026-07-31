// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – VK (Volná kontura) – editor syntaxe volných prvků    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Pomocník pro zápis konturových prvků se zčásti neznámými rozměry
// (obdoba Heidenhain FK – Free Kontur programming): úsečka/oblouk se
// zadá tím, co je známo (pravoúhle X/Z, polárně PA/PR k pólu VPOL, nebo
// „?" tam, kde je rozměr neznámý a dopočítá se jinde). Vygenerovaný
// zápis (G111/G11/G2/G3 + PA/PR/VPOL/T) je čistě textová pomůcka –
// needituje výkres, pouze pomáhá poskládat/zkontrolovat rozměrový
// řetězec před ručním dopočtem a případnou konverzí na standardní ISO.
//
// Sekce nápovědy (js/calculators/vkHelp.js) se vykresluje líně až při
// prvním rozbalení, aby se zbytečně nebudoval markup při každém otevření.

import { makeOverlay } from '../dialogFactory.js';
import { state, showToast } from '../state.js';
import { renderVkHelp } from './vkHelp.js';
import {
  elementRay, solveCornerLineLine, solveLineArcJunction, pickByVpolTag,
  tangentCircleTouchPoints, tangentCircleBetweenRays, pickBetweenRaysByVpolTag,
  twoTangentArcsBetweenRays, pickTwoArcsByVpolTag,
} from './vkSolver.js';

const DEFAULT_GCODE = '';

export function openVkContour() {
  // X může být zadáván v poloměru nebo průměru (☰ Nastavení → 📏 Zobrazení) –
  // popisky se přizpůsobí, ale vkSolver.js vždy počítá s poloměrem, takže se
  // hodnota při zadání/výstupu převádí přes toSolverX/fromSolverX níže.
  const xUnitLabel = state.xDisplayMode === 'diameter' ? 'Průměr' : 'Poloměr';
  const bodyHTML = `
    <div class="vk-canvas-placeholder">Grafický náhled VK (připravujeme)</div>

    <details class="sn-help-details vk-section">
      <summary class="sn-help-summary"><span class="vk-help-c-red">📍 1. Volný pól (VPOL)</span></summary>
      <div class="sn-help-body vk-section-body">
        <div class="vk-section-title vk-red">Definice pólu:</div>
        <div class="cnc-fields">
          <label class="cnc-field"><span class="vk-red">VPOL X (${xUnitLabel})</span><input type="text" class="vk-input-vpol" data-id="vpol-x" value="0.0"></label>
          <label class="cnc-field"><span class="vk-red">VPOL Z</span><input type="text" class="vk-input-vpol" data-id="vpol-z" value="40.0"></label>
        </div>

        <div class="vk-section-title vk-red">Konstrukční nástroje vyhledání průsečíku:</div>
        <div class="cnc-fields">
          <label class="cnc-field"><span>Konstrukční úhel (PA)</span><input type="text" data-id="vpol-pa" placeholder="Např. 45°"></label>
          <label class="cnc-field"><span>Hledat na rádiusu (R)</span><input type="text" data-id="vpol-arc" placeholder="Poloměr kružnice"></label>
        </div>
        <button class="vk-insert-btn vk-insert-red" data-act="vpol">Vložit VPOL</button>
      </div>
    </details>

    <details class="sn-help-details vk-section" open>
      <summary class="sn-help-summary vk-summary-with-nav">
        <span class="vk-help-c-orange">🎯 2. Nový VK prvek</span>
        <span class="vk-nav-buttons">
          <button type="button" class="vk-nav-btn" data-act="nav-prev" title="Předchozí nedořešený prvek">◀</button>
          <span class="vk-nav-pos" data-id="nav-pos"></span>
          <button type="button" class="vk-nav-btn" data-act="nav-next" title="Další / nový prvek">▶</button>
        </span>
      </summary>
      <div class="sn-help-body vk-section-body">
        <div class="vk-section-title">Geometrie prvku:</div>
        <div class="vk-toggle-row">
          <button class="vk-toggle active" data-type="vl">VL (Úsečka)</button>
          <button class="vk-toggle" data-type="vkr">VKr (Oblouk)</button>
        </div>

        <div class="vk-arc-settings" data-arc-settings style="display:none">
          <div class="vk-toggle-row" style="margin-top:6px">
            <button class="vk-toggle active" data-dir="G2">G2 (po směru)</button>
            <button class="vk-toggle" data-dir="G3">G3 (proti směru)</button>
          </div>
          <div class="cnc-fields" style="margin-top:6px">
            <label class="cnc-field">
              <span>Poloměr zaoblení (R)</span>
              <div class="vk-input-row">
                <input type="text" data-id="val-r" value="5.0">
                <button class="vk-btn-q" data-toggle="val-r">❓</button>
              </div>
            </label>
          </div>
          <div class="cnc-fields" style="margin-top:6px" title="Jen pro esíčko (dva tečné oblouky za sebou) – bez toho by měla soustava o 1 stupeň volnosti víc, než kolik je zadáno">
            <label class="cnc-field">
              <span>Bod zlomu k dalšímu oblouku – osa</span>
              <select data-id="junction-axis">
                <option value="">— (netřeba)</option>
                <option value="z">Z</option>
                <option value="x">X (${xUnitLabel.toLowerCase()})</option>
              </select>
            </label>
            <label class="cnc-field">
              <span>Bod zlomu – hodnota</span>
              <input type="text" data-id="junction-value" placeholder="Např. 12.0">
            </label>
          </div>
        </div>

        <div class="vk-section-title" data-id="coords-title">Souřadnice počátečního bodu:</div>
        <div class="cnc-fields">
          <label class="cnc-field">
            <span data-id="x2-label">Start X1 (${xUnitLabel})</span>
            <div class="vk-input-row">
              <input type="text" data-id="val-x2" value="?" class="vk-input-unknown">
              <button class="vk-btn-q active" data-toggle="val-x2">❓</button>
            </div>
          </label>
          <label class="cnc-field">
            <span data-id="z2-label">Start Z1</span>
            <div class="vk-input-row">
              <input type="text" data-id="val-z2" value="?" class="vk-input-unknown">
              <button class="vk-btn-q active" data-toggle="val-z2">❓</button>
            </div>
          </label>
          <label class="cnc-field">
            <span>Polární úhel (PA)</span>
            <div class="vk-input-row">
              <input type="text" data-id="val-pa" value="?" class="vk-input-unknown">
              <button class="vk-btn-q active" data-toggle="val-pa">❓</button>
            </div>
          </label>
          <label class="cnc-field">
            <span>Délka (PR)</span>
            <div class="vk-input-row">
              <input type="text" data-id="val-pr" value="?" class="vk-input-unknown">
              <button class="vk-btn-q active" data-toggle="val-pr">❓</button>
            </div>
          </label>
        </div>

        <div class="vk-section-title" data-id="tangent-title">Návaznost drah:</div>
        <label class="vk-checkbox-row" data-id="tangent-row">
          <input type="checkbox" data-id="check-t" checked>
          Tečné napojení na předchozí prvek (T)
        </label>
        <label class="cnc-field" title="Pokud má dopočet dvě řešení (např. netečné napojení na kružnici kolem VPOL), vyberte které se použije">
          <span>Dvojznačnost řešení</span>
          <select data-id="vpol-tag">
            <option value="">— (jednoznačné / nepočítat)</option>
            <option value="VPOL1">VPOL1 (blíž startu obrysu)</option>
            <option value="VPOL2">VPOL2 (dál od startu obrysu)</option>
          </select>
        </label>

        <div class="vk-actions" style="margin-top:6px">
          <button class="vk-insert-btn" data-act="element" data-id="element-btn" style="flex:2; margin-top:0">Vložit počáteční bod</button>
          <button class="vk-insert-btn vk-insert-red" data-act="remove-element" style="flex:1; margin-top:0">➖ Odebrat</button>
        </div>
        <div class="vk-solve-info" data-solve-info></div>
      </div>
    </details>

    <details class="sn-help-details vk-section" data-vk-help-details>
      <summary class="sn-help-summary"><span class="vk-help-c-green">❓ 3. Přehled syntaxe a možností VK</span></summary>
      <div class="sn-help-body vk-section-body" data-vk-help-container></div>
    </details>

    <div class="vk-gcode-box">
      <span>Generovaná VK syntaxe (lze upravit nebo smazat ručně):</span>
      <textarea class="vk-gcode-textarea" data-id="gcode">${DEFAULT_GCODE}</textarea>
    </div>

    <div class="vk-actions">
      <button class="vk-btn vk-btn-clear" data-act="clear">Smazat</button>
      <button class="vk-btn vk-btn-copy" data-act="copy">📋 Kopírovat</button>
      <button class="vk-btn vk-btn-convert" data-act="convert">Konvertovat na ISO G-kód</button>
    </div>
  `;

  const overlay = makeOverlay('vkcontour', '📐 VK – Volná kontura', bodyHTML, 'vk-window');
  if (!overlay) return;

  const q = (id) => overlay.querySelector(`[data-id="${id}"]`);
  overlay.querySelectorAll('.vk-input-row input').forEach(input => {
    input.addEventListener('focus', () => {
      if (input.classList.contains('vk-input-unknown') && input.value === '?') {
        input.value = '';
        input.classList.remove('vk-input-unknown');
      }
    });
    input.addEventListener('blur', () => {
      if (input.value.trim() === '') {
        input.value = '?';
        input.classList.add('vk-input-unknown');
      }
    });
  });

  let currentType = 'vl';
  let arcDir = 'G2';

  // ── Lazy nápověda ──
  const helpDetails = overlay.querySelector('[data-vk-help-details]');
  const helpContainer = overlay.querySelector('[data-vk-help-container]');
  helpDetails.addEventListener('toggle', () => {
    if (helpDetails.open && !helpContainer.dataset.loaded) {
      helpContainer.innerHTML = renderVkHelp();
      helpContainer.dataset.loaded = '1';
    }
  });

  // ── VL / VKr přepínač ──
  const arcSettings = overlay.querySelector('[data-arc-settings]');
  overlay.querySelectorAll('[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentType = btn.dataset.type;
      overlay.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b === btn));
      arcSettings.style.display = currentType === 'vkr' ? 'block' : 'none';
    });
  });

  // ── G2 / G3 přepínač ──
  overlay.querySelectorAll('[data-dir]').forEach(btn => {
    btn.addEventListener('click', () => {
      arcDir = btn.dataset.dir;
      overlay.querySelectorAll('[data-dir]').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  // ── ❓ přepínač neznámé hodnoty ──
  overlay.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = q(btn.dataset.toggle);
      const isUnknown = input.value === '?';
      if (isUnknown) {
        input.value = '';
        input.classList.remove('vk-input-unknown');
        btn.classList.remove('active');
        input.focus();
      } else {
        input.value = '?';
        input.classList.add('vk-input-unknown');
        btn.classList.add('active');
      }
    });
  });

  // ── Generovaná syntaxe ──
  const gcodeEl = q('gcode');
  const convertBtn = overlay.querySelector('[data-act="convert"]');
  const solveInfo = overlay.querySelector('[data-solve-info]');

  function resetConvertState() {
    convertBtn.classList.remove('vk-error-state', 'vk-success-state');
  }

  function appendCode(line) {
    gcodeEl.value = gcodeEl.value.trim() === '' ? line : `${gcodeEl.value}\n${line}`;
    resetConvertState();
  }

  function fmt(n) {
    return String(Math.round(n * 1000) / 1000);
  }

  // vkSolver.js vždy počítá s X jako průměrem (uvnitř dělí /2 na poloměr).
  // Appka ale může mít aktuálně nastavený režim zadávání na poloměr
  // (☰ Nastavení → 📏 Zobrazení, `state.xDisplayMode`) – v tom případě
  // je zadaná hodnota už poloměr a je potřeba ji před voláním solveru
  // vynásobit 2 (a výsledek zpět vydělit), aby geometrie seděla.
  function toSolverX(val) {
    return state.xDisplayMode === 'diameter' ? val : val * 2;
  }
  function fromSolverX(val) {
    return state.xDisplayMode === 'diameter' ? val : val / 2;
  }

  // ── Řetězec prvků pro dopočet neznámých (kategorie 1, 2, 3 a 4) ──
  // startPoint/vpolPoint/lastPoint/anchor a el.x jsou VŽDY v solver-
  // prostoru (X jako průměr, viz toSolverX výše) – el.xRaw drží
  // originální zobrazovanou hodnotu jen pro sestavení textu řádku.
  // pendingQueue drží 0–3 nedořešené prvky čekající na dopočet:
  //   [] – vše vyřešeno
  //   [A]      – kategorie 1 (A i nový prvek přímka/kužel) nebo kategorie 2
  //              case 5 (A přímka/kužel, nový prvek oblouk s T) / kategorie 4
  //              case 12-13 (A nebo nový prvek oblouk bez T, kolem VPOL)
  //   [A, B]   – B musí být oblouk s T (kategorie 2, case 6-8: A i nový
  //              prvek jsou přímka/kužel, B mezi nimi tečný o poloměru B.r)
  //   [A, B, C] – B i C musí být oblouky s T (kategorie 3, case 9-11:
  //              esíčko – vyžaduje na C znalost bodu zlomu, viz `junction`)
  let startPoint = null;
  let vpolPoint = null;
  let lastPoint = null;   // konec posledního VYŘEŠENÉHO prvku
  let pendingQueue = [];  // prvky { isArc, isT, x,z,pa,r, vpolTag, anchor, lineText, wasFirstEver, dir, prRaw }
  let chainStarted = false; // false, dokud nebyl vložen počáteční bod (i jako "?")
  let cursor = null;      // index do pendingQueue, který se právě prohlíží/edituje; null = nové zadání

  /** Nastaví pole na „?" (neznámé) nebo na konkrétní hodnotu – sdíleno mezi ❓ přepínačem a načtením prvku. */
  function setUnknownField(id, val) {
    const input = q(id);
    const btn = overlay.querySelector(`[data-toggle="${id}"]`);
    if (val == null) {
      input.value = '?';
      input.classList.add('vk-input-unknown');
      btn.classList.add('active');
    } else {
      input.value = val;
      input.classList.remove('vk-input-unknown');
      btn.classList.remove('active');
    }
  }

  /** Načte uložený nedořešený prvek zpět do formuláře (pro prohlížení/úpravu přes ◀ ▶). */
  function loadElementIntoForm(el) {
    currentType = el.isArc ? 'vkr' : 'vl';
    overlay.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === currentType));
    arcSettings.style.display = currentType === 'vkr' ? 'block' : 'none';
    if (el.isArc) {
      arcDir = el.dir || 'G2';
      overlay.querySelectorAll('[data-dir]').forEach(b => b.classList.toggle('active', b.dataset.dir === arcDir));
    }
    setUnknownField('val-x2', el.xRaw);
    setUnknownField('val-z2', el.z);
    setUnknownField('val-pa', el.pa);
    setUnknownField('val-pr', el.prRaw != null ? el.prRaw : null);
    q('val-r').value = el.r;
    q('check-t').checked = el.isT;
    q('vpol-tag').value = el.vpolTag || '';
    q('junction-axis').value = el.junction ? el.junction.axis : '';
    q('junction-value').value = el.junction ? el.junction.rawValue : '';
  }

  /** Vrátí formulář na výchozí hodnoty pro zadání nového prvku. */
  function resetFormToNewEntry() {
    currentType = 'vl';
    overlay.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === 'vl'));
    arcSettings.style.display = 'none';
    arcDir = 'G2';
    overlay.querySelectorAll('[data-dir]').forEach(b => b.classList.toggle('active', b.dataset.dir === 'G2'));
    setUnknownField('val-x2', null);
    setUnknownField('val-z2', null);
    setUnknownField('val-pa', null);
    setUnknownField('val-pr', null);
    q('val-r').value = '5.0';
    q('check-t').checked = true;
    q('vpol-tag').value = '';
    q('junction-axis').value = '';
    q('junction-value').value = '';
  }

  /** Přepne popisky/viditelnost polí mezi „počáteční bod" a „další prvek" (podle stavu / prohlíženého prvku). */
  function updateFormMode() {
    const editingItem = cursor !== null ? pendingQueue[cursor] : null;
    const first = editingItem ? editingItem.wasFirstEver : !chainStarted;
    q('coords-title').textContent = first
      ? 'Souřadnice počátečního bodu:'
      : 'Cílové souřadnice (X/Z nebo PA/PR k pólu):';
    q('x2-label').textContent = `${first ? 'Start X1' : 'Cíl X2'} (${xUnitLabel})`;
    q('z2-label').textContent = first ? 'Start Z1' : 'Cíl Z2';
    q('tangent-title').style.display = first ? 'none' : '';
    q('tangent-row').style.display = first ? 'none' : '';
    q('element-btn').textContent = editingItem ? '✓ Uložit úpravu' : (first ? 'Vložit počáteční bod' : 'Přidat VK prvek');
    q('nav-pos').textContent = editingItem
      ? `${cursor + 1}/${pendingQueue.length}`
      : (pendingQueue.length ? 'nový' : '');
  }
  updateFormMode();

  function refPoint() { return startPoint || lastPoint; }

  function pickOrThrow(points, tag) {
    if (points.length === 0) throw new Error('žádné řešení (mimo dosah)');
    if (points.length === 1) return points[0];
    if (!tag) throw new Error('dvě možná řešení – zvolte VPOL1 nebo VPOL2');
    return pickByVpolTag(points, refPoint(), tag);
  }

  /** Dopočet přesně jednoho nedořešeného prvku (kategorie 1, nebo 2/4 se 2 prvky). */
  function resolveOne(prevEl, currEl) {
    if (!prevEl.isArc && !currEl.isArc) {
      return { [prevEl.id]: solveCornerLineLine(prevEl.anchor, prevEl, currEl) };
    }
    if (prevEl.isArc && currEl.isArc) throw new Error('dva oblouky za sebou zatím nejsou podporované (kategorie 3)');
    // jedna strana je oblouk – T rozlišuje tečné (kat. 2, case 5) od netečného kolem VPOL (kat. 4)
    if (currEl.isArc && currEl.isT) {
      // case 5: přímka/kužel (prevEl, „?") → oblouk (currEl, ZNÁMÝ konec + R), tečně
      const ray = elementRay(prevEl, prevEl.anchor);
      const pts = tangentCircleTouchPoints(ray, { z: currEl.z, x: currEl.x }, currEl.r);
      return { [prevEl.id]: pickOrThrow(pts, currEl.vpolTag) };
    }
    if (prevEl.isArc && prevEl.isT) {
      throw new Error('tečný oblouk jako první prvek řetězu (bez předchozí přímky) zatím není podporovaný');
    }
    if (!vpolPoint) throw new Error('nejprve vlož VPOL (netečný oblouk se počítá kolem VPOL)');
    if (prevEl.isArc) {
      const ray = elementRay(currEl, { z: currEl.z, x: currEl.x });
      return { [prevEl.id]: solveLineArcJunction(ray, vpolPoint, prevEl.r, refPoint(), currEl.vpolTag) };
    }
    const ray = elementRay(prevEl, prevEl.anchor);
    return { [prevEl.id]: solveLineArcJunction(ray, vpolPoint, currEl.r, refPoint(), currEl.vpolTag) };
  }

  /** Dopočet dvou nedořešených prvků najednou (kategorie 2, case 6-8: A, oblouk B, pak známý currEl). */
  function resolveTwo(elA, elB, currEl) {
    if (!elB.isArc) throw new Error('prostřední prvek musí být oblouk');
    if (elA.isArc) throw new Error('dva oblouky za sebou zatím nejsou podporované (kategorie 3)');
    const ray1 = elementRay(elA, elA.anchor);
    const ray2 = elementRay(currEl, { z: currEl.z, x: currEl.x });
    const candidates = tangentCircleBetweenRays(ray1, ray2, elB.r);
    if (candidates.length === 0) throw new Error('žádné řešení (přímky/kužely se s daným R nedají tečně spojit)');
    const pick = candidates.length === 1 ? candidates[0]
      : (currEl.vpolTag ? pickBetweenRaysByVpolTag(candidates, refPoint(), currEl.vpolTag)
        : (() => { throw new Error('dvě možná řešení – zvolte VPOL1 nebo VPOL2'); })());
    return { [elA.id]: pick.foot1, [elB.id]: pick.foot2 };
  }

  /** Dopočet tří nedořešených prvků najednou (kategorie 3, case 9-11: A, oblouk1, oblouk2, pak známý currEl). */
  function resolveThree(elA, arc1, arc2, currEl) {
    if (!arc1.isArc || !arc2.isArc) throw new Error('prostřední dva prvky musí být oblouky (esíčko)');
    if (elA.isArc) throw new Error('první prvek řetězu musí být přímka/kužel');
    if (!arc2.junction) throw new Error('u druhého oblouku chybí „Bod zlomu" (osa + hodnota) – bez něj má esíčko víc řešení, než kolik je zadáno');
    const ray1 = elementRay(elA, elA.anchor);
    const ray2 = elementRay(currEl, { z: currEl.z, x: currEl.x });
    const candidates = twoTangentArcsBetweenRays(ray1, ray2, arc1.r, arc2.r, arc2.junction);
    if (candidates.length === 0) throw new Error('žádné řešení (s danými poloměry a bodem zlomu nejde esíčko sestavit)');
    const pick = candidates.length === 1 ? candidates[0]
      : (currEl.vpolTag ? pickTwoArcsByVpolTag(candidates, refPoint(), currEl.vpolTag)
        : (() => { throw new Error('víc možných řešení – zvolte VPOL1 nebo VPOL2'); })());
    return { [elA.id]: pick.foot1, [arc1.id]: pick.junction, [arc2.id]: pick.foot2 };
  }

  // Kotva paprsku počátečního bodu (žádný předchozí prvek neexistuje):
  // elementRay bere pro rovnoběžný-s-osou směr POZICI z kotvy, ne z
  // el.x/z samotného, takže se kotva musí poskládat z toho, co je na
  // SAMOTNÉM počátečním bodě známé – chybějící souřadnici (relevantní
  // jen když je navíc zadané PA, jinak nezáleží) doplní VPOL.
  function firstElementAnchor(el) {
    return {
      z: el.z != null ? el.z : (vpolPoint ? vpolPoint.z : 0),
      x: el.x != null ? el.x : (vpolPoint ? vpolPoint.x : 0),
    };
  }

  function patchLine(el, pt) {
    let patched = el.lineText;
    if (patched.includes('X?')) patched = patched.replace('X?', `X${fmt(fromSolverX(pt.x))}`);
    if (patched.includes('Z?')) patched = patched.replace('Z?', `Z${fmt(pt.z)}`);
    gcodeEl.value = gcodeEl.value.replace(el.lineText, patched);
    el.lineText = patched;
  }

  let nextElId = 1;

  function resetChain() {
    startPoint = null; vpolPoint = null; lastPoint = null; pendingQueue = []; nextElId = 1;
    chainStarted = false; cursor = null;
    solveInfo.textContent = '';
    updateFormMode();
  }

  overlay.querySelector('[data-act="nav-prev"]').addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (pendingQueue.length === 0) return;
    cursor = cursor === null ? pendingQueue.length - 1 : Math.max(0, cursor - 1);
    loadElementIntoForm(pendingQueue[cursor]);
    solveInfo.textContent = '';
    updateFormMode();
  });

  overlay.querySelector('[data-act="nav-next"]').addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (cursor === null) return;
    cursor++;
    if (cursor >= pendingQueue.length) { cursor = null; resetFormToNewEntry(); }
    else loadElementIntoForm(pendingQueue[cursor]);
    solveInfo.textContent = '';
    updateFormMode();
  });

  overlay.querySelector('[data-act="remove-element"]').addEventListener('click', () => {
    const idx = cursor !== null ? cursor : pendingQueue.length - 1;
    if (idx < 0 || idx >= pendingQueue.length) { solveInfo.textContent = 'Není co odebrat.'; return; }
    const [removed] = pendingQueue.splice(idx, 1);
    gcodeEl.value = gcodeEl.value.split('\n').filter(l => l !== removed.lineText).join('\n');
    if (removed.wasFirstEver && lastPoint === null) chainStarted = false;
    cursor = null;
    resetFormToNewEntry();
    solveInfo.textContent = `Odebráno: ${removed.lineText}`;
    updateFormMode();
  });

  overlay.querySelector('[data-act="vpol"]').addEventListener('click', () => {
    const vx = q('vpol-x').value, vz = q('vpol-z').value;
    const vpa = q('vpol-pa').value, varc = q('vpol-arc').value;
    vpolPoint = { z: parseFloat(vz) || 0, x: toSolverX(parseFloat(vx) || 0) };
    let line = `G111 X${vx} Z${vz}`;
    if (vpa) line += ` PA${vpa}`;
    if (varc) line += ` R${varc}`;
    appendCode(line);
  });

  overlay.querySelector('[data-act="element"]').addEventListener('click', () => {
    const editingIndex = cursor;
    const isFirstEver = editingIndex !== null
      ? pendingQueue[editingIndex].wasFirstEver
      : (pendingQueue.length === 0 && lastPoint === null);
    const xStr = q('val-x2').value, zStr = q('val-z2').value;
    const paStr = q('val-pa').value, prStr = q('val-pr').value;
    const rStr = q('val-r').value;
    const isTChecked = !isFirstEver && q('check-t').checked; // na počátečním bodě není na co se tečně napojit
    const vpolTag = q('vpol-tag').value || null;
    const cmd = currentType === 'vl' ? 'G11' : arcDir;
    const junctionAxis = q('junction-axis').value || null;
    const junctionValStr = q('junction-value').value;

    const xRaw = xStr === '?' || xStr.trim() === '' ? null : parseFloat(xStr);
    const el = {
      id: nextElId++,
      isArc: currentType === 'vkr',
      isT: isTChecked,
      dir: currentType === 'vkr' ? arcDir : null,
      xRaw,                                          // pro text (zobrazovaná jednotka)
      x: xRaw == null ? null : toSolverX(xRaw),       // pro geometrii (vkSolver = vždy průměr)
      z: zStr === '?' || zStr.trim() === '' ? null : parseFloat(zStr),
      pa: (paStr === '?' || paStr.trim() === '') ? null : parseFloat(paStr),
      prRaw: prStr === '?' || prStr.trim() === '' ? null : prStr,
      r: parseFloat(rStr) || 0,
      vpolTag,
      junction: (junctionAxis && junctionValStr.trim() !== '')
        ? {
          axis: junctionAxis,
          rawValue: junctionValStr,
          value: junctionAxis === 'x' ? toSolverX(parseFloat(junctionValStr)) : parseFloat(junctionValStr),
        }
        : null,
      wasFirstEver: isFirstEver,
    };

    let line = `${cmd} X${xStr === '?' ? '?' : xRaw} Z${zStr === '?' ? '?' : el.z}`;
    if (el.pa != null) line += ` PA${el.pa}`;
    if (prStr !== '?' && prStr.trim() !== '') line += ` PR${prStr}`;
    if (el.isArc) line += ` R${el.r}`;
    if (vpolTag) line += ` ${vpolTag}`;
    if (isTChecked) line += ' T';

    solveInfo.textContent = '';
    const isKnown = el.x != null && el.z != null;

    if (isFirstEver && !isKnown && el.pa != null && !vpolPoint) {
      solveInfo.textContent = '⚠ Pro počáteční bod se zadaným úhlem (PA) nejdřív vlož VPOL – jinak nemá úhel od čeho měřit.';
      return;
    }

    // ── Úprava existujícího nedořešeného prvku (přes ◀ ▶) ──
    if (editingIndex !== null) {
      if (isKnown) {
        solveInfo.textContent = '⚠ Úpravou by se prvek stal plně známým – k tomu ho nejdřív odeberte (➖) a vložte znovu jako nový.';
        return;
      }
      const old = pendingQueue[editingIndex];
      el.id = old.id;
      // Kotva počátečního bodu je odvozená ze samotného X/Z (viz níže) –
      // při úpravě se musí přepočítat, jinak by paprsek zůstal na STARÉ
      // pozici i po změně X/Z. U běžných prvků je kotva = konec předchozího
      // (nezávisí na tomhle prvku), takže se jen zkopíruje beze změny.
      el.anchor = el.wasFirstEver ? firstElementAnchor(el) : old.anchor;
      el.lineText = line;
      gcodeEl.value = gcodeEl.value.replace(old.lineText, line);
      pendingQueue[editingIndex] = el;
      cursor = null;
      resetFormToNewEntry();
      solveInfo.textContent = '✓ Prvek upraven.';
      updateFormMode();
      return;
    }

    if (isKnown && pendingQueue.length > 0) {
      try {
        let solved;
        if (pendingQueue.length === 1) solved = resolveOne(pendingQueue[0], el);
        else if (pendingQueue.length === 2) solved = resolveTwo(pendingQueue[0], pendingQueue[1], el);
        else solved = resolveThree(pendingQueue[0], pendingQueue[1], pendingQueue[2], el);
        const parts = [];
        for (const item of pendingQueue) {
          const pt = solved[item.id];
          patchLine(item, pt);
          parts.push(`Z${fmt(pt.z)} X${fmt(fromSolverX(pt.x))}`);
        }
        lastPoint = solved[pendingQueue[pendingQueue.length - 1].id];
        solveInfo.textContent = `✓ Dopočteno: ${parts.join(' | ')}`;
        pendingQueue = [];
      } catch (err) {
        solveInfo.textContent = `⚠ Nelze dopočítat: ${err.message}`;
      }
    }

    el.lineText = line;
    appendCode(line);

    if (isKnown) {
      lastPoint = { z: el.z, x: el.x };
      pendingQueue = [];
    } else {
      el.anchor = lastPoint ? { ...lastPoint } : firstElementAnchor(el);
      pendingQueue.push(el);
      if (pendingQueue.length > 3) pendingQueue.shift(); // jen poslední 3 se dopočítávají (kat. 3 = A + 2 oblouky)
    }

    if (startPoint === null && lastPoint !== null) startPoint = { ...lastPoint };
    chainStarted = true;
    resetFormToNewEntry();
    updateFormMode();
  });

  overlay.querySelector('[data-act="clear"]').addEventListener('click', () => {
    gcodeEl.value = '';
    resetConvertState();
    resetChain();
  });

  overlay.querySelector('[data-act="copy"]').addEventListener('click', () => {
    if (!gcodeEl.value.trim()) return;
    navigator.clipboard.writeText(gcodeEl.value).then(() => showToast('Zkopírováno'));
  });

  convertBtn.addEventListener('click', () => {
    const D2R = Math.PI / 180;

    function resolvePAprLine(text, fromPoint) {
      if (!/X\?\s+Z\?/.test(text)) return null;

      const paMatch = text.match(/PA(-?\d+(?:\.\d+)?)/);
      const prMatch = text.match(/PR(-?\d+(?:\.\d+)?)/);
      if (!paMatch || !prMatch) return null;
      if (fromPoint == null) return null;

      const paDeg = parseFloat(paMatch[1]) % 360;
      const pr = parseFloat(prMatch[1]);
      const paRad = paDeg * D2R;
      let dZ = pr * Math.cos(paRad);
      let dX = pr * Math.sin(paRad);
      const newZ = fromPoint.z + dZ;
      const newX = fromPoint.x + dX;
      let resolved = text
        .replace(/X\?/, `X${fmt(newX)}`)
        .replace(/Z\?/, `Z${fmt(newZ)}`);
      return { resolved, pt: { z: newZ, x: newX } };
    }

    const lines = gcodeEl.value.split('\n');
    const hasUnresolved = lines.some(l => /X\?\s+Z\?/.test(l));
    if (hasUnresolved) {
      let cur = lastPoint;
      let fallbackCount = 0;
      const out = [];
      for (const raw of lines) {
        const r = resolvePAprLine(raw, cur);
        if (r) {
          out.push(r.resolved);
          cur = r.pt;
          fallbackCount++;
        } else {
          const m = raw.match(/X(-?\d+(?:\.\d+)?)\s+Z(-?\d+(?:\.\d+)?)/);
          if (m) cur = { z: parseFloat(m[2]), x: parseFloat(m[1]) };
          out.push(raw);
        }
      }
      gcodeEl.value = out.join('\n');
      if (fallbackCount > 0) {
        showToast(`Dopočteno ${fallbackCount} prvků (PA+PR) → pokračuji konverzí`);
      } else {
        showToast('Nelze dopočíst PA+PR – chybí odchozí bod');
        return;
      }
    }

    const converted = gcodeEl.value.split('\n').map(line => {
      let clean = line.trim();
      if (clean.startsWith('G111')) return `( ${clean} - POZNÁMKA VPOL )`;
      clean = clean.replace(/G11/g, 'G1');
      clean = clean.replace(/PA\d+(\.\d+)?/g, '');
      clean = clean.replace(/PR\d+(\.\d+)?/g, '');
      clean = clean.replace(/\s*VPOL[12]/g, '');
      clean = clean.replace(/\s+T\b/g, '');
      return clean.replace(/\s+/g, ' ').trim();
    }).join('\n');
    gcodeEl.value = converted;
    convertBtn.classList.remove('vk-error-state');
    convertBtn.classList.add('vk-success-state');
  });
}
