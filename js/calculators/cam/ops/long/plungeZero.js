// ╔══════════════════════════════════════════════════════════════╗
// ║  0° = BEZ ZANOŘOVÁNÍ — dodatečný filtr podélného hrubování    ║
// ╚══════════════════════════════════════════════════════════════╝
// Úhel zanoření ručně 0° (pravidlo 6, schváleno 11. 11. 2026; nález uživatele
// 28. 9. 2026 „0° mi nešlo nastavit"). Brány přímo v generátoru (kapsy,
// rampy za strmou stěnou, vjezd na umělé hranici — `plungeDisabled()` v
// camMath.js, openPass.js, pocketPass.js, roughLong.js) berou zanoření
// samotné. Tenhle filtr běží po všech regionech a bere zbytek: sjíždění PO
// KONTUŘE (dojezd přes hrb dolů, nájezd po kontuře do kapsy), vjezd pod
// šikmým čelem odlitku a dvojitou třísku hlubší vrstvy tam, kde mělčí vypadla.
//
// Vyňato z původního commitu 74e12308 (větev claude/cool-heisenberg) beze
// změny logiky; roughLong.js nesmí růst, proto samostatný modul.

/** Bod dráhy v poměru t ∈ ⟨0, 1⟩ (oblouk podle úhlu, úsečka lineárně). */
function sampleX(g, t) {
  if (g.type === 'arc' && Number.isFinite(g.startAngle) && Number.isFinite(g.endAngle)) {
    const a = g.startAngle + (g.endAngle - g.startAngle) * t;
    return { x: g.cx + Math.sin(a) * g.r, z: g.cz + Math.cos(a) * g.r, a };
  }
  return { x: g.x1 + (g.x2 - g.x1) * t, z: g.z1 + (g.z2 - g.z1) * t };
}

/** Kus dráhy do prvního místa, kde začne klesat k ose (null = neklesá). */
function upToDescent(segs) {
  for (let k = 0; k < segs.length; k++) {
    const g = segs[k];
    const n = Math.max(4, Math.ceil(Math.hypot(g.x2 - g.x1, g.z2 - g.z1) / 0.2));
    let prev = sampleX(g, 0);
    for (let j = 1; j <= n; j++) {
      const q = sampleX(g, j / n);
      if (q.x < prev.x - 1e-4) {
        const out = segs.slice(0, k);
        if (j > 1) {
          const cut = { ...g, x2: prev.x, z2: prev.z };
          if (prev.a !== undefined) cut.endAngle = prev.a;
          out.push(cut);
        }
        return out;
      }
      prev = q;
    }
  }
  return null;
}

/**
 * Vynechá / zkrátí průchody vydané od `passesAtStart`, které by se do
 * materiálu zanořily. Volat jen při `plungeDisabled(prms)`.
 * @param D { passes, passesAtStart, skipCounters, step, noseLiftL,
 *   offsetStockTopXAtZ, blockedAt, T } — T = makeDepthTabs (capTab,
 *   newFloorTab, stockTopTab, notePassInto, capZ0, DZ_CAP)
 */
