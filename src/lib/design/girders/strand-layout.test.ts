import { describe, expect, it } from "vitest";
import { F18Y_GIRDER } from "../bridge/f18y.fixture";
import { E16FZA_GIRDER } from "../bridge/e16fza.fixture";
import { I05VA_GIRDER } from "../bridge/i05va.fixture";
import { I18BC_GIRDER } from "../bridge/i18bc.fixture";
import { F19AGA_GIRDER } from "../bridge/f19aga.fixture";
import { shapeById } from "./sections";
import { gridHalfWidth, strandLayout, strandsAt } from "./strand-layout";

const cbt = shapeById("cbt-54")!;
const xsAt = (l: ReturnType<typeof strandLayout>, y: number, kind = "straight") => l.strands.filter((s) => s.kind === kind && s.y === y).map((s) => s.x).sort((a, b) => a - b);

describe("the strand grid (CDOT B-618-CBT2, B-618-BX)", () => {
  it("CBT: 18, 18, 12, 6 across the bottom flange, then the web pair; no harped strand within 6 in of the top", () => {
    expect([2.25, 4.25, 6.25, 8.25, 10.25, 47].map((y) => gridHalfWidth(cbt, y))).toEqual([17, 17, 11, 5, 1, 1]);
    expect(gridHalfWidth(cbt, 49)).toBe(0);
  });
  it("box 28 x 50: 22 a row in the bottom slab, none in the void", () => {
    const box = shapeById("box-28x50")!;
    expect(gridHalfWidth(box, 2.25)).toBe(21);
    expect(gridHalfWidth(box, 10)).toBe(0);
  });
});

describe("F-18-Y's CBT 54 pattern on the grid", () => {
  const Lg = 111;
  const l = strandLayout(cbt, F18Y_GIRDER, Lg);
  it("the harped pairs take x = ±1 from 2.25 to 12.25 in at the harp point and 42.25–52.25 in at the ends", () => {
    const h = l.strands.filter((s) => s.kind === "harped");
    expect(h).toHaveLength(12);
    expect(new Set(h.map((s) => s.x))).toEqual(new Set([-1, 1]));
    expect(Math.min(...h.map((s) => s.y))).toBe(2.25);
    expect(Math.max(...h.map((s) => s.y))).toBe(12.25);
    expect(Math.max(...h.map((s) => s.yEnd!))).toBe(52.25);
  });
  it("the straight rows fill the rest of the grid: 16 at 2.25 and 4.25 (±3…±17), 2 at 6.25 (±3)", () => {
    expect(xsAt(l, 2.25)).toEqual([-17, -15, -13, -11, -9, -7, -5, -3, 3, 5, 7, 9, 11, 13, 15, 17]);
    expect(xsAt(l, 4.25)).toHaveLength(16);
    expect(xsAt(l, 6.25)).toEqual([-3, 3]);
    expect(l.strands.some((s) => s.offGrid)).toBe(false);
  });
  it("the two debonded strands are the bottom row's innermost (outermost bonded, 5.9.4.3.3 I)", () => {
    expect(l.strands.filter((s) => s.debondLength > 0).map((s) => [s.x, s.y])).toEqual([
      [-3, 2.25],
      [3, 2.25],
    ]);
  });
  it("flags the top harped strands above the CBT sheet's 48 in", () => {
    expect(l.notes.join(" ")).toMatch(/52\.25 in up at the ends, above the 48 in/);
  });
  it("at a cut: the harped strands' heights, the debonded ones unbonded near the end, and the centroid", () => {
    const end = strandsAt(l, 1);
    expect(end.nBonded).toBe(44);
    const mid = strandsAt(l, Lg / 2);
    expect(mid.nBonded).toBe(46);
    // 16 at 2.25, 16 at 4.25, 2 at 6.25 and the harped pairs at 2.25…12.25: the c.g. at midspan.
    const want = (16 * 2.25 + 16 * 4.25 + 2 * 6.25 + 2 * (2.25 + 4.25 + 6.25 + 8.25 + 10.25 + 12.25)) / 46;
    expect(mid.cgAll).toBeCloseTo(want, 6);
    // Half way to the harp point the harped strands are half way between.
    const half = strandsAt(l, 0.2 * Lg).strands.filter((s) => s.kind === "harped");
    expect(Math.max(...half.map((s) => s.yAt))).toBeCloseTo((52.25 + 12.25) / 2, 6);
  });
});

describe("the other test bridges fit their grids", () => {
  it("E-16-FZA's box: 16 and 4, from the walls in", () => {
    const l = strandLayout(shapeById("box-28x50")!, E16FZA_GIRDER, 66);
    expect(l.fill).toBe("sides-in");
    expect(xsAt(l, 4.25)).toEqual([-21, -19, 19, 21]);
    expect(xsAt(l, 2.25)).toHaveLength(16);
    expect(l.notes).toEqual([]);
  });
  for (const [name, g] of [
    ["I-05-VA", I05VA_GIRDER],
    ["I-18-BC", I18BC_GIRDER],
    ["F-19-AGA", F19AGA_GIRDER],
  ] as const)
    it(`${name}: every strand on the grid`, () => {
      const l = strandLayout(shapeById(g.shape)!, g, g.L + 2 * g.endDist);
      expect(l.strands.filter((s) => s.offGrid)).toEqual([]);
      expect(l.strands).toHaveLength(g.strands.reduce((t, r) => t + r.count, 0) + (g.harped?.count ?? 0));
    });
});
