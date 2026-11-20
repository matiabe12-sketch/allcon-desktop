import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem } from "@/lib/calcs/evaluate";
import { layout, type Line } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { CBC_DEFAULTS, designCbc } from "../culverts/cbc";
import { cbcCalcLines } from "../culverts/cbc-calc";
import { CULVERT_GAMMA, rateCulvert } from "../culverts/lrfr-culvert";
import { rateSlabBridge } from "../slabs/lrfr-slab";
import { designSlabBridge, SLAB_BRIDGE_DEFAULTS } from "../slabs/slab-bridge";
import { slabBridgeCalcLines } from "../slabs/slab-bridge-calc";
import { continuousBeam } from "./continuous";
import { laneEffect, LRFR_DEFAULTS } from "./lrfr";
import { rateSteelGirder } from "./lrfr-steel";
import { designSteelGirder, STEEL_DEFAULTS } from "./steel";
import { steelCalcLines } from "./steel-calc";

const ON = { ...LRFR_DEFAULTS, on: true };

function errorsIn(lines: Line[]) {
  const regions = readingOrder(layout(lines, { x: 0, y: 0 }));
  const items = regions.flatMap((r): SheetItem[] => (r.kind === "text" || r.kind === "image" ? [] : [r as SheetItem]));
  const results = evaluateSheet(items, DEFAULT_SETTINGS, new Map());
  return regions.flatMap((r) => (results.get(r.id)?.kind === "error" ? [`${r.kind === "math" ? r.latex : r.kind}: ${(results.get(r.id) as { message: string }).message}`] : []));
}

describe("the permit's lane load (MBE 6A.4.5.4.1, BRM 15-8)", () => {
  it("is 0.2 klf over the influence line's adverse area: −wL²/8 over the pier of two equal spans", () => {
    const L = 100;
    const lane = laneEffect(continuousBeam([L, L]), 0, L);
    expect(lane.Mneg).toBeCloseTo((-0.2 * L * L) / 8, 0);
    // Midspan of a simple span: wL²/8 on the positive area.
    expect(laneEffect(continuousBeam([L]), 0, L / 2).Mpos).toBeCloseTo((0.2 * L * L) / 8, 0);
  });
});

describe("steel girder rating (MBE 6A.6)", () => {
  const q = rateSteelGirder(STEEL_DEFAULTS, ON);

  it("splits each check into dead and live parts: HL-93 inventory by hand where it controls", () => {
    const a = q.hl93.inventoryStrength;
    const d = designSteelGirder({ ...STEEL_DEFAULTS, eta: 1 });
    const st = d.stations.find((s) => s.span === a.span && Math.abs(s.x - a.x) < 1e-6 && s.shear)!;
    if (a.limit === "Strength, shear") {
      // The design's Vu (1.25 DC + 1.5 DW + 1.75 LL, the larger of each sign) against φVn: the same RF by hand.
      const dead = Math.abs(1.25 * (st.V.dc1 + st.V.dc2) + 1.5 * st.V.dw);
      const rf = (st.shear!.Vn - dead) / (1.75 * st.V.ll);
      expect(a.rf).toBeCloseTo(rf, 2);
    }
    expect(a.rf).toBeGreaterThan(0.5);
    expect(q.hl93.operating.rf).toBeGreaterThan(q.hl93.inventory.rf);
  });

  it("rates every vehicle and its Service II", () => {
    expect(q.ratings).toHaveLength(12);
    expect(q.hl93.inventoryService.limit).toMatch(/Service II/);
    expect(q.hl93.inventoryService.rf).toBeGreaterThan(q.hl93.inventoryStrength.rf * 0.5);
  });

  it("adds a chapter to the steel calc package that works out", () => {
    const d = designSteelGirder(STEEL_DEFAULTS);
    const lines = steelCalcLines({ ...STEEL_DEFAULTS, rating: ON }, "Test", d);
    expect(lines.some((l) => "text" in l && l.text === "LOAD RATING (LRFR)")).toBe(true);
    expect(errorsIn(lines)).toEqual([]);
  }, 60000);
});

describe("slab bridge rating (MBE 6A.5)", () => {
  const q = rateSlabBridge(SLAB_BRIDGE_DEFAULTS, ON);

  it("rates the strips' flexure: HL-93 inventory by hand", () => {
    const a = q.hl93.inventory;
    const d = designSlabBridge(SLAB_BRIDGE_DEFAULTS);
    const strip = a.girder === "interior" ? "interior" : "edge";
    const sec = d.sections.find((s) => s.span === a.span && Math.abs(s.x - a.x) < 1e-6 && s.where === strip && s.negative === /negative/.test(a.limit))!;
    expect(q.hl93.inventoryStrength.rf).toBeCloseTo((sec.f.MR - 1.25 * sec.MDC - 1.5 * sec.MDW) / (1.75 * sec.MLL), 9);
    expect(q.ratings.every((v) => v.rf.rf > 0)).toBe(true);
  });

  it("adds a chapter to the slab calc package that works out", () => {
    const lines = slabBridgeCalcLines({ ...SLAB_BRIDGE_DEFAULTS, rating: ON }, "Test");
    expect(lines.some((l) => "text" in l && l.text === "LOAD RATING (LRFR)")).toBe(true);
    expect(errorsIn(lines)).toEqual([]);
  });
});

describe("box culvert rating (MBE 6A.5.12, BRM 1.3 M)", () => {
  const q = rateCulvert(CBC_DEFAULTS, ON);

  it("takes CDOT's culvert factors", () => {
    expect(q.ratings.find((v) => v.level === "legal")!.gammaL).toBe(CULVERT_GAMMA.legal);
    expect(q.ratings.find((v) => v.level === "permit")!.gammaL).toBe(CULVERT_GAMMA.permit);
    expect(rateCulvert(CBC_DEFAULTS, { ...ON, evAt130: true }).ratings.find((v) => v.name === "EV3")!.gammaL).toBe(1.3);
  });

  it("names the station that controls, and operating is inventory × 1.75 / 1.35", () => {
    expect(q.hl93.inventory.at).toBeTruthy();
    expect(q.hl93.operating.rf).toBeCloseTo(Math.floor(((q.hl93.inventoryStrength.rf * 1.75) / 1.35) * 100 + 1e-9) / 100, 9);
  });

  it("moves a vehicle across the box as the design does: the HL-93 tandem's envelope matches the design's where the tandem governs", () => {
    const d = designCbc(CBC_DEFAULTS);
    const tandem = d.vehicleEnv([25, 25], [4]);
    const truck = d.vehicleEnv([8, 32, 32], [14, 14]);
    d.env.forEach((e, m) => expect(e.pos.M + 1e-9).toBeGreaterThanOrEqual(Math.max(tandem[m].pos.M, truck[m].pos.M) - 1e-6));
  });

  it("adds a chapter to the culvert calc package that works out", () => {
    const lines = cbcCalcLines({ ...CBC_DEFAULTS, rating: ON }, "Test");
    expect(lines.some((l) => "text" in l && l.text === "LOAD RATING (LRFR)")).toBe(true);
    expect(errorsIn(lines)).toEqual([]);
  });
});
