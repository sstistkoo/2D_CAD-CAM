// ╔══════════════════════════════════════════════════════════════╗
// ║  Hlavička programu (menu „Hlavička") – CAM i CNC Editor        ║
// ╚══════════════════════════════════════════════════════════════╝
// Do 10. 11. 2026 měl každý editor shodnou kopii. Tady je jen to, co nezávisí
// na stavu editoru: HTML formuláře, čtení formuláře, řádky hlavičky podle
// řídicího systému a vložení do programu. Editor drží `headerCfg`
// (defaultHeaderConfig v gcodeEditorShared.js), modal a undo.

const CTRL_NAMES = { sinumerik: 'SINUMERIK', fanuc: 'FANUC', heidenhain: 'HEIDENHAIN' };

/** Nadpis okna podle řízení. */
export function headerTitle(ctrl) {
  return `Generovat hlavičku programu (${CTRL_NAMES[ctrl] || CTRL_NAMES.sinumerik})`;
}

/** Obsah formuláře hlavičky (vkládá se do `hdrList`). */
export function headerSettingsHTML(h) {
  const coordOpts = ['G54','G55','G56','G57','G505','G53'].map(v =>
    `<option value="${v}" ${h.coords.val === v ? 'selected' : ''}>${v}</option>`).join('');
  const feedOpts = ['G95','G94'].map(v =>
    `<option value="${v}" ${h.feed.mode === v ? 'selected' : ''}>${v} ${v === 'G95' ? '(mm/ot)' : '(mm/min)'}</option>`).join('');
  const spModeOpts = ['G97','G96'].map(v =>
    `<option value="${v}" ${h.spindle.mode === v ? 'selected' : ''}>${v} ${v === 'G97' ? '(konst. ot.)' : '(konst. řez.)'}</option>`).join('');
  const spDirOpts = ['4','3'].map(v =>
    `<option value="${v}" ${h.spindle.m === v ? 'selected' : ''}>M${v} ${v === '4' ? '(CCW)' : '(CW)'}</option>`).join('');

  return `
      <div class="cne-hdr-row">
        <label><input type="checkbox" data-hdr="gear" ${h.gear.active ? 'checked' : ''}> Převod</label>
        <span>M<input type="number" class="cne-hdr-inp" data-hdr-v="gear.val" value="${h.gear.val}" min="40" max="45" inputmode="numeric" style="width:40px"></span>
      </div>
      <div class="cne-hdr-row">
        <label><input type="checkbox" data-hdr="door" ${h.door.active ? 'checked' : ''}> Odjezd do výměny</label>
        <span>M<input type="number" class="cne-hdr-inp" data-hdr-v="door.val" value="${h.door.val}" min="0" max="99" inputmode="numeric" style="width:40px"></span>
      </div>
      <div class="cne-hdr-row">
        <label><input type="checkbox" data-hdr="tool" ${h.tool.active ? 'checked' : ''}> Nástroj</label>
        <span>T<input type="number" class="cne-hdr-inp" data-hdr-v="tool.t" value="${h.tool.t}" min="1" max="99" inputmode="numeric" style="width:36px">
        D<input type="number" class="cne-hdr-inp" data-hdr-v="tool.d" value="${h.tool.d}" min="1" max="9" inputmode="numeric" style="width:36px"></span>
      </div>
      <div class="cne-hdr-row">
        <label><input type="checkbox" data-hdr="coords" ${h.coords.active ? 'checked' : ''}> Souřadnice</label>
        <select class="cne-hdr-inp" data-hdr-v="coords.val">${coordOpts}</select>
      </div>
      <div class="cne-hdr-row">
        <label><input type="checkbox" data-hdr="feed" ${h.feed.active ? 'checked' : ''}> Posuv</label>
        <select class="cne-hdr-inp" data-hdr-v="feed.mode">${feedOpts}</select>
      </div>
      <div class="cne-hdr-row">
        <label><input type="checkbox" data-hdr="spindle" ${h.spindle.active ? 'checked' : ''}> Vřeteno</label>
        <div class="cne-hdr-sp-wrap">
          <select class="cne-hdr-inp" data-hdr-v="spindle.mode">${spModeOpts}</select>
          <span>S<input type="number" class="cne-hdr-inp" data-hdr-v="spindle.s" value="${h.spindle.s}" min="1" max="9999" inputmode="numeric" style="width:52px"></span>
          <select class="cne-hdr-inp" data-hdr-v="spindle.m">${spDirOpts}</select>
          <span>LIMS<input type="number" class="cne-hdr-inp" data-hdr-v="spindle.lims" value="${h.spindle.lims}" min="1" max="9999" inputmode="numeric" style="width:52px"></span>
        </div>
      </div>`;
}

