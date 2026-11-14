import { describe, expect, it } from "vitest";
import { ABUTMENT_DEFAULTS, designAbutment } from "./abutment";
import { abutmentTakeoff, pileTakeoff } from "./detail";
import { abutmentInputs, pileFoundationInputs } from "./kinds";
import { designPiles, PILE_DEFAULTS } from "./piles";

// D-11-Z's foundations: the pier footing (9.5 x 7 x 3 ft cap on a ring of ten 10 in micropiles, 25 ft) and the
// integral abutment on two rows of micropiles (CDOT 26956 micropile array calc).
const mp = { holeD: 10, casingOD: 9.625, casingT: 0.545, cased: 0, bond: 25, alphaB: 6.2 / ((Math.PI * 10) / 12), phiBond: 0.55, embed: 12 };

describe("a pier footing on micropiles", () => {
  const i = pileFoundationInputs({ ...PILE_DEFAULTS, pileType: "micropile", perimeter: true, micropile: mp, nB: 4, nL: 3, sB: 2.5, sL: 2.5, edge: 1, capT: 36, colB: 108, colL: 36, colShape: "rectangular" });
  it("keeps its micropile settings through saving", () => {
    expect(i.pileType).toBe("micropile");
    expect(i.perimeter).toBe(true);
    expect(i.micropile?.holeD).toBe(10);
  });
  it("a ring of 10 under a 9.5 × 7 ft cap; each micropile by the Micropile design, the cap's own checks too", () => {
    const r = designPiles(i);
    expect(r.n).toBe(10);
    expect(r.capB).toBeCloseTo(9.5, 6);
    expect(r.capL).toBeCloseTo(7, 6);
    const ids = r.checks.map((c) => c.id);
    expect(ids).toContain("mp-bond-comp");
    expect(ids).toContain("cap-punch-col");
    expect(ids).not.toContain("geo-axial");
    // 6.2 k/ft nominal over 25 ft, φ 0.55.
    expect(r.checks.find((c) => c.id === "mp-bond-comp")!.capacity).toBeCloseTo(0.55 * 6.2 * 25, 1);
  });
  it("its quantities: 10 micropiles × 25 ft under Item 503", () => {
    const t = pileTakeoff(i);
    expect(t.quantities.micropile?.value).toBeCloseTo(250, 6);
    expect(t.quantities.pile).toBeUndefined();
  });
});

describe("an integral abutment on two rows of micropiles", () => {
  const i = abutmentInputs({ ...ABUTMENT_DEFAULTS, type: "integral-micropiles", nPiles: 12, mpRows: 2, mpRowSpacing: 5, mpBatterFront: 0, mpBatterBack: 6, groupMoment: 6125, micropile: mp, length: 47, capWidth: 8, capDepth: 3.5 });
  it("the group's forces across its two rows, the second battered, and each micropile checked", () => {
    const r = designAbutment(i);
    const bond = r.checks.find((c) => c.id === "mp-bond-comp")!;
    expect(r.integral).toBeTruthy();
    // The most loaded pile carries the group's share plus the 6125 kip·ft moment across the two rows 5 ft apart (Σy² = 150 ft²).
    expect(bond.demand).toBeGreaterThan((6125 * 2.5) / 150);
    expect(bond.capacity).toBeCloseTo(0.55 * 6.2 * 25, 1);
    expect(r.checks.some((c) => c.id === "mp-movement")).toBe(true);
    expect(r.checks.some((c) => c.id === "pile-length")).toBe(true);
  });
  it("its quantities: 24 micropiles × 25 ft", () => {
    expect(abutmentTakeoff(i).quantities.micropile?.value).toBeCloseTo(24 * 25, 6);
  });
});
