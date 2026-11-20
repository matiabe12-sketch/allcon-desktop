import { angle } from "./steel-crossframe";
import { FATIGUE_CATEGORIES, fatigueResistance, type FatigueCategory } from "./steel-details";

// A cross-frame member's end connection, AASHTO LRFD 10th Edition: a single angle connected through one leg to
// the connection plate (or a gusset), by pretensioned high-strength bolts in one line (slip-critical, 6.13.2.1.1)
// or by fillet welds along both edges of the leg. Strength: the bolts in shear (6.13.2.7) and bearing (6.13.2.9),
// the welds (6.13.3.2.4b), the angle in tension (6.8.2.1, shear lag by Table 6.8.2.2-1) and block shear (6.13.4);
// slip at Service II (6.13.2.2, 6.13.2.8); the bolt geometry (6.13.2.6); and fatigue of the member at its
// connection (6.6.1.2.3, Δf = ΔP / (U Ag)). Inches, kips, ksi.

export type CfConnection = {
  check: boolean;
  kind: "bolted" | "welded";
  d: number; // in, bolt diameter
  grade: "A325" | "A490"; // ASTM F3125 grades
  threads: "excluded" | "included"; // from the shear plane
  holes: "punched" | "drilled"; // 6.6.1.2.3: cross-frames' holes taken as punched full size unless known otherwise
  surface: "A" | "B" | "C"; // faying surface class (Table 6.13.2.8-3)
  bolts: number; // per member end, in one line along the force
  spacing: number; // in, center to center along the line
  edge: number; // in, the end bolt's center to the angle's end (and to the plate's edge)
  gage: number; // in, the bolt line from the angle's heel
  plateT: number; // in, the connection plate or gusset the angle bolts or welds to
  Fu: number; // ksi, the angles' and plate's tensile strength (Grade 50: 65)
  weld: number; // in, fillet size (welded)
  weldLength: number; // in, each of the two longitudinal welds along the leg
  fatigueRange: number; // kip, the member's axial force range under the Fatigue I truck, from a refined analysis (0: not checked)
  serviceForce: number; // kip, the member's Service II force from a refined analysis (0: the deck placement's unfactored force)
};

export const CF_CONNECTION_DEFAULTS: CfConnection = {
  check: true,
  kind: "bolted",
  d: 0.875,
  grade: "A325",
  threads: "included",
  holes: "punched",
  surface: "B",
  bolts: 2,
  spacing: 3,
  edge: 1.5,
  gage: 3,
  plateT: 0.5,
  Fu: 65,
  weld: 0.25,
  weldLength: 6,
  fatigueRange: 0,
  serviceForce: 0,
};

const FUB = { A325: 120, A490: 150 }; // ksi, Table 6.4.3.1.1-1
/** Minimum bolt tension, kip (Table 6.13.2.8-1). */
const PT: Record<string, { A325: number; A490: number }> = { "0.625": { A325: 19, A490: 24 }, "0.75": { A325: 28, A490: 35 }, "0.875": { A325: 39, A490: 49 }, "1": { A325: 51, A490: 64 }, "1.125": { A325: 56, A490: 80 }, "1.25": { A325: 71, A490: 102 } };
const KS = { A: 0.3, B: 0.5, C: 0.3 }; // Table 6.13.2.8-3
/** Minimum edge distance, sheared edges (Table 6.13.2.6.6-1), in. */
const EDGE_MIN: Record<string, number> = { "0.625": 1.125, "0.75": 1.25, "0.875": 1.5, "1": 1.75, "1.125": 2, "1.25": 2.25 };
export const BOLT_DIAMETERS = [0.625, 0.75, 0.875, 1, 1.125, 1.25];

const PHI_S = 0.8; // bolts in shear (6.5.4.2)
const PHI_BB = 0.8; // bolts bearing on material
const PHI_BS = 0.8; // block shear
const PHI_Y = 0.95;
const PHI_U = 0.8;
const PHI_E2 = 0.8; // fillet welds in shear
const FEXX = 70;

