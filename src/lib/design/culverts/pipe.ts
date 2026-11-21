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
  seam: "helical" | "riveted-single" | "riveted-double"; // CSP: helical lock seam or welded, or annular riveted (12.7.2.5)
  // Site
  pavementT: number; // in, a flexible pavement's thickness (cover is measured below it, Table 12.6.6.3-1)
  lines: number; // barrels side by side
  gap: number; // ft, clear between barrels
  trench: boolean; // a trench (else an embankment)
  envelope: number; // ft, the backfill beside the pipe, each side (0: the guide's minimum)
  water: number; // ft, the highest groundwater above the invert (0: none, 12.6.2.3)
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
  seam: "helical",
  pavementT: 0,
  lines: 1,
  gap: 0,
  trench: false,
  envelope: 0,
  water: 0,
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
/** Table A12-7: riveted CSP, the minimum longitudinal seam strength (kip/ft), single and double rivets. */
export const SEAM_STRENGTH: Partial<Record<PipeInputs["corrugation"], Record<number, [number | null, number]>>> = {
  "2-2/3x1/2": { 0.064: [16.7, 21.6], 0.079: [18.2, 29.8], 0.109: [23.4, 46.8], 0.138: [24.5, 49.0], 0.168: [25.6, 51.3] },
  "3x1": { 0.064: [null, 28.7], 0.079: [null, 35.7], 0.109: [null, 53.0], 0.138: [null, 63.7], 0.168: [null, 70.7] },
};

/** The guide's minimum clear spacing between round pipes (Table C12.6.7-1), D in ft. */
export const minSpacing = (D: number) => (D < 2 ? 1 : D <= 6 ? D / 2 : 3);
/** The guide's minimum soil envelope each side (ft): an embankment (Table C12.6.6.2-1) or a trench (C12.6.6.1: the
 * greater of D + 16 in. and 1.5D + 12 in. overall), D in in., Do in ft. */
