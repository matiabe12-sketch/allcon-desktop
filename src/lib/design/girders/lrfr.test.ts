import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem, type Value } from "@/lib/calcs/evaluate";
import { layout } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { colorCode, INTERSTATE_LEGAL, legalGamma, LRFR_DEFAULTS, permitGamma, rateGirder, ratingVehicles } from "./lrfr";
import { lrfrCalcLines } from "./lrfr-calc";
import { designGirder, GIRDER_DEFAULTS, type GirderInputs } from "./prestressed";

const ON = { ...LRFR_DEFAULTS, on: true };
const simple = designGirder(GIRDER_DEFAULTS);
const q = rateGirder(GIRDER_DEFAULTS, simple, ON);

describe("LRFR factors (MBE 6A, CDOT BRM)", () => {
  it("interpolates the legal load factor by ADTT, the table's largest when unknown", () => {
    expect(legalGamma(null, "3rd")).toBe(1.45);
    expect(legalGamma(5000, "3rd")).toBe(1.45);
    expect(legalGamma(500, "3rd")).toBe(1.3);
    expect(legalGamma(3000, "3rd")).toBeCloseTo(1.3 + (0.15 * 2000) / 4000, 9);
    expect(legalGamma(null, "2nd")).toBe(1.8);
    expect(legalGamma(550, "2nd")).toBeCloseTo(1.4 + (0.25 * 450) / 900, 9);
    expect(permitGamma(null)).toBe(1.8);
    expect(permitGamma(50)).toBe(1.4);
  });

  it("rates the Interstate trucks at their posted weights (BRM Figure 1-5)", () => {
    expect(INTERSTATE_LEGAL.map((v) => v.P.reduce((a, b) => a + b, 0))).toEqual([24, 38, 39]);
    const names = ratingVehicles({ route: "interstate" }).map((v) => v.name);
    expect(names).toContain("Interstate Type 3S2");
    expect(names).not.toContain("CO Type 3");
    expect(ratingVehicles({ route: "state" }).find((v) => v.name === "CO Permit")?.tons).toBe(96);
  });

  it("codes the overload colors by Table 1-7, the tandem allowed to ease it", () => {
    expect(colorCode(96, 50)).toBe("White");
    expect(colorCode(90, 40)).toBe("Yellow");
    expect(colorCode(85, 30)).toBe("Orange");
    expect(colorCode(70, 30)).toBe("Black");
    expect(colorCode(70, 50)).toBe("White");
  });
});

describe("LRFR of the default girder", () => {
  it("works out HL-93 inventory flexure by hand at its controlling point", () => {
    const a = q.hl93.inventoryStrength;
    const st = simple.spans[a.span][a.girder].stations.find((s) => Math.abs(s.x - a.x) < 1e-9)!;
    expect(a.limit).toMatch(/flexure/);
    const rf = (st.phiMn - 1.25 * (st.Mg + st.Mdeck + st.Mdc2) - 1.5 * st.Mdw) / (1.75 * st.Mll);
    expect(a.rf).toBeCloseTo(rf, 9);
    // Operating is inventory × 1.75 / 1.35 where the same point controls.
    expect(q.hl93.operating.rf).toBeCloseTo(Math.floor(((rf * 1.75) / 1.35) * 100 + 1e-9) / 100, 9);
  });

  it("rates every vehicle, and passes with this design", () => {
    expect(q.ratings).toHaveLength(12);
    for (const v of q.ratings) expect(v.rf.rf).toBeGreaterThan(1);
    expect(q.needsPosting).toBe(false);
    expect(q.color.code).toBe("White");
    // A rating in tons is the RF times the weight, truncated to tenths (BRM 1.14).
    const t3 = q.ratings.find((v) => v.name === "CO Type 3")!;
    expect(t3.ratingTons).toBeCloseTo(Math.floor(t3.rf.rf * 27 * 10 + 1e-9) / 10, 9);
  });

  it("takes the condition factor and its 0.85 floor (MBE 6A.4.2.1)", () => {
    const fair = rateGirder(GIRDER_DEFAULTS, simple, { ...ON, condition: "fair" });
    expect(fair.factors.phiCS).toBe(0.95);
    expect(fair.hl93.inventoryStrength.rf).toBeLessThan(q.hl93.inventoryStrength.rf);
    expect(rateGirder(GIRDER_DEFAULTS, simple, { ...ON, condition: "poor", system: 0.85 }).factors.phiCS).toBe(0.85);
  });

  it("posts a weak bridge and colors it", () => {
    const weak: GirderInputs = { ...GIRDER_DEFAULTS, L: 150 };
    const w = rateGirder(weak, designGirder(weak), ON);
    expect(w.hl93.operating.rf).toBeLessThan(q.hl93.operating.rf);
    for (const p of w.posting) if (p.limit !== null && p.rf < 0.95 && p.tons < p.limit && p.rf >= 0.3) expect(p.action).toMatch(/post at/);
  });

  it("rates a continuous girder over its pier", () => {
    const c: GirderInputs = { ...GIRDER_DEFAULTS, extraSpans: [{ L: GIRDER_DEFAULTS.L, strands: null, harped: null }] };
    const rc = rateGirder(c, designGirder(c), ON);
    expect(rc.hl93.inventory.rf).toBeGreaterThan(0);
    expect([rc.hl93.inventoryStrength.limit, ...rc.ratings.map((v) => v.rf.limit)].some((l) => /negative/.test(l))).toBe(true);
  });
});

describe("the LRFR calc chapter", () => {
  it("works out with no errors and agrees with the engine", () => {
    const i = { ...GIRDER_DEFAULTS, rating: ON };
    const regions = readingOrder(layout(lrfrCalcLines(i, simple), { x: 0, y: 0 }));
    const items = regions.flatMap((r): SheetItem[] => (r.kind === "text" || r.kind === "image" ? [] : [r as SheetItem]));
    const values = new Map<string, Value>();
    const results = evaluateSheet(items, DEFAULT_SETTINGS, values);
    const errors = regions.flatMap((r) => (results.get(r.id)?.kind === "error" ? [`${r.kind === "math" ? r.latex : r.kind}: ${(results.get(r.id) as { message: string }).message}`] : []));
    expect(errors).toEqual([]);
    const value = (start: string) => values.get(regions.find((x) => x.kind === "math" && x.latex.startsWith(start))!.id) as number;
    expect(value("RF_{inv}")).toBeCloseTo(q.hl93.inventoryStrength.rf, 3);
    expect(value("RF_{svc}")).toBeCloseTo(q.hl93.inventoryService.rf, 3);
    expect(value("RF_{op}")).toBeCloseTo(q.hl93.operating.rf, 1);
  });
});