/** Hodnoty z formuláře (`root` = modal hlavičky) → `cfg` (mění ho na místě). */
export function readHeaderInputs(root, cfg) {
  root.querySelectorAll('[data-hdr]').forEach(el => {
    const key = el.dataset.hdr;
    if (cfg[key]) cfg[key].active = el.checked;
  });
  root.querySelectorAll('[data-hdr-v]').forEach(el => {
    const path = el.dataset.hdrV.split('.');
    if (path.length === 2 && cfg[path[0]]) {
      cfg[path[0]][path[1]] = el.value;
    }
  });
}

/** Řádky hlavičky (N10, N20, …) podle řídicího systému. */
export function buildHeaderLines(h, ctrl) {
  const lines = [];
  let n = 10;
  const N = () => { const s = `N${n} `; n += 10; return s; };

  let coordLine;
  if (ctrl === 'fanuc') {
    // Fanuc: bez STOPRE (Siemens-specifický "stop předzpracování"),
    // volání nástroje T0101 (nástroj+korekce po 2 číslicích),
    // omezení otáček G50 Smax místo LIMS=.
    if (h.gear.active)  lines.push(`${N()}M${h.gear.val}`);
    if (h.door.active)  lines.push(`${N()}M${h.door.val}`);
    if (h.tool.active)  lines.push(`${N()}T${String(h.tool.t).padStart(2, '0')}${String(h.tool.d).padStart(2, '0')}`);
    coordLine = N();
    if (h.coords.active) coordLine += `${h.coords.val} `;
    if (h.feed.active)   coordLine += `${h.feed.mode} `;
    coordLine += 'G90';
    lines.push(coordLine.trim());
    if (h.spindle.active) {
      if (h.spindle.mode === 'G96' && h.spindle.lims) lines.push(`${N()}G50 S${h.spindle.lims}`);
      lines.push(`${N()}${h.spindle.mode} S${h.spindle.s} M${h.spindle.m}`);
    }
  } else if (ctrl === 'heidenhain') {
    // Heidenhain (ISO dialekt): bez STOPRE, nástroj T.. M6, bez LIMS.
    if (h.gear.active)  lines.push(`${N()}M${h.gear.val}`);
    if (h.door.active)  lines.push(`${N()}M${h.door.val}`);
    if (h.tool.active)  lines.push(`${N()}T${h.tool.t} M6`);
    coordLine = N();
    if (h.coords.active) coordLine += `${h.coords.val} `;
    if (h.feed.active)   coordLine += `${h.feed.mode} `;
    coordLine += 'G90';
    lines.push(coordLine.trim());
    if (h.spindle.active) lines.push(`${N()}${h.spindle.mode} S${h.spindle.s} M${h.spindle.m}`);
  } else {
    // Sinumerik 840D (výchozí): STOPRE před výměnou nástroje i na konci,
    // nástroj T.. / D.. na dvou řádcích, LIMS=.. u G96.
    if (h.gear.active)  lines.push(`${N()}M${h.gear.val}`);
    lines.push(`${N()}STOPRE`);
    if (h.door.active)  lines.push(`${N()}M${h.door.val}`);
    if (h.tool.active)  { lines.push(`${N()}T${h.tool.t}`); lines.push(`      D${h.tool.d}`); }
    coordLine = N();
    if (h.coords.active) coordLine += `${h.coords.val} `;
    if (h.feed.active)   coordLine += `${h.feed.mode} `;
    coordLine += 'G90';
    lines.push(coordLine.trim());
    if (h.spindle.active) {
      let sp = `${N()}${h.spindle.mode}`;
      if (h.spindle.mode === 'G96' && h.spindle.lims) sp += ` LIMS=${h.spindle.lims}`;
      sp += ` S${h.spindle.s} M${h.spindle.m}`;
      lines.push(sp);
    }
    lines.push(`${N()}STOPRE`);
  }
  return lines;
}

/** Vloží řádky hlavičky na začátek programu (za úvodní MSG, je-li). */
export function insertHeader(code, lines) {
  const existing = code.split('\n');
  if (existing.length > 0 && existing[0].trim().toUpperCase().startsWith('MSG')) {
    return existing[0] + '\n' + lines.join('\n') + '\n' + existing.slice(1).join('\n');
  }
  return lines.join('\n') + '\n' + code;
}
