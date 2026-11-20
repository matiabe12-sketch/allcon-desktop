import { describe, expect, it } from "vitest";
import { designSteelGirder, flangeFnc, momentGradientCb, shearC, STEEL_DEFAULTS, webRb, type SteelGirderInputs } from "./steel";

// The steel girder check against published designs:
//  - FHWA Steel Bridge Design Handbook, Design Example 2A (two 90 ft spans, AASHTO 5th Edition), the defaults;
//  - AISC/NSBA Standard Plans for Steel Bridges (January 2025, AASHTO 10th Edition, designed with NSBA's
//    LRFD SIMON): their reactions per girder, and their girders passing every check close to their limits.

const check = (r: ReturnType<typeof designSteelGirder>, id: string) => r.checks.find((c) => c.id === id)!;
const within = (a: number, b: number, rel: number) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThanOrEqual(rel);

describe("FHWA Design Example 2A (two 90 ft spans)", () => {
  const r = designSteelGirder(STEEL_DEFAULTS);
  it("distribution factors: interior moment 0.734 and shear 0.952, exterior moment 0.860 (rigid cross-section)", () => {
    expect(r.df.spans[0].interior.moment).toBeCloseTo(0.734, 3);
    expect(r.df.spans[0].interior.shear).toBeCloseTo(0.952, 3);
    expect(r.df.spans[0].exterior.moment).toBeCloseTo(0.86, 3);
  });
  it("Strength I: 4,192 kip·ft at 36 ft, 5,365 kip·ft at the pier, 257 kip at the abutment, 337 kip at the pier", () => {
    const at = (X: number) => r.stations.find((s) => Math.abs(s.X - X) < 0.01)!;
    within(at(36).Mpos, 4192, 0.02);
    within(-at(90).Mneg, 5365, 0.02);
    within(at(0).Vu, 257, 0.01);
    within(at(90).Vu, 337, 0.01);
    // DC2 and DW agree closely; DC1 is about 5% lower here because the example analyzes every load on the
    // short-term composite stiffness, while DC1 is carried by the steel alone (6.10.1.5).
    within(at(36).M.dc2, 147, 0.01);
    within(at(36).M.dw, 120, 0.01);
  });
  it("shear resistance of the 7/16 in web: C = 0.494, Vcr = 263.2 kip", () => {
    expect(shearC(42, 0.4375, 50, 5)).toBeCloseTo(0.494, 3);
    within(check(r, "shear").capacity, 263.2, 0.001);
  });
  it("live load deflection 0.610 in", () => within(r.deflections[0].deflection, 0.61, 0.03));
  it("the pier section fails negative flexure by 6.10.8 without moment redistribution, as in the example", () => {
    const plain = designSteelGirder({ ...STEEL_DEFAULTS, appendixA6: false, redistribution: false });
    expect(check(plain, "flex-neg-c").ok).toBe(false);
  });
  it("with Appendices A6 and B6, as the example designs it, every check passes", () => {
    expect(r.b6.active).toBe(true);
    expect(r.checks.filter((c) => !c.ok && !c.advisory).map((c) => c.name)).toEqual([]);
  });
});

const pl = (b: number, t: number) => ({ b, t });
type Seg = [number, number, number, [number, number], [number, number]];
/** An NSBA standard plan: 8 ft spacing, five girders, 37 ft deck, 8 in slab, 20° skew, their dead loads. */
const nsba = (spans: number[], segs: Seg[], crossFrames: number, dc1 = 0.93, stiffeners: SteelGirderInputs["stiffeners"] = []): SteelGirderInputs => ({
  ...STEEL_DEFAULTS,
  braces: [],
  appendixA6: false,
  redistribution: false,
  spans,
  nGirders: 5,
  S: 8,
  overhang: 2.5,
  barrierWidth: 1.5,
  skew: 20,
  deckT: 8,
  sacrificial: 0,
  haunch: 4,
  haunchTo: "web",
  n: 0,
  bars: { pct: 1, top: 2 / 3, topCover: 2.5, bottomCover: 1.75, fy: 60 },
  segments: segs.map(([length, D, tw, top, bot]) => ({ length, kind: "plate", D, tw, top: pl(...top), bottom: pl(...bot) })),
  crossFrames,
  stiffeners,
  loads: { ...STEEL_DEFAULTS.loads, mode: "entered", dc1, dc2: 0.3, dw: 0.16 },
  skewShearInterior: true,
});

