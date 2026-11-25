// Uzavírací vrstvy na dně a na plošinách (vyňato z roughLong.js, audit CAM
// 25. 11. 2026 — zákaz růstu obřích souborů). Pravidlo 3: poslední vrstva se
// udělá vždy, na dně ani na schodu nesmí zůstat víc než přídavek.

// Dna mezi hloubkou `currentX` a poslední vrstvou (`lastDepthWithPasses`),
// která leží pod průchody té vrstvy: VODOROVNÉ úseky offsetové dráhy
// a nejnižší body vydutých oblouků. Hloubka jde o 0,02 mm nad dno: přesně
// na něm leží vodorovná čára skenu na hraně oblasti dílce. Projdou celou
// běžnou cestou — vjezd, řetěz ramp, držák. Nález uživatele 26. 9. 2026
// (R 10, úsek 2): vrstva X 19,409 nad dnem X 19,243 a drážka X 17,244 —
// „vynechává poslední vrstvu, když nemá hloubku ap". Polygon ji dělá
// (uzavírací krok řetězu), kulatá ne; polygon má uzavírání vlastní a jeho
// otisk se nemá hnout.
// `bowl`: jen dna v MISCE — z obou stran stoupá offset až k poslední
// vrstvě (nebo k hranici úseku), takže je hlubší vrstva nemůže objet
// dojezdem. Okno dna = souvislé Z kolem dna, kde hloubka `currentX`
// NEPROJDE (offset nad ní).
export function collectFloorsAt({ currentX, regZLo, regZHi, bowl, passes, regionMark, lastDepthWithPasses, offsetXAt, offsetPath, floorsDone, dzScan }) {
  const prevSpans = [];
  for (let i = regionMark; i < passes.length; i++) {
    const q = passes[i];
    if (q && q.type === 'long' && Math.abs(q.x - lastDepthWithPasses) < 1e-6
        && Number.isFinite(q.zStart) && Number.isFinite(q.zEnd))
      prevSpans.push({ lo: Math.min(q.zStart, q.zEnd), hi: Math.max(q.zStart, q.zEnd) });
  }
  const h = 0.25;
  const side = (z0, dir) => {
    // +1 stěna (až k poslední vrstvě / hranice úseku), −1 propad pod
    // `currentX`, a konec okna.
    let z = z0;
    for (let k = 0; k < 4000; k++) {
      const zn = z + dir * h;
      if (zn < regZLo || zn > regZHi) return { wall: true, edge: dir > 0 ? Math.min(zn, regZHi) : Math.max(zn, regZLo) };
      const x = offsetXAt(zn);
      if (x === null || !(x > currentX + 1e-3)) return { wall: false, edge: zn };
      if (x >= lastDepthWithPasses - 1e-3) return { wall: true, edge: zn };
      z = zn;
    }
    return { wall: false, edge: z };
  };
  const floors = [];
  const addFloor = (F, zA, zB) => {
    if (!(F > currentX + 0.05 && F < lastDepthWithPasses - 0.1)) return;
    if (floorsDone.has(F.toFixed(4))) return;
    if (!prevSpans.some(sp => sp.lo < zB && sp.hi > zA)) return;
    const lo = side(zA, -1), hi = side(zB, +1);
    if (bowl && !(lo.wall && hi.wall)) return;
    const w = { lo: lo.edge, hi: hi.edge, hiWall: hi.wall };
    const old = floors.find(f => Math.abs(f.F - F) < 1e-3);
    if (old) old.wins.push(w);
    else floors.push({ F, wins: [w] });
  };
  for (const sg of offsetPath || []) {
    if (!sg.p1 || !sg.p2) continue;
    if (sg.type === 'line') {
      if (Math.abs(sg.p1.x - sg.p2.x) > 1e-6) continue;
      const zA = Math.max(Math.min(sg.p1.z, sg.p2.z), regZLo), zB = Math.min(Math.max(sg.p1.z, sg.p2.z), regZHi);
      if (zB - zA < dzScan) continue;
      addFloor(sg.p1.x + 0.02, zA, zB);
      continue;
    }
    // ── DNO V OBLOUKU (kruhové vybrání, 26. 9. 2026) ─────────────────────
    // Vydutý oblouk má nejnižší bod UVNITŘ (sin úhlu = −1). Žebřík po `ap`
    // ho podjede a nad ním zůstane čočka až skoro `ap` silná. Vrstva
    // o 0,02 mm nad nejnižším bodem je krátká; celé dno pak objede nájezd
    // a dojezd po kontuře jako u každé kapsy.
    if (sg.type !== 'arc' || !Number.isFinite(sg.startAngle) || !Number.isFinite(sg.endAngle)
        || !Number.isFinite(sg.cx) || !Number.isFinite(sg.cz) || !(sg.r > 0)) continue;
    const a0 = Math.min(sg.startAngle, sg.endAngle), a1 = Math.max(sg.startAngle, sg.endAngle);
    let aMin = null;
    for (let k = -2; k <= 2 && aMin === null; k++) {
      const a = -Math.PI / 2 + 2 * Math.PI * k;
      if (a > a0 + 1e-6 && a < a1 - 1e-6) aMin = a;
    }
    if (aMin === null) continue;
    const zBot = sg.cz + Math.cos(aMin) * sg.r;
    if (!(zBot > regZLo && zBot < regZHi)) continue;
    addFloor(sg.cx - sg.r + 0.02, zBot, zBot);
  }
  floors.sort((a, b) => b.F - a.F);
  return floors;
}

