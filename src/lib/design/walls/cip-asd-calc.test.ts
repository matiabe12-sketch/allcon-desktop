import type { Unit } from "mathjs";
import { describe, expect, it } from "vitest";
import { WORKSHEET_TOLERANCE } from "../calc-style";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem, type Value } from "@/lib/calcs/evaluate";
import { layout } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { CIP_DEFAULTS, designCipWall, type CipInputs } from "./cip";
import { designCipAsd } from "./cip-asd";
import { cipAsdCalcLines } from "./cip-asd-calc";

// The ASD calc package, worked out by Calcs, agrees with the ASD engine, and shows none of the
// AASHTO design.

function workOut(inputs: CipInputs) {
  const lines = cipAsdCalcLines(inputs, "Test wall");
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

const stairwell: CipInputs = {
  ...CIP_DEFAULTS,
  gammaS: 0.125, phi: 25, kpOverride: null, phiSub: 25, He: 6.5, Df: 1, D: 12, B: 48, A: 34, Tt: 10,
  shearKey: false, coverToe: 3, asd: true, asdSurcharge: 0.1, strut: true,
};

describe("CIP wall ASD calc package", () => {
  for (const [name, inputs] of [
    ["the stairwell wall with a surcharge and the slab strut", stairwell],
    ["the same wall, soil only, without the slab", { ...stairwell, asdSurcharge: 0, strut: false }],
    ["a taller wall with batters, backslope, toe fill, a shear key, a set μ and a resultant past B/6", { ...CIP_DEFAULTS, He: 9, Df: 3, B: 84, A: 24, D: 18, Tt: 12, frontBatter: 0.25, backBatter: 0.5, backslope: 3, kpOverride: null, stemBars: { bar: 6, spacing: 8 }, asd: true, asdMu: 0.35, asdSurcharge: 0.25, asdEccLimit: 3 }],
    ["a wall with its resultant behind the middle", { ...CIP_DEFAULTS, He: 6, Df: 2, B: 72, A: 6, D: 12, Tt: 10, railWeight: 0.3, asd: true, asdSurcharge: 0.2, strut: true, strutOpposite: false }],
    ["a deep stairwell wall propped by the slab", { ...stairwell, Df: 3, B: 30, A: 9, railWeight: 0.0625, railCg: 5, strutProp: true }],
    ["the same, the slab cast after the backfill", { ...stairwell, Df: 3, B: 54, A: 18, strutProp: true, strutBeforeBackfill: false, strutOpposite: false }],
    ["a shallow stairwell wall propped below the stem", { ...stairwell, B: 36, A: 18, Tt: 8, strutProp: true }],
  ] as [string, CipInputs][]) {
    it(`works out ${name} with no errors, matching the engine`, () => {
      const r = designCipWall(inputs);
      const a = designCipAsd(inputs, r);
      const c = workOut(inputs);
      expect(c.errors).toEqual([]);
      for (const k of a.cases) {
        close(c.value(`V_{${k.id}}\\coloneq`, "kip/ft"), k.V);
        close(c.value(`M_{R${k.id}}\\coloneq`, "kip*ft/ft"), k.MR);
        close(c.value(`FS_{o${k.id}}\\coloneq`), a.checks.find((x) => x.id === `asd-ot-${k.id}`)!.capacity);
        close(c.value(`q_{max${k.id}}\\coloneq`, "ksf"), a.checks.find((x) => x.id === `asd-brg-${k.id}`)!.demand);
      }
      for (const p of a.prop?.cases ?? []) {
        close(c.value(`P_{l${p.id}}\\coloneq`, "kip/ft"), p.bounds[0].F);
        close(c.value(`P_{h${p.id}}\\coloneq`, "kip/ft"), p.bounds[1].F);
      }
      close(c.value("M_{ust}\\coloneq", "kip*ft/ft"), a.stem.Mu);
      close(c.value("M_{rst}\\coloneq", "kip*ft/ft"), a.stem.flex.phiMn);
      close(c.value("V_{rst}\\coloneq", "kip/ft"), a.stem.shear.phiVc);
      close(c.value("M_{uto}\\coloneq", "kip*ft/ft"), a.toe.gov.toe.M);
      close(c.value("V_{uto}\\coloneq", "kip/ft"), a.toe.gov.toe.F);
      close(c.value("M_{rto}\\coloneq", "kip*ft/ft"), a.toe.flex.phiMn);
      close(c.value("M_{uhe}\\coloneq", "kip*ft/ft"), a.heel.Mu);
      if (a.strut) {
        close(c.value("P_c\\coloneq", "kip/ft"), a.strut.capacity);
        close(c.value("\\Delta_s\\coloneq", "in"), a.strut.shortening);
      }
      // The worksheet's OK/NG lines agree with the engine's checks.
      expect(c.checks.filter((x) => x.includes("NG")).length).toBe(a.checks.filter((x) => !x.ok).length);
      expect(c.checks.length).toBe(a.checks.length);
      // None of the AASHTO LRFD design.
      expect(JSON.stringify(c.lines)).not.toMatch(/AASHTO|Strength I|LRFD/);
    });
  }
});
