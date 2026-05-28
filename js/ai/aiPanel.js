// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – AI panel: analýza výkresu → soustružnický profil   ║
// ║  Prompt (kopírovat) · foto→AI (auto) · JSON→vykreslit       ║
// ╚══════════════════════════════════════════════════════════════╝

import { showToast } from '../state.js';
import { makeOverlay } from '../dialogFactory.js';
import { addObject } from '../objects.js';
import { radiusToBulge } from '../utils.js';
import { autoCenterView } from '../canvas.js';
import { getActiveAIConfig, openAISettings, AI_PROVIDERS } from './aiSettings.js';

// ── Prompt pro AI (čtení strojírenských výkresů → řetězec elementů) ──
export const AI_PROMPT = `Jsi expert na čtení strojírenských výkresů rotačních dílů (hřídele, příruby, knoflíky).
Analyzuj obrázek a vrať PŘESNOU geometrii profilu jako souvislý řetězec elementů v JSON.

Vracej POUZE čisté JSON pole objektů. Žádný doprovodný text, žádný markdown.

Profil čti souvisle od jednoho konce ke druhému – každý element navazuje na předchozí
(d1 elementu = d2 předchozího). Každý element je úsečka nebo oblouk mezi dvěma průměry:

[
  {"type":"line","d1":PRŮMĚR_ZAČÁTEK,"d2":PRŮMĚR_KONEC,"l":DÉLKA_V_OSE},
  {"type":"arc","d1":...,"d2":...,"l":...,"r":POLOMĚR,"concave":true}
]

Pravidla:
- Jednotky: milimetry. U tolerancí ber střední (jmenovitou) hodnotu.
- "line": válec (d1=d2), kužel (d1≠d2) i sražení (krátká úsečka; např. 1x45° → l=1 a d2=d1-2).
- "arc": zaoblení / rádius. "concave":true = oblouk UBÍRÁ materiál (vydutý pas, zápich, R dovnitř); "concave":false = oblouk PŘIDÁVÁ materiál (vypouklý nos, kulová hlava).
- "d1" každého elementu se musí rovnat "d2" předchozího (souvislý profil bez skoků).
- "l" = délka elementu podél osy (vyčti z kótového řetězce).
- Začni od největšího průměru / základny.`;

// ── Parsing JSON z AI odpovědi (toleruje obalový text / markdown) ──
export function parseAIProfile(text) {
  if (!text) throw new Error('Prázdný vstup');
  let raw = String(text).trim();
  // odstraň ```json … ``` obal
  raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // vytáhni první [ … ] blok
    const a = raw.indexOf('[');
    const b = raw.lastIndexOf(']');
    if (a < 0 || b < 0 || b < a) throw new Error('Nenalezeno JSON pole');
    data = JSON.parse(raw.slice(a, b + 1));
  }
  if (!Array.isArray(data)) throw new Error('JSON není pole');
  const items = data.filter((o) => o && typeof o === 'object');
  if (!items.length) throw new Error('Žádné platné prvky profilu');
  return items;
}

// Nový formát = řetězec elementů (line/arc s d1/d2), starý = segmenty {d,l,s,r}
function isElementFormat(items) {
  return items.some((o) => o.type !== undefined || o.d1 !== undefined || o.d2 !== undefined);
}

/**
 * Převede segmenty {d,l,s,r} na horní konturu soustružnického profilu.
 * Konvence: world x = Z (délka, doprava), world y = poloměr (= d/2).
 * Základna (největší ⌀) vlevo. Sražení/rádius se aplikuje na náběžné hraně
 * segmentu (rameno proti předchozímu segmentu).
 * @returns {{vertices:{x:number,y:number}[], bulges:number[]}}
 */
