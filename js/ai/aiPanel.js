// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – AI panel: analýza výkresu → soustružnický profil   ║
// ║  Prompt (kopírovat) · foto→AI (auto) · JSON→vykreslit       ║
// ╚══════════════════════════════════════════════════════════════╝

import { showToast, state, pushUndo } from '../state.js';
import { makeOverlay, makeDraggable } from '../dialogFactory.js';
import { addPolylineAsSegments } from '../objects.js';
import { radiusToBulge, bulgeToArc } from '../utils.js';
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

// ── Prompt č. 2: přímo G-kód programu (soustruh) ──
export const AI_PROMPT_GCODE = `Jsi CNC programátor soustruhu. Z přiloženého výkresu rotačního dílu vytvoř PROGRAM v G-kódu, který OBKRESLÍ konturu zleva doprava.

Vracej POUZE řádky G-kódu. Žádný text, žádný markdown, žádné komentáře navíc.

SOUŘADNICE A SMĚR (POZOR – dodrž přesně):
- Absolutní programování (G90), milimetry (G71), rovina G18.
- X = PRŮMĚR (⌀, ne poloměr). Z = poloha podél osy.
- Kresli HORNÍ polovinu obrysu (nad osou, materiál pod ní).
- Jdi ZPRAVA DOLEVA (jako při soustružení) od volného konce/špičky ke sklíčidlu.
- ZAČNI NA OSE: "G0 X0 Z<celková délka>" (vpravo), pak "G1" nahoru na první ⌀ (čelo špičky).
- Sklíčidlo = NEJVĚTŠÍ ⌀ je VLEVO na Z0. Z se cestou jen ZMENŠUJE. Skonči taky na ose: poslední blok "G1 X0 Z0".
- KONTROLA NA KONCI: poslední bod musí vyjít přesně Z0. Když nevyjde Z0, vynechal jsi nějakou délku – dopočítej a oprav.
- Drž PŘESNÉ absolutní hodnoty z kót, ať profil přesně sedí.

PŘÍKAZY, KTERÉ MŮŽEŠ POUŽÍT:
- G0 X.. Z.. = rychloposuv na začátek kontury.
- G1 X.. Z.. = úsečka (válec, kužel, čelo).
- G2 X.. Z.. CR=.. = oblouk PO směru hodinových ručiček; G3 X.. Z.. CR=.. = oblouk PROTI směru hodinových ručiček. CR= = poloměr. Pro rádiusy, pasy, hrboly a oblé přechody.
- RND=poloměr = zaoblení, CHF=délka / CHR=délka = sražení — POUZE NA ROH (pravoúhlé osazení / hrana).

Výběr nech na sobě podle tvaru: zaoblení/sražení rohu → RND=/CHF=; oblouky a oblé přechody → G2/G3 s CR=.
Úhel kužele (např. 70°) přepočítej do koncových X/Z.

POZOR (jinak je geometrie nemožná):
- Používej jen ⌀ okótované na výkrese. NEVYMÝŠLEJ mezilehlé průměry.
- U G2/G3 musí platit CR ≥ polovina vzdálenosti jeho dvou bodů (√(ΔZ² + (Δ⌀/2)²) / 2). Když ti CR vychází menší, body jsou moc daleko od sebe – dej oblouk na bližší body a zbytek jako úsečku.
- RND=/CHF= dávej jen na roh, jehož obě sousední hrany jsou delší než ten poloměr/délka. Velký rádius na krátké hraně se nevejde – pak ho udělej jako oblouk G2/G3.
- Sražení zadej JEDNÍM způsobem: buď diagonální G1 (z menšího ⌀ na větší), NEBO CHF=/CHR= na pravoúhlém rohu – NIKDY obojí. Špičku nezačínej už sraženou (X8) a ještě k tomu CHF=.

PŘÍKLAD (ZPRAVA DOLEVA: špička vpravo → ⌀28 sklíčidlo vlevo, start i konec na ose):
G18 G90 G71
G0 X0 Z48             ; osa, pravý konec (Z = celková délka)
G1 X8 Z48             ; čelo nahoru na ⌀8 (sražená špička)
G1 X10 Z47            ; sražení 1×45° = diagonála (NE CHF= navíc)
G1 X10 Z41
G1 X16 Z30 RND=7
G1 X16 Z18 RND=1      ; pravoúhlé osazení se zaoblením
G1 X28 Z18
G2 X28 Z3 CR=10       ; pas R10 = OBLOUK, NE RND
G1 X28 Z0             ; čelo sklíčidla na Z0
G1 X0 Z0              ; uzavři na osu
(Toto je jen ukázka formátu/směru – čísla vezmi z přiloženého výkresu.)`;

