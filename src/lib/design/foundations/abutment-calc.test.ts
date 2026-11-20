import type { Unit } from "mathjs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem, type Value } from "@/lib/calcs/evaluate";
import { layout } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { WORKSHEET_TOLERANCE } from "../calc-style";
import { fitsAcross } from "@/lib/calcs/library/fit";
import { runBridge } from "../bridge/bridge";
import { F15E, F15E_ABUTMENT, F15E_GIRDER } from "../bridge/f15e.fixture";
import { abutmentFromBridge } from "../bridge/loadpath";
import { designAbutment, stemEndBarsOf, type AbutmentInputs } from "./abutment";
import { abutmentTakeoff } from "./detail";
import { abutmentBars } from "../bridge/rebar3d-more";
import { BARS } from "../walls/cip";
import { foundationCalcLines } from "./calc";
import { abutmentInputs, micropileInputs } from "./kinds";
import { designMicropile } from "./micropile";

// The abutment's and the micropile's worked calcs, evaluated by Calcs, agree with the design engine check by check.

function workOut(kind: "abutment" | "micropile", inputs: unknown) {
  const regions = readingOrder(layout(foundationCalcLines(kind, inputs, "Test"), { x: 0, y: 0 }));
  const items = regions.flatMap((r): SheetItem[] => (r.kind === "text" || r.kind === "image" ? [] : [r as SheetItem]));
  const values = new Map<string, Value>();
  const results = evaluateSheet(items, DEFAULT_SETTINGS, values);
  const errors = regions.flatMap((r) => (results.get(r.id)?.kind === "error" ? [`${r.kind === "math" ? r.latex : r.kind}: ${(results.get(r.id) as { message: string }).message}`] : []));
  const ifs = regions.filter((r) => r.kind === "math" && r.latex.startsWith("\\operatorname{if}"));
  const ng = ifs.map((r) => ({ latex: r.kind === "math" ? r.latex : "", res: (results.get(r.id) as { result?: string }).result ?? "" })).filter((x) => x.res.includes("NG"));
  const value = (start: string, unit?: string) => {
    const r = regions.find((x) => x.kind === "math" && x.latex.startsWith(start));
    if (!r) throw new Error(`No region ${start}`);
    const v = values.get(r.id);
    return unit ? (v as Unit).toNumber(unit) : (v as number);
  };
  const wide = foundationCalcLines(kind, inputs, "Test").flatMap((l) => ("math" in l && !fitsAcross(l.math) ? [l.math.slice(0, 80)] : []));
  return { errors, ng, value, checks: ifs.length, wide };
}

const close = (a: number, b: number, tol = WORKSHEET_TOLERANCE) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

