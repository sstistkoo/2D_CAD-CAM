// Nastavení NC výstupu poháněných nástrojů (panel 🛠 Operace): polohování,
// vřeteno nástroje, jméno osy C, kalibrace úhlu, M-kódy stroje a návod, jak
// to všechno ověřit na stroji. Čisté HTML + zápis změny — bez stavu panelu
// (livePanel.js jen zavolá a uloží přes commit()).
import { LIVE_MODES } from './liveModel.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function modeNote(mode, ctrl) {
  if (ctrl === 'heidenhain') return 'Heidenhain: díry polohuje osa C, pohyby se rozepíší (G0/G1); frézování po krátkých G1 v X + C. Přepnutí stroje na osu C (FUNCTION MODE) řeší stroj — zadejte příslušný kód v M-kódech.';
  if (mode === 'spos') return 'SPOS: vřeteno se natočí na úhel díry a vrtá se v poloze nástroje (+X); na konci SPCOF. Frézování mimo osu jde přes osu C.';
  if (mode === 'caxis') return 'Osa C: vřeteno do osy (M70), díry se polohují C=úhel, na konci SPCOF. Frézování se rozloží na krátké G1 v X + C.';
  return ctrl === 'fanuc'
    ? 'G12.1: frézování v polární interpolaci (X = Ø, C = Y); rovinu a osy určují parametry stroje. Vrtání G83/G87 s osou C.'
    : 'TRANSMIT: vřeteno do osy (M70) a na čele kartézsky X/Y (v poloměru). Radiální díry se polohují osou C.';
}

