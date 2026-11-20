import { describe, expect, it } from "vitest";
import { designSteelGirder, STEEL_DEFAULTS, type SteelGirderInputs } from "./steel";
import { appendixA6, effectivePlasticMoment, redistributionMoment } from "./steel-appendix";
import { singleAngle, stabilityBracing } from "./steel-crossframe";
import { ES } from "./steel-section";

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.abs(b));

// FHWA Steel Bridge Design Handbook, Design Example 2A, Section 8.2.1: the pier section by Appendix A6 and
// the moment redistributed by Appendix B6, from the example's own inputs.
describe("Appendices A6 and B6 against FHWA Example 2A's pier section", () => {
  const a6 = appendixA6({
    D: 42,
    tw: 0.5,
    bfc: 16,
    tfc: 1.25,
    bft: 14,
    tft: 1.125,
    Dc: 23.06,
    Dcp: 26.74,
    Mp: 61515,
    Myc: 4233 * 12,
    Myt: 3715 * 12,
    SxcElastic: 1016,
    Fyc: 50,
    Fyt: 50,
    Fyw: 50,
    Rh: 1,
    Lb: 120,
    Cb: 1.26,
    rolled: false,
  });
  it("applies: 2Dc/tw 92.24 ≤ λrw 137.27, Iyc/Iyt 1.7", () => {
    expect(a6.applicable).toBe(true);
    near(a6.lw, 92.24, 0.001);
    near(a6.lrw, 137.27, 0.001);
    near(a6.IycIyt, 1.7, 0.03); // 1.659, printed 1.7
  });
  it("noncompact web: λpw(Dcp) 56.11, λpw(Dc) 48.39, Rpc 1.107, Rpt 1.192", () => {
    expect(a6.compact).toBe(false);
    near(a6.lpwDcp, 56.11, 0.002);
    near(a6.lpwDc, 48.39, 0.002);
    near(a6.Rpc, 1.107, 0.001);
    near(a6.Rpt, 1.192, 0.001);
  });
  it("compact flange, Mnc = Rpc Myc = 4,686 kip·ft; Mnt = Rpt Myt = 4,428 kip·ft; rt 4.234 in", () => {
    near(a6.flb / 12, 4686, 0.001);
    near(a6.Mnc / 12, 4686, 0.001); // LTB at the plateau too
    near(a6.Mnt / 12, 4428, 0.001);
    near(a6.rt, 4.234, 0.001);
  });
  it("Mpe = 1.033 Mn = 4,574, not above Mn = 4,428; Mrd = 5,365 − 4,428 = 937 kip·ft, 17.5% of Me", () => {
    const Mn = Math.min(a6.Mnc, a6.Mnt);
    const raw = (2.63 - 2.3 * (16 / 1.25) * Math.sqrt(50 / ES) - 0.35 * (42 / 16) + 0.39 * (16 / 1.25) * Math.sqrt(50 / ES) * (42 / 16)) * Mn;
    near(raw / 12, 4574, 0.001);
    const mpe = effectivePlasticMoment({ Mn, D: 42, bfc: 16, tfc: 1.25, Fyc: 50, enhanced: false });
    near(mpe.strength / 12, 4428, 0.001);
    const rd = redistributionMoment(-5365 * 12, mpe.strength);
    near(rd.Mrd / 12, 937, 0.005);
    expect(rd.Mrd).toBeLessThan(rd.limit);
  });
});

describe("the girder with Appendix B6", { timeout: 60000 }, () => {
  const r = designSteelGirder(STEEL_DEFAULTS);
  const q = r.b6.piers[0];
  it("checks the pier's B6.2 requirements over its 10 ft unbraced lengths and redistributes", () => {
    expect([q.a, q.b]).toEqual([80, 100]);
    expect(q.qualifies).toBe(true);
    expect(q.useA6).toBe(true);
    expect(q.Mrd).toBeGreaterThan(0);
    expect(q.Mrd).toBeLessThan(0.2 * Math.abs(q.Me));
    // Yield moments by D6.2.3 (the bars yield at their own 60 ksi); the example takes the bars at 50 ksi,
    // so its tension side governs (Mrd 937) where compression governs here.
    near(q.Myc, 4233, 0.02);
  });
  it("adds the redistribution moment to positive flexure and drops the 1.3RhMy cap (6.10.7.1.2)", () => {
    const pos = r.checks.find((c) => c.id === "flex-pos")!;
    expect(pos.note).toContain("Mrd");
    expect(pos.note).not.toContain("1.3RhMy");
  });
  it("doesn't redistribute where a pier section misses a B6.2 limit", () => {
    const skew = designSteelGirder({ ...STEEL_DEFAULTS, skew: 15 });
    expect(skew.b6.active).toBe(false);
    expect(skew.checks.find((c) => c.id.startsWith("b6-req-1-0"))!.ok).toBe(false);
  });
});

