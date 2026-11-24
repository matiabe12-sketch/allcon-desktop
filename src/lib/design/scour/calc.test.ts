import type { Unit } from "mathjs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem, type Value } from "@/lib/calcs/evaluate";
import { layout } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { designScour, SCOUR_DEFAULTS, type ScourInputs } from "./scour";
import { scourCalcLines } from "./calc";

// The scour calc package, worked out by Calcs, agrees with the engine.

function workOut(inputs: ScourInputs) {
  const regions = readingOrder(layout(scourCalcLines(inputs, "Test scour"), { x: 0, y: 0 }));
  const items = regions.flatMap((r): SheetItem[] => (r.kind === "text" || r.kind === "image" ? [] : [r as SheetItem]));
  const values = new Map<string, Value>();
  const results = evaluateSheet(items, DEFAULT_SETTINGS, values);
  const errors = regions.flatMap((r) => (results.get(r.id)?.kind === "error" ? [`${r.kind === "math" ? r.latex : r.kind}: ${(results.get(r.id) as { message: string }).message}`] : []));
  const value = (start: string, unit?: string) => {
    const r = regions.find((x) => x.kind === "math" && x.latex.startsWith(start));
    if (!r) throw new Error(`No region ${start}`);
    const v = values.get(r.id);
    return unit ? (v as Unit).toNumber(unit) : (v as number);
  };
  return { errors, value };
}

describe("bridge scour calc package", () => {
  const cases: [string, ScourInputs][] = [
    ["the defaults (live-bed design flood, clear-water abutment)", SCOUR_DEFAULTS],
    ["clear-water contraction with pressure flow and a debris-loaded column bent", {
      ...SCOUR_DEFAULTS,
      D50: 15,
      floods: SCOUR_DEFAULTS.floods.map((f) => ({ ...f, contraction: { ...f.contraction, mode: "clear" as const }, pressure: { on: true, hu: 10, hb: 8, T: 3, Qb: f.contraction.Q2 } })),
      piers: [{ ...SCOUR_DEFAULTS.piers[0], shape: "columns" as const, debris: { on: true, shape: "triangular" as const, W: 20, H: 4 } }],
      abutments: [{ ...SCOUR_DEFAULTS.abutments[0], type: "wingwall" as const, LBf: 0.85 }],
    }],
  ];
  for (const [name, inputs] of cases)
    it(`works out ${name} with no errors, matching the engine`, () => {
      const r = designScour(inputs);
      const w = workOut(inputs);
      expect(w.errors).toEqual([]);
      r.contraction.forEach((c, k) => {
        expect(w.value(`y_{s.${k + 1}}`, "ft")).toBeCloseTo(c.ys, 3);
        if (c.pressure) expect(w.value(`y_{sp.${k + 1}}`, "ft")).toBeCloseTo(c.pressure.ys, 2);
      });
      r.piers[0].local.forEach((l, k) => expect(w.value(`y_{sp${k + 1}}`, "ft")).toBeCloseTo(l.ys, 2));
      r.abutments[0].local.forEach((l, k) => expect(w.value(`y_{sa.${k + 1}}`, "ft")).toBeCloseTo(l.ymax - (inputs.abutments[0].flow[k] ?? inputs.abutments[0].flow[0]).y0, 2));
    });
});
