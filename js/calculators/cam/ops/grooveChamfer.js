// Sražení hran zápichu 45° — dokončovací dráha (pravidlo 17, doplnění
// „sražení" schválil uživatel 23. 10. 2026; platí vnějšímu zápichu
// i zápichu v díře, pravidlo 13).
//
// Hrubovací zápichy se nemění. Dokončení místo „bok → dno → bok" jede
//   sražení 45° z povrchu na první bok → bok → dno → druhý bok → sražení
//   45° zpátky na povrch.
// Souřadnice zápichu (společné vnějšímu i vnitřnímu):
//   u = podél osy od boku A (Z upich / bok u ústí) k boku B, d = hloubka od
//   povrchu do materiálu (0 = povrch: vnější = Start X, v díře = stěna díry).
// Destička šířky w s rohy r: jede se středem rohu na straně boku A; výsledek
// je `u` ZAČÁTKU destičky (jako zOfU v generátorech) a `d` středu rohu.
// Ostré vypouklé hrany (sražení × bok) se objedou průsečíkem posunutých
// čar (jako G41 „průsečík") — u hrany nezůstane víc než pár setin.

const SQ2 = Math.SQRT2;

/**
 * @param o { s, uA, uB, w, r, depth, dStart }
 *   s = sražení (odvěsna 45°), uA/uB = hotové boky (s Přídavkem Z),
 *   depth = hloubka dna (hotové), dStart = d středu rohu na začátku a konci
 *   (nad povrchem, záporné)
 * @returns {{ok:boolean, reason?:string, pts?:{u:number, d:number}[]}}
 */
export function chamferFinishPath({ s, uA, uB, w, r, depth, dStart }) {
  const W = uB - uA;
  if (!(s > 0)) return { ok: false, reason: 'Sražení není zadané.' };
  if (!(2 * s < W - 1e-9)) return { ok: false, reason: `Sražení ${s} mm se na zápich ${W.toFixed(2)} mm nevejde (2 × sražení musí být menší než šířka).` };
  if (!(s < depth - 1e-9)) return { ok: false, reason: `Sražení ${s} mm není menší než hloubka zápichu ${depth.toFixed(2)} mm.` };
  // Roh na boku A (střed): sražení A je u − d = uA − s, posunuté o r do zápichu.
  const dJ = r + s - r * SQ2;                 // sražení × bok (střed rohu)
  if (!(dJ < depth - r - 1e-9)) return { ok: false, reason: `Sražení ${s} mm je s rádiusem destičky na hloubku zápichu moc velké.` };
  const off = w - 2 * r;                      // roh B = roh A + (w − 2r)
  const uLastA = uB - r - off;                // roh A, když je roh B na boku B
  const pA = (uCorner, d) => ({ u: uCorner - r, d });            // začátek destičky
  const pB = (uCornerB, d) => ({ u: uCornerB - off - r, d });
  return {
    ok: true,
    pts: [
      pA(uA - s + r * SQ2 + dStart, dStart),  // nad povrchem na čáře sražení A
      pA(uA + r, dJ),                         // sražení A → bok A
      pA(uA + r, depth - r),                  // bok A → dno
      { u: uLastA - r, d: depth - r },        // po dně k boku B
      pB(uB - r, dJ),                         // bok B → sražení B
      pB(uB + s - r * SQ2 - dStart, dStart),  // po sražení B nad povrch
    ],
  };
}
