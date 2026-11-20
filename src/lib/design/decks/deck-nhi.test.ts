import { describe, expect, it } from "vitest";
import { flexure } from "../walls/cip";
import { DECK_DEFAULTS, designDeck, type DeckInputs } from "./deck";

// The deck against FHWA NHI-04-041, LRFD Design Example for Steel Girder Superstructure Bridge (2003),
// Design Step 2 (Concrete Deck Design): an 8.5 in deck (0.5 in of it an integral wearing surface) on
// five steel girders at 9'-9", 3'-11¼" overhangs 9 in thick, 1'-5¼" parapets of 0.53 klf, f'c = 4 ksi.
// The example follows the 2nd Edition (2002 interims); compared here only where the provision is the
// same in the 10th Edition.
//
// Where the editions differ (not compared, or compared for the inputs only):
// - Crack control: the example uses the Z factor (old 5.7.3.4, Z = 130 k/in, fsa ≤ 0.6 fy); the 10th
//   uses the spacing limit of 5.6.7. Only the service stress fs is compared, from the example's own
//   service moments and n = 8.
// - Ec: the example takes 3,640 ksi (n = 8); the 10th's Eq. 5.4.2.4-1 gives 4,266 ksi (n = 6.8).
// - c/de ≤ 0.42 (old 5.7.3.3.1) is gone; the 10th makes φ depend on the net tensile strain (5.5.4.2).
//   c is compared, and the sections are tension-controlled.
// - Shrinkage and temperature steel: the example uses 0.11 Ag/fy split between faces; the 10th's
//   Eq. 5.10.6-1 (≥ 0.11 in²/ft each face) is a different rule. Only the provided bars are compared.
// - Overhang Case 3: the example puts the wheel load over a 45 + 10X strip (MLL = 11.66 kip·ft/ft
//   factored). The tool takes 3.6.1.3.4's 1.0 klf line load 1 ft from the barrier face whenever the
//   girder to barrier face is ≤ 6 ft (here 2.5 ft): 3.6.1.3.4 allows it ("may"), and it gives a
//   quarter of the wheel's moment. Only the dead loads are compared.
// - Wheel position: the example keeps wheels 1 ft from the parapet for the whole deck; the tool keeps
//   them 2 ft from the barrier face (the lane edge) away from the overhang (3.6.1.3.1). Here it makes
//   no difference to the design moments.
//
// What the tool does not cover: Case 1B and 1C (the collision moment spread at 30° to the overhang and
// first-bay design sections), Case 3B, the overhang bars' cut-off and development lengths (Steps
// 2.14–2.15) and the 1% longitudinal steel over the piers (6.10.1.7, the steel girder tool's).
//
// Differences in the tool, not changed:
// - The example's dead load moments (Table 2-1) come from a model whose parapet moments are 5–9%
//   below the statics; the tool's agree with the statics, and with the example's own hand
//   calculations at the overhang (Cases 1A and 3A). Slab and wearing surface agree within 2%.
// - The effective span for distribution steel (9.7.2.3): the example takes S − bf/2 = 9.25 ft (a steel
//   girder's flange tips plus the flange overhang to the web); the tool takes S − bf = 8.75 ft for every
//   girder. Both give the 67% cap here.
// - Case 1 resistance with the axial tension: the example takes C = As fy − T about the bars; the tool
//   reduces As by T / (2 fy). The tool's is 1.3% lower here.
// Fixed with this benchmark: Cases 1 and 2 took the dead load at 1.0; Extreme Event II takes γp
// (Table 3.4.1-1), 1.25 for DC as in the example.

