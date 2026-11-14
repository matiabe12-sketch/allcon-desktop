import { describe, expect, it } from "vitest";
import { gridPiles, groupForces, groupProps } from "./micropile-group";

// CDOT 26956 (D-11-Z) abutment micropile array (JDC, 5/29/26): 2 rows of 12 micropiles, 4 ft along the
// abutment, 5 ft across, the second row battered 6°; Strength I P = 1686 kip, M = 6125 kip·ft across the rows.
describe("a micropile group on a rigid cap", () => {
  const piles = gridPiles(12, 2, 4, 5, { batterByRow: [0, 6] });
  it("the calc's layout: 24 piles, Σx² = 4576 ft², Σy² = 150 ft²", () => {
    const g = groupProps(piles);
    expect(g.n).toBe(24);
    expect(g.Sx2).toBeCloseTo(4576, 6);
    expect(g.Sy2).toBeCloseTo(150, 6);
  });
  it("the moment across the rows over Σy² = 150 ft²: 173.3 kip in the battered row, 31.8 kip of tension in the other", () => {
    const f = groupForces(piles, 1686, 6125, 0);
    expect(Math.max(...f)).toBeCloseTo((1686 / 24 + (6125 * 2.5) / 150) / Math.cos((6 * Math.PI) / 180), 6);
    expect(Math.max(...f)).toBeCloseTo(173.3, 1);
    expect(Math.min(...f)).toBeCloseTo(-31.8, 1);
  });
  it("the calc's 74 kip comes from 4582.25 ft² (Σx² plus one pile's y²) in place of Σy²", () => {
    const P = 1686 / 24 + (6125 * 2.5) / 4582.25;
    expect(P / Math.cos((6 * Math.PI) / 180)).toBeCloseTo(74.0, 1);
  });
  it("a ring of 10 under a 9.5 × 7 ft footing (4 × 3 grid at 2.5 ft, the inner piles left out)", () => {
    const ring = gridPiles(4, 3, 2.5, 2.5, { perimeter: true });
    expect(ring).toHaveLength(10);
    expect(groupForces(ring, 1000, 0, 0).every((v) => Math.abs(v - 100) < 1e-9)).toBe(true);
  });
});
