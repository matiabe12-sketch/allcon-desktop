import { describe, expect, it } from "vitest";
import { columnFootprint, hammerheadTip } from "../bridge/loadpath";
import { abutmentLiveLoad, designAbutment } from "./abutment";
import { abutmentInputs } from "./kinds";

// D-11-Z (CDOT 26956): 6 CBT-54 girders, a 40 ft roadway (3 design lanes); one lane's end reaction at the
// abutment 78.8 kip without IM. The abutment's live load is the lanes with their multiple presence factors
// (AASHTO 3.6.1.1.2), not every girder's distributed reaction added up.
describe("the abutment's live load", () => {
  it("3 lanes × 0.85 governs over 2 × 1.0 and 1 × 1.2", () => {
    expect(abutmentLiveLoad({ nGirders: 6, RLL: 62.1, RLane: 78.8, lanes: 3 })).toBeCloseTo(3 * 0.85 * 78.8, 6);
  });
  it("one lane on a narrow deck: 1.2 × the lane", () => {
    expect(abutmentLiveLoad({ nGirders: 3, RLL: 62.1, RLane: 78.8, lanes: 1 })).toBeCloseTo(1.2 * 78.8, 6);
  });
  it("without a lane reaction it stays the girders × the reaction per girder", () => {
    expect(abutmentLiveLoad({ nGirders: 6, RLL: 62.1, RLane: 0, lanes: 3 })).toBeCloseTo(6 * 62.1, 6);
    expect(abutmentLiveLoad({ nGirders: 6, RLL: 62.1 })).toBeCloseTo(6 * 62.1, 6);
  });
  it("the design reports and uses it", () => {
    const r = designAbutment(abutmentInputs({ nGirders: 6, RLL: 62.1, RLane: 78.8, lanes: 3 }));
    expect(r.totalGirderR.LL).toBeCloseTo(200.94, 2);
  });
});

// CDOT BDM 11.4: pier caps at least 3 ft deep, in 3 in increments. D-11-Z's 5 ft hammerhead scaled from the
// 7 ft / 4 ft default gave 2.857 ft at the tips.
describe("a hammerhead's tip depth", () => {
  it("the default's taper on a 5 ft cap: 3'-0\", not 2.857 ft", () => {
    expect(hammerheadTip({ depth: 7, tipDepth: 4 }, 5)).toBe(3);
  });
  it("an existing cap's tip kept while its depth is unchanged, snapped to 3 in", () => {
    expect(hammerheadTip({ depth: 5, tipDepth: 2.857142857 }, 5)).toBe(3);
    expect(hammerheadTip({ depth: 6, tipDepth: 3.5 }, 6)).toBe(3.5);
  });
  it("never deeper than the cap", () => {
    expect(hammerheadTip({ depth: 7, tipDepth: 4 }, 2.5)).toBe(2.5);
  });
});

describe("the column's footprint on its footing", () => {
  it("a rectangular column: B is its width across the bridge, L its thickness along it", () => {
    expect(columnFootprint({ shape: "rectangular", T: 96, W: 36 })).toEqual({ colShape: "rectangular", colB: 96, colL: 36 });
  });
  it("a round column: its diameter both ways", () => {
    expect(columnFootprint({ shape: "round", T: 48, W: 48 })).toEqual({ colShape: "round", colB: 48, colL: 48 });
  });
  it("no column: the footing keeps its own", () => {
    expect(columnFootprint(null)).toEqual({});
  });
});