describe("the abutment's worked calcs", () => {
  const run = runBridge(F15E, [F15E_GIRDER]);
  const bx = (k: number) => ({ ...abutmentFromBridge(F15E, run, k, abutmentInputs({})), ...F15E_ABUTMENT(k) }) as AbutmentInputs;

  for (const k of [0, 1]) {
    it(`Bridge X, Abutment ${k + 1} (semi-integral on micropile rows): no errors, every check matching the engine`, () => {
      const i = bx(k);
      const r = designAbutment(i);
      const w = workOut("abutment", i);
      expect(w.errors).toEqual([]);
    expect(w.wide).toEqual([]);
      expect(w.wide).toEqual([]);
      const failing = r.checks.filter((c) => !c.ok && !c.advisory).length;
      // The calc's NG lines are the engine's failing checks (Abutment 1's footing top bars and the plate weld).
      expect(w.ng.length).toBe(failing);
      const s = r.seat!;
      close(w.value("V_{a}", "kip/ft"), s.rows[0].V);
      close(w.value("x_{Ra}", "ft"), s.rows[0].xR);
      close(w.value("V_{c}", "kip/ft"), s.rows[2].V);
      const get = (id: string) => r.checks.find((c) => c.id === id)!;
      close(w.value("M_{ust}", "kip*ft/ft"), get("stem-flex").demand);
      close(w.value("M_{rst}", "kip*ft/ft"), get("stem-flex").capacity);
      close(w.value("s_{maxst}", "in"), get("stem-crack").capacity);
      close(w.value("V_{ust}", "kip/ft"), get("stem-shear").demand);
      close(w.value("V_{rst}", "kip/ft"), get("stem-shear").capacity);
      // The end diaphragm rides on the bearings: its horizontal bars under passive pressure, not a backwall on the seat.
      close(w.value("M_{udh}", "kip*ft/ft"), get("semi-pass").demand);
      close(w.value("M_{rdh}", "kip*ft/ft"), get("semi-pass").capacity);
      close(w.value("M_{fp}", "kip*ft/ft"), get("foot-bot").demand);
      close(w.value("M_{rfb}", "kip*ft/ft"), get("foot-bot").capacity);
      close(w.value("M_{fn}", "kip*ft/ft"), get("foot-top").demand);
      close(w.value("M_{rft}", "kip*ft/ft"), get("foot-top").capacity);
      close(w.value("V_{uf}", "kip/ft"), get("foot-shear").demand);
      close(w.value("V_{rf}", "kip/ft"), get("foot-shear").capacity);
      close(w.value("P_{pu}", "kip"), get("foot-punch").demand);
      close(0.9 * w.value("V_{np}", "kip"), get("foot-punch").capacity);
      close(w.value("M_{ult}", "kip*ft/ft"), get("foot-long-top").demand);
      close(w.value("M_{rlt}", "kip*ft/ft"), get("foot-long-top").capacity);
      close(w.value("V_{uL}", "kip/ft"), get("foot-long-shear").demand);
      // The micropile rows and the micropile.
      close(Math.max(...[1, 2, 3].filter((n) => n <= s.micropiles!.rows.length).flatMap((n) => [w.value(`P_{a${n}}`, "kip"), w.value(`P_{b${n}}`, "kip")])), s.micropiles!.Pmax);
      const m = s.micropiles!.result;
      close(w.value("R_{ncc}", "kip"), m.RnCC);
      close(w.value("R_{ncu}", "kip"), m.RnCU);
      close(w.value("R_{ntc}", "kip"), m.RnTC);
      close(w.value("R_{s}", "kip"), m.Rs);
      close(w.value("t_{min}", "in"), get("mp-plate-t").demand);
      close(w.value("R_{w}", "kip"), get("mp-plate-weld").capacity);
      close(w.value("l_{d}", "ft"), get("mp-bar-dev").demand);
      close(1.0 * 0.5 * w.value("F_{cr}", "ksi") * w.value("A_{gv}", "in^2"), get("mp-casing-shear").capacity);
    });
  }

  it("an integral abutment on micropiles (CDOT's array): no errors, the cap, the diaphragm and the micropile matching", () => {
    const i = abutmentInputs({ type: "integral-micropiles", groupMoment: 5240, groupMomentAlong: 2734, nPiles: 12, mpRows: 2, micropile: { casingOD: 9.625, casingT: 0.545, casingFy: 80, bar: 20, barFy: 75, fcGrout: 5, holeD: 10, cased: 20, bond: 25, alphaB: 4.3, phiBond: 0.55, embed: 12, loadTested: true, phiBondTested: 0.7, plate: { size: 14, t: 1.5, Fy: 36, weld: 0.375, Fexx: 70 } } });
    const r = designAbutment(i);
    const w = workOut("abutment", i);
    expect(w.errors).toEqual([]);
    expect(w.wide).toEqual([]);
    expect(w.ng.length).toBe(r.checks.filter((c) => !c.ok && !c.advisory).length);
    const get = (id: string) => r.checks.find((c) => c.id === id)!;
    const f = r.integral!.foundation!;
    if (f.kind !== "micropiles") throw new Error("micropiles");
    close(w.value("P_{mx}", "kip"), f.PmaxS);
    close(w.value("V_{u}", "kip"), r.integral!.Pu * r.integral!.n * r.integral!.rowsMP);
    close(w.value("M_{rb}", "kip*ft"), get("cap-pos").capacity);
    close(w.value("M_{rt}", "kip*ft"), get("cap-neg").capacity);
    close(0.9 * Math.min(w.value("V_{cc}", "kip") + w.value("V_{sc}", "kip"), 0.25 * i.fc * i.capWidth * 12 * w.value("d_{vc}", "in")), get("cap-shear").capacity);
    close(w.value("M_{ud}", "kip*ft/ft"), get("diaphragm").demand);
    close(w.value("M_{rd}", "kip*ft/ft"), get("diaphragm").capacity);
    close(w.value("M_{rm}", "kip*ft"), f.phiMn);
  });

  it("a seat abutment on a spread footing: no errors, bearing, sliding, toe and heel matching", () => {
    const i = abutmentInputs({ type: "seat", foundation: "footing", heel: 6, toe: 3, stemH: 14 });
    const r = designAbutment(i);
    const w = workOut("abutment", i);
    expect(w.errors).toEqual([]);
    expect(w.wide).toEqual([]);
    expect(w.ng.length).toBe(r.checks.filter((c) => !c.ok && !c.advisory).length);
    const get = (id: string) => r.checks.find((c) => c.id === id)!;
    close(w.value("q_{eq}", "ksf"), get("bearing").demand);
    close(w.value("M_{uto}", "kip*ft/ft"), get("toe").demand);
    close(w.value("M_{uhe}", "kip*ft/ft"), get("heel").demand);
    close(w.value("M_{rhe}", "kip*ft/ft"), get("heel").capacity);
    close(w.value("N_{s}", "in"), get("seat").demand);
  });
});

describe("the micropile's worked calc", () => {
  it("with corrosion, a plunge length, tension, the head's shear and a plate: no errors, matching the engine", () => {
    const i = micropileInputs({ aggressive: true, plunge: 3, plate: { size: 10, t: 1.25, Fy: 36, weld: 0.25, Fexx: 70 }, cases: [{ name: "Strength I", limit: "strength", compression: 230, tension: 0, H: 6 }, { name: "Strength III", limit: "strength", compression: 120, tension: 80, H: 8 }, { name: "Service I", limit: "service", compression: 160, tension: 0, H: 3 }] });
    const r = designMicropile(i);
    const w = workOut("micropile", i);
    expect(w.errors).toEqual([]);
    expect(w.wide).toEqual([]);
    expect(w.ng.length).toBe(r.checks.filter((c) => !c.ok && !c.advisory).length);
    const get = (id: string) => r.checks.find((c) => c.id === id)!;
    close(w.value("R_{ncc}", "kip"), r.RnCC);
    close(w.value("R_{ntc}", "kip"), r.RnTC);
    close(w.value("P_{pl}", "kip"), r.Pt);
    close(w.value("l_{d}", "ft"), get("bar-dev").demand);
    const g = r.comb.reduce((a, b) => (b.value > a.value ? b : a));
    close(w.value("P_{cm}", "kip") / w.value("P_{r}", "kip") + w.value("M_{pm}", "kip*ft") / w.value("M_{p}", "kip*ft"), g.value);
    close(0.5 * w.value("F_{cr}", "ksi") * w.value("A_{gv}", "in^2"), get("casing-shear").capacity);
    close(w.value("\\Delta_{e}", "in"), get("elastic").demand);
    close(w.value("R_{w}", "kip"), get("plate-weld").capacity);
  });
});

