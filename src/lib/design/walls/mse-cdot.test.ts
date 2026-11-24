import { describe, expect, it } from "vitest";
import { designMseWall, embedmentRule, GEO_PRODUCTS, MSE_DEFAULTS, MSE_LEGACY, REINFORCEMENTS, type MseInputs } from "./mse";
import { cdotMinLength, cdotQuantities, truncatedMinLength, wallSegments } from "./mse-quantities";
import { copingFlexure, designAnchorSlab, RAIL_NONE, slabStability, slabWeight } from "./mse-rail";
import { takeoffFor } from "../takeoff";

// The CDOT options of the MSE wall against CDOT's B-504 worksheets (their quantity sheets' worked examples and design
// criteria) and NCHRP Report 663's design example (Appendix J); the MASH loads of NCHRP Web Document 326.

const PLAIN = { ...MSE_DEFAULTS, ...MSE_LEGACY } as MseInputs;

describe("CDOT quantity sheets (per foot of wall)", () => {
  it("B-504-Q7, core wall with 1:1 excavation: DH 16, RL 11.2, H 8, θ 30°: h 28.28, EM1 16.8, BM1 12.39, MRS 6.64, PLG 28.7", () => {
    const q = cdotQuantities({ base: "core", DH: 16, L: 11.2, H: 8, theta: 30 })!;
    expect(q.h).toBeCloseTo(28.28, 2);
    expect(q.EM1).toBeCloseTo(16.8, 1);
    expect(q.BM1).toBeCloseTo(12.39, 2);
    expect(q.MRS).toBeCloseTo(6.64, 2);
    expect(q.PLG).toBeCloseTo(28.7, 1);
  });
  it("B-504-Q4, truncated base, ¾:1 soil: DH 16, H 8, θ 30°: h 13.44, EM1 7.32, BM1 8.0, MRS 7.8, PLG 19.2 (bottom 0.45 DH)", () => {
    const q = cdotQuantities({ base: "truncated-soil", DH: 16, L: 0.45 * 16, H: 8, theta: 30 })!;
    expect(q.RL).toBeCloseTo(13.2, 1); // 0.825 DH (the sheet's 0.83 DH, 13.28 ft)
    expect(q.h).toBeCloseTo(13.44, 2);
    expect(q.EM1).toBeCloseTo(7.32, 1);
    expect(q.BM1 / 8.0).toBeCloseTo(1, 1); // the sheet's RL rounded to 0.83 DH
    expect(q.MRS / 7.8).toBeCloseTo(1, 1);
    expect(q.PLG).toBeCloseTo(19.2, 1);
  });
  it("B-504-Q3, truncated base, ½:1 rock: h 9.09, EM1 5.63, BM1 6.8, MRS 6.6, PLG 15.2", () => {
    const q = cdotQuantities({ base: "truncated-rock", DH: 16, L: 0.45 * 16, H: 8, theta: 30 })!;
    expect(q.h).toBeCloseTo(9.09, 2);
    expect(q.EM1).toBeCloseTo(5.63, 2);
    expect(q.BM1).toBeCloseTo(6.8, 1);
    expect(q.MRS).toBeCloseTo(6.64, 2);
    expect(q.PLG).toBeCloseTo(15.2, 1);
  });
  it("the least lengths: B-504-D1's 6, 7, 8 ft for short walls then 0.7 DH; a truncated base's 0.45 DH or 4 ft", () => {
    expect(cdotMinLength(4)).toBe(6);
    expect(cdotMinLength(7)).toBe(7);
    expect(cdotMinLength(10)).toBe(8);
    expect(cdotMinLength(16)).toBeCloseTo(11.2, 9);
    expect(truncatedMinLength(6)).toBe(4);
    expect(truncatedMinLength(20)).toBe(9);
  });
  it("segments along the wall: each at its average height, the totals summed", () => {
    const s = wallSegments([{ station: 100, DH: 8, excH: 4 }, { station: 150, DH: 16, excH: 8 }, { station: 200, DH: 16, excH: 8 }], { base: "core", H: 16, L: 11.2, theta: 30 });
    expect(s.length).toBe(100);
    expect(s.segments[0].DH).toBe(12);
    expect(s.segments[0].L).toBeCloseTo(8.4, 9);
    expect(s.facing).toBeCloseTo(12 * 50 + 16 * 50, 9);
    expect(s.MRS).toBeCloseTo((12 * 8.4 * 50 + 16 * 11.2 * 50) / 27, 6);
    expect(s.maxDH).toBe(16);
  });
});

