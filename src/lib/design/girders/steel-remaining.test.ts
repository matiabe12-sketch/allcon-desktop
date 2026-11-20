import { describe, expect, it } from "vitest";
import { designSteelGirder, STEEL_DEFAULTS, steelGirderInputs, type SteelGirderInputs } from "./steel";
import { momentRotation, refinedRedistribution, rotationalStiffness, thetaRL } from "./steel-appendix";
import { cfConnection, CF_CONNECTION_DEFAULTS } from "./steel-connection";
import { angle } from "./steel-crossframe";
import { ES } from "./steel-section";

// The cross-frames' connections (6.13), the wind's lateral bending of the bottom flange at Strength III and V
// (C4.6.2.7.1), the refined method of Appendix B6.6, and horizontally curved girders within 4.6.1.2.4b,
// against hand calculations on FHWA Design Example 2A.

const within = (a: number, b: number, rel = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));

describe("cross-frame connections (AASHTO 6.13)", () => {
  const a = angle("L5X5X1/2");
  const c = cfConnection(CF_CONNECTION_DEFAULTS, "L5X5X1/2", -20, 10, 50, 1000, 75, 2);
  it("bolts in shear: 0.45 Ab Fub per plane (threads included), φs 0.80, two 7/8 in A325", () => {
    within(c.Rshear, 2 * 0.8 * 0.45 * ((Math.PI * 0.875 ** 2) / 4) * 120);
  });
  it("bearing: 1.2 Lc t Fu ≤ 2.4 d t Fu for the end and inner bolts, φbb 0.80", () => {
    const dh = 0.9375;
    const end = Math.min(1.2 * (1.5 - dh / 2) * 0.5 * 65, 2.4 * 0.875 * 0.5 * 65);
    const inner = Math.min(1.2 * (3 - dh) * 0.5 * 65, 2.4 * 0.875 * 0.5 * 65);
    within(c.Rbearing, 0.8 * (end + inner));
  });
  it("slip: Kh Ks Ns Pt per bolt, Class B 0.50, Pt 39 kip", () => within(c.Rslip, 2 * 0.5 * 39));
  it("the angle in tension: U = 0.60 for two bolts (larger than 1 − x̄/L), holes punched (Rp 0.9)", () => {
    expect(c.U).toBeCloseTo(0.6, 9);
    within(c.Ptension, Math.min(0.95 * 50 * a.A, 0.8 * 65 * (a.A - a.t) * 0.9 * 0.6));
  });
  it("block shear: shear along the bolt line, tension to the leg's toe", () => {
    const h = 1;
    const Avg = (1.5 + 3) * a.t;
    const Avn = Avg - 1.5 * h * a.t;
    const Atn = (a.b - 3 - 0.5 * h) * a.t;
    within(c.Rblock, 0.8 * 0.9 * Math.min(0.58 * 65 * Avn + 65 * Atn, 0.58 * 50 * Avg + 65 * Atn));
  });
  it("fatigue of the member at its connection: category D for punched holes, Δf = ΔP / (U Ag)", () => {
    const f = cfConnection({ ...CF_CONNECTION_DEFAULTS, fatigueRange: 5 }, "L5X5X1/2", 10, 5, 50, 1000, 75, 2);
    expect(f.fatigue!.cat).toBe("D");
    within(f.fatigue!.range, 5 / (0.6 * a.A));
    // 1000 trucks a day at 2 cycles is below category D's infinite-life traffic: Fatigue II, (A / N)^(1/3).
    expect(f.fatigue!.combo).toBe("Fatigue II");
    within(f.fatigue!.Fn, (22e8 / (365 * 75 * 2 * 1000)) ** (1 / 3));
  });
  it("welded: 2 × 0.6 φe2 Fexx 0.707 w L, fatigue category E′", () => {
    const w = cfConnection({ ...CF_CONNECTION_DEFAULTS, kind: "welded", weld: 0.3125, weldLength: 8, fatigueRange: 3 }, "L5X5X1/2", 20, 0, 50, 1000, 75, 2);
    within(w.Rweld, 2 * 0.6 * 0.8 * 70 * 0.707 * 0.3125 * 8);
    expect(w.fatigue!.cat).toBe("E'");
  });
  it("Example 2A's cross-frames: both members' connections pass", () => {
    const r = designSteelGirder(STEEL_DEFAULTS);
    expect(r.crossFrames!.connections.length).toBe(2);
    expect(r.checks.filter((x) => x.id.startsWith("cfc-") && !x.ok)).toEqual([]);
  });
});