// ── Prompt č. 3: DRÁHA z výřezu výkresu (bez Z0 / sklíčidla) ──
export const AI_PROMPT_GCODE_PATH = `Jsi CNC programátor. Na obrázku je POUZE VÝŘEZ / kousek výkresu – NE celý díl. NENÍ tu nulový bod Z0 ani sklíčidlo a tvar nemusí být uzavřený. Tvým úkolem je obkreslit DRÁHOU jen ty tvary, které na výřezu vidíš.

Vracej POUZE řádky G-kódu. Žádný text, žádný markdown, žádné komentáře.

PŘÍKAZY:
- Absolutní programování (G90), milimetry (G71), rovina G18. X = svislý rozměr (průměr), Z = vodorovný rozměr.
- G0 X.. Z.. = bod, KDE dráha ZAČÍNÁ (najetí na první viditelný bod tvaru).
- G1 X.. Z.. = rovný úsek (úsečka).
- G2 X.. Z.. CR=.. = oblouk PO směru hodinových ručiček.
- G3 X.. Z.. CR=.. = oblouk PROTI směru hodinových ručiček.
- CR= = poloměr oblouku.

PRAVIDLA:
- Začni "G0" na jednom konci viditelného tvaru a veď dráhu PLYNULE k druhému konci – každý další blok navazuje tam, kde předchozí skončil.
- Rovné čáry → G1. Rádiusy/oblouky → G2 nebo G3 (směr podle zakřivení). U oblouku musí být CR ≥ polovina vzdálenosti jeho dvou bodů.
- Kresli JEN to, co je na výřezu vidět. NEDOPLŇUJ čelo, osu, Z0 ani domyšlené konce.
- Rozměry ber z kót na výřezu; když kóta chybí, odhadni proporčně podle obrázku.
- Souřadnice mohou být jakékoli (nemusí začínat v 0) – G0 jen určí, odkud dráha vychází.`;

// ── Knihovna promptů (vestavěné + uživatelské v localStorage) ──
// mode: 'skeleton' (výstup = JSON skelet) | 'gcode' (výstup = G-kód)
const BUILTIN_PROMPTS = [
  { id: 'builtin-skeleton', name: 'Skelet kontury (JSON)', mode: 'skeleton', text: AI_PROMPT, builtin: true },
  { id: 'builtin-gcode', name: 'Kontura G kód', mode: 'gcode', text: AI_PROMPT_GCODE, builtin: true },
  { id: 'builtin-gcode-path', name: 'Dráha G kód', mode: 'gcode', text: AI_PROMPT_GCODE_PATH, builtin: true },
  // Prázdný editovatelný slot – text si uživatel napíše sám (ukládá se zvlášť)
  { id: 'builtin-mygcode', name: 'Můj G kód', mode: 'gcode', text: '', builtin: true, editable: true },
];
const PROMPTS_KEY = 'skica_ai_prompts';
const PROMPT_ACTIVE_KEY = 'skica_ai_prompt_active';
const MYGCODE_KEY = 'skica_ai_mygcode';
function loadMyGcode() { try { return localStorage.getItem(MYGCODE_KEY) || ''; } catch { return ''; } }
function saveMyGcode(t) { try { localStorage.setItem(MYGCODE_KEY, t || ''); } catch { /* ignore */ } }

