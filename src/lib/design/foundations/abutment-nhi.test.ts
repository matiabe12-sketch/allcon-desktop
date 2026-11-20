import { describe, expect, it } from "vitest";
import { flexure } from "../walls/cip";
import { ABUTMENT_DEFAULTS, abutmentLiveLoad, designAbutment, type AbutmentInputs } from "./abutment";

// Benchmark: FHWA NHI-04-041, "LRFD Design Example for Steel Girder Superstructure Bridge" (Michael Baker, 2003),
// Design Step 7 (pp. 7-1 to 7-97): the full-height cantilever abutment on two rows of HP 12x53 piles.
//
// The example follows the AASHTO LRFD 2nd Edition (1998, interims to 2002). The tool follows the 10th Edition.
// Differences that change numbers, so they are not compared, or are compared on the 2nd Edition's basis:
// - Ec = 33,000 wc^1.5 √f'c (3,640 ksi, n = 8) then; 120,000 K1 wc² f'c^0.33 (4,268 ksi, n ≈ 6.8) now (5.4.2.4).
// - Minimum steel: 1.2 Mcr with fr = 0.24 √f'c then; Mcr = γ3 γ1 fr Sc = 0.67 × 1.6 fr Sc now (5.6.3.3).
// - Crack control: the Z factor (fsa = Z / (dc A)^⅓, dc ≤ 2 in) then; the spacing limit
//   s ≤ 700 γe / (βs fss) − 2 dc now (5.6.7). The service steel stress fss itself is the same.
// - The minimum support length N uses the same Eq. 4.7.4.4-1, but the example takes H as the abutment's height;
//   AASHTO defines H at an abutment as the average height of the columns to the next expansion joint.
// What is compared (the tool's seat-type path on piles, active pressure, per foot of abutment):
// - the dead loads (stem, footing, soil on the heel, the girders' DC and DW per foot), the live load per foot
//   (three lanes × m = 0.85, no IM, AASHTO 3.6.1.1.2), the earth pressure resultant at the footing's base;
// - the backwall's and the stem's earth-pressure moments and the stem's shear (the example's Strength III terms,
//   which carry no live load surcharge), the Strength I vertical force at the footing's base;
// - the stem's and backwall's flexure section (de, a, φMn) and the service steel stress, by the shared flexure();
// - the toe's moment from the front row of piles (the same 1.5 ft lever as the example).
// Real discrepancies the benchmark shows (reported, not changed):
// 1. No live load surcharge LS (AASHTO 3.11.6.4) on the stem, backwall or footing, and no live load on the
//    backwall. The example's stem moment is 156.6 kip·ft/ft; the tool's 98.8 (LS is 30.4 of the difference).
//    AASHTO 3.11.6.5 permits a reduction where an approach slab carries the traffic, which may be the intent.
// 2. The girders' reactions sit on the stem's centerline; the example's bearings are 1.13 ft toward the span,
//    adding 27.4 kip·ft/ft at the stem's base (Strength I) and moving load toward the front piles.
// 3. The seat width N takes H = 0 for every abutment (12.8 in here); AASHTO 4.7.4.4 takes H as the average
//    height of the columns to the next expansion joint (0 only for a single span). Unconservative for
//    multi-span bridges; needs an input.
// 4. The stem's and backwall's cover is fixed at 2 in (the example has 2.5 in), and dv is the lesser
//    bound max(0.9 de, 0.72 h) without de − a/2 (conservative, 7% on the stem's Vc here).

const kaPhi = 90 - 2 * (Math.atan(Math.sqrt(0.3)) * 180) / Math.PI; // the backfill φ whose Rankine ka is the example's 0.30