describe("a pier footing on micropiles: the micropile worked out with the group's loads", () => {
  it("no errors, the micropile's checks matching the engine", async () => {
    const { pileFoundationInputs } = await import("./kinds");
    const { designPiles } = await import("./piles");
    const i = pileFoundationInputs({ pileType: "micropile", nB: 4, nL: 4, sB: 2.5, sL: 2.5, capT: 48, edge: 1.5, micropile: { casingOD: 9.625, casingT: 0.545, casingFy: 80, bar: 20, barFy: 75, fcGrout: 5, holeD: 10, cased: 20, bond: 55, alphaB: 4.3, phiBond: 0.55, embed: 12, loadTested: true, phiBondTested: 0.7 } });
    const r = designPiles(i);
    const regions = readingOrder(layout(foundationCalcLines("pile-foundation", i, "Test"), { x: 0, y: 0 }));
    const items = regions.flatMap((x): SheetItem[] => (x.kind === "text" || x.kind === "image" ? [] : [x as SheetItem]));
    const values = new Map<string, Value>();
    const results = evaluateSheet(items, DEFAULT_SETTINGS, values);
    expect(regions.flatMap((x) => (results.get(x.id)?.kind === "error" ? [x.kind === "math" ? x.latex : x.kind] : []))).toEqual([]);
    const at = (start: string, unit: string) => (values.get(regions.find((x) => x.kind === "math" && x.latex.startsWith(start))!.id) as Unit).toNumber(unit);
    close(at("R_{ncc}", "kip"), r.micropileResult!.RnCC);
    close(at("R_{s}", "kip"), r.micropileResult!.Rs);
  });
});

describe("the pile cap's and the drilled shaft's worked calcs", () => {
  const sheet = (kind: "pile-foundation" | "drilled-shaft", inputs: unknown) => {
    const all = foundationCalcLines(kind, inputs, "Test");
    const regions = readingOrder(layout(all, { x: 0, y: 0 }));
    const items = regions.flatMap((x): SheetItem[] => (x.kind === "text" || x.kind === "image" ? [] : [x as SheetItem]));
    const values = new Map<string, Value>();
    const results = evaluateSheet(items, DEFAULT_SETTINGS, values);
    const errors = regions.flatMap((x) => (results.get(x.id)?.kind === "error" ? [`${x.kind === "math" ? x.latex : x.kind}: ${(results.get(x.id) as { message: string }).message}`] : []));
    const ng = regions.filter((x) => x.kind === "math" && x.latex.startsWith("\\operatorname{if}")).filter((x) => ((results.get(x.id) as { result?: string }).result ?? "").includes("NG")).map((x) => (x.kind === "math" ? x.latex.slice(0, 80) : ""));
    const at = (start: string, unit: string) => {
      const reg = regions.find((x) => x.kind === "math" && x.latex.startsWith(start));
      if (!reg) throw new Error(`No region ${start}`);
      const v = values.get(reg.id);
      return typeof v === "number" ? v : (v as Unit).toNumber(unit);
    };
    const wide = all.flatMap((l) => ("math" in l && !fitsAcross(l.math) ? [l.math.slice(0, 80)] : []));
    return { errors, ng, at, wide };
  };

  for (const [name, over] of [
    ["H-piles under a round column (the default)", {}],
    ["H-piles under a rectangular column, a moment both ways and uplift", { colShape: "rectangular", colB: 48, colL: 36, cases: [{ name: "Strength I", limit: "strength", P: 900, MB: 2200, ML: 900, HB: 60, HL: 30 }, { name: "Service I", limit: "service", P: 700, MB: 1200, ML: 500, HB: 30, HL: 15 }] }],
    ["micropiles, 4 by 4 (a pier footing)", { pileType: "micropile", nB: 4, nL: 4, sB: 2.5, sL: 2.5, capT: 48, edge: 1.5, micropile: { casingOD: 9.625, casingT: 0.545, casingFy: 80, bar: 20, barFy: 75, fcGrout: 5, holeD: 10, cased: 20, bond: 55, alphaB: 4.3, phiBond: 0.55, embed: 12, loadTested: true, phiBondTested: 0.7 } }],
  ] as [string, object][]) {
    it(`pile cap, ${name}: no errors, fits the page, matching the engine`, async () => {
      const { pileFoundationInputs } = await import("./kinds");
      const { designPiles } = await import("./piles");
      const i = pileFoundationInputs(over);
      const r = designPiles(i);
      const s = sheet("pile-foundation", i);
      expect(s.errors).toEqual([]);
      expect(s.wide).toEqual([]);
      expect(s.ng.length).toBe(r.checks.filter((c) => !c.ok && !c.advisory).length);
      const get = (id: string) => r.checks.find((c) => c.id === id)!;
      close(s.at("M_{ucB}", "kip*ft/ft"), get("cap-flex-B").demand);
      close(s.at("M_{rcB}", "kip*ft/ft"), get("cap-flex-B").capacity);
      close(s.at("M_{ucL}", "kip*ft/ft"), get("cap-flex-L").demand);
      close(s.at("M_{rcL}", "kip*ft/ft"), get("cap-flex-L").capacity);
      close(s.at("V_{uB}", "kip"), get("cap-shear-B").demand);
      close(s.at("V_{rB}", "kip"), get("cap-shear-B").capacity);
      close(s.at("V_{uL}", "kip"), get("cap-shear-L").demand);
      close(s.at("V_{rL}", "kip"), get("cap-shear-L").capacity);
      close(0.9 * s.at("V_{np}", "kip"), get("cap-punch-col").capacity);
      close(0.9 * s.at("V_{nc}", "kip"), get("cap-punch-pile").capacity);
      close(s.at("M_{rtB}", "kip*ft/ft"), get("cap-top-B").capacity);
      close(s.at("A_{T}\\coloneq", "in^2/ft"), get("cap-top-temp").demand);
    });
  }

  for (const [name, over] of [
    ["the default", {}],
    ["48 in, with uplift", { D: 48, cases: [{ name: "Strength I", limit: "strength", P: 900, M: 600, H: 60, uplift: 0 }, { name: "Strength III", limit: "strength", P: 300, M: 900, H: 80, uplift: 120 }, { name: "Service I", limit: "service", P: 650, M: 400, H: 40, uplift: 0 }] }],
  ] as [string, object][]) {
    it(`drilled shaft, ${name}: no errors, fits the page, matching the engine`, async () => {
      const { shaftInputs } = await import("./kinds");
      const { designShaft } = await import("./shaft");
      const i = shaftInputs(over);
      const r = designShaft(i);
      const s = sheet("drilled-shaft", i);
      expect(s.errors).toEqual([]);
      expect(s.wide).toEqual([]);
      expect(s.ng.length).toBe(r.checks.filter((c) => !c.ok && !c.advisory).length);
      const get = (id: string) => r.checks.find((c) => c.id === id)!;
      close(s.at("P_{us}", "kip"), get("axial").demand);
      close(s.at("R_{Rs}", "kip") + s.at("\\phi_{qp}", "") * s.at("R_{p}\\coloneq q", "kip"), get("axial").capacity);
      close(0.9 * s.at("V_{ns}", "kip"), get("shear").capacity);
      close(s.at("V_{us}", "kip"), get("shear").demand);
      close(s.at("M_{ms}", "kip*ft"), get("pm").demand);
      if (r.checks.find((c) => c.id === "uplift")) close(s.at("R_{up}", "kip") + 0.9 * s.at("W_{s}", "kip"), get("uplift").capacity);
    });
  }
});