export function segmentsToProfile(segs) {
  const pts = []; // {x, y, bulge}  (bulge = oblouk hrany z tohoto bodu do dalšího)
  const add = (x, y, bulge = 0) => pts.push({ x, y, bulge });
  const setBulge = (b) => { pts[pts.length - 1].bulge = b; };

  let z = 0;
  let prevR = 0; // začínáme na ose (poloměr 0)
  add(0, 0); // levé čelo na ose

  for (let i = 0; i < segs.length; i++) {
    const R = segs[i].d / 2;
    const L = segs[i].l;
    const s = segs[i].s || 0;
    const r = segs[i].r || 0;
    const dh = R - prevR;        // znaménková změna poloměru
    const adh = Math.abs(dh);
    const stepUp = dh > 0;
    const dir = stepUp ? 1 : -1;

    if (i === 0) {
      // levé čelo nahoru na první poloměr (rovně)
      add(0, R);
      add(L, R);
    } else if (adh < 1e-6) {
      // ── Stejný průměr: radius = oblouk (konkávní pas / zápich) po délce L ──
      if (r > 1e-6 && L > 1e-6) {
        const half = L / 2;
        const rr = Math.max(r, half + 1e-6);            // poloměr musí pokrýt tětivu
        const theta = 2 * Math.asin(Math.min(1, half / rr));
        const mag = Math.tan(theta / 4);
        setBulge(mag);                                  // konkávní dolů (CCW, +bulge)
        add(z + L, R);
      } else {
        add(z + L, R);                                  // rovný válec
      }
    } else {
      // ── Změna průměru ──
      if (r > 1e-6) {
        // Zaoblený přechod – fillet tečný; pokud je krok < radius, použij efektivní
        const reff = Math.min(r, adh);
        if (adh - reff > 1e-6) {
          add(z, R - dir * reff);                       // zbytek svislé části kroku
        }
        const pA = pts[pts.length - 1];                 // aktuální bod (z, …)
        const pB = { x: z + reff, y: R };
        setBulge(radiusToBulge({ x: pA.x, y: pA.y }, pB, reff, /* cw */ stepUp));
        add(z + reff, R);
        add(z + L, R);
      } else if (s > 1e-6 && adh >= s) {
        // 45° sražení na rameni
        add(z, R - dir * s);
        add(z + s, R);
        add(z + L, R);
      } else {
        // ostré rameno
        add(z, R);
        add(z + L, R);
      }
    }

    z += L;
    prevR = R;
  }

  add(z, 0); // pravé čelo zpět na osu

  return {
    vertices: pts.map((p) => ({ x: p.x, y: p.y })),
    bulges: pts.map((p) => p.bulge),
  };
}

/**
 * Přesný profil z řetězce elementů {type,d1,d2,l,r,concave}.
 * Konvence: world x = Z (doprava), world y = poloměr (= d/2). Profil je souvislý.
 * @returns {{vertices:{x:number,y:number}[], bulges:number[]}}
 */
export function elementsToProfile(els) {
  const pts = [];
  const add = (x, y, bulge = 0) => pts.push({ x, y, bulge });
  const setBulge = (b) => { pts[pts.length - 1].bulge = b; };

  // normalizace
  const E = els
    .map((e) => ({
      type: (e.type || (e.r ? 'arc' : 'line')).toLowerCase(),
      d1: Number(e.d1 ?? e.d ?? 0),
      d2: Number(e.d2 ?? e.d ?? 0),
      l: Number(e.l ?? e.length ?? 0),
      r: Number(e.r ?? e.radius ?? 0) || 0,
      concave: e.concave === true || e.concave === 'true',
    }))
    .filter((e) => isFinite(e.d1) && isFinite(e.d2) && isFinite(e.l) && e.l > 0 && (e.d1 > 0 || e.d2 > 0));
  if (!E.length) throw new Error('Žádné platné elementy (potřebují d1/d2 a l > 0)');

  let z = 0;
  const R0 = E[0].d1 / 2;
  add(0, 0);   // levé čelo na ose
  add(0, R0);  // nahoru na první poloměr

  for (const el of E) {
    const R1 = el.d1 / 2;
    const R2 = el.d2 / 2;
    const L = el.l;

    // zajisti návaznost (kdyby AI udělalo skok v ⌀) – svislé čelo
    const pen = pts[pts.length - 1];
    if (Math.abs(pen.y - R1) > 1e-6) add(z, R1);

    const P1 = { x: z, y: R1 };
    const P2 = { x: z + L, y: R2 };

    if (el.type === 'arc' && el.r > 0) {
      const chord = Math.hypot(P2.x - P1.x, P2.y - P1.y);
      const rr = Math.max(el.r, chord / 2 + 1e-6); // poloměr musí pokrýt tětivu
      // concave (ubírá materiál → oblouk pod tětivou/dovnitř) = CW (záporný bulge);
      // convex (přidává → ven) = CCW (kladný bulge)
      setBulge(radiusToBulge(P1, P2, rr, /* cw */ el.concave));
      add(P2.x, P2.y);
    } else {
      // line: válec / kužel / sražení
      add(P2.x, P2.y);
    }

    z += L;
  }

  add(z, 0); // pravé čelo zpět na osu
  return {
    vertices: pts.map((p) => ({ x: p.x, y: p.y })),
    bulges: pts.map((p) => p.bulge),
  };
}