describe("the wind on the bottom flange (C4.6.2.7.1), Strength III and V", { timeout: 60000 }, () => {
  const r = designSteelGirder(STEEL_DEFAULTS);
  it("W = η γ PD d / 2: Strength V at 80 mph, on the girder's 44.375 in depth", () => {
    within(r.windW.V, (2.56e-6 * 80 ** 2 * 1.3 * (44.375 / 12)) / 2);
    expect(r.windW.III).toBe(0); // no site wind speed given
  });
  it("fℓ = 6 (W Lb² / 10) / (tf bf²) on the 16 × 1¼ in bottom flange over a 20 ft bay", () => {
    const fl = r.checks.find((x) => x.id === "s5-fl")!;
    within(fl.demand, (((r.windW.V * 20 ** 2) / 10) * 12 * 6) / (1.25 * 16 ** 2));
  });
  it("Strength III with a 115 mph site wind; none for an interior girder", () => {
    const iii = designSteelGirder({ ...STEEL_DEFAULTS, wind: { ...STEEL_DEFAULTS.wind, V: 115 } });
    expect(iii.combos).toEqual(["I", "III", "V"]);
    expect(designSteelGirder({ ...STEEL_DEFAULTS, girder: "interior" }).combos).toEqual(["I"]);
  });
  it("Example 2A as designed passes every check, Strength V included", () => {
    expect(r.checks.filter((c) => !c.ok && !c.advisory).map((c) => c.name)).toEqual([]);
    expect(r.checks.some((c) => c.id.startsWith("s5-"))).toBe(true);
  });
});

describe("the wind during construction (Strength III on the bare steel, C4.6.2.7.1)", { timeout: 60000 }, () => {
  it("each flange's W Lb² / 10 + W L² / (8 Nb) on tf bf² / 6, 1.25 DC1; a 70 mph wind on Example 2A", () => {
    const r = designSteelGirder({ ...STEEL_DEFAULTS, wind: { ...STEEL_DEFAULTS.wind, construction: 70 } });
    const wc = r.windConstruction!;
    within(wc.PZ, 2.56e-6 * 70 ** 2 * 1.3, 1e-3); // Kz 1.0 at 33 ft, exposure C
    within(wc.Wbot, (wc.PZ * (44.375 / 12)) / 2);
    within(wc.Wtop, wc.PZ * (44.375 / 24 + (2 + 8.5) / 12));
    const fl = r.checks.find((c) => c.id === "cw-fl")!;
    expect(fl.demand).toBeGreaterThan(0);
    // The top flange (14 × 3/4 in) over a 20 ft bay in the 90 ft span: its first-order fℓ, before any amplification.
    const flTop = (((wc.Wtop * 20 ** 2) / 10 + (wc.Wtop * 90 ** 2) / 32) * 12 * 6) / (0.75 * 14 ** 2);
    expect(fl.demand).toBeGreaterThanOrEqual(flTop - 1e-9);
    expect(designSteelGirder({ ...STEEL_DEFAULTS, girder: "interior", wind: { ...STEEL_DEFAULTS.wind, construction: 70 } }).windConstruction).toBeNull();
  });
});

