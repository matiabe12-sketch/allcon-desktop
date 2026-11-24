import { describe, expect, it } from "vitest";
import { abutmentScour, alphaFor, contractionScour, criticalVelocity, designScour, fallVelocity, pierScour, SCOUR_DEFAULTS, type ScourAbutment, type ScourPier } from "./scour";

// Bridge scour against FHWA HEC-18, 5th Edition (FHWA-HIF-12-003): its worked examples in Chapters 6 to 8, printed
// results to the precision HEC-18 prints them.

const pier = (o: Partial<ScourPier>): ScourPier => ({ ...SCOUR_DEFAULTS.piers[0], debris: { on: false, shape: "rectangular", W: 0, H: 0 }, wide: false, ...o });

describe("contraction scour (HEC-18 Chapter 6)", () => {
  it("critical velocity Eq. 6.1: D50 1.0 mm in 10 ft of flow is about 2.4 ft/s (Example 2's Vc)", () => {
    expect(criticalVelocity(10, 1.0)).toBeCloseTo(2.4, 1);
    expect(criticalVelocity(10, 0.1)).toBeCloseTo(criticalVelocity(10, 0.2), 9); // the 0.2 mm floor (6.7)
  });
  it("fall velocity of natural sand (Ferguson and Church): 1 mm about 0.13 m/s, within the usual chart range", () => {
    expect(fallVelocity(1.0) / 3.28).toBeGreaterThan(0.11);
    expect(fallVelocity(1.0) / 3.28).toBeLessThan(0.17);
  });
  const base = { mode: "auto" as const, Q1: 2000, W1: 40, y1: 10, S1: 0.01, Q2: 2800, W2: 40, y0: 10, armor: false };
  const noPressure = { on: false, hu: 10, hb: 8, T: 3, Qb: 2800 };
  it("Example 1, pressure flow, clear-water: y2 10.5 ft, t 2.77 ft, ys 5.27 ft (only 0.5 ft without the deck)", () => {
    const r = contractionScour({ ...base, mode: "clear" }, { on: true, hu: 10, hb: 8, T: 3, Qb: 2800 }, 15);
    expect(r.yClear).toBeCloseTo(10.5, 1);
    expect(r.ys).toBeCloseTo(0.5, 1);
    expect(r.pressure!.t).toBeCloseTo(2.77, 2);
    expect(r.pressure!.ys).toBeCloseTo(5.27, 1);
    expect(r.governs).toBe("pressure");
    expect(r.depth).toBeCloseTo(r.pressure!.ys, 9);
  });
  it("Example 2, pressure flow, live-bed (k1 0.69): y2 13.3 ft, ys 8.1 ft", () => {
    const r = contractionScour({ ...base, mode: "live" }, { on: true, hu: 10, hb: 8, T: 3, Qb: 2800 }, 1.0);
    expect(r.k1).toBe(0.69);
    expect(r.yLive).toBeCloseTo(13.3, 1);
    expect(r.pressure!.ys).toBeCloseTo(13.35 + 2.77 - 8, 1);
  });
  it("Example 3, pressure flow, live-bed with overtopping: Que 1,811 cfs, y2 13.0 ft, t 3.05 ft, ys 8.05 ft", () => {
    const r = contractionScour({ ...base, mode: "live", Q2: 2200, y1: 12 }, { on: true, hu: 12, hb: 8, T: 3, Qb: 2200 }, 1.0);
    expect(r.pressure!.overtopping).toBe(true);
    expect(r.pressure!.t).toBeCloseTo(3.05, 2);
    expect(r.pressure!.y2).toBeCloseTo(13.0, 1);
    expect(r.pressure!.ys).toBeCloseTo(8.05, 1);
  });
  it("auto: live-bed when the approach velocity exceeds Vc; armoring takes the smaller depth", () => {
    const r = contractionScour(base, noPressure, 1.0);
    expect(r.V).toBeCloseTo(5, 9);
    expect(r.live).toBe(true);
    const armored = contractionScour({ ...base, armor: true }, noPressure, 1.0);
    expect(armored.y2).toBeCloseTo(Math.min(r.yLive, r.yClear), 9);
    const coarse = contractionScour(base, noPressure, 100);
    expect(coarse.live).toBe(false);
  });
});

