import { describe, expect, it } from "vitest";
import { plasticMoment, plates, sectionProps, type DeckSection, type SteelSegment } from "./steel-section";

// FHWA Steel Bridge Design Handbook, Design Example 2A (two 90 ft spans, four girders at 10 ft): its
// Section 1 (positive bending), exterior girder: web 42 × 7/16, top flange 14 × 3/4, bottom 16 × 1-1/4;
// an 8 in structural deck, the 2 in haunch measured to the top of the web, n = 8, f'c = 4 ksi.

const section1: SteelSegment = { length: 63, kind: "plate", D: 42, tw: 0.4375, top: { b: 14, t: 0.75 }, bottom: { b: 16, t: 1.25 } };
const deck = (beff: number, haunch: number): DeckSection => ({ beff, ts: 8, tGross: 8.5, haunch, n: 8, fc: 4, bars: [], fy: 60 });

describe("steel girder sections (Design Example 2A, Section 1)", () => {
  it("the steel alone: A = 48.88 in², I = 15,969 in⁴, centroid 26.01 in below the top", () => {
    const s = sectionProps(section1, "steel", null);
    expect(s.A).toBeCloseTo(48.875, 6); // 48.88 in the example
    expect(s.I / 15969).toBeCloseTo(1, 3);
    expect(s.depth - s.yNA).toBeCloseTo(26.01, 2);
  });

  it("Kg = n(I + A eg²) = 509,871 in⁴ with eg = 31.26 in (deck centroid 4 + 2 − 0.75 in above the top flange)", () => {
    const s = sectionProps(section1, "steel", null);
    const eg = 4 + (2 - 0.75) + (s.depth - s.yNA);
    expect(eg).toBeCloseTo(31.26, 2);
    expect((8 * (s.I + s.A * eg ** 2)) / 509871).toBeCloseTo(1, 3);
  });

  // The example states beff = 102 in, but its Ps = 2,611 kip is 0.85(4)(96)(8): its Dp and Mp follow from 96 in,
  // which reproduces them. (With 102 in, Ps = 2,774 kip and Dp = 7.05 in.)
  it("plastic moment: Ps = 2,611 kip, the axis 7.49 in into the deck, Mp = 6,418 kip·ft (the example's numbers, beff 96 in)", () => {
    const pm = plasticMoment(section1, deck(96, 2 - 0.75), true);
    expect(pm.Dp).toBeCloseTo(7.49, 2);
    expect(pm.Dt).toBeCloseTo(53.25, 6);
    expect(pm.Mp / 12 / 6418).toBeCloseTo(1, 3);
    expect(pm.Dcp).toBe(0);
    expect(plasticMoment(section1, deck(102, 2 - 0.75), true).Dp).toBeCloseTo(2444 / (0.85 * 4 * 102), 2);
  });

  it("a rolled shape: W36X150's plates and fillets give the AISC area", () => {
    const w: SteelSegment = { length: 60, kind: "rolled", shape: "W36X150", D: 0, tw: 0, top: { b: 0, t: 0 }, bottom: { b: 0, t: 0 } };
    const p = plates(w);
    expect(p.D).toBeCloseTo(35.9 - 2 * 0.94, 6);
    const s = sectionProps(w, "steel", null);
    expect(s.A).toBeCloseTo(44.3, 6);
    expect(s.I / 9040).toBeCloseTo(1, 1); // within about 5% (fillets lumped)
  });
});
