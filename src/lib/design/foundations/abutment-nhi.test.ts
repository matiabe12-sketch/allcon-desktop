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
// 1. (Resolved 2026-11-20: the live load surcharge on the stem, footing and backwall, per the 10th Edition's heq height.)
//    AASHTO 3.11.6.5 permits a reduction where an approach slab carries the traffic, which may be the intent.
// 2. (Resolved 2026-11-20: the bearings' eccentricity, an input, by default half the backwall toward the span.)
// 3. (Resolved 2026-11-20: the seat width's H and Table 4.7.4.4-1's percentage are inputs, default 0 and 100%.)
// 4. (Resolved 2026-11-20: the stem's and backwall's cover is an input, default 2 in; dv = de − a/2, not less than
//    0.9 de or 0.72 h, AASHTO 5.7.2.8.)

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

  it("the stem with the live load surcharge, as the example's Strength I (p. 7-35, 7-36): heq 2.0 ft for its 24.5 ft height", () => {
    // Backwall's earth term: 1.5 × REHbw × 7/3.
    near(s.MbwEH, 3.08, 0.003);
    near(s.heqW, 2.0, 1e-9);
    near(s.dpLS, 0.072, 0.001);
    // Stem: 1.5 × REHstem × 7.33 + 0.5 × Hufall × 15 + 1.75 × RLSstem (1.58) × 11 (the example's terms of its 156.61),
    // plus the vertical loads' moment about the stem's centerline (the bearings' eccentricity, next test).
    near(s.Mstem - s.MstemV, 1.5 * 8.71 * 7.33 + 0.5 * 0.39 * 15 + 1.75 * 1.58 * 11.0, 0.003);
    // Stem shear: 1.5 REHstem + 0.5 Hufall + 1.75 RLSstem.
    near(s.Vstem, 13.26 + 1.75 * 1.58, 0.002);
  });

  it("the backwall at Strength I (p. 7-28, 7-29): REHbw 0.88, the axles 1.17 ft off its centerline; the surcharge by the 10th Edition's height", () => {
    const i: AbutmentInputs = { ...NHI, backwallLLecc: 1.17 };
    const t = designAbutment(i).seat!;
    near(t.REHbw, 0.88, 0.003);
    // The 10th Edition (3.11.6.4.1) takes heq for the height from the backfill's surface to the footing's bottom: 24.5 ft,
    // heq 2.0, RLSbw 0.072 × 7 = 0.50 kip/ft. The example (2nd Edition) took the backwall's own 7 ft: heq 3.6, 0.91.
    near(t.heqBw, 2.0, 1e-9);
    near(t.RLSbw, 0.3 * 0.12 * 2.0 * 7, 0.004);
    // The example's 2.81 kip/ft = (6 × 16 × 1.33 + 3 × 0.64 × 2) / 46.875 leaves out the multiple presence factor; the
    // tool applies m = 0.85 for three lanes (AASHTO 3.6.1.1.2).
    near(t.RLLbw, 0.85 * 2.81, 0.003);
    // MubwstrI = 1.75 RLL × 1.17 + 1.5 REH × 7/3 + 1.75 RLS × 7/2: the earth and surcharge terms as the example's,
    // the axles' term × 0.85.
    near(t.Mbw, 1.75 * 0.85 * 2.81 * 1.17 + 1.5 * 0.882 * (7 / 3) + 1.75 * 0.504 * 3.5, 0.004);
    near(t.Vbw, 1.5 * 0.882 + 1.75 * 0.504, 0.004); // the example's VubwstrI 2.91 with its 0.91
  });

  it("Strength I at the footing's base: the longitudinal force with the surcharge, 1.5 REH + 0.5 Hufall + 1.75 × 1.76 (p. 7-42, 7-46)", () => {
    const max = s.rows.find((x) => x.c.name === "Strength I, maximum")!;
    // FvftgstrI 51.76 (the backwall prism's extra 0.05 kip/ft), plus the surcharge on the heel for bearing (3.11.6.4.1,
    // C11.5.6), which the example leaves out.
    near(max.V - 1.75 * s.LSv, 51.76, 0.002);
    near(max.Hh, 16.4 + 1.75 * 1.764, 0.002);
  });

  it("the bearings' eccentricity on the stem (p. 7-35): 1.13 ft toward the span, Strength I 154.7 vs the example's 156.61", () => {
    const e = designAbutment({ ...NHI, bearingEcc: 1.13 }).seat!;
    // Statics about the stem's centerline: the girders' DC, DW and LL + IM at 1.13 ft toward the span; the backwall's
    // weight 0.92 ft behind it, on the relieving side, so γ = 0.9 (AASHTO 3.4.1, Table 3.4.1-2 minimum).
    const LLim = e.items.LL.V * (1 + NHI.IM);
    near(e.MstemV, (1.25 * e.items.DC.V + 1.5 * e.items.DW.V + 1.75 * LLim) * 1.13 - 0.9 * 1.75 * (5.4167 - 4.5), 0.001);
    // The example's 27.42 adds the backwall (1.25 × 1.71 × 0.8, on the same side as the bearings in its sketch) and
    // takes 6.5 kip/ft of live load (the tool: 5.34 × 1.33 = 7.10): the 1.97 difference, 1.2% of the total.
    const exampleEcc = 1.25 * 1.71 * 0.8 + (1.25 * 7.66 + 1.5 * 1.2 + 1.75 * 6.5) * 1.13;
    near(e.Mstem - e.MstemV + exampleEcc, 156.61, 0.004);
    near(e.Mstem, 156.61, 0.013);
    // The default for a seat abutment: half the backwall's thickness (the bearings on the seat's centerline).
    near(s.ecc, NHI.backwallT / 2, 1e-12);
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
    // Shear: the example's Vr = 52.15 with dv = 38.2 in; the tool takes dv = de − a/2 (5.7.2.8): 38.46 in with its
    // default 2 in cover, 37.96 in with the example's 2.5 in.
    near(check("stem-shear").capacity, 0.9 * 0.0316 * 2 * 2 * 12 * (39.436 - 0.98), 0.001);
    const c25 = designAbutment({ ...NHI, wallCover: 2.5 }).checks.find((c) => c.id === "stem-shear")!.capacity;
    near(c25, 52.15, 0.007);
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
    // The tool's front pile (rigid cap, with the surcharge, the bearings 0.83 ft toward the span, no batter): 347 kip,
    // 2% over the example's 315 to 340 kip from its pile–soil analysis (294 before the surcharge, 331 before the
    // eccentricity). A rigid cap without batter puts more on the front row than the example's soil springs.
    expect(s.piles!.Pfront).toBeGreaterThan(315);
    expect(s.piles!.Pfront).toBeLessThan(350);
  });

  it("support length: Eq. 4.7.4.4-1, 14.56 in with the example's H = 22 ft; 0 by default (a single span)", () => {
    near(check("seat").demand, 8 + 0.02 * 240, 1e-9);
    const n = (o: Partial<AbutmentInputs>) => designAbutment({ ...NHI, ...o }).checks.find((c) => c.id === "seat")!.demand;
    near(n({ seatH: 22 }), 14.56, 0.001);
    near(n({ seatH: 22, seatPct: 150 }), 1.5 * 14.56, 0.001); // Table 4.7.4.4-1, Zones 2 to 4
    near(n({ seatH: 22, skew: 30 }), 14.56 * (1 + 0.000125 * 900), 0.001);
  });
});