describe("steel girders' ends in an integral abutment's diaphragm", () => {
  const i = abutmentInputs({ girderMaterial: "steel" });
  const r = designAbutment(i);
  const se = r.integral!.steelEnds!;
  it("studs for each girder's pull (the piles' head shears and braking), the web's net section at the holes, the dowels by shear friction", () => {
    expect(se.pull).toBeCloseTo(se.piles + 1.75 * i.braking, 9);
    expect(se.perGirder).toBeCloseTo(se.pull / i.nGirders, 9);
    expect(se.Qr).toBeCloseTo(0.7 * ((Math.PI * 0.875 ** 2) / 4) * 60, 9);
    expect(se.Dnet).toBeCloseTo(42 - 3 * 1.375, 9);
    expect(r.checks.filter((c) => c.id.startsWith("steel-") && !c.ok).map((c) => c.name)).toEqual([]);
  });
  it("its worked calc: no errors, no NG, every line on the page", () => {
    const c = workOut("abutment", i);
    expect(c.errors).toEqual([]);
    expect(c.ng).toEqual([]);
    expect(c.wide).toEqual([]);
    close(c.value(String.raw`T_{g}\coloneq`, "kip"), se.perGirder);
  });
  it("precast girders have none of it", () => expect(designAbutment(abutmentInputs({})).integral!.steelEnds).toBeNull());
});

describe("a semi-integral abutment's end diaphragm (CDOT BDM 11.3.2, Figure 11-3)", () => {
  for (const girderMaterial of ["precast", "steel"] as const) {
    const i = abutmentInputs({ type: "semi-integral", girderMaterial });
    const r = designAbutment(i);
    const sd = r.seat!.semi!;
    it(`${girderMaterial}: a beam between the girders, not a backwall on the seat; jacking at 1.3 × the permanent reaction to a jack either side`, () => {
      expect(r.checks.some((c) => c.id === "backwall")).toBe(false);
      expect(sd.Rj).toBeCloseTo(1.3 * (i.RDC + i.RDW), 9);
      expect(sd.Mj).toBeCloseTo((sd.Rj / 2) * sd.jackOffset, 9);
      expect(r.checks.filter((c) => c.id.startsWith("semi") && !c.ok).map((c) => c.name)).toEqual([]);
      if (girderMaterial === "steel") expect(r.checks.some((c) => c.id === "semi-studs")).toBe(true);
    });
    it(`${girderMaterial}: its worked calc, no errors, no NG, every line on the page`, () => {
      const c = workOut("abutment", i);
      expect(c.errors).toEqual([]);
      expect(c.ng).toEqual([]);
      expect(c.wide).toEqual([]);
      close(c.value(String.raw`M_{j}\coloneq`, "kip ft"), sd.Mj);
    });
  }
});

