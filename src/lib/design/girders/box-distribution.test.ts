import { describe, expect, it } from "vitest";
import { designGirder } from "./prestressed";
import { E16FZA_GIRDER } from "../bridge/e16fza.fixture";

// AASHTO type (f) live load distribution for side-by-side boxes on a cast-in-place deck, against the factors
// in CDOT 24057 E-16-FZA's IDC (28 x 50 in boxes, 18 of them, 65 ft, skew 4.12°).

describe("side-by-side boxes, AASHTO type (f)", () => {
  const g = designGirder({ ...E16FZA_GIRDER, L: 65, nGirders: 18, S: 4 + 2.5 / 12, overhang: 3.23, barrierWidth: 1.5, skew: 4.12, deckT: 5, haunch: 1.5, extraSpans: [] });
  it("gives the interior box the IDC's moment and shear factors", () => {
    const df = g.interior.df;
    expect(df.momentMulti).toBeCloseTo(0.282, 1); // IDC 0.282 (2+ lanes)
    expect(df.momentOne).toBeCloseTo(0.186, 2); // 0.186 (1 lane)
    expect(df.moment / 0.282).toBeGreaterThan(0.97);
    expect(df.moment / 0.282).toBeLessThan(1.03);
    expect(df.shearMulti * 1.083 / 0.529).toBeGreaterThan(0.97); // the IDC's include the skew factor
  });
  it("gives the exterior box e·g interior, as the IDC", () => {
    const df = g.exterior.df;
    expect(df.moment / 0.292).toBeGreaterThan(0.97); // IDC 0.292
    expect(df.moment / 0.292).toBeLessThan(1.03);
    expect(df.shear / 0.614).toBeGreaterThan(0.97); // IDC 0.614
    expect(df.shear / 0.614).toBeLessThan(1.03);
  });
});