export const minEnvelope = (D: number, Do: number, trench: boolean) => (trench ? (Math.max(D + 16, 1.5 * D + 12) / 12 - Do) / 2 : D < 24 ? D / 12 : D <= 144 ? 2 : 5);

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
  // Every fill from the least to the most, by 0.5 ft (and either side of 2 ft, where the bedding factor changes): the
  // live load falls and the earth load grows, so the worst may lie between.
  const steps = Array.from({ length: Math.floor((i.maxFill - i.minFill) / 0.5 + 1e-9) }, (_, k) => i.minFill + 0.5 * (k + 1));
  const fills = [...new Set([i.minFill, ...steps, ...(i.minFill < 2 && i.maxFill >= 2 ? [1.99, 2] : []), i.maxFill])].filter((h) => h >= i.minFill && h <= i.maxFill).sort((a, b) => a - b);
  const keep = <T extends { H: number }>(all: T[], gov: T) => all.filter((c) => c.H === i.minFill || c.H === i.maxFill || c === gov);
  const coverAt = i.minFill - (i.pavement === "flexible" ? i.pavementT / 12 : 0); // below a flexible pavement

  // Spacing of multiple lines (12.6.7), the soil envelope (12.6.6) and uplift (12.6.2.3), for either material.
  let siteOut: { Do: number; spacing: number | null; envelope: number; envMin: number; uplift: { B: number; W: number } | null } | null = null;
  const site = (Do: number, pipeWt: number) => {
    const D = i.D / 12;
    const spacing = i.lines > 1 ? minSpacing(D) : null;
    if (spacing !== null) add({ id: "spacing", name: `Clear spacing between the ${i.lines} lines (Table C12.6.7-1)`, demand: spacing, capacity: i.gap, unit: "ft", ref: "AASHTO 12.6.7" });
    const envMin = Math.max(0, minEnvelope(i.D, Do, i.trench));
    const envelope = i.envelope > 0 ? i.envelope : envMin;
    add({ id: "envelope", name: i.trench ? "Trench width beside the pipe (C12.6.6.1: the greater of D + 16 in. and 1.5D + 12 in. overall)" : "Soil envelope beside the pipe (Table C12.6.6.2-1)", demand: envMin, capacity: envelope, unit: "ft", ref: `AASHTO ${i.trench ? "12.6.6.1" : "12.6.6.2"}` });
    let uplift: { B: number; W: number } | null = null;
    if (i.water > 0) {
      // Buoyancy of the empty pipe below the water against 0.9 × (the pipe and the soil prism over it, buoyant below the water).
      const R = Do / 2;
      const h = Math.min(i.water, Do);
      const seg = R * R * Math.acos((R - h) / R) - (R - h) * Math.sqrt(Math.max(0, 2 * R * h - h * h));
      const B = 0.0624 * seg;
      const yTop = Do + i.minFill;
      const wet = Math.max(0, Math.min(yTop, i.water) - Do);
      const W = pipeWt + Do * ((i.gamma / 1000) * (i.minFill - wet) + Math.max(0, i.gamma / 1000 - 0.0624) * wet);
      uplift = { B, W };
      add({ id: "uplift", name: `Uplift: buoyancy of the empty pipe, water ${+i.water.toFixed(2)} ft over the invert, against 0.9 × (pipe + soil over it)`, demand: B, capacity: 0.9 * W, unit: "kip/ft", ref: "AASHTO 12.6.2.3" });
    }
    siteOut = { Do, spacing, envelope, envMin, uplift };
  };

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
    const shown = keep(cases, gov);
    const needClass = [2, 3, 4, 5].find((c) => RCP_CLASSES[c] >= gov.D01) ?? null;
    for (const c of shown) add({ id: `dload-${c.H}`, name: `D-load at ${+c.H.toFixed(2)} ft of fill${c === gov && c.H !== i.minFill && c.H !== i.maxFill ? ", governs" : ""} (Class ${["", "", "II", "III", "IV", "V"][i.rcpClass]})`, demand: c.D01, capacity: RCP_CLASSES[i.rcpClass], unit: "lb/ft/ft", ref: "AASHTO Eq. 12.10.4.3.1-1; M 170" });
    const minCover = i.pavement === "rigid" ? 0.75 : Math.max(1, Bc / 8); // ft (Table 12.6.6.3-1)
    add({ id: "cover", name: `Minimum cover (${i.pavement === "rigid" ? "under rigid pavement, 9 in." : `Bc/8, at least 12 in.${i.pavement === "flexible" && i.pavementT > 0 ? ", below the pavement" : ""}`})`, demand: minCover, capacity: coverAt, unit: "ft", ref: "AASHTO Table 12.6.6.3-1" });
    site(Bc, (0.15 * Math.PI * (Bc ** 2 - (i.D / 12) ** 2)) / 4);
    return { ok: checks.every((c) => c.ok || c.advisory), checks, material: i.material, rcp: { t, Bc, Fe, w, WF, cases: shown, all: cases, gov, needClass }, csp: null, site: siteOut! };
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
  const shown = keep(cases, gov);
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
  // Seams (12.7.2.5): an annular riveted pipe's seam develops the factored thrust, φ 0.67 (Table 12.5.5-1); a helical
  // lock seam or a welded seam needs no check.
  let seamR: number | null = null;
  if (i.seam !== "helical") {
    const row = SEAM_STRENGTH[i.corrugation]?.[sec.t];
    seamR = row ? row[i.seam === "riveted-single" ? 0 : 1] : null;
    if (seamR === null) throw new DesignError(`Table A12-7 lists no ${i.seam === "riveted-single" ? "single" : "double"}-riveted seam for this corrugation and thickness; choose another seam.`);
    add({ id: "seam", name: `Longitudinal seam, ${i.seam === "riveted-single" ? "single" : "double"} rivets (Table A12-7: ${seamR} kip/ft)`, demand: gov.TL, capacity: 0.67 * seamR, unit: "kip/ft", ref: "AASHTO 12.7.2.5, Table 12.5.5-1" });
  }
  add({ id: "cover", name: `Minimum cover S/8, at least 12 in.${i.pavement === "flexible" && i.pavementT > 0 ? ", below the pavement" : ""}`, demand: Math.max(1, S / 8), capacity: coverAt, unit: "ft", ref: "AASHTO Table 12.6.6.3-1" });
  const depth = i.corrugation === "2-2/3x1/2" ? 0.5 : 1;
  site((i.D + 2 * depth) / 12, (Math.PI * S * sec.A * 490) / 144 / 1000);
  return { ok: checks.every((c) => c.ok || c.advisory), checks, material: i.material, rcp: null, csp: { sec, S, cases: shown, all: cases, gov, fcr, fWall, FF, FFlim, lim, seamR }, site: siteOut! };
}

export type PipeResult = ReturnType<typeof designPipe>;
