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
    ["the FDOT method at an angle, and a cohesive bed's contraction over a flood's duration", {
      ...SCOUR_DEFAULTS,
      floods: SCOUR_DEFAULTS.floods.map((f, k) => ({ ...f, contraction: { ...f.contraction, cohesive: { on: true, tauc: 0.05, n: 0.025, zdot: k ? 0 : 0.1, hours: 48 } } })),
      piers: [{ ...SCOUR_DEFAULTS.piers[0], method: "fdot" as const, shape: "square" as const, L: 20, flow: SCOUR_DEFAULTS.piers[0].flow.map((f) => ({ ...f, angle: 15 })) }],
    }],
    ["a pile cap in the flow on exposed piles (Case 1)", {
      ...SCOUR_DEFAULTS,
      piers: [{ ...SCOUR_DEFAULTS.piers[0], shape: "square" as const, a: 4, L: 20, complex: { ...SCOUR_DEFAULTS.piers[0].complex!, on: true, capWidth: 12, capLength: 30, T: 4, capBottom: 96, piles: { on: true, across: 3, rows: 2, d: 1.5, S: 4.5, square: true } } }],
    }],
    ["an exposed footing (Case 2)", {
      ...SCOUR_DEFAULTS,
      piers: [{ ...SCOUR_DEFAULTS.piers[0], a: 4, L: 20, complex: { ...SCOUR_DEFAULTS.piers[0].complex!, on: true, capWidth: 10, capLength: 25, T: 4, capBottom: 92 } }],
    }],
    ["a cohesive bed at the pier", { ...SCOUR_DEFAULTS, piers: [{ ...SCOUR_DEFAULTS.piers[0], material: { kind: "cohesive" as const, Vc: 4, K: 0, S: 0, GSN: 0, omega: 0 } }] }],
    ["erodible rock at the pier, with abrasion", { ...SCOUR_DEFAULTS, piers: [{ ...SCOUR_DEFAULTS.piers[0], material: { kind: "rock" as const, Vc: 0, K: 0.5, S: 0.004, GSN: 0.02, omega: 30 } }] }],
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
