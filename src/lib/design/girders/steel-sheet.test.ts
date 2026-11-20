import { describe, expect, it } from "vitest";
import { steelGirderFigures } from "../figures";
import { designSteelGirder, STEEL_DEFAULTS, type SteelGirderInputs } from "./steel";
import { steelCalcLines } from "./steel-calc";
import { camberRows, connectionPlates, deadLoadContraflexure, fieldSections, flangeZones, fracIn, ftIn, studZones, transverseStiffeners } from "./steel-sheet";

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

  it("lists Example 2A's three field sections with their plates and weights, the end sections to the girder's ends 9 in past the bearings", () => {
    const s = fieldSections(STEEL_DEFAULTS, r);
    expect(s.map((x) => [x.letter, x.from, x.to])).toEqual([["A", -0.75, 63], ["B", 63, 117], ["C", 117, 180.75]]);
    // A: (14 × 0.75 + 42 × 0.4375 + 16 × 1.25) in² × 490 pcf × 63.75 ft
    expect(s[0].weight).toBeCloseTo(((48.875 / 144) * 490 * 63.75) / 1000, 6);
    expect(fieldSections({ ...STEEL_DEFAULTS, endDistance: 0 }, r)[0].from).toBe(0);
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

  it("each flange's tension and compression zones: the bottom flange in tension in the positive moment, the top over the pier", () => {
    const z = flangeZones(STEEL_DEFAULTS, r);
    // Bottom flange: tension from the end to near the pier, compression over it, tension again.
    expect(z.bottom.map((x) => x.tension)).toEqual([true, false, true]);
    expect(z.bottom[1].from).toBeGreaterThan(70);
    expect(z.bottom[1].to).toBeLessThan(110);
    // Top flange: the negative moment's envelope reaches well into the spans (live load in the other span).
    const pier = z.top.find((x) => x.from < 90 && x.to > 90)!;
    expect(pier.tension).toBe(true);
    expect(z.top[0].from).toBe(-0.75);
    expect(z.top[z.top.length - 1].to).toBe(180.75);
    expect(z.fractureCritical).toBe(false);
    expect(flangeZones({ ...STEEL_DEFAULTS, nGirders: 2 }, r).fractureCritical).toBe(true);
  });

  it("the screed camber: the deck's and DC2's deflection, the web camber less the steel's", () => {
    for (const c of camberRows(r)) expect(c.screed).toBeCloseTo(c.camber - c.steel, 9);
  });

  it("draws the elevation, both cambers and the cross-frame detail into the calc package", () => {
    const f = steelGirderFigures(STEEL_DEFAULTS);
    expect(f.elevation.svg).toContain("FS");
    expect(f.elevation.svg).toContain("TOP FLG");
    expect(f.elevation.svg).toContain("end to brg");
    expect(f.camber.svg).toContain("1.750");
    expect(f.screed.svg).toContain("Screed camber");
    // Two bolts at each end of four members: 16.
    expect((f.crossFrame!.svg.match(/<circle/g) ?? []).length).toBe(16);
    expect(f.crossFrame!.svg).toContain("no-load fit");
    const lines = steelCalcLines(STEEL_DEFAULTS, "Test girder", undefined, f);
    expect(lines.filter((l) => "region" in l && [f.elevation, f.camber, f.screed, f.crossFrame].includes(l.region as never)).length).toBe(4);
  });

  it("a K-frame welded: no bolts, its diagonals meeting the bottom strut", () => {
    const i: SteelGirderInputs = { ...STEEL_DEFAULTS, crossFrame: { ...STEEL_DEFAULTS.crossFrame, type: "K", connection: { ...STEEL_DEFAULTS.crossFrame.connection, kind: "welded" } } };
    const f = steelGirderFigures(i);
    expect((f.crossFrame!.svg.match(/<circle/g) ?? []).length).toBe(0);
    expect(f.crossFrame!.svg).toContain("fillets");
  });
});
