import { DesignError, type Check } from "../walls/cip";
import type { TakeoffSettings } from "../takeoff/types";

// A pipe culvert's concrete headwalls by CDOT's standard plans:
// - M-601-12 (2019), pipes 18 to 48 in.: H = D + 30 in., W = 3D + 18 in., T = 0.4·H (nearest in.), a 12 in. top, set
//   18 in. below the invert; double pipes B = 1.5·D (30 in. at least) apart, L = W + B; the concrete per headwall from
//   its table; bars "in a pattern similar to M-601-10", paid with the concrete unless listed (note 6); and the pipe
//   outlet paving (4 or 6 in. concrete slope and ditch paving, or 18 in. riprap).
// - M-601-10 (2019), round pipes 54 to 108 in., rigid or flexible: the 12 in. wall's dimensions (X, X1, y, the bar
//   layout's A, A1, B, X2) and its concrete and steel from the tables; 0.89·X lb more steel with an apron; wingwalls by
//   M-601-20 (the Cantilever Wingwall tool).
// Both: Class B concrete; skewed installations scaled by cosec(skew) (M-601-10's skew factor table); adjacent pipes ½D
// apart or 3 ft, whichever is less (M-601-10's ▲ note).
// in., ft, CY, lb.

export type HeadwallInputs = {
  D: number; // in., the pipe's inside diameter
  rigid: boolean; // RCP (else corrugated metal)
  pipes: 1 | 2;
  skew: number; // deg, the angle between the headwall and the pipe's centerline (90: square)
  count: number; // headwalls (2: inlet and outlet)
  apron: boolean; // M-601-10: an apron (more steel)
  paving: "none" | "concrete" | "riprap"; // M-601-12's pipe outlet paving, at the outlet
  takeoff?: TakeoffSettings;
};

export const HEADWALL_DEFAULTS: HeadwallInputs = { D: 36, rigid: true, pipes: 1, skew: 90, count: 2, apron: false, paving: "riprap" };

type Row10 = { Ba: number; Bc?: number; X: number; A: number; X1: number; A1: number; y: number; B: number; X2?: number; cy: [number, number]; lb: [number, number] };
/** M-601-10, headwall for rigid round pipe (Ba inside, Bc outside): X = 1.5Ba + 24, y = Ba + 56 (20 in. over, 36 in. under). */
export const M10_RIGID: Row10[] = [
  { Ba: 54, Bc: 65, X: 105, A: 8.5, X1: 186, A1: 7, y: 110, B: 17, X2: 20, cy: [2.12, 3.55], lb: [209, 364] },
  { Ba: 60, Bc: 72, X: 114, A: 7, X1: 204, A1: 10, y: 116, B: 11, X2: 21, cy: [2.35, 3.99], lb: [236, 414] },
  { Ba: 66, Bc: 79, X: 123, A: 11.5, X1: 222, A1: 7, y: 122, B: 14, X2: 22, cy: [2.6, 4.44], lb: [249, 453] },
  { Ba: 72, Bc: 86, X: 132, A: 10, X1: 240, A1: 10, y: 128, B: 17, X2: 23, cy: [2.85, 4.91], lb: [270, 476] },
  { Ba: 78, Bc: 93, X: 141, A: 8.5, X1: 255, A1: 11, y: 134, B: 11, X2: 24, cy: [3.11, 5.29], lb: [306, 527] },
  { Ba: 84, Bc: 100, X: 150, A: 7, X1: 270, A1: 7, y: 140, B: 14, X2: 25, cy: [3.38, 5.68], lb: [333, 572] },
  { Ba: 90, Bc: 107, X: 159, A: 11.5, X1: 285, A1: 8.5, y: 146, B: 17, X2: 26, cy: [3.66, 6.08], lb: [335, 593] },
  { Ba: 96, Bc: 114, X: 168, A: 10, X1: 300, A1: 10, y: 152, B: 11, X2: 27, cy: [3.94, 6.48], lb: [379, 649] },
  { Ba: 102, Bc: 121, X: 177, A: 8.5, X1: 315, A1: 11.5, y: 158, B: 14, X2: 28, cy: [4.24, 6.89], lb: [400, 664] },
  { Ba: 108, Bc: 128, X: 186, A: 7, X1: 330, A1: 7, y: 164, B: 17, X2: 29, cy: [4.54, 7.3], lb: [424, 707] },
];
/** M-601-10, headwall for flexible round pipe: X = Ba + 48, y = Ba + 52 (16 in. over, 36 in. under). */
export const M10_FLEXIBLE: Row10[] = [
  { Ba: 54, X: 102, A: 7, X1: 183, A1: 11.5, y: 106, B: 15, cy: [2.19, 3.81], lb: [211, 358] },
  { Ba: 60, X: 108, A: 10, X1: 198, A1: 7, y: 112, B: 18, cy: [2.38, 4.25], lb: [217, 396] },
  { Ba: 66, X: 114, A: 7, X1: 213, A1: 8.5, y: 118, B: 12, cy: [2.58, 4.7], lb: [252, 454] },
  { Ba: 72, X: 120, A: 10, X1: 228, A1: 10, y: 124, B: 15, cy: [2.78, 5.17], lb: [255, 472] },
  { Ba: 78, X: 126, A: 7, X1: 240, A1: 10, y: 130, B: 18, cy: [2.98, 5.56], lb: [276, 499] },
  { Ba: 84, X: 132, A: 10, X1: 252, A1: 10, y: 136, B: 12, cy: [3.19, 5.95], lb: [297, 553] },
  { Ba: 90, X: 138, A: 7, X1: 264, A1: 10, y: 142, B: 15, cy: [3.4, 6.36], lb: [317, 517] },
  { Ba: 96, X: 144, A: 10, X1: 276, A1: 10, y: 148, B: 18, cy: [3.62, 6.79], lb: [321, 597] },
  { Ba: 102, X: 150, A: 7, X1: 288, A1: 10, y: 154, B: 12, cy: [3.84, 7.21], lb: [364, 663] },
  { Ba: 108, X: 156, A: 10, X1: 300, A1: 10, y: 160, B: 15, cy: [4.06, 7.63], lb: [362, 678] },
];
/** M-601-12: concrete for one headwall (CY), circular pipe, by D, [single, double]. */
export const M12_CONCRETE: Record<number, { rigid: [number, number]; flexible: [number, number] }> = {
  18: { rigid: [1.0, 1.3], flexible: [1.1, 1.4] },
  24: { rigid: [1.5, 2.0], flexible: [1.6, 2.1] },
  30: { rigid: [2.0, 2.7], flexible: [2.2, 3.0] },
  36: { rigid: [2.8, 3.6], flexible: [3.0, 4.0] },
  42: { rigid: [3.6, 4.6], flexible: [3.9, 5.3] },
  48: { rigid: [4.6, 6.0], flexible: [5.0, 6.8] },
};
/** M-601-12: pipe outlet paving (CY) by D: 4 in. concrete to 30 in., 6 in. from 36 in.; 18 in. riprap. */
export const M12_PAVING: Record<number, { concrete: number; riprap: number }> = {
  18: { concrete: 0.4, riprap: 2.0 },
  24: { concrete: 0.8, riprap: 3.5 },
  30: { concrete: 1.2, riprap: 5.4 },
  36: { concrete: 2.6, riprap: 7.8 },
  42: { concrete: 3.6, riprap: 10.7 },
  48: { concrete: 4.7, riprap: 13.9 },
};