function loadUserPrompts() {
  try {
    const a = JSON.parse(localStorage.getItem(PROMPTS_KEY));
    return Array.isArray(a) ? a.filter((p) => p && p.id && p.text) : [];
  } catch {
    return [];
  }
}
function saveUserPrompts(list) {
  try {
    localStorage.setItem(PROMPTS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
/** Všechny prompty = vestavěné (+ uložený text „Můj G kód") + uživatelské. */
export function allPrompts() {
  const builtins = BUILTIN_PROMPTS.map((p) =>
    p.id === 'builtin-mygcode' ? { ...p, text: loadMyGcode() } : p,
  );
  return [...builtins, ...loadUserPrompts()];
}

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

/** Přidá profil jako samostatné úsečky a oblouky (bez polyline objektu). */
function addProfileObject(vertices, bulges) {
  if (!vertices || vertices.length < 2) throw new Error('Profil nemá dost bodů');
  for (const v of vertices) {
    if (!isFinite(v.x) || !isFinite(v.y)) throw new Error('Profil obsahuje neplatné souřadnice');
  }
  const segments = addPolylineAsSegments(vertices, bulges, false);
  autoCenterView();
  return segments.length > 0 ? segments[0] : null;
}

/** Vykreslí profil ze skeletu / elementů (JSON) jako jednu polyline. */
export function renderProfile(items) {
  const { vertices, bulges } = buildProfile(items);
  return addProfileObject(vertices, bulges);
}

/**
 * Parsuje G-kód na vrcholy + bulge. Podporuje:
 *  - G0/G1 lineární, G2/G3 oblouky (CR=/R nebo I/K),
 *  - G90 (absolutní) / G91 (inkrementální) – modální, platí od řádku, kde jsou uvedeny,
 *    až do dalšího přepnutí. Default = G90. V G91 se X/Z přičítají k aktuální poloze
 *    (X je inkrement PRŮMĚRU). I/K jsou vždy relativní ke start. bodu oblouku (beze změny).
 *  - Sinumerik zkratky na rohu: RND= (zaoblení), RNDM= (modální), CHF=/CHR= (sražení) –
 *    dopočítají se tečně + ořezem (stejně jako tlačítko Zaob./Zkos.).
 * X bere jako PRŮMĚR (poloměr = X/2), Z jako osu. G2=CW, G3=CCW.
 * @returns {{vertices:{x:number,y:number}[], bulges:number[]}}
 */
export function gcodeToProfile(text) {
  const isKarusel = state.machineType === 'karusel';
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^[(;%]/.test(l));
  const pts = [];        // {x,y} koncové body bloků
  const segBulge = [];   // bulge úsečky pts[i]→pts[i+1]
  const cornerMod = [];  // modifikátor rohu v pts[i]: {kind:'rnd'|'chf', v} | null
  let curX = 0, curZ = 0, curG = 'G0', modalRnd = 0, absMode = true;

  for (const line of lines) {
    // G90/G91 = modální přepnutí absolutní/inkrementální; platí od tohoto řádku včetně
    const absM = line.match(/G9([01])(?!\d)/i);
    if (absM) absMode = absM[1] === '0';
    const gm = line.match(/G0*([0-3])(?!\d)/i);
    if (gm) curG = 'G' + gm[1];
    const rndmM = line.match(/RNDM\s*=\s*(-?[\d.]+)/i);
    if (rndmM) modalRnd = parseFloat(rndmM[1]) || 0;
    const rndM = !rndmM && line.match(/RND\s*=\s*([\d.]+)/i);
    const chfM = line.match(/CH[FR]\s*=\s*([\d.]+)/i);
    const xm = line.match(/X\s*(-?[\d.]+)/i);
    const zm = line.match(/Z\s*(-?[\d.]+)/i);
    const mod = rndM ? { kind: 'rnd', v: parseFloat(rndM[1]) }
      : chfM ? { kind: 'chf', v: parseFloat(chfM[1]) }
        : null;

    if (xm || zm) {
      if (xm) curX = absMode ? parseFloat(xm[1]) : curX + parseFloat(xm[1]);
      if (zm) curZ = absMode ? parseFloat(zm[1]) : curZ + parseFloat(zm[1]);
      // X = PRŮMĚR → poloměr = X/2 (nezávisle na režimu zobrazení appky)
      const rad = curX / 2;
      const pt = { x: isKarusel ? rad : curZ, y: isKarusel ? curZ : rad };
      if (pts.length) {
        let bulge = 0;
        if (curG === 'G2' || curG === 'G3') {
          const prev = pts[pts.length - 1];
          const cw = curG === 'G2';
          const im = line.match(/I\s*(-?[\d.]+)/i);
          const km = line.match(/K\s*(-?[\d.]+)/i);
          const rm = line.match(/CR\s*=\s*(-?[\d.]+)/i) || line.match(/R\s*=?\s*(-?[\d.]+)/i);
          if (im && km) {
            // I,K = poloměrové inkrementy ke středu (Sinumerik I/K jsou v poloměru)
            const cx = isKarusel ? prev.x + parseFloat(im[1]) : prev.x + parseFloat(km[1]);
            const cy = isKarusel ? prev.y + parseFloat(km[1]) : prev.y + parseFloat(im[1]);
            bulge = radiusToBulge(prev, pt, Math.hypot(prev.x - cx, prev.y - cy), cw) || 0;
          } else if (rm) {
            const rv = parseFloat(rm[1]);
            bulge = radiusToBulge(prev, pt, Math.abs(rv), cw) || 0;
            if (rv < 0) bulge = -bulge;
          }
        }
        segBulge.push(bulge);
      }
      pts.push(pt);
      cornerMod.push(mod || (modalRnd > 0 ? { kind: 'rnd', v: modalRnd } : null));
    } else if (mod && pts.length) {
      cornerMod[pts.length - 1] = mod; // samostatné RND=/CHF= → roh u posledního bodu
    }
  }
  if (pts.length < 2) throw new Error('G-kód nemá dost bodů (potřebuje G0/G1… s X/Z)');

  // Aplikuj RND/CHF na rozích mezi DVĚMA rovnými úseky (jinak nech ostrý)
  const res = new Array(pts.length).fill(null);
  for (let i = 1; i < pts.length - 1; i++) {
    const m = cornerMod[i];
    if (!m) continue;
    if ((segBulge[i - 1] || 0) !== 0 || (segBulge[i] || 0) !== 0) continue;
    const A = { x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y };
    const B = { x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y };
    if (m.kind === 'chf') {
      const out = chamferTwoLines(A, B, m.v, m.v);
      if (out.ok) res[i] = { T1: { x: A.x2, y: A.y2 }, T2: { x: B.x1, y: B.y1 }, bulge: 0 };
    } else {
      const out = filletTwoLines(A, B, m.v);
      if (out.ok) {
        const T1 = { x: A.x2, y: A.y2 }, T2 = { x: B.x1, y: B.y1 };
        if (_within(T1, pts[i - 1], pts[i]) && _within(T2, pts[i], pts[i + 1]))
          res[i] = { T1, T2, bulge: _arcBulge(T1, T2, out.arc.cx, out.arc.cy) };
      }
    }
  }

  // poskládej vrcholy + bulge
  const vertices = [], bulges = [];
  for (let i = 0; i < pts.length; i++) {
    const segB = i < segBulge.length ? segBulge[i] || 0 : 0;
    if (res[i]) {
      vertices.push({ x: res[i].T1.x, y: res[i].T1.y }); bulges.push(res[i].bulge);
      vertices.push({ x: res[i].T2.x, y: res[i].T2.y }); bulges.push(segB);
    } else {
      vertices.push({ x: pts[i].x, y: pts[i].y }); bulges.push(segB);
    }
  }
  return { vertices, bulges };
}

/** Vykreslí profil z G-kódu (výstup AI v režimu „G-kód"). */
export function renderGcode(text) {
  const { vertices, bulges } = gcodeToProfile(text);
  return addProfileObject(vertices, bulges);
}

/**
 * Převede konturu (vrcholy + bulge) na G-kód soustruhu – obkreslí profil
 * zleva doprava (Z0 vlevo). X = PRŮMĚR (2× poloměr), nezávisle na režimu zobrazení.
 * Oblouky přes CR= (poloměr). bulge<0 → G2 (CW), bulge>0 → G3 (CCW).
 * @returns {string}
 */
export function profileToGcode(vertices, bulges) {
  if (!vertices || vertices.length < 2) return '';
  const isKarusel = state.machineType === 'karusel';
  const dec = state.displayDecimals ?? 3;
  // X = průměr = 2× poloměr (poloměr je svislá osa u soustruhu, vodorovná u karuselu)
  const xOf = (p) => (2 * (isKarusel ? p.x : p.y)).toFixed(dec);
  const zOf = (p) => (isKarusel ? p.y : p.x).toFixed(dec);

  let g = '; G-kód kontury AI Profil (Z0 vlevo, X = průměr)\nG18 G90 G71\n';
  g += `G0 X${xOf(vertices[0])} Z${zOf(vertices[0])}\n`;
  let feedDone = false;
  const F = () => (feedDone ? '' : ((feedDone = true), ' F0.2'));

  for (let i = 1; i < vertices.length; i++) {
    const p1 = vertices[i - 1], p2 = vertices[i];
    const b = bulges[i - 1] || 0;
    const arc = Math.abs(b) > 1e-9 ? bulgeToArc(p1, p2, b) : null;
    if (arc) {
      g += `${b < 0 ? 'G2' : 'G3'} X${xOf(p2)} Z${zOf(p2)} CR=${arc.r.toFixed(dec)}${F()}\n`;
    } else {
      g += `G1 X${xOf(p2)} Z${zOf(p2)}${F()}\n`;
    }
  }
  return g;
}

// ── Historie vloženého JSON (localStorage) ──
const JSON_HISTORY_KEY = 'skica_ai_json_history';
function loadJsonHistory() {
  try {
    const h = JSON.parse(localStorage.getItem(JSON_HISTORY_KEY));
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}
function pushJsonHistory(json) {
  const j = (json || '').trim();
  if (!j) return;
  let h = loadJsonHistory().filter((e) => e.json !== j); // dedupe
  h.unshift({ ts: Date.now(), json: j });
  h = h.slice(0, 3);
  try {
    localStorage.setItem(JSON_HISTORY_KEY, JSON.stringify(h));
  } catch {
    /* ignore */
  }
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
export async function analyzeImage(dataUrl, promptText = AI_PROMPT) {
  const cfg = getActiveAIConfig();
  if (!cfg.apiKey) throw new Error('Chybí API klíč – otevři ⚙ Nastavení.');
  if (!cfg.model) throw new Error('Není vybraný model – otevři ⚙ Nastavení.');
  const PROMPT = promptText || AI_PROMPT;
  const temp = isFinite(Number(cfg.temperature)) ? Number(cfg.temperature) : 0;

  // ── Gemini (nativní generateContent) ──
  if (cfg.provider === 'gemini') {
    const m = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!m) throw new Error('Neplatný obrázek');
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=` +
      encodeURIComponent(cfg.apiKey);
    const body = {
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
      generationConfig: { temperature: temp },
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
      temperature: temp,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
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
      <div class="ai-sec-head">1) Prompt pro AI (knihovna)</div>
      <label class="ai-row">
        <span>Prompt</span>
        <select id="aiPromptSel"></select>
      </label>
      <label class="ai-row">
        <span>Výstup</span>
        <select id="aiPromptMode">
          <option value="skeleton">Skelet kontury (JSON)</option>
          <option value="gcode">G-kód (kontura / dráha)</option>
        </select>
      </label>
      <textarea id="aiPrompt" class="ai-textarea" rows="5"></textarea>
      <div class="ai-actions">
        <button class="btn-ok" id="aiCopyPrompt" type="button">📋 Kopírovat</button>
        <button class="btn-ok" id="aiSavePrompt" type="button">💾 Uložit jako nový</button>
        <button class="btn-ok" id="aiDeletePrompt" type="button">🗑 Smazat</button>
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
      <div class="ai-sec-head">3) Výstup od AI → vykreslit</div>
      <textarea id="aiJson" class="ai-textarea" rows="5" placeholder='Skelet: [{"z":0,"d":28},…]   nebo   G-kód: G0 X28 Z0 …'></textarea>
      <div class="ai-actions">
        <button class="btn-ok btn-primary" id="aiRender" type="button">✏️ Vykreslit</button>
        <button class="btn-ok" id="aiGcode" type="button">📄 G-kód</button>
        <button class="btn-ok" id="aiOpenSettings" type="button">⚙ Nastavení</button>
      </div>
      <label class="ai-row">
        <span>Historie výstupů</span>
        <select id="aiJsonHist"></select>
      </label>
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

  // Okno lze táhnout za titulkovou lištu
  makeDraggable(overlay.querySelector('.calc-window'), overlay.querySelector('.calc-titlebar'));

  // ── Knihovna promptů ──
  function loadPromptIntoEditor(id) {
    const p = allPrompts().find((x) => x.id === id) || allPrompts()[0];
    $('#aiPrompt').value = p.text;
    $('#aiPromptMode').value = p.mode || 'skeleton';
    $('#aiDeletePrompt').disabled = !!p.builtin;
    try { localStorage.setItem(PROMPT_ACTIVE_KEY, p.id); } catch { /* ignore */ }
  }
  function refreshPromptSel(selectId) {
    const sel = $('#aiPromptSel');
    const prompts = allPrompts();
    sel.innerHTML = '';
    prompts.forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = (p.builtin ? '★ ' : '') + p.name;
      sel.appendChild(o);
    });
    let active = selectId || localStorage.getItem(PROMPT_ACTIVE_KEY) || prompts[0].id;
    if (!prompts.some((p) => p.id === active)) active = prompts[0].id;
    sel.value = active;
    loadPromptIntoEditor(active);
  }
  refreshPromptSel();

  // Detekce typu výstupu (JSON skelet vs G-kód) a sestavení profilu
  const looksLikeJson = (t) =>
    /^[[{]/.test(String(t || '').replace(/^```(?:json)?/i, '').trim());
  function profileFromOutput(text) {
    return looksLikeJson(text) ? buildProfile(parseAIProfile(text)) : gcodeToProfile(text);
  }

  function refreshProvName() {
    const cfg = getActiveAIConfig();
    const name = AI_PROVIDERS[cfg.provider]?.name || '—';
    $('#aiProvName').textContent = cfg.model ? `${name}: ${cfg.model}` : name;
  }
  refreshProvName();

  // Historie vloženého JSON
  function refreshHistory() {
    const sel = $('#aiJsonHist');
    const h = loadJsonHistory();
    sel.innerHTML = '';
    const head = document.createElement('option');
    head.value = '';
    head.textContent = h.length ? `— historie (${h.length}) —` : '— historie prázdná —';
    sel.appendChild(head);
    h.forEach((e, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      const t = new Date(e.ts);
      const time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
      const preview = e.json.replace(/\s+/g, ' ').slice(0, 40);
      o.textContent = `${time}  ${preview}…`;
      sel.appendChild(o);
    });
  }
  refreshHistory();

  // Poslední výstup zůstává v poli (do nového požadavku)
  const lastOut = loadJsonHistory()[0];
  if (lastOut && !$('#aiJson').value.trim()) $('#aiJson').value = lastOut.json;

  // Zobrazí G-kód v samostatném okně s tlačítkem Kopírovat
  function showGcode(text) {
    const html = `
      <div class="ai-panel">
        <textarea id="aiGcodeText" class="ai-textarea" rows="16" readonly></textarea>
        <div class="ai-actions">
          <button class="btn-ok btn-primary" id="aiGcodeCopy" type="button">📋 Kopírovat G-kód</button>
        </div>
      </div>`;
    const ov = makeOverlay('ai-gcode', '📄 G-kód kontury (Z0 vlevo)', html, 'ai-window');
    if (!ov) return;
    ov.querySelector('#aiGcodeText').value = text;
    ov.querySelector('#aiGcodeCopy').addEventListener('click', () => {
      navigator.clipboard
        .writeText(text)
        .then(() => showToast('G-kód zkopírován do schránky'))
        .catch(() => showToast('Nelze zkopírovat do schránky'));
    });
    ov.querySelectorAll('textarea').forEach((el) => el.addEventListener('keydown', (e) => e.stopPropagation()));
  }

  // Zeptá se, co s existujícím výkresem: 'replace' | 'add' | 'cancel'
  function askOverwrite() {
    return new Promise((resolve) => {
      const html = `
        <div class="ai-panel">
          <p style="margin:0 0 4px">Na ploše už je nakreslený objekt. Co s ním?</p>
          <div class="ai-actions">
            <button class="btn-ok btn-primary" id="ovReplace" type="button">Přepsat</button>
            <button class="btn-ok" id="ovAdd" type="button">Přidat vedle</button>
            <button class="btn-ok" id="ovCancel" type="button">Zrušit</button>
          </div>
        </div>`;
      const ov = makeOverlay('ai-confirm', '⚠️ Přepsat výkres?', html, 'ai-window');
      if (!ov) { resolve('cancel'); return; }
      let decided = false;
      const finish = (v) => { decided = true; ov.remove(); resolve(v); };
      ov.querySelector('#ovReplace').addEventListener('click', () => finish('replace'));
      ov.querySelector('#ovAdd').addEventListener('click', () => finish('add'));
      ov.querySelector('#ovCancel').addEventListener('click', () => finish('cancel'));
      // zavření přes ✕ / pozadí / Esc → bránit se jako 'cancel'
      new MutationObserver((_, obs) => {
        if (!document.body.contains(ov)) { obs.disconnect(); if (!decided) resolve('cancel'); }
      }).observe(document.body, { childList: true });
    });
  }

  // Vykreslí profil; když už něco je na ploše, zeptá se na přepsání.
  async function drawProfile(vertices, bulges) {
    if (state.objects.length > 0) {
      const choice = await askOverwrite();
      if (choice === 'cancel') return null;
      if (choice === 'replace') {
        pushUndo();
        state.objects.length = 0;
        state.selected = null;
        state.selectedPoint = null;
        state.intersections = [];
      }
    }
    return addProfileObject(vertices, bulges);
  }

  // 1) Knihovna promptů: výběr / kopírovat / uložit / smazat
  $('#aiPromptSel').addEventListener('change', () => loadPromptIntoEditor($('#aiPromptSel').value));
  // „Můj G kód" se ukládá průběžně, jak ho píšeš
  $('#aiPrompt').addEventListener('input', () => {
    if ($('#aiPromptSel').value === 'builtin-mygcode') saveMyGcode($('#aiPrompt').value);
  });
  $('#aiCopyPrompt').addEventListener('click', () => {
    navigator.clipboard
      .writeText($('#aiPrompt').value)
      .then(() => showToast('Prompt zkopírován do schránky'))
      .catch(() => showToast('Nelze zkopírovat do schránky'));
  });
  $('#aiSavePrompt').addEventListener('click', () => {
    const name = (window.prompt('Název nového promptu:', 'Můj prompt') || '').trim();
    if (!name) return;
    const list = loadUserPrompts();
    const id = 'user-' + Date.now();
    list.push({ id, name, mode: $('#aiPromptMode').value, text: $('#aiPrompt').value });
    saveUserPrompts(list);
    refreshPromptSel(id);
    showToast('Prompt uložen ✓');
  });
  $('#aiDeletePrompt').addEventListener('click', () => {
    const id = $('#aiPromptSel').value;
    const p = allPrompts().find((x) => x.id === id);
    if (!p || p.builtin) { showToast('Vestavěný prompt nelze smazat'); return; }
    saveUserPrompts(loadUserPrompts().filter((x) => x.id !== id));
    refreshPromptSel();
    showToast('Prompt smazán');
  });

  // 2) Analyzovat foto přes AI (vybraným promptem)
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
      const answer = await analyzeImage(dataUrl, $('#aiPrompt').value);
      $('#aiJson').value = answer.trim();
      pushJsonHistory(answer);
      refreshHistory();
      // zkus rovnou vykreslit (auto-detekce JSON / G-kód), s dotazem na přepsání
      const { vertices, bulges } = profileFromOutput(answer);
      const obj = await drawProfile(vertices, bulges);
      setStatus(obj ? `Hotovo – vykresleno ${vertices.length} bodů.` : 'Analýza hotová – vykreslení zrušeno.', 'ai-status-ok');
    } catch (e) {
      setStatus('Chyba: ' + e.message, 'ai-status-err');
      showToast('AI: ' + e.message);
    } finally {
      btn.disabled = false;
    }
  });

  // 3) Vykreslit z výstupu (JSON skelet i G-kód)
  $('#aiRender').addEventListener('click', async () => {
    try {
      const raw = $('#aiJson').value;
      const { vertices, bulges } = profileFromOutput(raw);
      const obj = await drawProfile(vertices, bulges);
      if (!obj) { setStatus('Vykreslení zrušeno.'); return; }
      pushJsonHistory(raw);
      refreshHistory();
      setStatus(`Vykresleno – ${vertices.length} bodů.`, 'ai-status-ok');
    } catch (e) {
      setStatus('Chyba: ' + e.message, 'ai-status-err');
      showToast('AI: ' + e.message);
    }
  });

  // 📄 G-kód kontury (z aktuálního výstupu)
  $('#aiGcode').addEventListener('click', () => {
    try {
      const { vertices, bulges } = profileFromOutput($('#aiJson').value);
      const g = profileToGcode(vertices, bulges);
      if (!g) {
        setStatus('Profil nemá dost bodů pro G-kód.', 'ai-status-err');
        return;
      }
      showGcode(g);
      setStatus('G-kód vygenerován.', 'ai-status-ok');
    } catch (e) {
      setStatus('Chyba: ' + e.message, 'ai-status-err');
      showToast('AI: ' + e.message);
    }
  });

  // Historie → načti zpět do textarea
  $('#aiJsonHist').addEventListener('change', (e) => {
    const idx = e.target.value;
    if (idx === '') return;
    const h = loadJsonHistory();
    const item = h[Number(idx)];
    if (item) {
      $('#aiJson').value = item.json;
      setStatus('Načteno z historie.', 'ai-status-ok');
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