/** The example's abutment: 15 ft stem 3'-6" thick, 7 ft backwall 1'-8" at its base, 10'-3" × 2'-6" footing. */
const NHI: AbutmentInputs = {
  ...ABUTMENT_DEFAULTS,
  type: "seat",
  foundation: "piles",
  pressure: "active",
  unitLength: 240,
  girderMaterial: "steel",
  skew: 0,
  nGirders: 5,
  girderSpacing: 9.75,
  RDC: (2 * 69.25 + 3 * 73.51) / 5, // fascia and interior reactions averaged: their sum is what matters per foot
  RDW: 11.24,
  RLL: 0,
  RLane: 98.15, // one lane, vehicle + lane, no IM (footing: below ground)
  lanes: 3,
  IM: 0.33,
  braking: 0, // expansion bearings at the abutment (example p. 7-10)
  bearingShear: (5 * 3.63) / 46.875, // temperature fall through the elastomeric bearings, p. 7-26
  approachDC: 0,
  length: 46.875,
  stemH: 15,
  stemT: 3.5,
  backwallH: 7,
  backwallT: 20 / 12,
  seatWidth: 18,
  toe: 2.75,
  heel: 4,
  footT: 2.5,
  fc: 4,
  fy: 60,
  gammaC: 0.15,
  stemBars: { bar: 9, spacing: 9 },
  backwallBars: { bar: 5, spacing: 9 },
  toeBars: { bar: 8, spacing: 12 },
  heelBars: { bar: 8, spacing: 12 },
  exposure: 2,
  backfillPhi: kaPhi,
  backfillGamma: 120,
  section: "HP12x53",
  Fy: 50,
  rowFront: 1.25,
  rowBack: 9.0,
  pileSpacing: 7 + 4 / 12,
  Rn: 1000,
  phiDyn: 0.45,
};

const near = (v: number, ref: number, tol: number) => expect(Math.abs(v - ref) / Math.abs(ref)).toBeLessThanOrEqual(tol);