describe("NCHRP Report 663 Appendix J: the barrier-moment slab", () => {
  it("sliding: W 56.10 kips over 30 ft, tan φr 0.577: P 32.39, φP 25.91 ≥ 10 kips; overturning about B: φM 88.88 ≥ 35.83 kip-ft", () => {
    const st = slabStability({ W: 56.1, tanPhiR: Math.tan(Math.PI / 6), l: 21.13 / 12, h: 43 / 12, Ls: 10, phiSlide: 0.8, phiOT: 0.9 });
    expect(st.P).toBeCloseTo(32.39, 1);
    expect(st.phiP).toBeCloseTo(25.91, 1);
    expect(st.Mo).toBeCloseTo(35.83, 2);
    expect(st.M).toBeCloseTo(98.76, 1);
    expect(st.phiM).toBeCloseTo(88.88, 1);
  });
  it("the coping: 54 kips × 38 in = 171 kip-ft against #6 @ 10 over 10 ft, d 9 in: φMn about 205 kip-ft", () => {
    const c = copingFlexure({ Ld: 54, hc: 38 / 12, BL: 10, t: 11.375, cover: 2, bar: 6, spacing: 10, fc: 4, fy: 60 });
    expect(c.Mu).toBeCloseTo(171, 1);
    expect(c.d).toBeCloseTo(9, 2);
    expect(c.phiMn / 205.41).toBeCloseTo(1, 1);
  });
  it("its weight from the parts, and the anchor slab worked out by test level (Web Doc 326: φ 1.0)", () => {
    const r = { ...RAIL_NONE, kind: "anchor-slab" as const, level: "TL-4-2" as const };
    const w = slabWeight(r);
    expect(w.w).toBeCloseTo(0.5 + 5 * 1 * 0.15 + 1 * 1.5 * 0.15 + 3.5 * 1 * 0.125, 9);
    const a = designAnchorSlab(r, { phiFill: 34, fc: 4.5, fy: 60 });
    expect(a.W).toBeCloseTo(w.w * 30, 9);
    expect(a.phiP).toBeCloseTo(a.W * Math.tan((34 * Math.PI) / 180), 9);
    expect(a.h).toBeCloseTo((30 + 12 + 18) / 12, 9);
    const pre = designAnchorSlab({ ...r, precast: true }, { phiFill: 34, fc: 4.5, fy: 60 });
    expect(pre.tanPhiR).toBeCloseTo((2 / 3) * Math.tan((34 * Math.PI) / 180), 9);
  });
});