/** Sestaví profil – detekuje formát (nový elementy / starý segmenty). */
export function buildProfile(items) {
  return isElementFormat(items) ? elementsToProfile(items) : segmentsToProfile(items);
}

/** Vykreslí profil do výkresu jako jedna polyline (vrcholy + bulge → správný směr oblouků). */
export function renderProfile(items) {
  const { vertices, bulges } = buildProfile(items);
  if (vertices.length < 2) throw new Error('Profil nemá dost bodů');
  const obj = addObject({
    type: 'polyline',
    vertices,
    bulges,
    closed: false,
    name: 'AI Profil',
  });
  autoCenterView();
  return obj;
}

/**
 * Odešle obrázek + prompt aktivnímu AI provideru a vrátí textovou odpověď.
 * @param {string} dataUrl - "data:image/...;base64,..."
 */
export async function analyzeImage(dataUrl) {
  const cfg = getActiveAIConfig();
  if (!cfg.apiKey) throw new Error('Chybí API klíč – otevři ⚙ Nastavení.');
  if (!cfg.model) throw new Error('Není vybraný model – otevři ⚙ Nastavení.');

  // ── Gemini (nativní generateContent) ──
  if (cfg.provider === 'gemini') {
    const m = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!m) throw new Error('Neplatný obrázek');
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=` +
      encodeURIComponent(cfg.apiKey);
    const body = {
      contents: [{ parts: [{ text: AI_PROMPT }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
      generationConfig: { temperature: 0 },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Gemini HTTP ' + res.status);
    const j = await res.json();
    return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  }

  // ── Groq / OpenRouter (OpenAI-kompatibilní chat completions) ──
  const base =
    cfg.provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://openrouter.ai/api/v1';
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + cfg.apiKey,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: AI_PROMPT },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(AI_PROVIDERS[cfg.provider].name + ' HTTP ' + res.status);
  const j = await res.json();
  return j.choices?.[0]?.message?.content || '';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Nelze načíst soubor'));
    fr.readAsDataURL(file);
  });
}

const BODY_HTML = `
  <div class="ai-panel">
    <div class="ai-sec">
      <div class="ai-sec-head">1) Prompt pro AI</div>
      <textarea id="aiPrompt" class="ai-textarea" rows="5" readonly></textarea>
      <div class="ai-actions">
        <button class="btn-ok" id="aiCopyPrompt" type="button">📋 Kopírovat prompt</button>
      </div>
    </div>

    <div class="ai-sec">
      <div class="ai-sec-head">2) Foto / výkres → AI (automaticky)</div>
      <input type="file" id="aiImage" class="ai-file" accept="image/*" capture="environment" />
      <div class="ai-actions">
        <button class="btn-ok" id="aiAnalyze" type="button">🤖 Analyzovat (<span id="aiProvName">…</span>)</button>
      </div>
    </div>

    <div class="ai-sec">
      <div class="ai-sec-head">3) JSON od AI → vykreslit</div>
      <textarea id="aiJson" class="ai-textarea" rows="5" placeholder='[{"type":"line","d1":28,"d2":28,"l":4},{"type":"arc","d1":28,"d2":14,"l":7,"r":10,"concave":true}, …]'></textarea>
      <div class="ai-actions">
        <button class="btn-ok" id="aiRender" type="button">✏️ Vykreslit profil</button>
        <button class="btn-ok" id="aiOpenSettings" type="button">⚙ Nastavení</button>
      </div>
    </div>

    <div class="ai-status" id="aiPanelStatus"></div>
  </div>
