// The sole plate on each bearing and its anchor rods, AASHTO LRFD 10th Edition 14.8 with CDOT BDM 14.5:
//  - the plate: 2 in longer than the bearing (CDOT), as wide as the flange plus the anchor rods' clearances (or
//    2 in wider than the bearing and flange without rods), at least 3/4 in at its thin edge (CDOT), thick enough
//    to cantilever past the flange over the bearing's pressure (6.12.2.2.1-like plate bending, φf 1.0); tapered
//    where the girder's underside slopes more than 0.01 rad under the permanent load (14.8.2);
//  - its fillet welds to the flange for the horizontal force at the strength limit state (14.8.1, 6.13.3.2.4b);
//  - the anchor rods (14.8.3): ASTM F1554 in shear (6.13.2.12, φs 0.75); the concrete's shear breakout toward the
//    seat's edge and pryout (5.13, ACI 318 Chapter 17), cast-in headed rods, cracked concrete, no supplementary bars;
//  - the horizontal forces: the design wind across (Strength III, V with the wind on the live load), braking along
//    at fixed bearings (3.6.4), and the seismic connection force of Zone 1 (3.10.9.2): 0.15 or 0.25 of the
//    permanent reaction, across at every bearing and along at the fixed ones (the unit's whole permanent load).
//  - at the piers, hairpins around each bolt as anchor reinforcement for shear toward the cap's face (ACI 318-19
//    17.5.2.1, 17.7.2.5.1 by AASHTO 5.13): φ 0.75 × the legs' As fy in place of the concrete's breakout, each leg
//    developed past the bolt (AASHTO 5.10.8.2.1, epoxy coated) and the bend within 0.5 ca1 of it; a set toward each
//    face, as braking and the earthquake reverse.
// Inches, kips, ksi.

import { bar } from "../stm/aashto";
import { development } from "../stm/anchorage";

export type SoleInputs = {
  check: boolean;
  padL: number; // in, the bearing along the girder
  padW: number; // in, across
  Fy: number; // ksi, the sole plate
  weld: number; // in, fillets to the flange
  grade: number; // %, the girder's profile grade at the bearings (adds to the end slope for the taper)
  AS: number; // the acceleration coefficient for Zone 1 (3.10.9.2), from the geotechnical report; 0: not checked
  fixed: "piers" | "abutments" | "all"; // the bearings restrained along the girder (the rest slotted)
  hairpins: { use: boolean; bar: number; fy: number }; // anchor reinforcement at the pier bolts: hairpins of #bar at least (larger or two per bolt as needed), Grade fy
  anchors: { use: boolean; n: number; d: number; grade: "A449" | 36 | 55 | 105; hef: number; edge: number; fc: number }; // grade: ASTM A449 (CDOT 512.02, the default) or F1554 36, 55, 105; // per bearing, at least n rods of d in (more or larger as needed: 2, 4 or 6 rods, up to 2 in); embedment and the edge distance toward the seat's face (in); the substructure's f'c (ksi)
};

export const SOLE_DEFAULTS: SoleInputs = { check: true, padL: 14, padW: 16, Fy: 50, weld: 0.3125, grade: 0, AS: 0, fixed: "piers", hairpins: { use: true, bar: 5, fy: 60 }, anchors: { use: true, n: 2, d: 1, grade: "A449", hef: 15, edge: 18, fc: 4.5 } };

/** F1554 anchor rods' tensile strength (ksi). */
export const F1554_FU: Record<number, number> = { 36: 58, 55: 75, 105: 125 };
/** An anchor bolt's tensile strength (ksi): ASTM A449 by diameter (120 to 1 in, 105 to 1 1/2 in, 90 above), or F1554's grade. */
export const anchorFu = (grade: SoleInputs["anchors"]["grade"], d: number) => (grade === "A449" ? (d <= 1 + 1e-9 ? 120 : d <= 1.5 + 1e-9 ? 105 : 90) : (F1554_FU[grade] ?? 75));

export type SoleSupport = {
  label: string;
  pier: boolean; // an interior support (where the hairpins go)
  X: number; // ft
  fixed: boolean; // restrained along the girder
  bf: number; // in, the bottom flange
  tf: number;
  Rperm: number; // kip per bearing, DC + DW, unfactored
  Ru: number; // kip per bearing, Strength I
  Hwind: number; // kip per bearing, across, factored
  Hbrake: number; // kip per bearing, along, factored (fixed bearings)
  Hseis: { across: number; along: number }; // kip per bearing, Extreme Event I (γ = 1.0)
  slope: number; // rad, the girder's underside at the bearing under the permanent load (with the grade)
};

export type SoleCheck = { name: string; demand: number; capacity: number; unit: string; ref: string };

/** Zone 1's horizontal connection force factor (3.10.9.2): 0.15 below AS 0.05, else 0.25; 0 when not checked. */
export const connectionFactor = (AS: number) => (AS > 0 ? (AS < 0.05 ? 0.15 : 0.25) : 0);

