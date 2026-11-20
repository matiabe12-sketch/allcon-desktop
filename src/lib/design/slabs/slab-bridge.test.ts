import type { Unit } from "mathjs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem, type Value } from "@/lib/calcs/evaluate";
import { layout } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { WORKSHEET_TOLERANCE } from "../calc-style";
import { designSlabBridge, SLAB_BRIDGE_DEFAULTS, type SlabBridgeInputs } from "./slab-bridge";
import { slabBridgeCalcLines } from "./slab-bridge-calc";

const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

describe("slab bridge: hand checks", () => {
  const simple: SlabBridgeInputs = { ...SLAB_BRIDGE_DEFAULTS, spans: [20], continuous: false, t: 14, skew: 0, wearing: 0 };
  const r = designSlabBridge(simple);

  it("the strips (4.6.2.3, 4.6.2.1.4b)", () => {
    const s = r.strips[0];
    close(s.E1, 10 + 5 * Math.sqrt(20 * 30));
    close(s.Em, Math.min(84 + 1.44 * Math.sqrt(20 * 44), (12 * 44) / 3));
    expect(r.NL).toBe(3);
    close(s.E, Math.min(s.E1, s.Em));
    close(s.Eedge, Math.min(1.5 * 12 + 12 + s.E / 4, s.E / 2, 72));
  });

  it("a 20 ft simple span: the tandem governs, 50 (L − 2)²/(4L)·... with IM, and the lane's wL²/8, over the strip", () => {
    // Two 25 kip axles 4 ft apart: the most moment 2P (L/2 − a/4)² / L under the inner axle.
    const tandem = (50 * (20 / 2 - 4 / 4) ** 2) / 20;
    const lane = (0.64 * 20 ** 2) / 8;
    const mid = r.sections.find((q) => q.where === "interior" && !q.negative && Math.abs(q.x - 10) < 1e-9)!;
    // At midspan the tandem straddles it: 2P(L/2 − a/2)/2 ... the envelope's value at x = L/2 is the tandem with an axle on it.
    const tandemMid = 25 * 10 / 2 + 25 * (10 - 4) / 2; // axle at midspan and one 4 ft away
    expect(tandem).toBeGreaterThan(0);
    close(mid.MLL, ((tandemMid * 1.33 + lane) / (r.strips[0].E / 12)) * 1, 1e-3);
    close(mid.MDC, ((simple.gammaC * simple.t) / 12 + (2 * simple.barrierWeight) / simple.W) * 20 ** 2 / 8, 1e-6);
  });

  it("a simple span has no negative-moment checks; a continuous one does", () => {
    expect(r.checks.some((c) => c.id.includes("-neg-"))).toBe(false);
    const c = designSlabBridge(SLAB_BRIDGE_DEFAULTS);
    expect(c.checks.some((x) => x.id === "interior-neg-flexure")).toBe(true);
  });

  it("the least depth (Table 2.5.2.6.3-1) and the distribution bars (9.7.3.2)", () => {
    close(r.depth.hmin, (1.2 * (20 + 10)) / 30);
    close(r.dist.pct, Math.min(100 / Math.sqrt(20), 50) / 100);
    const c = designSlabBridge(SLAB_BRIDGE_DEFAULTS);
    close(c.depth.hmin, Math.max(0.54, (38 + 10) / 30));
  });

  it("the reactions per foot add up to the dead load on the bridge", () => {
    const c = designSlabBridge(SLAB_BRIDGE_DEFAULTS);
    const total = SLAB_BRIDGE_DEFAULTS.spans.reduce((t, L) => t + L, 0);
    close(c.reactions.reduce((t, x) => t + x.DC, 0), c.loads.wDCint * total, 1e-6);
  });
});

function workOut(inputs: SlabBridgeInputs) {
  const regions = readingOrder(layout(slabBridgeCalcLines(inputs, "Test slab bridge"), { x: 0, y: 0 }));
  const items = regions.flatMap((r): SheetItem[] => (r.kind === "text" || r.kind === "image" ? [] : [r as SheetItem]));
  const values = new Map<string, Value>();
  const results = evaluateSheet(items, DEFAULT_SETTINGS, values);
  const errors = regions.flatMap((r) => (results.get(r.id)?.kind === "error" ? [`${r.kind === "math" ? r.latex : r.kind}: ${(results.get(r.id) as { message: string }).message}`] : []));
  const checks = regions.filter((r) => r.kind === "math" && r.latex.startsWith("\\operatorname{if}")).map((r) => (results.get(r.id) as { result?: string }).result ?? "");
  const value = (start: string, unit?: string) => {
    const r = regions.find((x) => x.kind === "math" && x.latex.startsWith(start));
    if (!r) throw new Error(`No region ${start}`);
    const v = values.get(r.id);
    return unit ? (v as Unit).toNumber(unit) : (v as number);
  };
  return { errors, checks, value };
}

describe("slab bridge calc package", () => {
  for (const [name, inputs] of [
    ["the default (three continuous spans)", SLAB_BRIDGE_DEFAULTS],
    ["a skewed simple span", { ...SLAB_BRIDGE_DEFAULTS, spans: [28], continuous: false, skew: 30, t: 18 }],
  ] as [string, SlabBridgeInputs][])
    it(`works out ${name} with no errors, its checks as the engine's`, () => {
      const c = workOut(inputs);
      expect(c.errors).toEqual([]);
      const r = designSlabBridge(inputs);
      const fails = r.checks.filter((x) => !x.ok && !x.advisory).length;
      expect(c.checks.some((x) => x.includes("NG"))).toBe(fails > 0);
      const q = r.sections.filter((x) => x.where === "interior" && !x.negative).reduce((a, b) => (b.Mu / b.f.MR > a.Mu / a.f.MR ? b : a));
      expect(Math.abs(c.value("M_{rip}", "kip*ft/ft") - q.f.MR) / q.f.MR).toBeLessThan(WORKSHEET_TOLERANCE);
    });
});

describe("slab bridge take-off", () => {
  it("its concrete, the bars by run (the top bars over each pier), the overlay", async () => {
    const { takeoffFor } = await import("../takeoff");
    const t = takeoffFor("slab-bridge", SLAB_BRIDGE_DEFAULTS)!;
    const total = SLAB_BRIDGE_DEFAULTS.spans.reduce((s, L) => s + L, 0);
    close(t.schedule.concreteTotal, (total * SLAB_BRIDGE_DEFAULTS.W * (SLAB_BRIDGE_DEFAULTS.t / 12)) / 27, 1e-6);
    expect(t.schedule.groups.some((g) => g.use === "Main bars, top over pier 1")).toBe(true);
    expect(t.schedule.groups.some((g) => g.use === "Main bars, top over pier 2")).toBe(true);
    expect(t.schedule.groups.some((g) => g.use === "Edge beams, bottom")).toBe(true);
    expect(t.quantities.asphalt!.value).toBeGreaterThan(0);
    const simple = takeoffFor("slab-bridge", { ...SLAB_BRIDGE_DEFAULTS, spans: [30], continuous: false })!;
    expect(simple.schedule.groups.some((g) => g.use.startsWith("Main bars, top"))).toBe(false);
  });
});
