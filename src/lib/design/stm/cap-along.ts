import type { Check } from "../walls/cip";
import { bar } from "./aashto";
import type { StmTemplate } from "./templates";

// The loads along the bridge on a standard pier cap (docs/strut-and-tie-model.md, "Loads along the bridge"): braking
// (AASHTO 3.6.4), wind along the bridge (3.8.1.2.3a, 3.8.1.3) and the bearings' temperature force (3.12.2), the pier's
// share, reach the cap at its bearings, across the plane the strut-and-tie model works in. The cap carries them to its
// columns as a beam bent about its vertical axis (a bent's spans continuous on the columns, a hammerhead's arms
// cantilevered from its column), and, standing on its seat above the cap's middle, as torsion into the columns.
// Checked: the bending with the side face's bars (the top and bottom layers' corner bars and the skin bars on that
// face, 5.6.3.2), its shear across the cap (5.7.3.3, the concrete), and the torsion against 0.25 φ Tcr (5.7.2.1), above
// which the closed stirrups take it with the gravity shear's share (5.7.3.6.2, θ 45°). Kip, foot and inch.

export type CapAlong = {
  /** kip, factored: the pier's force along the bridge at the bearings, the governing limit state's (the Bridge sets it). */
  F: number;
  /** What it is, for the check's name. */
  basis?: string;
};

export type CapAlongResult = {
  F: number;
  Fb: number; // each bearing
  M: number; // kip·ft, the largest bending about the vertical axis
  V: number; // kip, the largest shear across the cap
  T: number; // kip·ft, the largest torsion at a column face
  As: number;
  d: number;
  a: number;
  Mr: number;
  Vr: number;
  Tcr: number;
  e: number; // ft, the seat over the cap's middle
  torsion: null | { Ao: number; At: number; Av: number; need: number; have: number };
};

