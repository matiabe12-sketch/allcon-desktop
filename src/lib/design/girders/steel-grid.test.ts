import { describe, expect, it } from "vitest";
import { designSteelGirder, STEEL_DEFAULTS } from "./steel";
import { deadEffects, gridGeometry, gridModel, jEquivalent, leverStrip, leverWeights, liveExtremes, type GridInput } from "./steel-grid";

// The grid (refined analysis, AASHTO 4.6.3.3) against statics, closed forms and the line girder.

const I = 50000;
const base: GridInput = {
  spans: [100],
  nGirders: 4,
  S: 10,
  overhang: 3.5,
  barrierWidth: 1.5,
  radius: 0,
  skew: 0,
  braces: [20, 40, 60, 80],
  extraStations: [],
  section: (_X, st) => ({ I: st === "steel" ? I : st === "3n" ? 1.5 * I : 2 * I, J: 20, Cw: 2e5 }),
  cf: { type: "X", Ad: 0.65 * 4.79, As: 0.65 * 4.79, hb: 36 },
  deck: { ts: 8, Ec: 3600 },
  E: 29000,
  G: 11200,
};
const within = (a: number, b: number, rel: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.abs(b));

describe("the grid's statics", () => {
  const geo = gridGeometry(base);
  const k = geo.stations.findIndex((x) => Math.abs(x - 50) < 1e-6);
  it("a uniform load on every girder: each takes wL²/8, the cross-frames nothing", () => {
    for (const stage of ["steel", "3n", "n"] as const) {
      const d = deadEffects(geo, gridModel(base, geo, stage), () => 1.2);
      d.M.forEach((r) => within(r[k], (1.2 * 100 ** 2) / 8, 1e-7));
      d.frames.flat().forEach((f) => expect(Math.abs(f)).toBeLessThan(1e-6));
    }
  });
  it("one girder loaded: the girders share its moment, which they sum to", () => {
    const d = deadEffects(geo, gridModel(base, geo, "n"), (j) => (j === 0 ? 1 : 0));
    within(d.M.reduce((s, r) => s + r[k], 0), 1250, 1e-7);
    expect(d.M[0][k]).toBeGreaterThan(d.M[1][k]);
    expect(d.M[1][k]).toBeGreaterThan(d.M[2][k]);
  });
  it("the lever rule: shares that sum to the load, the overhang's cantilever on the exterior girder", () => {
    const ys = [-15, -5, 5, 15];
    const w = leverWeights(ys, -17);
    expect(w[0]).toBeCloseTo(1.2, 12);
    expect(w[1]).toBeCloseTo(-0.2, 12);
    const strip = leverStrip(ys, 1, -18.5, 18.5);
    expect(strip.reduce((s, v) => s + v, 0)).toBeCloseTo(37, 9);
  });
  it("warping restrained at the brace points stiffens the torsion: J ≤ Jeq, approaching J for long lengths", () => {
    expect(jEquivalent(20, 2e5, 240, 29000, 11200)).toBeGreaterThan(20);
    expect(jEquivalent(20, 2e5, 1e6, 29000, 11200) / 20).toBeLessThan(1.01);
  });
});

describe("HL-93 placed on the influence surface (3.6.1.3.1, 3.6.1.1.2)", () => {
  it("a 100 ft span's midspan moment, the same on every girder line: two lanes of 1520 × 1.33 + 800 kip·ft", () => {
    const geo = gridGeometry(base);
    const infl = Float64Array.from(geo.nodes.map((n) => (n.X <= 50 ? n.X / 2 : (100 - n.X) / 2)));
    const r = liveExtremes(base, geo, infl, { IM: 0.33, roadway: [-17, 17], lanes: 2, negative: false });
    // The truck's middle axle at midspan: 8 × 18 + 32 × 25 + 32 × 18; the lane 0.64 L² / 8; two lanes at 1.0.
    expect(r.pos).toBeCloseTo(2 * ((8 * 18 + 32 * 25 + 32 * 18) * 1.33 + (0.64 * 100 ** 2) / 8), 6);
    // The fatigue truck alone (30 ft rear axles), 15% IM: its middle axle at midspan, 8 × 18 + 32 × 25 + 32 × 10.
    expect(r.fatigue.max).toBeCloseTo((8 * 18 + 32 * 25 + 32 * 10) * 1.15, 6);
  });
});

describe("a curved simple span against the rigid cross-section (the V-load method's equilibrium)", () => {
  it("the outside girder's moment over the average: 1 + 0.104 x n L² / (R Σx²) at midspan", () => {
    const R = 1000;
    const g: GridInput = { ...base, radius: R, cf: { ...base.cf, Ad: 20, As: 20 }, section: () => ({ I, J: 5, Cw: 1e4 }) };
    const geo = gridGeometry(g);
    const k = geo.stations.findIndex((x) => Math.abs(x - 50) < 1e-6);
    const d = deadEffects(geo, gridModel(g, geo, "steel"), () => 1);
    const mean = d.M.reduce((s, r) => s + r[k], 0) / 4;
    const expected = 1 + (0.1042 * 15 * 4 * 100 ** 2) / (R * 500);
    within(d.M[3][k] / mean, expected, 0.03);
    within(d.M[0][k] / mean, 2 - expected, 0.03);
    // The girders' total, about the radial line, is the static moment (the outer girders' longer arcs carry more).
    within(mean, 1250, 0.02);
  });
});

describe("FHWA Example 2A by the grid", { timeout: 120000 }, () => {
  const line = designSteelGirder(STEEL_DEFAULTS);
  const g = designSteelGirder({ ...STEEL_DEFAULTS, analysis: "grid" });
  const at = (r: typeof line, X: number) => r.stations.find((s) => Math.abs(s.X - X) < 0.01)!;
  it("DC1 as the line girder's (the deck's lever shares nearly equal); the barriers more on the exterior girder", () => {
    within(at(g, 36).M.dc1, at(line, 36).M.dc1, 0.03);
    expect(at(g, 36).M.dc2).toBeGreaterThan(at(line, 36).M.dc2);
  });
  it("the live load somewhat below AASHTO's distribution factors, as refined analyses find", () => {
    const ratio = at(g, 36).M.llPos / at(line, 36).M.llPos;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.0);
  });
  it("every check passes, with the cross-frames' forces and fatigue ranges from the grid", () => {
    expect(g.checks.filter((c) => !c.ok && !c.advisory).map((c) => c.name)).toEqual([]);
    expect(g.grid!.strut.range).toBeGreaterThan(0);
    expect(g.crossFrames!.connections[0].fatigue).not.toBeNull();
  });
});
