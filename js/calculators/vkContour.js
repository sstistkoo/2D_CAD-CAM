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
import { showToast } from '../state.js';
import { renderVkHelp } from './vkHelp.js';
import {
  elementRay, solveCornerLineLine, solveLineArcJunction, pickByVpolTag,
  tangentCircleTouchPoints, tangentCircleBetweenRays, pickBetweenRaysByVpolTag,
} from './vkSolver.js';

const DEFAULT_GCODE = 'G111 X0.0 Z40.0\nG11 X40.0 Z? PA150 PR? T';

export function openVkContour() {
  const bodyHTML = `
    <div class="vk-canvas-placeholder">Grafický náhled VK (připravujeme)</div>

    <details class="sn-help-details vk-section">
      <summary class="sn-help-summary"><span class="vk-help-c-red">📍 1. Počáteční bod &amp; Volný pól (VPOL)</span></summary>
      <div class="sn-help-body vk-section-body">
        <div class="vk-section-title">Počáteční bod a pól (VPOL):</div>
        <div class="cnc-fields">
          <label class="cnc-field"><span>Start X1 (Průměr)</span><input type="text" data-id="start-x" value="0.0"></label>
          <label class="cnc-field"><span>Start Z1 (Délka)</span><input type="text" data-id="start-z" value="0.0"></label>
          <label class="cnc-field"><span class="vk-red">VPOL X (Průměr)</span><input type="text" class="vk-input-vpol" data-id="vpol-x" value="0.0"></label>
          <label class="cnc-field"><span class="vk-red">VPOL Z (Délka)</span><input type="text" class="vk-input-vpol" data-id="vpol-z" value="40.0"></label>
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
      <summary class="sn-help-summary"><span class="vk-help-c-orange">🎯 2. Parametry nového VK prvku</span></summary>
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
        </div>

        <div class="vk-section-title">Cílové souřadnice (X/Z nebo PA/PR k pólu):</div>
        <div class="cnc-fields">
          <label class="cnc-field">
            <span>Cíl X2 (Průměr)</span>
            <div class="vk-input-row">
              <input type="text" data-id="val-x2" value="40.0">
              <button class="vk-btn-q" data-toggle="val-x2">❓</button>
            </div>
          </label>
          <label class="cnc-field">
            <span>Cíl Z2 (Délka)</span>
            <div class="vk-input-row">
              <input type="text" data-id="val-z2" value="?" class="vk-input-unknown" disabled>
              <button class="vk-btn-q active" data-toggle="val-z2">❓</button>
            </div>
          </label>
          <label class="cnc-field">
            <span>Polární úhel (PA)</span>
            <div class="vk-input-row">
              <input type="text" data-id="val-pa" value="150">
              <button class="vk-btn-q" data-toggle="val-pa">❓</button>
            </div>
          </label>
          <label class="cnc-field">
            <span>Polární rádius (PR)</span>
            <div class="vk-input-row">
              <input type="text" data-id="val-pr" value="?" class="vk-input-unknown" disabled>
              <button class="vk-btn-q active" data-toggle="val-pr">❓</button>
            </div>
          </label>
        </div>

        <div class="vk-section-title">Návaznost drah:</div>
        <label class="vk-checkbox-row">
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

        <button class="vk-insert-btn" data-act="element">Přidat VK prvek</button>
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
        input.value = '0.0';
        input.classList.remove('vk-input-unknown');
        input.disabled = false;
        btn.classList.remove('active');
      } else {
        input.value = '?';
        input.classList.add('vk-input-unknown');
        input.disabled = true;
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

  // ── Řetězec prvků pro dopočet neznámých (kategorie 1, 2 a 4) ──
  // startPoint/vpolPoint/lastPoint jsou v (z,x) – X je průměr.
  // pendingQueue drží 0–2 nedořešené prvky čekající na dopočet:
  //   [] – vše vyřešeno
  //   [A]      – kategorie 1 (A i nový prvek přímka/kužel) nebo kategorie 2
  //              case 5 (A přímka/kužel, nový prvek oblouk s T) / kategorie 4
  //              case 12-13 (A nebo nový prvek oblouk bez T, kolem VPOL)
  //   [A, B]   – B musí být oblouk s T (kategorie 2, case 6-8: A i nový
  //              prvek jsou přímka/kužel, B mezi nimi tečný o poloměru B.r)
  let startPoint = null;
  let vpolPoint = null;
  let lastPoint = null;   // konec posledního VYŘEŠENÉHO prvku
  let pendingQueue = [];  // prvky { isArc, isT, x,z,pa,r, vpolTag, anchor, lineText }

  function ensureStart() {
    if (lastPoint === null) {
      lastPoint = { z: parseFloat(q('start-z').value) || 0, x: parseFloat(q('start-x').value) || 0 };
    }
    if (startPoint === null) startPoint = { ...lastPoint };
  }

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

  function patchLine(el, pt) {
    let patched = el.lineText;
    if (patched.includes('X?')) patched = patched.replace('X?', `X${fmt(pt.x)}`);
    if (patched.includes('Z?')) patched = patched.replace('Z?', `Z${fmt(pt.z)}`);
    gcodeEl.value = gcodeEl.value.replace(el.lineText, patched);
    el.lineText = patched;
  }

  let nextElId = 1;

  function resetChain() {
    startPoint = null; vpolPoint = null; lastPoint = null; pendingQueue = []; nextElId = 1;
    solveInfo.textContent = '';
  }

  overlay.querySelector('[data-act="vpol"]').addEventListener('click', () => {
    ensureStart();
    const vx = q('vpol-x').value, vz = q('vpol-z').value;
    const vpa = q('vpol-pa').value, varc = q('vpol-arc').value;
    vpolPoint = { z: parseFloat(vz) || 0, x: parseFloat(vx) || 0 };
    let line = `G111 X${vx} Z${vz}`;
    if (vpa) line += ` PA${vpa}`;
    if (varc) line += ` R${varc}`;
    appendCode(line);
  });

  overlay.querySelector('[data-act="element"]').addEventListener('click', () => {
    ensureStart();
    const xStr = q('val-x2').value, zStr = q('val-z2').value;
    const paStr = q('val-pa').value, prStr = q('val-pr').value;
    const rStr = q('val-r').value;
    const isTChecked = q('check-t').checked;
    const vpolTag = q('vpol-tag').value || null;
    const cmd = currentType === 'vl' ? 'G11' : arcDir;

    const el = {
      id: nextElId++,
      isArc: currentType === 'vkr',
      isT: isTChecked,
      x: xStr === '?' ? null : parseFloat(xStr),
      z: zStr === '?' ? null : parseFloat(zStr),
      pa: (paStr === '?' || paStr.trim() === '') ? null : parseFloat(paStr),
      r: parseFloat(rStr) || 0,
      vpolTag,
    };

    let line = `${cmd} X${xStr === '?' ? '?' : el.x} Z${zStr === '?' ? '?' : el.z}`;
    if (el.pa != null) line += ` PA${el.pa}`;
    if (prStr !== '?' && prStr.trim() !== '') line += ` PR${prStr}`;
    if (el.isArc) line += ` R${el.r}`;
    if (vpolTag) line += ` ${vpolTag}`;
    if (isTChecked) line += ' T';

    solveInfo.textContent = '';
    const isKnown = el.x != null && el.z != null;

    if (isKnown && pendingQueue.length > 0) {
      try {
        const solved = pendingQueue.length === 1
          ? resolveOne(pendingQueue[0], el)
          : resolveTwo(pendingQueue[0], pendingQueue[1], el);
        const parts = [];
        for (const item of pendingQueue) {
          const pt = solved[item.id];
          patchLine(item, pt);
          parts.push(`Z${fmt(pt.z)} X${fmt(pt.x)}`);
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
      el.anchor = { ...lastPoint };
      pendingQueue.push(el);
      if (pendingQueue.length > 2) pendingQueue.shift(); // jen poslední 2 se dopočítávají
    }
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
    const text = gcodeEl.value;
    if (text.includes('?')) {
      convertBtn.classList.remove('vk-success-state');
      convertBtn.classList.add('vk-error-state');
      showToast('Nejprve doplňte hodnoty místo „?"');
      return;
    }
    const converted = text.split('\n').map(line => {
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
