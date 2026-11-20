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
import { designAbutment, type AbutmentInputs } from "./abutment";
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
