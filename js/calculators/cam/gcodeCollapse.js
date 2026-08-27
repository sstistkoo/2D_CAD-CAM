// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – slučování navazujících PŘÍMÝCH bloků (zkrácení programu)   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Generátor skládá jeden rovný pohyb ze tří etap, které o sobě nevědí:
// nájezd posuvem k materiálu, vlastní řez a doběh za hranu polotovaru.
// Ve výstupu z toho vzniknou tři bloky, které jedou po JEDNÉ PŘÍMCE stejným
// směrem — stroj mezi nimi nic neudělá, jen se zbytečně čte řádek navíc:
//
//     N280 G1 Z258.373 F0.25        N280 G1 Z195.278 F0.25
//     N290 G1 Z196.278 F0.25   →
//     N300 G1 Z195.278 F0.25
//
// (nález uživatele 27. 8. 2026). Tenhle modul je POST-ÚPRAVA emise: na
// geometrii nesahá, jen slučuje bloky, jejichž spojením vznikne DOSLOVA
// stejná dráha. Proto se taky každé sloučení na konci ověří dopočtem polohy
// a při sebemenším nesouhlasu se běh nechá rozepsaný.
//
// CO SE NESLUČUJE (a proč):
//   • cokoli s KOMENTÁŘEM — `; Rampa 90.0°`, `; Výjezd nad konturu` a
//     `; Výjezd materiálem posuvem` nesou informaci, kterou by sloučení
//     zahodilo;
//   • oblouky (G2/G3) a všechno, co není čistě `G0/G1 X Z F`;
//   • bloky s RŮZNÝM posuvem (F je modální, takže se porovnává skutečně
//     platný posuv, ne zapsaný token);
//   • G0 s G1 dohromady — rychloposuv a řezný pohyb nejsou totéž;
//   • obrat směru (skalární součin ≤ 0), i když leží na téže přímce.
//
// N-bloky se tu NEPŘEČÍSLUJÍ — dělá to až `generateAutoGCode`, aby závislost
// mezi moduly vedla jen jedním směrem (viz „Bridge“ v CLAUDE.md).
//
// Testy: tests/cam-gcode-collapse.test.js

/** Kolmá odchylka mezibodu od přímky běhu, nad kterou se už neslučuje [mm].
 *  Souřadnice se tisknou na 3 desetinná místa, takže „rovná" trojice může
 *  po zaokrouhlení vybočit o ~0,0005 mm; 1 µm je nad tím a hluboko pod
 *  čímkoli, co má na stroji význam. */
const COLLINEAR_TOL = 1e-3;

/** Rozdíl polohy, při kterém se sloučený blok bere jako shodný s původním. */
const VERIFY_TOL = 1e-9;

