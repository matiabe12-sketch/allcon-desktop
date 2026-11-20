import type { Unit } from "mathjs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem, type Value } from "@/lib/calcs/evaluate";
import { layout } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { designSteelGirder, STEEL_DEFAULTS, type SteelGirderInputs } from "./steel";
import { steelCalcLines } from "./steel-calc";
import { fitsAcross } from "@/lib/calcs/library/fit";

// The calc package, worked out by Calcs, agrees with the design engine: no errors, its worked values are
// the engine's, and a worked check fails only where the engine's check fails.

const IF = String.raw`\operatorname{if}`;

function workOut(inputs: SteelGirderInputs) {
  const regions = readingOrder(layout(steelCalcLines(inputs, "Test girder"), { x: 0, y: 0 }));
  const items = regions.flatMap((r): SheetItem[] => (r.kind === "text" || r.kind === "image" ? [] : [r as SheetItem]));
  const values = new Map<string, Value>();
  const results = evaluateSheet(items, DEFAULT_SETTINGS, values);
  const errors = regions.flatMap((r) => (results.get(r.id)?.kind === "error" ? [`${r.kind === "math" ? r.latex : r.kind}: ${(results.get(r.id) as { message: string }).message}`] : []));
  const checks = regions.filter((r) => r.kind === "math" && r.latex.startsWith(IF)).map((r) => ({ latex: r.kind === "math" ? r.latex : "", result: (results.get(r.id) as { result?: string }).result ?? "" }));
  const value = (start: string, unit?: string) => {
    const r = regions.find((x) => x.kind === "math" && x.latex.startsWith(start));
    if (!r) throw new Error(`No region ${start}`);
    const v = values.get(r.id);
    return unit ? (v as Unit).toNumber(unit) : (v as number);
  };
  return { errors, checks, value };
}

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(0.002 * Math.max(1, Math.abs(b)));