describe("the deck's pour sequence (6.10.3.4)", { timeout: 60000 }, () => {
  it("one pour over the whole girder gives the single placement's flange stress and deflection", () => {
    const base = designSteelGirder(STEEL_DEFAULTS);
    const one = designSteelGirder({ ...STEEL_DEFAULTS, pours: [{ from: 0, to: 180, order: 1 }] });
    near(one.checks.find((c) => c.id === "pour-yield")!.demand, base.checks.find((c) => c.id === "con-yield")!.demand, 1e-5);
    near(one.camber[4].deck, base.camber[4].deck, 1e-5);
  });
  it("placing the positive moment regions first raises their moment and puts the first pour's deck in tension", () => {
    const seq: SteelGirderInputs = { ...STEEL_DEFAULTS, pours: [{ from: 0, to: 70, order: 1 }, { from: 110, to: 180, order: 2 }, { from: 70, to: 110, order: 3 }] };
    const r = designSteelGirder(seq);
    const base = designSteelGirder(STEEL_DEFAULTS);
    expect(r.checks.find((c) => c.id === "pour-fnc")!.demand).toBeGreaterThan(base.checks.find((c) => c.id === "con-fnc")!.demand);
    expect(r.checks.find((c) => c.id === "pour-deck")!.demand).toBeGreaterThan(0);
    expect(r.camber[4].deck).toBeGreaterThan(base.camber[4].deck);
  });
});

describe("cross-frames (6.7.4.2.2, 6.9.4.4)", { timeout: 60000 }, () => {
  it("single angle: (Kℓ/r)eff = 72 + 0.75 ℓ/rx up to 80, then 32 + 1.25 ℓ/rx", () => {
    const a = singleAngle("L5X5X1/2", 100, 50);
    near(a.eff, 72 + 0.75 * (100 / a.rx), 1e-12);
    const b = singleAngle("L4X4X3/8", 125, 50);
    near(b.eff, 32 + 1.25 * (125 / b.rx), 1e-12);
    expect(b.slenderness).toBeGreaterThan(140);
  });
  it("stiffness by hand: X-type with compression diagonals, full depth, three girders' in-plane term", () => {
    const cf = { type: "X" as const, diagonal: "L5X5X1/2", strut: "L5X5X1/2", hb: 36, Fy: 50, fullDepthPlates: true, plateWidth: 10, plateThickness: 0.5 };
    const s = stabilityBracing({ cf, S: 120, ng: 4, L: 1080, n: 4, Mu: 1000 * 12, Iyeff: 400, Ix: 16000, Cb: 1, Lb: 240, ho: 43, D: 42, tw: 0.4375, girderDepth: 44 });
    const Ad = 0.65 * 4.79;
    const Ld = Math.hypot(120, 36);
    near(s.bbr, (Ad * ES * 120 ** 2 * 36 ** 2) / Ld ** 3, 1e-9);
    expect(s.bsec).toBe(Infinity);
    near(s.bg, (24 * 9 * 120 ** 2 * ES * 16000) / (4 * 1080 ** 3), 1e-9);
    near(s.req, (2.4 * 1080 * 12000 ** 2) / (0.8 * 4 * ES * 400), 1e-9);
    near(s.Mbr, ((2.4 * 1080 * 12000 ** 2) / (4 * ES * 400)) * (240 / (500 * 43)), 1e-9);
    near(s.Fdiag, ((s.Mbr / 120) * Ld) / 36, 1e-9);
  });
  it("checks Example 2A's girder: the bracing is stiff enough and its L5x5x1/2 members pass", () => {
    const r = designSteelGirder(STEEL_DEFAULTS);
    for (const c of r.checks.filter((x) => x.id.startsWith("cf-"))) expect(c.ok, c.name).toBe(true);
  });
});
