import { DesignError, type Check } from "../walls/cip";
import type { TakeoffSettings } from "../takeoff/types";

// A pipe culvert by AASHTO LRFD Section 12:
// - reinforced concrete pipe by the indirect design method (12.10.4.3): the earth load on the standard installation
//   WE = Fe·w·Bc·H with Fe = VAF (Eq. 12.10.2.1-1, Table 12.10.2.1-3), the fluid in a full pipe (12.10.2.2), the live
//   load through the fill (12.10.2.3, 3.6.1.2.6), the bedding factors (Tables 12.10.4.3.2a-1, 12.10.4.3.2c-1) and the
//   required D-load (Eq. 12.10.4.3.1-1) against the class's (AASHTO M 170 / ASTM C76);
// - corrugated steel pipe, helical lock seam (12.7): thrust (Eqs. 12.7.2.2-1 to -4), wall area (12.7.2.3), buckling
//   (Eqs. 12.7.2.4-1, -2), the flexibility factor (12.7.2.6, Table 12.5.6.1-1), sections from Table A12-1;
// - minimum cover (Table 12.6.6.3-1), checked at the least fill; the loads at the least and the most fill.
// kip, ft, in.

export type PipeMaterial = "rcp" | "csp";
export type Installation = 1 | 2 | 3 | 4;

export type PipeInputs = {
  material: PipeMaterial;
  D: number; // in, inside diameter (RCP) or nominal diameter (CSP)
  minFill: number; // ft, the least cover over the pipe's top
  maxFill: number; // ft, the most
  gamma: number; // pcf, the fill (≥ 110 for RCP)
  installation: Installation; // the standard installation (Table 12.10.2.1-1)
  pavement: "flexible" | "rigid" | "none";
  traffic: boolean; // HL-93 live load
  lldf: number; // live load distribution factor (3.6.1.2.6: 1.15 granular, 1.0 other fill)
  full: boolean; // the fluid in a full pipe (RCP)
  // RCP
  rcpClass: 2 | 3 | 4 | 5;
  wall: number; // in, 0: Wall B (D/12 + 1 in)
  // CSP
  corrugation: "2-2/3x1/2" | "3x1" | "5x1";
  thickness: number; // in
  Fy: number; // ksi (AASHTO M 218: 33)
  Fu: number; // ksi (45)
  takeoff?: TakeoffSettings;
};

export const PIPE_DEFAULTS: PipeInputs = {
  material: "rcp",
  D: 36,
  minFill: 2,
  maxFill: 15,
  gamma: 120,
  installation: 2,
  pavement: "flexible",
  traffic: true,
  lldf: 1.15,
  full: true,
  rcpClass: 3,
  wall: 0,
  corrugation: "2-2/3x1/2",
  thickness: 0.079,
  Fy: 33,
  Fu: 45,
};

/** ASTM C76 / AASHTO M 170: the D-load to produce a 0.01 in. crack (lb/ft/ft) by class. */
export const RCP_CLASSES: Record<number, number> = { 2: 1000, 3: 1350, 4: 2000, 5: 3000 };
const VAF: Record<number, number> = { 1: 1.35, 2: 1.4, 3: 1.4, 4: 1.45 }; // Table 12.10.2.1-3
const BFE: { D: number; t: number[] }[] = [
  { D: 12, t: [4.4, 3.2, 2.5, 1.7] },
  { D: 24, t: [4.2, 3.0, 2.4, 1.7] },
  { D: 36, t: [4.0, 2.9, 2.3, 1.7] },
  { D: 72, t: [3.8, 2.8, 2.2, 1.7] },
  { D: 144, t: [3.6, 2.8, 2.2, 1.7] },
]; // Table 12.10.4.3.2a-1

/** Table A12-1: corrugated steel pipe, A (in²/ft), r (in), I (in⁴/in) by corrugation and thickness. */
export const CSP_SECTIONS: Record<PipeInputs["corrugation"], { t: number; A: number; r: number; I: number }[]> = {
  "2-2/3x1/2": [
    { t: 0.052, A: 0.619, r: 0.1707, I: 1.5e-3 },
    { t: 0.064, A: 0.775, r: 0.1712, I: 1.892e-3 },
    { t: 0.079, A: 0.968, r: 0.1721, I: 2.392e-3 },
    { t: 0.109, A: 1.356, r: 0.1741, I: 3.425e-3 },
    { t: 0.138, A: 1.744, r: 0.1766, I: 4.533e-3 },
    { t: 0.168, A: 2.133, r: 0.1795, I: 5.725e-3 },
  ],
  "3x1": [
    { t: 0.064, A: 0.89, r: 0.3417, I: 8.659e-3 },
    { t: 0.079, A: 1.113, r: 0.3427, I: 10.883e-3 },
    { t: 0.109, A: 1.56, r: 0.3448, I: 15.459e-3 },
    { t: 0.138, A: 2.008, r: 0.3472, I: 20.183e-3 },
    { t: 0.168, A: 2.458, r: 0.3499, I: 25.091e-3 },
  ],
  "5x1": [
    { t: 0.064, A: 0.794, r: 0.3657, I: 8.85e-3 },
    { t: 0.079, A: 0.992, r: 0.3663, I: 11.092e-3 },
    { t: 0.109, A: 1.39, r: 0.3677, I: 15.65e-3 },
    { t: 0.138, A: 1.788, r: 0.3693, I: 20.317e-3 },
    { t: 0.168, A: 2.186, r: 0.3711, I: 25.092e-3 },
  ],
};
/** Gauges for the thicknesses (for the drawings and notes). */
export const GAUGE: Record<number, number> = { 0.052: 18, 0.064: 16, 0.079: 14, 0.109: 12, 0.138: 10, 0.168: 8 };