describe("Appendix B6.6, the refined method", { timeout: 60000 }, () => {
  it("θRL by Eq. B6.6.2-2 for 2A's 16 × 1¼ in flange and 42 in web: 0.0289 rad", () => {
    const s = 12.8 * Math.sqrt(50 / ES);
    within(thetaRL({ D: 42, bfc: 16, tfc: 1.25, Fyc: 50, enhanced: false }), 0.128 - 0.143 * s - 0.0216 * 2.625 + 0.0241 * s * 2.625);
    expect(thetaRL({ D: 42, bfc: 16, tfc: 1.25, Fyc: 50, enhanced: true }) - thetaRL({ D: 42, bfc: 16, tfc: 1.25, Fyc: 50, enhanced: false })).toBeCloseTo(0.009, 12);
  });
  it("kθ for two equal prismatic spans: 3EI / (2L)", () => {
    const EI = 29000 * 50000;
    const K = rotationalStiffness([90, 90], () => EI);
    within(K[0][0], (3 * EI) / (2 * 90 * 12), 1e-6);
  });
  it("one pier: continuity meets the curve on its rising branch, θp = (Me − 0.7 φMn) / (kθ + 60 φMn)", () => {
    const sol = refinedRedistribution({ Me: [60000], Mn: [55000], phi: 1, K: [[3e6]], yielding: [true] });
    const t = (60000 - 0.7 * 55000) / (3e6 + 60 * 55000);
    within(sol[0].theta, t);
    within(sol[0].M, 55000 * momentRotation(t));
    within(sol[0].Mrd, 3e6 * t);
  });
  it("a pier that may not yield stays elastic and takes the others' redistribution", () => {
    const K = rotationalStiffness([90, 120, 90], () => 29000 * 50000);
    const sol = refinedRedistribution({ Me: [60000, 60000], Mn: [50000, 80000], phi: 1, K, yielding: [true, false] });
    expect(sol[1].theta).toBe(0);
    expect(sol[1].Mrd).toBeLessThan(0); // its hogging grows
    within(sol[0].M, 50000 * momentRotation(sol[0].theta), 1e-6);
  });
  it("Example 2A by the refined method: every check passes, θp within θRL at Strength I and Service II", () => {
    const r = designSteelGirder({ ...STEEL_DEFAULTS, redistributionMethod: "refined" });
    expect(r.b6.refined).toBe(true);
    const q = r.b6.piers[0];
    expect(q.byCombo.I.theta).toBeGreaterThan(0);
    expect(q.byCombo.I.theta).toBeLessThan(q.thetaRL);
    expect(r.checks.filter((c) => !c.ok && !c.advisory).map((c) => c.name)).toEqual([]);
  });
});

describe("horizontally curved girders within AASHTO 4.6.1.2.4b", { timeout: 60000 }, () => {
  const i: SteelGirderInputs = { ...STEEL_DEFAULTS, radius: 2000 };
  const r = designSteelGirder(i);
  it("Las / R: 0.9 × 90 / 2000 for the end spans of a continuous girder, below 0.06", () => {
    within(r.checks.find((c) => c.id === "curve-span-0")!.demand, (0.9 * 90) / 2000);
    expect(r.checks.find((c) => c.id === "curve-span-0")!.ok).toBe(true);
    expect(designSteelGirder({ ...STEEL_DEFAULTS, radius: 700 }).checks.find((c) => c.id === "curve-span-0")!.ok).toBe(false);
  });
  it("composite sections in positive flexure are noncompact; Appendices A6 and B6 don't apply", () => {
    expect(r.checks.some((c) => c.id === "flex-pos")).toBe(false);
    expect(r.checks.some((c) => c.id === "flex-pos-t")).toBe(true);
    expect(r.b6.active).toBe(false);
    expect(r.b6.piers[0].useA6).toBe(false);
  });
  it("the bottom flange's lateral bending at Strength I: M ℓ² / (10 R D) on tf bf² / 6", () => {
    const fl = r.checks.find((c) => c.id === "flex-fl")!;
    const st = r.stations.find((s) => Math.abs(s.X - 36) < 1e-6)!;
    within(fl.demand, (((st.Mpos * 20 ** 2) / (10 * 2000 * (42 / 12))) * 12 * 6) / (1.25 * 16 ** 2), 1e-3);
  });
  it("cross-frames are primary members: ℓ/rz ≤ 120, and the curvature's forces", () => {
    expect(r.checks.find((c) => c.id === "cf-sl-diag")!.capacity).toBe(120);
    const cv = r.crossFrames!.curve!;
    within(cv.P, (Math.abs(cv.M) * cv.ell) / (2000 * (42 / 12)), 1e-9);
    // Four girders at 10 ft: offsets ±5, ±15 ft, Σx² 500; V-loads 4 T x / 500 on the girders, the bays' shears
    // their running sum from the edge, the center bay's 4 T (15 + 5) / 500.
    within(cv.V, (4 * ((Math.abs(cv.M) * cv.ell) / 2000) * 20) / 500, 1e-9);
  });
  it("designs saved before these checks keep them off", () => {
    const old = steelGirderInputs({ spans: [90, 90], wind: { V: 0, exposure: "C", Z: 33 }, crossFrame: { check: true, type: "X" } });
    expect(old.wind.lateral).toBe(false);
    expect(old.crossFrame.connection.check).toBe(false);
    expect(old.radius).toBe(0);
    expect(old.redistributionMethod).toBe("simplified");
  });
});

