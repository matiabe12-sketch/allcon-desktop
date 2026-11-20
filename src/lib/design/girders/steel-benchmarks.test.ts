import { describe, expect, it } from "vitest";
import { designSteelGirder, STEEL_DEFAULTS, type SteelGirderInputs } from "./steel";
import { appendixA6 } from "./steel-appendix";
import { bearingStiffener } from "./steel-details";
import { shearC } from "./steel";
import { nonprismaticBeam } from "./steel-beam";
import { ex3Grid, ex3Loads, EX3_MOMENTS } from "./steel-ex3.fixture";
import { deadEffects, gridGeometry, gridModel, liveExtremes } from "./steel-grid";
import { ES, plasticMoment, sectionProps, type DeckSection, type SteelSegment } from "./steel-section";

// Published designs beyond FHWA Example 2A and the NSBA standard plans:
//  - Caltrans Bridge Design Practice 6.2 (October 2022), a 110-165-125 ft continuous plate girder (AASHTO 8th
//    Edition with California amendments, which these tests leave out: the P15 permit truck and their Mn formula);
//  - FHWA/NHI-04-041, LRFD steel girder design example, two 120 ft spans (its moments by line analysis);
//  - FHWA Steel Bridge Design Handbook Design Example 3, curved, against its 3D finite element results (grid).

const within = (a: number, b: number, rel: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.abs(b));
const plate = (b: number, t: number) => ({ b, t });
const seg = (length: number, top: [number, number], D: number, tw: number, bot: [number, number]): SteelSegment => ({ length, kind: "plate", D, tw, top: plate(...top), bottom: plate(...bot) });

describe("Caltrans BDP 6.2: three spans 110-165-125 ft, 78 × 5/8 in web", () => {
  // Tables 6.2.7-1, -2: constant stiffness, DC1 2.0 klf, one lane of HL-93 with 33% IM.
  const b = nonprismaticBeam([110, 165, 125], () => 1, 80, []).beam;
  it("the dead load moments of a 2.0 klf load", () => {
    within(b.uniformAll(0, 44, 2).M, 1329, 0.01);
    within(b.uniformAll(0, 110, 2).M, -3959, 0.01);
    within(b.uniformAll(1, 82.5, 2).M, 2615, 0.01);
    within(b.uniformAll(1, 165, 2).M, -4422, 0.01);
    within(b.uniformAll(2, 75, 2).M, 1981, 0.01);
  });
  it("one lane of HL-93: positive moments in each span, the piers' negative moments, the abutment's shear", () => {
    within(b.liveEnvelope(0, 44).Mpos, 2713, 0.01);
    within(b.liveEnvelope(1, 82.5).Mpos, 3455, 0.01);
    within(b.liveEnvelope(2, 75).Mpos, 3168, 0.01);
    within(b.liveEnvelope(0, 110).Mneg, -3426, 0.01);
    within(b.liveEnvelope(1, 165).Mneg, -3563, 0.01);
    within(b.liveEnvelope(0, 0).V, 116.2, 0.025);
  });

  const deck: DeckSection = { beff: 144, ts: 9.125, tGross: 9.125, haunch: 4.125 - 1, n: 8, fc: 3.6, fy: 60, bars: [] };
  const pos = seg(0, [18, 1], 78, 0.625, [18, 1.75]);
  it("the composite section at span 2's middle: Mp 21,203 kip·ft (the slab, not the bars), Dp 12.75 in", () => {
    const pm = plasticMoment(pos, deck, true);
    within(pm.Mp / 12, 21203, 0.003);
    within(pm.Dp, 12.75, 0.01);
  });
  it("My 15,274 kip·ft from its factored DC1 3,269 and DC2 + DW 1,185 kip·ft (D6.2.2); Mn = 1.3 Rh My = 19,856", () => {
    const nc = sectionProps(pos, "steel", null);
    const lt = sectionProps(pos, "3n", { ...deck, n: 8 });
    const sh = sectionProps(pos, "n", deck);
    const M1 = 3269 * 12;
    const M2 = 1185 * 12;
    const MAD = Math.min((50 - M1 / nc.Sbot - M2 / lt.Sbot) * sh.Sbot, (50 - M1 / nc.Stop - M2 / lt.Stop) * sh.Stop);
    within((M1 + M2 + MAD) / 12, 15274, 0.003);
    within((1.3 * (M1 + M2 + MAD)) / 12, 19856, 0.003);
  });
  it("Appendix A6 at bent 3, the 18 × 2 in flanges noncomposite: Rpc 1.033, Mnc 14,690 kip·ft by lateral-torsional buckling (Lb 27.5 ft, Cb 1.51)", () => {
    const a = appendixA6({ D: 78, tw: 0.625, bfc: 18, tfc: 2, bft: 18, tft: 2, Dc: 39, Dcp: 39, Mp: 15961 * 12, Myc: 14221 * 12, Myt: 14221 * 12, SxcElastic: 3413, Fyc: 50, Fyt: 50, Fyw: 50, Rh: 1, Lb: 330, Cb: 1.51, rolled: false });
    within(a.Rpc, 1.033, 0.002);
    within(a.Mnc / 12, 14690, 0.003);
  });
  it("the engine's distribution factors for the interior girder: moment 0.900, 0.805, 0.869 by span; shear 1.082 (Table 6.2.7-6)", () => {
    const neg = seg(0, [18, 2], 78, 0.625, [18, 2]);
    const i: SteelGirderInputs = {
      ...STEEL_DEFAULTS,
      spans: [110, 165, 125],
      nGirders: 5,
      S: 12,
      overhang: 5,
      barrierWidth: 1.75,
      deckT: 9.125,
      sacrificial: 0,
      haunch: 4.125,
      n: 8,
      fcDeck: 3.6,
      girder: "interior",
      braces: [],
      appendixA6: false,
      redistribution: false,
      segments: [{ ...pos, length: 77 }, { ...neg, length: 82.5 }, { ...pos, length: 66 }, { ...neg, length: 87 }, { ...pos, length: 87.5 }],
    };
    const r = designSteelGirder(i);
    within(r.df.spans[0].interior.moment, 0.9, 0.003);
    within(r.df.spans[1].interior.moment, 0.805, 0.003);
    within(r.df.spans[2].interior.moment, 0.869, 0.003);
    within(r.df.spans[1].interior.shear, 1.082, 0.002);
  });
});