const lerp = (x: number, xs: number[], ys: number[]) => {
  if (x <= xs[0]) return ys[0];
  for (let k = 1; k < xs.length; k++) if (x <= xs[k]) return ys[k - 1] + ((ys[k] - ys[k - 1]) * (x - xs[k - 1])) / (xs[k] - xs[k - 1]);
  return ys[ys.length - 1];
};

/** The bedding factors: BFE for earth (Table 12.10.4.3.2a-1) and BFLL for live load (Table 12.10.4.3.2c-1). */
export function beddingFactors(D: number, type: Installation, H: number) {
  const BFe = lerp(D, BFE.map((r) => r.D), BFE.map((r) => r.t[type - 1]));
  const BFll = H < 2 ? lerp(D, [24, 30], [3.2, 2.2]) : lerp(D, [24, 30], [2.4, 2.2]);
  return { BFe, BFll };
}

/** The live load at the pipe's top through H ft of fill (AASHTO 3.6.1.2.6): the heavier of an HL-93 truck axle (32 kip)
 * and the tandem (2 × 25 kip at 4 ft) on 20 × 10 in. tires, wheels 6 ft apart, their patches spreading LLDF·H (plus
 * 0.06·Di across), merged where they overlap; IM (Eq. 3.6.2.2-1) and m = 1.2. Returns the pressure (ksf, unfactored)
 * and the patch's length along the traffic (ft). Neglected where the fill is over 8 ft and exceeds the span. */
export function pipeLiveLoad(H: number, Di: number, lldf: number, spanFt: number) {
  if (H > 8 && H > spanFt) return { p: 0, L: 0, W: 0, IM: 0, vehicle: "none (over 8 ft and the span, 3.6.1.2.6)" };
  const IM = Math.max(0, 33 * (1 - 0.125 * H)) / 100;
  const m = 1.2;
  const wWheel = 20 / 12 + lldf * H + (0.06 * Di) / 12;
  const lWheel = 10 / 12 + lldf * H;
  const across = wWheel >= 6 ? 6 + wWheel : wWheel; // the two wheels of an axle merge across where they overlap
  const perAxle = wWheel >= 6 ? 1 : 0.5; // the share of an axle's load on the patch
  const cands = [
    { name: "HL-93 truck axle", P: 32 * perAxle, L: lWheel },
    lWheel >= 4 ? { name: "HL-93 tandem", P: 50 * perAxle, L: lWheel + 4 } : { name: "HL-93 tandem axle", P: 25 * perAxle, L: lWheel },
  ];
  const best = cands.map((c) => ({ ...c, p: (c.P * (1 + IM) * m) / (across * c.L) })).reduce((a, c) => (c.p > a.p ? c : a));
  return { p: best.p, L: best.L, W: across, IM, vehicle: best.name };
}

