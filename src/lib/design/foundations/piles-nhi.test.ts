import { describe, expect, it } from "vitest";
import { axialResistance, flexuralResistance, HP_SECTIONS, interaction, PHI_PILE } from "./hpile";
import { designPiles, PILE_DEFAULTS, type PileInputs } from "./piles";

// Benchmark: FHWA NHI-04-041, "LRFD Design Example for Steel Girder Superstructure Bridge" (Michael Baker, 2003):
// Design Step 8.10 and 8.11 (the hammerhead pier's footing on 20 HP 12x53 piles, pp. 8-61 to 8-67) and Design
// Step P (the HP 12x53 piles' structural checks, pp. P-78 to P-90).
//
// 2nd Edition (the example) versus 10th Edition (the tool) differences:
// - Strong-axis flexure of an H-pile: the example takes Mn = Mp = Fy Zx (308.3 kip·ft), setting aside the flange
//   limit as "for welded sections". The 10th Edition applies flange local buckling to rolled shapes too
//   (6.12.2.2.1a → 6.10 / A6.3.2): HP 12x53's bf/2tf = 13.8 exceeds λpf = 9.15, so Mn ≈ 273 kip·ft.
// - Weak-axis flexure: the example takes Mp = Fy Zy (134.2 kip·ft); the 10th Edition's FLB (Eq. 6.12.2.2.1c-1)
//   gives 111.6 kip·ft.
// - The interaction: the example uses Eq. 6.9.2.2-2 (8/9 on the moments). The 10th Edition keeps Eqs.
//   6.9.2.2.1-1 and -2 for sections whose elements are all compact for flexure; HP 12x53's flanges are not, so
//   the linear Eq. 6.9.2.2.1-3 applies. The example's worst pile goes from 0.84 to 0.92.
// - Punching shear (5.12.8.6.3, formerly 5.13.3.6.3): the same equation; the tool's dv is the bound
//   max(0.9 de, 0.72 h) without de − a/2, about 6% less than the example's 36.40 in (conservative).
// - Axial: the example's Pn = Fy As = 775 kip. The 10th Edition reduces it for the slender flanges
//   (bf/2tf 13.8 > 0.56 √(E/Fy) = 13.5, effective width by Eq. 6.9.4.2.2b-1) to 769 kip. φc 0.60 (good driving) and
//   0.70 (combined) are unchanged (6.5.4.2).
// Compared: the pile loads on the rigid cap (P/n ± M x/Σx²), the punching shear load (the 14 piles outside the
// critical perimeter), its perimeter and βc, the axial resistances, the interaction with the example's own
// resistances, and the tool's 10th-Edition resistances.
// Discrepancies: none in the method. The pile's web shear (6.10.7, the example's Vr = 148.6 kip against 18.2 kip)
// is not checked by the tool (it rarely governs in a group).

const near = (v: number, ref: number, tol: number) => expect(Math.abs(v - ref) / Math.abs(ref)).toBeLessThanOrEqual(tol);

/** The pier footing: 23 ft × 12 ft × 3'-6", 5 × 4 piles at 5 ft and 3 ft, a 15'-6" × 4'-6" column, #9 @ 6 in each way. */
const PIER: PileInputs = {
  ...PILE_DEFAULTS,
  section: "HP12x53",
  Fy: 50,
  nB: 5,
  nL: 4,
  sB: 5,
  sL: 3,
  edge: 1.5,
  capT: 42,
  embed: 12,
  colShape: "rectangular",
  colB: 186,
  colL: 54,
  fc: 4,
  fy: 60,
  cover: 3,
  barsB: { bar: 9, spacing: 6 },
  barsL: { bar: 9, spacing: 6 },
  Df: 5.5,
  // The punching check's Strength I forces at the column's base, the longitudinal moment magnified (p. 8-62):
  // MB about the axis across B (piles 5 and 10 ft out), ML about the axis across L (piles 1.5 and 4.5 ft out).
  cases: [{ name: "Strength I", limit: "strength", P: 3583, MB: 5287, ML: 2921, HB: 0, HL: 0 }],
};

