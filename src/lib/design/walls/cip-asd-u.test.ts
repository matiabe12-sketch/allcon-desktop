import type { Unit } from "mathjs";
import { describe, expect, it } from "vitest";
import { WORKSHEET_TOLERANCE } from "../calc-style";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem, type Value } from "@/lib/calcs/evaluate";
import { layout } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { CIP_DEFAULTS, designCipWall, type CipInputs } from "./cip";
import { designCipAsdU, proppedStem } from "./cip-asd-u";
import { cipAsdUCalcLines } from "./cip-asd-u-calc";

// The U-shaped stairwell: two 10 in stems 4 ft apart on one 12 in base slab, 6.5 ft exposed,
// level drained backfill (125 pcf, φ = 25°), qa = 1.5 ksf, 100 psf surcharge.

const u: CipInputs = {
  ...CIP_DEFAULTS,
  gammaS: 0.125, phi: 25, delta: null, kpOverride: null, efwMin: 0, phiSub: 25, fc: 4, fy: 60,
  He: 6.5, Df: 1, D: 12, Tt: 10, B: 92, A: 34, railWeight: 0,
  stemBars: { bar: 4, spacing: 10 }, toeBars: { bar: 4, spacing: 12 }, heelBars: { bar: 4, spacing: 12 }, coverStem: 2, coverToe: 3, coverHeel: 2,
  asd: true, asdLayout: "u", asdSurcharge: 0.1, asdGammaH: 1.6, uClear: 4, uOuter: 12, uStairs: 0, uProp: false,
};
const run = (o: Partial<CipInputs> = {}) => {
  const i = { ...u, ...o };
  return designCipAsdU(i, designCipWall(i));
};
const near = (x: number, y: number, tol = 1e-6) => expect(Math.abs(x - y)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(y)));

describe("U-shaped stairwell, IRC/IBC ASD", () => {
  it("balances the earth thrusts: uniform bearing, and only a one-sided surcharge tips or slides it", () => {
    const a = run();
    const { Bu } = a.geometry;
    near(Bu, 7 + 8 / 12 - 2 / 12 + 1 / 6, 1e-9); // 10 + 48 + 10 + 2 × 12 in = 92 in
    near(a.cases[0].qmax, a.cases[0].V / Bu);
    // By hand: stems 2(0.15)(10/12)(6.5) = 1.625, base 0.15(7.667)(1) = 1.15, soil on the
    // projections 2(0.125)(1)(6.5) = 1.625, plus EHV on both faces.
    near(a.loads.VD, 1.625 + 0.15 * Bu + 1.625, 1e-6);
    expect(a.cases[2].H).toBeCloseTo(a.loads.PsH, 9);
    expect(a.checks.filter((c) => /^asd-(ot|ecc|brg|sl)/.test(c.id)).every((c) => c.ok)).toBe(true);
  });

  it("the cantilever stem's base moment turns the corner into the base slab", () => {
    const a = run();
    const hs = 6.5;
    near(a.stem.Mc, (a.stem.k * hs ** 3) / 6 + (a.stem.s * hs ** 2) / 2);
    near(a.base.Mbot, Math.max(...a.base.cases.map((c) => c.bottom)));
    // The soil on the outer projections outweighs the pressure under them, so their (top-tension)
    // moment relieves the corner: the span's end moment is the stem's plus the projection's.
    for (const c of a.base.cases) {
      expect(c.wo).toBeLessThan(0);
      near(c.Mend, a.stem.Mc + (c.wo * (12 / 12) ** 2) / 2);
      expect(a.base.Mbot).toBeGreaterThanOrEqual(c.Mend - 1e-9);
    }
  });

  it("a propped cantilever matches the textbook: 3wL/8 for a uniform load, w0 L/10 for a triangle, at the top", () => {
    near(proppedStem(0, 1, 10, 10).R, (3 * 10) / 8);
    near(proppedStem(1, 0, 10, 10).R, (10 * 10) / 10);
    // Fixed-end moment of the uniform case, wL²/8 at the base (soil face).
    near(proppedStem(0, 1, 10, 10).Mb, -(-100 / 8), 1e-9);
  });

  it("the doweled landing slab props the stems and cuts the corner moment", () => {
    const free = run({ Df: 3, uProp: false });
    const propped = run({ Df: 3, uProp: true });
    expect(propped.stem.prop!.R).toBeGreaterThan(0);
    expect(propped.stem.Mc).toBeLessThan(free.stem.Mc);
    expect(propped.checks.find((c) => c.id === "asd-u-prop")!.ok).toBe(true);
  });
});

