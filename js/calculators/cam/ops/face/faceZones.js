// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – KDE čelní hrubování něco vynechalo (zóny k varováním)   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Čelní obdoba ops/long/skipZones.js (audit CAM 28. 11. 2026). Hlídání
// destičky, hloubky vrstev, zanoření a držáku čelní průchody ZKRACUJÍ
// (zvednou `xEnd`) nebo VYNECHÁVAJÍ a varování neslo jen počet. Kontrola
// pravidel (scripts/cam_rules_check.mjs) tak zbytek na dně, který generátor
// vědomě nechal, nedokázala odlišit od chybějící vrstvy.
//
// Čelní vrstva stojí na Z a bere pás k OBROBENÉ straně (zprava +Z) až
// k sousední vrstvě, nejvýš krok. Zkrácený/vynechaný průchod tedy nechá
// zbytek v Z-pásu `[z, z + směr·šířka]` a v rozsahu X, který nepojede
// (zkrácený: staré → nové dno, vynechaný: dno → začátek). Zóna
// `{zLo, zHi, x, xLo, xHi}` — `xLo/xHi` má jen čelní; kontrola čelní
// zbytek měří po X (prohozené osy), proto ho páruje podle `xLo/xHi`
// a pás Z jen ověří proti výšce zbytku.
//
// Použití: `const fz = makeFaceZones(passes, faceLeft, step)`, kolem každého
// hlídání `fz.watch('klíč', () => hlídání())`, na konci `fz.attach(errs, od)`.

// Vlastní `zoneOf` (týž tvar jako ops/long/skipZones.js) — ops/face nesmí
// importovat z ops/long (test cam-insert-isolation).
const r3 = (v) => Math.round(v * 1000) / 1000;
const zoneOf = (z1, z2, x) => ({ zLo: r3(Math.min(z1, z2)), zHi: r3(Math.max(z1, z2)), x: Number.isFinite(x) ? r3(x) : null });

/** Klíč hlídání → poznávací začátek jeho varování. */
const WARN_OF = {
  insert: /^Hlídání (destičky: |upichováku: )/,
  depth: /^Hlídání destičky \(hloubka vrstev\)/,
  descent: /^Zanoření do plného materiálu \(čelně\)/,
  holder: /^Hlídání držáku \(čelně\)/,
};

/**
 * @param {Array<object>} passes  pole průchodů generátoru (mutuje se hlídáním)
 * @param {boolean} faceLeft
 * @param {number} step           krok vrstev (ap)
 */
export function makeFaceZones(passes, faceLeft, step) {
  const dirM = faceLeft ? -1 : 1;
  const zones = { insert: [], depth: [], descent: [], holder: [] };
  const faces = () => passes.filter(p => p && p.type === 'face' && Number.isFinite(p.z));

  /** Pás, který bere vrstva na `z`: k nejbližší vrstvě na obrobené straně, nejvýš krok. */
  const bandOf = (z, zs) => {
    let w = step;
    for (const q of zs) {
      const d = dirM * (q - z);
      if (d > 1e-4 && d < w) w = d;
    }
    return [z, z + dirM * w];
  };

  /**
   * Spustí hlídání a zapíše zóny průchodů, které zmizely nebo se zkrátily.
   * @param {keyof typeof zones} key
   * @param {() => any} fn
   */
  function watch(key, fn) {
    const before = faces().map(p => ({ p, xEnd: p.xEnd }));
    const zs = before.map(b => b.p.z);
    const out = fn();
    const alive = new Set(passes);
    for (const b of before) {
      const gone = !alive.has(b.p);
      if (!gone && !(b.p.xEnd > b.xEnd + 0.05)) continue;
      const [z1, z2] = bandOf(b.p.z, zs);
      const xA = b.xEnd, xB = gone ? b.p.xStart : b.p.xEnd;
      if (!Number.isFinite(xA) || !Number.isFinite(xB)) continue;
      zones[key].push({ ...zoneOf(z1, z2, gone ? null : b.p.xEnd), xLo: r3(Math.min(xA, xB)), xHi: r3(Math.max(xA, xB)) });
    }
    return out;
  }

  /** Tentýž průchod zkrácený víc hlídáními (dvě volání) → jedna zóna na pás, nejširší X. */
  function merged(list) {
    const by = new Map();
    for (const z of list) {
      const k = `${z.zLo}|${z.zHi}`, o = by.get(k);
      if (!o) { by.set(k, { ...z }); continue; }
      o.xLo = Math.min(o.xLo, z.xLo); o.xHi = Math.max(o.xHi, z.xHi);
      o.x = (o.x === null || z.x === null) ? null : Math.max(o.x, z.x);
    }
    return [...by.values()].sort((a, b) => a.zLo - b.zLo);
  }

  /**
   * Připojí zóny k varováním hlídání, která přibyla od indexu `from`.
   * Text varování se nemění.
   * @param {Array<object|string>} foundErrors
   * @param {number} from
   */
  function attach(foundErrors, from) {
    for (const key of Object.keys(WARN_OF)) {
      if (!zones[key].length) continue;
      const zs = merged(zones[key]);
      for (let i = from; i < foundErrors.length; i++) {
        const e = foundErrors[i];
        if (e && typeof e === 'object' && typeof e.msg === 'string' && WARN_OF[key].test(e.msg)) e.zones = zs;
      }
    }
  }

  return { watch, attach, zones };
}