describe("a seat abutment's backwall (earth, live load surcharge, the axles on its top)", () => {
  const i = abutmentInputs({ type: "seat", foundation: "footing" });
  const r = designAbutment(i);
  it("its worked calc: no errors, the engine's values, every line on the page", () => {
    const c = workOut("abutment", i);
    expect(c.errors).toEqual([]);
    expect(c.wide).toEqual([]);
    expect(c.ng.length).toBe(r.checks.filter((x) => !x.ok && !x.advisory).length);
    const get = (id: string) => r.checks.find((x) => x.id === id)!;
    close(c.value(String.raw`M_{ubw}\coloneq`, "kip*ft/ft"), get("backwall").demand);
    close(c.value(String.raw`V_{ubw}\coloneq`, "kip/ft"), get("backwall-shear").demand);
  });
});

describe("the live load surcharge on a seat abutment without an approach slab (AASHTO 3.11.6.4.1)", () => {
  const i = abutmentInputs({ type: "seat", foundation: "footing", approachDC: 0 });
  const r = designAbutment(i);
  it("applied by heq for the whole height, and the worked calc agrees, no errors, every line on the page", () => {
    expect(r.seat!.heqW).toBeGreaterThan(0);
    const c = workOut("abutment", i);
    expect(c.errors).toEqual([]);
    expect(c.wide).toEqual([]);
    expect(c.ng.length).toBe(r.checks.filter((x) => !x.ok && !x.advisory).length);
  });
  it("left out with an approach slab (CDOT BDM 11.3, AASHTO 3.11.6.5)", () => {
    expect(designAbutment(abutmentInputs({ type: "seat", foundation: "footing" })).seat!.heqW).toBe(0);
    expect(designAbutment(abutmentInputs({ type: "seat", foundation: "footing", lsOmit: false })).seat!.heqW).toBeGreaterThan(0);
  });
});

describe("the wingwalls' Section B forces on the abutment's ends", () => {
  const wing = { L: 20, h: 3, t: 12 };
  const integral = abutmentInputs({ type: "integral-piles", wing });
  const seat = abutmentInputs({ type: "seat", wing });
  const r = designAbutment(integral);
  const g = r.integral!;
  const check = (res: ReturnType<typeof designAbutment>, id: string) => res.checks.find((c) => c.id === id)!;

  it("integral: each wingwall's weight × 1.25 on the cap's ends, and on the end pile through the overhang", () => {
    // The wingwall: 12 in × H (the abutment's total depth) × 20 ft, 0.150 kcf.
    const Vw = 1 * integral.totalDepth * 20 * integral.gammaC;
    close(g.wing!.Pw, 1.25 * Vw, 1e-9);
    const lever = g.supports[0] / (g.supports[1] - g.supports[0]);
    close(g.wing!.PuEnd, g.Pu + 1.25 * Vw * (1 + lever), 1e-9);
    close(check(r, "wing-pile-axial").demand, g.wing!.PuEnd, 1e-9);
    // The cap's beam carries the wingwalls on its overhangs: more negative moment over the end support.
    const bare = designAbutment(abutmentInputs({ type: "integral-piles" })).integral!;
    const at = (x: typeof g) => x.beam.M[x.beam.xs.indexOf(x.supports[0])];
    expect(at(g)).toBeLessThan(at(bare));
  });

  it("integral: the end section's tension and moments by a linear interaction, the corner bars on the back face", () => {
    const e = g.wing!.end!;
    // The wingwall's default corner bars, its retained face's #8 @ 6 in, over its height less the covers.
    close(e.AsCorner, ((0.79 * 12) / 6) * (integral.totalDepth - 4 / 12), 1e-9);
    const c = check(r, "wing-end");
    close(c.demand, e.Nu / e.Pr + e.Myu / e.MrY + e.Mxu / e.MrX!, 1e-9);
    expect(c.ok).toBe(true);
  });

  it("integral: the wingwall's weight's torsion against 0.25 φ Tcr, then the closed stirrups with the shear (5.7.2.1, 5.7.3.6.2)", () => {
    const e = g.wing!.end!;
    const b = integral.capWidth * 12;
    const h = integral.totalDepth * 12;
    close(e.Tcr, (0.126 * Math.sqrt(integral.fc) * (b * h) ** 2) / (2 * (b + h)) / 12, 1e-9);
    const t = check(r, "wing-torsion");
    close(t.capacity, 0.25 * 0.9 * e.Tcr, 1e-9);
    if (!e.neglect) {
      const st = check(r, "wing-torsion-steel");
      close(st.demand, e.tors!.Av + 2 * e.tors!.At, 1e-9);
      expect(t.ok).toBe(st.ok); // over the threshold, designed for by the stirrups
    }
  });

  it("seat: the wingwalls' weight in the footing's statics, the stem's end in tension and My, no torsion along it", () => {
    const s = designAbutment(seat).seat!;
    const H = seat.stemH + seat.backwallH;
    close(s.items.wings.V, (2 * (1 * H * 20 * seat.gammaC)) / seat.length, 1e-9);
    close(s.items.wings.x, seat.toe + seat.stemT + 10 * Math.cos((seat.skew * Math.PI) / 180), 1e-9);
    const res = designAbutment(seat);
    expect(res.checks.some((c) => c.id === "wing-torsion")).toBe(false);
    expect(check(res, "wing-end").ok).toBe(true);
  });

  for (const [name, inputs] of [["integral", integral], ["seat", seat]] as const)
    it(`works the ${name} abutment with wingwalls out: no errors, every line on the page, its checks as the engine's`, () => {
      const c = workOut("abutment", inputs);
      expect(c.errors).toEqual([]);
      expect(c.wide).toEqual([]);
      const res = designAbutment(inputs);
      const fails = res.checks.filter((x) => !x.ok && !x.advisory).length;
      expect(c.ng.length > 0).toBe(fails > 0);
    });

  it("no wingwalls: nothing changes", () => {
    const a = designAbutment(abutmentInputs({ type: "seat" }));
    const b = designAbutment(abutmentInputs({ type: "seat", wing: { L: 0, h: 3, t: 12 } }));
    expect(b.checks.map((c) => [c.id, c.demand])).toEqual(a.checks.map((c) => [c.id, c.demand]));
  });
});