/** One bearing's sole plate and anchor rods, designed and checked: the fewest and smallest rods (at least those given) that pass. */
export function designSole(i: SoleInputs, s: SoleSupport) {
  if (!i.anchors.use || !(i.anchors.n > 0)) return solePlate(i, s);
  const ns = [2, 4, 6].filter((n) => n >= i.anchors.n);
  const ds = [0.75, 0.875, 1, 1.25, 1.5, 1.75, 2].filter((d) => d >= i.anchors.d - 1e-9);
  let last: ReturnType<typeof solePlate> | null = null;
  for (const d of ds.length ? ds : [i.anchors.d])
    for (const n of ns.length ? ns : [i.anchors.n]) {
      const r = solePlate({ ...i, anchors: { ...i.anchors, n, d } }, s);
      last = r;
      if (r.checks.filter((c) => /anchor rods|breakout|pryout|anchor reinforcement/.test(c.name)).every((c) => c.demand <= c.capacity * (1 + 1e-9))) return r;
    }
  return last!; // none passes: the largest tried, its checks failing
}

function solePlate(i: SoleInputs, s: SoleSupport) {
  const checks: SoleCheck[] = [];
  const a = i.anchors;
  const dh = a.d + 0.125 + (a.d >= 1 ? 0.0625 : 0); // anchor rod hole, oversized for setting tolerance
  // Plan: 1 in each way past the bearing along the girder (CDOT 14.5.7); across, the rods outside the flange with
  // 3/4 in to the weld and an edge distance of 2d, or 2 in past the wider of bearing and flange without rods.
  const L = i.padL + 2;
  const gauge = a.use && a.n > 0 ? s.bf + 2 * (0.75 + dh / 2) : 0; // rod line to rod line, across
  const W = Math.ceil(a.use && a.n > 0 ? gauge + 2 * (2 * a.d) : Math.max(i.padW, s.bf) + 2);
  // Bending: the plate past the flange's edge carries the bearing's pressure as a cantilever (φf = 1.0).
  const q = s.Ru / (i.padL * i.padW); // ksi
  const c = Math.max(0, (Math.min(i.padW, W) - s.bf) / 2);
  const Mu = (q * c * c) / 2; // kip·in per in
  const tBend = Math.sqrt((4 * Mu) / (1.0 * i.Fy));
  // Taper (14.8.2): beyond 0.01 rad the plate is beveled to the slope, its thin edge 3/4 in (CDOT 14.5.7).
  const tapered = Math.abs(s.slope) > 0.01;
  const tThin = Math.max(0.75, Math.ceil(tBend * 8) / 8);
  const tThick = tapered ? Math.ceil((tThin + Math.abs(s.slope) * L) * 16) / 16 : tThin;
  checks.push({ name: "thin edge at least 3/4 in (CDOT BDM 14.5.7) and the cantilever past the flange", demand: Math.max(0.75, tBend), capacity: tThin, unit: "in", ref: "AASHTO 14.8.1, 6.5.4.2" });
  if (tapered) checks.push({ name: `tapered: the underside's slope ${s.slope.toFixed(4)} rad leveled over ${L} in`, demand: Math.abs(s.slope) * L, capacity: tThick - tThin, unit: "in", ref: "AASHTO 14.8.2" });
  // Horizontal forces at the strength and extreme event limit states.
  const across = Math.max(s.Hwind, s.Hseis.across);
  const along = s.fixed ? Math.max(s.Hbrake, s.Hseis.along) : 0;
  const H = Math.hypot(across, along);
  // Welds: two fillets along the flange's edges, the plate's length (6.13.3.2.4b, φe2 0.80, E70).
  const Rw = 2 * L * 0.6 * 0.8 * 70 * 0.707 * i.weld;
  checks.push({ name: `welds to the flange: 2 – ${i.weld} in fillets × ${L} in`, demand: H, capacity: Rw, unit: "kip", ref: "AASHTO 14.8.1, Eq. 6.13.3.2.4b-1" });
  const wmin = Math.max(s.tf, tThin) > 0.75 ? 0.3125 : 0.25; // Table 6.13.3.4-1
  checks.push({ name: "fillet weld at least the minimum size", demand: wmin, capacity: i.weld, unit: "in", ref: "AASHTO Table 6.13.3.4-1" });
  let hairpin = null as null | { size: number; per: number; As: number; R: number; ld: number; legs: number; within: number };
  let rods = null as null | { Ab: number; Fu: number; perRod: number; Rsteel: number; Vcb: number; Vcp: number; ca1: number; s: number };
  if (a.use && a.n > 0) {
    const Ab = (Math.PI * a.d ** 2) / 4;
    const Fu = anchorFu(a.grade, a.d);
    // F1554 anchor rods by Eq. 6.13.2.12-1 (φs 0.75); A449 bolts as bolts with the threads in the shear plane (Eq. 6.13.2.7-2).
    const Rsteel = a.grade === "A449" ? 0.75 * 0.45 * Ab * Fu : 0.75 * 0.5 * Ab * Fu;
    const perRod = H / a.n;
    checks.push({ name: `anchor rods in shear: ${a.n} – ${a.d} in ${a.grade === "A449" ? "ASTM A449" : `ASTM F1554 Grade ${a.grade}`}`, demand: perRod, capacity: Rsteel, unit: "kip", ref: a.grade === "A449" ? "AASHTO 14.8.3.1, Eq. 6.13.2.7-2 (threads included), CDOT 512.02" : "AASHTO 14.8.3.1, Eq. 6.13.2.12-1" });
    // The concrete (ACI 318-19 Chapter 17 by AASHTO 5.13), the rods in a line across at spacing s, sheared toward
    // the seat's edge at ca1; λa = 1, cracked, ψ factors 1 but the edge's; φ 0.70 (no supplementary bars).
    const sqrtFc = Math.sqrt(a.fc * 1000); // psi^0.5
    const ca1 = a.edge;
    const sp = a.n > 1 ? gauge / Math.max(1, a.n - 1) : 0;
    const le = Math.min(a.hef, 8 * a.d);
    const Vb = (Math.min(7 * (le / a.d) ** 0.2 * Math.sqrt(a.d), 9) * sqrtFc * ca1 ** 1.5) / 1000; // kip, Eqs. 17.7.2.2.1a, b
    const Avco = 4.5 * ca1 ** 2;
    const Avc = Math.min(a.n > 1 ? (3 * ca1 + Math.min(sp * (a.n - 1), 3 * ca1 * (a.n - 1))) * 1.5 * ca1 : Avco, a.n * Avco);
    const Vcb = 0.7 * (Avc / Avco) * Vb; // kip, the group, Eq. 17.7.2.1b
    // Pryout: 2 Ncbg (17.7.3), Nb = 24 √f'c hef^1.5 for cast-in rods, the edge's ψed,N.
    const Nb = (24 * sqrtFc * a.hef ** 1.5) / 1000;
    const cmin = Math.min(ca1, 1.5 * a.hef);
    const Anc = (Math.min(sp * (a.n - 1), 3 * a.hef * (a.n - 1)) + 3 * a.hef) * (cmin + 1.5 * a.hef);
    const Anco = 9 * a.hef ** 2;
    const psiEd = cmin < 1.5 * a.hef ? 0.7 + (0.3 * cmin) / (1.5 * a.hef) : 1;
    const Vcp = 0.7 * 2 * (Anc / Anco) * psiEd * Nb;
    const Hc = s.fixed ? along : across; // toward the seat's face: along at fixed bearings, else across (conservative)
    // At a pier with hairpins: their legs carry the shear toward the cap's face in place of the concrete's breakout.
    if (i.hairpins.use && s.pier) {
      const sizes = [3, 4, 5, 6, 7, 8].filter((b) => b >= i.hairpins.bar);
      let pick = null as null | { size: number; per: number; As: number; R: number; ld: number };
      for (const per of [1, 2])
        for (const size of sizes.length ? sizes : [i.hairpins.bar]) {
          const As = a.n * per * 2 * bar(size).area; // both legs of each hairpin
          const R = 0.75 * As * i.hairpins.fy;
          const ld = development({ barSize: size, fy: i.hairpins.fy, fc: a.fc, clearCover: 2, clearSpacing: Math.max(3, sp - bar(size).db), horizontal: true, concreteBelow: 24, coating: "epoxy" }).required;
          const cand = { size, per, As, R, ld };
          if (!pick || (pick.R < Hc && (R >= Hc || R > pick.R))) pick = cand;
          if (R >= Hc) break;
        }
      const hp = pick!;
      hairpin = { ...hp, legs: Math.ceil(hp.ld + 0.5 * ca1), within: 0.5 * ca1 };
      checks.push({ name: `anchor reinforcement: ${a.n * hp.per} hairpins of #${hp.size} each way (${hp.per} a bolt toward each face, the shear reverses), Grade ${i.hairpins.fy}, legs ${hairpin.legs} in`, demand: Hc, capacity: hp.R, unit: "kip", ref: "AASHTO 5.13.2, ACI 318-19 17.5.2.1, 17.7.2.5.1 (φ 0.75)" });
    } else checks.push({ name: `concrete breakout in shear toward the seat's edge (ca1 ${ca1} in)`, demand: Hc, capacity: Vcb, unit: "kip", ref: "AASHTO 5.13.2, ACI 318-19 17.7.2" });
    checks.push({ name: `concrete pryout (hef ${a.hef} in)`, demand: H, capacity: Vcp, unit: "kip", ref: "AASHTO 5.13.2, ACI 318-19 17.7.3" });
    checks.push({ name: "rod edge distance on the plate at least 2d", demand: 2 * a.d, capacity: (W - gauge) / 2, unit: "in", ref: "AASHTO 14.8.3.1" });
    rods = { Ab, Fu, perRod, Rsteel, Vcb, Vcp, ca1, s: sp };
  }
  // The bearing itself and the concrete under it are the bearing tool's (14.7, 5.6.5).
  return { ...s, hairpin, n: a.use ? a.n : 0, d: a.d, L, W, gauge, tBend, tThin, tThick, tapered, q, c, across, along, H, Rw, rods, checks };
}

export type SoleResult = ReturnType<typeof designSole>;