export function designHeadwall(i: HeadwallInputs) {
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity });
  if (!(i.skew >= 30 && i.skew <= 90)) throw new DesignError("The skew factor table runs from 90° (square) to 30°.");
  const skewF = 1 / Math.sin((i.skew * Math.PI) / 180); // cosec, M-601-10's skew factor table
  const dbl = i.pipes === 2 ? 1 : 0;
  const spacingMin = Math.min(i.D / 2, 36); // in., ▲: ½D or 3 ft, whichever is less
  if (i.D <= 48) {
    const row = M12_CONCRETE[i.D];
    if (!row) throw new DesignError("M-601-12 tabulates 18, 24, 30, 36, 42 and 48 in. pipes.");
    const H = i.D + 30;
    const W = 3 * i.D + 18;
    const T = Math.round(0.4 * H);
    const B = Math.max(1.5 * i.D, 30);
    const L = i.pipes === 2 ? W + B : W;
    const cy = (i.rigid ? row.rigid : row.flexible)[dbl] * skewF;
    const pave = i.paving === "none" ? 0 : M12_PAVING[i.D][i.paving] * i.pipes;
    // Bars "similar to M-601-10": #4 at 12 in. each way, one mat, and a #4 hoop round each pipe; paid with the
    // concrete (note 6). An estimate for the quantities' notes.
    const lb = ((Math.ceil(L / 12) + 1) * (H - 4) + (Math.ceil(H / 12) + 1) * (L - 4)) / 12 * 0.668 * skewF + i.pipes * ((Math.PI * (i.D + 8)) / 12 + 20 / 12) * 0.668;
    add({ id: "range", name: "Pipe within M-601-12 (18 to 48 in.)", demand: i.D, capacity: 48, unit: "in.", ref: "CDOT M-601-12" });
    if (i.pipes === 2) add({ id: "spacing", name: "Pipes B = 1.5·D apart (30 in. at least), at least the ½D-or-3 ft rule", demand: spacingMin, capacity: B, unit: "in.", ref: "CDOT M-601-12, M-601-10 ▲" });
    return { ok: checks.every((c) => c.ok || c.advisory), checks, standard: "M-601-12" as const, skewF, small: { H, W, T, B, L }, large: null, cy, lbEstimate: lb, lb: 0, pave, spacingMin };
  }
  const table = i.rigid ? M10_RIGID : M10_FLEXIBLE;
  const row = table.find((r) => r.Ba === i.D);
  if (!row) throw new DesignError(`M-601-10 tabulates ${table.map((r) => r.Ba).join(", ")} in. round pipes.`);
  const cy = row.cy[dbl] * skewF;
  const X = (i.pipes === 2 ? row.X1 : row.X) * skewF;
  const lb = (row.lb[dbl] + (i.apron ? 0.89 * (i.pipes === 2 ? row.X1 : row.X) / 12 : 0)) * skewF;
  add({ id: "range", name: "Pipe within M-601-10 (54 to 108 in.)", demand: i.D, capacity: 108, unit: "in.", ref: "CDOT M-601-10" });
  // ▲ in the double headwall (including the wall): rigid X1 = 2(0.75·Ba + 12) + Ba + ▲, flexible X1 = 2·Ba + ▲ + 48.
  const gap = i.rigid ? row.X1 - 2.5 * row.Ba - 24 : row.X1 - 2 * row.Ba - 48;
  if (i.pipes === 2) add({ id: "spacing", name: "The pipes' spacing ▲ in the table's X1, against ½D or 3 ft, whichever is less", demand: spacingMin, capacity: gap, unit: "in.", ref: "CDOT M-601-10 ▲", advisory: true });
  return { ok: checks.every((c) => c.ok || c.advisory), checks, standard: "M-601-10" as const, skewF, small: null, large: { ...row, Xs: X, gap }, cy, lbEstimate: 0, lb, pave: 0, spacingMin };
}

export type HeadwallResult = ReturnType<typeof designHeadwall>;