// ── PLOŠINA NA ZAČÁTKU VRSTVY (audit CAM 25. 11. 2026, pravidlo 3) ──────────
// Plošina (osazení) mezi poslední vrstvou a hloubkou `currentX`, za jejímž
// začátkem (strana, odkud vrstva jede) kontura spadne a tahle hloubka tam už
// nemá materiál: vrstva na plošinu nepřijede, dojezd „bez schodků" ji neobjede
// (jede až na konci vrstvy) a hlubší vrstvy stoupají dojezdem nejvýš na tuhle
// hloubku. Nad plošinou by zůstal pás až ap silný (part-13-zleva-flange:
// plošina X85,02 Z0–38, vrstvy 90,922 → 85,922, zbytek 4,6 mm). Vrací dna
// (z `collectFloorsAt`, bowl = false), pro která se PŘED `currentX` vloží
// uzavírací vrstva jen v okně plošiny — jako dno misky.
//
// Podmínky okna: začátek není stěna a za ním tahle hloubka materiál nemá;
// za koncem plošiny díl pod touto hloubkou pokračuje (aspoň 2 ap) — jinak je
// plošina dnem úseku (konec dílu je jen čelo) a uzavře ji poslední hloubka
// žebříku jako dřív (cam-real-stock-layers). Plošinu, na kterou padne některá
// další hloubka žebříku, vezme ta.
export function plateauFloors(floors, { currentX, sz, regZLo, regZHi, offsetXAt, step, dzScan, depths, depthIdx }) {
  const startEdge = Math.min(sz.zMax, regZHi), endEdge = Math.max(sz.zMin, regZLo);
  const partGoesOn = (zLo) => {
    let len = 0;
    for (let z = zLo - 0.25; z > endEdge; z -= 0.25) {
      const x = offsetXAt(z);
      if (x === null || !(x < currentX)) break;
      len += 0.25;
    }
    return len >= Math.max(3, 2 * step);
  };
  return floors
    .map(f => ({ F: f.F, wins: f.wins.filter(w => !w.hiWall && startEdge <= w.hi + dzScan && partGoesOn(w.lo)).map(w => {
      // Konec jen kousek za plošinou (offset o 0,1 pod ní): dál po spádu
      // kontury vrstva neřeže nic, jen by skončila uprostřed materiálu,
      // který bere tahle hloubka (pravidlo 4). Zbytek dojede sjezd po kontuře
      // (`attachPlateauDescent`) až na `dropTo`.
      let z = w.lo;
      while (z + 0.05 < w.hi) { const x = offsetXAt(z); if (x !== null && x >= f.F - 0.12) break; z += 0.05; }
      return { ...w, lo: z, dropTo: w.lo };
    }) }))
    .filter(f => f.wins.length > 0 && !depths.slice(depthIdx).some(d => Math.abs(d - f.F) < 0.15));
}

// Uzavírací vrstva plošiny končí sjezdem po kontuře na hloubku pod sebou:
// rovně by skončila uprostřed materiálu, který bere ta hloubka (pravidlo 4),
// po kontuře jí předá vrstvu po stěně (pravidlo 10, bod 1).
export function attachPlateauDescent(passes, passMark, currentX, fWins, traceOffsetPath) {
  for (let i = passMark; i < passes.length; i++) {
    const q = passes[i];
    if (!q || q.type !== 'long' || Math.abs(q.x - currentX) > 1e-6 || q.contourLeadOut || !Number.isFinite(q.zEnd)) continue;
    const w = fWins.find(v => Number.isFinite(v.dropTo) && Math.abs(q.zEnd - v.lo) < 0.06 && v.lo - v.dropTo > 0.05);
    if (!w) continue;
    const lo = traceOffsetPath(q.zEnd, w.dropTo);
    if (lo && lo.length > 0) { q.contourLeadOut = lo; q.blocked = true; }
  }
}
