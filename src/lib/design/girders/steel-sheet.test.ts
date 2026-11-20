import { describe, expect, it } from "vitest";
import { steelGirderFigures } from "../figures";
import { designSteelGirder, STEEL_DEFAULTS, type SteelGirderInputs } from "./steel";
import { steelCalcLines } from "./steel-calc";
import { camberRows, connectionPlates, deadLoadContraflexure, fieldSections, fracIn, ftIn, studZones, transverseStiffeners } from "./steel-sheet";

// The girder elevation and camber sheets from Example 2A.

describe("steel girder plan sheets", { timeout: 60000 }, () => {
  const r = designSteelGirder(STEEL_DEFAULTS);

  it("writes plate sizes and lengths as plans do", () => {
    expect(fracIn(0.4375)).toBe("7/16");
    expect(fracIn(1.125)).toBe("1 1/8");
    expect(fracIn(0.75)).toBe("3/4");
    expect(fracIn(42)).toBe("42");
    expect(ftIn(67.25)).toBe(`67'-3"`);
    expect(ftIn(89.999)).toBe(`90'-0"`);
  });

  it("lists Example 2A's three field sections with their plates and weights", () => {
    const s = fieldSections(STEEL_DEFAULTS, r);
    expect(s.map((x) => [x.letter, x.from, x.to])).toEqual([["A", 0, 63], ["B", 63, 117], ["C", 117, 180]]);
    // A: (14 × 0.75 + 42 × 0.4375 + 16 × 1.25) in² × 490 pcf × 63 ft
    expect(s[0].weight).toBeCloseTo(((48.875 / 144) * 490 * 63) / 1000, 6);
    expect(s[1].top.t).toBe(1.125);
  });

  it("places the connection plates, stud zones and dead load contraflexure", () => {
    expect(connectionPlates(r)).toEqual([20, 40, 60, 80, 100, 120, 140, 160]);
    expect(studZones(STEEL_DEFAULTS, r)).toEqual([{ from: 0, to: 180, pitch: 10 }]);
    const cf = deadLoadContraflexure(r);
    expect(cf.length).toBe(2);
    // Between the prismatic 0.75L (67.5 ft) and the pier: the stiffer pier plates draw moment to it.
    expect(cf[0]).toBeGreaterThan(66);
    expect(cf[0]).toBeLessThan(67.5);
    expect(cf[1]).toBeCloseTo(180 - cf[0], 1);
  });

  it("zones the studs and the stiffeners where given", () => {
    const i: SteelGirderInputs = { ...STEEL_DEFAULTS, studs: { ...STEEL_DEFAULTS.studs, zones: [{ from: 70, to: 110, pitch: 8 }] }, stiffeners: [{ from: 70, to: 110, spacing: 84 }] };
    expect(studZones(i, designSteelGirder(i))).toEqual([{ from: 0, to: 70, pitch: 10 }, { from: 70, to: 110, pitch: 8 }, { from: 110, to: 180, pitch: 10 }]);
    expect(transverseStiffeners(i)).toEqual([70, 77, 84, 91, 98, 105]);
  });

  it("tabulates the camber at every tenth point, zero at the bearings, without DW", () => {
    const rows = camberRows(r);
    expect(rows.length).toBe(22);
    expect(rows[0].camber).toBe(0);
    expect(rows[10].camber).toBe(0);
    const at4 = rows.find((c) => c.span === 0 && Math.abs(c.at - 0.4) < 1e-9)!;
    expect(at4.camber).toBeCloseTo(at4.steel + at4.deck + at4.dc2, 9);
    expect(at4.camber).toBeCloseTo(1.75, 2);
  });

  it("draws both figures into the calc package", () => {
    const f = steelGirderFigures(STEEL_DEFAULTS);
    expect(f.elevation.svg).toContain("FS");
    expect(f.camber.svg).toContain("1.750");
    const lines = steelCalcLines(STEEL_DEFAULTS, "Test girder", undefined, f);
    expect(lines.filter((l) => "region" in l && (l.region === f.elevation || l.region === f.camber)).length).toBe(2);
  });
});