const near = (a: number, b: number, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

/** NHI-04-041's deck. The 0.5 in integral wearing surface is in t (its weight) and in the top cover
 * (2.5 in); the example leaves it out of the bottom bars' depth, so it is added to the bottom cover. */
const NHI: DeckInputs = {
  ...DECK_DEFAULTS,
  nGirders: 5,
  S: 9.75,
  overhang: 3.9375,
  t: 8.5,
  tEdge: 9,
  tFlange: 9,
  flange: 12, // bf = 1.0 ft (the example's assumption)
  dSection: 3, // bf / 4 from the web (4.6.2.1.6, steel girders)
  barrierWidth: 17.25,
  barrierWeight: 0.53,
  barrierCg: 6.16,
  wearing: 2.5,
  gammaWS: 0.14,
  utilities: 0,
  fc: 4,
  fy: 60,
  gammaC: 0.15,
  coverTop: 2.5,
  coverBot: 1.5,
  exposure: 1,
  topBars: { bar: 5, spacing: 6 },
  botBars: { bar: 5, spacing: 8 },
  topLong: { bar: 4, spacing: 10 },
  botLong: { bar: 5, spacing: 10 },
  overhangBars: { bar: 5, spacing: 6 }, // one more #5 bundled with each top bar
  Mc: 28.21, // Mco, the parapet's moment at its base
  T: 5.92, // Rw / (Lc + 2H) = 117.40 / (12.84 + 2 × 3.5)
  // Case 2 is not worked in the example (it never controls a concrete parapet).
  Fv: 18,
  Lv: 18,
  la: 0.5,
  rail: { type: "custom", testLevel: "TL-4", steel: "A1035" }, // custom: the barrier as entered
};

describe("deck: FHWA NHI-04-041 Design Step 2", () => {
  const r = designDeck(NHI);
  const g = r.geometry.girders;
  const S = NHI.S;

  it("strip widths and lanes (Table 4.6.2.1.3-1, 3.6.1.1.1)", () => {
    near(r.geometry.stripPos * 12, 90.35, 0.001);
    near(r.geometry.stripNeg * 12, 77.25, 0.001);
    near(r.geometry.W, 46.875, 1e-9);
    expect(r.geometry.lanes).toBe(3);
  });

  it("dead load moments: Table 2-1 (its 0.0 points are the design sections bf/4 into each bay)", () => {
    const at = (bay: number, f: number) => g[bay] + 0.25 + f * (S - 0.5);
    const slab = designDeck({ ...NHI, barrierWeight: 0, wearing: 0 }).moments.DC;
    const parapet = designDeck({ ...NHI, gammaC: 1e-9 }).moments.DC;
    const fws = r.moments.DW;
    // Slab and wearing surface: within 2% (or 0.01 kip·ft/ft).
    for (const [bay, f, s, w] of [[0, 0, -0.74, -0.06], [0, 0.4, 0.36, 0.17], [1, 0.4, 0.38, 0.09]] as const) {
      expect(Math.abs(slab(at(bay, f)) - s)).toBeLessThanOrEqual(Math.max(0.02 * Math.abs(s), 0.01));
      expect(Math.abs(fws(at(bay, f)) - w)).toBeLessThanOrEqual(Math.max(0.02 * Math.abs(w), 0.01));
    }
    // Parapet: the tool's follow the statics, 5–9% above the table's (−1.66, −0.82, 0.19).
    near(parapet(at(0, 0)), -1.66, 0.06);
    near(parapet(at(0, 0.4)), -0.82, 0.08);
    near(parapet(at(1, 0.4)), 0.19, 0.1);
  });

  it("live load moments: Table 2-2 (Method A) and Table A4-1 (Method B)", () => {
    // Positive: 36.76 kip·ft (one truck, m = 1.2) at 0.4S in Bay 1, so 6.49 kip·ft/ft with IM; A4-1 gives 6.74.
    near(r.pos.x, g[0] + 0.4 * S, 1e-9);
    near((r.pos.MLL * r.geometry.stripPos) / 1.33, 36.76, 0.03);
    near(r.pos.MLL, 6.49, 0.03);
    near(r.pos.MLL, 6.74, 0.02);
    // Negative: −29.40 kip·ft (two trucks) at 0.0S in Bay 4, the design section 3 in from girder 4: −6.07 kip·ft/ft.
    const neg = r.live(g[3] + 0.25, -1);
    near((neg * r.geometry.stripNeg) / 1.33, -29.4, 0.005);
    near(neg, -6.07, 0.005);
    // A4-1's −6.65 kip·ft/ft is an envelope over decks; the example's own analysis is 9% below it, the tool's the same.
    expect(neg).toBeGreaterThan(-6.65);
  });

  it("factored live load moments (Method A): 11.36 and −10.63 kip·ft/ft", () => {
    near(1.75 * r.pos.MLL, 11.36, 0.03);
    near(1.75 * r.live(g[3] + 0.25, -1), -10.63, 0.005);
  });

  it("bottom bars, #5 @ 8 in (Step 2.8)", () => {
    near(r.bottom.de, 6.69, 0.001);
    near(r.bottom.As, 0.465, 1e-6);
    near(r.bottom.a, 0.68, 0.01);
    near(r.bottom.c, 0.8, 0.01);
    // Tension-controlled: εt = 0.003 (de − c) / c ≥ 0.005, so φ = 0.9 (5.5.4.2).
    expect((0.003 * (r.bottom.de - r.bottom.c)) / r.bottom.c).toBeGreaterThan(0.005);
    // The example's Mu = 12.21 kip·ft/ft (Method A) needs 0.43 in²/ft; the bars carry it.
    expect(r.bottom.MR).toBeGreaterThan(12.21);
    expect(r.checks.find((c) => c.id === "pos-flexure")!.ok).toBe(true);
  });

  it("top bars, #5 @ 6 in (Steps 2.10, 2.14): Mn = 16.22, Mr = 14.60 kip·ft/ft", () => {
    near(r.top.de, 5.69, 0.001);
    near(r.top.a, 0.91, 0.005);
    near(r.top.c, 1.07, 0.005);
    near(r.top.Mn, 16.22, 0.001);
    near(r.top.MR, 14.6, 0.001);
    expect(r.top.MR).toBeGreaterThan(13.72); // the example's Method A Mu
  });

  it("service stress in the bars from the example's service moments, n = 8 (Steps 2.9, 2.11)", () => {
    const common = { fc: 4, fy: 60, Es: 29000, phiF: 0.9, exposure: 1 as const, n: 8, beta1: 0.85 };
    const bottom = flexure({ ...common, Mu: 12.21, Ms: 7.15, h: 8.5, cover: 1.5, bars: NHI.botBars });
    near(bottom.k, 0.262, 0.005);
    near(bottom.fss, 30.23, 0.002);
    const top = flexure({ ...common, Mu: 13.72, Ms: 8.53, h: 8.5, cover: 2.5, bars: NHI.topBars });
    near(top.k, 0.315, 0.005);
    near(top.fss, 32.44, 0.002);
  });

  it("overhang, Case 1A at the parapet face: Mu = 28.97 kip·ft/ft, Mr = 32.05", () => {
    const { case1 } = r.overhang;
    near(case1.h, 9, 1e-9);
    // The deck and parapet about the face, unfactored: 0.15 / 1.25 and 0.61 / 1.25.
    near(case1.MDC, (0.1125 * 1.4375 ** 2) / 2 + 0.53 * (1.4375 - 6.16 / 12), 0.001);
    near(case1.Mu, 28.97, 0.001);
    // As = 1.24 in²/ft (two #5 bundled at 6 in) with T = 5.92 kip/ft; the tool's As − T/(2fy) is 1.3% below.
    near(case1.MR, 32.05, 0.015);
    expect(case1.MR).toBeGreaterThan(case1.Mu);
  });

  it("overhang, Case 3A dead loads at the design section: 0.96 + 2.10 and 0.11 kip·ft/ft factored", () => {
    const { case3 } = r.overhang;
    near(case3.x, 3.6875, 1e-9);
    // The example carries the 9 in overhang to the design section; the tool tapers it to the flange edge.
    near(1.25 * case3.MDC, 0.96 + 2.1, 0.005);
    near(1.5 * case3.MDW, 0.11, 0.01);
  });

  it("distribution and temperature steel (Steps 2.16, 2.17)", () => {
    near(r.long.pct, 0.67, 1e-9);
    near(r.long.distRequired, 0.31, 0.01);
    near(r.long.botLong, 0.372, 0.001); // #5 @ 10 in
    near(r.long.topLong, 0.24, 1e-9); // #4 @ 10 in
    expect(r.checks.find((c) => c.id === "long-dist")!.ok).toBe(true);
    expect(r.checks.find((c) => c.id === "long-temp")!.ok).toBe(true);
  });

  it("the example's deck passes", () => {
    expect(r.ok).toBe(true);
  });
});