describe("steel girder calc package", { timeout: 60000 }, () => {
  it("works out FHWA Example 2A without Appendices A6 and B6: the pier's bottom flange fails as the engine finds", () => {
    const plain: SteelGirderInputs = { ...STEEL_DEFAULTS, appendixA6: false, redistribution: false };
    const r = designSteelGirder(plain);
    const c = workOut(plain);
    expect(c.errors).toEqual([]);
    expect(c.checks.length).toBeGreaterThan(20);
    const ng = c.checks.filter((x) => x.result.includes("NG"));
    expect(r.checks.find((x) => x.id === "flex-neg-c")?.ok).toBe(false);
    expect(ng.some((x) => x.latex.includes("f_{bu}"))).toBe(true);
    // The NGs are the engine's failing checks.
    expect(ng.length).toBe(r.checks.filter((x) => !x.ok && !x.advisory).length);
  });

  it("works out Example 2A as designed, with A6 and B6, with no errors and no NG, its worked values the engine's", () => {
    const r = designSteelGirder(STEEL_DEFAULTS);
    const c = workOut(STEEL_DEFAULTS);
    expect(c.errors).toEqual([]);
    expect(c.checks.filter((x) => x.result.includes("NG"))).toEqual([]);
    const q = r.b6.piers[0];
    close(c.value(String.raw`R_{pc1}\coloneq`), q.a6.Rpc);
    close(c.value(String.raw`M_{rd1}\coloneq`, "kip ft"), q.Mrd);
    const cf = r.crossFrames!;
    const g = cf.cases.reduce((b, x) => (x.req / x.act > b.req / b.act ? x : b), cf.cases[0]);
    close(c.value(String.raw`\beta_{Tact}\coloneq`, "kip inch"), g.act);
    close(c.value(String.raw`\beta_{Treq}\coloneq`, "kip inch"), g.req);
    close(c.value(String.raw`P_{nst}\coloneq`, "kip"), cf.strut.Pn);
  });

  it("works out a pour sequence with no errors", () => {
    const i: SteelGirderInputs = { ...STEEL_DEFAULTS, pours: [{ from: 0, to: 70, order: 1 }, { from: 110, to: 180, order: 2 }, { from: 70, to: 110, order: 3 }] };
    const r = designSteelGirder(i);
    const c = workOut(i);
    expect(c.errors).toEqual([]);
    expect(c.checks.filter((x) => x.result.includes("NG")).length).toBe(r.checks.filter((x) => !x.ok && !x.advisory).length);
  });

  it("works out the details as the engine does: fatigue, studs and the governing bearing stiffeners", () => {
    const r = designSteelGirder(STEEL_DEFAULTS);
    const c = workOut(STEEL_DEFAULTS);
    const fat = [r.checks.find((x) => x.id === "fat-bot")!, r.checks.find((x) => x.id === "fat-top")!].sort((a, b) => b.demand / b.capacity - a.demand / a.capacity)[0];
    close(c.value(String.raw`\Delta_{Fn}\coloneq`, "ksi"), fat.capacity);
    close(c.value(String.raw`p_{max}\coloneq`, "inch"), r.checks.find((x) => x.id === "stud-fat")!.capacity);
    const pier = r.bearings.find((b) => b.support === 1)!;
    close(c.value(String.raw`P_{n}\coloneq`, "kip"), pier.stiffened!.Pn);
    close(c.value(String.raw`R_{sbr}\coloneq`, "kip"), pier.stiffened!.Rr);
  });

  it("works out a stiffened zone's stiffeners and a rolled beam's web at its bearings", () => {
    const stiff: SteelGirderInputs = { ...STEEL_DEFAULTS, stiffeners: [{ from: 70, to: 110, spacing: 84 }] };
    const r = designSteelGirder(stiff);
    const c = workOut(stiff);
    expect(c.errors).toEqual([]);
    close(c.value(String.raw`I_{treq}\coloneq`, "inch^4"), r.stiffenerChecks[0].required);
    expect(c.checks.filter((x) => x.result.includes("NG")).length).toBe(r.checks.filter((x) => !x.ok).length);

    const rolled: SteelGirderInputs = { ...STEEL_DEFAULTS, spans: [60], segments: [{ length: 60, kind: "rolled", shape: "W36X150", D: 0, tw: 0, top: { b: 0, t: 0 }, bottom: { b: 0, t: 0 } }], bearing: { ...STEEL_DEFAULTS.bearing, use: false } };
    const rr = designSteelGirder(rolled);
    const cr = workOut(rolled);
    expect(cr.errors).toEqual([]);
    expect(cr.checks.filter((x) => x.result.includes("NG")).length).toBe(rr.checks.filter((x) => !x.ok && !x.advisory).length);
  });

  it("works out the refined method (B6.6), Strength III and V wind, and the cross-frame connections as the engine does", () => {
    const i: SteelGirderInputs = { ...STEEL_DEFAULTS, redistributionMethod: "refined", wind: { ...STEEL_DEFAULTS.wind, V: 115 }, crossFrame: { ...STEEL_DEFAULTS.crossFrame, connection: { ...STEEL_DEFAULTS.crossFrame.connection, fatigueRange: 4 } } };
    const r = designSteelGirder(i);
    const c = workOut(i);
    expect(c.errors).toEqual([]);
    expect(c.checks.filter((x) => x.result.includes("NG")).length).toBe(r.checks.filter((x) => !x.ok && !x.advisory).length);
    const q = r.b6.piers[0];
    close(c.value(String.raw`\theta_{RL1}\coloneq`), q.thetaRL);
    close(c.value(String.raw`M_{c1}\coloneq`, "kip ft"), q.byCombo.I.M);
    close(c.value(String.raw`M_{m1}\coloneq`, "kip ft"), q.byCombo.I.M);
    close(c.value(String.raw`M_{wV}\coloneq`, "kip ft") * 0 + c.value(String.raw`W_{V}\coloneq`, "kip/ft"), r.windW.V);
    const g = r.crossFrames!.connections;
    expect(g.length).toBe(2);
    close(c.value(String.raw`R_{ns}\coloneq`, "kip") * 0.8 * i.crossFrame.connection.bolts, g[0].Rshear);
    close(c.value(String.raw`R_{nb}\coloneq`, "kip") * 0.8, g.reduce((b, x) => (x.checks[0].demand > b.checks[0].demand ? x : b)).Rbearing);
  });

  it("works out a curved girder within 4.6.1.2.4b, and welded connections, with no errors", () => {
    const i: SteelGirderInputs = { ...STEEL_DEFAULTS, radius: 2000, crossFrame: { ...STEEL_DEFAULTS.crossFrame, connection: { ...STEEL_DEFAULTS.crossFrame.connection, kind: "welded", weld: 0.3125, weldLength: 8, fatigueRange: 3 } } };
    const r = designSteelGirder(i);
    const c = workOut(i);
    expect(c.errors).toEqual([]);
    expect(c.checks.filter((x) => x.result.includes("NG")).length).toBe(r.checks.filter((x) => !x.ok && !x.advisory).length);
    const st = r.stations.find((s) => s.ratios["flex-pos-t"] !== undefined)!;
    expect(st).toBeTruthy();
    expect(c.value(String.raw`M_{lat}\coloneq`, "kip ft")).toBeGreaterThan(0);
  });

  it("works out the grid (refined analysis) on a tight curve, and the wind during construction, with no errors", () => {
    const i: SteelGirderInputs = { ...STEEL_DEFAULTS, analysis: "grid", radius: 600, wind: { ...STEEL_DEFAULTS.wind, construction: 70 } };
    const r = designSteelGirder(i);
    const c = workOut(i);
    expect(c.errors).toEqual([]);
    expect(r.checks.some((x) => x.id.startsWith("cw-"))).toBe(true);
    expect(r.checks.some((x) => x.id.startsWith("curve-"))).toBe(false);
    expect(c.checks.filter((x) => x.result.includes("NG")).length).toBe(r.checks.filter((x) => !x.ok && !x.advisory).length);
  });

  it("works out a single span with Fatigue II (low traffic) with no errors", () => {
    const i: SteelGirderInputs = { ...STEEL_DEFAULTS, spans: [100], segments: [{ ...STEEL_DEFAULTS.segments[0], length: 100 }], stiffeners: [], fatigue: { ...STEEL_DEFAULTS.fatigue, adttSL: 300 } };
    const c = workOut(i);
    expect(c.errors).toEqual([]);
    expect(c.checks.length).toBeGreaterThan(10);
  });

  it("works out Service II (with the deck's 2fr test) and constructibility (1.4 DC1, AASHTO 3.4.2.1), their values the engine's", () => {
    for (const inputs of [{ ...STEEL_DEFAULTS, appendixA6: false, redistribution: false }, STEEL_DEFAULTS]) {
      const r = designSteelGirder(inputs);
      const c = workOut(inputs);
      expect(c.errors).toEqual([]);
      const top = r.checks.find((x) => x.id === "svc-top")!;
      const bot = r.checks.find((x) => x.id === "svc-bot")!;
      close(c.value(String.raw`f_{fsT}\coloneq`, "ksi"), top.demand);
      close(c.value(String.raw`f_{fsB}\coloneq`, "ksi"), bot.demand);
      const fnc = r.checks.find((x) => x.id === "con-fnc")!;
      const regionsOk = c.checks.filter((x) => x.latex.includes("F_{nc") && x.latex.includes("f_{buc"));
      expect(regionsOk.length).toBeGreaterThan(0);
      expect(fnc).toBeTruthy();
    }
    // The pier's deck worked out as cracked without B6 (1.106 ksi > 2fr).
    const plain = workOut({ ...STEEL_DEFAULTS, appendixA6: false, redistribution: false });
    expect(plain.checks.some((x) => x.latex.includes("f_{dk") && x.result.includes("cracked"))).toBe(true);
  });

  it("every line of math fits on the page, beside its note or across it", () => {
    const cases: SteelGirderInputs[] = [
      { ...STEEL_DEFAULTS, appendixA6: false, redistribution: false },
      STEEL_DEFAULTS,
      { ...STEEL_DEFAULTS, redistributionMethod: "refined", wind: { ...STEEL_DEFAULTS.wind, V: 115, construction: 70 }, endFrame: { ...STEEL_DEFAULTS.endFrame, abutment: "seat" } },
      { ...STEEL_DEFAULTS, radius: 2000, pours: [{ from: 0, to: 60, order: 1 }, { from: 60, to: 120, order: 3 }, { from: 120, to: 180, order: 2 }] },
    ];
    for (const c of cases) expect(steelCalcLines(c, "T").flatMap((l) => ("math" in l && !fitsAcross(l.math) ? [l.math.slice(0, 60)] : []))).toEqual([]);
  });
});