describe("Abutment against FHWA NHI-04-041 Design Step 7", () => {
  const r = designAbutment(NHI);
  const s = r.seat!;

  const check = (id: string) => r.checks.find((c) => c.id === id)!;

  it("dead loads per foot (p. 7-7, 7-8)", () => {
    near(s.items.stem.V, 7.88, 0.002); // 15 × 3.5 × 0.150
    near(s.items.footing.V, 3.84, 0.002); // 10.25 × 2.5 × 0.150
    near(s.items.soil.V, 10.56, 0.001); // 22 × 4 × 0.120
    near(s.items.DC.V, 7.66, 0.001); // (2 × 69.25 + 3 × 73.51) / 46.875
    near(s.items.DW.V, 1.2, 0.002);
    // The example's backwall (1.71) includes its corbel; the tool's is a 20 in × 7 ft prism.
    near(s.items.backwall.V, 1.71, 0.03);
  });

  it("live load per foot: three lanes × 0.85, no IM (p. 7-10)", () => {
    near(abutmentLiveLoad(NHI) / NHI.length, 5.34, 0.001);
    near(s.items.LL.V, 5.34, 0.001);
  });

  it("earth pressure: ka = 0.30, the resultant at the footing's base (p. 7-22)", () => {
    near(s.K, 0.3, 1e-9);
    expect(s.H).toBe(24.5);
    near(s.EH, 10.8, 0.001);
  });

  it("backwall and stem earth-pressure effects match the example's Strength III terms (p. 7-30, 7-36)", () => {
    // Backwall: 1.5 × REHbw × 7/3 (the example's Strength III, no live load).
    near(s.Mbw, 3.08, 0.003);
    // Stem: 1.5 × REHstem × 7.33 + 0.5 × Hufall × 15 (the earth and temperature terms of the 156.61 Strength I).
    near(s.Mstem, 1.5 * 8.71 * 7.33 + 0.5 * 0.39 * 15, 0.002);
    // Stem shear: VustemstrIII = 1.5 REHstem + 0.5 Hufall.
    near(s.Vstem, 13.26, 0.001);
  });

  it("Strength I at the footing's base: vertical force and the longitudinal force without LS (p. 7-42, 7-46)", () => {
    const max = s.rows.find((x) => x.c.name === "Strength I, maximum")!;
    near(max.V, 51.76, 0.002); // FvftgstrI (the backwall prism's extra 0.05 kip/ft)
    near(max.Hh, 16.4, 0.001); // FlonftgstrIII = 1.5 REHftg + 0.5 Hufall (the example's Strength I adds 1.75 × 1.76 of LS)
  });

  it("the discrepancies: no LS and no bearing eccentricity on the stem (p. 7-35)", () => {
    // The example's Strength I stem moment and the parts the tool leaves out.
    const lsPart = 1.75 * 1.58 * 11.0;
    const eccPart = 1.25 * 1.71 * 0.8 + (1.25 * 7.66 + 1.5 * 1.2 + 1.75 * 6.5) * 1.13;
    near(s.Mstem + lsPart + eccPart, 156.61, 0.003);
    expect(s.Mstem).toBeLessThan(0.65 * 156.61);
  });

  it("stem section: #9 @ 9 in, 42 in thick (p. 7-65, 7-67)", () => {
    // The example's 2.5 in cover, by the tool's shared flexure().
    const f = flexure({ Mu: 156.61, Ms: 105.82, h: 42, cover: 2.5, bars: { bar: 9, spacing: 9 }, fc: 4, fy: 60, Es: 29000, phiF: 0.9, exposure: 2, n: 8, beta1: 0.85 });
    near(f.de, 38.94, 0.001);
    near(f.As, 1.333, 0.001);
    near(f.a, 1.96, 0.002);
    near(f.fss, 26.2, 0.005); // the service steel stress, the example's transformed section with n = 8
    near(f.MR, (0.9 * 80 * (38.936 - 0.98)) / 12, 0.001);
    // The tool's stem check uses a 2 in cover: de = 39.44 in.
    near(check("stem-flex").capacity, (0.9 * 80 * (39.436 - 0.98)) / 12, 0.001);
    // Shear: the example's Vr = 52.15 with dv = 38.2 in; the tool takes dv = 0.9 de (35.49 in), 7% lower.
    near(check("stem-shear").capacity, 0.9 * 0.0316 * 2 * 2 * 12 * 0.9 * 39.436, 0.001);
    near(check("stem-shear").capacity / 52.15, 35.49 / 38.2, 0.002);
  });

  it("backwall section: #5 @ 9 in, 20 in thick (p. 7-56, 7-60)", () => {
    const f = flexure({ Mu: 14.38, Ms: 8.51, h: 20, cover: 2.5, bars: { bar: 5, spacing: 9 }, fc: 4, fy: 60, Es: 29000, phiF: 0.9, exposure: 2, n: 8, beta1: 0.85 });
    near(f.de, 17.19, 0.001);
    near(f.a, 0.61, 0.005);
    near(f.fss, 15.22, 0.005);
  });

  it("toe: the front row's piles on a 1.5 ft lever (p. 7-74)", () => {
    // The same lever as the example: the toe's face is 1.5 ft from the front row.
    near(s.Mtoe, (s.piles!.Pfront / NHI.pileSpacing) * 1.5, 1e-9);
    // The tool's front pile (rigid cap, no LS, bearings on the stem's centerline, no batter): 294 kip against
    // the example's 315 to 340 kip from its pile–soil analysis.
    expect(s.piles!.Pfront).toBeGreaterThan(280);
    expect(s.piles!.Pfront).toBeLessThan(315.3);
  });

  it("support length: Eq. 4.7.4.4-1 with H = 0 (the example's 14.56 in uses H = 22 ft)", () => {
    near(check("seat").demand, 8 + 0.02 * 240, 1e-9);
    near((8 + 0.02 * 240 + 0.08 * 22) * 1, 14.56, 0.001);
  });
});
