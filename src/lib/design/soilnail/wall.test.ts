import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem } from "@/lib/calcs/evaluate";
import { layout } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { DetailSketch } from "@/components/design/detail-sketch";
import { schedule } from "../rebar/schedule";
import { soilNailInputs } from "../kinds";
import { soilNailCalcLines, soilNailTakeoff, soilNailViews } from "./detail";
import { designSoilNail, facingOf, SOIL_NAIL_DEFAULTS, type SoilNailInputs } from "./wall";

// FHWA GEC 7 Appendix C: a 25 ft permanent, critical wall in medium dense silty sand (125 pcf, 32°, 100 psf, qu 14.5 psi),
// five rows of #7 Grade 75 nails 18 ft long at 5 ft × 5 ft, 15° down in 6 in holes; 4 in shotcrete with 6×6–W2.9 mesh and
// 2 #5 waler bars, a 9 × 1 in plate; an 8 in CIP final facing with #4 @ 12 in and four ½ × 4⅛ in A307 studs at 6 in.
const GEC7: SoilNailInputs = { ...SOIL_NAIL_DEFAULTS, lengths: [18], critical: true };

describe("soil nail walls (FHWA GEC 7)", () => {
  it("passes its checks with the defaults", () => {
    expect(designSoilNail(SOIL_NAIL_DEFAULTS).checks.filter((c) => !c.ok && !c.advisory).map((c) => c.id)).toEqual([]);
  });

  it("matches GEC 7 Appendix C's facing resistances", () => {
    const f = facingOf(GEC7);
    expect(f.initial.RFF).toBeCloseTo(36, 0); // Eq. 6.15: 36 kip
    expect(f.initial.RFP).toBeCloseTo(41.6, 1); // 41.6 kip
    expect(f.initial.rho).toBeCloseTo(0.99, 1);
    expect(Math.abs(f.final!.RFF / 60.8 - 1)).toBeLessThan(0.02); // 60.8 kip by the simplified Eq. 6.15
    expect(f.final!.RFP).toBeCloseTo(36.9, 0); // 36.9 kip
    expect(f.final!.RFH).toBeCloseTo(47.1, 1); // 47.1 kip
    expect(f.final!.rho).toBeCloseTo(0.83, 2);
    expect(f.toFactor).toBeCloseTo(0.6 + 0.2 * (5 / 3.281 - 1), 9); // ~0.7 at 5 ft
  });

  it("comes close to GEC 7 Appendix C's stability analysis: FS 1.51, Tmax 24.7 kip at the lowest row", () => {
    const r = designSoilNail(GEC7);
    expect(r.internal.FS).toBeGreaterThan(1.4);
    expect(r.internal.FS).toBeLessThan(1.55); // within ~5%, on the conservative side
    expect(r.top.row).toBe(5);
    expect(Math.abs(r.Tmax / 24.7 - 1)).toBeLessThan(0.05);
    expect(r.deflection.dh).toBeCloseTo((25 * 12) / 500, 9); // 0.6 in
    expect(r.deflection.DDEF).toBeCloseTo(1.25 * 25, 9); // Table 5.12, sandy soil
  });

  it("checks each construction stage, and global stability behind the nails", () => {
    const r = designSoilNail(GEC7);
    expect(r.stages.length).toBe(5);
    expect(r.global.FS).toBeGreaterThan(r.internal.FS);
  });

  it("takes off the nails, the face and the shotcrete", () => {
    const t = soilNailTakeoff(SOIL_NAIL_DEFAULTS, 100);
    expect(t.quantities.pile!.value).toBe((100 / 5 + 1) * 5 * 22);
    expect(t.quantities.wall!.value).toBe(25 * 100);
    expect(soilNailInputs({ lengths: [25, 21, 19] }).lengths).toEqual([25, 21, 19]);
  });

  it("draws the section, face elevation, nail head and nail section", () => {
    for (const i of [SOIL_NAIL_DEFAULTS, { ...SOIL_NAIL_DEFAULTS, batter: 10, backslope: 15, water: 20, permanent: false }]) {
      const views = soilNailViews(i);
      expect(views.length).toBe(4);
      for (const v of views) expect(renderToStaticMarkup(createElement(DetailSketch, { view: v, schedule: schedule([], []) }))).not.toContain("NaN");
    }
  });

  const cases: [string, SoilNailInputs][] = [
    ["defaults", SOIL_NAIL_DEFAULTS],
    ["temporary, batter, backslope, seismic", { ...SOIL_NAIL_DEFAULTS, permanent: false, batter: 10, backslope: 15, seismic: true, As: 0.15 }],
    ["clay below (heave)", { ...SOIL_NAIL_DEFAULTS, layers: [{ name: "sand", thickness: 25, gamma: 125, phi: 32, c: 100, bond: 14.5 }, { name: "clay", thickness: 50, gamma: 120, phi: 0, c: 1500, bond: 8 }] }],
  ];
  for (const [what, i] of cases)
    it(`works out its calc package with no errors (${what})`, () => {
      const regions = readingOrder(layout(soilNailCalcLines(i, "Test wall"), { x: 0, y: 0 }));
      const items = regions.flatMap((x): SheetItem[] => (x.kind === "text" || x.kind === "image" ? [] : [x as SheetItem]));
      const results = evaluateSheet(items, DEFAULT_SETTINGS, new Map());
      const errors = regions.flatMap((x) => (results.get(x.id)?.kind === "error" ? [`${x.kind === "math" ? x.latex : x.kind}: ${(results.get(x.id) as { message: string }).message}`] : []));
      expect(errors).toEqual([]);
    });
});