/** The bending, shear and torsion of a standard cap under its loads along the bridge; `Vg` the gravity shear at the column faces (kip, factored), for the stirrups' share. */
export function capAlongChecks(t: StmTemplate, along: CapAlong, bearingsX: number[], grid: { provided: boolean; Ah: number; sh: number }, fc: number, fy: number, Vg: number): { checks: Check[]; result: CapAlongResult } | null {
  const nb = bearingsX.length;
  if (!(along.F > 0) || !nb) return null;
  const Fb = along.F / nb;
  const cols = [...t.columns].sort((p, q) => p - q);
  const half = t.columnWidth / 2;
  // Bending about the vertical axis and shear across: a hammerhead's arms from their tips; a bent's spans as simple
  // spans between column centerlines plus its overhangs cantilevered (the larger of the two, conservative for a
  // continuous beam's spans).
  let M = 0;
  let V = 0;
  const xs = [...bearingsX].sort((p, q) => p - q);
  const left = xs.filter((x) => x < cols[0] - half);
  const right = xs.filter((x) => x > cols[cols.length - 1] + half);
  for (const [arm, face] of [[left, cols[0] - half], [right, cols[cols.length - 1] + half]] as const) {
    M = Math.max(M, arm.reduce((s, x) => s + Fb * Math.abs(x - face), 0));
    V = Math.max(V, arm.length * Fb);
  }
  for (let k = 0; k + 1 < cols.length; k++) {
    const [a, b] = [cols[k], cols[k + 1]];
    const on = xs.filter((x) => x > a && x < b);
    const L = b - a;
    for (const xq of on) {
      const Mx = on.reduce((s, x) => s + (x <= xq ? (Fb * x - Fb * a) * (b - xq) / L : (Fb * (b - x) * (xq - a)) / L), 0);
      M = Math.max(M, Mx);
    }
    V = Math.max(V, on.reduce((s, x) => s + (Fb * (b - x)) / L, 0), on.reduce((s, x) => s + (Fb * (x - a)) / L, 0));
  }
  // The side face's bars: the top and bottom layers' outer bars and the skin bars on the face, at the face's depth.
  const h = t.depth * 12;
  const bw = t.capWidth; // in, the cap's width along the bridge: the section's depth here
  const corner = bar(t.topBars.size).area + bar(t.bottomBars.size).area;
  const skin = grid.provided && grid.sh > 0 ? Math.max(0, Math.floor((h - 2 * t.sideCover) / grid.sh) - 1) * (grid.Ah / 2) : 0;
  const As = corner + skin;
  const d = bw - t.sideCover - bar(t.stirrups.size).db - bar(t.topBars.size).db / 2;
  const a = (As * fy) / (0.85 * fc * h);
  const Mr = (0.9 * As * fy * (d - a / 2)) / 12;
  const dv = Math.max(0.9 * d, 0.72 * bw);
  const Vr = 0.9 * 0.0316 * 2 * Math.sqrt(fc) * h * dv;
  // Torsion: each bearing's force at the seat, e over the cap's middle, into the column faces either side (a span's
  // bearings to the nearer face, an arm's to its column).
  const e = t.depth / 2;
  const T = Math.max(Fb * left.length * e, Fb * right.length * e, ...cols.slice(0, -1).map((c, k) => {
    const mid = (c + cols[k + 1]) / 2;
    return Fb * xs.filter((x) => x > c && x <= mid).length * e;
  }));
  const Acp = bw * h;
  const pc = 2 * (bw + h);
  const Tcr = (0.126 * Math.sqrt(fc) * Acp ** 2) / pc / 12; // kip·ft, K = 1 (Eq. 5.7.2.1-4)
  const checks: Check[] = [];
  const basis = along.basis ? ` (${along.basis})` : "";
  checks.push({ id: "along-flexure", name: `Cap along the bridge: bending about its vertical axis under ${along.F.toFixed(1)} kip at the bearings${basis}, the side face's bars`, demand: M, capacity: Mr, unit: "kip·ft", ok: M <= Mr + 1e-9, ref: "AASHTO 3.6.4, 3.8.1.2.3a, 5.6.3.2" });
  checks.push({ id: "along-shear", name: "Cap along the bridge: shear across it (the concrete)", demand: V, capacity: Vr, unit: "kip", ok: V <= Vr + 1e-9, ref: "AASHTO 5.7.3.3 (β 2)" });
  const neglect = T <= 0.25 * 0.9 * Tcr;
  let torsion: CapAlongResult["torsion"] = null;
  checks.push({ id: "along-torsion", name: `Cap along the bridge: torsion from the seat ${e.toFixed(2)} ft over its middle ${neglect ? "below the threshold, neglected" : "over the threshold: designed for (the closed stirrups)"}`, demand: T, capacity: 0.25 * 0.9 * Tcr, unit: "kip·ft", ok: true, ref: "AASHTO 5.7.2.1" });
  if (!neglect) {
    const st = t.stirrups;
    const db = bar(st.size).db;
    const x0 = bw - 2 * t.sideCover - db;
    const y0 = h - 2 * t.sideCover - db;
    const Ao = 0.85 * x0 * y0;
    const At = (T * 12) / (0.9 * 2 * Ao * fy); // in²/in, one leg
    const dvG = Math.max(0.9 * (h - t.topCover), 0.72 * h);
    const Vc = 0.0316 * 2 * Math.sqrt(fc) * bw * dvG;
    const Av = Math.max(0, (Vg / 0.9 - Vc) / (fy * dvG)); // in²/in, all legs, the gravity shear's share
    const have = (Math.max(2, Math.round(st.legs)) * bar(st.size).area) / st.spacing;
    torsion = { Ao, At, Av, need: Av + 2 * At, have };
    checks.push({ id: "along-torsion-steel", name: `Cap along the bridge: closed stirrups #${st.size} @ ${st.spacing} in for the torsion with the gravity shear`, demand: Av + 2 * At, capacity: have, unit: "in²/in", ok: Av + 2 * At <= have + 1e-9, ref: "AASHTO 5.7.3.6.2 (θ 45°)" });
  }
  return { checks, result: { F: along.F, Fb, M, V, T, As, d, a, Mr, Vr, Tcr, e, torsion } };
}