/** HTML nastavení výstupu (nadpis, přepínače, kalibrace, M-kódy, poznámka). */
export function settingsHtml(set, ctrl) {
  const modeOpts = Object.entries(LIVE_MODES).map(([k, t]) => `<option value="${k}"${k === set.mode ? ' selected' : ''}>${t}</option>`).join('');
  const mf = (k, t) => `<label class="cam-live-f"><span>${t}</span><input data-g="m.${k}" type="text" value="${esc(set.m[k])}"></label>`;
  const nf = (g, t, v, title) => `<label class="cam-live-f" title="${esc(title)}"><span>${t}</span><input data-g="${g}" type="text" inputmode="decimal" value="${esc(v)}"></label>`;
  const sin = ctrl === 'sinumerik';
  return `
      <h4>Výstup NC (${ctrl === 'fanuc' ? 'Fanuc' : ctrl === 'heidenhain' ? 'Heidenhain' : 'Sinumerik'})</h4>
      <div class="cam-live-grid">
        <label class="cam-live-f"><span>Polohování / interpolace</span><select data-g="mode">${modeOpts}</select></label>
        <label class="cam-live-f" title="Vrtací cykly (CYCLE82/83, G83/G87). Vypnuto = rozepsané G0/G1 pohyby. Heidenhain vždy rozepsané."><span>Vrtací cykly</span><input data-g="cycles" type="checkbox"${set.cycles ? ' checked' : ''}></label>
        ${sin ? nf('spindle', 'Vřeteno nástroje č.', set.spindle, 'Číslo vřetena poháněného nástroje: M<n>=3, M<n>=5, S<n>=… (u dvou suportů ověřte, které vřeteno je u kterého suportu)') : ''}
        ${nf('cName', 'Jméno osy C', set.cName, 'Jak se osa C jmenuje v programu stroje: C, C1, C2… (strojní údaj osy)')}
      </div>
      <details class="cam-live-note"><summary>Kalibrace úhlu (nula a směr osy C) – ověřte na stroji</summary>
        <div class="cam-live-grid">
          <label class="cam-live-f" title="Kde stojí poháněný nástroj v revolveru při pohledu na čelo — k němu se díra natáčí osou C. Soustruh: nahoře (X+, jako v řezu / nárysu). Díra na tomhle úhlu je při C0 pod nástrojem."><span>Nástroj stojí</span>
            <select data-g="toolAt">${[[90, 'nahoře (X+) — 90°'], [0, 'vpravo — 0°'], [270, 'dole — 270°'], [180, 'vlevo — 180°']].map(([v, t]) => `<option value="${v}"${set.toolAt === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="cam-live-f" title="Smysl otáčení: díra z bokorysu má po natočení přijít pod nástroj. Když se kus na stroji otočí opačně, zvolte −."><span>Směr úhlu</span>
            <select data-g="angleDir"><option value="1"${set.angleDir > 0 ? ' selected' : ''}>+ (jako v bokorysu)</option><option value="-1"${set.angleDir < 0 ? ' selected' : ''}>− (opačně)</option></select></label>
          ${nf('angleOffset', 'Posun nuly [°]', set.angleOffset, 'O kolik stupňů je nula osy C stroje posunutá. Úhel v NC = posun + směr · (úhel díry z bokorysu − úhel nástroje). Bez posunu je při C0 pod nástrojem díra na úhlu nástroje.')}
        </div>
      </details>
      <details class="cam-live-note"><summary>M-kódy stroje (osa C, poháněný nástroj) – ověřte v příručce stroje</summary>
        <div class="cam-live-grid">${mf('cOn', 'Osa C zap')}${mf('cOff', ctrl === 'sinumerik' ? 'Osa C vyp (zpět do otáčkového režimu)' : 'Osa C vyp')}${mf('toolOn', 'Nástroj start')}${mf('toolOff', 'Nástroj stop')}${mf('toolS', 'Adresa otáček')}</div>
        <div class="cam-live-note">${ctrl === 'sinumerik'
    ? 'Sinumerik: M70 (vřeteno do osy) je standardní M-funkce Siemens, ale číslo si volí výrobce stroje. Poháněný nástroj se řídí číslem vřetena výše. Prázdné pole = výchozí hodnota.'
    : 'Fanuc / Heidenhain nemají společné M-kódy osy C ani poháněného nástroje — doplňte je z příručky stroje. Prázdné pole = výchozí (ukázkové) hodnota.'}</div>
      </details>
      <details class="cam-live-note"><summary>Jak to ověřit na stroji (nasucho)</summary>
        <ol class="cam-live-ol">
          <li><b>M-kódy a vřeteno:</b> v příručce / seznamu M-funkcí stroje najděte zapnutí osy C a start/stop poháněného nástroje a opište je výše. Každý z nich nejdřív zkuste samostatně v MDA.</li>
          <li><b>Nula:</b> v MDA <code>SPOS=0</code> — v tomto místě má stát díra č. 1 (bokorys C0°, šipka u +X = nástroj). Je-li posunutá, zadejte <i>Posun nuly</i>.</li>
          <li><b>Směr:</b> v MDA <code>SPOS=90</code> — díl se má otočit tak, aby díra z bokorysu C90° (nahoře) přišla k nástroji. Jde-li na opačnou stranu, zvolte <i>Směr −</i>.</li>
          <li><b>Zkouška programu:</b> vyjměte nástroj z řezu, override posuvu na minimum, režim SBL; zkontrolujte první díru (úhel, X, Z) a teprve pak pusťte celý blok.</li>
          <li>Poznamenejte si, co na vašem stroji platí — a pošlete mi to; výchozí hodnoty doplním.</li>
        </ol>
      </details>
      <div class="cam-live-note">${modeNote(set.mode, ctrl)}</div>`;
}

/**
 * Zapíše změnu nastavení výstupu do kopie `live`.
 * @param live kopie S.params.live (mění se)
 * @param g    klíč z data-g (mode, cycles, spindle, cName, toolAt, angleDir, angleOffset, m.<klíč>)
 * @param el   změněný prvek formuláře
 * @param ctrl řídicí systém
 * @param evalNum vyhodnocení čísla (safeEvalMath) → NaN když neplatné
 * @returns {boolean} false = neplatná hodnota (nic se nezměnilo)
 */
export function applySettingChange(live, g, el, ctrl, evalNum) {
  if (g === 'mode') live.mode = el.value;
  else if (g === 'cycles') live.cycles = el.checked;
  else if (g === 'cName') live.cName = el.value.trim();
  else if (g === 'angleDir') live.angleDir = Number(el.value) < 0 ? -1 : 1;
  else if (g === 'toolAt') live.toolAt = Number(el.value);
  else if (g === 'spindle' || g === 'angleOffset') {
    const v = evalNum(el.value);
    if (!Number.isFinite(v)) return false;
    live[g] = g === 'spindle' ? Math.round(v) : v;
  } else if (g.startsWith('m.')) {
    live.m = live.m || {};
    live.m[ctrl] = { ...(live.m[ctrl] || {}), [g.slice(2)]: el.value.trim() };
  }
  return true;
}