function workOut(inputs: CipInputs) {
  const lines = cipAsdUCalcLines(inputs, "Test stairwell");
  const regions = readingOrder(layout(lines, { x: 0, y: 0 }));
  const items = regions.flatMap((r): SheetItem[] => (r.kind === "text" || r.kind === "image" ? [] : [r as SheetItem]));
  const values = new Map<string, Value>();
  const results = evaluateSheet(items, DEFAULT_SETTINGS, values);
  const errors = regions.flatMap((r) => (results.get(r.id)?.kind === "error" ? [`${r.kind === "math" ? r.latex : r.kind}: ${(results.get(r.id) as { message: string }).message}`] : []));
  const checks = regions.filter((r) => r.kind === "math" && r.latex.startsWith("\\operatorname{if}\\left(") && r.latex.endsWith("\\text{NG}\\right)=")).map((r) => (results.get(r.id) as { result?: string }).result ?? "");
  const value = (start: string, unit?: string) => {
    const r = regions.find((x) => x.kind === "math" && x.latex.startsWith(start));
    if (!r) throw new Error(`No region ${start}`);
    const v = values.get(r.id);
    return unit ? (v as Unit).toNumber(unit) : (v as number);
  };
  return { lines, errors, checks, value };
}
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(WORKSHEET_TOLERANCE * Math.max(1, Math.abs(b)));

describe("U-shaped stairwell calc package", () => {
  for (const [name, inputs] of [
    ["with a surcharge, no prop", u],
    ["propped by the landing", { ...u, Df: 3, uProp: true, uStairs: 0.8, railWeight: 0.05 }],
    ["propped higher, through the stairs, no surcharge", { ...u, Df: 3, uProp: true, uPropHeight: 4, asdSurcharge: 0 }],
    ["a resultant past B/6", { ...u, uOuter: 0, uClear: 2, asdSurcharge: 0.6, asdEccLimit: 3 as const }],
  ] as [string, CipInputs][]) {
    it(`works out ${name} with no errors, matching the engine`, () => {
      const a = designCipAsdU(inputs, designCipWall(inputs));
      const c = workOut(inputs);
      expect(c.errors).toEqual([]);
      for (const k of a.cases) close(c.value(`q_{max${k.id}}\\coloneq`, "ksf"), k.qmax);
      close(c.value("M_c\\coloneq", "kip*ft/ft"), a.stem.Mc);
      close(c.value("M_{ust}\\coloneq", "kip*ft/ft"), a.stem.Mout);
      close(c.value("V_{ust}\\coloneq", "kip/ft"), a.stem.Vu);
      close(c.value("M_{ubo}\\coloneq", "kip*ft/ft"), a.base.Mbot);
      close(c.value("M_{utp}\\coloneq", "kip*ft/ft"), a.base.Mtop);
      close(c.value("V_{uba}\\coloneq", "kip/ft"), a.base.V);
      close(c.value("V_{rba}\\coloneq", "kip/ft"), a.base.shear.phiVc);
      close(c.value("l_{dh}\\coloneq", "in"), a.stem.ldh);
      if (a.stem.prop) {
        close(c.value("R_u\\coloneq", "kip/ft"), a.stem.prop.R);
        close(c.value("M_{uin}\\coloneq", "kip*ft/ft"), a.stem.Min);
      }
      expect(c.checks.filter((x) => x.includes("NG")).length).toBe(a.checks.filter((x) => !x.ok).length);
      expect(c.checks.length).toBe(a.checks.length);
      expect(JSON.stringify(c.lines)).not.toMatch(/AASHTO|Strength I|LRFD/);
    });
  }
});
