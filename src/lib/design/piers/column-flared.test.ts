import { describe, expect, it } from "vitest";
import { columnTakeoff } from "./column-detail";
import { COLUMN_DEFAULTS, designColumn, type ColumnInputs } from "./column";
import { flaredColumn, meshVolume } from "../bridge/ifc";

// A flared column (D-11-Z's piers): 3 ft thick, 6 ft wide at its base flaring to 9 ft under the cap.
const base: ColumnInputs = { ...COLUMN_DEFAULTS, shape: "rectangular", T: 72, W: 36, transverse: "ties", bar: 10, barsT: 10, barsL: 4, tieBar: 5, tieSpacing: 12, legsT: 2, legsL: 2, height: 26.6 };

describe("a flared column", () => {
  const flared = designColumn({ ...base, Ttop: 108 });
  const prismatic = designColumn(base);
  it("checks its own wider section under the cap: more resistance there than a prismatic column of its base width", () => {
    const top = (r: ReturnType<typeof designColumn>) => r.checks.find((c) => c.id === "pm-Strength I-top")!.capacity;
    const bottom = (r: ReturnType<typeof designColumn>) => r.checks.find((c) => c.id === "pm-Strength I-base")!.capacity;
    expect(top(flared)).toBeGreaterThan(top(prismatic) * 1.2);
    expect(bottom(flared)).toBeLessThan(bottom(prismatic) * 1.5);
  });
  it("its minimum steel against the largest section, under the cap", () => {
    const min = (r: ReturnType<typeof designColumn>) => r.checks.find((c) => c.id === "rho-min")!.capacity;
    expect(min(flared)).toBeCloseTo((min(prismatic) * 72) / 108, 6);
  });
  it("its concrete at the average section, and the outer bars along the flare", () => {
    const tf = columnTakeoff({ ...base, Ttop: 108 }, 1);
    const tp = columnTakeoff(base, 1);
    expect(tf.schedule.concrete[0].cy).toBeCloseTo((((72 + 108) / 2) * 36 * 26.6 * 12) / 46656, 3);
    expect(tf.schedule.concrete[0].cy).toBeGreaterThan(tp.schedule.concrete[0].cy);
  });
  it("its 3D solid: a closed tapered prism of the right volume", () => {
    const m = flaredColumn(6, 9, 3, 26.6);
    if (m.kind !== "mesh") throw new Error("mesh");
    expect(meshVolume(m.pts, m.tris)).toBeCloseTo(((6 + 9) / 2) * 3 * 26.6, 6);
  });
});