describe("pier scour (HEC-18 Chapter 7)", () => {
  it("Example 1: a 4 ft round-nosed pier, y1 10.2 ft, V1 11.02 ft/s, plane bed: ys 9.9 ft", () => {
    const r = pierScour(pier({ shape: "round", a: 4, L: 59, bed: "plane" }), { y1: 10.2, V1: 11.02, angle: 0 }, 7.3);
    expect(r.Fr).toBeCloseTo(0.61, 2);
    expect(r.ys).toBeCloseTo(9.9, 1);
  });
  it("Example 2: at 20°, L/a 14.8 held at 12: K2 2.86, ys 28.3 ft", () => {
    const r = pierScour(pier({ shape: "round", a: 4, L: 59, bed: "plane" }), { y1: 10.2, V1: 11.02, angle: 20 }, 7.3);
    expect(r.K2).toBeCloseTo(2.86, 2);
    expect(r.ys).toBeCloseTo(28.3, 0);
  });
  it("Example 7, debris: triangular a*d 3.78 ft and ys 8.9 ft; without it 6.8 ft; rectangular a*d 7.3 ft", () => {
    const flow = { y1: 11.5, V1: 9, angle: 0 };
    const p = pier({ shape: "round", a: 2.5, L: 2.5, bed: "plane" });
    expect(pierScour(p, flow, 1).ys).toBeCloseTo(6.8, 1);
    const tri = pierScour({ ...p, debris: { on: true, shape: "triangular", W: 20, H: 4 } }, flow, 1);
    expect(tri.ad).toBeCloseTo(3.78, 2);
    expect(tri.ys).toBeCloseTo(8.9, 1);
    const rect = pierScour({ ...p, debris: { on: true, shape: "rectangular", W: 20, H: 4 } }, flow, 1);
    expect(rect.ad).toBeCloseTo(7.3, 1);
  });
  it("square nose K1 1.1, ignored past 5°; K3 by bed; multiple columns by spacing", () => {
    const flow = { y1: 10, V1: 6, angle: 0 };
    const sq = pierScour(pier({ shape: "square", a: 3, L: 3 }), flow, 1);
    const rd = pierScour(pier({ shape: "round", a: 3, L: 3 }), flow, 1);
    expect(sq.ys / rd.ys).toBeCloseTo(1.1, 9);
    expect(pierScour(pier({ shape: "square", a: 3, L: 3 }), { ...flow, angle: 10 }, 1).K1).toBe(1.0);
    expect(pierScour(pier({ shape: "round", a: 3, L: 3, bed: "large-dunes" }), flow, 1).K3).toBe(1.3);
    // Columns 12 ft apart (4 diameters) at 30°: the union of three 3 ft columns' widths, 3 + 2 × min(3, 12 sin 30°) = 9 ft.
    const close = pierScour(pier({ shape: "columns", a: 3, columns: { n: 3, spacing: 12 } }), { ...flow, angle: 30 }, 1);
    expect(close.a).toBeCloseTo(9, 9);
    expect(close.K2).toBe(1);
    // 15 ft apart (5 diameters): 1.2 times one column.
    const far = pierScour(pier({ shape: "columns", a: 3, columns: { n: 3, spacing: 15 } }), flow, 1);
    expect(far.ys / pierScour(pier({ shape: "circular", a: 3, L: 3 }), flow, 1).ys).toBeCloseTo(1.2, 9);
  });
  it("the wide-pier factor only where it applies (y/a < 0.8, a/D50 > 50, subcritical), and never above 1", () => {
    const wide = pierScour(pier({ shape: "round", a: 20, L: 40, wide: true }), { y1: 10, V1: 4, angle: 0 }, 1);
    expect(wide.wideApplies).toBe(true);
    expect(wide.Kw).toBeLessThan(1);
    const deep = pierScour(pier({ shape: "round", a: 3, L: 3, wide: true }), { y1: 10, V1: 4, angle: 0 }, 1);
    expect(deep.Kw).toBe(1);
  });
});

describe("abutment scour (HEC-18 Chapter 8, NCHRP 24-20)", () => {
  const ab = (o: Partial<ScourAbutment>): ScourAbutment => ({ ...SCOUR_DEFAULTS.abutments[0], ...o });
  it("the amplification curves read from Figures 8.9 to 8.12 give the examples' factors", () => {
    expect(alphaFor("A", "wingwall", 78.6 / 57)).toBeCloseTo(1.7, 1); // Example 3
    expect(alphaFor("B", "spill-through", 10.1 / 5.7)).toBeCloseTo(2.1, 1); // Example 4
    expect(alphaFor("A", "spill-through", 10)).toBeCloseTo(1.1, 9); // held at the chart's end
  });
  it("Example 3, condition (a), wingwall: yc 13.3 ft, ymax 22.6 ft, ys 12.6 ft", () => {
    // HEC-18 rounds q2c/q1 = 78.6/57.0 to 1.4 before using it.
    const r = abutmentScour(ab({ type: "wingwall", LBf: 0.85 }), { q1: 57, q2: 57 * 1.4, y1: 10, y0: 10 }, { D50: 1, tauc: 0, nFloodplain: 0.025 });
    expect(r.condition).toBe("A");
    expect(r.yc).toBeCloseTo(13.3, 1);
    expect(r.ys).toBeCloseTo(12.6, 0);
  });
  it("Example 4, condition (b) by grain size, spill-through: yc 6.6 ft, ymax 13.9 ft, ys 10.4 ft", () => {
    const r = abutmentScour(ab({ type: "spill-through", LBf: 0.6 }), { q1: 5.7, q2: 10.1, y1: 3.5, y0: 3.5 }, { D50: 0.3048, tauc: 0, nFloodplain: 0.025 });
    expect(r.condition).toBe("B");
    expect(r.yc).toBeCloseTo(6.6, 1);
    expect(r.ys).toBeCloseTo(10.4, 0);
  });
  it("Example 5, condition (b) by critical shear stress 0.04 psf, n 0.025: yc 5.1 ft", () => {
    const r = abutmentScour(ab({ type: "spill-through", LBf: 0.6 }), { q1: 5.7, q2: 10.1, y1: 3.5, y0: 3.5 }, { D50: 0.3, tauc: 0.04, nFloodplain: 0.025 });
    expect(r.yc).toBeCloseTo(5.1, 1);
  });
});

