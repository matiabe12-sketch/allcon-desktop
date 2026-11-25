import { describe, expect, it } from "vitest";
import { doubleTeeJ, unitJ } from "./torsion";

// J of a double tee by finite elements. Checked against an independent finite-difference solve of
// the same section, which converges from above (6,318, 6,039, 5,921 in⁴ at 0.2, 0.1, 0.05 in) while
// the elements converge from below: the exact value lies between, about 5,800 in⁴.
describe("torsion constant of a double-tee unit", () => {
  const s = { bf: 62, depth: 17, flangeThk: 5, stemSpacing: 36, stemTop: 8, stemBot: 6 };

  it("converges from below as the mesh is refined", () => {
    const js = [5 / 3, 5 / 6, 5 / 12, 5 / 24].map((h) => doubleTeeJ(s, h));
    for (let k = 1; k < js.length; k++) expect(js[k]).toBeGreaterThan(js[k - 1]);
    expect(js[3]).toBeLessThan(5921);
  });

  it("extrapolates to the exact value within 0.5% (17 in deep, 62 in wide, 5 in flange, stems 8 to 6 in at 36 in)", () => {
    const J = unitJ(s);
    expect(J).toBeGreaterThan(5785); // the 5/24 in mesh, still below
    expect(J).toBeLessThan(5830);
  });

  it("is more than the sum of the parts' thin-rectangle values: the junctions stiffen it", () => {
    const rect = (b: number, t: number) => b * t ** 3 * (1 / 3 - 0.21 * (t / b) * (1 - t ** 4 / (12 * b ** 4)));
    expect(unitJ(s)).toBeGreaterThan(rect(62, 5) + 2 * rect(12, 7) + 1000);
    // A narrower flange (the exterior unit), less.
    expect(unitJ({ ...s, bf: 54 })).toBeLessThan(unitJ(s));
  });
});