describe("Pile foundation against FHWA NHI-04-041 Design Steps 8.11 and P", () => {
  const r = designPiles(PIER);
  const check = (id: string) => r.checks.find((c) => c.id === id)!;

  it("rigid-cap pile loads: P1 = 290.45 kip, the group's Σx² = 1000 and Σy² = 225 ft² (p. 8-66)", () => {
    const P1 = 3583 / 20 + (5287 * 10) / 1000 + (2921 * 4.5) / 225;
    near(P1, 290.45, 0.0005);
    // The tool's pile reactions from the column alone (the cap's weight goes straight to the piles).
    const R = r.capCases[0].R;
    near(Math.max(...R), 290.45, 0.0005);
    near(Math.min(...R), 3583 / 20 - (5287 * 10) / 1000 - (2921 * 4.5) / 225, 1e-9);
    near(r.dB, 38.44, 0.001); // dey, the lower layer
    near(r.dL, 37.31, 0.001); // dex
  });

  it("punching load: the 14 piles outside the perimeter, 2,509 kip (p. 8-67)", () => {
    near(check("cap-punch-col").demand, 2509, 0.001);
  });

  it("punching resistance: βc = 3.44, the example's bo and dv give Vr = 4,082 kip; the tool's dv is 6% less (p. 8-65)", () => {
    const betaC = 186 / 54;
    near(betaC, 3.44, 0.002);
    const Vn = (dv: number) => Math.min(0.063 + 0.126 / betaC, 0.126) * 2 * (2 * (186 + dv) + 2 * (54 + dv)) * dv;
    near(0.9 * Vn(36.4), 4082, 0.002);
    // The tool: dv = 0.9 × the bars' average depth, (38.44 + 37.31)/2.
    const dvTool = 0.9 * ((42 - 3 - 1.128 / 2 + (42 - 3 - 1.128 - 1.128 / 2)) / 2);
    near(check("cap-punch-col").capacity, 0.9 * Vn(dvTool), 1e-6);
    near(check("cap-punch-col").capacity / 4082, 0.922, 0.005);
  });

  it("axial resistance: the example's Pn = Fy As = 775 kip; 10th Edition 769 kip with the slender flanges (p. P-78, P-79)", () => {
    const ax = axialResistance(HP_SECTIONS["HP12x53"], 50, 0);
    near(ax.Po, 775, 0.001);
    near(PHI_PILE.axialGood * ax.Po, 465, 0.001);
    near(PHI_PILE.combinedAxial * ax.Po, 542.5, 0.001);
    // bf/2tf = 13.8 > λr = 0.56 √(E/Fy) = 13.5 (Table 6.9.4.2.1-1): the flanges' effective width (Eq. 6.9.4.2.2b-1,
    // c1 0.22, c2 1.49 for plates supported along one edge) takes 0.8% off.
    expect(ax.slender).toBe(true);
    near(ax.Pn, 768.9, 0.001);
  });

  it("interaction with the example's resistances reproduces Table P-16 (Eq. 6.9.2.2-2)", () => {
    const runs = [
      { P: 288, Mx: 107, ratio: 0.84 },
      { P: 289, Mx: 100, ratio: 0.82 },
      { P: 336, Mx: 26, ratio: 0.69 },
      { P: 290, Mx: 97, ratio: 0.81 },
    ];
    for (const x of runs) near(interaction(x.P, 542.5, x.Mx * 12, 3700, 0, 1610, true).value, x.ratio, 0.01); // the example rounds to 0.01
  });

  it("10th Edition flexural resistances: flange local buckling on both axes", () => {
    const s = HP_SECTIONS["HP12x53"];
    const fx = flexuralResistance(s, 50, "x");
    const fy = flexuralResistance(s, 50, "y");
    expect(fx.compact).toBe(false);
    near(fx.Mp / 12, 308.3, 0.001); // the example's Mnx
    near(fy.Mp / 12, 134.2, 0.001); // the example's Mny
    // Weak axis, Eq. 6.12.2.2.1c-1: Mp − (Mp − 0.7 Fy Sy)(λf − λpf)/(λrf − λpf).
    near(fy.Mn / 12, 111.6, 0.002);
    // Strong axis, the tool's 273.0 kip·ft; A6.3.2 (λrf = 0.95 √(E kc / Fyr), kc 0.76) gives 272.4.
    near(fx.Mn / 12, 272.4, 0.003);
    // The example's worst pile, by the 10th Edition: Eq. 6.9.2.2.1-3 with the reduced Mnx.
    const v = interaction(288, 542.5, 107 * 12, fx.Mn, 0, fy.Mn, fx.compact);
    expect(v.eq).toBe("6.9.2.2.1-3");
    near(v.value, 288 / 542.5 + (107 * 12) / fx.Mn, 1e-9);
    near(v.value, 0.923, 0.003);
  });
});