/** The loads along the bridge on the cap, worked out for the calc package (its own subheading). */
export function capAlongLines(t: StmTemplate, a: CapAlongResult, fc: number, fy: number) {
  type L = { text?: string; style?: "subheading" | "note"; keepWithNext?: boolean; math?: string; ref?: string; unit?: string };
  const out: L[] = [];
  const n3 = (v: number) => (Math.round(v * 1000) / 1000).toString();
  const m = (math: string, ref?: string, unit?: string) => out.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}) });
  out.push({ text: "Loads along the bridge on the cap", style: "subheading", keepWithNext: true });
  out.push({ text: "Method:- the pier's share of the braking (AASHTO 3.6.4), the wind along the bridge (3.8.1.2.3a, 3.8.1.3) and the bearings' temperature force (3.12.2), at the bearings, across the plane the strut-and-tie model works in. The cap carries it to the columns bent about its vertical axis (a hammerhead's arms from their tips; a bent's spans as simple spans between the columns, conservative) with the side face's bars, and as torsion from the seat above its middle.", keepWithNext: true });
  m(`F_{al}\coloneq ${n3(a.F)}\mathrm{kip}`, "Factored, the governing limit state's, the whole pier");
  m(`F_{ab}\coloneq ${n3(a.Fb)}\mathrm{kip}`, "Each bearing");
  m(`M_{al}\coloneq ${n3(a.M)}\mathrm{kip}\cdot\mathrm{ft}`, "The largest bending about the vertical axis");
  m(`A_{sal}\coloneq ${n3(a.As)}\mathrm{in}^{2}`, "The side face's bars: the top and bottom layers' outer bars and the skin bars on it");
  m(`d_{al}\coloneq ${n3(a.d)}\mathrm{in}`, "Across the cap's width");
  m(`a_{al}\coloneq\frac{A_{sal}\cdot ${n3(fy)}\mathrm{ksi}}{0.85\cdot ${n3(fc)}\mathrm{ksi}\cdot ${n3(t.depth * 12)}\mathrm{in}}=`, "Over the cap's depth", "in");
  m(`M_{ral}\coloneq0.9\cdot A_{sal}\cdot ${n3(fy)}\mathrm{ksi}\cdot\left(d_{al}-\frac{a_{al}}{2}\right)=`, "AASHTO 5.6.3.2", "kip*ft");
  m(`\operatorname{if}\left(M_{al}\le M_{ral},\text{OK},\text{NG}\right)=`, "Bending along the bridge");
  m(`V_{al}\coloneq ${n3(a.V)}\mathrm{kip}`, "The largest shear across the cap");
  m(`V_{ral}\coloneq ${n3(a.Vr)}\mathrm{kip}`, "0.9 × 0.0316 × 2 √f'c × the cap's depth × dv, the concrete (AASHTO 5.7.3.3)");
  m(`\operatorname{if}\left(V_{al}\le V_{ral},\text{OK},\text{NG}\right)=`, "Shear across the cap");
  m(`T_{al}\coloneq ${n3(a.T)}\mathrm{kip}\cdot\mathrm{ft}`, `Torsion at a column face: the bearings' forces ${n3(a.e)} ft over the cap's middle`);
  m(`T_{cral}\coloneq ${n3(a.Tcr)}\mathrm{kip}\cdot\mathrm{ft}`, "0.126 √f'c Acp²/pc, AASHTO Eq. 5.7.2.1-4 (K 1)");
  if (!a.torsion) m(`\operatorname{if}\left(T_{al}\le0.25\cdot0.9\cdot T_{cral},\text{OK},\text{NG}\right)=`, "Below the threshold: neglected, AASHTO 5.7.2.1");
  else {
    m(`a_{tal}\coloneq\frac{T_{al}}{0.9\cdot2\cdot ${n3(a.torsion.Ao)}\mathrm{in}^{2}\cdot ${n3(fy)}\mathrm{ksi}}=`, "One leg, per inch (θ 45°)", "in^2/in");
    m(`a_{val}\coloneq ${n3(a.torsion.Av)}\frac{\mathrm{in}^{2}}{\mathrm{in}}`, "The gravity shear's need at the face, all legs");
    m(`a_{hal}\coloneq ${n3(a.torsion.have)}\frac{\mathrm{in}^{2}}{\mathrm{in}}`, "The stirrups, all legs");
    m(`\operatorname{if}\left(a_{val}+2\cdot a_{tal}\le a_{hal},\text{OK},\text{NG}\right)=`, "AASHTO 5.7.3.6.2");
  }
  return out;
}