export function designPipe(i: PipeInputs) {
  if (!(i.D > 0 && i.minFill >= 0 && i.maxFill >= i.minFill)) throw new DesignError("The pipe needs a diameter and its fills.");
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity });
  const fills = [i.minFill, i.maxFill];

  if (i.material === "rcp") {
    const t = i.wall > 0 ? i.wall : i.D / 12 + 1; // Wall B
    const Bc = (i.D + 2 * t) / 12;
    const w = Math.max(110, i.gamma) / 1000;
    const Fe = VAF[i.installation];
    const WF = i.full ? (62.4 * Math.PI * (i.D / 24) ** 2) / 1000 : 0; // kip/ft
    const cases = fills.map((H) => {
      const WE = Fe * w * Bc * H; // Eq. 12.10.2.1-1
      const ll = i.traffic ? pipeLiveLoad(H, i.D, i.lldf, Bc) : { p: 0, L: 0, W: 0, IM: 0, vehicle: "none" };
      const WL = ll.p * Math.min(ll.L, Bc);
      const { BFe, BFll } = beddingFactors(i.D, i.installation, H);
      const D01 = (12 / i.D) * ((WE + WF) / BFe + WL / BFll) * 1000 * (i.installation === 1 ? 1.1 : 1); // lb/ft/ft
      return { H, WE, WL, ll, BFe, BFll, D01 };
    });
    const gov = cases.reduce((a, c) => (c.D01 > a.D01 ? c : a));
    const needClass = [2, 3, 4, 5].find((c) => RCP_CLASSES[c] >= gov.D01) ?? null;
    for (const c of cases) add({ id: `dload-${c.H}`, name: `D-load at ${c.H} ft of fill (Class ${["", "", "II", "III", "IV", "V"][i.rcpClass]})`, demand: c.D01, capacity: RCP_CLASSES[i.rcpClass], unit: "lb/ft/ft", ref: "AASHTO Eq. 12.10.4.3.1-1; M 170" });
    const minCover = i.pavement === "rigid" ? 0.75 : Math.max(1, Bc / 8); // ft (Table 12.6.6.3-1)
    add({ id: "cover", name: `Minimum cover (${i.pavement === "rigid" ? "under rigid pavement, 9 in." : "Bc/8, at least 12 in."})`, demand: minCover, capacity: i.minFill, unit: "ft", ref: "AASHTO Table 12.6.6.3-1" });
    return { ok: checks.every((c) => c.ok || c.advisory), checks, material: i.material, rcp: { t, Bc, Fe, w, WF, cases, gov, needClass }, csp: null };
  }

  // --- corrugated steel pipe (12.7) ------------------------------------------------------------------------------
  const sec = CSP_SECTIONS[i.corrugation].find((s) => Math.abs(s.t - i.thickness) < 1e-6);
  if (!sec) throw new DesignError("That thickness isn't made in this corrugation (Table A12-1).");
  const S = i.D / 12; // ft
  const Em = 29000;
  const cases = fills.map((H) => {
    const PFD = 1.95 * (i.gamma / 1000) * H; // EV, flexible buried structures (Table 3.4.1-2), VAF 1.0
    const ll = i.traffic ? pipeLiveLoad(H, i.D, i.lldf, S) : { p: 0, L: 0, W: 0, IM: 0, vehicle: "none" };
    const PFL = 1.75 * ll.p; // the live pressure already has IM and m
    const lw = Math.max(ll.L, 1e-6);
    const CL = Math.min(ll.L, S);
    const F1min = Math.max(1, 15 / (12 * S));
    const F1 = Math.max(F1min, (0.75 * S) / lw);
    const TL = (PFD * S) / 2 + (ll.p > 0 ? (PFL * CL * F1) / 2 : 0); // Eq. 12.7.2.2-1, kip/ft
    return { H, PFD, PFL, CL, F1, TL, ll };
  });
  const gov = cases.reduce((a, c) => (c.TL > a.TL ? c : a));
  // Buckling (Eqs. 12.7.2.4-1, -2), k = 0.22, S in in.
  const k = 0.22;
  const lim = (sec.r / k) * Math.sqrt((24 * Em) / i.Fu);
  const fcr = i.D < lim ? i.Fu - (i.Fu ** 2 / (48 * Em)) * ((k * i.D) / sec.r) ** 2 : (12 * Em) / ((k * i.D) / sec.r) ** 2;
  const fWall = Math.min(i.Fy, fcr);
  const FF = i.D ** 2 / (Em * sec.I); // in/kip
  const FFlim = i.corrugation === "2-2/3x1/2" ? 43 : 33;
  add({ id: "wall", name: `Wall area: TL ≤ φ·${fcr < i.Fy ? "fcr" : "Fy"}·A (φ 1.0, helical lock seam)`, demand: gov.TL, capacity: 1.0 * fWall * sec.A, unit: "kip/ft", ref: "AASHTO 12.7.2.3, 12.7.2.4, Table 12.5.5-1" });
  add({ id: "buckling", name: "Buckling stress fcr", demand: gov.TL / sec.A, capacity: fcr, unit: "ksi", ref: "AASHTO Eqs. 12.7.2.4-1, -2" });
  add({ id: "flexibility", name: `Flexibility factor FF = S²/(E·I) ≤ ${FFlim}`, demand: FF, capacity: FFlim, unit: "in/kip", ref: "AASHTO 12.7.2.6, Table 12.5.6.1-1" });
  add({ id: "cover", name: "Minimum cover S/8, at least 12 in.", demand: Math.max(1, S / 8), capacity: i.minFill, unit: "ft", ref: "AASHTO Table 12.6.6.3-1" });
  return { ok: checks.every((c) => c.ok || c.advisory), checks, material: i.material, rcp: null, csp: { sec, S, cases, gov, fcr, fWall, FF, FFlim, lim } };
}

export type PipeResult = ReturnType<typeof designPipe>;