export function applyPlungeZero(D) {
  const { passes, passesAtStart, skipCounters, step, noseLiftL, offsetStockTopXAtZ, blockedAt, T } = D;
  const { capTab, newFloorTab, stockTopTab, notePassInto } = T;
  for (let i = passes.length - 1; i >= passesAtStart; i--) {
    const p = passes[i];
    if (!p || p.type !== 'long' || !Number.isFinite(p.x)) continue;
    const li = Array.isArray(p.contourLeadIn) ? p.contourLeadIn : [];
    const liDown = li.length > 0 && li.some(g => Math.min(g.x1, g.x2) < Math.max(g.x1, g.x2) - 0.05)
      && li[0].x1 > p.x + 0.05;
    const offDrop = !!p.__plungeOffDrop;
    delete p.__plungeOffDrop;
    if ((p.ramp && p.ramp.x0 > p.x + 0.01) || liDown || offDrop) {
      passes.splice(i, 1);
      skipCounters.plungeOff++;
      continue;
    }
    // Otevřený průchod, jehož začátek leží pod šikmým čelem polotovaru:
    // emise by k němu sjela svisle posuvem skrz kraj polotovaru (part-13-
    // zleva-flange s 0°: `G1 X86.137` 5,8 mm). Začátek se posune proti
    // směru řezu na první místo, kde je nad hloubkou vzduch (celou šířkou
    // nosu) — vjede se vodorovně. Když takové místo do 30 mm není, nebo
    // by cesta vedla konturou, průchod se vynechá.
    if (!p.ramp && li.length === 0 && Number.isFinite(p.zStart) && Number.isFinite(p.zEnd)) {
      const back = p.zEnd > p.zStart ? -1 : 1;
      const inStock = (z) => {
        for (let dz = -noseLiftL; dz <= noseLiftL + 1e-9; dz += Math.max(noseLiftL / 4, 0.25)) {
          const t = offsetStockTopXAtZ(z + dz);
          const lift = noseLiftL > 0 ? Math.sqrt(Math.max(noseLiftL * noseLiftL - dz * dz, 0)) : 0;
          if (t !== null && t + lift > p.x + 0.05) return true;
        }
        return false;
      };
      if (inStock(p.zStart)) {
        let z = p.zStart, ok = false;
        for (let d = 0.25; d <= 30; d += 0.25) {
          z = p.zStart + back * d;
          if (blockedAt(p.x, z)) break;
          if (!inStock(z)) { ok = true; break; }
        }
        if (!ok) { passes.splice(i, 1); skipCounters.plungeOff++; continue; }
        p.zStart = z;
      }
    }
    if (Array.isArray(p.contourLeadOut) && p.contourLeadOut.length > 0) {
      const cut = upToDescent(p.contourLeadOut);
      if (cut !== null) {
        if (cut.length > 0) p.contourLeadOut = cut;
        else delete p.contourLeadOut;
      }
    }
  }
  // VYNECHANÁ VRSTVA NESMÍ PŘEJÍT NA HLUBŠÍ (pravidlo 3). Kde mělčí vrstva
  // vypadla (šla by jen zanořením), hlubší vrstva vjela ze vzduchu jinde a
  // přes její místo jela dvojitou třískou (part-1 s 0°: 6 mm při ap 3).
  // Model podlahy v POŘADÍ OBRÁBĚNÍ: průchod končí tam, kde by nad ním
  // stálo víc než jedna vrstva; začíná-li tam, vynechá se.
  if (!capTab) return;
  const tab = newFloorTab();
  const topAt = (z) => {
    const t = stockTopTab(z);
    if (t === null) return null;
    const k = Math.round((z - T.capZ0) / T.DZ_CAP);
    const c = k >= 0 && k < tab.length ? tab[k] : Infinity;
    return Math.min(t, c - noseLiftL);
  };
  for (let i = passesAtStart; i < passes.length; i++) {
    const p = passes[i];
    if (p && p.type === 'long' && Number.isFinite(p.x) && Number.isFinite(p.zStart) && Number.isFinite(p.zEnd)
        && !p.ramp && !(p.contourLeadIn && p.contourLeadIn.length)) {
      const dir = p.zEnd > p.zStart ? 1 : -1, len = Math.abs(p.zEnd - p.zStart);
      let cutAt = null;
      for (let d = 0; d <= len + 1e-9; d += T.DZ_CAP) {
        const z = p.zStart + dir * d, t = topAt(z);
        if (t !== null && t - (p.x - noseLiftL) > step + 0.1) { cutAt = z; break; }
      }
      if (cutAt !== null) {
        if (Math.abs(cutAt - p.zStart) < 1) { passes.splice(i, 1); i--; skipCounters.plungeOff++; continue; }
        p.zEnd = cutAt - dir * 0.5; p.blocked = false;
        delete p.contourLeadOut; delete p.noRetract;
      }
    }
    // Totéž pro dojezd po kontuře: po dně za vynechanou vrstvou by jel
    // plnou výškou zbytku (part-1 s 0°: 11 mm po X 25,911).
    if (p && p.type === 'long' && Array.isArray(p.contourLeadOut) && p.contourLeadOut.length > 0) {
      const lo = p.contourLeadOut;
      let cut = null;
      for (let k = 0; k < lo.length && cut === null; k++) {
        const g = lo[k];
        const n = Math.max(2, Math.ceil(Math.hypot(g.x2 - g.x1, g.z2 - g.z1) / T.DZ_CAP));
        let prev = sampleX(g, 0);
        for (let j = 0; j <= n; j++) {
          const q = sampleX(g, j / n), t = topAt(q.z);
          if (t !== null && t - (q.x - noseLiftL) > step + 0.1) {
            const keep = lo.slice(0, k);
            if (j > 0) {
              const part = { ...g, x2: prev.x, z2: prev.z };
              if (prev.a !== undefined) part.endAngle = prev.a;
              keep.push(part);
            }
            cut = keep;
            break;
          }
          prev = q;
        }
      }
      if (cut !== null) {
        if (cut.length > 0) p.contourLeadOut = cut; else delete p.contourLeadOut;
        delete p.noRetract;
      }
    }
    notePassInto(tab, p);
  }
}

/** Hlášení vynechaných vrstev do ⚠ panelu. */
export function plungeZeroWarning(skipCounters, foundErrors) {
  const n = skipCounters.plungeOff;
  if (!(n > 0)) return;
  const phrase = n === 1 ? '1 vrstva vynechána' : (n < 5 ? `${n} vrstvy vynechány` : `${n} vrstev vynecháno`);
  foundErrors.push({ type: 'warning', msg: `Zanořování vypnuté (úhel 0°): ${phrase} — do materiálu by se muselo zanořit. Materiál zůstává pro dokončování.` });
}
