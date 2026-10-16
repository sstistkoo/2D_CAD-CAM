// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Panel vlastností: text                              ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js (16. 10. 2026, docs/plan-refaktoringu-ui.md, Fáze 4).
// Tělo větve switch(obj.type) z updateProperties doslova (jen o 4 mezery
// méně odsazené a bez závěrečného `break`); sdílené proměnné kostry
// (obj, tbody, H, V, pomocníci řádků) dostává parametrem.
// Kód aplikace importuje jen z js/ui.js, nikdy z js/ui/* napřímo.

import { pushUndo } from '../../state.js';
import { textPathIndex, textPathIdFromIndex } from '../../utils.js';
import { renderAll, renderAllDebounced } from '../../render.js';
import { updateProperties } from './index.js';

/** Řádky panelu vlastností textu (case "text") — tělo větve doslova. */
export function textProps({ obj, tbody, H, V, addEditRow, addTextRow }) {
  addEditRow(H, obj.x, (v) => { obj.x = v; });
  addEditRow(V, obj.y, (v) => { obj.y = v; });
  addEditRow("Velikost", obj.fontSize || 14, (v) => { obj.fontSize = v; });
  addEditRow("Rotace°", (obj.rotation || 0) * 180 / Math.PI, (v) => { obj.rotation = v * Math.PI / 180; }, 5);
  addEditRow("Rozpal", obj.letterSpacing || 0, (v) => { obj.letterSpacing = v; });
  addTextRow("Text", obj.text || "", (v) => { obj.text = v; obj.name = `Text "${v.substring(0, 20)}"`; renderAllDebounced(); });

  // Font family
  {
    const FONTS = [
      { value: 'Consolas, monospace', label: 'Consolas' },
      { value: 'Arial, sans-serif', label: 'Arial' },
      { value: 'Times New Roman, serif', label: 'Times' },
      { value: 'Courier New, monospace', label: 'Courier' },
      { value: 'Verdana, sans-serif', label: 'Verdana' },
      { value: 'Georgia, serif', label: 'Georgia' },
    ];
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.textContent = "Písmo";
    const tdVal = document.createElement("td");
    const sel = document.createElement("select");
    sel.className = "prop-input";
    FONTS.forEach(f => {
      const opt = document.createElement("option");
      opt.value = f.value;
      opt.textContent = f.label;
      if (f.value === (obj.fontFamily || 'Consolas, monospace')) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => {
      pushUndo();
      obj.fontFamily = sel.value;
      renderAll();
    });
    sel.addEventListener("keydown", (e) => e.stopPropagation());
    tdVal.appendChild(sel);
    tr.appendChild(tdLabel);
    tr.appendChild(tdVal);
    tbody.appendChild(tr);
  }
  // Zarovnání
  {
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.textContent = "Zarovnání";
    const tdVal = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;gap:2px";
    ['left', 'center', 'right'].forEach(a => {
      const btn = document.createElement("button");
      btn.textContent = a === 'left' ? '⫷' : a === 'center' ? '☰' : '⫸';
      btn.title = a;
      btn.style.cssText = "flex:1;padding:4px;border:1px solid var(--ctp-surface1);border-radius:4px;cursor:pointer;background:" + ((obj.textAlign || 'left') === a ? 'var(--ctp-blue)' : 'var(--ctp-surface0)') + ";color:var(--ctp-text);font-size:14px";
      btn.addEventListener("click", () => {
        pushUndo();
        obj.textAlign = a;
        renderAll();
        updateProperties();
      });
      wrap.appendChild(btn);
    });
    tdVal.appendChild(wrap);
    tr.appendChild(tdLabel);
    tr.appendChild(tdVal);
    tbody.appendChild(tr);
  }
  // Bold + Italic
  {
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.textContent = "Styl";
    const tdVal = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;gap:6px;align-items:center";
    const cbBold = document.createElement("input");
    cbBold.type = "checkbox";
    cbBold.checked = !!obj.bold;
    cbBold.addEventListener("change", () => { pushUndo(); obj.bold = cbBold.checked; renderAll(); });
    const lblBold = document.createElement("span");
    lblBold.textContent = "B";
    lblBold.style.cssText = "font-weight:bold;cursor:pointer";
    lblBold.addEventListener("click", () => { cbBold.checked = !cbBold.checked; cbBold.dispatchEvent(new Event('change')); });
    wrap.appendChild(cbBold);
    wrap.appendChild(lblBold);

    const cbItalic = document.createElement("input");
    cbItalic.type = "checkbox";
    cbItalic.checked = !!obj.italic;
    cbItalic.addEventListener("change", () => { pushUndo(); obj.italic = cbItalic.checked; renderAll(); });
    const lblItalic = document.createElement("span");
    lblItalic.textContent = "I";
    lblItalic.style.cssText = "font-style:italic;cursor:pointer;margin-left:6px";
    lblItalic.addEventListener("click", () => { cbItalic.checked = !cbItalic.checked; cbItalic.dispatchEvent(new Event('change')); });
    wrap.appendChild(cbItalic);
    wrap.appendChild(lblItalic);
    tdVal.appendChild(wrap);
    tr.appendChild(tdLabel);
    tr.appendChild(tdVal);
    tbody.appendChild(tr);
  }
  // Editace textu – tlačítko pro otevření kompletního dialogu
  {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 2;
    const btn = document.createElement("button");
    btn.textContent = "📝 Otevřít editor textu";
    btn.style.cssText = "width:100%;padding:6px;background:var(--ctp-blue);color:var(--ctp-base);border:none;border-radius:4px;cursor:pointer;font-size:13px;margin-top:4px";
    btn.addEventListener("click", () => {
      import('../../dialogs/textDialog.js').then(({ showTextDialog }) => {
        showTextDialog({
          text: obj.text,
          fontSize: obj.fontSize || 14,
          fontFamily: obj.fontFamily || 'Consolas, monospace',
          rotation: obj.rotation || 0,
          textAlign: obj.textAlign || 'left',
          bold: !!obj.bold,
          italic: !!obj.italic,
          letterSpacing: obj.letterSpacing || 0,
          pathMode: obj.pathMode || 'none',
          pathObjectId: textPathIndex(obj),
          pathOffset: obj.pathOffset || 2,
          editMode: true,
        }, (result) => {
          pushUndo();
          obj.text = result.text;
          obj.fontSize = result.fontSize;
          obj.fontFamily = result.fontFamily;
          obj.rotation = result.rotation;
          obj.textAlign = result.textAlign;
          obj.bold = result.bold;
          obj.italic = result.italic;
          obj.letterSpacing = result.letterSpacing;
          obj.pathMode = result.pathMode;
          obj.pathObjId = textPathIdFromIndex(result.pathObjectId);
          delete obj.pathObjectId;
          obj.pathOffset = result.pathOffset;
          obj.name = `Text "${result.text.substring(0, 20)}"`;
          renderAll();
          updateProperties();
        });
      });
    });
    td.appendChild(btn);
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}
