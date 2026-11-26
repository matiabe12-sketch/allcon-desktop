import { describe, expect, it } from "vitest";
import { compareBrrDf } from "./brr";
import { DT_DEFAULTS, rateDoubleTee, type DtInputs } from "./double-tee";

// AUR07's layout: 5 ft exterior and 8 ft interior units, a composite deck, mountable 5 ft sidewalks.
const units = { ...DT_DEFAULTS.units, count: 7, spacing: 96, flangeWidth: 96, depth: 24, flangeThk: 2, stemSpacing: 48, stemTop: 8, stemBot: 5.75, layout: [60, 96, 96, 96, 96, 96, 60].map((w) => ({ flangeWidth: w, stemSpacing: w === 60 ? 36 : 48 })) };
const base: DtInputs = {
  ...DT_DEFAULTS,
  span: 32.75,
  structureLength: 33.25,
  units,
  deck: { present: true, thk: 4.5, fc: 3, pcf: 150 },
  roadway: { railToRail: 50, railFaceOffset: 4, curbToCurb: 40, curbFaceOffset: 60 },
  loads: { ...DT_DEFAULTS.loads, sidewalks: [{ width: 5, thk: 10 }, { width: 5, thk: 10 }], sidewalkMountable: true },
};

describe("BrR's distribution factors against ALLCON's", () => {
  const r = rateDoubleTee(base);
  it("compare the interior with the governing interior girder (G3, S = 8 ft)", () => {
    const d = compareBrrDf({ ...base, brrDf: { intSingle: 1.143, intMulti: 1.455, extSingle: null, extMulti: null } }, r);
    expect(d.map((x) => x.ok)).toEqual([true, true]);
    expect(d[0].label).toContain("G3");
  });
  it("compare the exterior with the case BrR's value stands for: curb to curb, or trucks on the sidewalk", () => {
    const curb = compareBrrDf({ ...base, brrDf: { intSingle: null, intMulti: null, extSingle: 0.308, extMulti: 0.308 } }, r);
    expect(curb.every((x) => x.ok && !x.label.includes("sidewalk"))).toBe(true);
    const sw = compareBrrDf({ ...base, brrDf: { intSingle: null, intMulti: null, extSingle: 1.128, extMulti: 1.128 } }, r);
    expect(sw.every((x) => x.ok && x.label.includes("trucks on the sidewalk"))).toBe(true);
  });
});