describe("FHWA/NHI-04-041: two 120 ft spans, 54 × 1/2 in web, flanges stepped at 84 and 96 ft", () => {
  // Figure 3-4 and Table 3-4: 103 in effective width, 8 in slab, 3.5 in haunch to the web, n = 8.
  const deck: DeckSection = { beff: 103, ts: 8, tGross: 8.5, haunch: 3.5 - 0.625, n: 8, fc: 4, fy: 60, bars: [] };
  const segAt = (X: number) => {
    const x = X > 120 ? 240 - X : X;
    return x < 84 ? seg(0, [14, 0.625], 54, 0.5, [14, 0.875]) : x < 96 ? seg(0, [14, 1.25], 54, 0.5, [14, 1.375]) : seg(0, [14, 2.5], 54, 0.5, [14, 2.75]);
  };
  const line = (stage: "steel" | "3n" | "n") => nonprismaticBeam([120, 120], (X) => (ES * sectionProps(segAt(X), stage, stage === "steel" ? null : { ...deck, haunch: 3.5 - segAt(X).top.t }).I) / 144, 80, []).beam;
  it("Table 3-4: the positive section's moments of inertia, steel 22,115, 3n 48,999 and n 66,340 in⁴", () => {
    const p = seg(0, [14, 0.625], 54, 0.5, [14, 0.875]);
    within(sectionProps(p, "steel", null).I, 22114.8, 0.002);
    within(sectionProps(p, "3n", deck).I, 48998.7, 0.003);
    within(sectionProps(p, "n", deck).I, 66340.3, 0.003);
  });
  it("Table 3-5: the pier section's, steel 65,427, 3n 97,918 and n 130,196 in⁴", () => {
    const p = seg(0, [14, 2.5], 54, 0.5, [14, 2.75]);
    const d = { ...deck, haunch: 3.5 - 2.5 };
    within(sectionProps(p, "steel", null).I, 65426.6, 0.002);
    within(sectionProps(p, "3n", d).I, 97918.3, 0.003);
    within(sectionProps(p, "n", d).I, 130196.1, 0.003);
  });
  it("Table 3-10: LL+IM with the interior girder's 0.696, 1,908 kip·ft at 0.4L and −2,450 at the pier (the slab effective throughout)", () => {
    const b = line("n");
    within(0.696 * b.liveEnvelope(0, 48).Mpos, 1908, 0.01);
    within(0.696 * b.liveEnvelope(0, 120).Mneg, -2450, 0.035);
  });
  it("Design Step 3.8: the positive section's Mp 7,419 kip·ft, the plastic neutral axis 6.85 in into the slab", () => {
    const pm = plasticMoment(seg(0, [14, 0.625], 54, 0.5, [14, 0.875]), deck, true);
    within(pm.Mp / 12, 7419, 0.002);
    within(pm.Dp, 6.85, 0.005);
  });
  it("Design Step 3.10: My 4,592 kip·ft from its MD1 1,510 and MD2 590 (D6.2.2), so Mn = 1.3 Rh My = 5,970 (6.10.7.1.2-3)", () => {
    const p = seg(0, [14, 0.625], 54, 0.5, [14, 0.875]);
    const nc = sectionProps(p, "steel", null);
    const lt = sectionProps(p, "3n", deck);
    const sh = sectionProps(p, "n", deck);
    const M1 = 1510 * 12;
    const M2 = 590 * 12;
    const MAD = Math.min((50 - M1 / nc.Sbot - M2 / lt.Sbot) * sh.Sbot, (50 - M1 / nc.Stop - M2 / lt.Stop) * sh.Stop);
    within((M1 + M2 + MAD) / 12, 4592, 0.003);
    within((1.3 * (M1 + M2 + MAD)) / 12, 5970, 0.003);
  });
  it("Design Step 3.11: the pier's unstiffened web, D/tw 108: C by the 10th Edition's 1.57 (the example's 2nd Edition used 1.52: 0.378)", () => {
    expect(shearC(54, 0.5, 50, 5)).toBeCloseTo((1.57 / 108 ** 2) * ((29000 * 5) / 50), 9);
    expect((shearC(54, 0.5, 50, 5) * 1.52) / 1.57).toBeCloseTo(0.378, 3);
  });
  it("Design Step 5.2: the abutment's 5.5 × 11/16 in bearing stiffeners, 1 in clips: Is 87.22 in⁴, r 2.69 in, Pn 593.3 kip; bearing 1.4 Apn Fys (the 2nd Edition's 309.4 kip without the 1.4)", () => {
    const b = bearingStiffener({ bt: 5.5, tp: 0.6875, Fys: 50, clip: 1, pairsEnd: 1, pairsPier: 1, gap: 0 }, 1, 54, 0.5);
    within(b.Is, 87.22, 0.002);
    within(b.r, 2.69, 0.003);
    within(b.Pn, 593.3, 0.005);
    within(b.Rr / 1.4, 309.4, 0.002);
  });
  // Its dead load moments (Table 3-7) come from an analysis whose stiffness the example doesn't give: per klf on the
  // girder alone they solve to 843 at 0.4L and −2,213 kip·ft at the pier, against 770 and −2,396 here with the same
  // plates (Table 3-5's properties match exactly). Not a benchmark.
});