describe("the wingwalls' thrust square to a skewed abutment", () => {
  const wing = { L: 20, h: 3, t: 12 };
  const th = (30 * Math.PI) / 180;
  const integral = abutmentInputs({ type: "integral-piles", skew: 30, wing });
  const seat = abutmentInputs({ type: "seat", foundation: "footing", skew: 30, wing });
  const check = (res: ReturnType<typeof designAbutment>, id: string) => res.checks.find((c) => c.id === id);

  it("integral: P cos θ along the abutment as tension; P sin θ on the end, a cantilever from the exterior girder", () => {
    const r = designAbutment(integral);
    const gw = r.integral!.wing!;
    const e = gw.end!;
    const P = e.Nu / Math.cos(th);
    close(e.cos, Math.cos(th), 1e-12);
    const p = gw.push!;
    close(p.Hu, P * Math.sin(th), 1e-9);
    close(p.a, r.integral!.girders[0], 1e-12);
    close(p.Mu, e.Myu + p.Hu * p.a + (p.pOh * p.a ** 2) / 2, 1e-9);
    close(p.kC, Math.min(1, p.past / p.ld), 1e-12);
    close(check(r, "wing-push")!.demand, e.Nu / p.PrF + p.Mu / p.MrF + p.Mx / e.MrX!, 1e-9);
    close(check(r, "wing-push-shear")!.demand, p.Hu + p.pOh * p.a, 1e-9);
  });

  it("square to the abutment (no skew): no push, the whole thrust along it", () => {
    const r = designAbutment(abutmentInputs({ type: "integral-piles", skew: 0, wing }));
    expect(r.integral!.wing!.push).toBeNull();
    expect(r.checks.some((c) => /^wing-(push|twist)/.test(c.id))).toBe(false);
    close(r.integral!.wing!.end!.cos, 1, 1e-12);
  });

  it("seat on a footing: two wingwalls a couple taken by friction; one a net force with the earth pressure", () => {
    const r = designAbutment(seat);
    const s = r.seat!;
    const wp = s.wingPush!;
    close(wp.Tu, wp.Hu * seat.length, 1e-9);
    expect(wp.qWu).toBe(0); // two push opposite ways: no net force
    const RR = s.footing!.RR;
    const tw = check(r, "wing-twist")!;
    close(tw.capacity, RR * Math.sqrt(1 - (4 * wp.Tu) / (RR * seat.length ** 2)), 1e-9);
    close(tw.demand, check(r, "sliding")!.demand, 1e-12);
    const one = designAbutment({ ...seat, wing: { ...wing, count: 1 } });
    const wp1 = one.seat!.wingPush!;
    close(wp1.qWu, wp1.Hu / seat.length, 1e-9);
    close(wp1.Tu, (wp1.Hu * seat.length) / 2 + wp1.Myu, 1e-9);
    close(check(one, "sliding")!.demand - check(r, "sliding")!.demand, wp1.qWu, 1e-9);
  });

  it("seat on piles: the couple shared elastically, the end strip's q = 6T/L² per foot", () => {
    const piles = abutmentInputs({ type: "seat", foundation: "piles", skew: 30, wing });
    const bare = designAbutment({ ...piles, skew: 0 });
    const r = designAbutment(piles);
    const wp = r.seat!.wingPush!;
    close(wp.qWu, (6 * wp.Tu) / piles.length ** 2, 1e-9);
    // the strength rows carry it with the earth pressure, at its height
    const hh = (x: typeof r) => x.seat!.rows[0].Hh;
    close(hh(r) - hh(bare), wp.qWu, 1e-9);
  });

  it("seat: the stem's end takes P sin θ spread at 45° one way, P sin θ per foot on its moment", () => {
    const r = designAbutment(seat);
    const s = r.seat!;
    const st = s.wingPush!.stem!;
    close(check(r, "wing-push-stem")!.demand, s.Mstem + st.Hu, 1e-9);
    close(check(r, "wing-push-stem-shear")!.demand, s.Vstem + st.Hu / st.y, 1e-9);
  });

  it("seat: the stem's end bars, the smallest added between the main bars that's enough, over the spread width", () => {
    const r = designAbutment(seat);
    const st = r.seat!.wingPush!.stem!;
    const none = designAbutment({ ...seat, stemEndBars: null });
    // the main bars alone fall short here; the designed bars make it, one size smaller doesn't
    expect(check(none, "wing-push-stem")!.ok).toBe(false);
    expect(none.seat!.wingPush!.stem!.end).toBeNull();
    const e = st.end!;
    expect(e.auto).toBe(true);
    expect(e.spacing).toBe(seat.stemBars.spacing);
    expect(e.width).toBe(Math.ceil(st.y));
    expect(e.ends).toBe(2);
    const c = check(r, "wing-push-stem")!;
    expect(c.ok).toBe(true);
    const As = (BARS[seat.stemBars.bar].area * 12) / seat.stemBars.spacing + (BARS[e.bar].area * 12) / e.spacing;
    close(st.As, As, 1e-9);
    if (e.bar > 4) expect(check(designAbutment({ ...seat, stemEndBars: { bar: e.bar - 1 } }), "wing-push-stem")!.ok).toBe(false);
    // given, over less than the spread width: flagged, and not counted
    const narrow = designAbutment({ ...seat, stemEndBars: { bar: e.bar, width: 1 } });
    expect(check(narrow, "wing-push-stem-width")!.ok).toBe(false);
    expect(check(narrow, "wing-push-stem")!.ok).toBe(false);
    // not needed: none
    expect(designAbutment({ ...seat, skew: 5 }).seat!.wingPush!.stem!.end).toBeNull();
  });

  it("the wingwalls' weight along the abutment: two balance (a rigid footing), one is an eccentricity along it", () => {
    expect(designAbutment(seat).seat!.endWing).toBeNull();
    const one = { ...seat, wing: { ...wing, count: 1 } };
    const r = designAbutment(one);
    const s = r.seat!;
    const ew = s.endWing!;
    close(ew.lever, seat.length / 2 + 10 * Math.sin(th), 1e-9);
    const a = s.rows[0];
    close(ew.M, 1.25 * ew.W * ew.lever, 1e-9);
    close(ew.eL!, ew.M / (a.V * seat.length), 1e-9);
    const Bp = (seat.toe + seat.stemT + seat.heel) - 2 * Math.abs(a.e);
    close(check(r, "bearing")!.demand, (a.V * seat.length) / (Bp * (seat.length - 2 * ew.eL!)), 1e-9);
    expect(check(r, "wing-ecc-long")!.ok).toBe(true);
    // on piles: the end pile takes P/n ± M x/Σx²
    const piles = { ...abutmentInputs({ type: "seat", foundation: "piles", skew: 30, wing }), wing: { ...wing, count: 1 } };
    const rp = designAbutment(piles);
    const ep = rp.seat!.endWing!;
    close(ep.dP!, (ep.M * ep.xmax!) / (2 * ep.S2!), 1e-9);
    close(check(rp, "wing-pile-end")!.demand, Math.max(rp.seat!.piles!.Pfront, rp.seat!.piles!.Pback) + ep.dP!, 1e-9);
  });

  it("seat: the end bars in the bar schedule and the Bridge's 3D stem", () => {
    const e = stemEndBarsOf(seat)!;
    const g = abutmentTakeoff(seat).schedule.groups.find((x) => x.use === "Stem, back face, added at the ends")!;
    expect(g.size).toBe(e.bar);
    expect(g.count).toBe(2 * Math.floor((e.width * 12 - 2) / e.spacing));
    expect(abutmentTakeoff({ ...seat, stemEndBars: null }).schedule.groups.some((x) => x.use.includes("added at the ends"))).toBe(false);
    const el = { profile: { kind: "rect", x: seat.length, y: seat.stemT }, depth: seat.stemH } as unknown as Parameters<typeof abutmentBars>[1];
    const sets = abutmentBars(0, el, "stem", { ...seat, stemEnd: e }, 1);
    const added = sets.find((s) => s.label.includes("added at the wingwalls' ends"))!;
    expect(added.size).toBe(e.bar);
    // halfway between the main bars, within the width of either end
    for (const [x] of added.at) expect(Math.min(x + seat.length / 2, seat.length / 2 - x)).toBeLessThanOrEqual(e.width);
    expect(added.at.length).toBeGreaterThan(0);
  });

  for (const [name, inputs] of [["integral", integral], ["seat", seat], ["seat on piles", abutmentInputs({ type: "seat", foundation: "piles", skew: 30, wing })], ["seat, one wingwall", { ...seat, wing: { ...wing, count: 1 } }], ["seat on piles, one wingwall", { ...abutmentInputs({ type: "seat", foundation: "piles", skew: 30, wing }), wing: { ...wing, count: 1 } }], ["seat on micropiles, one wingwall", { ...abutmentInputs({ type: "seat", foundation: "micropiles", skew: 30, wing }), wing: { ...wing, count: 1 } }]] as const)
    it(`works the skewed ${name} abutment with its wingwalls' push out: no errors, every line on the page, its checks as the engine's`, () => {
      const c = workOut("abutment", inputs);
      expect(c.errors).toEqual([]);
      expect(c.wide).toEqual([]);
      const res = designAbutment(inputs);
      const fails = res.checks.filter((x) => !x.ok && !x.advisory).length;
      expect(c.ng.length > 0).toBe(fails > 0);
    });
});

