import { describe, expect, it } from "vitest";
import { shaftInputs } from "../foundations/kinds";
import { COLUMN_DEFAULTS } from "./column";
import { columnShaftConnection, type ShaftCage } from "./column-shaft";

// The column-to-shaft connection by CDOT BDM Figure 11-13 and AASHTO 5.10.8.4.2a.

const shaft = (D: number, bar: number, bars: number, tieBar = 4, pitch = 6): ShaftCage => ({ D, cover: 3, bar, bars, tieBar, pitch, fc: 4.5, fy: 60 });

describe("column on a drilled shaft (BDM Figure 11-13)", () => {
  it("F-18-Y: a 36 x 60 in column on a 48 in shaft is undersized: the shaft's bars run up into the column", () => {
    const col = { ...COLUMN_DEFAULTS, shape: "rectangular" as const, T: 60, W: 36, bar: 10, bars: 24, barsT: 8, barsL: 6, tieBar: 4, tieSpacing: 12, cover: 2 };
    const c = columnShaftConnection(col, shaft(48, 10, 30));
    expect(c.kind).toBe("undersized");
    expect(c.projecting).toBe("shaft");
    // 1.7 ℓd + S, S the farthest shaft bar from a column bar.
    expect(c.lap).toBeCloseTo(1.7 * c.ld + c.S, 6);
    expect(c.S).toBeGreaterThan(0);
  });
  it("E-16-FZA: a 42 x 66 in column on a 54 in caisson is undersized too", () => {
    const col = { ...COLUMN_DEFAULTS, shape: "rectangular" as const, T: 66, W: 42, bar: 11, bars: 28, barsT: 10, barsL: 6, tieBar: 6, tieSpacing: 6, cover: 2 };
    expect(columnShaftConnection(col, shaft(54, 11, 18)).kind).toBe("undersized");
  });
  it("a 36 in round column on a 48 in shaft is oversized: its bars run down into the shaft, 1.7 ℓd + S", () => {
    const col = { ...COLUMN_DEFAULTS, shape: "round" as const, T: 36, W: 36, bar: 9, bars: 12, tieBar: 4, tieSpacing: 4, transverse: "spiral" as const, cover: 2 };
    const c = columnShaftConnection(col, shaft(48, 9, 16));
    expect(c.kind).toBe("oversized");
    expect(c.projecting).toBe("column");
    expect(c.S).toBeGreaterThan(5);
  });
  it("cages within an inch of each other are aligned: a Class B tension lap", () => {
    const col = { ...COLUMN_DEFAULTS, shape: "round" as const, T: 48, W: 48, bar: 9, bars: 16, tieBar: 4, tieSpacing: 4, transverse: "spiral" as const, cover: 3 };
    const c = columnShaftConnection(col, shaft(48, 9, 16));
    expect(c.kind).toBe("aligned");
    expect(c.lap).toBeCloseTo(Math.max(12, 1.3 * c.ld), 6);
  });
  it("bars farther apart than the greater of lap/5 and 6 in: the splice zone's transverse spacing by Eq. 5.10.8.4.2a-1", () => {
    const col = { ...COLUMN_DEFAULTS, shape: "round" as const, T: 24, W: 24, bar: 9, bars: 10, tieBar: 4, tieSpacing: 4, transverse: "spiral" as const, cover: 2 };
    const c = columnShaftConnection(col, shaft(84, 9, 20, 5, 6));
    expect(c.S).toBeGreaterThan(c.limit);
    const t = c.transverse!;
    // 2π·A_sp·f_ytr·ℓs / (k·Aℓ·f_uℓ): #5 spiral, 60 ksi; ℓs the column bars' Class B lap; 10 #9; k 0.5; 90 ksi.
    expect(t.sMax).toBeCloseTo((2 * Math.PI * 0.31 * 60 * Math.max(12, 1.3 * c.ld)) / (0.5 * 10 * 1.0 * 90), 6);
  });
  it("a shaft design keeps its column when saved and read back (the Bridge hands it over)", () => {
    const col = { ...COLUMN_DEFAULTS, shape: "rectangular" as const, T: 60, W: 36 };
    expect(shaftInputs(JSON.parse(JSON.stringify({ D: 48, column: col }))).column).toEqual(JSON.parse(JSON.stringify(col)));
    expect(shaftInputs({}).column).toBeNull();
  });
});