describe("AASHTO LRFD 10th: resistance factors and embedment", () => {
  it("Table 11.5.7-1 and 11.5.8: geosynthetic tensile 0.80 (geostrips 0.55), pullout 0.70; with earthquake 1.0; metals as before", () => {
    const f = Object.fromEntries(REINFORCEMENTS.map((k) => [k.id, [k.phiT, k.phiPO, k.phiTEE, k.phiPOEE]]));
    expect(f.geogrid).toEqual([0.8, 0.7, 1.0, 1.0]);
    expect(f.geostrip).toEqual([0.55, 0.7, 1.0, 1.0]);
    expect(f.steelstrip).toEqual([0.75, 0.9, 1.0, 1.2]);
    expect(f.steelgrid).toEqual([0.65, 0.9, 0.85, 1.2]);
    const r = designMseWall({ ...PLAIN, seismic: false });
    const l = r.internal.layers[0];
    expect(l.Pr).toBeCloseTo(0.7 * l.unit * l.Le, 12);
    expect(l.Tr).toBeCloseTo(0.8 * PLAIN.Tal * PLAIN.Rc, 12);
  });
  it("11.10.2.2: 1 ft on level ground with no erosion, 2 ft on slopes or with erosion, the frost depth, and Table C11.10.2.2-1's guide", () => {
    const base = { H: 16, wallType: "wall" as const };
    expect(embedmentRule({ ...base, erosion: false }).required).toBeCloseTo(1, 12);
    expect(embedmentRule({ ...base, erosion: true }).required).toBeCloseTo(2, 12);
    expect(embedmentRule({ ...base, erosion: false, frontSlope: 4 }).least).toBe(2); // 4H:1V is sloping ground
    expect(embedmentRule({ ...base, erosion: false, frontSlope: 6 }).least).toBe(1);
    expect(embedmentRule({ ...base, erosion: false, frost: 3 }).required).toBe(3);
    expect(embedmentRule({ H: 30, wallType: "wall", erosion: false }).required).toBeCloseTo(1.5, 12); // H/20
    expect(embedmentRule({ H: 30, wallType: "abutment", erosion: false }).required).toBeCloseTo(3, 12); // H/10
    expect(embedmentRule({ H: 21, wallType: "wall", frontSlope: 2 }).required).toBeCloseTo(3, 12); // H/7
    expect(embedmentRule({ H: 20, wallType: "wall", frontSlope: 1.5 }).required).toBeCloseTo(4, 12); // H/5
    expect(embedmentRule({ H: 10, wallType: "wall", onRock: true }).least).toBe(0);
    const r = designMseWall({ ...PLAIN, H: 10, L: 8, embedment: 1.25, erosion: false, seismic: false });
    expect(r.checks.find((c) => c.id === "geom-embed")!.ok).toBe(true);
    expect(designMseWall({ ...PLAIN, H: 10, L: 8, embedment: 1.25, erosion: true, seismic: false }).checks.find((c) => c.id === "geom-embed")!.ok).toBe(false);
  });
});