describe("FHWA Design Example 3, curved (R 700 ft, 160-210-160 ft), by the grid against its 3D finite element analysis", { timeout: 120000 }, () => {
  const g = ex3Grid();
  const geo = gridGeometry(g);
  const L = ex3Loads();
  const steel = gridModel(g, geo, "steel");
  const long = gridModel(g, geo, "3n");
  const short = gridModel(g, geo, "n");
  const conc = deadEffects(geo, steel, L.dc1conc);
  const dc2 = deadEffects(geo, long, (j) => L.dc2(j));
  const dw = deadEffects(geo, long, (j) => L.dw(j));
  const kOf = (X: number) => geo.stations.reduce((b, x, q) => (Math.abs(x - X) < Math.abs(geo.stations[b] - X) ? q : b), 0);
  const pts = { span1: kOf(64), pier: kOf(160), span2: kOf(265) };
  const live = (j: number, k: number, negative: boolean) => {
    const lam = short.adjoint(short.momentRow(j, k)!);
    const r = liveExtremes(g, geo, Float64Array.from(geo.nodes.map((_, n) => -lam[n * 3])), { IM: 0.33, roadway: [-18.75, 18.75], lanes: 3, negative });
    return (negative ? r.neg : r.pos) / 12;
  };
  it("the abutment reactions per girder (Tables 1-4): within 5% or 1 kip", () => {
    const ref = { conc: [66, 71, 78, 92], dc2: [17, 7, 8, 23], dw: [13, 15, 16, 18] };
    for (const [d, r] of [[conc, ref.conc], [dc2, ref.dc2], [dw, ref.dw]] as const)
      d.V.forEach((v, j) => expect(Math.abs(v[0] - r[j])).toBeLessThanOrEqual(Math.max(1, 0.05 * r[j])));
  });
  it("the curve's sharing: the outside girder G4 over the inside G1, within 5% of the 3D analysis's", () => {
    const ratio = (d: typeof conc, k: number) => d.M[3][k] / d.M[0][k];
    for (const [p, k] of Object.entries(pts)) {
      const R4 = EX3_MOMENTS.G4[p as keyof typeof pts];
      const R1 = EX3_MOMENTS.G1[p as keyof typeof pts];
      within(ratio(conc, k), R4.conc / R1.conc, 0.05);
      within(ratio(dc2, k), R4.dc2 / R1.dc2, 0.08);
    }
    within(live(3, pts.span1, false) / live(0, pts.span1, false), EX3_MOMENTS.G4.span1.pos / EX3_MOMENTS.G1.span1.pos, 0.05);
  });
  it("the moments themselves 5% to 16% below the 3D analysis's (its moments exceed what its reactions give a girder line, and its live load includes centrifugal force)", () => {
    for (const [name, j] of [["G1", 0], ["G4", 3]] as const)
      for (const [p, k] of Object.entries(pts)) {
        const ref = EX3_MOMENTS[name][p as keyof typeof pts];
        for (const [ours, theirs] of [[conc.M[j][k], ref.conc], [dc2.M[j][k], ref.dc2], [dw.M[j][k], ref.dw]]) {
          expect(ours / theirs).toBeGreaterThan(0.84);
          expect(ours / theirs).toBeLessThan(1.0);
        }
      }
  });
});
