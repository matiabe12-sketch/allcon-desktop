import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem } from "@/lib/calcs/evaluate";
import { layout } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { shoringInputs } from "../kinds";
import { shoringCalcLines, shoringTakeoff } from "./detail";
import { laggingThickness } from "./sections";
import { coulombKa } from "../walls/cip";
import { CHANNELS, timberFb } from "./sections";
import { triggering } from "./liquefaction";
import { activeAt, designShoring, flowNetOf, moKae, moKpe, overallStability, passiveAt, rankineKa, rankineKp, seepageOf, seismicWedge, SHORING_DEFAULTS, type ShoringInputs } from "./wall";

const M = 3.28084; // ft per m
const PILE_Zx = 131; // HP14x89, noncompact flanges: Sx
const KN_M2 = 0.0208854; // ksf per kPa
const KN_M = 0.0685218; // kip/ft per kN/m

// FHWA GEC 4 Appendix A, Design Example 1: a 10 m wall in medium dense silty sand (18 kN/m³, φ′ 33°), anchors at 2.5 m
// and 6.25 m, 11 kN/m² traffic surcharge, the tributary area method, unfactored.
const GEC4_EX1: ShoringInputs = {
  ...SHORING_DEFAULTS,
  support: "anchored",
  H: 10 * M,
  D: 20,
  layers: [{ name: "Medium dense silty sand", thickness: 100, gamma: 18 * 6.36588, phi: 33, c: 0 }],
  traffic: false,
  surcharge: 11 * KN_M2 * 1000,
  gAEP: 1,
  gES: 1,
  gLS: 1,
  spacing: 2.5 * M,
  anchors: [
    { depth: 2.5 * M, angle: 15, bondLength: 40, unbondedLength: 30 },
    { depth: 6.25 * M, angle: 15, bondLength: 40, unbondedLength: 30 },
  ],
};