describe("the MSE wall with CDOT's options", () => {
  it("a core wall with the options off is the plain AASHTO wall", () => {
    const a = designMseWall(PLAIN);
    const b = designMseWall({ ...PLAIN, base: "core", hma: { t: 0, gamma: 0.14 }, rail: RAIL_NONE });
    expect(b.groups.StrMax.sigma).toBeCloseTo(a.groups.StrMax.sigma, 12);
  });
  it("pavement adds its DW surcharge (1.5 for bearing) and raises σv in every layer", () => {
    const a = designMseWall({ ...PLAIN, seismic: false });
    const b = designMseWall({ ...PLAIN, seismic: false, hma: { t: 12, gamma: 0.14 } });
    expect(b.loads.DWV).toBeCloseTo(0.14 * PLAIN.L, 9);
    expect(b.groups.StrMax.V - a.groups.StrMax.V).toBeCloseTo(1.5 * 0.14 * PLAIN.L, 9);
    b.internal.layers.forEach((l, k) => expect(l.sigmaV - a.internal.layers[k].sigmaV).toBeCloseTo(0.14, 9));
  });
  it("a truncated base: lengths grow up the cut, the base width is L, and the reinforced triangle's weight is counted", () => {
    const r = designMseWall({ ...PLAIN, seismic: false, base: "truncated-soil", H: 16, L: 7.2 });
    expect(r.geometry.T).toBeCloseTo(7.2 + 0.75 * 16, 9);
    const top = r.internal.layers[0];
    expect(top.Lz).toBeCloseTo(7.2 + 0.75 * (16 - top.z), 9);
    expect(r.loads.EV1).toBeCloseTo(PLAIN.gammaR * (16 * 7.2 + 0.5 * 0.75 * 256), 9);
    expect(r.checks.find((c) => c.id === "geom-length")!.demand).toBeCloseTo(7.2, 9);
    expect(r.checks.some((c) => c.id === "geom-global")).toBe(true);
  });
  it("a truncated base's bearing by CDOT's method (whole weight at the bottom's center): B-504-H2's 9.709 and 8.963 TSF at DH = 40 ft", () => {
    // The charts' own inputs: Class 1 at 125 pcf and 34° on both sides, roadway with 3 in HMA, 2 ft surcharge.
    const chart = { ...PLAIN, gammaR: 0.125, gammaRet: 0.125, phiR: 34, phiRet: 34, phiF: 34, delta: null, wallType: "wall" as const, trafficDistance: 1, liveLoad: true, seismic: false, backslope: 0, hma: { t: 3, gamma: 0.14 }, H: 40, embedment: 2 };
    const soil = designMseWall({ ...chart, base: "truncated-soil", L: 18 });
    const rock = designMseWall({ ...chart, base: "truncated-rock", L: 18 });
    for (const [r, cdot] of [[soil, 9.709], [rock, 8.963]] as const) {
      expect(r.groups.StrMax.e).toBeGreaterThan(0); // toward the toe, not swung to the heel
      expect(r.geometry.bearingTsf / cdot).toBeCloseTo(1, 1); // within 5%
    }
    // A core wall keeps its moments about the center: B-504-H2's 4.721 TSF.
    const core = designMseWall({ ...chart, base: "core", L: 28 });
    expect(core.geometry.bearingTsf / 4.721).toBeCloseTo(1, 1);
  });
  it("zones and products: each layer's spacing and long-term strength Tult / (RFID RFCR RFD); the top two at 2 × RL", () => {
    const r = designMseWall({ ...PLAIN, seismic: false, zoned: true, zones: [{ bottom: 8, Sv: 2, product: "hdpe7800" }, { bottom: 100, Sv: 1.5, product: "hdpe12000" }], topProduct: "pp4800", extendTop: true, rf: { id: 1.3, cr: 2.55, d: 1.1 }, topLayer: 1 });
    const L = r.internal.layers;
    expect(L[1].z - L[0].z).toBeCloseTo(2, 9);
    const deep = L.find((l) => l.z > 8)!;
    expect(L[L.indexOf(deep) + 1].z - deep.z).toBeCloseTo(1.5, 9);
    expect(L[0].product.Tal).toBeCloseTo(4.8 / (1.3 * 1.8 * 1.1), 9);
    expect(L[2].product.Tal).toBeCloseTo(7.8 / (1.3 * 2.55 * 1.1), 9);
    expect(deep.product.Tal).toBeCloseTo(12 / (1.3 * 2.55 * 1.1), 9);
    expect(L[0].Lz).toBeCloseTo(2 * PLAIN.L, 9);
    expect(L[2].Lz).toBeCloseTo(PLAIN.L, 9);
    expect(GEO_PRODUCTS.length).toBe(5);
  });
  it("the barrier on a moment slab: its stability, the coping, and the impact on the top two layers (Web Doc 326)", () => {
    const r = designMseWall({ ...PLAIN, seismic: false, rail: { ...RAIL_NONE, kind: "anchor-slab", level: "TL-4-2" } });
    for (const id of ["rail-slide", "rail-ot", "rail-coping", "int-impact-pullout-1", "int-impact-yield-1", "int-impact-pullout-2", "int-impact-yield-2"]) expect(r.checks.some((c) => c.id === id)).toBe(true);
    const im = r.rail.impact[0]; // layer 1 at 1.25 ft, 2.5 ft apart: its tributary 0 to 2.5 ft, 2.25 in the first band
    expect(im.o[0]).toBeCloseTo(2.25, 9);
    expect(im.o[1]).toBeCloseTo(0.25, 9);
    expect(im.Fp).toBeCloseTo(0.37 * 2.25 + 0.27 * 0.25, 9);
    expect(im.Fy).toBeCloseTo(1.755 * 2.25 + 0.3 * 0.25, 9);
    // The bands are shared out in full, whatever the spacing (pd × At, Web Doc 326 9.2).
    for (const Sv of [1, 1.5, 2.5]) {
      const x = designMseWall({ ...PLAIN, seismic: false, Sv, topLayer: Sv / 2, rail: { ...RAIL_NONE, kind: "anchor-slab", level: "TL-4-2" } });
      expect(x.rail.impact.reduce((t, m) => t + m.Fy, 0)).toBeCloseTo(1.755 * 2.25 + 0.3 * 2.5, 9);
    }
    const l = r.internal.layers[0];
    expect(im.P).toBeCloseTo(l.unit * l.Lz, 9); // the full length
    expect(im.demandR).toBeCloseTo(im.Fs + im.Fy / l.product.RFcr, 9); // the dynamic part without creep
  });
  it("the take-off: CDOT's pay quantities, per foot × length or summed over the segments", () => {
    const one = takeoffFor("mse-wall", MSE_DEFAULTS, { length: 50 })!;
    const q = designMseWall(MSE_DEFAULTS).quantities.cdot!;
    expect(one.quantities.excavation!.value).toBeCloseTo(q.EM1 * 50, 9);
    expect(one.quantities.backfill!.value).toBeCloseTo(q.BM1 * 50, 9);
    expect(one.quantities.waterproofing!.value).toBeCloseTo((q.PLG * 50) / 9, 9);
    const pts = [{ station: 0, DH: 10, excH: 5 }, { station: 60, DH: 21, excH: 8 }, { station: 100, DH: 15, excH: 6 }];
    const t = takeoffFor("mse-wall", { ...MSE_DEFAULTS, segments: pts }, { length: 50 })!;
    const s = designMseWall({ ...MSE_DEFAULTS, segments: pts }).quantities.segments!;
    expect(t.length!.value).toBe(100);
    expect(t.quantities.facing!.value).toBeCloseTo(s.facing, 9);
    expect(t.quantities.excavation!.value).toBeCloseTo(s.EM1, 9);
    expect(t.quantities["soil-reinforcement"]!.value).toBeCloseTo(s.MRS, 9);
    expect(t.quantities.excavation!.terms).toHaveLength(2);
  });
  it("CDOT's no-analysis option: a retaining wall skips the seismic analysis; an abutment keeps it (AASHTO 11.5.4.2); the defaults work out", () => {
    const wall = designMseWall({ ...MSE_DEFAULTS, wallType: "wall" });
    expect(wall.groups.EEMax).toBeUndefined();
    expect(wall.checks.find((c) => c.id === "geom-seismic")!.name).toMatch(/No seismic analysis/);
    const r = designMseWall(MSE_DEFAULTS); // an abutment
    expect(MSE_DEFAULTS.wallType).toBe("abutment");
    expect(r.groups.EEMax).toBeDefined();
    expect(r.checks.find((c) => c.id === "geom-seismic")!.name).toMatch(/kept/);
    // A backslope over a truncated base is flagged for project-specific review.
    expect(designMseWall({ ...MSE_DEFAULTS, base: "truncated-soil", L: 9.45 }).checks.some((c) => c.id === "geom-trunc-slope")).toBe(true);
    expect(r.quantities.cdot!.sheet).toBe("B-504-Q7");
    expect(r.geometry.bearingTsf).toBeCloseTo(r.groups.StrMax.sigma / 2, 12);
    expect(r.checks.filter((c) => !c.ok && !c.advisory).map((c) => c.id)).toEqual([]);
    // CDOT's 4,800 lb/ft woven geotextile carries Web Doc 326's TL-4 yield pressure with the top two layers 1 ft apart
    // (the default), but not as the top layer at 2 ft spacing, where it takes the whole first band.
    expect(MSE_DEFAULTS.topProduct).toBe("pp4800");
    const spread = designMseWall({ ...MSE_DEFAULTS, zoned: false, Sv: 2, topLayer: 1.25 });
    expect(spread.checks.find((c) => c.id === "int-impact-yield-1")!.ok).toBe(false);
  });
});