export type ConnectionCheck = { name: string; demand: number; capacity: number; unit: string; ref: string };

/**
 * One member's end connection under its factored force Pu (strength, tension or compression), its Service II force
 * Ps (slip), and its fatigue force range ΔP. Fy: the angle's yield strength. Returns the checks and the values worked.
 */
export function cfConnection(c: CfConnection, member: string, Pu: number, Ps: number, Fy: number, adttSL: number, life: number, cycles: number) {
  const a = angle(member);
  const checks: ConnectionCheck[] = [];
  const out = { a, U: 1, Ag: a.A, An: a.A, Pt: 0, Rshear: 0, Rbearing: 0, Rslip: 0, Rweld: 0, Ptension: 0, Rblock: 0, fatigue: null as null | { cat: FatigueCategory; range: number; gamma: number; Fn: number; combo: string } };
  const Rp = c.holes === "drilled" ? 1 : 0.9;
  if (c.kind === "bolted") {
    const n = Math.max(1, Math.round(c.bolts));
    const dh = c.d + 1 / 16; // standard hole (Table 6.13.2.4.2-1)
    const Ab = (Math.PI * c.d ** 2) / 4;
    // Shear: one plane per bolt (the angle on the plate).
    const Rn = (c.threads === "excluded" ? 0.56 : 0.45) * Ab * FUB[c.grade]; // Eqs. 6.13.2.7-1, -2
    out.Rshear = n * PHI_S * Rn;
    checks.push({ name: `bolts in shear, ${n} – ${c.d} in ${c.grade}, threads ${c.threads}`, demand: Math.abs(Pu), capacity: out.Rshear, unit: "kip", ref: "AASHTO Eqs. 6.13.2.7-1, -2" });
    // Bearing at the holes, the thinner ply: the end bolt by its clear end distance, the rest by their clear spacing.
    const t = Math.min(a.t, c.plateT);
    const end = Math.min(1.2 * Math.max(0, c.edge - dh / 2) * t * c.Fu, 2.4 * c.d * t * c.Fu);
    const inner = Math.min(1.2 * Math.max(0, c.spacing - dh) * t * c.Fu, 2.4 * c.d * t * c.Fu);
    out.Rbearing = PHI_BB * (end + (n - 1) * inner);
    checks.push({ name: `bearing at the bolt holes, ${t} in ply`, demand: Math.abs(Pu), capacity: out.Rbearing, unit: "kip", ref: "AASHTO Eqs. 6.13.2.9-1, -2" });
    // Slip at Service II (φ = 1.0).
    out.Pt = (PT[String(c.d)] ?? PT["0.875"])[c.grade];
    out.Rslip = n * 1.0 * KS[c.surface] * 1 * out.Pt;
    checks.push({ name: `slip at Service II, Class ${c.surface} surface, Pt ${out.Pt} kip`, demand: Math.abs(Ps), capacity: out.Rslip, unit: "kip", ref: "AASHTO Eqs. 6.13.2.2-1, 6.13.2.8-1" });
    // The angle in tension: gross yielding and net fracture with shear lag (Table 6.8.2.2-1, cases 2 and 8).
    const L = (n - 1) * c.spacing;
    const case2 = L > 0 ? 1 - a.x / L : 0;
    const case8 = n >= 4 ? 0.8 : n >= 2 ? 0.6 : 0;
    out.U = Math.max(0, case2, case8);
    out.An = a.A - (dh + 1 / 16) * a.t; // 6.8.3: the hole's width plus 1/16 in
    out.Ptension = Math.min(PHI_Y * Fy * a.A, PHI_U * c.Fu * out.An * Rp * out.U);
    // Block shear on the angle: shear along the bolt line to the end, tension from the line to the leg's toe.
    const Avg = (c.edge + (n - 1) * c.spacing) * a.t;
    const Avn = Avg - (n - 0.5) * (dh + 1 / 16) * a.t;
    const Atn = Math.max(0, a.b - c.gage - 0.5 * (dh + 1 / 16)) * a.t;
    out.Rblock = PHI_BS * Rp * Math.min(0.58 * c.Fu * Avn + c.Fu * Atn, 0.58 * Fy * Avg + c.Fu * Atn);
    // Geometry (6.13.2.6): at least two bolts, spacing 3d, the end distance.
    checks.push({ name: "at least two bolts per connection", demand: 2, capacity: n, unit: "bolts", ref: "AASHTO 6.13.1" });
    checks.push({ name: "bolt spacing at least 3d", demand: 3 * c.d, capacity: c.spacing, unit: "in", ref: "AASHTO 6.13.2.6.1" });
    checks.push({ name: "end distance at least the minimum edge distance", demand: EDGE_MIN[String(c.d)] ?? 1.5, capacity: c.edge, unit: "in", ref: "AASHTO Table 6.13.2.6.6-1" });
  } else {
    // Two longitudinal fillet welds along the leg: 0.6 φe2 Fexx on the throat (6.13.3.2.4b).
    out.Rweld = 2 * 0.6 * PHI_E2 * FEXX * 0.707 * c.weld * c.weldLength;
    checks.push({ name: `fillet welds, 2 × ${c.weld} in × ${c.weldLength} in`, demand: Math.abs(Pu), capacity: out.Rweld, unit: "kip", ref: "AASHTO Eq. 6.13.3.2.4b-1" });
    const wmin = Math.max(a.t, c.plateT) > 0.75 ? 0.3125 : 0.25; // Table 6.13.3.4-1
    checks.push({ name: "fillet weld at least the minimum size", demand: wmin, capacity: c.weld, unit: "in", ref: "AASHTO Table 6.13.3.4-1" });
    out.U = c.weldLength > 0 ? Math.max(0, 1 - a.x / c.weldLength) : 0;
    out.An = a.A;
    out.Ptension = Math.min(PHI_Y * Fy * a.A, PHI_U * c.Fu * a.A * out.U);
    // The plate in shear along the welds (block shear without holes): both sides, and the tension across the leg's width.
    out.Rblock = PHI_BS * Math.min(0.58 * c.Fu * 2 * c.weldLength * c.plateT + c.Fu * a.b * c.plateT, 0.58 * Fy * 2 * c.weldLength * c.plateT + c.Fu * a.b * c.plateT);
  }
  if (Pu < 0) checks.push({ name: `${member} in tension: gross yielding and net fracture (U ${out.U.toFixed(3)})`, demand: -Pu, capacity: out.Ptension, unit: "kip", ref: "AASHTO Eqs. 6.8.2.1-1, -2, Table 6.8.2.2-1" });
  checks.push({ name: "block shear rupture", demand: Math.abs(Pu), capacity: out.Rblock, unit: "kip", ref: "AASHTO Eq. 6.13.4-1" });
  // Fatigue of the member at its connection: Category B (bolted, holes drilled) or D (punched), slip-critical,
  // on Ae = U Ag (Condition 2.1); E′ for single angles welded along their legs (Condition 7.2, as tested in
  // full-scale cross-frames).
  if (c.fatigueRange > 0) {
    const cat: FatigueCategory = c.kind === "welded" ? "E'" : c.holes === "drilled" ? "B" : "D";
    const r = fatigueResistance(FATIGUE_CATEGORIES[cat], adttSL, cycles, life);
    const range = c.fatigueRange / Math.max(1e-9, out.U * a.A);
    out.fatigue = { cat, range, gamma: r.gamma, Fn: r.Fn, combo: r.combo };
    checks.push({ name: `fatigue of the member at its connection, category ${cat}, ${r.combo}`, demand: r.gamma * range, capacity: r.Fn, unit: "ksi", ref: "AASHTO 6.6.1.2.2, Table 6.6.1.2.3-1" });
  }
  return { ...out, checks };
}
