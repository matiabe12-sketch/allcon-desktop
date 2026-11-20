import { describe, expect, it } from "vitest";
import { COLUMN_DEFAULTS, type ColumnInputs } from "../piers/column";
import type { IfcElement } from "./ifc";
import { columnBars } from "./rebar3d";

describe("a tied column's bars in 3D", () => {
  const i: ColumnInputs = { ...COLUMN_DEFAULTS, shape: "rectangular", T: 96, W: 36, barsT: 15, barsL: 5, transverse: "ties", tieBar: 5, tieSpacing: 12, legsT: 2, legsL: 5, height: 30, seismic: { hinge: true, spacing: 4, legsT: 4, legsL: 11 } };
  const e = { depth: 30, profile: { kind: "rect", x: 8, y: 3 } } as unknown as IfcElement;
  const bars = columnBars(0, e, i, 5);
  const levels = (label: string) => bars.filter((b) => b.label.includes(label)).flatMap((b) => b.at.map((p) => p[2]));

  it("puts the ties closer in the hinge regions (5.11.4.1.5) and farther between", () => {
    const zs = [...new Set(levels("ties"))].sort((a, b) => a - b);
    const gaps = zs.slice(1).map((z, k) => z - zs[k]);
    expect(Math.min(...gaps)).toBeCloseTo(4 / 12, 3);
    expect(Math.max(...gaps)).toBeCloseTo(1, 3);
    // 8 ft (the largest dimension) from the top at 4 in.
    expect(zs.filter((z) => z > 30 - 8).length).toBeGreaterThanOrEqual(23);
  });

  it("gives the hinge regions their own cross-ties, fewer between them", () => {
    const cross = bars.filter((b) => b.label.includes("cross-ties"));
    const at = (z: number) => cross.filter((b) => b.at.some((p) => Math.abs(p[2] - z) < 1e-9)).length;
    const zs = [...new Set(levels("ties"))].sort((a, b) => a - b);
    expect(at(zs[0])).toBe(2 + 9); // in the hinge region: 4 − 2 across, 11 − 2 along
    expect(at(zs.find((z) => z > 12 && z < 18)!)).toBe(0 + 3); // between: 2 − 2 and 5 − 2
  });
});
