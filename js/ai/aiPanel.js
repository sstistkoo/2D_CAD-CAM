// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – AI panel: analýza výkresu → soustružnický profil   ║
// ║  Prompt (kopírovat) · foto→AI (auto) · JSON→vykreslit       ║
// ╚══════════════════════════════════════════════════════════════╝

import { showToast } from '../state.js';
import { makeOverlay } from '../dialogFactory.js';
import { addObject } from '../objects.js';
import { radiusToBulge } from '../utils.js';
import { autoCenterView } from '../canvas.js';
import { filletTwoLines, chamferTwoLines } from '../geometry.js';
import { getActiveAIConfig, openAISettings, AI_PROVIDERS } from './aiSettings.js';

// ── Prompt pro AI (čtení strojírenských výkresů → řetězec elementů) ──
export const AI_PROMPT = `Jsi expert na čtení strojírenských výkresů rotačních (soustružených) dílů – hřídele, příruby, knoflíky, čepy.
Vrať geometrii profilu jako ROHOVÉ BODY ostrého obrysu. Délky rovinek ani tečné ořezy NEDOPOČÍTÁVEJ – to udělá program.

Vracej POUZE čisté JSON pole objektů. Žádný text, žádný markdown, žádné komentáře.

Formát = pole rohů ostrého profilu (jako by žádné R/sražení nebyly), ZLEVA DOPRAVA:
[
  {"z":0,  "d":28},
  {"z":Z,  "d":D, "r":POLOMĚR},
  {"z":Z,  "d":D, "chamfer":[DÉLKA,ÚHEL]},
  {"z":Z,  "d":D, "cz":STŘED_Z, "cx":STŘED_X}
]

ORIENTACE:
- Z0 je VLEVO (strana sklíčidla), Z roste DOPRAVA. Začni u sklíčidla (obvykle největší ⌀) a jdi k volnému konci.
- "z" = poloha podél osy [mm], "d" = průměr v tom bodě [mm].

CO JE ROHOVÝ BOD:
- Bod, kde se dvě sousední ROVNÉ plochy (válec / kužel / čelo) protnou, KDYBY tam nebylo zaoblení.
- Zadávej jen body s okótovanou polohou a průměrem. NEVYMÝŠLEJ mezilehlé ⌀ ani délky rovinek – ty dopočítá program z tečnosti R.

ZAOBLENÍ A SRAŽENÍ (volitelné u daného rohu):
- "r": poloměr, kterým je TENTO roh zaoblený. Program ořízne sousední plochy a vloží tečný oblouk.
- "chamfer":[délka,úhel]: sražení rohu (např. 1x45° → [1,45]).
- "cz","cx": střed oblouku, je-li na výkrese okótovaný (cz podél osy, cx = vzdálenost od osy = poloměr). MÁ PŘEDNOST před "r".
- Vyduté/vypouklé (concave/convex) NEZADÁVEJ – plyne to z geometrie rohu.

PRAVIDLA:
- Jednotky mm; u tolerancí ber jmenovitou (střední) hodnotu.
- Úhly (např. 70°): zvol "z"/"d" rohů tak, aby kužel i okótované ⌀ seděly.
- Mezikóty (např. 24, 30, 44, 48) odpovídají polohám rohů; celková délka = poslední "z".
- Nezačínej ani nekonči obloukem „do vzduchu" – krajní body leží na čele.

Než vrátíš JSON, zkontroluj: (1) jen okótované ⌀ a polohy; (2) každý roh = průsečík dvou rovných ploch; (3) R/sražení je jen značka u rohu, ne délka; (4) pořadí zleva doprava od sklíčidla.`;

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

  if (Math.abs(pts[pts.length - 1].y) > 1e-6) add(z, 0); // pravé čelo zpět na osu

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
  add(0, 0);                  // levé čelo na ose
  if (R0 > 1e-6) add(0, R0);  // nahoru na první poloměr (jen pokud nezačínáme na ose)

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
      // Profil kreslíme zleva doprava (world y = poloměr), takže v bulgeToArc:
      //   kladný bulge = oblouk se prohýbá DOLŮ k ose  = concave (ubírá materiál)
      //   záporný bulge = prohýbá se NAHORU od osy      = convex  (přidává materiál)
      // radiusToBulge(...,cw) vrací cw ? -bulge : +bulge →
      //   concave ⇒ cw=false (kladný), convex ⇒ cw=true (záporný)
      setBulge(radiusToBulge(P1, P2, rr, /* cw */ !el.concave));
      add(P2.x, P2.y);
    } else {
      // line: válec / kužel / sražení
      add(P2.x, P2.y);
    }

    z += L;
  }

  if (Math.abs(pts[pts.length - 1].y) > 1e-6) add(z, 0); // pravé čelo zpět na osu
  return {
    vertices: pts.map((p) => ({ x: p.x, y: p.y })),
    bulges: pts.map((p) => p.bulge),
  };
}