describe("soldier pile and sheet pile walls (AASHTO 11.8, 11.9; FHWA GEC 4)", () => {
  it("passes its checks with the defaults, cantilevered and anchored", () => {
    expect(designShoring(SHORING_DEFAULTS).checks.filter((c) => !c.ok && !c.advisory).map((c) => c.id)).toEqual([]);
    expect(designShoring({ ...SHORING_DEFAULTS, support: "anchored", H: 25, D: 10 }).checks.filter((c) => !c.ok && !c.advisory).map((c) => c.id)).toEqual([]);
  });

  it("finds a cantilever sheet pile's embedment in uniform sand by moment about the toe: D0 = H/((Kp/Ka)^(1/3) − 1)", () => {
    const r = designShoring({ ...SHORING_DEFAULTS, wall: "sheet", traffic: false, gEH: 1, phiP: 1, layers: [{ name: "sand", thickness: 100, gamma: 120, phi: 30, c: 0 }], H: 10, D: 20 });
    expect(r.cant!.D0).toBeCloseTo(10 / (Math.cbrt(rankineKp(30) / rankineKa(30)) - 1), 3);
    expect(r.cant!.Dreq).toBeCloseTo(1.2 * r.cant!.D0, 9);
  });

  it("matches GEC 4 Design Example 1's anchor loads, reaction and moment (AASHTO's pa is 2/3 ÷ 0.65 of GEC 4's)", () => {
    const a = designShoring(GEC4_EX1).anch!;
    const ka = rankineKa(33);
    const g = (18 * 6.36588) / 1000;
    const H = 10 * M;
    expect(a.pa).toBeCloseTo((ka * g * H * H) / (1.5 * H - 0.5 * 2.5 * M - 0.5 * 3.75 * M), 9); // Eq. 3.11.5.7.1-2
    expect(a.pa / (43.6 * KN_M2)).toBeCloseTo(2 / 3 / 0.65, 2);
    // GEC 4: TH1 = 168 kN/m, TH2 = 172 kN/m, R = 37 kN/m, Mmax = 76 kN·m/m; within the 2.6% from pa and rounding.
    expect(Math.abs(a.Th[0] / (168 * KN_M) - 1)).toBeLessThan(0.035);
    expect(Math.abs(a.Th[1] / (172 * KN_M) - 1)).toBeLessThan(0.035);
    expect(Math.abs(a.R / (37 * KN_M) - 1)).toBeLessThan(0.035);
    expect(Math.abs(a.moments[0].M / (76 * 0.737562 * (1 / M)) - 1)).toBeLessThan(0.035); // kN·m/m → kip·ft/ft
  });

  it("carries the same total load by the tributary area and hinge methods", () => {
    const i = { ...SHORING_DEFAULTS, support: "anchored" as const, H: 25, D: 10 };
    const t = designShoring(i).anch!;
    const h = designShoring({ ...i, method: "hinge" }).anch!;
    const sum = (x: { Th: number[]; R: number }) => x.Th.reduce((a, b) => a + b, 0) + x.R;
    expect(sum(h)).toBeCloseTo(sum(t), 3);
    expect(h.R).toBeGreaterThan(0);
  });

  it("gives discrete piles in clay Broms' 9·c·b below 1.5b, and in sand Kp over 3b", () => {
    const clay = { ...SHORING_DEFAULTS, layers: [{ name: "clay", thickness: 100, gamma: 125, phi: 0, c: 2000 }] };
    const b = 2; // the 24 in hole
    expect(passiveAt(clay, clay.H + 1.4 * b).p).toBe(0);
    expect(passiveAt(clay, clay.H + 2 * b).p).toBeCloseTo(9 * 2, 9);
    const sand = passiveAt(SHORING_DEFAULTS, SHORING_DEFAULTS.H + 4);
    expect(sand.width).toBeCloseTo(3 * b, 9);
    expect(sand.p).toBeCloseTo(rankineKp(32) * 0.12 * 4, 9);
  });

  it("reads GEC 4 Table 12 for temporary timber lagging", () => {
    expect(laggingThickness("competent", 20, 4.8)).toBe(2);
    expect(laggingThickness("competent", 20, 6.5)).toBe(3);
    expect(laggingThickness("difficult", 40, 9.5)).toBe(5);
    expect(laggingThickness("dangerous", 30, 9)).toBeNull();
  });

  it("puts each anchor's unbonded length past the critical surface at 45° + φ/2", () => {
    const i = { ...SHORING_DEFAULTS, support: "anchored" as const, H: 25, D: 10, anchors: [{ depth: 5, angle: 0, bondLength: 25, unbondedLength: 30 }] };
    const row = designShoring(i).anch!.rows[0];
    expect(row.free).toBeCloseTo(20 * Math.tan(((45 - 16) * Math.PI) / 180), 9);
    expect(row.LuReq).toBeCloseTo(Math.max(15, row.free + 5), 9);
  });

  it("takes off the piles, the wall face and the shoring", () => {
    const t = shoringTakeoff(SHORING_DEFAULTS, 60);
    expect(t.quantities.pile!.value).toBe((60 / 6 + 1) * (12 + 19));
    expect(t.quantities.wall!.value).toBe(12 * 60);
    expect(t.quantities.shoring!.value).toBe(1);
    expect(shoringInputs({ H: 20 }).H).toBe(20);
    expect(shoringInputs({ anchors: [{ depth: 4 }] }).anchors[0].angle).toBe(15);
  });

  it("finds Taylor's critical height of a vertical cut in clay (H = 3.85·c/γ) with Bishop circles: FS ≈ 1", () => {
    const H = (3.85 * 500) / 120;
    const r = overallStability({ ...SHORING_DEFAULTS, H, D: 0.01, traffic: false, layers: [{ name: "clay", thickness: 100, gamma: 120, phi: 0, c: 500 }] }, null);
    expect(r.FS).toBeGreaterThan(0.93);
    expect(r.FS).toBeLessThan(1.05);
  });

  it("takes Coulomb's ka for a backslope (Eq. 3.11.5.3-1, δ = 0)", () => {
    const i = { ...SHORING_DEFAULTS, backslope: 18 };
    expect(activeAt(i, 5).ka).toBeCloseTo(coulombKa(32, 18, 90, 0), 12);
    expect(designShoring(i).element.Mu).toBeGreaterThan(designShoring(SHORING_DEFAULTS).element.Mu);
  });

  it("checks the cantilever stage before the first anchor, excavated 2 ft below it", () => {
    const r = designShoring({ ...SHORING_DEFAULTS, support: "anchored", H: 25, D: 10 });
    expect(r.stage!.Hs).toBe(8);
    expect(r.stage!.avail).toBe(27);
    expect(r.checks.some((c) => c.id === "stage-embedment")).toBe(true);
  });

  it("designs a sheet pile wall's wales as continuous over the anchors, w·l²/10, and its vertical load from the anchors", () => {
    const i: ShoringInputs = { ...SHORING_DEFAULTS, wall: "sheet", support: "anchored", H: 20, D: 14, sheet: "PZ 27", anchorSpacing: 8, anchors: [{ depth: 6, angle: 15, bondLength: 30, unbondedLength: 20 }] };
    const r = designShoring(i);
    expect(r.wales[0].Mu).toBeCloseTo((r.anch!.Th[0] * 64) / 10, 9);
    expect(r.wales[0].phiMn).toBeCloseTo((0.9 * 36 * 2 * CHANNELS["C12x25"].Zx) / 12, 9);
    expect(r.axial!.Tv).toBeCloseTo((r.anch!.rows[0].T * Math.sin((15 * Math.PI) / 180)) / 8, 9);
  });

  it("checks basal heave in clay below the excavation by GEC 4 Eq. 34", () => {
    const i = { ...SHORING_DEFAULTS, H: 10, D: 19, traffic: false, layers: [{ name: "clay", thickness: 100, gamma: 120, phi: 0, c: 600 }] };
    const h = designShoring(i).heave!;
    expect(h.Nc).toBeCloseTo(5 * (1 + 0.2 * (10 / 40)), 9);
    expect(h.FS).toBeCloseTo((h.Nc * 0.6) / (0.12 * 10 - (Math.SQRT2 * 0.6 * 10) / 40), 6);
  });

  it("estimates a cantilever's deflection by p–y below the excavation and beam bending above, less for a stiffer pile", () => {
    const a = designShoring(SHORING_DEFAULTS).deflection!;
    const b = designShoring({ ...SHORING_DEFAULTS, section: "W24x104" }).deflection!;
    expect(a.bend).toBeGreaterThan(0);
    expect(a.top).toBeGreaterThan(Math.abs(a.y0));
    expect(b.top).toBeLessThan(a.top);
  });

  it("designs precast lagging as a simple span between the piles, 0.083·p·L² with arching (C11.8.5.2-2)", () => {
    const r = designShoring({ ...SHORING_DEFAULTS, lagging: "precast", temporary: false });
    expect(r.precast!.Mu).toBeCloseTo(0.083 * r.precast!.pMax * 36, 9);
    expect(r.checks.find((c) => c.id === "lagging")!.ok).toBe(true);
  });

  it("reduces Mononobe–Okabe to Rankine at kh = 0, and the seismic wedge to 45° + φ/2", () => {
    expect(moKae(30, 0)).toBeCloseTo(rankineKa(30), 12);
    expect(moKpe(30, 0)).toBeCloseTo(rankineKp(30), 12);
    expect((seismicWedge(30, 0) * 180) / Math.PI).toBeCloseTo(60, 9);
    expect(moKae(30, 0.2)!).toBeGreaterThan(rankineKa(30));
    expect(moKpe(30, 0.2)).toBeLessThan(rankineKp(30));
    expect(seismicWedge(30, 0.2)).toBeLessThan(seismicWedge(30, 0)); // flatter
  });

  it("checks a cantilever and an anchored wall for Extreme Event I, more embedment for more shaking", () => {
    const a = designShoring({ ...SHORING_DEFAULTS, seismic: true, As: 0.1 });
    const b = designShoring({ ...SHORING_DEFAULTS, seismic: true, As: 0.3 });
    expect(b.quakeCant!.Dreq).toBeGreaterThan(a.quakeCant!.Dreq);
    expect(b.quakeStab!.FS).toBeLessThan(a.quakeStab!.FS);
    const an = designShoring({ ...SHORING_DEFAULTS, support: "anchored", H: 25, D: 10, seismic: true, As: 0.2 });
    expect(an.anch!.quake!.ratio).toBeGreaterThan(1);
    expect(an.checks.some((c) => c.id === "eq-anchor1-free")).toBe(true);
  });

  it("adjusts a timber lagging board's Fb by AASHTO Eq. 8.4.4.1-1", () => {
    const fb = timberFb("dfl-2", 3, 12, { wet: true, incised: false, cLambda: 0.8 })!;
    expect(fb.Fb).toBeCloseTo(0.9 * (2.5 / 0.85) * 1 * 1.0 * 1.2 * 1 * 0.8, 12);
    const ss = timberFb("dfl-ss", 4, 10, { wet: true, incised: true, cLambda: 0.8 })!;
    expect(ss.CM).toBe(0.85); // Fbo·CF = 1.5 × 1.2 > 1.15
    expect(ss.Ci).toBe(0.8);
    expect(timberFb("sp-2", 3, 12, { wet: false, incised: false, cLambda: 1 })!.CF).toBe(1); // already size-adjusted
  });

  it("deflects an anchored wall as a beam on springs: less with a higher lock-off, the anchors' loads rising from it", () => {
    const i = { ...SHORING_DEFAULTS, support: "anchored" as const, H: 25, D: 10 };
    const lo = designShoring({ ...i, lockOff: 0.5 }).beam!;
    const hi = designShoring({ ...i, lockOff: 1.0 }).beam!;
    expect(Math.abs(hi.max)).toBeLessThan(Math.abs(lo.max));
    expect(lo.anchors[0].T).toBeGreaterThan(lo.anchors[0].lockOff);
  });

  it("balances the water at the toe with steady seepage, and checks piping", () => {
    const i: ShoringInputs = { ...SHORING_DEFAULTS, wall: "sheet", H: 12, D: 20, sheet: "PZ 27", water: 4, seepage: true };
    const sp = seepageOf(i)!;
    expect(sp.dh).toBe(8);
    expect(sp.Lp).toBe(12 + 20 - 4 + 20);
    const r = designShoring(i);
    expect(r.piping!.FS).toBeCloseTo(((120 - 62.4) / 62.4) / sp.grad, 9);
    // The effective stress in front is lowered by the upward flow.
    expect(passiveAt(i, 20).p).toBeLessThan(passiveAt({ ...i, seepage: false }, 20).p);
  });

  it("follows Idriss and Boulanger's CRR curve: (N1)60cs = 15 gives 0.156 at M 7.5 and 1 atm", () => {
    const t = triggering({ z: 0.01, sv: 2.116, svEff: 2.116, N60: 15, fines: 0, amax: 0.2, M: 7.5 });
    expect(t.N1cs).toBeCloseTo(15, 2);
    expect(t.CRR).toBeCloseTo(0.156, 3);
    expect(t.MSF).toBeCloseTo(1.0, 2);
    expect(t.rd).toBeCloseTo(1.0, 1); // 1.006 at the surface
  });

  it("solves a flow net: the pressures on the two faces meet below the toe, and a tight layer at the toe cuts the flow", () => {
    const i: ShoringInputs = { ...SHORING_DEFAULTS, wall: "sheet", H: 12, D: 20, sheet: "PZ 27", water: 4, seepage: true, flowNet: true };
    const fn = flowNetOf(i)!;
    expect(Math.abs(fn.uBack(34) - fn.uFront(34))).toBeLessThan(0.05 * fn.uBack(34));
    expect(fn.uBack(12)).toBeLessThan(0.0624 * 8); // below hydrostatic behind
    expect(fn.uFront(20)).toBeGreaterThan(0.0624 * 8); // above hydrostatic in front
    const tight = flowNetOf({ ...i, layers: [{ name: "sand", thickness: 28, gamma: 120, phi: 32, c: 0, k: 10 }, { name: "silt", thickness: 100, gamma: 120, phi: 30, c: 0, k: 0.01 }] })!;
    const open = flowNetOf({ ...i, layers: [{ name: "sand", thickness: 28, gamma: 120, phi: 32, c: 0, k: 10 }, { name: "sand", thickness: 100, gamma: 120, phi: 32, c: 0, k: 10 }] })!;
    expect(tight.flow).toBeLessThan(open.flow);
    expect(tight.exitGradient).toBeLessThan(open.exitGradient);
    expect(designShoring(i).piping!.grad).toBeCloseTo(fn.exitGradient, 12);
  });

  it("runs the construction sequence: each anchor's excavation and lock-off, then the bottom", () => {
    const r = designShoring({ ...SHORING_DEFAULTS, support: "anchored", H: 25, D: 10, staged: true });
    const st = r.staged!;
    expect(st.stages.length).toBe(2 * 2 + 1);
    expect(st.stages[0].anchors).toEqual([]);
    expect(st.stages[st.stages.length - 1].anchors[1]).toBeGreaterThan(r.anch!.rows[1].Tservice * 0.75);
  });

  it("loses the passive resistance where the soil in front liquefies, and adds free water's hydrodynamic pressure", () => {
    const loose = designShoring({ ...SHORING_DEFAULTS, seismic: true, As: 0.3, liquefaction: true, water: 8, N60: 8 });
    expect(loose.checks.find((c) => c.id === "eq-liquefaction")!.ok).toBe(false);
    expect(loose.checks.find((c) => c.id === "eq-embedment")!.ok).toBe(false);
    const base = { ...SHORING_DEFAULTS, wall: "sheet" as const, H: 12, D: 24, sheet: "PZ 40", water: 4, seismic: true, As: 0.2 };
    expect(designShoring({ ...base, seismicWater: true, freeWater: true }).quakeCant!.Mmax).toBeGreaterThan(designShoring(base).quakeCant!.Mmax);
  });

  it("takes the facing's moment by C11.8.5.2: continuous without arching 0.1·p·L², a cast-in-place facing", () => {
    const r = designShoring({ ...SHORING_DEFAULTS, lagging: "cip", temporary: false, facingSupport: "continuous", arching: false, precastT: 10, precastBar: 5, precastBarSpacing: 8 });
    expect(r.precast!.cip).toBe(true);
    expect(r.precast!.Mu).toBeCloseTo(0.1 * r.precast!.pMax * 36, 9);
  });

  it("takes the corrosion loss off a permanent wall's steel (11.8.7), and none off a temporary one", () => {
    const perm = designShoring({ ...SHORING_DEFAULTS, temporary: false, lagging: "precast", corrosionLoss: 0.0625 });
    const temp = designShoring({ ...SHORING_DEFAULTS, corrosionLoss: 0.0625 });
    expect(temp.element.Z).toBe(PILE_Zx);
    expect(perm.element.Z).toBeLessThan(PILE_Zx);
    expect(perm.element.Z).toBeGreaterThan(0.75 * PILE_Zx); // 0.615 in flanges lose 0.125 in: about 20%
    const sheet = designShoring({ ...SHORING_DEFAULTS, wall: "sheet", sheet: "PZ 27", H: 8, D: 14, temporary: false, corrosionLoss: 0.0625 });
    expect(sheet.element.Z).toBeCloseTo((31 * (0.375 - 0.125)) / 0.375, 9);
    expect(sheet.checks.some((c) => c.id === "pile-shear")).toBe(true);
  });

  it("checks an anchored pile for its axial load with its bending (Eqs. 6.9.2.2-1, -2)", () => {
    const r = designShoring({ ...SHORING_DEFAULTS, support: "anchored", H: 25, D: 10 });
    const c = r.checks.find((x) => x.id === "pile-combined")!;
    const Pr = 0.9 * r.element.Pn;
    const Mr = 0.9 * r.element.Mn;
    const ratio = r.axial!.Pu / Pr;
    expect(c.demand).toBeCloseTo(ratio < 0.2 ? ratio / 2 + r.element.Mu / Mr : ratio + (8 / 9) * (r.element.Mu / Mr), 9);
  });

  it("checks permanent timber facing in shear with Fv = Fvo·CKF·CM·Ci·Cλ", () => {
    const fb = timberFb("dfl-2", 4, 12, { wet: true, incised: false, cLambda: 0.8 })!;
    expect(fb.Fv).toBeCloseTo(0.18 * (2.5 / 0.85) * 0.97 * 0.8, 12);
    const r = designShoring({ ...SHORING_DEFAULTS, temporary: false, laggingT: 4 });
    expect(r.checks.some((x) => x.id === "lagging-shear")).toBe(true);
  });

  const calcCases: [string, ShoringInputs][] = [
    ["soldier piles, cantilever", SHORING_DEFAULTS],
    ["sheet piles, anchored, hinge method", { ...SHORING_DEFAULTS, wall: "sheet", support: "anchored", H: 20, D: 10, method: "hinge", sheet: "PZ 27", anchors: [{ depth: 6, angle: 15, bondLength: 25, unbondedLength: 20 }] }],
    ["soldier piles in clay", { ...SHORING_DEFAULTS, H: 10, layers: [{ name: "clay", thickness: 100, gamma: 125, phi: 0, c: 2000 }] }],
    ["precast lagging, backslope, anchored", { ...SHORING_DEFAULTS, lagging: "precast", temporary: false, backslope: 15, support: "anchored", H: 25, D: 10 }],
    ["seismic, anchored", { ...SHORING_DEFAULTS, support: "anchored", H: 25, D: 10, seismic: true, As: 0.2 }],
    ["seismic, cantilever, permanent timber", { ...SHORING_DEFAULTS, seismic: true, temporary: false }],
    ["sheet piles with seepage", { ...SHORING_DEFAULTS, wall: "sheet", H: 12, D: 20, sheet: "PZ 27", water: 4, seepage: true }],
    ["flow net, seismic water, liquefaction", { ...SHORING_DEFAULTS, wall: "sheet", H: 12, D: 26, sheet: "PZ 40", water: 4, seepage: true, flowNet: true, seismic: true, As: 0.15, seismicWater: true, freeWater: true, liquefaction: true, N60: 25 }],
    ["anchored, staged", { ...SHORING_DEFAULTS, support: "anchored", H: 25, D: 10, staged: true }],
    ["permanent, cast-in-place facing, corrosion", { ...SHORING_DEFAULTS, temporary: false, lagging: "cip", facingSupport: "continuous", precastT: 10, support: "anchored", H: 25, D: 10 }],
    ["permanent timber with shear", { ...SHORING_DEFAULTS, temporary: false, laggingT: 4 }],
  ];
  for (const [what, i] of calcCases) {
    it(`works out its calc package with no errors (${what})`, () => {
      const regions = readingOrder(layout(shoringCalcLines(i, "Test wall"), { x: 0, y: 0 }));
      const items = regions.flatMap((x): SheetItem[] => (x.kind === "text" || x.kind === "image" ? [] : [x as SheetItem]));
      const results = evaluateSheet(items, DEFAULT_SETTINGS, new Map());
      const errors = regions.flatMap((x) => (results.get(x.id)?.kind === "error" ? [`${x.kind === "math" ? x.latex : x.kind}: ${(results.get(x.id) as { message: string }).message}`] : []));
      expect(errors).toEqual([]);
    });
  }
});