describe("AISC/NSBA Standard Plans, 8 ft spacing", () => {
  const cases: { name: string; inputs: SteelGirderInputs; reactions: number[][] }[] = [
    {
      name: "two 100 ft spans",
      inputs: nsba([100, 100], [[70, 42, 0.5, [16, 1], [18, 1.25]], [60, 42, 0.5, [22, 1.25], [22, 1.75]], [70, 42, 0.5, [16, 1], [18, 1.25]]], 20),
      reactions: [[51, 6, 73, 24], [190, 20, 122, 64]],
    },
    {
      name: "two 130 ft spans (stiffened near the pier)",
      inputs: nsba(
        [130, 130],
        [[91, 54, 0.5, [16, 1], [18, 1.25]], [19, 54, 0.5, [22, 1], [22, 1]], [40, 54, 0.5, [22, 1.5], [22, 1.75]], [19, 54, 0.5, [22, 1], [22, 1]], [91, 54, 0.5, [16, 1], [18, 1.25]]],
        22,
        0.93,
        [{ from: 103, to: 157, spacing: 162 }], // stiffeners at 103 and 116.5 ft from each end: 13.5 ft panels (3D),
      ),
      reactions: [[67, 8, 75, 31], [248, 27, 133, 83]],
    },
    { name: "one 100 ft span", inputs: nsba([100], [[100, 42, 0.5, [15, 1], [16, 1.25]]], 25, 0.92), reactions: [[71, 8, 76, 28]] },
  ];
  for (const c of cases)
    it(`${c.name}: the published reactions, and every check passing near its limit`, () => {
      const r = designSteelGirder(c.inputs);
      c.reactions.forEach(([dc, dw, truck, lane], k) => {
        const x = r.reactions[k];
        expect(Math.abs(x.dc - dc)).toBeLessThanOrEqual(1.5);
        expect(Math.abs(x.dw - dw)).toBeLessThanOrEqual(1.5);
        expect(Math.abs(x.truck - truck)).toBeLessThanOrEqual(1.5);
        expect(Math.abs(x.lane - lane)).toBeLessThanOrEqual(1.5);
      });
      expect(r.checks.filter((x) => !x.ok).map((x) => x.name)).toEqual([]);
      // An optimized design: some check governs close to its limit.
      expect(r.governing).toBeGreaterThan(0.85);
    });
});

describe("the AASHTO 10th Edition resistances", () => {
  it("LTB with Fyr = 0.5 Fyc and Lp = 1.1 rt √(E/Fyc) (6.10.8.2.3a)", () => {
    const f = flangeFnc({ bfc: 16, tfc: 1.25, Dc: 21, tw: 0.5, Fyc: 50, Fyw: 50, Lb: 30 * 12, Cb: 1, Rb: 1, Rh: 1 });
    const rt = 16 / Math.sqrt(12 * (1 + (21 * 0.5) / (3 * 16 * 1.25)));
    expect(f.rt).toBeCloseTo(rt, 9);
    expect(f.Lp).toBeCloseTo(1.1 * rt * Math.sqrt(29000 / 50), 9);
    expect(f.Lr).toBeCloseTo(Math.PI * rt * Math.sqrt(29000 / 25), 9);
    expect(f.ltb).toBeCloseTo((1 - 0.5 * ((360 - f.Lp) / (f.Lr - f.Lp))) * 50, 9);
  });
  it("Cb by the quarter points (Eq. 6.10.8.2.3b-1): 1.0 for uniform moment, 1.67 for a linear moment from M to 0", () => {
    expect(momentGradientCb(100, 100, 100, 100)).toBeCloseTo(1, 9);
    expect(momentGradientCb(100, 75, 50, 25)).toBeCloseTo(12.5 / (2.5 + 2.25 + 2 + 0.75), 9);
  });
  it("Rb = 1 for a stocky web; reduced for a slender one (Eq. 6.10.1.10.2-3)", () => {
    expect(webRb(21, 0.5, 16, 1.25, 50)).toBe(1);
    expect(webRb(60, 0.4375, 14, 0.75, 50)).toBeLessThan(1);
  });
});