// ── Skeleton formát: rohové body ostrého profilu + R / sražení / střed ──
// Pata kolmice z bodu na úsečku (tečný bod pro zadaný střed oblouku).
function _foot(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const L2 = dx * dx + dy * dy || 1e-12;
  const t = ((px - x1) * dx + (py - y1) * dy) / L2;
  return { x: x1 + t * dx, y: y1 + t * dy };
}
// Leží tečný bod T uvnitř úsečky P1→P2? (ochrana proti přetečení radiusu)
function _within(T, P1, P2) {
  const dx = P2.x - P1.x, dy = P2.y - P1.y;
  const L2 = dx * dx + dy * dy || 1e-12;
  const t = ((T.x - P1.x) * dx + (T.y - P1.y) * dy) / L2;
  return t >= -1e-6 && t <= 1 + 1e-6;
}
// Znaménkový bulge oblouku T1→T2 kolem středu (cx,cy). + = CCW (prohýbá dolů k ose).
function _arcBulge(T1, T2, cx, cy) {
  const a1 = Math.atan2(T1.y - cy, T1.x - cx);
  const a2 = Math.atan2(T2.y - cy, T2.x - cx);
  let d = a2 - a1;
  d = (((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; // (-π, π]
  return Math.tan(d / 4);
}

// Skeleton = pole rohových bodů {z,d} (zleva doprava, Z0 vlevo u sklíčidla).
// Roh může mít r (fillet), chamfer:[délka,úhel] nebo střed cz/cx (přednost).
function isSkeletonFormat(items) {
  return items.some(
    (o) => o && o.z !== undefined && o.d !== undefined && o.d1 === undefined && o.type === undefined,
  );
}

/**
 * Sestaví profil z ostrého skeletu: rovné úseky se protnou v rozích a kód
 * dopočítá tečné fillety / sražení (přes filletTwoLines / chamferTwoLines).
 * Chybějící rovinky vzniknou samy jako zbytek po oříznutí.
 * @returns {{vertices:{x:number,y:number}[], bulges:number[]}}
 */
export function skeletonToProfile(rawPts) {
  const P = rawPts
    .filter((o) => o && o.z !== undefined && o.d !== undefined)
    .map((o) => ({
      z: Number(o.z),
      d: Number(o.d),
      r: Number(o.r ?? o.radius ?? 0) || 0,
      cz: o.cz !== undefined ? Number(o.cz) : null,
      cx: o.cx !== undefined ? Number(o.cx) : null,
      chamfer: Array.isArray(o.chamfer) ? o.chamfer.map(Number) : null,
    }))
    .filter((o) => isFinite(o.z) && isFinite(o.d) && o.d >= 0);
  if (P.length < 2) throw new Error('Skelet potřebuje aspoň 2 rohové body (z, d)');

  // rohové body horní kontury: world x = Z, world y = poloměr
  const top = P.map((p) => ({ x: p.z, y: p.d / 2 }));

  // ostrá lomená čára vč. uzavření na osu (levé + pravé čelo)
  const full = []; // {x,y}
  const mod = [];  // modifikátor rohu (P[k]) nebo null pro body na ose
  const z0 = top[0].x, zN = top[top.length - 1].x;
  if (top[0].y > 1e-6) { full.push({ x: z0, y: 0 }); mod.push(null); }
  for (let k = 0; k < top.length; k++) { full.push({ x: top[k].x, y: top[k].y }); mod.push(P[k]); }
  if (top[top.length - 1].y > 1e-6) { full.push({ x: zN, y: 0 }); mod.push(null); }

  // vyřeš každý vnitřní roh
  const res = new Array(full.length).fill(null); // null = ostrý, nebo {T1,T2,bulge}
  for (let i = 1; i < full.length - 1; i++) {
    const m = mod[i];
    if (!m) continue;
    const hasCham = m.chamfer && m.chamfer.length >= 1 && m.chamfer[0] > 1e-9;
    const hasCenter = m.cz !== null && m.cx !== null;
    const hasFillet = m.r > 1e-9 || hasCenter;
    if (!hasCham && !hasFillet) continue;

    const A = { x1: full[i - 1].x, y1: full[i - 1].y, x2: full[i].x, y2: full[i].y };
    const B = { x1: full[i].x, y1: full[i].y, x2: full[i + 1].x, y2: full[i + 1].y };

    if (hasCham) {
      const leg = Number(m.chamfer[0]) || 0;
      const ang = ((m.chamfer.length >= 2 ? Number(m.chamfer[1]) : 45) * Math.PI) / 180;
      const out = chamferTwoLines(A, B, leg, leg * Math.tan(ang));
      if (out.ok) res[i] = { T1: { x: A.x2, y: A.y2 }, T2: { x: B.x1, y: B.y1 }, bulge: 0 };
      continue;
    }

    const P0 = full[i - 1], Pi = full[i], P2 = full[i + 1];
    if (hasCenter) {
      // zadaný střed má přednost: tečné body = paty kolmic ze středu
      const T1 = _foot(m.cz, m.cx, A.x1, A.y1, A.x2, A.y2);
      const T2 = _foot(m.cz, m.cx, B.x1, B.y1, B.x2, B.y2);
      if (_within(T1, P0, Pi) && _within(T2, Pi, P2))
        res[i] = { T1, T2, bulge: _arcBulge(T1, T2, m.cz, m.cx) };
    } else {
      const out = filletTwoLines(A, B, m.r);
      if (out.ok) {
        const T1 = { x: A.x2, y: A.y2 };
        const T2 = { x: B.x1, y: B.y1 };
        // tečné body musí zůstat uvnitř svých úseček, jinak by se profil překřížil
        if (_within(T1, P0, Pi) && _within(T2, Pi, P2))
          res[i] = { T1, T2, bulge: _arcBulge(T1, T2, out.arc.cx, out.arc.cy) };
      } // když fillet selže nebo nesedne (rovnoběžné / R moc velké) → roh zůstane ostrý
    }
  }

  // Pojistka proti překřížení dvou sousedních filletů na společné úsečce.
  // Na úsečce full[i]→full[i+1] ji ořezává res[i].T2 (od začátku) a res[i+1].T1 (od konce);
  // když se přejedou, zahoď ten roh, který ukrajuje víc, a opakuj.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < full.length - 1; i++) {
      const P1 = full[i], P2 = full[i + 1];
      const dx = P2.x - P1.x, dy = P2.y - P1.y, L2 = dx * dx + dy * dy || 1e-12;
      const param = (T) => ((T.x - P1.x) * dx + (T.y - P1.y) * dy) / L2;
      const tStart = res[i] ? param(res[i].T2) : 0;
      const tEnd = res[i + 1] ? param(res[i + 1].T1) : 1;
      if (tStart > tEnd + 1e-9) {
        const eatStart = res[i] ? tStart : 0;        // kolik ukrojí roh i od začátku
        const eatEnd = res[i + 1] ? 1 - tEnd : 0;    // kolik ukrojí roh i+1 od konce
        if (eatStart >= eatEnd && res[i]) res[i] = null;
        else if (res[i + 1]) res[i + 1] = null;
        else res[i] = null;
        changed = true;
      }
    }
  }

  // poskládej vrcholy + bulge
  const vertices = [], bulges = [];
  for (let i = 0; i < full.length; i++) {
    if (res[i]) {
      vertices.push({ x: res[i].T1.x, y: res[i].T1.y }); bulges.push(res[i].bulge);
      vertices.push({ x: res[i].T2.x, y: res[i].T2.y }); bulges.push(0);
    } else {
      vertices.push({ x: full[i].x, y: full[i].y }); bulges.push(0);
    }
  }
  return { vertices, bulges };
}

/** Sestaví profil – detekuje formát (skeleton / nové elementy / staré segmenty). */
export function buildProfile(items) {
  if (isSkeletonFormat(items)) return skeletonToProfile(items);
  return isElementFormat(items) ? elementsToProfile(items) : segmentsToProfile(items);
}

/** Vykreslí profil do výkresu jako jedna polyline (vrcholy + bulge → správný směr oblouků). */
export function renderProfile(items) {
  const { vertices, bulges } = buildProfile(items);
  if (vertices.length < 2) throw new Error('Profil nemá dost bodů');
  for (const v of vertices) {
    if (!isFinite(v.x) || !isFinite(v.y)) throw new Error('Profil obsahuje neplatné souřadnice');
  }
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

// Vytáhne stručný důvod chyby z odpovědi (JSON error.message nebo začátek textu).
async function readErrDetail(res) {
  try {
    const t = await res.text();
    if (!t) return '';
    try {
      const j = JSON.parse(t);
      return (j.error?.message || j.message || t).slice(0, 200);
    } catch {
      return t.slice(0, 200);
    }
  } catch {
    return '';
  }
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
    if (!res.ok) {
      const d = await readErrDetail(res);
      throw new Error('Gemini HTTP ' + res.status + (d ? ' – ' + d : ''));
    }
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
  if (!res.ok) {
    const d = await readErrDetail(res);
    throw new Error(AI_PROVIDERS[cfg.provider].name + ' HTTP ' + res.status + (d ? ' – ' + d : ''));
  }
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
      <textarea id="aiJson" class="ai-textarea" rows="5" placeholder='[{"z":0,"d":28},{"z":18,"d":28,"r":10},{"z":24,"d":16,"r":4},{"z":48,"d":10,"chamfer":[1,45]}]'></textarea>
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