describe("total scour at each element (CDOT Scour Program Manual 3.4.5.5)", () => {
  it("a pier: LTD + contraction + local; an abutment: LTD + (ymax − y0); the elevation from the datum", () => {
    const i = { ...SCOUR_DEFAULTS, floods: SCOUR_DEFAULTS.floods.map((f) => ({ ...f, ltd: 2 })) };
    const r = designScour(i);
    const p = r.elements.find((e) => e.kind === "pier")!;
    const f = p.floods[0];
    expect(f.total).toBeCloseTo(2 + r.contraction[0].depth + r.piers[0].local[0].ys, 9);
    expect(f.elevation).toBeCloseTo(p.datum - f.total, 9);
    const a = r.elements.find((e) => e.kind === "abutment")!;
    expect(a.floods[0].total).toBeCloseTo(2 + r.abutments[0].local[0].ys, 9);
    expect(a.floods[0].contraction).toBe(0);
  });
  it("scour stops at non-erodible rock", () => {
    const i = { ...SCOUR_DEFAULTS, piers: [{ ...SCOUR_DEFAULTS.piers[0], datum: 100, rock: 98 }] };
    const f = designScour(i).elements[0].floods[0];
    expect(f.elevation).toBe(98);
    expect(f.rockLimited).toBe(true);
  });
});

// A CDOT bridge: I-70 Floyd Hill West Section (Clear Creek), the Bridge Hydraulics Report's Appendix G (2023), worked
// in FHWA's Hydraulic Toolbox 5.2 by HEC-18: a 4.5 ft round caisson at 56° to the flow, clear-water; a spill-through
// abutment by NCHRP 24-20 in condition (a), D50 0.4 mm.
describe("Floyd Hill West (CDOT), against FHWA Hydraulic Toolbox", () => {
  const caisson = pier({ shape: "round", a: 4.5, L: 4.5, bed: "clear" });
  it("pier, 200-year: y1 6.68 ft, V1 14.59 ft/s: K2 1.24, K3 1.10, ys 14.04 ft", () => {
    const r = pierScour(caisson, { y1: 6.68, V1: 14.59, angle: 56 }, 0.4);
    expect(r.Fr).toBeCloseTo(0.99, 2);
    expect(r.K2).toBeCloseTo(1.24, 2);
    expect(r.ys).toBeCloseTo(14.04, 1);
  });
  it("pier, 500-year: y1 7.10 ft, V1 15.53 ft/s: Fr 1.03, ys 14.54 ft", () => {
    const r = pierScour(caisson, { y1: 7.1, V1: 15.53, angle: 56 }, 0.4);
    expect(r.Fr).toBeCloseTo(1.03, 2);
    expect(r.ys).toBeCloseTo(14.54, 1);
  });
  it("abutment, 200-year, condition (a): q2/q1 1.04, yc 6.87 ft, α 1.45, ys 3.11 ft (the chart's steep end: within 0.1 ft)", () => {
    const r = abutmentScour({ ...SCOUR_DEFAULTS.abutments[0], type: "spill-through", LBf: 228.19 / 75.8 }, { q1: 96.41, q2: 99.95, y1: 6.66, y0: 6.83 }, { D50: 0.4, tauc: 0, nFloodplain: 0.035 });
    expect(r.condition).toBe("A");
    expect(r.yc).toBeCloseTo(6.87, 2);
    expect(Math.abs(r.alpha - 1.45)).toBeLessThan(0.03);
    expect(Math.abs(r.ys - 3.11)).toBeLessThan(0.15);
  });
});