describe("the abutment's remaining loads and checks (2026-11-20)", () => {
  const check = (res: ReturnType<typeof designAbutment>, id: string) => res.checks.find((c) => c.id === id);
  const integral = abutmentInputs({ type: "integral-piles" });
  const seat = abutmentInputs({ type: "seat", foundation: "footing" });

  it("integral: braking pushes the piles further at their secant stiffness, checked at the movement and that", () => {
    const none = designAbutment({ ...integral, braking: 0 }).integral!.foundation!;
    const r = designAbutment({ ...integral, braking: 40 }).integral!;
    const f = r.foundation!;
    expect(none.yBr).toBe(0);
    close(f.kHead, Math.abs(f.lat0.H0) / r.delta, 1e-9);
    close(f.yBr, (1.75 * 40) / (r.n * f.kHead), 1e-9);
    expect(f.lat.Mmax).toBeGreaterThan(f.lat0.Mmax);
  });

  it("integral: the wind along the bridge governs the push where Strength V's or III's is larger", () => {
    const r = designAbutment({ ...integral, braking: 10, windLong: { WS3: 200, WS5: 50, WL: 10, WSs: 30 } }).integral!;
    close(r.foundation!.yBr, 200 / (r.n * r.foundation!.kHead), 1e-9);
  });

  it("integral: the cap alone carries the girders' DC1, the wet diaphragm and itself at Strength IV (1.5 DC)", () => {
    const r = designAbutment({ ...integral, RDC1: 100 }).integral!;
    close(r.construction.Pg1, 1.5 * 100, 1e-9);
    close(r.construction.wDia, integral.gammaC * integral.capWidth * (integral.totalDepth - integral.capDepth), 1e-9);
    const res = designAbutment({ ...integral, RDC1: 100 });
    for (const id of ["cap-const-pos", "cap-const-neg", "cap-const-shear"]) expect(check(res, id), id).toBeDefined();
  });

  it("the approach slab's wearing surface and lane load, half on the abutment, no IM on the lane load", () => {
    const base = designAbutment(integral).integral!;
    const r = designAbutment({ ...integral, approachDW: 0.4, approachLL: 1.2 }).integral!;
    close(r.factoredStrength - base.factoredStrength, (1.5 * 0.2 + 1.75 * 0.6) * integral.length, 1e-9);
    close(r.wCap - base.wCap, 1.5 * 0.2 + 1.75 * 0.6, 1e-9);
    const s0 = designAbutment(seat).seat!;
    const s1 = designAbutment({ ...seat, approachDW: 0.4, approachLL: 1.2 }).seat!;
    close(s1.rows[0].V - s0.rows[0].V, 1.5 * 0.2 + 1.75 * 0.6, 1e-9);
    close(s1.rows[2].V - s0.rows[2].V, 0.2 + 0.6, 1e-9);
  });

  it("seat: braking with 1.75 in both Strength I sets (it pushes in the sliding set too), 1.0 in Service I", () => {
    const s0 = designAbutment({ ...seat, braking: 0 }).seat!;
    const s1 = designAbutment({ ...seat, braking: 44 }).seat!;
    const BR = 44 / seat.length;
    close(s1.rows[0].Hh - s0.rows[0].Hh, 1.75 * BR, 1e-9);
    close(s1.rows[1].Hh - s0.rows[1].Hh, 1.75 * BR, 1e-9);
    close(s1.rows[2].Hh - s0.rows[2].Hh, BR, 1e-9);
  });

  it("seat on piles: they bend about the weak axis unless set strong", () => {
    const p = abutmentInputs({ type: "seat", foundation: "piles" });
    expect(check(designAbutment(p), "pile-interaction")!.name).toContain("weak");
    expect(check(designAbutment({ ...p, seatPileAxis: "strong" }), "pile-interaction")!.name).toContain("strong");
  });

  it("seat: one wingwall's push along the abutment with the sliding force; the stem's end crack control", () => {
    const one = designAbutment({ ...seat, skew: 30, wing: { L: 20, h: 3, t: 12, count: 1 } });
    expect(check(one, "wing-slide-along")).toBeDefined();
    expect(check(designAbutment({ ...seat, skew: 30, wing: { L: 20, h: 3, t: 12 } }), "wing-slide-along")).toBeUndefined();
    const st = one.seat!.wingPush!.stem!;
    expect(check(one, "wing-push-stem-crack")!.demand).toBe(st.end ? seat.stemBars.spacing / 2 : seat.stemBars.spacing);
  });

  for (const [name, inputs] of [
    ["integral with braking, wind and the approach slab", { ...integral, braking: 40, windLong: { WS3: 20, WS5: 15, WL: 5, WSs: 8 }, approachDW: 0.4, approachLL: 1.2, RDC1: 100, girderInside: 20, girderTotals: { DC: 6 * integral.RDC - 10, DW: 6 * integral.RDW } }],
    ["seat with the wind and the approach slab", { ...seat, windLong: { WS3: 20, WS5: 15, WL: 5, WSs: 8 }, approachDW: 0.4, approachLL: 1.2 }],
  ] as const)
    it(`works the ${name} out: no errors, every line on the page, its checks as the engine's`, () => {
      const c = workOut("abutment", inputs);
      expect(c.errors).toEqual([]);
      expect(c.wide).toEqual([]);
      const res = designAbutment(inputs as AbutmentInputs);
      const fails = res.checks.filter((x) => !x.ok && !x.advisory).length;
      expect(c.ng.length > 0).toBe(fails > 0);
    });
});
