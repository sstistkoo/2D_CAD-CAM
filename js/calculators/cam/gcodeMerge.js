// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – spojení více programů (částí) do jednoho              ║
// ╚══════════════════════════════════════════════════════════════╝
// Sdíleno mezi CAM Editorem („🔗 Spojit do jednoho" ve frontě SPOJ G-KÓD)
// a CAM Simulátorem (skládání operací tlačítkem „➕ Operace" — viz
// cam/opParts.js). Dřív žilo jen v camEditor.js; vytaženo sem, aby obě
// místa spojovala PŘESNĚ stejně a nevznikl cyklický import.

// Komentář k M-kódu vřetena při znovuzapnutí mezi částmi.
const SPINDLE_CMT = { 3: 'Vřeteno CW', 4: 'Vřeteno CCW' };

// ── DIALEKT SPOJOVANÉHO KÓDU ───────────────────────────────────
// Spojování si dopisuje vlastní řádky (značka části, M3/M8/M5/M9, STOPRE).
// Do 15. 9. 2026 byly natvrdo v sinumerikovském zápisu, takže spojení
// fanucovských částí vyrobilo program s `;` komentáři a se `STOPRE`, což
// FANUC neumí ani jedno — řízení by ho odmítlo. Dialekt se proto odvodí
// z kódu první části: Fanuc píše komentáře do závorek, ostatní za středník.
function detectDialect(code) {
  const text = String(code || '');
  const hasSemi = /(^|\s);/m.test(text);
  const hasParen = /\([^)]*\)/.test(text);
  return (!hasSemi && hasParen) ? 'fanuc' : 'sinumerik';
}

const mergeCmt = (ctrl) => (text) => ctrl === 'fanuc' ? `( ${text} )` : `; ${text}`;