`;

/** Otevře hlavní AI panel (analýza výkresu). */
export function openAIPanel() {
  const overlay = makeOverlay('ai-panel', '🤖 AI – analýza výkresu', BODY_HTML, 'ai-window');
  if (!overlay) return;

  const $ = (sel) => overlay.querySelector(sel);
  const statusEl = $('#aiPanelStatus');
  const setStatus = (msg, cls = '') => {
    statusEl.textContent = msg;
    statusEl.className = 'ai-status' + (cls ? ' ' + cls : '');
  };

  $('#aiPrompt').value = AI_PROMPT;

  function refreshProvName() {
    const cfg = getActiveAIConfig();
    const name = AI_PROVIDERS[cfg.provider]?.name || '—';
    $('#aiProvName').textContent = cfg.model ? `${name}: ${cfg.model}` : name;
  }
  refreshProvName();

  // 1) Kopírovat prompt
  $('#aiCopyPrompt').addEventListener('click', () => {
    navigator.clipboard
      .writeText(AI_PROMPT)
      .then(() => showToast('Prompt zkopírován do schránky'))
      .catch(() => showToast('Nelze zkopírovat do schránky'));
  });

  // 2) Analyzovat foto přes AI
  $('#aiAnalyze').addEventListener('click', async () => {
    const file = $('#aiImage').files?.[0];
    if (!file) {
      setStatus('Nejdřív vyber foto / obrázek výkresu.', 'ai-status-err');
      return;
    }
    const btn = $('#aiAnalyze');
    btn.disabled = true;
    setStatus('Odesílám obrázek AI…', 'ai-status-busy');
    try {
      const dataUrl = await fileToDataUrl(file);
      const answer = await analyzeImage(dataUrl);
      $('#aiJson').value = answer.trim();
      // zkus rovnou vykreslit
      const items = parseAIProfile(answer);
      renderProfile(items);
      setStatus(`Hotovo – vykresleno ${items.length} prvků.`, 'ai-status-ok');
    } catch (e) {
      setStatus('Chyba: ' + e.message, 'ai-status-err');
      showToast('AI: ' + e.message);
    } finally {
      btn.disabled = false;
    }
  });

  // 3) Vykreslit z JSON
  $('#aiRender').addEventListener('click', () => {
    try {
      const items = parseAIProfile($('#aiJson').value);
      renderProfile(items);
      setStatus(`Vykresleno ${items.length} prvků.`, 'ai-status-ok');
    } catch (e) {
      setStatus('Chyba: ' + e.message, 'ai-status-err');
      showToast('AI: ' + e.message);
    }
  });

  // ⚙ Nastavení
  $('#aiOpenSettings').addEventListener('click', () => {
    openAISettings();
    // po zavření nastavení obnov jméno providera
    const obs = new MutationObserver(() => {
      if (!document.querySelector('.calc-overlay[data-type="ai-settings"]')) {
        refreshProvName();
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true });
  });

  // Stop propagace kláves (aby needitovaly plátno)
  overlay.querySelectorAll('input, textarea, select').forEach((el) => {
    el.addEventListener('keydown', (e) => e.stopPropagation());
  });
}