/** Konec řádku od prvního `;` nebo `(` — komentář v obou dialektech. */
const COMMENT_RE = /[;(]/;
/** Slovo adresy: písmeno + číslo (`X51.023`, `F0.25`, `G1`). */
const WORD_RE = /([A-Z])\s*(-?\d*\.?\d+)/gi;

/**
 * Rozebere řádek na části, se kterými se dá počítat.
 * @returns {{n:string, body:string, comment:string}}
 */
function splitLine(text) {
  const nm = text.match(/^\s*(N\d+)\s*/i);
  const n = nm ? nm[1] : '';
  let rest = nm ? text.slice(nm[0].length) : text;
  const ci = rest.search(COMMENT_RE);
  const comment = ci >= 0 ? rest.slice(ci) : '';
  if (ci >= 0) rest = rest.slice(0, ci);
  return { n, body: rest.trim(), comment };
}

/**
 * Adresy z těla řádku jako mapa písmeno → { value, text }.
 * `text` je PŮVODNÍ zápis včetně formátu (`X0.000` × `X0`), aby se sloučený
 * blok dal poskládat z existujících tokenů a nezměnil se tisk čísel.
 */
function words(body) {
  const out = {};
  WORD_RE.lastIndex = 0;
  let m;
  while ((m = WORD_RE.exec(body)) !== null) {
    const letter = m[1].toUpperCase();
    if (out[letter] === undefined) out[letter] = { value: parseFloat(m[2]), text: m[0].replace(/\s+/g, '') };
  }
  return out;
}

/** Je tělo řádku POUZE lineární pohyb (G0/G1 + X/Z/F)? */
function isPlainMove(body, w) {
  if (!/[XZ]/i.test(body)) return false;                 // bez pohybu v rovině
  if (w.G !== undefined && w.G.value !== 0 && w.G.value !== 1) return false;
  // Žádná jiná adresa (M, S, T, CR=, I/K, …) — ta by sloučením zmizela.
  const letters = Object.keys(w);
  if (letters.some(L => !'GXZF'.includes(L))) return false;
  return !/=/.test(body);                                 // `CR=`, `LIMS=` apod.
}

/**
 * Sloučí navazující přímé bloky, které leží na jedné přímce a jedou stejným
 * směrem. Vrací NOVÉ pole (vstup nemění).
 *
 * @param {Array<{text:string, simIdx:(number|null)}>} lines řádky z `generateAutoGCode`
 * @returns {Array<{text:string, simIdx:(number|null)}>} — s dírami v číslování N,
 *          o které se postará `renumberGCodeLines` u volajícího
 */
export function mergeCollinearMoves(lines) {
  // 1) Popis každého řádku: poloha po jeho vykonání + jestli se smí slučovat.
  let x = null, z = null, g = null, f = null;
  const info = lines.map((ln) => {
    const { body, comment } = splitLine(ln.text || '');
    const w = words(body);
    if (w.G !== undefined) g = w.G.value;
    if (w.F !== undefined) f = w.F.value;
    const moves = /[XZ]/i.test(body);
    const from = { x, z };
    if (w.X !== undefined) x = w.X.value;
    if (w.Z !== undefined) z = w.Z.value;
    return {
      w, comment, from, to: { x, z }, g, f,
      // Slučovat lze jen pohyb bez komentáře se známou výchozí polohou:
      // dokud se nejede z konkrétního bodu, nedá se ověřit přímost.
      ok: moves && !comment && isPlainMove(body, w) && from.x !== null && from.z !== null,
    };
  });

  // 2) Běhy: co nejdelší úseky slučitelných řádků na jedné přímce.
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (!info[i].ok) { out.push(lines[i]); i++; continue; }
    let j = i;
    // Směr běhu určí první pohyb NENULOVÉ délky; nulové pohyby (dvakrát týž
    // bod) směr neurčují ani neporušují — a sloučením rovnou zmizí.
    let dx = info[i].to.x - info[i].from.x, dz = info[i].to.z - info[i].from.z;
    while (j + 1 < lines.length) {
      const a = info[j], b = info[j + 1];
      if (!b.ok || b.g !== a.g || b.f !== a.f) break;
      const ex = b.to.x - b.from.x, ez = b.to.z - b.from.z;
      if (ex !== 0 || ez !== 0) {
        if (dx === 0 && dz === 0) { dx = ex; dz = ez; }   // směr dosud neurčen
        else {
          const len = Math.hypot(dx, dz);
          // Kolmá odchylka koncového bodu od přímky běhu + zákaz obratu.
          if (Math.abs(dx * ez - dz * ex) / len > COLLINEAR_TOL) break;
          if (dx * ex + dz * ez <= 0) break;
        }
      }
      j++;
    }
    if (j === i) { out.push(lines[i]); i++; continue; }

    // 3) Poskládat jeden blok z tokenů, které v běhu opravdu padly.
    const first = info[i], last = info[j];
    const pick = (L) => {
      for (let k = j; k >= i; k--) if (info[k].w[L] !== undefined) return info[k].w[L];
      return null;
    };
    const parts = [];
    const gw = pick('G');
    parts.push(gw ? gw.text : `G${first.g}`);
    if (Math.abs(last.to.x - first.from.x) > 0 && pick('X')) parts.push(pick('X').text);
    if (Math.abs(last.to.z - first.from.z) > 0 && pick('Z')) parts.push(pick('Z').text);
    if (pick('F')) parts.push(pick('F').text);
    const body = parts.join(' ');

    // 4) POJISTKA: dopočítat polohu ze složeného bloku a porovnat s během.
    //    Nesouhlasí-li na 1e-9, nechá se běh rozepsaný — zkrácení programu
    //    nestojí za jediný pohyb, který by jel jinam.
    const chk = words(body);
    const cx = chk.X !== undefined ? chk.X.value : first.from.x;
    const cz = chk.Z !== undefined ? chk.Z.value : first.from.z;
    if (Math.abs(cx - last.to.x) > VERIFY_TOL || Math.abs(cz - last.to.z) > VERIFY_TOL) {
      for (let k = i; k <= j; k++) out.push(lines[k]);
      i = j + 1;
      continue;
    }
    out.push({ ...lines[i], text: `${splitLine(lines[i].text).n} ${body}`.trim() });
    i = j + 1;
  }

  return out;
}