// Rozdělí kód na "hlavičku" (úvodní nastavení stroje – rovina, G90/91,
// nulový bod, posuv, otáčky, nástroj…) a "tělo" (vlastní dráhy). Hranice
// se hledá primárně podle dělicího komentáře "; ---" (tímto stylem
// generuje hlavičky CAM simulátor této appky); pokud žádný není, hlavička
// končí prvním řádkem s G1/G2/G3 (řezný/kruhový pohyb).
export function splitHeaderBody(code) {
  const lines = code.replace(/\r\n/g, '\n').split('\n');
  const dividerIdx = lines.findIndex(l => /^\s*[;(]\s*-{2,}/.test(l));
  if (dividerIdx !== -1) return { header: lines.slice(0, dividerIdx), body: lines.slice(dividerIdx) };
  let i = 0;
  while (i < lines.length && !/\bG[123]\b/i.test(lines[i].replace(/^N\d+\s*/, '').replace(/[;(].*/, ''))) i++;
  return { header: lines.slice(0, i), body: lines.slice(i) };
}

// Modální skupiny sledované při spojování – pro každý rozpoznaný kód
// na řádku hlavičky vrátí dvojici [klíč, hodnota] použitou k porovnání
// se stavem z předchozích programů.
export const HEADER_GROUP_PATTERNS = [
  ['plane',    /\bG1[789]\b/i],
  ['absinc',   /\bG9[01]\b/i],
  ['coordsys', /\bG5[4-7]\b|\bG505\b|\bG53\b/i],
  ['feedmode', /\bG9[45]\b/i],
  ['spmode',   /\bG9[67]\b/i],
  ['lims',     /\bLIMS=([\d.]+)/i],
  ['sval',     /\bS([\d.]+)\b/i],
  ['spdir',    /\bM[34]\b/i],
  ['coolant',  /\bM[89]\b/i],
  ['tool',     /\bT="?[^"\s]+"?|\bT\d+\b/i],
  ['dcorr',    /\bD\d+\b/i],
  ['diamode',  /\bDIAMOF\b|\bRADIUS\b/i],
  ['g75x',     /\bG75\b.*\bX-?[\d.]+/i],
  ['g75z',     /\bG75\b.*\bZ-?[\d.]+/i],
  // Nájezd do referenčního bodu ostatních systémů (Fanuc G28, Heidenhain G74).
  ['refpoint', /\bG(?:28|30|74)\b/i],
  ['startpos', /^G0\s+(.+)$/i],
];

// Řádky, které se při VÝMĚNĚ NÁSTROJE vypíšou vždy, i když se oproti
// předchozí části nemění: po otočení revolveru musí stroj nejdřív vyjet do
// referenčního/bezpečného bodu, jinak by se nůž vyměnil nad obrobkem.
const TOOL_CHANGE_FORCED = new Set(['g75x', 'g75z', 'refpoint', 'startpos']);

export function classifyHeaderLine(line) {
  const clean = line.replace(/^N\d+\s*/, '').replace(/[;(].*/, '').trim();
  if (!clean) return [];
  const out = [];
  for (const [key, re] of HEADER_GROUP_PATTERNS) {
    const m = clean.match(re);
    if (m) out.push([key, m[1] !== undefined ? m[1] : m[0]]);
  }
  return out;
}

// Přečísluje N-bloky řádků (stejná logika jako menu akce "Přečíslovat
// N-bloky" v editoru) – řádkům bez N-bloku ho přidá, komentáře a prázdné
// řádky nechá beze změny.
export function renumberLines(lines, start = 10, step = 10) {
  let n = start;
  return lines.map(line => {
    const t = line.trim();
    if (!t || t.startsWith(';') || t.startsWith('(')) return line;
    if (/^\s*N\d+/i.test(line)) {
      line = line.replace(/^\s*N\d+/i, 'N' + n);
      n += step;
    } else if (/^[A-Z0-9]/i.test(t) && !t.toUpperCase().startsWith('MSG')) {
      line = 'N' + n + ' ' + line;
      n += step;
    }
    return line;
  });
}

// Spojí pole {name, code} do jednoho programu: u druhého a dalších se
// z hlavičky vypíší jen řádky měnící stav stroje oproti stavu z předchozích
// programů (opakované nastavení se vynechá), závěrečné M30 zůstává jen
// u posledního programu a celý výsledek se na závěr přečísluje N10, N20…
// Mění-li další program nástroj, vypne se na přechodu (kde se M30 vynechává)
// před odjezdem na bezpečnou polohu vřeteno i chlazení a po výměně nástroje a
// doplnění chybějící hlavičky dalšího programu se zase zapnou. Beze změny
// nástroje běží vřeteno i chlazení dál a vynechá se i návrat do startovní
// polohy (zůstane jen výjezd od obrobku).
// Mění-li část NÁSTROJ, vypíše se navíc vždy nájezd do referenčního bodu
// (G75/G28/G74) a startovní bezpečná poloha, i kdyby se oproti předchozí
// části nezměnily — viz TOOL_CHANGE_FORCED.
export function mergePrograms(items, ctrl = null) {
  const dialect = ctrl || detectDialect(items && items[0] && items[0].code);
  const cmt = mergeCmt(dialect);
  const state = {};
  const out = [];
  const isM30 = line => /^(N\d+\s*)?M30\b/i.test(line.replace(/[;(].*/, '').trim());
  // Index posledního skutečného kódového řádku (přeskočí komentáře typu
  // "; --- KONTURA (Pro referenci) ---" za posledním pohybem) – sem se
  // vloží M5/M9 ještě před odjezd na bezpečnou polohu.
  const lastCodeIndex = lines => {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].replace(/[;(].*/, '').trim()) return i;
    }
    return -1;
  };

  // Referenční blok kontury („; --- KONTURA (Pro referenci) ---" a za ním
  // jen komentáře) má na konci každá část. Ve spojeném programu stačí jednou
  // na konci — u „✂ Po úsecích" ho jinak bylo tolikrát, kolik je částí.
  // Různé bloky (např. díra a kontura) zůstanou každý jednou.
  const refs = [];
  const takeRef = (lines) => {
    const i = lines.findIndex((l) => /^\s*[;(]\s*-{2,}.*Pro referenci/i.test(l));
    if (i < 0 || lines.slice(i).some((l) => l.replace(/[;(].*/, '').trim())) return lines;
    const blk = lines.slice(i);
    while (blk.length && !blk[blk.length - 1].trim()) blk.pop();
    const key = blk.join('\n');
    if (!refs.some((r) => r.key === key)) refs.push({ key, blk });
    return lines.slice(0, i);
  };

  // Mění hlavička `header` nástroj (T/D) oproti stavu z předchozích částí?
  const headerChangesTool = (header) => header.some(line =>
    classifyHeaderLine(line).some(([k, v]) => (k === 'tool' || k === 'dcorr') && state[k] !== v));
  const isRapid = (line) => /^(N\d+\s*)?G0?0\b/i.test(line.replace(/[;(].*/, '').trim())
    && !/\bG0?[123]\b/i.test(line.replace(/[;(].*/, '').replace(/^N\d+\s*/, '').replace(/^G0?0\b/i, ''));
  // Vřeteno a chlazení stojí po předchozí části (M5/M9) — znovu zapnout.
  let spindleStopped = false;

  items.forEach((item, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === items.length - 1;
    const { header, body: body0 } = splitHeaderBody(item.code);
    const body = takeRef(body0);

    out.push(cmt(`===== ${item.name} =====`));

    // Nejdřív zjistit, jestli tahle část mění nástroj — pak se nájezd do
    // ref. bodu / bezpečné polohy vypíše i tehdy, když je shodný s předchozí.
    const changesTool = !isFirst && headerChangesTool(header);

    header.forEach(line => {
      if (!line.trim()) return;
      const keys = classifyHeaderLine(line);
      if (!keys.length) {
        if (isFirst) out.push(line);
        return;
      }
      const changed = keys.some(([k, v]) => state[k] !== v);
      const forced = changesTool && keys.some(([k]) => TOOL_CHANGE_FORCED.has(k));
      if (isFirst || changed || forced) {
        // Před výměnou nástroje (M6) musí být STOPRE, jinak by se mohlo
        // předzpracování bloků dostat dál, než stroj fyzicky vymění nástroj.
        // Je to SINUMERIKOVÉ slovo — Fanuc ani Heidenhain ho neznají
        // (a nepotřebují, u obou výměnu synchronizuje samo M6). Podmínka
        // proto zní „JEN sinumerik", ne „všechno kromě fanuca": `ctrl` sem
        // od 16. 9. 2026 chodí i z CNC Editoru (`getControlSystem()`), takže
        // 'heidenhain' je dosažitelná hodnota — `detectDialect` ji sama
        // nikdy nevrátí. Generátor hlaviček to má stejně: „Heidenhain
        // (ISO dialekt): bez STOPRE" (cncEditor.js).
        if (dialect === 'sinumerik' && !isFirst && keys.some(([k]) => k === 'tool' || k === 'dcorr')) out.push('STOPRE');
        keys.forEach(([k, v]) => { state[k] = v; });
        out.push(line);
      }
    });

    if (!isFirst && spindleStopped) {
      const dir = state.spdir || 'M3';
      out.push(`${dir} ${cmt(SPINDLE_CMT[dir.slice(1)] || 'Vřeteno ZAP')}`);
      out.push(`M8 ${cmt('Chlazení ZAP')}`);
    }

    const bodyLines = isLast ? body : body.filter(l => !isM30(l));
    if (!isLast && headerChangesTool(splitHeaderBody(items[idx + 1].code).header)) {
      const stopLines = [`M5 ${cmt('Vřeteno STOP')}`, `M9 ${cmt('Chlazení VYP')}`];
      const ci = lastCodeIndex(bodyLines);
      if (ci >= 0) bodyLines.splice(ci, 0, ...stopLines);
      else bodyLines.push(...stopLines);
      spindleStopped = true;
    } else if (!isLast) {
      // Stejný nůž (např. „✂ Po úsecích"): vřeteno i chlazení běží dál a
      // nejede se zpět do startovní polohy — z koncových rychloposuvů odpadne
      // jen poslední (návrat druhé osy do startovní polohy) a další část
      // najede rovnou na svůj první průchod, jako by šlo o další průchod téže
      // operace. Výjezd nad konturu zůstává VŽDY: dřív zůstal jen první
      // koncový rychloposuv, a když to byl odskok od stěny (`G0 Z137.050`,
      // karusel 5. 11. 2026), výjezd `G0 Z520` zmizel a další část jela
      // rychloposuvem skrz díl.
      let ci = lastCodeIndex(bodyLines);
      const rapids = [];
      while (ci >= 0 && isRapid(bodyLines[ci])) {
        rapids.unshift(ci);
        do { ci--; } while (ci >= 0 && !bodyLines[ci].replace(/[;(].*/, '').trim());
      }
      if (rapids.length >= 2) bodyLines.splice(rapids[rapids.length - 1], 1);
      spindleStopped = false;
    }
    bodyLines.forEach(line => out.push(line));
  });
  refs.forEach((r) => out.push(...r.blk));

  return renumberLines(out, 10, 10).join('\n');
}