describe("the web's shear panels (6.10.9.1) and the deck at service in negative flexure (6.10.4.2.1)", () => {
  const tight = { ...STEEL_DEFAULTS, braces: Array.from({ length: 17 }, (_, n) => 10 * (n + 1)) };
  it("full-depth connection plates 10 ft apart bound stiffened panels (120 in ≤ 3D); without them the web is unstiffened", () => {
    const withPlates = designSteelGirder(tight).checks.find((c) => c.id === "shear")!;
    const without = designSteelGirder({ ...tight, crossFrame: { ...tight.crossFrame, fullDepthPlates: false } }).checks.find((c) => c.id === "shear")!;
    expect(withPlates.note).toMatch(/stiffened|end panel/);
    expect(withPlates.capacity).toBeGreaterThan(without.capacity);
    expect(without.capacity).toBeCloseTo(263.2, 0);
  });
  it("a stiffener zone and a single stiffener both split panels", () => {
    const one = designSteelGirder({ ...STEEL_DEFAULTS, stiffeners: [{ from: 84, to: 84, spacing: 1 }, { from: 96, to: 96, spacing: 1 }] });
    const pier = one.stations.find((s) => Math.abs(s.X - 90) < 1e-6)!;
    expect(pier.shear!.Vn).toBeGreaterThan(designSteelGirder(STEEL_DEFAULTS).stations.find((s) => Math.abs(s.X - 90) < 1e-6)!.shear!.Vn);
  });
  it("Example 2A's deck at the pier is past 2fr at Service II, so the steel and bars carry it; B6.3.2.1 leaves the pier's flange checks out", () => {
    const r = designSteelGirder(STEEL_DEFAULTS);
    expect(r.checks.some((c) => c.id === "svc-bot" && /deck cracked/.test(c.note ?? ""))).toBe(false);
    const plain = designSteelGirder({ ...STEEL_DEFAULTS, appendixA6: false, redistribution: false });
    expect(plain.checks.find((c) => c.id === "svc-bot")!.note).toMatch(/deck cracked/);
  });
});

describe("AASHTO 10th Edition load factors: construction (3.4.2.1) and cross-frame fatigue (3.4.5)", () => {
  const r = designSteelGirder(STEEL_DEFAULTS);
  it("the deck on the erected steelwork at 1.4 DC1, not 1.5", () => {
    const c = r.checks.find((x) => x.id === "con-web")!;
    const s = r.stations.reduce((b, x) => ((x.ratios["con-web"] ?? -1) > (b.ratios["con-web"] ?? -1) ? x : b));
    const sc = r.sections[s.seg].steel;
    const f = (1.4 * Math.abs(s.M.dc1) * 12) / (s.M.dc1 >= 0 ? sc.Stop : sc.Sbot);
    expect(c.demand).toBeCloseTo(f, 6);
  });
  it("with construction loads: the larger of 1.25 DC + 1.5 C and 1.4 (DC + C)", () => {
    const a = designSteelGirder({ ...STEEL_DEFAULTS, constructionLL: 20 }).checks.find((x) => x.id === "con-web")!;
    expect(a.demand).toBeGreaterThan(r.checks.find((x) => x.id === "con-web")!.demand);
  });
  it("cross-frame connection fatigue: the live load factor times 0.65", () => {
    const one = designSteelGirder({ ...STEEL_DEFAULTS, crossFrame: { ...STEEL_DEFAULTS.crossFrame, connection: { ...STEEL_DEFAULTS.crossFrame.connection, check: true, fatigueRange: 5 } } });
    const g = one.crossFrames!.connections[0];
    expect(g.fatigue!.gamma).toBeCloseTo(0.65 * (g.fatigue!.combo.includes("II") ? 0.8 : 1.75), 6);
  });
  it("the brackets' lateral bending is amplified with curvature's on the compression flange (Eq. 6.10.1.6-4)", () => {
    const base = designSteelGirder({ ...STEEL_DEFAULTS, flConstruction: 3 });
    const c = base.checks.find((x) => x.id === "con-yield");
    if (c) expect(c.demand).toBeGreaterThanOrEqual(r.checks.find((x) => x.id === "con-yield")!.demand + 3 - 1e-9);
  });
});
