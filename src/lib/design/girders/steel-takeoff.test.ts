import { describe, expect, it } from "vitest";
import { takeoffFor, takeoffPayLines } from "../takeoff";
import { designSteelGirder, STEEL_DEFAULTS } from "./steel";
import { fieldSections } from "./steel-sheet";
import { BOLT_LB_PER_100, steelQuantities, STEEL_LB_FT3 } from "./steel-takeoff";

// The steel girders' quantity: CDOT 509 Structural Steel by the computed weight of 509.32(a).

describe("steel girder take-off (CDOT 509)", () => {
  const r = designSteelGirder(STEEL_DEFAULTS);
  const { rows } = steelQuantities(STEEL_DEFAULTS, r);
  it("the girders' plates at 490.5 lb/ft³ agree with the plan sheet's section weights (490 lb/ft³)", () => {
    const plates = rows.filter((x) => x.part.startsWith("Section")).reduce((s, x) => s + x.lb, 0);
    const sheet = fieldSections(STEEL_DEFAULTS, r).reduce((s, f) => s + f.weight * 1000, 0) * STEEL_DEFAULTS.nGirders;
    expect(plates / sheet).toBeCloseTo(STEEL_LB_FT3 / 490, 6);
  });
  it("Example 2A: a 14 × 5/8 in top flange of section A, by hand", () => {
    const f = fieldSections(STEEL_DEFAULTS, r)[0];
    const top = rows.find((x) => x.part === "Section A, top flange")!;
    expect(top.lb).toBeCloseTo(((STEEL_DEFAULTS.nGirders * f.top.b * f.top.t * (f.to - f.from) * 12) / 1728) * 490.5, 6);
  });
  it("bolts by Table 509-4; studs, stiffeners, connection plates and cross-frames all counted", () => {
    expect(BOLT_LB_PER_100["0.875"]).toBe(81);
    for (const p of ["Bearing stiffeners, abutments", "Bearing stiffeners, piers", "Cross-frame struts (top and bottom)", "Stud shear connectors"]) expect(rows.some((x) => x.part === p)).toBe(true);
    expect(rows.some((x) => x.part.startsWith("Connection plates"))).toBe(true);
  });
  it("one pay line, 509-00000 Structural Steel (LB), to the nearest 10 lb; galvanized by choice", () => {
    const t = takeoffFor("steel-girder-check", STEEL_DEFAULTS)!;
    const lines = takeoffPayLines("steel-girder-check", t, {}, STEEL_DEFAULTS);
    expect(lines.map((l) => l.code)).toEqual(["509-00000"]);
    expect(lines[0].quantity % 10).toBe(0);
    expect(Math.abs(lines[0].quantity - rows.reduce((s, x) => s + x.lb, 0))).toBeLessThanOrEqual(5);
    expect(takeoffPayLines("steel-girder-check", t, { girder: "509-00001" }, STEEL_DEFAULTS)[0].code).toBe("509-00001");
  });
});
